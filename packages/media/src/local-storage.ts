import { createReadStream, createWriteStream } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, link, stat, unlink, writeFile } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import type { Readable } from 'node:stream';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import type {
  ObjectStoragePort,
  StoredObjectHead,
  StoredObjectLocator,
  UploadAuthorization,
} from './storage.js';
import { sha256 } from './storage.js';
import { validateMediaSignature } from './image-processing.js';

function missing(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}

export class InvalidLocalUploadError extends Error {}

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
    input: {
      readonly contentType: string;
      readonly expiresInSeconds: number;
      readonly checksumSha256?: string;
    },
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
    input?: { readonly contentType?: string; readonly checksumSha256?: string },
  ): Promise<void> {
    if (input?.checksumSha256 && sha256(content) !== input.checksumSha256)
      throw new Error('Content checksum does not match provided checksum.');
    const destination = this.resolveLocator(locator);
    await mkdir(dirname(destination), { recursive: true });
    try {
      await writeFile(destination, content, { flag: 'wx' });
    } catch (error) {
      if (!(typeof error === 'object' && error && 'code' in error && error.code === 'EEXIST'))
        throw error;
      const existing = await stat(destination);
      if (existing.size !== content.length || await this.hashFile(destination) !== sha256(content))
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

  public async openRead(locator: StoredObjectLocator): Promise<{ stream: Readable; byteSize: number } | undefined> {
    const path = this.resolveLocator(locator);
    try {
      const metadata = await stat(path);
      return { stream: createReadStream(path), byteSize: metadata.size };
    } catch (error) {
      if (missing(error)) return undefined;
      throw error;
    }
  }

  public async putStream(locator: StoredObjectLocator, source: Readable, input: {
    readonly expectedByteSize: number; readonly mimeType: string;
    readonly expectedChecksumSha256?: string;
  }): Promise<{ byteSize: number; checksumSha256: string }> {
    const destination = this.resolveLocator(locator);
    await mkdir(dirname(destination), { recursive: true });
    const temporaryDirectory = resolve(this.root, '.uploads');
    await mkdir(temporaryDirectory, { recursive: true });
    const temporary = resolve(temporaryDirectory, randomUUID());
    const hash = createHash('sha256');
    let byteSize = 0;
    let signature = Buffer.alloc(0);
    let signatureChecked = false;
    const meter = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        byteSize += chunk.length;
        if (byteSize > input.expectedByteSize) {
          callback(new InvalidLocalUploadError('Upload exceeds its authorized size.'));
          return;
        }
        if (signature.length < 12)
          signature = Buffer.concat([signature, chunk.subarray(0, 12 - signature.length)]);
        if (!signatureChecked && signature.length >= 12) {
          signatureChecked = true;
          if (!validateMediaSignature(signature, input.mimeType)) {
            callback(new InvalidLocalUploadError('Uploaded file signature does not match its session.'));
            return;
          }
        }
        hash.update(chunk);
        callback(null, chunk);
      },
    });
    try {
      await pipeline(source, meter, createWriteStream(temporary, { flags: 'wx' }));
      if (byteSize !== input.expectedByteSize || !validateMediaSignature(signature, input.mimeType))
        throw new InvalidLocalUploadError('Uploaded file size or signature does not match its session.');
      const checksumSha256 = hash.digest('hex');
      if (input.expectedChecksumSha256 && checksumSha256 !== input.expectedChecksumSha256)
        throw new InvalidLocalUploadError('Uploaded file checksum does not match its session.');
      try {
        await link(temporary, destination);
      } catch (error) {
        if (!(typeof error === 'object' && error && 'code' in error && error.code === 'EEXIST')) throw error;
        const existing = await stat(destination);
        if (existing.size !== byteSize || await this.hashFile(destination) !== checksumSha256)
          throw new Error('An object already exists at the media key with different content.');
      }
      return { byteSize, checksumSha256 };
    } finally {
      await unlink(temporary).catch((error: unknown) => { if (!missing(error)) throw error; });
    }
  }

  public async head(locator: StoredObjectLocator): Promise<StoredObjectHead | undefined> {
    try {
      const path = this.resolveLocator(locator);
      const metadata = await stat(path);
      return { byteSize: metadata.size, contentType: null, checksumSha256: null };
    } catch (error) {
      if (missing(error)) return undefined;
      throw error;
    }
  }

  public async probe(locator: StoredObjectLocator): Promise<{ byteSize: number } | undefined> {
    try {
      return { byteSize: (await stat(this.resolveLocator(locator))).size };
    } catch (error) {
      if (missing(error)) return undefined;
      throw error;
    }
  }

  public async cleanupAbandonedUploads(olderThanMs: number): Promise<number> {
    const directory = resolve(this.root, '.uploads');
    let names: string[];
    try {
      names = await readdir(directory);
    } catch (error) {
      if (missing(error)) return 0;
      throw error;
    }
    let removed = 0;
    for (const name of names.slice(0, 100)) {
      if (!/^[0-9a-f-]{36}$/.test(name)) continue;
      const path = resolve(directory, name);
      try {
        const metadata = await stat(path);
        if (!metadata.isFile() || Date.now() - metadata.mtimeMs < olderThanMs) continue;
        await unlink(path);
        removed += 1;
      } catch (error) {
        if (!missing(error)) throw error;
      }
    }
    return removed;
  }

  public async delete(locator: StoredObjectLocator): Promise<void> {
    try {
      await unlink(this.resolveLocator(locator));
    } catch (error) {
      if (!missing(error)) throw error;
    }
  }

  private async hashFile(path: string): Promise<string> {
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(path)) hash.update(chunk);
    return hash.digest('hex');
  }

  private resolveLocator(locator: StoredObjectLocator): string {
    if (locator.provider !== this.provider) throw new Error('Storage provider mismatch.');
    if (![this.privateBucket, this.publicBucket].includes(locator.bucket))
      throw new Error('Unknown local media bucket.');
    if (
      !/^organizations\/[a-zA-Z0-9_-]+\/assets\/[a-zA-Z0-9_-]+\/(?:renditions\/)?[a-zA-Z0-9_.-]+$/.test(
        locator.key,
      ) &&
      !/^avatars\/[a-zA-Z0-9_.-]+$/.test(locator.key)
    )
      throw new Error('Unsafe media object key.');
    const candidate = resolve(this.root, locator.bucket, locator.key);
    const bucketRoot = resolve(this.root, locator.bucket);
    if (candidate !== bucketRoot && !candidate.startsWith(`${bucketRoot}${sep}`))
      throw new Error('Unsafe media object path.');
    return candidate;
  }
}
