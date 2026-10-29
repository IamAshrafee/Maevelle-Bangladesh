import { expect, it, vi } from 'vitest';

import type { DatabaseClient } from '@maevelle/database';
import type { ObjectStoragePort } from '@maevelle/media';

const purge = vi.hoisted(() => ({
  claim: vi.fn(),
  complete: vi.fn(),
  fail: vi.fn(),
}));

vi.mock('@maevelle/database/media', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  claimDueMediaPurge: purge.claim,
  completeMediaPurge: purge.complete,
  failMediaPurge: purge.fail,
}));

import { purgeOneMediaAsset } from './media-jobs.js';

it('records a failed deletion so the claimed purge can retry', async () => {
  const claim = {
    organizationId: crypto.randomUUID(), assetId: crypto.randomUUID(),
    claimToken: crypto.randomUUID(), attempt: 2,
    objects: [{ provider: 'local', bucket: 'private', objectKey: 'original' }],
  };
  purge.claim.mockResolvedValueOnce(claim);
  purge.fail.mockResolvedValueOnce(undefined);
  const storage = {
    provider: 'local',
    delete: vi.fn().mockRejectedValueOnce(new Error('Simulated storage outage')),
  } as unknown as ObjectStoragePort;

  await expect(purgeOneMediaAsset({ db: {} } as DatabaseClient, storage))
    .rejects.toThrow('Simulated storage outage');
  expect(purge.fail).toHaveBeenCalledWith({}, {
    ...claim, error: 'Simulated storage outage',
  });
  expect(purge.complete).not.toHaveBeenCalled();
});

it('records a failed final database step after file deletion', async () => {
  purge.claim.mockResolvedValueOnce({
    organizationId: crypto.randomUUID(), assetId: crypto.randomUUID(),
    claimToken: crypto.randomUUID(), attempt: 1,
    objects: [{ provider: 'local', bucket: 'private', objectKey: 'original' }],
  });
  purge.complete.mockRejectedValueOnce(new Error('Finalization failed'));
  purge.fail.mockResolvedValueOnce(undefined);
  const storage = {
    provider: 'local', delete: vi.fn().mockResolvedValue(undefined),
  } as unknown as ObjectStoragePort;

  await expect(purgeOneMediaAsset({ db: {} } as DatabaseClient, storage))
    .rejects.toThrow('Finalization failed');
  expect(storage.delete).toHaveBeenCalledOnce();
  expect(purge.fail).toHaveBeenLastCalledWith({}, expect.objectContaining({
    attempt: 1, error: 'Finalization failed',
  }));
});
