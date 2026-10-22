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
const {
  createDatabase,
  SyntheticDocumentBatchStore,
} = require('./dist/index.js');
const { migrate } = require('drizzle-orm/node-postgres/migrator');
const owner = createDatabase(url);
const role = `diagnostic_http_${randomBytes(8).toString('hex')}`;
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
    `GRANT USAGE ON SCHEMA fiscal_compliance,audit_compliance,tax_intelligence TO ${role}`,
  );
  await owner.pool.query(
    `GRANT SELECT ON fiscal_compliance.synthetic_batches,fiscal_compliance.synthetic_documents,fiscal_compliance.synthetic_lines TO ${role}`,
  );
  await owner.pool.query(
    `GRANT INSERT(tenant_id,actor_id,execution_id,request_id) ON audit_compliance.synthetic_diagnostic_creations TO ${role}`,
  );
  await owner.pool.query(
    `GRANT SELECT,INSERT ON tax_intelligence.synthetic_diagnostic_runs TO ${role}`,
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
      SYNTHETIC_BATCH_DATABASE_URL: '',
      SYNTHETIC_DIAGNOSTIC_DATABASE_URL: runtimeUrl.href,
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
        reference: 'diagnostic-http-sentinel',
        declaredTotalCents: 999,
        lineAmountsCents: [100, 200],
      },
    ],
  };
  const createdBatch = await new SyntheticDocumentBatchStore(owner.pool).create(
    {
      identity: { issuer, subject },
      organizationId: orgs[0],
      input,
      idempotencyKey: randomUUID(),
      requestId: randomUUID(),
    },
  );
  assert.equal(createdBatch.status, 'created');
  const batchId = createdBatch.receipt.id;
  const path = `/organizations/${orgs[0]}/synthetic-diagnostic-executions`;
  async function call(route, method = 'GET', body, access = accessToken) {
    return fetch(`${base}${route}`, {
      method,
      headers: {
        ...(access ? { Authorization: `Bearer ${access}` } : {}),
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        'x-request-id': randomUUID(),
        'x-tenant-id': orgs[2],
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15000),
    });
  }
  assert.equal((await call(path, 'POST', { batchId }, '')).status, 401);
  assert.equal(
    (await call(path, 'POST', { batchId }, accessToken + 'invalid')).status,
    401,
  );
  const concurrent = await Promise.all([
    call(path, 'POST', { batchId }),
    call(path, 'POST', { batchId }),
  ]);
  assert.deepEqual(concurrent.map((r) => r.status).sort(), [200, 201]);
  const [receipt, replay] = await Promise.all(concurrent.map((r) => r.json()));
  assert.deepEqual(receipt, replay);
  let response = await call(`${path}/${receipt.id}`);
  assert.equal(response.status, 200);
  const detail = await response.json();
  assert.equal(detail.diagnostic.documents[0].computedTotalCents, 300);
  assert.equal(detail.diagnostic.documents[0].differenceCents, 699);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  response = await call(
    `/organizations/${orgs[1]}/synthetic-diagnostic-executions/${receipt.id}`,
  );
  assert.equal(response.status, 404);
  assert.equal(
    (
      await call(
        `/organizations/${orgs[1]}/synthetic-diagnostic-executions`,
        'POST',
        { batchId },
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await call(
        `/organizations/${orgs[2]}/synthetic-diagnostic-executions/${receipt.id}`,
      )
    ).status,
    403,
  );
  assert.equal(
    (await call(path, 'POST', { batchId: randomUUID() })).status,
    404,
  );
  assert.equal(
    (
      await call(
        `${path}/${receipt.id}`,
        'GET',
        undefined,
        token('unprovisioned'),
      )
    ).status,
    403,
  );
  const event = await owner.pool.query(
    'SELECT count(*)::integer AS count FROM audit_compliance.synthetic_diagnostic_creations WHERE tenant_id=$1',
    [orgs[0]],
  );
  assert.equal(event.rows[0].count, 1);
  for (const roleName of ['viewer', 'reviewer']) {
    await owner.pool.query(
      'UPDATE organization_access.memberships SET role=$3 WHERE organization_id=$1 AND actor_id=$2',
      [orgs[0], actor, roleName],
    );
    assert.equal((await call(`${path}/${receipt.id}`)).status, 200);
    assert.equal((await call(path, 'POST', { batchId })).status, 403);
  }
  await owner.pool.query(
    'UPDATE organization_access.memberships SET role=$3 WHERE organization_id=$1 AND actor_id=$2',
    [orgs[0], actor, 'analyst'],
  );
  await owner.pool.query(
    `GRANT DELETE ON tax_intelligence.synthetic_diagnostic_runs TO ${role}`,
  );
  response = await call(path, 'POST', { batchId });
  assert.equal(response.status, 503);
  const error = await response.text();
  assert.ok(!error.includes(role) && !error.includes(password));
  await owner.pool.query(
    `REVOKE DELETE ON tax_intelligence.synthetic_diagnostic_runs FROM ${role}`,
  );
  assert.equal((await call(path, 'POST', { batchId })).status, 200);
  await owner.pool.query(
    'UPDATE organization_access.memberships SET revoked_at=clock_timestamp() WHERE organization_id=$1 AND actor_id=$2',
    [orgs[0], actor],
  );
  assert.equal((await call(path, 'POST', { batchId })).status, 403);
  assert.equal((await call(`${path}/${receipt.id}`)).status, 403);
  assert.ok(
    !logs.includes(accessToken) &&
      !logs.includes(password) &&
      !logs.includes(subject) &&
      !logs.includes(input.documents[0].reference),
  );
  console.log(
    'Synthetic diagnostic HTTP integration passed: compiled API/RSA, restricted PostgreSQL, concurrent natural replay, exact evidence, tenant/role denial, unsafe grants and revocation.',
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
      'audit_compliance.synthetic_diagnostic_creations',
      'tax_intelligence.synthetic_diagnostic_runs',
      'fiscal_compliance.synthetic_lines',
      'fiscal_compliance.synthetic_documents',
      'audit_compliance.synthetic_batch_creations',
      'fiscal_compliance.synthetic_batches',
    ])
      await owner.pool.query(
        `DELETE FROM ${table} WHERE tenant_id=ANY($1::uuid[])`,
        [orgs],
      );
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
      await owner.pool.query(`DROP OWNED BY ${role}`);
      await owner.pool.query(`DROP ROLE ${role}`);
    }
  } finally {
    await owner.pool.end();
  }
}
