import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Buffer } from 'node:buffer';
import { registryCredentials } from './credentials.mjs';

test('reads a private GHCR credential from the configured macOS helper', () => {
  const home = mkdtempSync(join(tmpdir(), 'maevelle-ghcr-'));
  try {
    mkdirSync(join(home, '.docker'));
    writeFileSync(join(home, '.docker/config.json'), JSON.stringify({ credsStore: 'osxkeychain' }));
    const calls = [];
    const credential = registryCredentials({
      home,
      env: {},
      invoke: (command, args, options) => {
        calls.push({ command, args, input: options.input });
        return {
          status: 0,
          stdout: JSON.stringify({ Username: 'operator', Secret: 'synthetic-token' }),
        };
      },
    });
    assert.deepEqual(credential, { username: 'operator', token: 'synthetic-token' });
    assert.deepEqual(calls, [
      { command: 'docker-credential-osxkeychain', args: ['get'], input: 'ghcr.io\n' },
    ]);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('reads Podman auth file without putting the token in a command argument', () => {
  const home = mkdtempSync(join(tmpdir(), 'maevelle-ghcr-'));
  try {
    const authFile = join(home, 'auth.json');
    writeFileSync(
      authFile,
      JSON.stringify({
        auths: { 'ghcr.io': { auth: Buffer.from('operator:synthetic-token').toString('base64') } },
      }),
    );
    assert.deepEqual(
      registryCredentials({ engine: 'podman', env: { REGISTRY_AUTH_FILE: authFile }, home }),
      { username: 'operator', token: 'synthetic-token' },
    );
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('missing and partial credentials are distinct', () => {
  const home = mkdtempSync(join(tmpdir(), 'maevelle-ghcr-'));
  try {
    assert.equal(registryCredentials({ home, env: {} }), undefined);
    assert.throws(
      () => registryCredentials({ home, env: { GHCR_USERNAME: 'operator' } }),
      /Both GHCR_USERNAME/,
    );
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
