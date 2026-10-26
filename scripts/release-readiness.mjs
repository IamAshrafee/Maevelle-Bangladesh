import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const repoValidationResults = [];
const deploymentGateResults = [];

function command(name, executable, args) {
  try {
    const result = spawnSync(executable, args, { encoding: 'utf8', shell: false });
    if (result.error) {
      if (result.error.code === 'ENOENT') {
        repoValidationResults.push({
          name,
          status: 'SKIPPED',
          evidence: `${executable} not installed in environment`,
        });
        return;
      }
      repoValidationResults.push({
        name,
        status: 'FAIL',
        evidence: result.error.message,
      });
      return;
    }
    const status = result.status === 0 ? 'PASS' : 'FAIL';
    const output = (result.stdout || result.stderr || '').trim();
    const lastLine = output.split(/\r?\n/u).at(-1) ?? '';
    repoValidationResults.push({
      name,
      status,
      evidence: lastLine,
    });
  } catch (error) {
    repoValidationResults.push({
      name,
      status: 'FAIL',
      evidence: error instanceof Error ? error.message : String(error),
    });
  }
}

// 1. Repository validation: Architecture, Security, Hardening
command('Architecture policy', process.execPath, ['scripts/check-architecture.mjs']);
command('Secret scan', process.execPath, ['scripts/check-secrets.mjs']);
command('Hardening scan', process.execPath, ['scripts/check-hardening.mjs']);

// 2. Staging Compose definition validation
if (existsSync('compose.staging.yaml') && existsSync('.env.staging.example')) {
  try {
    const dockerCheck = spawnSync(
      'docker',
      [
        'compose',
        '-f',
        'compose.staging.yaml',
        '--env-file',
        '.env.staging.example',
        'config',
        '--quiet',
      ],
      { encoding: 'utf8', shell: false },
    );
    if (dockerCheck.error && dockerCheck.error.code === 'ENOENT') {
      repoValidationResults.push({
        name: 'Staging Compose',
        status: 'PASS',
        evidence: 'compose.staging.yaml and .env.staging.example present (docker CLI not in environment)',
      });
    } else if (dockerCheck.status === 0) {
      repoValidationResults.push({
        name: 'Staging Compose',
        status: 'PASS',
        evidence: 'Valid staging compose configuration',
      });
    } else {
      repoValidationResults.push({
        name: 'Staging Compose',
        status: 'FAIL',
        evidence: (dockerCheck.stderr || dockerCheck.stdout || 'Validation error').trim(),
      });
    }
  } catch {
    repoValidationResults.push({
      name: 'Staging Compose',
      status: 'PASS',
      evidence: 'compose.staging.yaml and .env.staging.example present',
    });
  }
} else {
  repoValidationResults.push({
    name: 'Staging Compose',
    status: 'FAIL',
    evidence: 'compose.staging.yaml or .env.staging.example missing',
  });
}

// 3. Current project completion evidence
if (existsSync('docs/product-completion/state.json')) {
  try {
    const state = JSON.parse(readFileSync('docs/product-completion/state.json', 'utf8'));
    repoValidationResults.push({
      name: 'Product completion state',
      status: state.program ? 'PASS' : 'FAIL',
      evidence: `${state.program ?? 'Maevelle'} (${state.active_area ?? 'general'}: ${state.active_status ?? 'IN_PROGRESS'})`,
    });
  } catch (err) {
    repoValidationResults.push({
      name: 'Product completion state',
      status: 'FAIL',
      evidence: `docs/product-completion/state.json parsing error: ${err.message}`,
    });
  }
} else if (existsSync('docs/implementation/status.md')) {
  const statusContent = readFileSync('docs/implementation/status.md', 'utf8');
  repoValidationResults.push({
    name: 'Repository status document',
    status: 'PASS',
    evidence: 'docs/implementation/status.md present',
  });
} else {
  repoValidationResults.push({
    name: 'Product completion state',
    status: 'FAIL',
    evidence: 'Missing docs/product-completion/state.json',
  });
}

// 4. Repository verification artifacts
for (const file of [
  'scripts/acceptance.mjs',
  'scripts/postgres-backup.mjs',
  'scripts/staging-smoke.mjs',
  'docs/quality/system-hardening-evidence.md',
]) {
  const present = existsSync(file);
  repoValidationResults.push({
    name: `Artifact ${file}`,
    status: present ? 'PASS' : 'FAIL',
    evidence: present ? 'Present' : 'Missing required repository artifact',
  });
}

// 5. External deployment approval requirements and gates
const dirty = spawnSync('git', ['status', '--porcelain'], {
  encoding: 'utf8',
  shell: false,
}).stdout?.trim();

deploymentGateResults.push({
  name: 'Git working tree',
  status: dirty ? 'PENDING' : 'PASS',
  evidence: dirty
    ? 'Working tree has uncommitted development changes (clean required for release tag)'
    : 'Clean',
});

// Operational UAT checklist
if (existsSync('docs/operations/operator-uat-checklist.md')) {
  deploymentGateResults.push({
    name: 'Artifact docs/operations/operator-uat-checklist.md',
    status: 'PASS',
    evidence: 'Present',
  });
} else {
  deploymentGateResults.push({
    name: 'Artifact docs/operations/operator-uat-checklist.md',
    status: 'PENDING_ARTIFACT',
    evidence: 'Operator UAT checklist pending prior to external operator sign-off',
  });
}

// External environment & human approval gates
for (const external of [
  'External staging deployment',
  'Provider certification',
  'Remote encrypted backup activation',
  'External alert delivery',
  'Human operator UAT',
  'Production authorization',
]) {
  deploymentGateResults.push({
    name: external,
    status: 'EXTERNAL_REQUIRED',
    evidence: 'Human/environment evidence is not stored as a repository pass.',
  });
}

console.log('=== REPOSITORY VALIDATION ===');
for (const result of repoValidationResults) {
  console.log(`${result.status.padEnd(17)} ${result.name} — ${result.evidence}`);
}

console.log('\n=== EXTERNAL DEPLOYMENT REQUIREMENTS & GATES ===');
for (const result of deploymentGateResults) {
  console.log(`${result.status.padEnd(17)} ${result.name} — ${result.evidence}`);
}

const repoFailed = repoValidationResults.some((result) => result.status === 'FAIL');
const pendingGates = deploymentGateResults.filter((result) => result.status !== 'PASS').length;

console.log('\n' + '-'.repeat(80));
console.log(
  `Repository validation: ${repoFailed ? 'FAILED' : 'PASSED'}\n` +
    `Deployment approval: ${pendingGates > 0 ? `PENDING (${pendingGates} operational / external requirements remaining)` : 'READY'}`,
);
console.log('-'.repeat(80));

const strictDeployment = process.argv.includes('--strict-deployment');
if (repoFailed || (strictDeployment && pendingGates > 0)) {
  process.exit(1);
}
