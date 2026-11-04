import { afterEach, describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { CheckoutDeliveryStateDto } from '@maevelle/contracts';
import { deliveryApi, deliveryInput } from './delivery-api';
import { DeliveryFields, validateDelivery } from './components/delivery-fields';

const id = () => crypto.randomUUID();
const contact = () => ({
  recipientName: 'বাংলা নাম',
  mobile: '০১৭১২৩৪৫৬৭৮',
  geographyNodeId: id(),
  addressLine1: 'গ্রাম, বাড়ি ১২',
  addressLine2: null,
  instructions: null,
});
function state(draftId: string): CheckoutDeliveryStateDto {
  return {
    draftId,
    draftStatus: 'ACTIVE',
    expiresAt: new Date(Date.now() + 3600000).toISOString(),
    revision: '9007199254740993',
    delivery: { ...contact(), countryCode: 'BD' },
    savedAddress: null,
    eligibility: {
      status: 'ELIGIBLE',
      configurationRevision: 'opaque',
      tariff: { ruleId: id(), revision: '2', amount: '0.0000', currency: 'BDT', final: false },
      courierCompatibility: 'NOT_EVALUATED',
    },
    configurationChanged: false,
    reviewRequired: false,
    purchaseAvailable: false,
    quoteAvailable: false,
  };
}
function response(value: unknown) {
  const fetch = vi.fn(
    async () =>
      new Response(JSON.stringify({ data: value }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
  );
  vi.stubGlobal('fetch', fetch);
  return fetch;
}
afterEach(() => vi.unstubAllGlobals());
describe('Phase 02A delivery adapter and shared field semantics', () => {
  it('uses cookie credentials, owner headers and no-store without putting private contact in URLs', async () => {
    const draftId = id(),
      fetch = response(state(draftId));
    const value = await deliveryApi.read(
      draftId,
      { kind: 'GUEST', context: id() },
      new AbortController().signal,
    );
    expect(value.eligibility?.tariff?.amount).toBe('0.0000');
    const [path, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(path).not.toContain(value.delivery!.recipientName);
    expect(init).toMatchObject({ credentials: 'include', cache: 'no-store' });
    expect(init.headers).toHaveProperty('x-checkout-context');
  });
  it('rejects a fabricated purchase/quote success and malformed missing private state', async () => {
    const draftId = id();
    response({ ...state(draftId), purchaseAvailable: true });
    await expect(
      deliveryApi.read(
        draftId,
        { kind: 'ACCOUNT', partition: 'A'.repeat(43) },
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
    response({ ...state(draftId), delivery: undefined });
    await expect(
      deliveryApi.read(
        draftId,
        { kind: 'ACCOUNT', partition: 'A'.repeat(43) },
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });
  it('refuses guest address-book requests before transport and bounds account pages', async () => {
    const fetch = response({ items: [], nextOffset: null });
    await expect(
      deliveryApi.addresses({ kind: 'GUEST', context: id() }, 0, new AbortController().signal),
    ).rejects.toMatchObject({ status: 401 });
    expect(fetch).not.toHaveBeenCalled();
    response({ items: Array.from({ length: 21 }, () => ({ id: id() })), nextOffset: 20 });
    await expect(
      deliveryApi.addresses(
        { kind: 'ACCOUNT', partition: 'A'.repeat(43) },
        0,
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' });
  });
  it('encodes bounded real reference searches and rejects malformed locations', async () => {
    const fetch = response({
      items: [
        {
          id: id(),
          name: 'Synthetic',
          localName: 'পরীক্ষা',
          nodeType: 'LOCALITY',
          parentName: 'Synthetic parent',
        },
      ],
      nextOffset: 20,
    });
    await deliveryApi.search('পরীক্ষা', 0, new AbortController().signal);
    const [path] = fetch.mock.calls[0] as unknown as [string];
    expect(new URL(path, 'http://localhost').searchParams.get('query')).toBe('পরীক্ষা');
    response({ items: [{ id: 'not-a-location' }], nextOffset: null });
    await expect(deliveryApi.search('Test', 0, new AbortController().signal)).rejects.toMatchObject(
      { code: 'INVALID_RESPONSE' },
    );
  });
  it('renders one minimal labeled form surface and lets the server validate Bangla mobile syntax', () => {
    const value = contact();
    expect(validateDelivery(value)).toEqual({});
    const html = renderToStaticMarkup(
      <DeliveryFields prefix="test" value={value} onChange={() => undefined} />,
    );
    expect(html).toMatch(/autocomplete="shipping name"/i);
    expect(html).toContain('inputMode="tel"');
    expect(html).toContain('role="combobox"');
    expect(html).toContain('aria-required="true"');
    expect(html).not.toMatch(/type="email"|pattern=|billing|secondPhone/);
  });
  it('validates required fields and Unicode bounds without an ASCII-only name rule', () => {
    expect(
      validateDelivery({ ...contact(), recipientName: '', geographyNodeId: '' }),
    ).toHaveProperty('recipientName');
    expect(validateDelivery({ ...contact(), addressLine1: 'a'.repeat(501) })).toHaveProperty(
      'addressLine1',
    );
    expect(validateDelivery({ ...contact(), recipientName: 'O’Connor · মোঃ' })).toEqual({});
    expect(Object.keys(deliveryInput(contact()))).toEqual([
      'recipientName',
      'mobile',
      'geographyNodeId',
      'addressLine1',
      'addressLine2',
      'instructions',
    ]);
  });
});
