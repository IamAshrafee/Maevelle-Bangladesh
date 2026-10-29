import { expect, it, vi } from 'vitest';

import type { ObjectStoragePort } from '@maevelle/media';

import { inspectMediaStoragePage, type StorageInventoryItem } from './media-health.js';

it('counts only present objects with matching byte sizes as verified', async () => {
  const probe = vi.fn(async ({ key }: { key: string }) => {
    if (key === 'missing') return undefined;
    return { byteSize: key === 'wrong-size' ? 9 : 10 };
  });
  const storage = { provider: 'local', probe } as unknown as ObjectStoragePort;
  const items: StorageInventoryItem[] = [
    {
      assetId: '1',
      kind: 'ORIGINAL',
      provider: 'local',
      bucket: 'private',
      objectKey: 'good',
      byteSize: 10,
    },
    {
      assetId: '2',
      kind: 'RENDITION',
      provider: 'local',
      bucket: 'private',
      objectKey: 'missing',
      byteSize: 10,
    },
    {
      assetId: '3',
      kind: 'RENDITION',
      provider: 'local',
      bucket: 'private',
      objectKey: 'wrong-size',
      byteSize: 10,
    },
    {
      assetId: '4',
      kind: 'ORIGINAL',
      provider: 'url',
      bucket: '',
      objectKey: 'https://example.test/image',
      byteSize: 10,
    },
    {
      assetId: '5',
      kind: 'ORIGINAL',
      provider: 's3',
      bucket: 'private',
      objectKey: 'different-provider',
      byteSize: 10,
    },
  ];

  const result = await inspectMediaStoragePage(storage, items);
  expect(result.verifiedObjectCount).toBe(1);
  expect(result.issues.map((issue) => issue.code)).toEqual([
    'MISSING_STORED_OBJECT',
    'STORED_OBJECT_SIZE_MISMATCH',
    'EXTERNAL_OBJECT_NOT_VERIFIED',
    'PROVIDER_NOT_CONFIGURED',
  ]);
  expect(probe).toHaveBeenCalledTimes(3);
});

it('limits concurrent storage probes to twenty', async () => {
  let active = 0;
  let maximum = 0;
  const storage = {
    provider: 'local',
    probe: vi.fn(async () => {
      active += 1;
      maximum = Math.max(maximum, active);
      await new Promise((resolve) => setTimeout(resolve, 1));
      active -= 1;
      return { byteSize: 10 };
    }),
  } as unknown as ObjectStoragePort;
  const items: StorageInventoryItem[] = Array.from({ length: 45 }, (_, index) => ({
    assetId: String(index),
    kind: 'ORIGINAL',
    provider: 'local',
    bucket: 'private',
    objectKey: String(index),
    byteSize: 10,
  }));
  const result = await inspectMediaStoragePage(storage, items);
  expect(result.verifiedObjectCount).toBe(45);
  expect(maximum).toBeLessThanOrEqual(20);
});
