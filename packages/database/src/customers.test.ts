import { afterAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { createDatabase } from './index.js';
import { createOrganization } from './platform.js';
import {
  createCustomer,
  updateCustomer,
  getCustomerDetail,
  addCustomerAddress,
  removeCustomerAddress,
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
      phone: '01711223344',
      email: 'test@maevelle.local',
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
    
    await expect(updateCustomer(database.db, {
      organizationId,
      actorId,
      customerId: customer.id,
      expectedVersion: customer.version,
      status: 'MERGED' as any,
    })).rejects.toThrow('customers_check');
  });
});
