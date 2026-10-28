import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { Buffer } from 'node:buffer';

function readConfig(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return undefined;
    throw new Error(`Could not read container credentials at ${path}.`);
  }
}

function fromHelper(name, invoke) {
  if (!/^[a-zA-Z0-9_-]+$/u.test(name)) throw new Error('Invalid container credential helper name.');
  const command = `docker-credential-${name}`;
  for (const server of ['ghcr.io', 'https://ghcr.io']) {
    const result = invoke(command, ['get'], {
      input: `${server}\n`,
      encoding: 'utf8',
      shell: false,
      timeout: 5000,
      maxBuffer: 64 * 1024,
    });
    if (result.error?.code === 'ENOENT')
      throw new Error(`Container credential helper ${command} is unavailable.`);
    if (result.status !== 0) continue;
    try {
      const credential = JSON.parse(result.stdout);
      if (
        typeof credential.Username === 'string' &&
        credential.Username &&
        typeof credential.Secret === 'string' &&
        credential.Secret
      )
        return { username: credential.Username, token: credential.Secret };
    } catch {
      throw new Error('Container credential helper returned invalid data.');
    }
  }
  return undefined;
}

function fromAuths(config) {
  for (const server of ['ghcr.io', 'https://ghcr.io', 'https://ghcr.io/v1/']) {
    const encoded = config?.auths?.[server]?.auth;
    if (typeof encoded !== 'string') continue;
    const decoded = Buffer.from(encoded, 'base64').toString('utf8');
    const colon = decoded.indexOf(':');
    if (colon > 0 && colon < decoded.length - 1)
      return { username: decoded.slice(0, colon), token: decoded.slice(colon + 1) };
  }
  return undefined;
}

export function registryCredentials({
  engine = 'docker',
  env = process.env,
  home = homedir(),
  invoke = spawnSync,
} = {}) {
  if (env.GHCR_USERNAME || env.GHCR_TOKEN) {
    if (!env.GHCR_USERNAME || !env.GHCR_TOKEN)
      throw new Error(
        'Both GHCR_USERNAME and GHCR_TOKEN are required when using environment credentials.',
      );
    return { username: env.GHCR_USERNAME, token: env.GHCR_TOKEN };
  }
  if (!['docker', 'podman'].includes(engine)) throw new Error('Unknown local container engine.');
  const paths =
    engine === 'docker'
      ? [join(env.DOCKER_CONFIG || join(home, '.docker'), 'config.json')]
      : [
          env.REGISTRY_AUTH_FILE,
          env.XDG_RUNTIME_DIR && join(env.XDG_RUNTIME_DIR, 'containers/auth.json'),
          join(home, '.config/containers/auth.json'),
        ].filter(Boolean);
  for (const path of paths) {
    const config = readConfig(path);
    if (!config) continue;
    const helper = config.credHelpers?.['ghcr.io'] || config.credsStore;
    if (helper) return fromHelper(helper, invoke);
    const credentials = fromAuths(config);
    if (credentials) return credentials;
  }
  return undefined;
}
