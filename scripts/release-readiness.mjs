import { spawnSync } from 'node:child_process';

const checks = [
  ['pnpm', ['check:architecture']],
  ['pnpm', ['check:secrets']],
  [
    'docker',
    ['compose', '-f', 'compose.staging.yaml', '--env-file', '.env.staging.example', 'config'],
  ],
];
for (const [command, args] of checks) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
console.log(
  'Repository release-readiness checks passed. External staging, provider, backup, monitoring, and human-UAT gates remain separate.',
);
