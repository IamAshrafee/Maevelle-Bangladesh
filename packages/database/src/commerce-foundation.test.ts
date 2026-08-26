import { afterAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';

import {
  addGuestCartLine,
  applyGuestCartCoupon,
  createGuestCart,
  getGuestCart,
  setGuestCartLineQuantity,
} from './cart.js';
import {
  createCustomer,
  addCustomerAddress,
  addCustomerPhone,
  findCustomerDuplicateCandidates,
  listCustomers,
} from './customers.js';
import {
  createGeographyNode,
  importGeographyDataset,
  moveGeographyNode,
  searchGeography,
} from './geography.js';
import { createDatabase } from './index.js';
import { adjustInventory } from './inventory.js';
import {
  createCouponCode,
  createPromotion,
  evaluatePromotions,
  listAdminPromotions,
} from './promotions.js';
import { createPriceDefinition, listVariantPrices, resolveVariantPrice } from './pricing.js';
import { createOrganization } from './platform.js';
import { createLocation } from './warehouse.js';

const database = createDatabase({
  connectionString: process.env.TEST_DATABASE_URL!,
  maxConnections: 10,
});
afterAll(async () => database.close());

async function commerceFixture() {
  const organization = await createOrganization(database.db, {
    code: `commerce-${crypto.randomUUID().slice(0, 12)}`,
    displayName: 'Commerce test',
    timezone: 'UTC',
    defaultLocale: 'en',
    defaultCurrency: 'BDT',
  });
  const actorId = crypto.randomUUID();
  const productType = await sql<{
    id: string;
  }>`insert into catalog.product_types (organization_id, code, name) values (${organization.id}, 'hat', 'Hat') returning id`.execute(
    database.db,
  );
  const product = await sql<{
    id: string;
  }>`insert into catalog.products (organization_id, product_type_id, handle, title, status, publication_status, published_at) values (${organization.id}, ${productType.rows[0]!.id}, ${`hat-${crypto.randomUUID().slice(0, 10)}`}, 'Commerce Hat', 'ACTIVE', 'PUBLISHED', now()) returning id`.execute(
    database.db,
  );
  const variant = await sql<{
    id: string;
  }>`insert into catalog.product_variants (organization_id, product_id, sku, sku_normalized, option_signature) values (${organization.id}, ${product.rows[0]!.id}, ${`SKU-${crypto.randomUUID().slice(0, 8)}`}, ${`SKU-${crypto.randomUUID().slice(0, 8)}`}, ${crypto.randomUUID()}) returning id`.execute(
    database.db,
  );
  const location = await createLocation(database.db, {
    organizationId: organization.id,
    actorId,
    code: `MAIN-${crypto.randomUUID().slice(0, 6)}`,
    name: 'Main',
    locationType: 'WAREHOUSE',
    capabilities: ['STOCK_HOLDING'],
  });
  await adjustInventory(database.db, {
    organizationId: organization.id,
    actorId,
    variantId: variant.rows[0]!.id,
    locationId: location.id,
    condition: 'SELLABLE',
    quantityDelta: '1',
    reasonCode: 'OPENING_BALANCE',
    idempotencyKey: crypto.randomUUID(),
  });
  return {
    organizationId: organization.id,
    actorId,
    productId: product.rows[0]!.id,
    variantId: variant.rows[0]!.id,
  };
}

describe('commercial foundation invariants', () => {
  it('imports versioned Geography deterministically, searches aliases, and prevents a hierarchy cycle', async () => {
    const version = `test-${crypto.randomUUID()}`;
    const imported = await importGeographyDataset(database.db, {
      code: 'bangladesh',
      version,
      sourceName: 'test fixture',
      nodes: [
        {
          sourceCode: 'BD',
          nodeType: 'COUNTRY',
          canonicalName: 'Bangladesh',
          aliases: [{ value: 'বাংলাদেশ', languageCode: 'bn' }],
        },
        {
          sourceCode: 'DHAKA',
          parentSourceCode: 'BD',
          nodeType: 'DIVISION',
          canonicalName: 'Dhaka',
        },
        {
          sourceCode: 'SAVAR-UPZ',
          parentSourceCode: 'DHAKA',
          nodeType: 'UPAZILA',
          canonicalName: 'Savar Upazila',
        },
        {
          sourceCode: 'SAVAR-THANA',
          parentSourceCode: 'DHAKA',
          nodeType: 'THANA',
          canonicalName: 'Savar Thana',
        },
      ],
    });
    expect(
      (
        await importGeographyDataset(database.db, {
          code: 'bangladesh',
          version,
          sourceName: 'test fixture',
          nodes: [],
        })
      ).imported,
    ).toBe(false);
    expect((await searchGeography(database.db, 'বাংলা')).map((node) => node.name)).toContain(
      'Bangladesh',
    );
    const nodes = await sql<{
      id: string;
      source_code: string;
    }>`select id, source_code from geography.nodes where dataset_id = ${imported.datasetId}`.execute(
      database.db,
    );
    expect(nodes.rows.some((node) => node.source_code === 'SAVAR-UPZ')).toBe(true);
    expect(nodes.rows.some((node) => node.source_code === 'SAVAR-THANA')).toBe(true);
    const root = nodes.rows.find((node) => node.source_code === 'BD')!;
    const child = nodes.rows.find((node) => node.source_code === 'DHAKA')!;
    await expect(
      moveGeographyNode(database.db, { nodeId: root.id, parentId: child.id, expectedVersion: 1 }),
    ).rejects.toMatchObject({ code: 'HIERARCHY_CYCLE' });
    const manualA = await createGeographyNode(database.db, {
      nodeType: 'OTHER',
      canonicalName: `Manual A ${crypto.randomUUID()}`,
    });
    const manualB = await createGeographyNode(database.db, {
      nodeType: 'OTHER',
      canonicalName: `Manual B ${crypto.randomUUID()}`,
    });
    expect(manualA.id).not.toBe(manualB.id);
  });

  it('keeps customer identity tenant-scoped, permits shared contacts, and accepts resolved or manual addresses', async () => {
    const fixture = await commerceFixture();
    const one = await createCustomer(database.db, { ...fixture, displayName: 'First Customer' });
    const two = await createCustomer(database.db, { ...fixture, displayName: 'Second Customer' });
    await addCustomerPhone(database.db, {
      ...fixture,
      customerId: one.id,
      phone: '01700 000000',
      isPrimary: true,
    });
    await addCustomerPhone(database.db, { ...fixture, customerId: two.id, phone: '+01700000000' });
    await expect(listCustomers(database.db, fixture.organizationId, 'First')).resolves.toEqual([
      expect.objectContaining({
        id: one.id,
        primaryPhone: '01700 000000',
        orderCount: 0,
        totalSpend: '0',
      }),
    ]);
    expect(
      await findCustomerDuplicateCandidates(database.db, {
        organizationId: fixture.organizationId,
        customerId: one.id,
      }),
    ).toEqual(
      expect.arrayContaining([expect.objectContaining({ customerId: two.id, signals: ['PHONE'] })]),
    );
    await expect(
      addCustomerAddress(database.db, {
        ...fixture,
        customerId: one.id,
        recipientName: 'First Customer',
        addressLine1: '1 Test Road',
        countryCode: 'BD',
        area: 'Manual area',
      }),
    ).resolves.toHaveProperty('id');
    const other = await createOrganization(database.db, {
      code: `other-${crypto.randomUUID().slice(0, 10)}`,
      displayName: 'Other',
      timezone: 'UTC',
      defaultLocale: 'en',
      defaultCurrency: 'BDT',
    });
    await expect(
      addCustomerPhone(database.db, {
        organizationId: other.id,
        actorId: fixture.actorId,
        customerId: one.id,
        phone: '01800 000000',
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('resolves tenant-scoped exact prices and evaluates provisional coupons without recording usage', async () => {
    const fixture = await commerceFixture();
    const price = await createPriceDefinition(database.db, {
      ...fixture,
      variantId: fixture.variantId,
      currency: 'BDT',
      amount: '1290.0000',
      compareAtAmount: '1590.0000',
    });
    expect(
      await resolveVariantPrice(database.db, {
        organizationId: fixture.organizationId,
        variantId: fixture.variantId,
        currency: 'BDT',
      }),
    ).toMatchObject({ amount: '1290.0000', compareAtAmount: '1590.0000' });
    await expect(
      createPriceDefinition(database.db, {
        ...fixture,
        variantId: fixture.variantId,
        currency: 'BDT',
        amount: '1300.0000',
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    const otherOrganization = await commerceFixture();
    await expect(
      createPromotion(database.db, {
        ...fixture,
        name: 'Cross-tenant target',
        promotionType: 'AUTOMATIC',
        benefitType: 'PERCENTAGE_DISCOUNT',
        benefitValue: '10.0000',
        combinability: 'EXCLUSIVE',
        productIds: [otherOrganization.productId],
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
    const promotion = await createPromotion(database.db, {
      ...fixture,
      name: 'Ten percent',
      promotionType: 'COUPON',
      benefitType: 'PERCENTAGE_DISCOUNT',
      benefitValue: '10.0000',
      combinability: 'EXCLUSIVE',
    });
    await createCouponCode(database.db, {
      ...fixture,
      promotionId: promotion.id,
      code: ' SAVE10 ',
    });
    const result = await evaluatePromotions(database.db, {
      organizationId: fixture.organizationId,
      couponCodes: ['save10'],
      lines: [
        {
          lineId: 'line-a',
          variantId: fixture.variantId,
          productId: fixture.productId,
          categoryIds: [],
          gross: '1290.0000',
        },
      ],
    });
    expect(result[0]).toMatchObject({ discount: '129.0000' });
    await expect(listVariantPrices(database.db, fixture.organizationId)).resolves.toEqual([
      expect.objectContaining({
        productTitle: 'Commerce Hat',
        variantId: fixture.variantId,
        amount: '1290.0000',
      }),
    ]);
    await expect(listAdminPromotions(database.db, fixture.organizationId)).resolves.toEqual([
      expect.objectContaining({
        id: promotion.id,
        name: 'Ten percent',
        committedUsageCount: 0,
        committedDiscount: '0',
        coupons: [expect.objectContaining({ code: 'SAVE10' })],
      }),
    ]);
    expect(await listAdminPromotions(database.db, otherOrganization.organizationId)).toEqual([]);
    const usage = await sql<{
      count: string;
    }>`select count(*)::text as count from promotions.promotion_usage where organization_id = ${fixture.organizationId}`.execute(
      database.db,
    );
    expect(usage.rows[0]?.count).toBe('0');
    expect(price.amount).toBe('1290.0000');
  });

  it('keeps guest carts opaque, authoritative, and non-reserving across concurrent cart intent', async () => {
    const fixture = await commerceFixture();
    await createPriceDefinition(database.db, {
      ...fixture,
      variantId: fixture.variantId,
      currency: 'BDT',
      amount: '1290.0000',
    });
    const first = await createGuestCart(database.db, {
      organizationId: fixture.organizationId,
      currency: 'BDT',
    });
    const second = await createGuestCart(database.db, {
      organizationId: fixture.organizationId,
      currency: 'BDT',
    });
    expect(first.token).not.toBe(first.cart.id);
    const promotion = await createPromotion(database.db, {
      ...fixture,
      name: 'Cart ten percent',
      promotionType: 'COUPON',
      benefitType: 'PERCENTAGE_DISCOUNT',
      benefitValue: '10.0000',
      combinability: 'EXCLUSIVE',
    });
    await createCouponCode(database.db, { ...fixture, promotionId: promotion.id, code: 'CART10' });
    const firstKey = crypto.randomUUID();
    const afterFirst = await addGuestCartLine(database.db, {
      token: first.token,
      variantId: fixture.variantId,
      quantity: '1',
      expectedVersion: first.cart.version,
      idempotencyKey: firstKey,
    });
    await addGuestCartLine(database.db, {
      token: second.token,
      variantId: fixture.variantId,
      quantity: '1',
      expectedVersion: second.cart.version,
    });
    expect(afterFirst.lines[0]).toMatchObject({
      unitPrice: '1290.0000',
      gross: '1290.0000',
      discount: '0.0000',
    });
    const discounted = await applyGuestCartCoupon(database.db, {
      token: first.token,
      couponCode: 'cart10',
      expectedVersion: afterFirst.version,
    });
    expect(discounted).toMatchObject({ discountTotal: '129.0000', merchandiseNet: '1161.0000' });
    const stock = await sql<{
      reserved: string;
      ats: string;
    }>`select sum(reserved_quantity)::text as reserved, sum(sellable_quantity - reserved_quantity)::text as ats from inventory.inventory_levels where organization_id = ${fixture.organizationId}`.execute(
      database.db,
    );
    expect(stock.rows[0]).toEqual({ reserved: '0.000000', ats: '1.000000' });
    const retry = await addGuestCartLine(database.db, {
      token: first.token,
      variantId: fixture.variantId,
      quantity: '1',
      expectedVersion: first.cart.version,
      idempotencyKey: firstKey,
    });
    expect(retry.lines[0]?.quantity).toBe('1.000000');
    await expect(
      addGuestCartLine(database.db, {
        token: first.token,
        variantId: fixture.variantId,
        quantity: '1',
        expectedVersion: discounted.version,
      }),
    ).rejects.toMatchObject({ code: 'UNAVAILABLE' });
    await expect(
      setGuestCartLineQuantity(database.db, {
        token: first.token,
        lineId: retry.lines[0]!.id,
        quantity: '2',
        expectedVersion: discounted.version,
      }),
    ).rejects.toMatchObject({ code: 'UNAVAILABLE' });
    await expect(
      addGuestCartLine(database.db, {
        token: first.token,
        variantId: fixture.variantId,
        quantity: '2',
        expectedVersion: discounted.version,
        idempotencyKey: firstKey,
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(
      addGuestCartLine(database.db, {
        token: first.token,
        variantId: fixture.variantId,
        quantity: '1',
        expectedVersion: first.cart.version,
      }),
    ).rejects.toMatchObject({ code: 'STALE_VERSION' });
    expect((await getGuestCart(database.db, first.token)).lines).toHaveLength(1);
  });
});
