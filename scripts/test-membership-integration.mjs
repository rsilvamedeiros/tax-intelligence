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
const role = `membership_http_${randomBytes(8).toString('hex')}`;
const password = randomBytes(32).toString('hex');
const actor = randomUUID();
const otherActor = randomUUID();
const targetActor = randomUUID();
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
    `GRANT SELECT ON identity_access.actors, organization_access.organizations, organization_access.memberships TO ${role}`,
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
      [id, index === 2 ? otherActor : actor, 'viewer'],
    );
  }
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
      DATABASE_URL: runtimeUrl.href,
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
  async function get(path, bearer = accessToken, headers = {}) {
    const response = await fetch(`${base}${path}`, {
      headers: {
        ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
        ...headers,
      },
      signal: AbortSignal.timeout(5000),
    });
    assert.equal(response.headers.get('cache-control'), 'no-store');
    return {
      status: response.status,
      body: await response.json(),
      headers: response.headers,
    };
  }
  const anonymous = await get('/organizations?limit=invalid', '');
  assert.equal(anonymous.status, 401);
  assert.equal(anonymous.headers.get('www-authenticate'), 'Bearer');
  const first = await get('/organizations?limit=1');
  assert.equal(first.status, 200);
  assert.deepEqual(first.body, {
    items: [{ id: orgs[0], name: 'Synthetic 0', role: 'viewer' }],
    nextCursor: orgs[0],
  });
  const second = await get(
    `/organizations?limit=1&cursor=${first.body.nextCursor}`,
  );
  assert.deepEqual(second.body, {
    items: [{ id: orgs[1], name: 'Synthetic 1', role: 'viewer' }],
    nextCursor: null,
  });
  const context = await get(`/organizations/${orgs[0]}/context`);
  assert.equal(context.status, 200);
  assert.deepEqual(context.body, {
    organization: { id: orgs[0], name: 'Synthetic 0' },
    role: 'viewer',
  });
  const crossed = await get(`/organizations/${orgs[2]}/context`, accessToken, {
    'x-tenant-id': orgs[2],
  });
  const unknown = await get(`/organizations/${randomUUID()}/context`);
  assert.equal(crossed.status, 403);
  assert.equal(unknown.status, 403);
  assert.equal(crossed.body.message, unknown.body.message);
  assert.equal((await get('/organizations?limit=101')).status, 400);
  assert.equal((await get('/organizations?actorId=other')).status, 400);
  const unprovisioned = token('synthetic-unprovisioned');
  assert.deepEqual((await get('/organizations', unprovisioned)).body, {
    items: [],
    nextCursor: null,
  });
  assert.equal(
    (await get(`/organizations/${orgs[0]}/context`, unprovisioned)).status,
    403,
  );
  const created = await owner.pool.query(
    'SELECT count(*)::integer AS count FROM identity_access.actors WHERE issuer=$1',
    [issuer],
  );
  assert.equal(created.rows[0].count, 1);
  await owner.pool.query(
    'UPDATE organization_access.memberships SET revoked_at=now() WHERE actor_id=$1 AND organization_id=$2',
    [actor, orgs[0]],
  );
  assert.equal((await get(`/organizations/${orgs[0]}/context`)).status, 403);
  assert.deepEqual(
    (await get('/organizations')).body.items.map((row) => row.id),
    [orgs[1]],
  );
  // The read-only runtime is upgraded only with the revocation privileges.
  await owner.pool.query(
    `GRANT UPDATE(revoked_at) ON organization_access.memberships TO ${role}`,
  );
  await owner.pool.query(
    `GRANT INSERT ON organization_access.membership_revocations TO ${role}`,
  );
  async function revoke(
    organizationId,
    targetId,
    bearer = accessToken,
    requestId = randomUUID(),
  ) {
    const response = await fetch(
      `${base}/organizations/${organizationId}/memberships/${targetId}`,
      {
        method: 'DELETE',
        headers: {
          ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
          'x-request-id': requestId,
        },
        signal: AbortSignal.timeout(5000),
      },
    );
    assert.equal(response.headers.get('cache-control'), 'no-store');
    return { status: response.status, text: await response.text() };
  }
  assert.equal((await revoke('bad', 'bad', '')).status, 401);
  assert.equal(
    (await revoke(orgs[1], otherActor)).status,
    403,
    'JWT admin role must not authorize a viewer',
  );
  await owner.pool.query(
    'UPDATE organization_access.memberships SET role=$1 WHERE organization_id=$2 AND actor_id=$3',
    ['organization_admin', orgs[1], actor],
  );
  await owner.pool.query(
    'INSERT INTO identity_access.actors VALUES($1,$2,$3)',
    [targetActor, issuer, 'synthetic-target'],
  );
  await owner.pool.query(
    'INSERT INTO organization_access.memberships VALUES($1,$2,$3,NULL)',
    [orgs[1], targetActor, 'viewer'],
  );
  const targetToken = token('synthetic-target');
  assert.equal(
    (await get(`/organizations/${orgs[1]}/context`, targetToken)).status,
    200,
  );
  assert.equal((await revoke(orgs[2], otherActor)).status, 403);
  assert.equal((await revoke(randomUUID(), otherActor)).status, 403);
  const correlation = randomUUID();
  const revoked = await revoke(orgs[1], targetActor, accessToken, correlation);
  assert.deepEqual(revoked, { status: 204, text: '' });
  assert.equal(
    (await get(`/organizations/${orgs[1]}/context`, targetToken)).status,
    403,
    'Valid token must not preserve revoked access',
  );
  assert.equal((await revoke(orgs[1], targetActor)).status, 204);
  assert.equal((await revoke(orgs[1], randomUUID())).status, 204);
  assert.equal((await revoke(orgs[1], actor)).status, 409);
  const events = await owner.pool.query(
    'SELECT initiating_actor_id,target_actor_id,request_id FROM organization_access.membership_revocations WHERE organization_id=$1',
    [orgs[1]],
  );
  assert.deepEqual(events.rows, [
    {
      initiating_actor_id: actor,
      target_actor_id: targetActor,
      request_id: correlation,
    },
  ]);
  await owner.pool.query(
    'UPDATE organization_access.memberships SET revoked_at=NULL WHERE organization_id=$1 AND actor_id=$2',
    [orgs[1], targetActor],
  );
  await owner.pool.query(
    `REVOKE INSERT ON organization_access.membership_revocations FROM ${role}`,
  );
  const auditFailure = await revoke(orgs[1], targetActor);
  assert.equal(auditFailure.status, 503);
  assert.doesNotMatch(
    auditFailure.text,
    /INSERT|membership_http_|postgresql|password/i,
  );
  assert.equal(
    (await get(`/organizations/${orgs[1]}/context`, targetToken)).status,
    200,
    'Audit failure must roll back revocation',
  );
  await owner.pool.query(
    `REVOKE SELECT ON organization_access.memberships FROM ${role}`,
  );
  const unavailable = await get('/organizations');
  assert.equal(unavailable.status, 503);
  assert.doesNotMatch(
    JSON.stringify(unavailable.body),
    /SELECT|membership_http_|postgresql|password/i,
  );
  assert.ok(
    !logs.includes(accessToken) &&
      !logs.includes(subject) &&
      !logs.includes(password) &&
      !logs.includes(targetToken) &&
      !logs.includes(targetActor),
  );
  assert.ok(!logs.includes(orgs[0]) && !logs.includes(orgs[2]));
  console.log(
    'Membership integration passed: compiled API/RSA, restricted PostgreSQL, directory, administrative revocation, idempotency, last administrator protection, atomic audit rollback and sanitized errors.',
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
    await owner.pool.query(
      'DELETE FROM organization_access.membership_revocations WHERE organization_id=ANY($1::uuid[])',
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
      [[actor, otherActor, targetActor]],
    );
    if (roleCreated) {
      await owner.pool.query(`DROP OWNED BY ${role}`);
      await owner.pool.query(`DROP ROLE ${role}`);
    }
  } finally {
    await owner.pool.end();
  }
}
