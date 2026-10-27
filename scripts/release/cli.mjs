import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import {
  digestFromPushOutput,
  makeManifest,
  migrationNames,
  releaseRepository,
  services,
  validateManifest,
} from './manifest.mjs';
import { listRegistryReleases } from './registry.mjs';

function option(args, name, fallback) {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  if (!args[index + 1]) throw new Error(`${name} needs a value.`);
  return args[index + 1];
}

function run(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8', shell: false });
  if (result.status !== 0)
    throw new Error(
      `${command} ${args[0]} failed (exit ${result.status ?? 'unknown'}); inspect local engine logs.`,
    );
  return result.stdout.trim();
}

function manifestPath(directory, sha) {
  if (!/^[a-f0-9]{40}$/u.test(sha)) throw new Error('Provide a full 40-character commit SHA.');
  return join(directory, `${sha}.json`);
}

export function createFromPushLogs({ sha, logsDirectory, outputDirectory }) {
  const digests = Object.fromEntries(
    services.map((service) => [
      service,
      digestFromPushOutput(readFileSync(join(logsDirectory, `${service}.push.log`), 'utf8')),
    ]),
  );
  const manifest = makeManifest({ sha, digests, migrations: migrationNames() });
  mkdirSync(outputDirectory, { recursive: true });
  const destination = manifestPath(outputDirectory, sha);
  const temporary = `${destination}.${randomUUID()}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
  renameSync(temporary, destination);
  return destination;
}

export function listLocal(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /^[a-f0-9]{40}\.json$/u.test(entry.name))
    .map((entry) => {
      const manifest = validateManifest(
        JSON.parse(readFileSync(join(directory, entry.name), 'utf8')),
      );
      if (`${manifest.commitSha}.json` !== entry.name)
        throw new Error(`Release filename mismatch: ${entry.name}`);
      return { sha: manifest.commitSha, builtAt: manifest.builtAt, status: manifest.status };
    })
    .sort((a, b) => b.builtAt.localeCompare(a.builtAt));
}

const [action, ...args] = process.argv.slice(2);
const directory = resolve(option(args, '--dir', 'var/releases'));
try {
  if (action === 'create') {
    const path = createFromPushLogs({
      sha: option(args, '--sha'),
      logsDirectory: resolve(option(args, '--push-logs')),
      outputDirectory: directory,
    });
    console.log(path);
  } else if (action === 'list') {
    if (args.includes('--remote')) {
      for (const release of await listRegistryReleases())
        console.log(`${release.tag} ${release.ref}`);
    } else {
      for (const release of listLocal(directory))
        console.log(
          `${release.sha.slice(0, 12)} ${release.sha} ${release.builtAt} ${release.status}`,
        );
    }
  } else if (action === 'inspect') {
    const sha = option(args, '--sha');
    const manifest = validateManifest(
      JSON.parse(readFileSync(manifestPath(directory, sha), 'utf8')),
    );
    console.log(JSON.stringify(manifest, null, 2));
  } else if (action === 'digest') {
    console.log(digestFromPushOutput(readFileSync(option(args, '--push-log'), 'utf8')));
  } else if (action === 'fetch') {
    const sha = option(args, '--sha');
    manifestPath(directory, sha);
    const digest = option(args, '--manifest-digest');
    const engine = option(args, '--engine', 'docker');
    if (!['docker', 'podman'].includes(engine) || !/^sha256:[a-f0-9]{64}$/u.test(digest))
      throw new Error('Fetch requires docker|podman and an immutable manifest digest.');
    const ref = `${releaseRepository}@${digest}`;
    run(engine, ['pull', ref]);
    const container = run(engine, ['create', ref, '/release.json']);
    const temporary = join(directory, `${sha}.${randomUUID()}.tmp`);
    mkdirSync(directory, { recursive: true });
    try {
      run(engine, ['cp', `${container}:/release.json`, temporary]);
      const manifest = validateManifest(JSON.parse(readFileSync(temporary, 'utf8')));
      if (manifest.commitSha !== sha)
        throw new Error('Fetched manifest has a different source commit.');
      renameSync(temporary, manifestPath(directory, sha));
      console.log(manifestPath(directory, sha));
    } finally {
      run(engine, ['rm', '-f', container]);
      rmSync(temporary, { force: true });
    }
  } else {
    throw new Error(
      'Usage: release create --sha SHA --push-logs DIR [--dir DIR] | list [--dir DIR] | inspect --sha SHA [--dir DIR] | fetch --sha SHA --manifest-digest sha256:... [--engine docker|podman] [--dir DIR]',
    );
  }
} catch (error) {
  console.error(
    `Release command failed: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
}
