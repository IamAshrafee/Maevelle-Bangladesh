import type { Readable } from 'node:stream';

import { MediaDomainError } from '@maevelle/database/media';
import { InvalidLocalUploadError, type ObjectStoragePort } from '@maevelle/media';

/** A local API proxy never buffers its authorized upload in Fastify or the storage adapter. */
export async function storeLocalMediaUpload(
  storage: ObjectStoragePort,
  body: unknown,
  session: {
    provider: string; bucket: string; objectKey: string;
    declaredByteSize: number; declaredMimeType: string;
  },
  expectedChecksumSha256?: string,
): Promise<{ byteSize: number; checksumSha256: string }> {
  if (!storage.putStream || !body || typeof (body as Readable).pipe !== 'function')
    throw new MediaDomainError('VALIDATION_FAILED', 'A streamed upload body is required.');
  try {
    return await storage.putStream(
      { provider: session.provider, bucket: session.bucket, key: session.objectKey },
      body as Readable,
      {
        expectedByteSize: session.declaredByteSize,
        mimeType: session.declaredMimeType,
        ...(expectedChecksumSha256 ? { expectedChecksumSha256 } : {}),
      },
    );
  } catch (error) {
    if (error instanceof InvalidLocalUploadError)
      throw new MediaDomainError('VALIDATION_FAILED', error.message);
    throw error;
  }
}
