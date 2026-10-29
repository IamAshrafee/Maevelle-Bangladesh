import type { ObjectStoragePort } from '@maevelle/media';

export interface StorageInventoryItem {
  readonly assetId: string;
  readonly kind: 'ORIGINAL' | 'RENDITION';
  readonly provider: string;
  readonly bucket: string;
  readonly objectKey: string;
  readonly byteSize: number;
}

export interface StorageHealthIssue {
  readonly code:
    | 'MISSING_STORED_OBJECT'
    | 'STORED_OBJECT_SIZE_MISMATCH'
    | 'PROVIDER_NOT_CONFIGURED'
    | 'EXTERNAL_OBJECT_NOT_VERIFIED';
  readonly assetId: string;
  readonly detail: string;
}

/** Bound storage I/O while retaining exact counts even when issue details are capped by the API. */
export async function inspectMediaStoragePage(
  storage: ObjectStoragePort,
  items: readonly StorageInventoryItem[],
): Promise<{ verifiedObjectCount: number; issues: readonly StorageHealthIssue[] }> {
  const issues: StorageHealthIssue[] = [];
  let verifiedObjectCount = 0;
  for (let offset = 0; offset < items.length; offset += 20) {
    const inspected = await Promise.all(
      items.slice(offset, offset + 20).map(async (object) => {
        if (object.provider === 'url')
          return {
            code: 'EXTERNAL_OBJECT_NOT_VERIFIED' as const,
            assetId: object.assetId,
            detail: `${object.kind} is an external URL and was not checked by Maevelle storage.`,
          };
        if (object.provider !== storage.provider)
          return {
            code: 'PROVIDER_NOT_CONFIGURED' as const,
            assetId: object.assetId,
            detail: `${object.kind} uses unconfigured provider ${object.provider}.`,
          };
        const found = await storage.probe({
          provider: object.provider,
          bucket: object.bucket,
          key: object.objectKey,
        });
        if (!found)
          return {
            code: 'MISSING_STORED_OBJECT' as const,
            assetId: object.assetId,
            detail: `${object.kind} object is missing from storage.`,
          };
        if (found.byteSize !== object.byteSize)
          return {
            code: 'STORED_OBJECT_SIZE_MISMATCH' as const,
            assetId: object.assetId,
            detail: `${object.kind} is ${found.byteSize} bytes in storage; ${object.byteSize} bytes are recorded.`,
          };
        verifiedObjectCount += 1;
        return undefined;
      }),
    );
    issues.push(...inspected.filter((issue) => issue !== undefined));
  }
  return { verifiedObjectCount, issues };
}
