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
import {
  createSizingDomain,
  createSizeSystem,
  createSizeDefinition,
  createMeasurementDefinition,
  createSizeGuide,
  addSizeGuideRow,
  setSizeGuideMeasurement,
  publishSizeGuideRevision,
  attachSizeGuideToProduct,
  linkOptionValueToSizeDefinition,
  setCategoryDefaultSizeGuide,
} from './sizing.js';
import { createManagedCategory } from './catalog-classification.js';

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

    // Seed realistic Sizing Foundations & Standard Published Guide
    const existingDomain = await sql<{ id: string }>`
      select id::text from sizing.sizing_domains where organization_id=${active.organization_id} and code='apparel' limit 1
    `.execute(database.db);
    if (!existingDomain.rows[0]) {
      const domain = await createSizingDomain(database.db, {
        organizationId: active.organization_id,
        code: 'apparel',
        name: 'Apparel',
        subjectType: 'GARMENT',
      });
      const system = await createSizeSystem(database.db, {
        organizationId: active.organization_id,
        sizingDomainId: domain.id,
        code: 'alpha',
        name: 'International Alpha',
        regionCode: 'INT',
      });
      const sizeXS = await createSizeDefinition(database.db, {
        organizationId: active.organization_id,
        sizeSystemId: system.id,
        code: 'xs',
        label: 'XS',
        sortOrder: 0,
      });
      const sizeS = await createSizeDefinition(database.db, {
        organizationId: active.organization_id,
        sizeSystemId: system.id,
        code: 's',
        label: 'S',
        sortOrder: 1,
      });
      const sizeM = await createSizeDefinition(database.db, {
        organizationId: active.organization_id,
        sizeSystemId: system.id,
        code: 'm',
        label: 'M',
        sortOrder: 2,
      });
      const sizeL = await createSizeDefinition(database.db, {
        organizationId: active.organization_id,
        sizeSystemId: system.id,
        code: 'l',
        label: 'L',
        sortOrder: 3,
      });
      const sizeXL = await createSizeDefinition(database.db, {
        organizationId: active.organization_id,
        sizeSystemId: system.id,
        code: 'xl',
        label: 'XL',
        sortOrder: 4,
      });

      const mBust = await createMeasurementDefinition(database.db, {
        organizationId: active.organization_id,
        sizingDomainId: domain.id,
        code: 'bust',
        name: 'Bust',
        subjectType: 'GARMENT',
        defaultUnit: 'cm',
        instructions: 'Measure across the fullest part of the chest with garment lying flat.',
        sortOrder: 0,
      });
      const mWaist = await createMeasurementDefinition(database.db, {
        organizationId: active.organization_id,
        sizingDomainId: domain.id,
        code: 'waist',
        name: 'Waist',
        subjectType: 'GARMENT',
        defaultUnit: 'cm',
        instructions: 'Measure across the narrowest natural waistline.',
        sortOrder: 1,
      });
      const mHips = await createMeasurementDefinition(database.db, {
        organizationId: active.organization_id,
        sizingDomainId: domain.id,
        code: 'hips',
        name: 'Hips',
        subjectType: 'GARMENT',
        defaultUnit: 'cm',
        instructions: 'Measure across the fullest part of the hips.',
        sortOrder: 2,
      });
      const mLength = await createMeasurementDefinition(database.db, {
        organizationId: active.organization_id,
        sizingDomainId: domain.id,
        code: 'length',
        name: 'Total Length',
        subjectType: 'GARMENT',
        defaultUnit: 'cm',
        instructions: 'Measure from highest point of the shoulder seam to hem.',
        sortOrder: 3,
      });

      const guide = await createSizeGuide(database.db, {
        organizationId: active.organization_id,
        actorId: active.actor_id,
        name: 'Standard Tops & Dresses Size Guide',
        description: 'Canonical size and measurement guide for women’s tops, kurtis, and tunics.',
        sizingDomainId: domain.id,
      });

      const rowData: readonly {
        label: string;
        sizeDefId: string;
        bust: readonly [string, string];
        waist: readonly [string, string];
        hips: readonly [string, string];
        len: string;
      }[] = [
        { label: 'XS', sizeDefId: sizeXS.id, bust: ['80', '84'], waist: ['62', '66'], hips: ['88', '92'], len: '88' },
        { label: 'S', sizeDefId: sizeS.id, bust: ['84', '88'], waist: ['66', '70'], hips: ['92', '96'], len: '90' },
        { label: 'M', sizeDefId: sizeM.id, bust: ['88', '92'], waist: ['70', '74'], hips: ['96', '100'], len: '92' },
        { label: 'L', sizeDefId: sizeL.id, bust: ['92', '96'], waist: ['74', '78'], hips: ['100', '104'], len: '94' },
        { label: 'XL', sizeDefId: sizeXL.id, bust: ['96', '100'], waist: ['78', '82'], hips: ['104', '108'], len: '96' },
      ];

      for (let i = 0; i < rowData.length; i++) {
        const item = rowData[i]!;
        const row = await addSizeGuideRow(database.db, {
          organizationId: active.organization_id,
          revisionId: guide.revisionId,
          displayLabel: item.label,
          position: i,
          sizeDefinitionId: item.sizeDefId,
        });

        await setSizeGuideMeasurement(database.db, {
          organizationId: active.organization_id,
          revisionId: guide.revisionId,
          rowId: row.id,
          measurementDefinitionId: mBust.id,
          unitCode: 'cm',
          min: item.bust[0],
          max: item.bust[1],
        });
        await setSizeGuideMeasurement(database.db, {
          organizationId: active.organization_id,
          revisionId: guide.revisionId,
          rowId: row.id,
          measurementDefinitionId: mWaist.id,
          unitCode: 'cm',
          min: item.waist[0],
          max: item.waist[1],
        });
        await setSizeGuideMeasurement(database.db, {
          organizationId: active.organization_id,
          revisionId: guide.revisionId,
          rowId: row.id,
          measurementDefinitionId: mHips.id,
          unitCode: 'cm',
          min: item.hips[0],
          max: item.hips[1],
        });
        await setSizeGuideMeasurement(database.db, {
          organizationId: active.organization_id,
          revisionId: guide.revisionId,
          rowId: row.id,
          measurementDefinitionId: mLength.id,
          unitCode: 'cm',
          exact: item.len,
        });
      }

      await publishSizeGuideRevision(database.db, {
        organizationId: active.organization_id,
        sizeGuideId: guide.id,
        revisionId: guide.revisionId,
        actorId: active.actor_id,
      });
    }

    const apparelDomain = (
      await sql<{ id: string }>`
        select id::text from sizing.sizing_domains where organization_id=${active.organization_id} and code='apparel' limit 1
      `.execute(database.db)
    ).rows[0];
    const alphaSystem = apparelDomain
      ? (
          await sql<{ id: string }>`
            select id::text from sizing.size_systems where organization_id=${active.organization_id} and sizing_domain_id=${apparelDomain.id} and code='alpha' limit 1
          `.execute(database.db)
        ).rows[0]
      : undefined;
    const publishedGuide = apparelDomain
      ? (
          await sql<{ id: string }>`
            select id::text from sizing.size_guides where organization_id=${active.organization_id} and sizing_domain_id=${apparelDomain.id} and status='ACTIVE' limit 1
          `.execute(database.db)
        ).rows[0]
      : undefined;

    if (apparelDomain && alphaSystem && publishedGuide) {
      // Ensure Apparel category exists with default size guide assigned
      let category = (
        await sql<{ id: string }>`
          select id::text from catalog.categories where organization_id=${active.organization_id} and handle='apparel' limit 1
        `.execute(database.db)
      ).rows[0];
      if (!category) {
        category = await createManagedCategory(database.db, {
          organizationId: active.organization_id,
          actorId: active.actor_id,
          name: 'Apparel',
          handle: 'apparel',
          defaultSizeGuideId: publishedGuide.id,
        });
      } else {
        await setCategoryDefaultSizeGuide(database.db, {
          organizationId: active.organization_id,
          categoryId: category.id,
          sizeGuideId: publishedGuide.id,
          actorId: active.actor_id,
        });
      }

      // Seed Staging Silk Kurti with full size variants and sizing configuration
      const existingKurti = await sql<{ id: string }>`
        select id::text from catalog.products where organization_id=${active.organization_id} and handle='staging-silk-kurti' limit 1
      `.execute(database.db);
      if (!existingKurti.rows[0]) {
        const kurti = await createCatalogProduct(database.db, {
          organizationId: active.organization_id,
          actorId: active.actor_id,
          productTypeId: productType.id,
          title: 'Staging Silk Kurti',
          handle: 'staging-silk-kurti',
          description: 'Artisanal handwoven mulberry silk kurti with delicate zari embroidery and relaxed silhouette.',
        });

        await sql`update catalog.products set primary_category_id = ${category.id}::uuid where id = ${kurti.id}::uuid`.execute(database.db);
        await sql`insert into catalog.product_categories (organization_id, product_id, category_id) values (${active.organization_id}, ${kurti.id}::uuid, ${category.id}::uuid) on conflict do nothing`.execute(database.db);

        const sizeAxis = await createProductOptionAxis(database.db, {
          organizationId: active.organization_id,
          productId: kurti.id,
          code: 'size',
          name: 'Size',
        });
        const sizeCodes = ['xs', 's', 'm', 'l', 'xl'] as const;
        const sizeLabels = ['XS', 'S', 'M', 'L', 'XL'] as const;
        const sizeValues = await Promise.all(
          sizeCodes.map((code, idx) =>
            createProductOptionValue(database.db, {
              organizationId: active.organization_id,
              optionAxisId: sizeAxis.id,
              code,
              displayValue: sizeLabels[idx]!,
            }),
          ),
        );

        const sizeDefs = (
          await sql<{ id: string; code: string }>`
            select id::text, code from sizing.size_definitions
            where organization_id=${active.organization_id} and size_system_id=${alphaSystem.id}
          `.execute(database.db)
        ).rows;
        const defMap = new Map(sizeDefs.map((d) => [d.code, d.id]));

        for (let i = 0; i < sizeValues.length; i++) {
          const targetDefId = defMap.get(sizeCodes[i]!);
          if (targetDefId) {
            await linkOptionValueToSizeDefinition(database.db, {
              organizationId: active.organization_id,
              optionValueId: sizeValues[i]!.id,
              sizeDefinitionId: targetDefId,
              actorId: active.actor_id,
            });
          }
        }

        await attachSizeGuideToProduct(database.db, {
          organizationId: active.organization_id,
          productId: kurti.id,
          sizeSystemId: alphaSystem.id,
          sizeGuideId: publishedGuide.id,
          actorId: active.actor_id,
        });

        const sizeNames = ['XS', 'S', 'M', 'L', 'XL'];
        for (let i = 0; i < sizeNames.length; i++) {
          const variant = await createCatalogVariant(database.db, {
            organizationId: active.organization_id,
            productId: kurti.id,
            sku: `STAGING-KURTI-${sizeNames[i]}`,
            optionValueIds: [sizeValues[i]!.id],
          });
          await createPriceDefinition(database.db, {
            organizationId: active.organization_id,
            actorId: active.actor_id,
            variantId: variant.id,
            currency: 'BDT',
            amount: '2490',
            status: 'ACTIVE',
          });
        }

        await sql`update catalog.products set status = 'ACTIVE', publication_status = 'PUBLISHED' where id = ${kurti.id}::uuid`.execute(database.db);
      }
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
