import { afterEach, expect, it, vi } from 'vitest';
import { cartApi, createCartApi } from './api';
afterEach(() => vi.unstubAllGlobals());
it('Clear sends one DELETE with an exact replay body, UUID key and observed owner; reset sends no authority', async () => {
  const fetch = vi.fn(
    async () => new Response(JSON.stringify({ data: { sessionForgotten: true } }), { status: 200 }),
  );
  vi.stubGlobal('fetch', fetch);
  const intent = {
    key: '11111111-1111-4111-8111-111111111111',
    command: { kind: 'clear' as const },
    version: 3,
    ownerContext: '22222222-2222-4222-8222-222222222222',
    createdAt: 1000,
  };
  await cartApi.mutate(intent);
  await cartApi.mutate(intent);
  const stable = (call: unknown) => {
    const [url, request] = call as [string, RequestInit];
    const rest = { ...request };
    delete rest.signal;
    return [url, rest];
  };
  expect(stable(fetch.mock.calls[0])).toEqual(stable(fetch.mock.calls[1]));
  const [url, request] = fetch.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toBe('/api/storefront/v1/carts/current');
  expect(request.method).toBe('DELETE');
  expect(JSON.parse(request.body as string)).toEqual({
    version: 3,
    ownerContext: intent.ownerContext,
  });
  await cartApi.forgetSession();
  const [reset, options] = fetch.mock.calls[2] as unknown as [string, RequestInit];
  expect(reset).toBe('/api/storefront/v1/carts/session');
  expect(options.body).toBe('{}');
  expect(options.headers).not.toHaveProperty('idempotency-key');
});

it('replays a replacement with the same command body and key', async () => {
  const fetch = vi.fn<(url: string, request: RequestInit) => Promise<Response>>(
    async () => new Response(JSON.stringify({ data: {} }), { status: 200 }),
  );
  vi.stubGlobal('fetch', fetch);
  const intent = {
    key: '11111111-1111-4111-8111-111111111111',
    command: { kind: 'replace' as const, lineId: 'line', targetVariantId: 'target', quantity: '3' },
    version: 5,
    ownerContext: '22222222-2222-4222-8222-222222222222',
    createdAt: 1000,
  };
  await cartApi.mutate(intent);
  await cartApi.mutate(intent);
  const [url, request] = fetch.mock.calls[0]!;
  expect(url).toBe('/api/storefront/v1/carts/current/lines/line/variant');
  expect(request.method).toBe('PUT');
  expect(request.headers).toEqual(fetch.mock.calls[1]![1].headers);
  expect(request.body).toBe(fetch.mock.calls[1]![1].body);
  expect(JSON.parse(String(request.body))).toEqual({
    targetVariantId: 'target',
    quantity: '3',
    version: 5,
    ownerContext: intent.ownerContext,
  });
});

it('submits a Wishlist transfer only to the partitioned account endpoint with an exact body', async () => {
  const fetch = vi.fn<(url: string, request: RequestInit) => Promise<Response>>(
    async () => new Response(JSON.stringify({ data: {} }), { status: 200 }),
  );
  vi.stubGlobal('fetch', fetch);
  const request = {
    action: 'MOVE' as const,
    productId: 'product',
    variantId: 'variant',
    wishlistVersion: 4,
    quantity: '2',
  };
  const intent = {
    key: 'original-key',
    command: { kind: 'wishlist-transfer' as const, request },
    version: 5,
    ownerContext: 'owner-context',
    createdAt: 1000,
  };
  expect(() => cartApi.mutate(intent)).toThrow('Account authority');
  const account = createCartApi('partition-a');
  await account.mutate(intent);
  await account.mutate(intent);
  const [url, first] = fetch.mock.calls[0]!;
  expect(url).toBe('/api/storefront/v1/carts/account/current/wishlist-transfers');
  expect(first.headers).toMatchObject({
    'x-shopper-partition': 'partition-a',
    'idempotency-key': intent.key,
    'x-cart-context': intent.ownerContext,
  });
  expect(JSON.parse(String(first.body))).toEqual({
    ...request,
    version: intent.version,
    ownerContext: intent.ownerContext,
  });
  expect(fetch.mock.calls[1]![1].body).toBe(first.body);
  expect(fetch.mock.calls[1]![1].headers).toEqual(first.headers);
});
