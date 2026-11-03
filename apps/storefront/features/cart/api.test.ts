import { afterEach, expect, it, vi } from 'vitest';
import { cartApi } from './api';
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
