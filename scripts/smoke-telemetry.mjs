import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
const exported = [];
const collector = createServer((request, response) => {
  const chunks = [];
  request.on('data', (chunk) => chunks.push(chunk));
  request.on('end', () => {
    exported.push(Buffer.concat(chunks).toString('utf8'));
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end('{}');
  });
});
await new Promise((resolve) => collector.listen(0, '127.0.0.1', resolve));
const collectorPort = collector.address().port;
const reservation = createServer();
await new Promise((resolve) => reservation.listen(0, '127.0.0.1', resolve));
const apiPort = reservation.address().port;
await new Promise((resolve) => reservation.close(resolve));
const app = spawn(process.execPath, ['apps/api/dist/main.js'], {
  env: {
    ...process.env,
    NODE_ENV: 'test',
    DATABASE_URL: '',
    CORS_ORIGIN: 'http://127.0.0.1:3000',
    PORT: String(apiPort),
    OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: `http://127.0.0.1:${collectorPort}/v1/traces`,
    OTEL_BSP_SCHEDULE_DELAY: '100',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let logs = '';
app.stdout.on('data', (chunk) => {
  logs += chunk;
});
app.stderr.on('data', () => {});
try {
  const base = `http://127.0.0.1:${apiPort}`;
  let ready = false;
  for (let i = 0; i < 100; i++) {
    if (app.exitCode !== null)
      throw new Error('API exited before telemetry smoke test');
    try {
      const response = await fetch(`${base}/v1/health/live`, {
        signal: AbortSignal.timeout(1000),
      });
      if (response.ok) {
        ready = true;
        break;
      }
    } catch {
      /* bounded startup polling */
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.ok(ready);
  await fetch(`${base}/unknown/synthetic-sensitive?token=synthetic-token`, {
    headers: { Authorization: 'Bearer synthetic-bearer' },
  });
  for (
    let i = 0;
    i < 100 && !exported.some((body) => body.includes('unmatched'));
    i++
  )
    await new Promise((resolve) => setTimeout(resolve, 100));
  assert.ok(
    exported.some((body) => body.includes('http.request')),
    'OTLP span was not exported',
  );
  assert.ok(
    exported.some((body) => body.includes('/v1/health/live')),
    'Resolved route was not exported',
  );
  assert.ok(
    exported.some((body) => body.includes('unmatched')),
    'Sensitive-sentinel request span was not exported',
  );
  assert.doesNotMatch(
    exported.join('') + logs,
    /synthetic-sensitive|synthetic-token|synthetic-bearer/,
  );
  console.log(
    'OTLP smoke passed: real API span exported to local collector; sensitive sentinels absent from traces and logs.',
  );
} finally {
  app.kill();
  await new Promise((resolve) => collector.close(resolve));
}
