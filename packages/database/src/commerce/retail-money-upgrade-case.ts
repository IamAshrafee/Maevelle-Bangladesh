import assert from 'node:assert/strict';
import { sql } from 'kysely';
import type { UpgradeCase } from '../upgrade-cases.js';
let orderId: string;
export const retailMoneyUpgradeCase: UpgradeCase = {
  async before(db, org) {
    orderId = (
      await sql<{
        id: string;
      }>`insert into orders.orders(organization_id,order_number,source,sales_channel,currency_code,payment_method,subtotal_amount,discount_amount,total_amount)
      values(${org},'UPGRADE-FRACTIONAL-09A1','MANUAL','ADMIN','BDT','COD',81.1250,0,81.1250) returning id`.execute(
        db,
      )
    ).rows[0]!.id;
  },
  async after(db, org) {
    const row = (
      await sql`select total_amount::text,rounding_adjustment::text,payment_fee_amount::text,commercial_policy_snapshot
      from orders.orders where organization_id=${org} and id=${orderId}`.execute(db)
    ).rows[0];
    assert.deepEqual(row, {
      total_amount: '81.1250',
      rounding_adjustment: '0.0000',
      payment_fee_amount: '0.0000',
      commercial_policy_snapshot: null,
    });
    assert.equal(
      (await sql`select * from payments.cash_shortfall_adjustments`.execute(db)).rows.length,
      0,
    );
    assert.equal(
      (
        await sql<{
          amount: string;
        }>`select payments.cash_waiver_total(${org}::uuid,${orderId}::uuid)::text amount`.execute(
          db,
        )
      ).rows[0]!.amount,
      '0.0000',
    );
  },
};
