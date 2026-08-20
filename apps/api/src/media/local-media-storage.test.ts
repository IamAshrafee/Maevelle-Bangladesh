import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { detectImageMime, LocalMediaStorage } from './local-media-storage.js';

describe('local media storage', () => {
  it('uses signatures rather than an untrusted MIME header and preserves objects atomically', async () => {
    const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0]);
    expect(detectImageMime(png)).toBe('image/png');
    expect(detectImageMime(Buffer.from('<script>alert(1)</script>'))).toBeUndefined();
    const root = await mkdtemp(join(tmpdir(), 'maevelle-media-'));
    try {
      const storage = new LocalMediaStorage(root);
      const stored = await storage.put(png, 'image/png');
      expect(stored.checksumSha256).toMatch(/^[a-f0-9]{64}$/);
      expect(await storage.read(stored.objectKey)).toEqual(png);
      await storage.remove(stored.objectKey);
      expect(await storage.read(stored.objectKey)).toBeUndefined();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
