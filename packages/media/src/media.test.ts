import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import { inspectAndProcessImage, validateMediaSignature } from './image-processing.js';
import { LocalObjectStorage } from './local-storage.js';
import { createMediaObjectKey, sha256 } from './storage.js';

describe('Media storage and image processing', () => {
  it('keeps tenant object keys safe and makes identical writes idempotent', async () => {
    const root = await mkdtemp(join(tmpdir(), 'maevelle-media-'));
    const content = Buffer.from('owned media bytes');
    const locator = {
      provider: 'local',
      bucket: 'private',
      key: createMediaObjectKey({
        organizationId: 'organization-1',
        assetId: 'asset-1',
        purpose: 'original',
        extension: 'jpg',
      }),
    } as const;
    try {
      const storage = new LocalObjectStorage(root);
      await storage.put(locator, content, {
        contentType: 'image/jpeg',
        checksumSha256: sha256(content),
      });
      await storage.put(locator, content, {
        contentType: 'image/jpeg',
        checksumSha256: sha256(content),
      });
      expect(await storage.get(locator)).toEqual(content);
      expect(await storage.head(locator)).toMatchObject({
        byteSize: content.length,
        checksumSha256: sha256(content),
      });
      await expect(
        storage.put(locator, Buffer.from('different bytes'), { contentType: 'image/jpeg' }),
      ).rejects.toThrow('different content');
      await expect(
        storage.get({ ...locator, key: 'organizations/x/assets/y/../../outside.jpg' }),
      ).rejects.toThrow('Unsafe media object key');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('decodes a real image and creates privacy-safe WebP renditions without enlargement', async () => {
    const source = await sharp({
      create: { width: 800, height: 1_000, channels: 3, background: '#9f1239' },
    })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();
    const processed = await inspectAndProcessImage(source);
    expect(processed.metadata).toMatchObject({ width: 800, height: 1_000, format: 'jpeg' });
    expect(processed.renditions.map((rendition) => rendition.key)).toEqual([
      'thumbnail',
      'card',
      'pdp',
      'zoom',
    ]);
    for (const rendition of processed.renditions) {
      expect(rendition.mimeType).toBe('image/webp');
      expect(rendition.width).toBeLessThanOrEqual(1_000);
      expect(rendition.height).toBeLessThanOrEqual(1_000);
      expect(rendition.checksumSha256).toMatch(/^[0-9a-f]{64}$/);
      const metadata = await sharp(rendition.content).metadata();
      expect(metadata.exif).toBeUndefined();
    }
  });

  it('validates magic bytes for allowed media formats and rejects invalid signatures', () => {
    const jpeg = Buffer.from([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
    ]);
    const png = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
    ]);
    const pdf = Buffer.from('%PDF-1.7\n%fake-pdf-content');
    const fake = Buffer.from('hello world, this is a plain text file');

    expect(validateMediaSignature(jpeg, 'image/jpeg')).toBe(true);
    expect(validateMediaSignature(jpeg, 'image/png')).toBe(false);
    expect(validateMediaSignature(png, 'image/png')).toBe(true);
    expect(validateMediaSignature(pdf, 'application/pdf')).toBe(true);
    expect(validateMediaSignature(fake, 'image/jpeg')).toBe(false);
    expect(validateMediaSignature(fake, 'image/webp')).toBe(false);
  });
});
