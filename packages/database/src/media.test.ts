import { afterAll, describe, expect, it } from 'vitest';

import { createDatabase } from './index.js';
import { findMediaAsset, registerUploadedMedia } from './media.js';
import { createOrganization } from './platform.js';

const database = createDatabase({
  connectionString: process.env.TEST_DATABASE_URL!,
  maxConnections: 4,
});
afterAll(async () => database.close());

describe('media tenant ownership', () => {
  it('registers ready object metadata only under the owning organization', async () => {
    const owner = await createOrganization(database.db, {
      code: `media-${crypto.randomUUID().slice(0, 10)}`,
      displayName: 'Media owner',
      timezone: 'UTC',
      defaultLocale: 'en',
      defaultCurrency: 'USD',
    });
    const other = await createOrganization(database.db, {
      code: `media-other-${crypto.randomUUID().slice(0, 8)}`,
      displayName: 'Other',
      timezone: 'UTC',
      defaultLocale: 'en',
      defaultCurrency: 'USD',
    });
    const asset = await registerUploadedMedia(database.db, {
      organizationId: owner.id,
      objectKey: `images/${crypto.randomUUID()}.png`,
      mimeType: 'image/png',
      byteSize: 12,
      checksumSha256: 'a'.repeat(64),
      visibility: 'PUBLIC',
    });
    expect(await findMediaAsset(database.db, asset.id, owner.id)).toMatchObject({
      id: asset.id,
      visibility: 'PUBLIC',
      status: 'READY',
    });
    expect(await findMediaAsset(database.db, asset.id, other.id)).toBeUndefined();
  });
});
