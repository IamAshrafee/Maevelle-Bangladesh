import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import type {
  ObjectStoragePort,
  StoredObjectHead,
  StoredObjectLocator,
  UploadAuthorization,
} from './storage.js';
import { normalizeChecksum } from './storage.js';

function notFound(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    ('$metadata' in error || 'name' in error) &&
    (('name' in error && (error.name === 'NotFound' || error.name === 'NoSuchKey')) ||
      ('$metadata' in error &&
        typeof error.$metadata === 'object' &&
        error.$metadata !== null &&
        'httpStatusCode' in error.$metadata &&
        error.$metadata.httpStatusCode === 404))
  );
}

export interface S3ObjectStorageOptions {
  readonly endpoint: string;
  readonly region: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly privateBucket: string;
  readonly publicBucket: string;
  readonly forcePathStyle?: boolean;
}

export class S3ObjectStorage implements ObjectStoragePort {
  public readonly provider = 's3';
  public readonly privateBucket: string;
  public readonly publicBucket: string;
  private readonly client: S3Client;

  public constructor(options: S3ObjectStorageOptions) {
    this.privateBucket = options.privateBucket;
    this.publicBucket = options.publicBucket;
    this.client = new S3Client({
      endpoint: options.endpoint,
      region: options.region,
      credentials: {
        accessKeyId: options.accessKeyId,
        secretAccessKey: options.secretAccessKey,
      },
      forcePathStyle: options.forcePathStyle ?? false,
    });
  }

  public async createSignedUpload(
    locator: StoredObjectLocator,
    input: { readonly contentType: string; readonly expiresInSeconds: number },
  ): Promise<UploadAuthorization> {
    this.assertLocator(locator);
    const url = await getSignedUrl(
      this.client,
      new PutObjectCommand({
        Bucket: locator.bucket,
        Key: locator.key,
        ContentType: input.contentType,
      }),
      { expiresIn: input.expiresInSeconds },
    );
    return {
      strategy: 'SIGNED_PUT',
      url,
      method: 'PUT',
      headers: { 'content-type': input.contentType },
      expiresAt: new Date(Date.now() + input.expiresInSeconds * 1_000).toISOString(),
    };
  }

  public async createSignedRead(
    locator: StoredObjectLocator,
    input: { readonly expiresInSeconds: number; readonly downloadName?: string },
  ): Promise<string> {
    this.assertLocator(locator);
    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: locator.bucket,
        Key: locator.key,
        ...(input.downloadName
          ? {
              ResponseContentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(input.downloadName)}`,
            }
          : {}),
      }),
      { expiresIn: input.expiresInSeconds },
    );
  }

  public async put(
    locator: StoredObjectLocator,
    content: Buffer,
    input: { readonly contentType: string; readonly checksumSha256?: string },
  ): Promise<void> {
    this.assertLocator(locator);
    await this.client.send(
      new PutObjectCommand({
        Bucket: locator.bucket,
        Key: locator.key,
        Body: content,
        ContentType: input.contentType,
        ...(input.checksumSha256 ? { Metadata: { sha256: input.checksumSha256 } } : {}),
      }),
    );
  }

  public async get(locator: StoredObjectLocator): Promise<Buffer | undefined> {
    this.assertLocator(locator);
    try {
      const response = await this.client.send(
        new GetObjectCommand({ Bucket: locator.bucket, Key: locator.key }),
      );
      if (!response.Body) return undefined;
      return Buffer.from(await response.Body.transformToByteArray());
    } catch (error) {
      if (notFound(error)) return undefined;
      throw error;
    }
  }

  public async head(locator: StoredObjectLocator): Promise<StoredObjectHead | undefined> {
    this.assertLocator(locator);
    try {
      const response = await this.client.send(
        new HeadObjectCommand({ Bucket: locator.bucket, Key: locator.key }),
      );
      return {
        byteSize: response.ContentLength ?? 0,
        contentType: response.ContentType ?? null,
        checksumSha256: response.Metadata?.sha256
          ? normalizeChecksum(response.Metadata.sha256)
          : null,
      };
    } catch (error) {
      if (notFound(error)) return undefined;
      throw error;
    }
  }

  public async delete(locator: StoredObjectLocator): Promise<void> {
    this.assertLocator(locator);
    await this.client.send(new DeleteObjectCommand({ Bucket: locator.bucket, Key: locator.key }));
  }

  private assertLocator(locator: StoredObjectLocator): void {
    if (locator.provider !== this.provider) throw new Error('Storage provider mismatch.');
    if (![this.privateBucket, this.publicBucket].includes(locator.bucket))
      throw new Error('Unknown object-storage bucket.');
  }
}
