import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const repoValidationResults = [];
const deploymentGateResults = [];

function command(name, executable, args) {
  try {
    const result = spawnSync(executable, args, { encoding: 'utf8', shell: false });
    if (result.error) {
      repoValidationResults.push({
        name,
        status: 'FAIL',
        evidence:
          result.error.code === 'ENOENT'
            ? `${executable} not installed in environment`
            : result.error.message,
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

// 2. Staging Compose source artifacts. Runtime validation is an explicit deployment gate.
if (existsSync('compose.staging.yaml') && existsSync('.env.staging.example')) {
  repoValidationResults.push({
    name: 'Staging Compose artifacts',
    status: 'PASS',
    evidence:
      'compose.staging.yaml and .env.staging.example present; configuration not validated here',
  });
} else {
  repoValidationResults.push({
    name: 'Staging Compose artifacts',
    status: 'FAIL',
    evidence: 'compose.staging.yaml or .env.staging.example missing',
  });
}

// 3. Current project completion evidence
if (
  existsSync('docs/product-completion/state.json') &&
  existsSync('docs/product-completion/current-focus.md')
) {
  try {
    const state = JSON.parse(readFileSync('docs/product-completion/state.json', 'utf8'));
    const focus = readFileSync('docs/product-completion/current-focus.md', 'utf8').trim();
    repoValidationResults.push({
      name: 'Product completion state',
      status:
        state.program === 'Maevelle Product Completion V2' && state.active_status && focus
          ? 'PASS'
          : 'FAIL',
      evidence: `${state.program ?? 'Maevelle'} (${state.active_area ?? 'general'}: ${state.active_status ?? 'IN_PROGRESS'})`,
    });
    if (Array.isArray(state.blocked_by))
      for (const blocker of state.blocked_by)
        deploymentGateResults.push({
          name: `Product gate ${blocker}`,
          status: 'PENDING',
          evidence:
            'Recorded in current product completion state; independent closure evidence required.',
        });
  } catch (err) {
    repoValidationResults.push({
      name: 'Product completion state',
      status: 'FAIL',
      evidence: `docs/product-completion/state.json parsing error: ${err.message}`,
    });
  }
} else {
  repoValidationResults.push({
    name: 'Product completion state',
    status: 'FAIL',
    evidence: 'Missing docs/product-completion/state.json or current-focus.md',
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
const gitStatus = spawnSync('git', ['status', '--porcelain'], {
  encoding: 'utf8',
  shell: false,
});
const dirty = gitStatus.stdout?.trim();

deploymentGateResults.push({
  name: 'Git working tree',
  status: gitStatus.status !== 0 ? 'PENDING' : dirty ? 'PENDING' : 'PASS',
  evidence:
    gitStatus.status !== 0
      ? 'Could not inspect Git working tree'
      : dirty
        ? 'Working tree has uncommitted development changes (clean required for release tag)'
        : 'Clean',
});
deploymentGateResults.push({
  name: 'Staging Compose configuration',
  status: 'EXTERNAL_REQUIRED',
  evidence:
    'Validate with docker compose config against the intended staging environment before deployment.',
});
deploymentGateResults.push({
  name: 'Shared database migration compatibility',
  status: 'EXTERNAL_REQUIRED',
  evidence:
    'Inventory the target migration ledger and schema, then rehearse required forward-only changes against an isolated copy.',
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
