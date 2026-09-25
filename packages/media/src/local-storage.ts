import { mkdir, readFile, stat, unlink, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';

import type {
  ObjectStoragePort,
  StoredObjectHead,
  StoredObjectLocator,
  UploadAuthorization,
} from './storage.js';
import { sha256 } from './storage.js';

function missing(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}

export class LocalObjectStorage implements ObjectStoragePort {
  public readonly provider = 'local';
  public readonly privateBucket = 'private';
  public readonly publicBucket = 'public';
  private readonly root: string;

  public constructor(rootDirectory: string) {
    this.root = resolve(rootDirectory);
  }

  public async createSignedUpload(
    _locator: StoredObjectLocator,
    input: { readonly contentType: string; readonly expiresInSeconds: number },
  ): Promise<UploadAuthorization> {
    return {
      strategy: 'API_PROXY',
      method: 'PUT',
      headers: { 'content-type': input.contentType },
      expiresAt: new Date(Date.now() + input.expiresInSeconds * 1_000).toISOString(),
    };
  }

  public async createSignedRead(): Promise<null> {
    return null;
  }

  public async put(
    locator: StoredObjectLocator,
    content: Buffer,
    _input: { readonly contentType: string; readonly checksumSha256?: string },
  ): Promise<void> {
    const destination = this.resolveLocator(locator);
    await mkdir(dirname(destination), { recursive: true });
    try {
      await writeFile(destination, content, { flag: 'wx' });
    } catch (error) {
      if (!(typeof error === 'object' && error && 'code' in error && error.code === 'EEXIST'))
        throw error;
      const existing = await readFile(destination);
      if (sha256(existing) !== sha256(content))
        throw new Error('An object already exists at the media key with different content.');
    }
  }

  public async get(locator: StoredObjectLocator): Promise<Buffer | undefined> {
    try {
      return await readFile(this.resolveLocator(locator));
    } catch (error) {
      if (missing(error)) return undefined;
      throw error;
    }
  }

  public async head(locator: StoredObjectLocator): Promise<StoredObjectHead | undefined> {
    try {
      const path = this.resolveLocator(locator);
      const [metadata, content] = await Promise.all([stat(path), readFile(path)]);
      return { byteSize: metadata.size, contentType: null, checksumSha256: sha256(content) };
    } catch (error) {
      if (missing(error)) return undefined;
      throw error;
    }
  }

  public async delete(locator: StoredObjectLocator): Promise<void> {
    try {
      await unlink(this.resolveLocator(locator));
    } catch (error) {
      if (!missing(error)) throw error;
    }
  }

  private resolveLocator(locator: StoredObjectLocator): string {
    if (locator.provider !== this.provider) throw new Error('Storage provider mismatch.');
    if (![this.privateBucket, this.publicBucket].includes(locator.bucket))
      throw new Error('Unknown local media bucket.');
    if (
      !/^organizations\/[a-zA-Z0-9_-]+\/assets\/[a-zA-Z0-9_-]+\/(?:renditions\/)?[a-zA-Z0-9_.-]+$/.test(
        locator.key,
      )
    )
      throw new Error('Unsafe media object key.');
    const candidate = resolve(this.root, locator.bucket, locator.key);
    const bucketRoot = resolve(this.root, locator.bucket);
    if (candidate !== bucketRoot && !candidate.startsWith(`${bucketRoot}${sep}`))
      throw new Error('Unsafe media object path.');
    return candidate;
  }
}
