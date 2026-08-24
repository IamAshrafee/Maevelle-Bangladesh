import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const results = [];
function command(name, executable, args) {
  const result = spawnSync(executable, args, { encoding: 'utf8', shell: false });
  const status = result.status === 0 ? 'PASS' : 'FAIL';
  results.push({
    name,
    status,
    evidence: (result.stdout || result.stderr).trim().split(/\r?\n/u).at(-1) ?? '',
  });
}
command('Architecture policy', process.execPath, ['scripts/check-architecture.mjs']);
command('Secret scan', process.execPath, ['scripts/check-secrets.mjs']);
command('Hardening scan', process.execPath, ['scripts/check-hardening.mjs']);
command('Staging Compose', 'docker', [
  'compose',
  '-f',
  'compose.staging.yaml',
  '--env-file',
  '.env.staging.example',
  'config',
  '--quiet',
]);
const status = readFileSync('docs/implementation/status.md', 'utf8');
results.push({
  name: 'Wave B repository status',
  status: status.includes('REPOSITORY READY / EXTERNAL GATES PENDING') ? 'PASS' : 'FAIL',
  evidence: 'status.md',
});
for (const file of [
  'scripts/acceptance.mjs',
  'scripts/postgres-backup.mjs',
  'scripts/staging-smoke.mjs',
  'docs/operations/operator-uat-checklist.md',
  'docs/quality/system-hardening-evidence.md',
])
  results.push({
    name: `Artifact ${file}`,
    status: existsSync(file) ? 'PASS' : 'FAIL',
    evidence: file,
  });
const dirty = spawnSync('git', ['status', '--porcelain'], {
  encoding: 'utf8',
  shell: false,
}).stdout.trim();
results.push({
  name: 'Git clean',
  status: dirty ? 'FAIL' : 'PASS',
  evidence: dirty ? 'Working tree has changes' : 'Clean',
});
for (const external of [
  'External staging deployment',
  'Provider certification',
  'Remote encrypted backup activation',
  'External alert delivery',
  'Human operator UAT',
  'Production authorization',
])
  results.push({
    name: external,
    status: 'EXTERNAL_REQUIRED',
    evidence: 'Human/environment evidence is not stored as a repository pass.',
  });
for (const result of results)
  console.log(`${result.status.padEnd(17)} ${result.name} — ${result.evidence}`);
if (results.some((result) => result.status === 'FAIL')) process.exit(1);
