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
  listTeam,
  processCatalogImports,
  saveView,
  updateSavedView,
  updateTeamMember,
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
    expect(await getOrganizationProfile(database.db, organization.id)).toEqual(
      expect.objectContaining({ business_profile: { businessName: 'Maevelle Operations' } }),
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

  it('protects the Owner and prevents cross-tenant or self access mutation', async () => {
    const organization = await createOrganization(database.db, {
      code: `team-${crypto.randomUUID().slice(0, 8)}`,
      displayName: 'Team A',
      timezone: 'UTC',
      defaultLocale: 'en',
      defaultCurrency: 'BDT',
    });
    const other = await createOrganization(database.db, {
      code: `team-b-${crypto.randomUUID().slice(0, 8)}`,
      displayName: 'Team B',
      timezone: 'UTC',
      defaultLocale: 'en',
      defaultCurrency: 'BDT',
    });
    const ownerEmail = `owner-${crypto.randomUUID()}@example.test`;
    const memberEmail = `member-${crypto.randomUUID()}@example.test`;
    const owner = await sql<{
      id: string;
    }>`insert into iam.users(name,email,email_normalized) values('Owner',${ownerEmail},${ownerEmail}) returning id`.execute(
      database.db,
    );
    const member = await sql<{
      id: string;
    }>`insert into iam.users(name,email,email_normalized) values('Member',${memberEmail},${memberEmail}) returning id`.execute(
      database.db,
    );
    const ownerMembership = await sql<{
      id: string;
    }>`insert into iam.organization_memberships(organization_id,user_id,membership_type,status) values(${organization.id},${owner.rows[0]!.id}::uuid,'OWNER','ACTIVE') returning id`.execute(
      database.db,
    );
    const standard = await sql<{
      id: string;
    }>`insert into iam.organization_memberships(organization_id,user_id,membership_type,status) values(${organization.id},${member.rows[0]!.id}::uuid,'STANDARD','ACTIVE') returning id`.execute(
      database.db,
    );
    await expect(
      updateTeamMember(database.db, {
        organizationId: organization.id,
        actorMembershipId: ownerMembership.rows[0]!.id,
        membershipId: ownerMembership.rows[0]!.id,
        status: 'DISABLED',
      }),
    ).rejects.toThrow('Owner');
    await expect(
      updateTeamMember(database.db, {
        organizationId: other.id,
        actorMembershipId: ownerMembership.rows[0]!.id,
        membershipId: standard.rows[0]!.id,
        status: 'DISABLED',
      }),
    ).rejects.toThrow('not found');
    await updateTeamMember(database.db, {
      organizationId: organization.id,
      actorMembershipId: ownerMembership.rows[0]!.id,
      membershipId: standard.rows[0]!.id,
      status: 'DISABLED',
    });
    expect(await listTeam(database.db, organization.id)).toEqual(
      expect.arrayContaining([expect.objectContaining({ status: 'DISABLED' })]),
    );
  });
});
