import { afterEach, expect, it, vi } from 'vitest';

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
