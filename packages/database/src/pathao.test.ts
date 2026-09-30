import { afterAll, describe, expect, it, vi } from 'vitest';
import { sql } from 'kysely';

import type { CourierBookingRequest } from '@maevelle/core';

import { createDatabase } from './index.js';
import {
  checkPathaoConnection,
  configurePathaoAccount,
  createPathaoProvider,
  getPathaoConfigurations,
  listPathaoStores,
  normalizePathaoStatus,
  setPathaoAccountStatus,
  syncPathaoStores,
} from './pathao.js';
import {
  getCustomerDeliveryHistory,
  normalizeBangladeshCustomerPhone,
} from './delivery-intelligence.js';
import { createOrganization } from './platform.js';

const database = createDatabase({
  connectionString: process.env.TEST_DATABASE_URL!,
  maxConnections: 8,
});
afterAll(async () => database.close());

const encryptionKey = { id: 'pathao-test-key', value: Buffer.alloc(32, 7) };

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('Pathao courier adapter', () => {
  it('encrypts credentials, caches and refreshes tokens, syncs Stores, quotes, books, and tracks', async () => {
    const organization = await createOrganization(database.db, {
      code: `pathao-${crypto.randomUUID().slice(0, 10)}`,
      displayName: 'Pathao adapter test',
      timezone: 'Asia/Dhaka',
      defaultLocale: 'en',
      defaultCurrency: 'BDT',
    });
    const actorId = crypto.randomUUID();
    let tokenCalls = 0;
    let storeRevision = 1;
    const tokenGrants: string[] = [];
    const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/aladdin/api/v1/issue-token')) {
        tokenCalls += 1;
        const body = JSON.parse(String(init?.body)) as { grant_type: string };
        tokenGrants.push(body.grant_type);
        return json({
          data: {
            access_token: `access-${tokenCalls}`,
            refresh_token: `refresh-${tokenCalls}`,
            token_type: 'Bearer',
            expires_in: 3600,
          },
        });
      }
      expect(new Headers(init?.headers).get('authorization')).toMatch(/^Bearer access-\d+$/);
      if (url.endsWith('/aladdin/api/v1/stores'))
        return json({
          data: {
            data:
              storeRevision === 1
                ? [{ store_id: 101, store_name: 'Dhaka Store', is_default_store: true }]
                : [
                    { store_id: 101, store_name: 'Dhaka Store', is_default_store: false },
                    { store_id: 202, store_name: 'Chattogram Store', is_default_store: true },
                  ],
          },
        });
      if (url.endsWith('/aladdin/api/v1/merchant/price-plan'))
        return json({ data: { price: 110, cod_fee: 10, final_price: 120 } });
      if (url.endsWith('/aladdin/api/v1/orders') && init?.method === 'POST')
        return json({
          data: { consignment_id: 'DX-1001', order_status: 'Pending', delivery_fee: 120 },
        });
      if (url.endsWith('/aladdin/api/v1/orders/DX-1001/cancel') && init?.method === 'POST')
        return json({ data: { message: 'Order Cancelled' } });
      if (url.endsWith('/aladdin/api/v1/orders/DX-1001/info'))
        return json({
          data: {
            order_status: 'Delivered',
            updated_at: '2026-09-25T10:30:00.000Z',
            order_history: [
              { status: 'Pending', time: '2026-09-25T08:00:00.000Z' },
              { status: 'In Transit', time: '2026-09-25T09:15:00.000Z' },
              { status: 'Delivered', time: '2026-09-25T10:30:00.000Z' },
            ],
          },
        });
      return json({ message: 'Unexpected request' }, 404);
    }) as typeof fetch;

    const configured = await configurePathaoAccount(database.db, {
      organizationId: organization.id,
      actorId,
      name: 'Primary Pathao',
      environment: 'SANDBOX',
      defaultDeliveryService: 'NORMAL',
      defaultItemType: 'PARCEL',
      credentials: {
        clientId: 'client-id-secret',
        clientSecret: 'client-secret-value',
        username: 'merchant@example.com',
        password: 'merchant-password',
        webhookSecret: 'test-webhook-secret-123',
      },
      encryptionKey,
    });

    const safe = await getPathaoConfigurations(database.db, organization.id);
    expect(safe).toEqual([
      expect.objectContaining({
        accountId: configured.accountId,
        environment: 'SANDBOX',
        hasCredentials: true,
        hasWebhookSecret: true,
      }),
    ]);
    expect(JSON.stringify(safe)).not.toContain('client-secret-value');
    const stored = await sql<{ secret_ciphertext: string }>`select secret_ciphertext
      from integrations.provider_credentials where integration_account_id=${configured.accountId}`.execute(
      database.db,
    );
    expect(stored.rows[0]!.secret_ciphertext).not.toContain('merchant-password');

    await checkPathaoConnection(database.db, {
      organizationId: organization.id,
      accountId: configured.accountId,
      encryptionKey,
      fetcher,
    });
    await syncPathaoStores(database.db, {
      organizationId: organization.id,
      accountId: configured.accountId,
      encryptionKey,
      fetcher,
    });
    expect(tokenCalls).toBe(1);
    expect((await listPathaoStores(database.db, organization.id, configured.accountId))[0]).toEqual(
      expect.objectContaining({ externalStoreId: '101', isDefault: true }),
    );

    storeRevision = 2;
    await syncPathaoStores(database.db, {
      organizationId: organization.id,
      accountId: configured.accountId,
      encryptionKey,
      fetcher,
    });
    expect(
      (await listPathaoStores(database.db, organization.id, configured.accountId)).filter(
        (store) => store.isDefault,
      ),
    ).toEqual([expect.objectContaining({ externalStoreId: '202' })]);

    const provider = await createPathaoProvider(database.db, {
      organizationId: organization.id,
      accountId: configured.accountId,
      encryptionKey,
      fetcher,
    });
    const request: CourierBookingRequest = {
      deliveryId: crypto.randomUUID(),
      merchantReference: 'DLV-TEST-1001',
      pickup: { locationId: crypto.randomUUID(), providerLocationId: '202' },
      recipient: {
        name: 'Pathao Customer',
        phone: '+8801700000000',
        address: 'Dhanmondi, Dhaka, Bangladesh',
      },
      cod: { required: true, expectedAmount: '1290.0000', currency: 'BDT' },
      packages: [{ packageNumber: 1, weight: { value: '1.5', unit: 'KG' } }],
      contents: { quantity: 2, description: 'MV-ONE x2' },
    };
    expect(await provider.quote!(request)).toMatchObject({
      amount: '120.0000',
      baseAmount: '110.0000',
      codFeeAmount: '10.0000',
    });
    expect(await provider.checkServiceability!({ district: 'Dhaka', city: 'Dhaka' })).toEqual({
      serviceable: true,
    });
    expect(await provider.checkServiceability!({})).toEqual({
      serviceable: false,
      reasonCode: 'DESTINATION_REQUIRED',
    });
    expect(await provider.createBooking(request)).toMatchObject({
      kind: 'BOOKED',
      providerBookingId: 'DX-1001',
      charge: { amount: '120.0000', basis: 'ACTUAL' },
    });
    const tracking = await provider.getBooking!('DX-1001');
    expect(tracking).toMatchObject({
      providerBookingId: 'DX-1001',
      providerStatus: 'Delivered',
    });
    expect(tracking.events).toHaveLength(3);
    expect(tracking.events[0]).toMatchObject({ normalizedStatus: 'BOOKED' });
    expect(tracking.events[1]).toMatchObject({ normalizedStatus: 'IN_TRANSIT' });
    expect(tracking.events[2]).toMatchObject({ normalizedStatus: 'DELIVERED' });

    expect(await provider.cancelBooking!('DX-1001')).toEqual({ kind: 'CANCELLED' });

    await sql`update integrations.oauth_token_states set expires_at=now()-interval '1 minute'
      where integration_account_id=${configured.accountId}`.execute(database.db);
    await Promise.all([provider.quote!(request), provider.quote!(request)]);
    expect(tokenCalls).toBe(2);
    expect(tokenGrants).toEqual(['password', 'refresh_token']);

    await configurePathaoAccount(database.db, {
      organizationId: organization.id,
      actorId,
      accountId: configured.accountId,
      name: 'Primary Pathao',
      environment: 'PRODUCTION',
      defaultDeliveryService: 'NORMAL',
      defaultItemType: 'PARCEL',
      credentials: {
        clientId: 'production-client',
        clientSecret: 'production-secret',
        username: 'production@example.com',
        password: 'production-password',
      },
      encryptionKey,
    });
    expect(await listPathaoStores(database.db, organization.id, configured.accountId)).toEqual([]);
    expect(
      (
        await sql<{ count: string }>`select count(*)::text as count
          from integrations.oauth_token_states where integration_account_id=${configured.accountId}`.execute(
          database.db,
        )
      ).rows[0]!.count,
    ).toBe('0');
    await setPathaoAccountStatus(database.db, {
      organizationId: organization.id,
      actorId,
      accountId: configured.accountId,
      status: 'DISABLED',
    });
    expect((await getPathaoConfigurations(database.db, organization.id))[0]?.status).toBe(
      'DISABLED',
    );
  });

  it('maps only known provider statuses and rejects arbitrary guesses', () => {
    expect(normalizePathaoStatus('out for delivery')).toBe('OUT_FOR_DELIVERY');
    expect(normalizePathaoStatus('Accepted')).toBe('BOOKED');
    expect(normalizePathaoStatus('Sorting Hub')).toBe('IN_TRANSIT');
    expect(normalizePathaoStatus('Partially Delivered')).toBe('DELIVERED');
    expect(normalizePathaoStatus('On Hold')).toBe('ATTEMPT_FAILED');
    expect(normalizePathaoStatus('RTO')).toBe('RTO_INITIATED');
    expect(normalizePathaoStatus('Order Cancelled')).toBe('CANCELLED');
    expect(normalizePathaoStatus('a future Pathao state')).toBeUndefined();
  });

  it('normalizes Bangladesh mobile phone numbers consistently', () => {
    expect(normalizeBangladeshCustomerPhone('+8801712345678')).toBe('01712345678');
    expect(normalizeBangladeshCustomerPhone('8801812345678')).toBe('01812345678');
    expect(normalizeBangladeshCustomerPhone('01912345678')).toBe('01912345678');
    expect(normalizeBangladeshCustomerPhone('01712-345678')).toBe('01712345678');
  });

  it('queries customer delivery history by phone with explainable risk indicators', async () => {
    const organization = await createOrganization(database.db, {
      code: `intel-${crypto.randomUUID().slice(0, 10)}`,
      displayName: 'Delivery Intelligence Test',
      timezone: 'Asia/Dhaka',
      defaultLocale: 'en',
      defaultCurrency: 'BDT',
    });
    const history = await getCustomerDeliveryHistory(database.db, {
      organizationId: organization.id,
      phone: '+8801711223344',
    });
    expect(history).toMatchObject({
      totalDeliveries: 0,
      eligibleDeliveries: 0,
      deliveredCount: 0,
      failedDeliveryCount: 0,
      rtoCount: 0,
      risk: {
        level: 'INSUFFICIENT_HISTORY',
      },
    });
    expect(history.risk.reasons[0]?.code).toBe('INSUFFICIENT_HISTORY');
  });
});
