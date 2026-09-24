import { afterAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { createDatabase } from './index.js';
import { createOrganization } from './platform.js';
import {
  createCustomer,
  updateCustomer,
  getCustomerDetail,
  addCustomerPhone,
  addCustomerAddress,
  removeCustomerAddress,
  resolveOrCreateOrderCustomer,
  mergeCustomers,
  anonymizeCustomer,
} from './customers.js';

const database = createDatabase({
  connectionString: process.env.TEST_DATABASE_URL!,
  maxConnections: 10,
});
afterAll(async () => database.close());

async function fixture() {
  const organization = await createOrganization(database.db, {
    code: `cust-${crypto.randomUUID().slice(0, 12)}`,
    displayName: 'Cust test',
    timezone: 'UTC',
    defaultLocale: 'en',
    defaultCurrency: 'BDT',
  });
  const actorId = crypto.randomUUID();
  return { organizationId: organization.id, actorId };
}

describe('Customers Domain', () => {
  it('creates and retrieves a customer', async () => {
    const { organizationId, actorId } = await fixture();
    const customer = await createCustomer(database.db, {
      organizationId,
      actorId,
      displayName: 'Test Customer',
    });

    expect(customer.id).toBeDefined();

    const fetched = await getCustomerDetail(database.db, organizationId, customer.id);

    expect(fetched.displayName).toBe('Test Customer');
    expect(fetched.status).toBe('ACTIVE');
  });

  it('adds and removes a customer address successfully', async () => {
    const { organizationId, actorId } = await fixture();
    const customer = await createCustomer(database.db, {
      organizationId,
      actorId,
      displayName: 'Address Customer',
    });

    const addressId = await addCustomerAddress(database.db, {
      organizationId,
      actorId,
      customerId: customer.id,
      recipientName: 'Test Recipient',
      addressLine1: 'Test Address 1',
      countryCode: 'BD',
      city: 'Dhaka',
      isDefault: true,
    });

    expect(addressId).toBeDefined();

    const fetched = await getCustomerDetail(database.db, organizationId, customer.id);

    expect(fetched.addresses).toHaveLength(1);
    expect(fetched.addresses[0]?.addressLine1).toBe('Test Address 1');

    await removeCustomerAddress(database.db, {
      organizationId,
      actorId,
      customerId: customer.id,
      addressId: addressId.id,
    });

    const fetchedAfterRemove = await getCustomerDetail(database.db, organizationId, customer.id);

    // Removed address check
    expect(fetchedAfterRemove.addresses).toHaveLength(0);
  });

  it('prevents direct manual update to MERGED status', async () => {
    const { organizationId, actorId } = await fixture();
    const customer = await createCustomer(database.db, {
      organizationId,
      actorId,
      displayName: 'To Merge',
    });

    await expect(
      updateCustomer(database.db, {
        organizationId,
        actorId,
        customerId: customer.id,
        expectedVersion: customer.version,
        status: 'MERGED' as 'ACTIVE',
      }),
    ).rejects.toThrow('customers_check');
  });

  it('canonicalizes Bangladesh phones and reuses one strong order identity match', async () => {
    const { organizationId, actorId } = await fixture();
    const customer = await createCustomer(database.db, {
      organizationId,
      actorId,
      displayName: 'Nusrat Jahan',
      phone: '01712 345678',
      source: 'ADMIN_CREATED',
    });

    const detail = await getCustomerDetail(database.db, organizationId, customer.id);
    expect(detail.phones[0]?.normalizedPhone).toBe('+8801712345678');

    const resolution = await resolveOrCreateOrderCustomer(database.db, {
      organizationId,
      actorId,
      actorType: 'GUEST_CHECKOUT',
      displayName: '  Nusrat   Jahan ',
      phone: '+880 1712-345678',
      source: 'STOREFRONT',
    });
    expect(resolution).toEqual({ customerId: customer.id, created: false });

    await expect(
      addCustomerPhone(database.db, {
        organizationId,
        actorId,
        customerId: customer.id,
        phone: '+8801712345678',
      }),
    ).rejects.toThrow('already belongs to the customer');
  });

  it('serializes concurrent first-time resolution for the same phone identity', async () => {
    const { organizationId, actorId } = await fixture();
    const resolve = () =>
      resolveOrCreateOrderCustomer(database.db, {
        organizationId,
        actorId,
        actorType: 'GUEST_CHECKOUT',
        displayName: 'Concurrent Customer',
        phone: '01812 345678',
        source: 'STOREFRONT',
      });

    const results = await Promise.all([resolve(), resolve()]);

    expect(new Set(results.map((result) => result.customerId)).size).toBe(1);
    expect(results.map((result) => result.created).sort()).toEqual([false, true]);
  });

  it('does not mutate a customer child record through another organization', async () => {
    const owner = await fixture();
    const other = await fixture();
    const customer = await createCustomer(database.db, {
      organizationId: owner.organizationId,
      actorId: owner.actorId,
      displayName: 'Tenant-owned Customer',
    });
    const address = await addCustomerAddress(database.db, {
      organizationId: owner.organizationId,
      actorId: owner.actorId,
      customerId: customer.id,
      recipientName: 'Tenant Owner',
      addressLine1: 'Dhaka',
      countryCode: 'BD',
    });

    await removeCustomerAddress(database.db, {
      organizationId: other.organizationId,
      actorId: other.actorId,
      customerId: customer.id,
      addressId: address.id,
    });
    await expect(
      addCustomerPhone(database.db, {
        organizationId: other.organizationId,
        actorId: other.actorId,
        customerId: customer.id,
        phone: '01712345678',
      }),
    ).rejects.toThrow('Customer was not found');

    const detail = await getCustomerDetail(database.db, owner.organizationId, customer.id);
    expect(detail.addresses).toHaveLength(1);
    expect(detail.addresses[0]?.id).toBe(address.id);
  });

  it('merges duplicate profiles into one canonical customer and replays safely', async () => {
    const { organizationId, actorId } = await fixture();
    const source = await createCustomer(database.db, {
      organizationId,
      actorId,
      displayName: 'Duplicate Nusrat',
      phone: '01712 345678',
      source: 'FACEBOOK',
    });
    const target = await createCustomer(database.db, {
      organizationId,
      actorId,
      displayName: 'Nusrat Jahan',
      phone: '01812 345678',
      email: 'nusrat@example.com',
      source: 'ADMIN_CREATED',
    });
    await addCustomerAddress(database.db, {
      organizationId,
      actorId,
      customerId: source.id,
      recipientName: 'Nusrat',
      addressLine1: 'Dhanmondi',
      countryCode: 'BD',
      isDefault: true,
    });
    const sourceDetail = await getCustomerDetail(database.db, organizationId, source.id);
    const targetDetail = await getCustomerDetail(database.db, organizationId, target.id);
    const key = crypto.randomUUID();

    const merged = await mergeCustomers(database.db, {
      organizationId,
      actorId,
      sourceCustomerId: source.id,
      targetCustomerId: target.id,
      sourceExpectedVersion: sourceDetail.version,
      targetExpectedVersion: targetDetail.version,
      reason: 'Confirmed duplicate customer after phone verification.',
      idempotencyKey: key,
    });

    expect(merged.id).toBe(target.id);
    expect(merged.phones.map((phone) => phone.normalizedPhone).sort()).toEqual([
      '+8801712345678',
      '+8801812345678',
    ]);
    expect(merged.addresses).toHaveLength(1);
    const alias = await getCustomerDetail(database.db, organizationId, source.id);
    expect(alias).toMatchObject({ status: 'MERGED', canonicalCustomerId: target.id });

    const replay = await mergeCustomers(database.db, {
      organizationId,
      actorId,
      sourceCustomerId: source.id,
      targetCustomerId: target.id,
      sourceExpectedVersion: sourceDetail.version,
      targetExpectedVersion: targetDetail.version,
      reason: 'Confirmed duplicate customer after phone verification.',
      idempotencyKey: key,
    });
    expect(replay.id).toBe(target.id);
  });

  it('anonymizes current profile PII and merged alias names while retaining evidence', async () => {
    const { organizationId, actorId } = await fixture();
    const source = await createCustomer(database.db, {
      organizationId,
      actorId,
      displayName: 'Alias Personal Name',
      phone: '01612 345678',
    });
    const canonical = await createCustomer(database.db, {
      organizationId,
      actorId,
      displayName: 'Canonical Personal Name',
      phone: '01912 345678',
      email: 'private@example.com',
    });
    const sourceDetail = await getCustomerDetail(database.db, organizationId, source.id);
    const canonicalDetail = await getCustomerDetail(database.db, organizationId, canonical.id);
    const merged = await mergeCustomers(database.db, {
      organizationId,
      actorId,
      sourceCustomerId: source.id,
      targetCustomerId: canonical.id,
      sourceExpectedVersion: sourceDetail.version,
      targetExpectedVersion: canonicalDetail.version,
      reason: 'Duplicate identity.',
      idempotencyKey: crypto.randomUUID(),
    });
    const anonymizeKey = crypto.randomUUID();
    const anonymized = await anonymizeCustomer(database.db, {
      organizationId,
      actorId,
      customerId: canonical.id,
      expectedVersion: merged.version,
      reasonCode: 'CUSTOMER_REQUEST',
      idempotencyKey: anonymizeKey,
    });

    expect(anonymized.status).toBe('ANONYMIZED');
    expect(anonymized.displayName).toMatch(/^Anonymized customer /);
    expect(anonymized.phones).toHaveLength(0);
    expect(anonymized.emails).toHaveLength(0);
    const alias = await getCustomerDetail(database.db, organizationId, source.id);
    expect(alias.displayName).toMatch(/^Anonymized customer /);
    const evidence = await sql<{ count: number }>`
      select count(*)::int as count from customers.customer_anonymizations
      where organization_id = ${organizationId} and customer_id = ${canonical.id}
    `.execute(database.db);
    expect(evidence.rows[0]?.count).toBe(1);

    const replay = await anonymizeCustomer(database.db, {
      organizationId,
      actorId,
      customerId: canonical.id,
      expectedVersion: merged.version,
      reasonCode: 'CUSTOMER_REQUEST',
      idempotencyKey: anonymizeKey,
    });
    expect(replay.status).toBe('ANONYMIZED');
  });
});
