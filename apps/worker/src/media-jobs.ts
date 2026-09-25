import type { DatabaseClient } from '@maevelle/database';
import {
  claimDueMediaPurge,
  claimMediaAssetForProcessing,
  completeMediaProcessing,
  completeMediaPurge,
  expireMediaUploadSessions,
  failMediaProcessing,
} from '@maevelle/database/media';
import {
  createRenditionObjectKey,
  inspectAndProcessImage,
  InvalidImageError,
  sha256,
  type ObjectStoragePort,
} from '@maevelle/media';

const PROCESSOR_VERSION = 'sharp-1';

export async function processOneMediaAsset(
  database: DatabaseClient,
  storage: ObjectStoragePort,
): Promise<number> {
  const asset = await claimMediaAssetForProcessing(database.db, PROCESSOR_VERSION);
  if (!asset) return 0;
  try {
    if (asset.original.provider !== storage.provider)
      throw new Error(
        `Storage provider ${asset.original.provider} is not configured in this worker.`,
      );
    const source = await storage.get({
      provider: asset.original.provider,
      bucket: asset.original.bucket,
      key: asset.original.objectKey,
    });
    if (!source) throw new Error('Original media object is missing.');
    if (source.length !== asset.original.byteSize)
      throw new Error('Original media object size changed after upload confirmation.');
    const sourceChecksum = sha256(source);

    if (asset.assetType === 'DOCUMENT') {
      if (
        asset.original.mimeType !== 'application/pdf' ||
        !source.subarray(0, 5).equals(Buffer.from('%PDF-'))
      )
        throw new InvalidImageError(
          'UNSUPPORTED_IMAGE',
          'Document signature is not an allowed PDF.',
        );
      await completeMediaProcessing(database.db, {
        asset,
        processorVersion: PROCESSOR_VERSION,
        checksumSha256: sourceChecksum,
        fileFormat: 'pdf',
        renditions: [],
      });
      return 1;
    }

    const processed = await inspectAndProcessImage(source);
    const actualMimeType = `image/${processed.metadata.format}`.replace('image/jpeg', 'image/jpeg');
    if (actualMimeType !== asset.original.mimeType)
      throw new InvalidImageError(
        'UNSUPPORTED_IMAGE',
        'Image signature does not match the declared content type.',
      );
    const renditions = [];
    const renditionBucket =
      asset.visibility === 'PUBLIC' ? storage.publicBucket : storage.privateBucket;
    for (const rendition of processed.renditions) {
      const objectKey = createRenditionObjectKey({
        organizationId: asset.organizationId,
        assetId: asset.assetId,
        renditionKey: rendition.key,
        processorVersion: PROCESSOR_VERSION,
        checksumSha256: rendition.checksumSha256,
        extension: rendition.extension,
      });
      await storage.put(
        { provider: storage.provider, bucket: renditionBucket, key: objectKey },
        rendition.content,
        { contentType: rendition.mimeType, checksumSha256: rendition.checksumSha256 },
      );
      renditions.push({
        key: rendition.key,
        provider: storage.provider,
        bucket: renditionBucket,
        objectKey,
        mimeType: rendition.mimeType,
        byteSize: rendition.byteSize,
        checksumSha256: rendition.checksumSha256,
        widthPx: rendition.width,
        heightPx: rendition.height,
      });
    }
    await completeMediaProcessing(database.db, {
      asset,
      processorVersion: PROCESSOR_VERSION,
      checksumSha256: sourceChecksum,
      widthPx: processed.metadata.width,
      heightPx: processed.metadata.height,
      fileFormat: processed.metadata.format,
      renditions,
    });
    return 1;
  } catch (error) {
    await failMediaProcessing(database.db, {
      asset,
      errorCode: error instanceof InvalidImageError ? error.code : 'MEDIA_PROCESSING_FAILED',
      errorMessage: error instanceof Error ? error.message : 'Media processing failed.',
      quarantine: error instanceof InvalidImageError,
    });
    return 1;
  }
}

export async function processMediaBatch(
  database: DatabaseClient,
  storage: ObjectStoragePort,
  maximum = 10,
): Promise<number> {
  let processed = 0;
  while (processed < maximum) {
    const claimed = await processOneMediaAsset(database, storage);
    if (claimed === 0) break;
    processed += claimed;
  }
  return processed;
}

export async function cleanupExpiredMediaUploads(
  database: DatabaseClient,
  storage: ObjectStoragePort,
): Promise<number> {
  const expired = await expireMediaUploadSessions(database.db);
  await Promise.all(
    expired
      .filter((object) => object.provider === storage.provider)
      .map((object) =>
        storage.delete({ provider: object.provider, bucket: object.bucket, key: object.objectKey }),
      ),
  );
  return expired.length;
}

export async function purgeOneMediaAsset(
  database: DatabaseClient,
  storage: ObjectStoragePort,
): Promise<number> {
  const purge = await claimDueMediaPurge(database.db);
  if (!purge) return 0;
  for (const object of purge.objects) {
    if (object.provider !== storage.provider)
      throw new Error(`Storage provider ${object.provider} is not configured in this worker.`);
    await storage.delete({
      provider: object.provider,
      bucket: object.bucket,
      key: object.objectKey,
    });
  }
  await completeMediaPurge(database.db, purge);
  return 1;
}
