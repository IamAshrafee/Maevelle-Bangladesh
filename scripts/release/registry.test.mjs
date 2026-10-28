import assert from 'node:assert/strict';
import { test } from 'node:test';
import { listRegistryReleases, resolveRegistryRelease } from './registry.mjs';

const { Response } = globalThis;

test('lists only Maevelle staging manifest tags with registry-provided digests', async () => {
  const calls = [];
  const digest = `sha256:${'a'.repeat(64)}`;
  const fetchImpl = async (url, options) => {
    calls.push([String(url), options.method ?? 'GET']);
    if (calls.length === 1)
      return new Response('', {
        status: 401,
        headers: {
          'www-authenticate':
            'Bearer realm="https://ghcr.io/token",service="ghcr.io",scope="repository:iamashrafee/maevelle-release:pull"',
        },
      });
    if (String(url).startsWith('https://ghcr.io/token'))
      return Response.json({ token: 'synthetic' });
    if (options.method === 'HEAD')
      return new Response(null, { headers: { 'docker-content-digest': digest } });
    return Response.json({ tags: ['staging-abcdef123456', 'latest', 'staging-bad'] });
  };
  assert.deepEqual(
    await listRegistryReleases({ fetchImpl, username: 'test', token: 'synthetic' }),
    [{ tag: 'staging-abcdef123456', ref: `ghcr.io/iamashrafee/maevelle-release@${digest}` }],
  );
  assert.equal(calls.at(-1)[1], 'HEAD');
});

test('rejects a credential challenge outside GHCR', async () => {
  const fetchImpl = async () =>
    new Response('', {
      status: 401,
      headers: {
        'www-authenticate':
          'Bearer realm="https://evil.invalid/token",service="ghcr.io",scope="repository:iamashrafee/maevelle-release:pull"',
      },
    });
  await assert.rejects(
    listRegistryReleases({ fetchImpl, username: 'test', token: 'synthetic' }),
    /refusing credentials/,
  );
});

test('resolves one full-SHA release by its immutable registry digest', async () => {
  const sha = 'a'.repeat(40);
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push([String(url), options.method]);
    return new Response(null, { headers: { 'docker-content-digest': `sha256:${'b'.repeat(64)}` } });
  };
  assert.deepEqual(await resolveRegistryRelease(sha, { fetchImpl }), {
    tag: `staging-${sha.slice(0, 12)}`,
    ref: `ghcr.io/iamashrafee/maevelle-release@sha256:${'b'.repeat(64)}`,
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0][1], 'HEAD');
});

test('reports missing and malformed release digests', async () => {
  const sha = 'a'.repeat(40);
  await assert.rejects(
    resolveRegistryRelease(sha, { fetchImpl: async () => new Response(null, { status: 404 }) }),
    /No published GHCR release/,
  );
  await assert.rejects(
    resolveRegistryRelease(sha, { fetchImpl: async () => new Response(null) }),
    /valid digest/,
  );
});

test('private release uses supplied credential provider without logging the token', async () => {
  const sha = 'a'.repeat(40);
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), authorization: options.headers?.Authorization });
    if (calls.length === 1)
      return new Response(null, {
        status: 401,
        headers: {
          'www-authenticate':
            'Bearer realm="https://ghcr.io/token",service="ghcr.io",scope="repository:iamashrafee/maevelle-release:pull"',
        },
      });
    if (String(url).includes('/token')) return Response.json({ token: 'bearer-synthetic' });
    return new Response(null, { headers: { 'docker-content-digest': `sha256:${'b'.repeat(64)}` } });
  };
  const release = await resolveRegistryRelease(sha, {
    fetchImpl,
    credentialProvider: () => ({ username: 'operator', token: 'private-synthetic' }),
  });
  assert.match(release.ref, /@sha256:/);
  assert.match(calls[1].authorization, /^Basic /);
  assert.match(calls[2].authorization, /^Bearer /);
  assert.doesNotMatch(JSON.stringify(release), /private-synthetic/);
});

test('missing credentials and rejected credentials produce actionable distinct errors', async () => {
  const sha = 'a'.repeat(40);
  const fetchImpl = async (_url, options) =>
    options.headers?.Authorization
      ? new Response(null, { status: 401 })
      : new Response(null, {
          status: 401,
          headers: {
            'www-authenticate':
              'Bearer realm="https://ghcr.io/token",service="ghcr.io",scope="repository:iamashrafee/maevelle-release:pull"',
          },
        });
  await assert.rejects(
    resolveRegistryRelease(sha, { fetchImpl, credentialProvider: () => undefined }),
    /requires MacBook credentials/,
  );
  await assert.rejects(
    resolveRegistryRelease(sha, {
      fetchImpl,
      credentialProvider: () => ({ username: 'operator', token: 'expired' }),
    }),
    /credentials were rejected/,
  );
});
