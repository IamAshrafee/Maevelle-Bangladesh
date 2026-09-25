import { createHash, randomUUID } from 'node:crypto';

export interface StoredObjectLocator {
  readonly provider: string;
  readonly bucket: string;
  readonly key: string;
}

export interface StoredObjectHead {
  readonly byteSize: number;
  readonly contentType: string | null;
  readonly checksumSha256: string | null;
}

export type UploadAuthorization =
  | {
      readonly strategy: 'SIGNED_PUT';
      readonly url: string;
      readonly method: 'PUT';
      readonly headers: Readonly<Record<string, string>>;
      readonly expiresAt: string;
    }
  | {
      readonly strategy: 'API_PROXY';
      readonly method: 'PUT';
      readonly headers: Readonly<Record<string, string>>;
      readonly expiresAt: string;
    };

export interface ObjectStoragePort {
  readonly provider: string;
  readonly privateBucket: string;
  readonly publicBucket: string;
  createSignedUpload(
    locator: StoredObjectLocator,
    input: { readonly contentType: string; readonly expiresInSeconds: number },
  ): Promise<UploadAuthorization>;
  createSignedRead(
    locator: StoredObjectLocator,
    input: { readonly expiresInSeconds: number; readonly downloadName?: string },
  ): Promise<string | null>;
  put(
    locator: StoredObjectLocator,
    content: Buffer,
    input: { readonly contentType: string; readonly checksumSha256?: string },
  ): Promise<void>;
  get(locator: StoredObjectLocator): Promise<Buffer | undefined>;
  head(locator: StoredObjectLocator): Promise<StoredObjectHead | undefined>;
  delete(locator: StoredObjectLocator): Promise<void>;
}

const SAFE_EXTENSION = /^[a-z0-9]{1,10}$/;
const SAFE_SEGMENT = /^[a-zA-Z0-9_-]+$/;

export function createMediaObjectKey(input: {
  readonly organizationId: string;
  readonly assetId: string;
  readonly extension: string;
  readonly purpose: 'original' | 'rendition';
  readonly renditionKey?: string;
}): string {
  const extension = input.extension.toLowerCase();
  if (
    !SAFE_EXTENSION.test(extension) ||
    !SAFE_SEGMENT.test(input.organizationId) ||
    !SAFE_SEGMENT.test(input.assetId) ||
    (input.renditionKey && !SAFE_SEGMENT.test(input.renditionKey))
  ) {
    throw new Error('Unsafe media object-key component.');
  }
  const suffix = input.purpose === 'original' ? 'source' : input.renditionKey;
  if (!suffix) throw new Error('Rendition key is required for a rendition object.');
  return `organizations/${input.organizationId}/assets/${input.assetId}/${suffix}-${randomUUID()}.${extension}`;
}

export function createRenditionObjectKey(input: {
  readonly organizationId: string;
  readonly assetId: string;
  readonly renditionKey: string;
  readonly processorVersion: string;
  readonly checksumSha256: string;
  readonly extension: string;
}): string {
  const extension = input.extension.toLowerCase();
  const version = input.processorVersion.replace(/[^a-zA-Z0-9_-]/g, '-');
  if (
    !SAFE_EXTENSION.test(extension) ||
    !SAFE_SEGMENT.test(input.organizationId) ||
    !SAFE_SEGMENT.test(input.assetId) ||
    !SAFE_SEGMENT.test(input.renditionKey) ||
    !SAFE_SEGMENT.test(version) ||
    !/^[0-9a-f]{64}$/.test(input.checksumSha256)
  )
    throw new Error('Unsafe media rendition-key component.');
  return `organizations/${input.organizationId}/assets/${input.assetId}/renditions/${input.renditionKey}-${version}-${input.checksumSha256.slice(0, 16)}.${extension}`;
}

export function sha256(content: Buffer): string {
  return createHash('sha256').update(content).digest('hex');
}

export function normalizeChecksum(value: string | undefined): string | null {
  if (!value) return null;
  return value.replace(/^"|"$/g, '').toLowerCase();
}
