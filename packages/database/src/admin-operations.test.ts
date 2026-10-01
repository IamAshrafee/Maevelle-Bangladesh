import { afterAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';

import { createDatabase } from './index.js';
import { createOrganization } from './platform.js';
import {
  getOperationsOverview,
  getOrganizationProfile,
  globalSearch,
  confirmCatalogImport,
  createCatalogImport,
  createExport,
  listSavedViews,
  processCatalogImports,
  saveView,
  updateSavedView,
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
    const order = await sql<{
      id: string;
    }>`insert into orders.orders(organization_id,order_number,customer_id,currency_code,payment_method,subtotal_amount,discount_amount,total_amount) values(${organization.id},'OPS-SEARCH-001',${customer.rows[0]!.id}::uuid,'BDT','COD',1,0,1) returning id::text`.execute(
      database.db,
    );
    expect(await globalSearch(database.db, organization.id, 'SEARCH')).toContainEqual(
      expect.objectContaining({
        kind: 'Order',
        label: 'OPS-SEARCH-001',
        href: `/orders?order=${order.rows[0]!.id}`,
      }),
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
    await updateOrganizationProfile(database.db, {
      organizationId: organization.id,
      actorId: user.rows[0]!.id,
      businessProfile: { lowStockThreshold: 5 },
      storefrontProfile: { announcement: 'New arrivals' },
    });
    expect(await getOrganizationProfile(database.db, organization.id)).toEqual(
      expect.objectContaining({
        business_profile: { businessName: 'Maevelle Operations', lowStockThreshold: 5 },
        storefront_profile: { publicStoreName: 'Maevelle', announcement: 'New arrivals' },
      }),
    );
    expect(await getOperationsOverview(database.db, organization.id)).toHaveLength(9);
    const view = (await listSavedViews(database.db, organization.id, user.rows[0]!.id))[0] as {
      id: string;
    };
    await updateSavedView(database.db, {
      organizationId: organization.id,
      userId: user.rows[0]!.id,
      viewId: view.id,
      name: 'Priority review',
      isDefault: true,
    });
    expect(await listSavedViews(database.db, organization.id, user.rows[0]!.id)).toEqual([
      expect.objectContaining({ name: 'Priority review', is_default: true }),
    ]);
  });

  it('validates all-or-nothing Catalog imports, processes valid rows through domain commands, and exports scoped safe fields', async () => {
    const organization = await createOrganization(database.db, {
      code: `import-${crypto.randomUUID().slice(0, 8)}`,
      displayName: 'Import test',
      timezone: 'UTC',
      defaultLocale: 'en',
      defaultCurrency: 'BDT',
    });
    const email = `import-${crypto.randomUUID()}@example.test`;
    const user = await sql<{
      id: string;
    }>`insert into iam.users(name,email,email_normalized) values('Import user',${email},${email}) returning id::text`.execute(
      database.db,
    );
    const type = await sql<{
      id: string;
    }>`insert into catalog.product_types(organization_id,code,name) values(${organization.id},${`TYPE-${crypto.randomUUID().slice(0, 6)}`},'Imported type') returning id::text`.execute(
      database.db,
    );
    const invalid = await createCatalogImport(database.db, {
      organizationId: organization.id,
      actorId: user.rows[0]!.id,
      filename: 'invalid.json',
      rows: [
        { productTypeId: type.rows[0]!.id, title: 'One', handle: 'same' },
        { productTypeId: type.rows[0]!.id, title: 'Two', handle: 'same' },
      ],
    });
    expect(invalid).toEqual(expect.objectContaining({ confirmable: false, invalid: 1 }));
    await expect(confirmCatalogImport(database.db, organization.id, invalid.id)).rejects.toThrow(
      'fully valid',
    );
    const valid = await createCatalogImport(database.db, {
      organizationId: organization.id,
      actorId: user.rows[0]!.id,
      filename: 'valid.json',
      rows: [
        {
          productTypeId: type.rows[0]!.id,
          title: 'Imported product',
          handle: `imported-${crypto.randomUUID().slice(0, 6)}`,
        },
      ],
    });
    await confirmCatalogImport(database.db, organization.id, valid.id);
    expect(await processCatalogImports(database.db)).toBeGreaterThanOrEqual(1);
    const exported = await createExport(database.db, {
      organizationId: organization.id,
      actorId: user.rows[0]!.id,
      exportType: 'CUSTOMERS',
    });
    expect(exported.rows).toEqual([]);
  });

});
