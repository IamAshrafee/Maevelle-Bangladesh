import { releaseRepository } from './manifest.mjs';

const registryOrigin = 'https://ghcr.io';
const packagePath = '/v2/iamashrafee/maevelle-release';
const digestPattern = /^sha256:[a-f0-9]{64}$/u;

function bearerChallenge(value) {
  if (!value?.startsWith('Bearer ')) throw new Error('GHCR did not provide a bearer challenge.');
  const attributes = Object.fromEntries(
    [...value.matchAll(/(\w+)="([^"]+)"/gmu)].map((match) => [match[1], match[2]]),
  );
  const realm = new URL(attributes.realm ?? '');
  if (
    realm.protocol !== 'https:' ||
    realm.hostname !== 'ghcr.io' ||
    attributes.scope !== 'repository:iamashrafee/maevelle-release:pull'
  )
    throw new Error('Unexpected GHCR token challenge; refusing credentials.');
  return { realm, service: attributes.service, scope: attributes.scope };
}

export async function listRegistryReleases({
  fetchImpl = fetch,
  username = process.env.GHCR_USERNAME,
  token = process.env.GHCR_TOKEN,
} = {}) {
  let bearer;
  async function request(url, method = 'GET') {
    let response = await fetchImpl(url, {
      method,
      headers: { ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) },
    });
    if (response.status === 401 && !bearer) {
      const challenge = bearerChallenge(response.headers.get('www-authenticate'));
      challenge.realm.searchParams.set('service', challenge.service);
      challenge.realm.searchParams.set('scope', challenge.scope);
      const credentials =
        username && token
          ? `Basic ${Buffer.from(`${username}:${token}`).toString('base64')}`
          : undefined;
      const grant = await fetchImpl(challenge.realm, {
        headers: credentials ? { Authorization: credentials } : {},
      });
      if (!grant.ok) throw new Error(`GHCR token request failed (${grant.status}).`);
      bearer = (await grant.json()).token;
      if (typeof bearer !== 'string' || !bearer)
        throw new Error('GHCR returned no registry token.');
      response = await fetchImpl(url, { method, headers: { Authorization: `Bearer ${bearer}` } });
    }
    if (!response.ok) throw new Error(`GHCR ${method} failed (${response.status}).`);
    return response;
  }

  let next = `${registryOrigin}${packagePath}/tags/list?n=100`;
  const tags = new Set();
  while (next) {
    const response = await request(next);
    const data = await response.json();
    for (const tag of data.tags ?? []) if (/^staging-[a-f0-9]{12}$/u.test(tag)) tags.add(tag);
    const link = response.headers.get('link');
    if (!link) break;
    const match = /^<([^>]+)>;\s*rel="next"$/u.exec(link);
    if (!match) throw new Error('Unexpected GHCR pagination link.');
    const url = new URL(match[1], registryOrigin);
    if (url.origin !== registryOrigin || url.pathname !== `${packagePath}/tags/list`)
      throw new Error('GHCR pagination escaped the Maevelle release repository.');
    next = url.toString();
  }
  const releases = [];
  for (const tag of [...tags].sort().reverse()) {
    const response = await request(`${registryOrigin}${packagePath}/manifests/${tag}`, 'HEAD');
    const digest = response.headers.get('docker-content-digest');
    if (!digestPattern.test(digest ?? ''))
      throw new Error(`GHCR did not return a valid digest for ${tag}.`);
    releases.push({ tag, ref: `${releaseRepository}@${digest}` });
  }
  return releases;
}
