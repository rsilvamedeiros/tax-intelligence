import assert from 'node:assert/strict';
import {
  generateKeyPairSync,
  randomBytes,
  randomUUID,
  sign,
} from 'node:crypto';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';

const url = process.env.TEST_DATABASE_URL;
assert.ok(
  url && new URL(url).pathname.endsWith('_test'),
  'Isolated TEST_DATABASE_URL ending in _test required',
);
const require = createRequire(
  new URL('../packages/database/package.json', import.meta.url),
);
const { createDatabase } = require('./dist/index.js');
const { migrate } = require('drizzle-orm/node-postgres/migrator');
const owner = createDatabase(url);
const role = `batch_http_${randomBytes(8).toString('hex')}`;
const password = randomBytes(32).toString('hex');
const actor = randomUUID();
const otherActor = randomUUID();
const orgs = [randomUUID(), randomUUID(), randomUUID()].sort();
const subject = `synthetic-${randomUUID()}`;
const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
});
const provider = createServer((_request, response) => {
  response.writeHead(200, { 'content-type': 'application/json' });
  response.end(
    JSON.stringify({
      keys: [
        {
          ...publicKey.export({ format: 'jwk' }),
          kid: 'membership',
          alg: 'RS256',
          use: 'sig',
        },
      ],
    }),
  );
});
let app;
let roleCreated = false;
let logs = '';
try {
  await new Promise((resolve) => provider.listen(0, '127.0.0.1', resolve));
  const issuer = `http://127.0.0.1:${provider.address().port}/realms/synthetic`;
  await migrate(owner.db, {
    migrationsFolder: fileURLToPath(
      new URL('../packages/database/migrations', import.meta.url),
    ),
  });
  await owner.pool.query(
    `CREATE ROLE ${role} LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS PASSWORD '${password}'`,
  );
  roleCreated = true;
  await owner.pool.query(
    `GRANT USAGE ON SCHEMA identity_access, organization_access TO ${role}`,
  );
  await owner.pool.query(
    `GRANT SELECT ON identity_access.actors, organization_access.memberships TO ${role}`,
  );
  await owner.pool.query(
    'INSERT INTO identity_access.actors(id,issuer,subject) VALUES($1,$2,$3),($4,$5,$3)',
    [actor, issuer, subject, otherActor, `${issuer}/other`],
  );
  for (const [index, id] of orgs.entries()) {
    await owner.pool.query(
      'INSERT INTO organization_access.organizations(id,name) VALUES($1,$2)',
      [id, `Synthetic ${index}`],
    );
    await owner.pool.query(
      'INSERT INTO organization_access.memberships(organization_id,actor_id,role) VALUES($1,$2,$3)',
      [id, index === 2 ? otherActor : actor, 'analyst'],
    );
  }
  await owner.pool.query(
    `GRANT USAGE ON SCHEMA fiscal_compliance,audit_compliance TO ${role}`,
  );
  await owner.pool.query(
    `GRANT SELECT,INSERT ON fiscal_compliance.synthetic_batches,fiscal_compliance.synthetic_documents,fiscal_compliance.synthetic_lines TO ${role}`,
  );
  await owner.pool.query(
    `GRANT INSERT(tenant_id,actor_id,batch_id,request_id) ON audit_compliance.synthetic_batch_creations TO ${role}`,
  );
  const runtimeUrl = new URL(url);
  runtimeUrl.username = role;
  runtimeUrl.password = password;
  const reservation = createServer();
  await new Promise((resolve) => reservation.listen(0, '127.0.0.1', resolve));
  const port = reservation.address().port;
  await new Promise((resolve) => reservation.close(resolve));
  app = spawn(process.execPath, ['apps/api/dist/main.js'], {
    env: {
      ...process.env,
      NODE_ENV: 'test',
      PORT: String(port),
      DATABASE_URL: '',
      BFF_DATABASE_URL: '',
      SYNTHETIC_BATCH_DATABASE_URL: runtimeUrl.href,
      CORS_ORIGIN: 'http://127.0.0.1:3000',
      OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: '',
      OIDC_ISSUER: issuer,
      OIDC_JWKS_URL: `${issuer}/certs`,
      OIDC_AUDIENCE: 'tax-intelligence-api',
      OIDC_CLIENT_ID: 'tax-intelligence-web',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  app.stdout.on('data', (chunk) => {
    logs += chunk;
  });
  app.stderr.on('data', (chunk) => {
    logs += chunk;
  });
  const base = `http://127.0.0.1:${port}/v1`;
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    assert.equal(app.exitCode, null, 'Compiled API exited during startup');
    try {
      if (
        (
          await fetch(`${base}/health/live`, {
            signal: AbortSignal.timeout(1000),
          })
        ).ok
      ) {
        ready = true;
        break;
      }
    } catch {
      /* bounded startup polling */
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.ok(ready, 'Compiled API startup timeout');
  function token(forSubject = subject) {
    const now = Math.floor(Date.now() / 1000);
    const header = Buffer.from(
      JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: 'membership' }),
    ).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({
        iss: issuer,
        aud: 'tax-intelligence-api',
        sub: forSubject,
        azp: 'tax-intelligence-web',
        typ: 'Bearer',
        iat: now,
        exp: now + 300,
        realm_access: { roles: ['organization_admin'] },
      }),
    ).toString('base64url');
    const content = `${header}.${payload}`;
    return `${content}.${sign('RSA-SHA256', Buffer.from(content), privateKey).toString('base64url')}`;
  }
  const accessToken = token();
  const input = {
    schemaVersion: 'synthetic-document-batch-v1',
    documents: [
      {
        reference: 'compiled-sample',
        declaredTotalCents: 999,
        lineAmountsCents: [100],
      },
    ],
  };
  const path = `/organizations/${orgs[0]}/synthetic-document-batches`;
  const key = randomUUID();
  async function call(
    route,
    method = 'GET',
    body,
    bearer = accessToken,
    idempotencyKey = key,
  ) {
    const response = await fetch(`${base}${route}`, {
      method,
      headers: {
        'content-type': 'application/json',
        'Idempotency-Key': idempotencyKey,
        ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
        'x-tenant-id': orgs[2],
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(8000),
    });
    assert.equal(response.headers.get('cache-control'), 'no-store');
    return {
      status: response.status,
      body: await response.json(),
      requestId: response.headers.get('x-request-id'),
    };
  }
  assert.equal((await call(path, 'POST', input, '')).status, 401);
  assert.equal(
    (await call(path, 'POST', input, token('unprovisioned'))).status,
    403,
  );
  assert.equal(
    (
      await call(
        `/organizations/${orgs[2]}/synthetic-document-batches`,
        'POST',
        input,
      )
    ).status,
    403,
  );
  const first = await call(path, 'POST', input);
  assert.equal(first.status, 201);
  assert.deepEqual(Object.keys(first.body).sort(), [
    'createdAt',
    'id',
    'schemaVersion',
  ]);
  assert.equal((await call(`${path}/${first.body.id}`)).status, 200);
  assert.deepEqual(
    (await call(`${path}/${first.body.id}`)).body.documents,
    input.documents,
  );
  const replay = await call(
    path,
    'POST',
    input,
    accessToken,
    key.toUpperCase(),
  );
  assert.equal(replay.status, 200);
  assert.deepEqual(replay.body, first.body);
  assert.equal(
    (
      await call(path, 'POST', {
        ...input,
        documents: [{ ...input.documents[0], declaredTotalCents: 1 }],
      })
    ).status,
    409,
  );
  const otherPath = `/organizations/${orgs[1]}/synthetic-document-batches`;
  assert.equal((await call(`${otherPath}/${first.body.id}`)).status, 404);
  assert.equal((await call(`${otherPath}/${randomUUID()}`)).status, 404);
  // The token advertises administrator; persisted viewer status must still deny POST.
  await owner.pool.query(
    'UPDATE organization_access.memberships SET role=$1 WHERE organization_id=$2 AND actor_id=$3',
    ['viewer', orgs[0], actor],
  );
  assert.equal((await call(path, 'POST', input)).status, 403);
  assert.equal((await call(`${path}/${first.body.id}`)).status, 200);
  await owner.pool.query(
    'UPDATE organization_access.memberships SET revoked_at=now() WHERE organization_id=$1 AND actor_id=$2',
    [orgs[0], actor],
  );
  assert.equal((await call(`${path}/${first.body.id}`)).status, 403);
  const count = await owner.pool.query(
    'SELECT count(*)::integer AS count FROM audit_compliance.synthetic_batch_creations WHERE tenant_id=$1',
    [orgs[0]],
  );
  assert.equal(count.rows[0].count, 1);
  // Each excessive grant must fail closed before business access and recover after revoke.
  for (const privilege of [
    'SELECT ON audit_compliance.synthetic_batch_creations',
    'SELECT(actor_id) ON audit_compliance.synthetic_batch_creations',
    'UPDATE ON organization_access.memberships',
    'UPDATE ON fiscal_compliance.synthetic_batches',
    'CREATE ON SCHEMA fiscal_compliance',
    'USAGE ON SCHEMA auth_bff',
  ]) {
    await owner.pool.query(`GRANT ${privilege} TO ${role}`);
    try {
      const unsafe = await call(`${otherPath}/${first.body.id}`);
      assert.equal(
        unsafe.status,
        503,
        `Unsafe grant was accepted: ${privilege}`,
      );
      assert.doesNotMatch(
        JSON.stringify(unsafe.body),
        /SELECT|batch_http_|postgresql|password/i,
      );
    } finally {
      await owner.pool.query(`REVOKE ${privilege} FROM ${role}`);
    }
    assert.equal((await call(`${otherPath}/${first.body.id}`)).status, 404);
  }
  // Hold the audit relation so a real transaction times out and rolls back its aggregate.
  const blocker = await owner.pool.connect();
  try {
    await blocker.query('BEGIN');
    await blocker.query(
      'LOCK TABLE audit_compliance.synthetic_batch_creations IN ACCESS EXCLUSIVE MODE',
    );
    const unavailable = await call(
      otherPath,
      'POST',
      input,
      accessToken,
      randomUUID(),
    );
    assert.equal(unavailable.status, 503);
    assert.equal(unavailable.body.requestId, unavailable.requestId);
  } finally {
    await blocker.query('ROLLBACK');
    blocker.release();
  }
  const rolledBack = await owner.pool.query(
    'SELECT count(*)::integer AS count FROM fiscal_compliance.synthetic_batches WHERE tenant_id=$1',
    [orgs[1]],
  );
  assert.equal(rolledBack.rows[0].count, 0);
  assert.equal(
    (await call(otherPath, 'POST', input, accessToken, randomUUID())).status,
    201,
  );
  assert.ok(
    !logs.includes(accessToken) &&
      !logs.includes(password) &&
      !logs.includes(subject) &&
      !logs.includes(key),
  );
  console.log(
    'Synthetic batch integration passed: compiled API/RSA, dedicated restricted PostgreSQL, create/replay/conflict, tenant isolation, persisted roles, revocation, atomic audit count and unsafe-grant rejection.',
  );
} finally {
  if (app && app.exitCode === null) {
    const exited = once(app, 'exit');
    app.kill();
    const timeout = setTimeout(() => app.kill('SIGKILL'), 5000);
    try {
      await exited;
    } finally {
      clearTimeout(timeout);
    }
  }
  await new Promise((resolve) => provider.close(resolve));
  try {
    for (const table of [
      'fiscal_compliance.synthetic_lines',
      'fiscal_compliance.synthetic_documents',
      'audit_compliance.synthetic_batch_creations',
      'fiscal_compliance.synthetic_batches',
    ]) {
      await owner.pool.query(
        `DELETE FROM ${table} WHERE tenant_id=ANY($1::uuid[])`,
        [orgs],
      );
    }
    await owner.pool.query(
      'DELETE FROM organization_access.memberships WHERE organization_id=ANY($1::uuid[])',
      [orgs],
    );
    await owner.pool.query(
      'DELETE FROM organization_access.organizations WHERE id=ANY($1::uuid[])',
      [orgs],
    );
    await owner.pool.query(
      'DELETE FROM identity_access.actors WHERE id=ANY($1::uuid[])',
      [[actor, otherActor]],
    );
    if (roleCreated) {
      await owner.pool.query(
        `REVOKE ALL ON ALL TABLES IN SCHEMA identity_access,organization_access,fiscal_compliance,audit_compliance FROM ${role}`,
      );
      await owner.pool.query(
        `REVOKE ALL(tenant_id,actor_id,batch_id,request_id) ON audit_compliance.synthetic_batch_creations FROM ${role}`,
      );
      await owner.pool.query(
        `REVOKE ALL ON SCHEMA identity_access,organization_access,fiscal_compliance,audit_compliance FROM ${role}`,
      );
      await owner.pool.query(`DROP ROLE ${role}`);
    }
  } finally {
    await owner.pool.end();
  }
}
