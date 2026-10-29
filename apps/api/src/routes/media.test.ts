import { afterEach, expect, it, vi } from 'vitest';
import { Readable } from 'node:stream';

import { deliverObject } from './media.js';

afterEach(() => vi.unstubAllGlobals());

it('never fetches a legacy URL-backed asset during public delivery', async () => {
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  const send = vi.fn();
  const code = vi.fn(() => ({ send }));
  const reply = { code, send, header: vi.fn(), redirect: vi.fn() };
  await deliverObject(reply as never, {} as never, {
    provider: 'url', objectKey: 'https://images.example.test/photo.jpg',
  } as never, true);
  expect(fetch).not.toHaveBeenCalled();
  expect(code).toHaveBeenCalledWith(404);
  expect(send).toHaveBeenCalledWith({
    error: { code: 'NOT_FOUND', message: 'Media was not found.' },
  });
});

it('refuses an original on public delivery even if an upstream lookup returns one', async () => {
  const send = vi.fn();
  const code = vi.fn(() => ({ send }));
  const reply = { code, send, header: vi.fn(), redirect: vi.fn() };
  await deliverObject(reply as never, { provider: 'local', get: vi.fn() } as never, {
    provider: 'local', objectKey: 'original.jpg', mimeType: 'image/jpeg', renditionKey: 'original',
  } as never, true);
  expect(code).toHaveBeenCalledWith(404);
});

it('streams local rendition bytes without calling the buffering storage method', async () => {
  const get = vi.fn();
  const stream = Readable.from([Buffer.from('webp')]);
  const storage = { provider: 'local', get, openRead: vi.fn().mockResolvedValue({ stream, byteSize: 4 }) };
  const reply = { code: vi.fn(), send: vi.fn(), header: vi.fn().mockReturnThis(), redirect: vi.fn() };
  await deliverObject(reply as never, storage as never, {
    provider: 'local', bucket: 'public', objectKey: 'rendition.webp',
    mimeType: 'image/webp', renditionKey: 'thumbnail', originalFilename: 'image.jpg',
  } as never, true);
  expect(get).not.toHaveBeenCalled();
  expect(reply.send).toHaveBeenCalledWith(stream);
});
