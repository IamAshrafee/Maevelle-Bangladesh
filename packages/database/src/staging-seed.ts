import { sql } from 'kysely';
import { createDatabase } from './index.js';
import {
  createCatalogProduct,
  createCatalogProductType,
  createCatalogVariant,
  createProductOptionAxis,
  createProductOptionValue,
  listCatalogProductTypes,
} from './catalog.js';
import { createFinancialAccount } from './finance.js';
import { configurePaymentMethod } from './payments.js';
import { createPriceDefinition } from './pricing.js';
import { createLocation, listLocations } from './warehouse.js';

async function main() {
  if (process.env.ALLOW_STAGING_SEED !== '1') throw new Error('ALLOW_STAGING_SEED=1 is required.');
  const databaseUrl = process.env.DATABASE_URL;
  const organizationCode = process.env.BOOTSTRAP_ORGANIZATION_CODE;
  const ownerEmail = process.env.BOOTSTRAP_OWNER_EMAIL;
  if (!databaseUrl || !organizationCode || !ownerEmail)
    throw new Error('DATABASE_URL and bootstrap organization/owner identity are required.');
  const database = createDatabase({ connectionString: databaseUrl, maxConnections: 2 });
  try {
    const context = await sql<{
      organization_id: string;
      actor_id: string;
    }>`select membership.organization_id::text,user_account.id::text actor_id from iam.users user_account join iam.organization_memberships membership on membership.user_id=user_account.id join platform.organizations organization on organization.id=membership.organization_id where user_account.email_normalized=${ownerEmail.toLowerCase()} and organization.code=${organizationCode} and membership.membership_type='OWNER' and membership.status='ACTIVE' limit 1`.execute(
      database.db,
    );
    const active = context.rows[0];
    if (!active) throw new Error('Bootstrap Owner must exist before staging seed.');
    let productType = (await listCatalogProductTypes(database.db, active.organization_id)).find(
      (item) => item.code === 'staging-sample',
    );
    productType ??= await createCatalogProductType(database.db, {
      organizationId: active.organization_id,
      code: 'staging-sample',
      name: 'Staging Sample',
    });
    let location = (await listLocations(database.db, active.organization_id)).find(
      (item) => item.code === 'STAGING',
    );
    location ??= await createLocation(database.db, {
      organizationId: active.organization_id,
      actorId: active.actor_id,
      code: 'STAGING',
      name: 'Staging Warehouse',
      locationType: 'WAREHOUSE',
      capabilities: [
        'STOCK_HOLDING',
        'ORDER_FULFILLMENT',
        'PURCHASE_RECEIVING',
        'RETURN_RECEIVING',
      ],
    });
    await configurePaymentMethod(database.db, {
      organizationId: active.organization_id,
      actorId: active.actor_id,
      code: 'COD',
      name: 'Cash on Delivery',
      status: 'ACTIVE',
      displayOrder: 1,
    });
    const account = await sql<{
      id: string;
    }>`select id::text from finance.financial_accounts where organization_id=${active.organization_id} and account_number='STAGING-CASH'`.execute(
      database.db,
    );
    if (!account.rows[0])
      await createFinancialAccount(database.db, {
        organizationId: active.organization_id,
        actorId: active.actor_id,
        accountNumber: 'STAGING-CASH',
        name: 'Staging Cash',
        accountType: 'CASH',
        currencyCode: 'BDT',
        openingBalance: '0',
        idempotencyKey: 'staging-seed-finance-account-v1',
      });
    const existing = await sql<{
      id: string;
    }>`select id::text from catalog.products where organization_id=${active.organization_id} and handle='staging-linen-scarf'`.execute(
      database.db,
    );
    if (!existing.rows[0]) {
      const product = await createCatalogProduct(database.db, {
        organizationId: active.organization_id,
        actorId: active.actor_id,
        productTypeId: productType.id,
        title: 'Staging Linen Scarf',
        handle: 'staging-linen-scarf',
        description: 'Deterministic draft fixture for operator acceptance.',
      });
      const axis = await createProductOptionAxis(database.db, {
        organizationId: active.organization_id,
        productId: product.id,
        code: 'style',
        name: 'Style',
      });
      const value = await createProductOptionValue(database.db, {
        organizationId: active.organization_id,
        optionAxisId: axis.id,
        code: 'standard',
        displayValue: 'Standard',
      });
      const variant = await createCatalogVariant(database.db, {
        organizationId: active.organization_id,
        productId: product.id,
        sku: 'STAGING-SCARF-001',
        optionValueIds: [value.id],
      });
      await createPriceDefinition(database.db, {
        organizationId: active.organization_id,
        actorId: active.actor_id,
        variantId: variant.id,
        currency: 'BDT',
        amount: '1290',
        status: 'ACTIVE',
      });
    }
    console.log(
      JSON.stringify({
        status: 'PASS',
        organization: organizationCode,
        location: location.code,
        fixture: 'staging-linen-scarf',
      }),
    );
  } finally {
    await database.close();
  }
}

await main();
