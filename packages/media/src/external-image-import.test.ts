import { expect, it, vi } from 'vitest';

import {
  downloadExternalImage,
  isPublicImportAddress,
  validateExternalImageDestination,
} from './external-image-import.js';

const publicDns = async () => [{ address: '8.8.8.8', family: 4 as const }];

it('rejects local, private, mapped, and mixed DNS destinations', async () => {
  for (const address of ['127.0.0.1', '10.0.0.1', '169.254.169.254', '172.16.0.1',
    '192.168.1.1', '100.64.0.1', '::1', 'fc00::1', '::ffff:127.0.0.1',
    '2001:0000::1', '2002::1', '2001:db8::1']) {
    expect(isPublicImportAddress(address)).toBe(false);
  }
  expect(isPublicImportAddress('8.8.8.8')).toBe(true);
  await expect(validateExternalImageDestination('http://images.example.test/a.jpg', publicDns))
    .rejects.toMatchObject({ code: 'UNSAFE_MEDIA_URL' });
  await expect(validateExternalImageDestination('https://127.0.0.1/a.jpg', publicDns))
    .rejects.toMatchObject({ code: 'UNSAFE_MEDIA_URL' });
  await expect(validateExternalImageDestination('https://images.example.test/a.jpg', async () => [
    { address: '8.8.8.8', family: 4 }, { address: '10.0.0.1', family: 4 },
  ])).rejects.toMatchObject({ code: 'UNSAFE_MEDIA_HOST' });
});

it('revalidates every redirect and pins the validated address used by the request', async () => {
  const resolve = vi.fn(async (host: string) => host === 'safe.example.test'
    ? [{ address: '8.8.8.8', family: 4 as const }]
    : [{ address: '10.0.0.1', family: 4 as const }]);
  const request = vi.fn(async (_url: URL, pinned: { address: string }) => {
    expect(pinned.address).toBe('8.8.8.8');
    return { status: 302, location: 'https://private.example.test/image.jpg' };
  });
  await expect(downloadExternalImage('https://safe.example.test/image.jpg', { resolve, request }))
    .rejects.toMatchObject({ code: 'UNSAFE_MEDIA_HOST' });
  expect(request).toHaveBeenCalledTimes(1);
  expect(resolve).toHaveBeenCalledTimes(2);
  await expect(downloadExternalImage('https://safe.example.test/image.jpg', {
    resolve: publicDns,
    request: async () => ({ status: 302, location: 'http://metadata.example.test/latest' }),
  })).rejects.toMatchObject({ code: 'UNSAFE_MEDIA_URL' });
});

it('requires a bounded image with matching MIME and signature', async () => {
  const valid = Buffer.from([0xff, 0xd8, 0xff, ...Array(20).fill(0)]);
  await expect(downloadExternalImage('https://images.example.test/a.jpg', {
    resolve: publicDns,
    request: async () => ({ status: 200, mimeType: 'image/jpeg', content: valid }),
  })).resolves.toMatchObject({ mimeType: 'image/jpeg', content: valid });
  await expect(downloadExternalImage('https://images.example.test/a.jpg', {
    resolve: publicDns,
    request: async () => ({ status: 200, mimeType: 'image/png', content: valid }),
  })).rejects.toMatchObject({ code: 'MEDIA_CONTENT_INVALID' });
  await expect(downloadExternalImage('https://images.example.test/a.jpg', {
    resolve: publicDns,
    request: async () => ({ status: 200, mimeType: 'image/jpeg', content: valid,
      declaredLength: 10 * 1024 * 1024 + 1 }),
  })).rejects.toMatchObject({ code: 'MEDIA_CONTENT_INVALID' });
});
