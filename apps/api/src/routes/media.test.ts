import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchExternalImage } from './media.js';

describe('external media delivery', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('loads an approved remote image server-side instead of redirecting the browser to it', async () => {
    const image = Buffer.from('jpeg-content');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(image, {
          status: 200,
          headers: { 'content-type': 'image/jpeg', 'content-length': String(image.length) },
        }),
      ),
    );

    await expect(fetchExternalImage('https://global-img-cdn.1688.com/example.jpg')).resolves.toEqual({
      content: image,
      mimeType: 'image/jpeg',
    });
  });

  it('does not request non-HTTPS remote media sources', async () => {
    const request = vi.fn();
    vi.stubGlobal('fetch', request);

    await expect(fetchExternalImage('http://global-img-cdn.1688.com/example.jpg')).resolves.toBeNull();
    expect(request).not.toHaveBeenCalled();
  });
});
