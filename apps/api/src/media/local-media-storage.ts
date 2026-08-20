import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export type SupportedImageMime = 'image/jpeg' | 'image/png' | 'image/webp';

export class InvalidMediaUploadError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = 'InvalidMediaUploadError';
  }
}

function isJpeg(content: Buffer): boolean {
  return content.length >= 3 && content[0] === 0xff && content[1] === 0xd8 && content[2] === 0xff;
}

function isPng(content: Buffer): boolean {
  return (
    content.length >= 8 &&
    content.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  );
}

function isWebp(content: Buffer): boolean {
  return (
    content.length >= 12 &&
    content.subarray(0, 4).equals(Buffer.from('RIFF')) &&
    content.subarray(8, 12).equals(Buffer.from('WEBP'))
  );
}

export function detectImageMime(content: Buffer): SupportedImageMime | undefined {
  if (isJpeg(content)) return 'image/jpeg';
  if (isPng(content)) return 'image/png';
  if (isWebp(content)) return 'image/webp';
  return undefined;
}

export function imageDimensions(
  content: Buffer,
  mimeType: SupportedImageMime,
): { width?: number; height?: number } {
  if (mimeType === 'image/png' && content.length >= 24) {
    return { width: content.readUInt32BE(16), height: content.readUInt32BE(20) };
  }
  if (
    mimeType === 'image/webp' &&
    content.length >= 30 &&
    content.subarray(12, 16).equals(Buffer.from('VP8X'))
  ) {
    return { width: 1 + content.readUIntLE(24, 3), height: 1 + content.readUIntLE(27, 3) };
  }
  return {};
}

/** Small local adapter with an object-store-shaped key surface; it can later be replaced by R2/S3. */
export class LocalMediaStorage {
  public constructor(private readonly rootDirectory: string) {}

  public async put(
    content: Buffer,
    mimeType: SupportedImageMime,
  ): Promise<{ objectKey: string; checksumSha256: string }> {
    const extension = mimeType === 'image/jpeg' ? 'jpg' : mimeType === 'image/png' ? 'png' : 'webp';
    const objectKey = `images/${randomUUID()}.${extension}`;
    const destination = this.resolve(objectKey);
    await mkdir(dirname(destination), { recursive: true });
    const temporary = `${destination}.${randomUUID()}.uploading`;
    await writeFile(temporary, content, { flag: 'wx' });
    await rename(temporary, destination);
    return { objectKey, checksumSha256: createHash('sha256').update(content).digest('hex') };
  }

  public async read(objectKey: string): Promise<Buffer | undefined> {
    try {
      return await readFile(this.resolve(objectKey));
    } catch (error: unknown) {
      if (typeof error === 'object' && error && 'code' in error && error.code === 'ENOENT')
        return undefined;
      throw error;
    }
  }

  public async remove(objectKey: string): Promise<void> {
    try {
      await unlink(this.resolve(objectKey));
    } catch (error: unknown) {
      if (!(typeof error === 'object' && error && 'code' in error && error.code === 'ENOENT'))
        throw error;
    }
  }

  private resolve(objectKey: string): string {
    if (!/^images\/[0-9a-f-]+\.(?:jpg|png|webp)$/.test(objectKey)) {
      throw new InvalidMediaUploadError('Unsafe media object key.');
    }
    return join(this.rootDirectory, objectKey);
  }
}
