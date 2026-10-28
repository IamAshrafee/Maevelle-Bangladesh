import { readFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { spawnSync } from 'node:child_process';
import { stdin, stdout } from 'node:process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveRegistryRelease } from '../release/registry.mjs';
import { releaseRepository, validateManifest } from '../release/manifest.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
const gateway = 'sudo -n /usr/local/libexec/maevelle-staging-operator';

export function parseOptions(argv) {
  const [action, ...args] = argv;
  if (action === '--help' || action === '-h' || action === 'help') return { action: 'help' };
  if (!['deploy', 'plan', 'verify', 'status'].includes(action))
    throw new Error(
      'Usage: pnpm staging deploy|plan|verify --sha FULL_SHA [--host SSH_ALIAS] [--engine docker|podman] | pnpm staging status [--host SSH_ALIAS]',
    );
  const options = { action, host: 'maevelle-staging', engine: 'docker' };
  for (let index = 0; index < args.length; index += 2) {
    const flag = args[index];
    if (!['--sha', '--host', '--engine'].includes(flag) || !args[index + 1])
      throw new Error(`Invalid option: ${flag ?? '(missing)'}`);
    options[{ '--sha': 'sha', '--host': 'host', '--engine': 'engine' }[flag]] = args[index + 1];
  }
  if (action !== 'status' && !/^[a-f0-9]{40}$/u.test(options.sha ?? ''))
    throw new Error('Provide a full 40-character release commit with --sha.');
  if (action === 'status' && options.sha) throw new Error('Status does not use --sha.');
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/u.test(options.host) || options.host.startsWith('-'))
    throw new Error('SSH host must be a safe configured alias or hostname.');
  if (!['docker', 'podman'].includes(options.engine))
    throw new Error('Engine must be docker or podman.');
  return options;
}

function run(command, args, input) {
  const result = spawnSync(command, args, {
    cwd: root,
    input,
    encoding: 'utf8',
    shell: false,
    maxBuffer: 2 * 1024 * 1024,
  });
  if (result.error) throw new Error(`${command} could not start: ${result.error.message}`);
  if (result.status !== 0) {
    const diagnostic = (result.stderr || result.stdout || '').trim().slice(0, 1200);
    throw new Error(`${command} failed (exit ${result.status ?? 'unknown'}): ${diagnostic}`);
  }
  return result.stdout.trim();
}

export function sshRequest(host, request, invoke = run) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/u.test(host))
    throw new Error('SSH host must be a safe configured alias or hostname.');
  return invoke(
    'ssh',
    [
      '-o',
      'BatchMode=yes',
      '-o',
      'StrictHostKeyChecking=yes',
      '-o',
      'ConnectTimeout=10',
      host,
      gateway,
    ],
    JSON.stringify(request),
  );
}

function remoteJson(host, request) {
  let output;
  try {
    output = sshRequest(host, request);
  } catch (error) {
    if (
      /sudo:.*(password|not allowed|not in the sudoers|a terminal is required)/iu.test(
        error.message,
      )
    )
      throw new Error(
        'SSH connected, but Maevelle operator authorization is missing. Install the reviewed gateway and sudoers rule.',
      );
    throw error;
  }
  try {
    return JSON.parse(output);
  } catch {
    throw new Error('Remote executor returned invalid JSON.');
  }
}

async function fetchRelease(sha, engine) {
  const release = await resolveRegistryRelease(sha, { engine });
  const digest = release.ref.slice(`${releaseRepository}@`.length);
  const path = run('node', [
    resolve(root, 'scripts/release/cli.mjs'),
    'fetch',
    '--sha',
    sha,
    '--manifest-digest',
    digest,
    '--engine',
    engine,
    '--dir',
    resolve(root, 'var/releases'),
  ]);
  const manifest = validateManifest(JSON.parse(readFileSync(path, 'utf8')));
  if (manifest.commitSha !== sha)
    throw new Error('Fetched release commit differs from requested commit.');
  return { manifest, path, ref: release.ref };
}

function transfer(host, sha, path) {
  const manifest = validateManifest(JSON.parse(readFileSync(path, 'utf8')));
  if (manifest.commitSha !== sha)
    throw new Error('Transfer manifest commit differs from requested commit.');
  const response = remoteJson(host, { action: 'upload', sha, manifest });
  if (response.uploadedCommit !== sha) throw new Error('Remote manifest upload was not confirmed.');
}

function formatPlan(plan) {
  return [
    `Target: ${plan.targetCommit}`,
    `Changed images: ${plan.changedImages.join(', ') || 'none'}`,
    `Services to update: ${plan.selectedServices.join(', ') || 'none'}`,
    `Migrations: ${plan.appliedMigrations} applied, ${plan.pendingMigrations.length} pending`,
    `Order: ${plan.restartOrder.join(' → ') || 'no restarts'}`,
  ].join('\n');
}

async function approval(sha) {
  if (!stdin.isTTY) throw new Error('Deployment approval requires an interactive terminal.');
  const line = createInterface({ input: stdin, output: stdout });
  try {
    return (await line.question(`Type full commit ${sha} to deploy: `)).trim() === sha;
  } finally {
    line.close();
  }
}

export async function workflow(options, dependencies = {}) {
  const fetch = dependencies.fetchRelease ?? fetchRelease;
  const send = dependencies.transfer ?? transfer;
  const remote = dependencies.remoteJson ?? remoteJson;
  const confirm = dependencies.approval ?? approval;
  const log = dependencies.log ?? console.log;
  const { action, sha, host, engine } = options;
  if (action === 'help') {
    log(
      'Usage: pnpm staging deploy|plan|verify --sha FULL_SHA [--host SSH_ALIAS] [--engine docker|podman] | pnpm staging status [--host SSH_ALIAS]',
    );
    return;
  }
  if (action === 'status') {
    const status = remote(host, { action: 'status' });
    log(
      `Running release: ${status.recordedCommit ?? 'unrecorded'}\nMigrations: ${status.appliedMigrations} applied\nLast attempt: ${status.lastAttempt?.outcome ?? 'none'}`,
    );
    return status;
  }
  const release = await fetch(sha, engine);
  log(`Published release: ${release.ref}`);
  send(host, sha, release.path);
  if (action === 'verify') {
    try {
      const result = remote(host, { action: 'verify', sha });
      const status = remote(host, { action: 'status' });
      if (result.outcome !== 'verified' || status.recordedCommit !== sha)
        throw new Error('Executor result and recorded running release disagree.');
      log(
        `Result: verified\nTarget commit: ${sha}\nUpdated services: none\nRunning release: ${status.recordedCommit}\nMigrations: ${status.appliedMigrations} applied\nHealth: ${result.checks?.verifiedServices?.join(', ') ?? 'verified by executor'}`,
      );
      return { result, status };
    } catch (error) {
      log(`Verification failed: ${error.message}`);
      throw error;
    }
  }
  const plan = remote(host, { action: 'plan', sha });
  if (plan.targetCommit !== sha) throw new Error('Remote plan targets a different commit.');
  log(formatPlan(plan));
  if (action === 'plan') return plan;
  if (action === 'deploy' && (plan.blockedByMigration || plan.pendingMigrations.length))
    throw new Error(
      'Pending migrations block deployment. Review and run the separate staging migration procedure, then retry.',
    );
  if (action === 'deploy' && !(await confirm(sha)))
    throw new Error('Deployment not approved; running release unchanged.');
  try {
    const result = remote(host, { action: 'apply', sha });
    const status = remote(host, { action: 'status' });
    if (result.outcome !== 'verified' || status.recordedCommit !== sha)
      throw new Error('Executor result and recorded running release disagree.');
    log(
      `Result: verified\nTarget commit: ${sha}\nUpdated services: ${plan.selectedServices.join(', ') || 'none'}\nRunning release: ${status.recordedCommit}\nMigrations: ${status.appliedMigrations} applied, ${status.targetPlan?.pendingMigrations?.length ?? 0} pending\nHealth: ${result.checks?.verifiedServices?.join(', ') ?? 'verified by executor'}`,
    );
    return { result, status, plan };
  } catch (error) {
    try {
      const status = remote(host, { action: 'status' });
      log(
        `Running release: ${status.recordedCommit ?? 'unrecorded'}\nLast attempt: ${status.lastAttempt?.outcome ?? 'unknown'} at ${status.lastAttempt?.failedStep ?? 'unknown step'}\nMigrations: ${status.appliedMigrations} applied`,
      );
    } catch {
      log('Remote status unavailable; inspect Maevelle user-unit logs and latest-attempt.json.');
    }
    throw error;
  }
}
