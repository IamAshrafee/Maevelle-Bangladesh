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
      if (url.endsWith('/aladdin/api/v1/orders/DX-1001/info'))
        return json({
          data: { order_status: 'Delivered', updated_at: '2026-09-25T10:30:00.000Z' },
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
      },
      encryptionKey,
    });

    const safe = await getPathaoConfigurations(database.db, organization.id);
    expect(safe).toEqual([
      expect.objectContaining({
        accountId: configured.accountId,
        environment: 'SANDBOX',
        hasCredentials: true,
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
    expect(await provider.createBooking(request)).toMatchObject({
      kind: 'BOOKED',
      providerBookingId: 'DX-1001',
      charge: { amount: '120.0000', basis: 'ACTUAL' },
    });
    expect(await provider.getBooking!('DX-1001')).toMatchObject({
      providerBookingId: 'DX-1001',
      events: [{ normalizedStatus: 'DELIVERED' }],
    });

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
    expect(normalizePathaoStatus('a future Pathao state')).toBeUndefined();
  });
});
