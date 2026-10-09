import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createBrowserMembershipFixture } from './browser-membership-fixtures.mjs';

const provider = 'http://127.0.0.1:8080';
const realm = 'tax-intelligence';
const issuer = `${provider}/realms/${realm}`;
const database = process.env.TEST_DATABASE_URL;
assert.ok(
  database && new URL(database).pathname.endsWith('_test'),
  'An isolated TEST_DATABASE_URL ending in _test is required',
);
assert.ok(
  process.env.KEYCLOAK_ADMIN_PASSWORD,
  'Local Keycloak administrator configuration is required',
);
const webRequire = createRequire(
  new URL('../apps/web/package.json', import.meta.url),
);
let userId;
let adminToken;
let api;
let web;
let membership;
async function admin(path, options = {}) {
  const response = await fetch(`${provider}/admin/realms/${realm}/${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${adminToken}`,
      'Content-Type': 'application/json',
    },
    redirect: 'error',
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok)
    throw new Error(`Synthetic user operation failed: ${response.status}`);
  return response;
}
async function waitFor(url) {
  for (let i = 0; i < 90; i++) {
    if (api?.exitCode !== null || web?.exitCode !== null)
      throw new Error('Authentication applications exited during startup');
    try {
      if ((await fetch(url, { signal: AbortSignal.timeout(1000) })).ok) return;
    } catch {
      /* bounded startup polling */
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('Authentication application startup timeout');
}
async function authorizeAdmin() {
  const response = await fetch(
    `${provider}/realms/master/protocol/openid-connect/token`,
    {
      method: 'POST',
      body: new URLSearchParams({
        client_id: 'admin-cli',
        grant_type: 'password',
        username: 'local_admin',
        password: process.env.KEYCLOAK_ADMIN_PASSWORD,
      }),
      redirect: 'error',
      signal: AbortSignal.timeout(5000),
    },
  );
  if (!response.ok)
    throw new Error('Local administrator authentication failed');
  adminToken = (await response.json()).access_token;
}
try {
  await authorizeAdmin();
  const username = `synthetic-${randomBytes(8).toString('hex')}`;
  const password = randomBytes(32).toString('base64url');
  const created = await admin('users', {
    method: 'POST',
    body: JSON.stringify({
      username,
      enabled: true,
      firstName: 'Synthetic',
      lastName: 'Analyst',
      email: `${username}@example.invalid`,
      requiredActions: [],
    }),
  });
  userId = new URL(created.headers.get('location')).pathname.split('/').at(-1);
  assert.match(userId, /^[0-9a-f-]{36}$/i);
  await admin(`users/${userId}/reset-password`, {
    method: 'PUT',
    body: JSON.stringify({
      type: 'password',
      value: password,
      temporary: false,
    }),
  });
  membership = await createBrowserMembershipFixture(issuer, userId);
  const env = {
    ...process.env,
    NODE_ENV: 'test',
    API_BASE_URL: 'http://127.0.0.1:3001',
    CORS_ORIGIN: 'http://127.0.0.1:3000',
    OIDC_ISSUER: issuer,
    OIDC_JWKS_URL: `${issuer}/protocol/openid-connect/certs`,
    OIDC_AUDIENCE: 'tax-intelligence-api',
    OIDC_CLIENT_ID: 'tax-intelligence-web',
    OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: '',
  };
  api = spawn(process.execPath, ['apps/api/dist/main.js'], {
    env: { ...env, PORT: '3001', DATABASE_URL: membership.apiUrl },
    stdio: 'ignore',
  });
  web = spawn(
    process.execPath,
    [
      webRequire.resolve('next/dist/bin/next'),
      'start',
      '--hostname',
      '127.0.0.1',
    ],
    {
      cwd: new URL('../apps/web/', import.meta.url),
      env: {
        ...env,
        BFF_APP_ORIGIN: 'http://127.0.0.1:3000',
        BFF_DATABASE_URL: membership.bffUrl,
        BFF_SESSION_ENCRYPTION_KEY: randomBytes(32).toString('hex'),
      },
      stdio: 'ignore',
    },
  );
  await Promise.all([
    waitFor('http://127.0.0.1:3001/v1/health/live'),
    waitFor('http://127.0.0.1:3000'),
  ]);
  const initial = await fetch('http://127.0.0.1:3000/api/auth/session', {
    signal: AbortSignal.timeout(3000),
  });
  assert.equal(
    initial.status,
    401,
    'Configured BFF must reject an absent session with 401',
  );
  delete process.env.ELECTRON_RUN_AS_NODE;
  const result = await webRequire('cypress').run({
    project: fileURLToPath(new URL('../apps/web/', import.meta.url)),
    browser: process.env.E2E_BROWSER ?? 'chrome',
    headless: true,
    spec: fileURLToPath(
      new URL('../apps/web/cypress/e2e/authentication.cy.ts', import.meta.url),
    ),
    env: {
      authUser: username,
      authPassword: password,
      organizationIds: membership.ids,
      actorIds: membership.actors,
    },
  });
  process.exitCode = 'failures' in result || result.totalFailed > 0 ? 1 : 0;
} catch {
  console.error(
    'Authentication E2E failed; credentials and application request logs are suppressed.',
  );
  process.exitCode = 1;
} finally {
  api?.kill();
  web?.kill();
  try {
    await membership?.cleanup();
  } catch {
    console.error('Synthetic membership cleanup failed.');
    process.exitCode = 1;
  }
  if (userId && adminToken) {
    try {
      await authorizeAdmin();
      await admin(`users/${userId}`, { method: 'DELETE' });
    } catch {
      console.error('Synthetic identity cleanup failed.');
      process.exitCode = 1;
    }
  }
}
