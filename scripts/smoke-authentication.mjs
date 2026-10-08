import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';

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
          kid: 'smoke',
          alg: 'RS256',
          use: 'sig',
        },
      ],
    }),
  );
});
await new Promise((resolve) => provider.listen(0, '127.0.0.1', resolve));
const issuer = `http://127.0.0.1:${provider.address().port}/realms/synthetic`;
const reservation = createServer();
await new Promise((resolve) => reservation.listen(0, '127.0.0.1', resolve));
const port = reservation.address().port;
await new Promise((resolve) => reservation.close(resolve));
const now = Math.floor(Date.now() / 1000);
const header = Buffer.from(
  JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: 'smoke' }),
).toString('base64url');
const payload = Buffer.from(
  JSON.stringify({
    iss: issuer,
    aud: 'tax-intelligence-api',
    sub: 'synthetic-smoke-subject',
    azp: 'tax-intelligence-web',
    typ: 'Bearer',
    iat: now,
    exp: now + 300,
    email: 'synthetic-smoke-email',
  }),
).toString('base64url');
const content = `${header}.${payload}`;
const token = `${content}.${sign('RSA-SHA256', Buffer.from(content), privateKey).toString('base64url')}`;
const app = spawn(process.execPath, ['apps/api/dist/main.js'], {
  env: {
    ...process.env,
    NODE_ENV: 'test',
    PORT: String(port),
    DATABASE_URL: '',
    CORS_ORIGIN: 'http://127.0.0.1:3000',
    OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: '',
    OIDC_ISSUER: issuer,
    OIDC_JWKS_URL: `${issuer}/certs`,
    OIDC_AUDIENCE: 'tax-intelligence-api',
    OIDC_CLIENT_ID: 'tax-intelligence-web',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let logs = '';
app.stdout.on('data', (chunk) => {
  logs += chunk;
});
app.stderr.on('data', (chunk) => {
  logs += chunk;
});
try {
  const base = `http://127.0.0.1:${port}`;
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (app.exitCode !== null)
      throw new Error('API exited before authentication smoke');
    try {
      if (
        (
          await fetch(`${base}/v1/health/live`, {
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
  assert.ok(ready);
  const rejected = await fetch(`${base}/v1/auth/me`, {
    signal: AbortSignal.timeout(3000),
  });
  assert.equal(rejected.status, 401);
  assert.equal(rejected.headers.get('www-authenticate'), 'Bearer');
  const verified = await fetch(`${base}/v1/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(3000),
  });
  assert.equal(verified.status, 200);
  assert.deepEqual(await verified.json(), {
    issuer,
    subject: 'synthetic-smoke-subject',
  });
  assert.equal(verified.headers.get('cache-control'), 'no-store');
  assert.ok(!logs.includes(token));
  assert.doesNotMatch(logs, /synthetic-smoke-subject|synthetic-smoke-email/);
  console.log(
    'Authentication smoke passed: built API verified an ephemeral RSA token; unauthenticated access rejected; sensitive logs absent.',
  );
} finally {
  app.kill();
  await new Promise((resolve) => provider.close(resolve));
}
