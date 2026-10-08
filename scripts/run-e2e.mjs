import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const webRequire = createRequire(
  new URL('../apps/web/package.json', import.meta.url),
);
const api = spawn(process.execPath, ['apps/api/dist/main.js'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    NODE_ENV: 'test',
    PORT: '3001',
    CORS_ORIGIN: 'http://127.0.0.1:3000',
    DATABASE_URL: process.env.TEST_DATABASE_URL ?? '',
    OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: '',
  },
});
const web = spawn(
  process.execPath,
  [
    webRequire.resolve('next/dist/bin/next'),
    'start',
    '--hostname',
    '127.0.0.1',
  ],
  {
    cwd: new URL('../apps/web/', import.meta.url),
    stdio: 'inherit',
    env: { ...process.env, API_BASE_URL: 'http://127.0.0.1:3001' },
  },
);
async function waitFor(url) {
  for (let i = 0; i < 60; i++) {
    if (api.exitCode !== null || web.exitCode !== null)
      throw new Error('Application exited during E2E startup');
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(1000) });
      if (r.ok) return;
    } catch {
      /* bounded startup polling */
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('E2E startup timeout');
}
function stop() {
  api.kill();
  web.kill();
}
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
try {
  await Promise.all([
    waitFor('http://127.0.0.1:3001/v1/health/live'),
    waitFor('http://127.0.0.1:3000'),
  ]);
  const cypress = webRequire('cypress');
  // Electron-based editors may set this; the Cypress browser needs normal Electron mode.
  delete process.env.ELECTRON_RUN_AS_NODE;
  const result = await cypress.run({
    project: fileURLToPath(new URL('../apps/web/', import.meta.url)),
    browser: process.env.E2E_BROWSER ?? 'chrome',
    headless: true,
    spec: fileURLToPath(
      new URL('../apps/web/cypress/e2e/foundation.cy.ts', import.meta.url),
    ),
  });
  process.exitCode = 'failures' in result || result.totalFailed > 0 ? 1 : 0;
} catch (error) {
  console.error(error instanceof Error ? error.message : 'E2E failed');
  process.exitCode = 1;
} finally {
  stop();
}
