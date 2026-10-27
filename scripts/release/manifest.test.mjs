import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import {
  digestFromPushOutput,
  makeManifest,
  migrationNames,
  services,
  validateManifest,
} from './manifest.mjs';

const sha = 'a'.repeat(40);
const digests = Object.fromEntries(
  services.map((service, index) => [service, `sha256:${String(index + 1).repeat(64)}`]),
);

test('validates exact release and Maevelle image identities', () => {
  const manifest = makeManifest({ sha, digests, migrations: migrationNames() });
  assert.equal(validateManifest(manifest).commitSha, sha);
  assert.equal(manifest.schema.migrationNames.length, 51);
  assert.throws(() => validateManifest({ ...manifest, shortSha: 'wrong' }), /source SHA/);
  assert.throws(() => validateManifest({ ...manifest, status: 'building' }), /incomplete/);
  assert.throws(
    () =>
      validateManifest({
        ...manifest,
        images: {
          ...manifest.images,
          api: { ...manifest.images.api, repository: 'ghcr.io/other/api' },
        },
      }),
    /for api/,
  );
  assert.throws(
    () =>
      makeManifest({
        sha,
        digests: { ...digests, worker: 'sha256:bad' },
        migrations: migrationNames(),
      }),
    /worker/,
  );
});

test('extracts one digest from actual push output and rejects absent or ambiguous output', () => {
  assert.equal(
    digestFromPushOutput(`staging-aaaa: digest: ${digests.api} size: 1234\n`),
    digests.api,
  );
  assert.throws(() => digestFromPushOutput('pushed without digest'), /Expected one/);
  assert.throws(
    () => digestFromPushOutput(`digest: ${digests.api}\ndigest: ${digests.worker}`),
    /found 2/,
  );
});

test('release CLI creates, lists and inspects a manifest from push logs', () => {
  const directory = mkdtempSync(join(tmpdir(), 'maevelle-release-'));
  try {
    const logs = join(directory, 'logs');
    const output = join(directory, 'out');
    mkdirSync(logs);
    for (const service of services)
      writeFileSync(
        join(logs, `${service}.push.log`),
        `staging: digest: ${digests[service]} size: 100\n`,
      );
    const command = (...args) =>
      spawnSync(process.execPath, [join(import.meta.dirname, 'cli.mjs'), ...args], {
        encoding: 'utf8',
      });
    assert.equal(command('create', '--sha', sha, '--push-logs', logs, '--dir', output).status, 0);
    assert.equal(
      validateManifest(JSON.parse(readFileSync(join(output, `${sha}.json`), 'utf8'))).commitSha,
      sha,
    );
    assert.match(command('list', '--dir', output).stdout, new RegExp(sha));
    assert.match(command('inspect', '--sha', sha, '--dir', output).stdout, /"formatVersion": 1/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
