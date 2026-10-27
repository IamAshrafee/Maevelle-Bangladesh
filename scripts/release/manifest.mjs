import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

export const services = Object.freeze(['api', 'worker', 'admin', 'storefront']);
export const releaseRepository = 'ghcr.io/iamashrafee/maevelle-release';
const baselineNameFingerprint = '3bd263cd94c5b618bce254724b854201';
const shaPattern = /^[a-f0-9]{40}$/u;
const digestPattern = /^sha256:[a-f0-9]{64}$/u;

export function imageRepository(service) {
  if (!services.includes(service)) throw new Error(`Unknown Maevelle service: ${service}`);
  return `ghcr.io/iamashrafee/maevelle-${service}`;
}

export function digestFromPushOutput(output) {
  const matches = [...output.matchAll(/(?:^|\s)digest:\s*(sha256:[a-f0-9]{64})(?:\s|$)/gmu)].map(
    (match) => match[1],
  );
  if (matches.length !== 1)
    throw new Error(`Expected one published registry digest; found ${matches.length}.`);
  return matches[0];
}

export function migrationNames(root = resolve(import.meta.dirname, '../..')) {
  const registry = readFileSync(resolve(root, 'packages/database/src/migrations/index.ts'), 'utf8');
  const names = [...registry.matchAll(/^  '([^']+)': \w+,$/gmu)].map((match) => match[1]);
  if (names.length < 51 || new Set(names).size !== names.length)
    throw new Error('Invalid migration registry.');
  return names.sort();
}

export function makeManifest({ sha, digests, builtAt = new Date().toISOString(), migrations }) {
  if (!shaPattern.test(sha ?? '')) throw new Error('Release requires the full source commit SHA.');
  const images = Object.fromEntries(
    services.map((service) => {
      const repository = imageRepository(service);
      const digest = digests[service];
      if (!digestPattern.test(digest ?? ''))
        throw new Error(`Invalid published digest for ${service}.`);
      return [service, { repository, digest, ref: `${repository}@${digest}` }];
    }),
  );
  const manifest = {
    formatVersion: 1,
    status: 'published',
    commitSha: sha,
    shortSha: sha.slice(0, 12),
    builtAt,
    images,
    schema: {
      migrationNames: migrations,
      baselineRelease: 'ccd405c1e6fa8c827307977b947a4a3dbce859f5',
    },
  };
  validateManifest(manifest);
  return manifest;
}

export function validateManifest(manifest) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest))
    throw new Error('Release manifest must be an object.');
  const keys = Object.keys(manifest).sort().join(',');
  if (
    keys !==
    ['builtAt', 'commitSha', 'formatVersion', 'images', 'schema', 'shortSha', 'status']
      .sort()
      .join(',')
  )
    throw new Error('Release manifest has missing or unexpected fields.');
  if (manifest.formatVersion !== 1 || manifest.status !== 'published')
    throw new Error('Unsupported or incomplete release manifest.');
  if (!shaPattern.test(manifest.commitSha) || manifest.shortSha !== manifest.commitSha.slice(0, 12))
    throw new Error('Release source SHA is invalid.');
  if (
    typeof manifest.builtAt !== 'string' ||
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d/.test(manifest.builtAt) ||
    !Number.isFinite(Date.parse(manifest.builtAt))
  )
    throw new Error('Release build timestamp is invalid.');
  if (
    !manifest.images ||
    Object.keys(manifest.images).sort().join(',') !== [...services].sort().join(',')
  )
    throw new Error('Release must contain exactly the four Maevelle application images.');
  for (const service of services) {
    const image = manifest.images[service];
    const repository = imageRepository(service);
    if (
      !image ||
      Object.keys(image).sort().join(',') !== 'digest,ref,repository' ||
      image.repository !== repository ||
      !digestPattern.test(image.digest) ||
      image.ref !== `${repository}@${image.digest}`
    )
      throw new Error(`Invalid image identity or digest for ${service}.`);
  }
  const schema = manifest.schema;
  if (
    !schema ||
    Object.keys(schema).sort().join(',') !== 'baselineRelease,migrationNames' ||
    schema.baselineRelease !== 'ccd405c1e6fa8c827307977b947a4a3dbce859f5'
  )
    throw new Error('Invalid schema compatibility metadata.');
  if (
    !Array.isArray(schema.migrationNames) ||
    schema.migrationNames.length < 51 ||
    new Set(schema.migrationNames).size !== schema.migrationNames.length ||
    schema.migrationNames.some((name) => !/^\d{4}_[a-z0-9_]+$/u.test(name)) ||
    schema.migrationNames.some(
      (name, index) => index > 0 && name <= schema.migrationNames[index - 1],
    )
  )
    throw new Error('Migration identifiers are missing, duplicated, or out of order.');
  const fingerprint = createHash('md5')
    .update(schema.migrationNames.slice(0, 51).join('\n'))
    .digest('hex');
  if (fingerprint !== baselineNameFingerprint)
    throw new Error('Release migration history does not match the verified baseline.');
  return manifest;
}
