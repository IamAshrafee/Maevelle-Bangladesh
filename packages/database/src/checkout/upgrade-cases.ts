import assert from 'node:assert/strict';
import { sql } from 'kysely';
import { hashToken } from '@maevelle/security';
import type { UpgradeCase } from '../upgrade-cases.js';

let checkoutId = '';
let orderId = '';
export const checkoutUpgradeCases: Record<string, UpgradeCase> = {
  '3219_checkout_foundation': {
    async before(db, organizationId) {
      const cart = await sql<{
        id: string;
      }>`insert into cart.carts(organization_id,public_token_hash,currency_code,expires_at,credential_state)
        values(${organizationId},${hashToken(crypto.randomUUID())},'BDT',now()+interval '1 day','SLOT_V1') returning id`.execute(
        db,
      );
      const checkout = await sql<{
        id: string;
      }>`insert into orders.checkout_sessions(organization_id,cart_id,public_token_hash,cart_version,calculation_version,calculation_fingerprint,calculated_totals,expires_at)
        values(${organizationId},${cart.rows[0]!.id},${hashToken(crypto.randomUUID())},1,1,'synthetic-checkout-upgrade','{}'::jsonb,now()+interval '1 hour') returning id`.execute(
        db,
      );
      checkoutId = checkout.rows[0]!.id;
      const order = await sql<{
        id: string;
      }>`insert into orders.orders(organization_id,order_number,checkout_session_id,currency_code,payment_method,subtotal_amount,discount_amount,total_amount)
        values(${organizationId},${`SYNTHETIC-${crypto.randomUUID()}`},${checkoutId},'BDT','COD',0,0,0) returning id`.execute(
        db,
      );
      orderId = order.rows[0]!.id;
    },
    async after(db, organizationId) {
      const retained =
        await sql`select id from orders.orders where organization_id=${organizationId} and id=${orderId} and checkout_session_id=${checkoutId}`.execute(
          db,
        );
      assert.equal(retained.rows.length, 1);
      const result = await sql<{
        name: string | null;
      }>`select to_regclass('orders.checkout_drafts')::text name`.execute(db);
      assert.equal(result.rows[0]!.name, 'orders.checkout_drafts');
      const legacy =
        await sql`select id from orders.checkout_sessions where id=${checkoutId}`.execute(db);
      assert.equal(legacy.rows.length, 1);
    },
  },
};
