import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const compiler = spawn(
  process.execPath,
  [
    require.resolve('typescript/bin/tsc'),
    '--watch',
    '-p',
    'tsconfig.json',
    '--preserveWatchOutput',
  ],
  { stdio: ['inherit', 'pipe', 'inherit'] },
);
let server;
compiler.stdout.on('data', (data) => {
  process.stdout.write(data);
  if (!server && String(data).includes('Found 0 errors'))
    server = spawn(
      process.execPath,
      ['--watch', '--env-file-if-exists=../../.env', 'dist/main.js'],
      { stdio: 'inherit' },
    );
});
function stop() {
  compiler.kill();
  server?.kill();
}
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
compiler.once('exit', (code) => {
  server?.kill();
  process.exitCode = code ?? 1;
});
