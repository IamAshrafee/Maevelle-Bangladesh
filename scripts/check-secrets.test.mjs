import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fixturePassword, fixtureSigningSecret } from './fixtures/browser-credentials.mjs';
test('unchanged scanner detects a planted credential and accepts generated fixture configuration', () => {
  const root = mkdtempSync(join(tmpdir(), 'maevelle-secrets-test-'));
  try {
    assert.equal(spawnSync('git', ['init', '--quiet'], { cwd: root }).status, 0);
    const scan = () =>
      spawnSync(process.execPath, [resolve(import.meta.dirname, 'check-secrets.mjs')], {
        cwd: root,
        encoding: 'utf8',
      });
    writeFileSync(
      join(root, 'credential.js'),
      'const apiKey = ' + JSON.stringify('planted-synthetic-' + 'a'.repeat(32)) + ';',
    );
    assert.equal(scan().status, 1);
    writeFileSync(join(root, 'credential.js'), 'const apiKey = process.env.TEST_API_KEY;');
    assert.equal(scan().status, 0);
    assert.ok(fixturePassword.length >= 32);
    assert.notEqual(fixtureSigningSecret(), fixtureSigningSecret());
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
