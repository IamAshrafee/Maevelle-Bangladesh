import { releaseRepository } from './manifest.mjs';
import { Buffer } from 'node:buffer';
import { registryCredentials } from './credentials.mjs';

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

function registryClient({
  fetchImpl = fetch,
  username,
  token,
  engine = 'docker',
  credentialProvider = registryCredentials,
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
      const stored = username && token ? { username, token } : credentialProvider({ engine });
      const credentials = stored
        ? `Basic ${Buffer.from(`${stored.username}:${stored.token}`).toString('base64')}`
        : undefined;
      const grant = await fetchImpl(challenge.realm, {
        headers: credentials ? { Authorization: credentials } : {},
      });
      if (grant.status === 401 || grant.status === 403)
        throw new Error(
          stored
            ? 'GHCR credentials were rejected or lack read:packages access; refresh the MacBook login.'
            : 'Private GHCR release requires MacBook credentials with read:packages access.',
        );
      if (!grant.ok) throw new Error(`GHCR token request failed (${grant.status}).`);
      bearer = (await grant.json()).token;
      if (typeof bearer !== 'string' || !bearer)
        throw new Error('GHCR returned no registry token.');
      response = await fetchImpl(url, { method, headers: { Authorization: `Bearer ${bearer}` } });
      if (response.status === 401 || response.status === 403)
        throw new Error(
          stored
            ? 'GHCR credentials were rejected or lack read:packages access; refresh the MacBook login.'
            : 'Private GHCR release requires MacBook credentials with read:packages access.',
        );
    }
    if (!response.ok) throw new Error(`GHCR ${method} failed (${response.status}).`);
    return response;
  }

  return request;
}

function manifestDigest(response, tag) {
  const digest = response.headers.get('docker-content-digest');
  if (!digestPattern.test(digest ?? ''))
    throw new Error(`GHCR did not return a valid digest for ${tag}.`);
  return { tag, ref: `${releaseRepository}@${digest}` };
}

export async function listRegistryReleases(options = {}) {
  const request = registryClient(options);
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
    releases.push(manifestDigest(response, tag));
  }
  return releases;
}

// Resolve one published release without enumerating every historical tag.
export async function resolveRegistryRelease(sha, options = {}) {
  if (!/^[a-f0-9]{40}$/u.test(sha)) throw new Error('Provide a full 40-character commit SHA.');
  const tag = `staging-${sha.slice(0, 12)}`;
  const request = registryClient(options);
  try {
    return manifestDigest(
      await request(`${registryOrigin}${packagePath}/manifests/${tag}`, 'HEAD'),
      tag,
    );
  } catch (error) {
    if (error.message === 'GHCR HEAD failed (404).')
      throw new Error(`No published GHCR release for ${sha}.`);
    throw error;
  }
}
