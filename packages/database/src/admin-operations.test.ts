import { afterAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';

import { createDatabase } from './index.js';
import { createOrganization } from './platform.js';
import {
  getOperationsOverview,
  getOrganizationProfile,
  globalSearch,
  listSavedViews,
  saveView,
  updateOrganizationProfile,
} from './admin-operations.js';

const database = createDatabase({
  connectionString: process.env.TEST_DATABASE_URL!,
  maxConnections: 4,
});
afterAll(async () => database.close());

describe('admin operations support', () => {
  it('keeps search, saved views, and typed settings scoped to the active organization', async () => {
    const organization = await createOrganization(database.db, {
      code: `ops-${crypto.randomUUID().slice(0, 8)}`,
      displayName: 'Operations test',
      timezone: 'UTC',
      defaultLocale: 'en',
      defaultCurrency: 'BDT',
    });
    const email = `ops-${crypto.randomUUID()}@example.test`;
    const user = await sql<{
      id: string;
    }>`insert into iam.users(name,email,email_normalized) values('Operations user',${email},${email}) returning id::text`.execute(
      database.db,
    );
    const customer = await sql<{
      id: string;
    }>`insert into customers.customers(organization_id,customer_number,display_name) values(${organization.id},${`CUS-${crypto.randomUUID().slice(0, 8)}`},'Searchable customer') returning id::text`.execute(
      database.db,
    );
    await sql`insert into orders.orders(organization_id,order_number,customer_id,currency_code,payment_method,subtotal_amount,discount_amount,total_amount) values(${organization.id},'OPS-SEARCH-001',${customer.rows[0]!.id}::uuid,'BDT','COD',1,0,1)`.execute(
      database.db,
    );
    expect(await globalSearch(database.db, organization.id, 'SEARCH')).toContainEqual(
      expect.objectContaining({ kind: 'Order', label: 'OPS-SEARCH-001' }),
    );
    await saveView(database.db, {
      organizationId: organization.id,
      userId: user.rows[0]!.id,
      resourceKey: 'orders',
      name: 'Needs review',
      filters: { status: 'PENDING' },
    });
    expect(await listSavedViews(database.db, organization.id, user.rows[0]!.id)).toEqual([
      expect.objectContaining({ name: 'Needs review', resource_key: 'orders' }),
    ]);
    await updateOrganizationProfile(database.db, {
      organizationId: organization.id,
      actorId: user.rows[0]!.id,
      businessProfile: { businessName: 'Maevelle Operations' },
      storefrontProfile: { publicStoreName: 'Maevelle' },
    });
    expect(await getOrganizationProfile(database.db, organization.id)).toEqual(
      expect.objectContaining({ business_profile: { businessName: 'Maevelle Operations' } }),
    );
    expect(await getOperationsOverview(database.db, organization.id)).toHaveLength(6);
  });
});
