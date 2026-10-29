import { lookup } from 'node:dns/promises';
import { request } from 'node:https';
import { isIP } from 'node:net';

import { validateMediaSignature } from './image-processing.js';

const MAX_BYTES = 10 * 1024 * 1024;
const REDIRECT_LIMIT = 3;
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'] as const;

type ImageMime = (typeof ALLOWED_MIME)[number];
type Address = { address: string; family: 4 | 6 };
type DownloadResponse = {
  status: number;
  location?: string;
  mimeType?: string;
  declaredLength?: number;
  content?: Buffer;
};

export class ExternalImageImportError extends Error {
  public constructor(public readonly code: string, public readonly retryable: boolean) {
    super(code);
    this.name = 'ExternalImageImportError';
  }
}

/** Only globally routable addresses may be used for a pinned outbound connection. */
export function isPublicImportAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) {
    const [a = 0, b = 0, c = 0] = address.split('.').map(Number);
    if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && (b === 0 || (b === 88 && c === 99) ||
      (b === 168) || (b === 0 && c === 2))) return false;
    if (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) return false;
    if (a === 203 && b === 0 && c === 113) return false;
    return true;
  }
  if (family === 6) {
    const normalized = new URL(`http://[${address}]`).hostname.slice(1, -1).toLowerCase();
    if (normalized.startsWith('::ffff:')) return false;
    // Public IPv6 unicast lives in 2000::/3. Exclude documentation and transition ranges.
    const first = Number.parseInt(normalized.split(':')[0] ?? '', 16);
    if (!Number.isFinite(first) || first < 0x2000 || first > 0x3fff) return false;
    if (normalized.startsWith('2001:db8:') || normalized === '2001:db8::') return false;
    if (normalized.startsWith('2001:0:') || normalized.startsWith('2001::') ||
      normalized.startsWith('2002:')) return false;
    return true;
  }
  return false;
}

export async function validateExternalImageDestination(
  value: string,
  resolve: (hostname: string) => Promise<readonly Address[]> = async (hostname) =>
    lookup(hostname, { all: true }) as Promise<Address[]>,
): Promise<{ url: URL; pinned: Address }> {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ExternalImageImportError('UNSAFE_MEDIA_URL', false);
  }
  const hostname = url.hostname.toLowerCase();
  if (url.protocol !== 'https:' || url.port || url.username || url.password ||
    isIP(hostname) !== 0 || hostname.length > 253 ||
    !/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(hostname) ||
    hostname.endsWith('.localhost') || hostname.endsWith('.internal') ||
    value.length > 2048)
    throw new ExternalImageImportError('UNSAFE_MEDIA_URL', false);
  let addresses: readonly Address[];
  try {
    addresses = await resolve(hostname);
  } catch {
    throw new ExternalImageImportError('MEDIA_DNS_FAILED', true);
  }
  if (!addresses.length || addresses.some((entry) =>
    entry.family !== isIP(entry.address) || !isPublicImportAddress(entry.address)))
    throw new ExternalImageImportError('UNSAFE_MEDIA_HOST', false);
  return { url, pinned: addresses[0]! };
}

async function requestPinnedImage(url: URL, pinned: Address): Promise<DownloadResponse> {
  return new Promise((resolve, reject) => {
    const client = request(url, {
      agent: false,
      headers: { accept: ALLOWED_MIME.join(','), 'user-agent': 'Maevelle image importer/1.0' },
      lookup: (_hostname, _options, callback) => callback(null, pinned.address, pinned.family),
    }, (response) => {
      const status = response.statusCode ?? 0;
      const location = response.headers.location;
      if ([301, 302, 303, 307, 308].includes(status)) {
        response.resume();
        resolve({ status, ...(typeof location === 'string' ? { location } : {}) });
        return;
      }
      if (status !== 200) {
        response.resume();
        resolve({ status });
        return;
      }
      const declaredLength = Number(response.headers['content-length'] ?? 0);
      if (declaredLength > MAX_BYTES) {
        response.destroy(new ExternalImageImportError('MEDIA_TOO_LARGE', false));
        return;
      }
      const chunks: Buffer[] = [];
      let total = 0;
      response.on('data', (chunk: Buffer) => {
        total += chunk.length;
        if (total > MAX_BYTES) {
          response.destroy(new ExternalImageImportError('MEDIA_TOO_LARGE', false));
          return;
        }
        chunks.push(chunk);
      });
      response.on('end', () => resolve({
        status,
        mimeType: String(response.headers['content-type'] ?? '').split(';', 1)[0]?.trim().toLowerCase() ?? '',
        declaredLength,
        content: Buffer.concat(chunks),
      }));
      response.on('error', reject);
    });
    const timer = setTimeout(() => client.destroy(
      new ExternalImageImportError('MEDIA_DOWNLOAD_TIMEOUT', true)), 10_000);
    client.on('error', reject);
    client.on('close', () => clearTimeout(timer));
    client.end();
  });
}

export async function downloadExternalImage(
  value: string,
  options: {
    resolve?: (hostname: string) => Promise<readonly Address[]>;
    request?: (url: URL, pinned: Address) => Promise<DownloadResponse>;
  } = {},
): Promise<{ content: Buffer; mimeType: ImageMime }> {
  let current = value;
  for (let redirect = 0; redirect <= REDIRECT_LIMIT; redirect++) {
    const { url, pinned } = await validateExternalImageDestination(current, options.resolve);
    let response: DownloadResponse;
    try {
      response = await (options.request ?? requestPinnedImage)(url, pinned);
    } catch (error) {
      if (error instanceof ExternalImageImportError) throw error;
      throw new ExternalImageImportError('MEDIA_DOWNLOAD_FAILED', true);
    }
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      if (!response.location || redirect === REDIRECT_LIMIT)
        throw new ExternalImageImportError('MEDIA_REDIRECT_REJECTED', false);
      current = new URL(response.location, url).toString();
      continue;
    }
    if (response.status !== 200)
      throw new ExternalImageImportError('MEDIA_DOWNLOAD_FAILED', response.status >= 500 || response.status === 429);
    const mimeType = response.mimeType as ImageMime;
    if (!ALLOWED_MIME.includes(mimeType) || !response.content ||
      response.content.length === 0 || response.content.length > MAX_BYTES ||
      (response.declaredLength && response.declaredLength !== response.content.length) ||
      !validateMediaSignature(response.content, mimeType))
      throw new ExternalImageImportError('MEDIA_CONTENT_INVALID', false);
    return { content: response.content, mimeType };
  }
  throw new ExternalImageImportError('MEDIA_REDIRECT_REJECTED', false);
}
