import { it, expect } from 'vitest';
import { sql } from 'kysely';
import { isolatedCartDatabase, cartFixture } from '../testing/cart-fixture.js';
import { runMigrations } from '../migrate.js';
import { setCurrentVariantPrice } from '../pricing.js';
import { auditFractionalRetailPrices, validateRetailBdtAuthoring } from './retail-price-audit.js';
it('audits fractional customer prices without normalizing them or reducing cost precision', async () => {
  const isolated = await isolatedCartDatabase();
  try {
    const db = isolated.database.db;
    await runMigrations(db);
    const f = await cartFixture(isolated.database);
    await setCurrentVariantPrice(db, {
      organizationId: f.organizationId,
      actorId: f.actorId,
      variantId: f.variantId,
      currency: 'BDT',
      amount: '81.1250',
    });
    const audit = await auditFractionalRetailPrices(db, f.organizationId);
    expect(audit.items).toContainEqual(
      expect.objectContaining({ source: 'SELLING_PRICE', amount: '81.1250' }),
    );
    const pastEnd = await auditFractionalRetailPrices(db, f.organizationId, 100, 1);
    expect(pastEnd.items).toEqual([]);
    expect(pastEnd.total).toBe(audit.total);
    expect(
      (
        await sql`select amount::text from pricing.price_definitions where organization_id=${f.organizationId} and amount=81.1250`.execute(
          db,
        )
      ).rows,
    ).toHaveLength(1);
    const costs = (
      await sql<{ numeric_scale: number }>`select numeric_scale from information_schema.columns
      where table_schema='costing' and column_name='unit_cost'`.execute(db)
    ).rows;
    expect(costs.length).toBeGreaterThan(0);
    expect(costs.every((r) => r.numeric_scale >= 4)).toBe(true);
    expect((await sql`select 123.45678901::numeric(24,8)::text cost`.execute(db)).rows[0]).toEqual({
      cost: '123.45678901',
    });
    for (const kind of [
      'REGULAR_PRICE',
      'OFFER_PRICE',
      'MANUAL_DISCOUNT',
      'CAMPAIGN_FIXED_AMOUNT',
      'SHIPPING',
    ] as const) {
      expect(validateRetailBdtAuthoring({ kind, amount: '299.0000' }).amount).toBe('299.0000');
      expect(() => validateRetailBdtAuthoring({ kind, amount: '81.1250' })).toThrow(
        'WHOLE_BDT_REQUIRED',
      );
    }
  } finally {
    await isolated.close();
  }
}, 15000);
