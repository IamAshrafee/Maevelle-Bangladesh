import assert from 'node:assert/strict';
import { sql } from 'kysely';
import type { UpgradeCase } from '../upgrade-cases.js';
let preserved = '';
const prior = async (db: Parameters<UpgradeCase['before']>[0]) =>
  JSON.stringify(
    (
      await sql`select
  (select jsonb_agg(to_jsonb(o) order by id) from orders.orders o) orders,
  (select jsonb_agg(to_jsonb(i) order by id) from payments.payment_intents i) obligations,
  (select jsonb_agg(to_jsonb(p) order by id) from payments.payments p) payments`.execute(db)
    ).rows,
  );
export const checkoutPlacementUpgradeCase: UpgradeCase = {
  async before(db) {
    preserved = await prior(db);
  },
  async after(db) {
    const after = JSON.parse(await prior(db));
    for (const row of after) for (const order of row.orders ?? []) delete order.checkout_draft_id;
    assert.equal(JSON.stringify(after), preserved);
    assert.equal((await sql`select 1 from orders.checkout_placements`.execute(db)).rows.length, 0);
    assert.equal(
      (
        await sql`select 1 from pg_indexes where schemaname='orders' and indexname='one_order_per_checkout_draft'`.execute(
          db,
        )
      ).rows.length,
      1,
    );
    await assert.rejects(
      sql`update orders.checkout_drafts set status='COMMITTED' where id=(select id from orders.checkout_drafts limit 1)`.execute(
        db,
      ),
      { code: '23514' },
    );
  },
};
