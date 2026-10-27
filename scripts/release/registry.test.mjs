import assert from 'node:assert/strict';
import { test } from 'node:test';
import { listRegistryReleases } from './registry.mjs';

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
