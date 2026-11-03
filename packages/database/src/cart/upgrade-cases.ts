/** CI fixtures for Cart foundation and the credential security cutover. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import { hashToken } from '@maevelle/security';
import type { UpgradeCase } from '../upgrade-cases.js';
let cartId = '';
let receiptId = '';
const digest = hashToken('synthetic-cart-upgrade-only');
export const cartUpgradeCases: Record<string, UpgradeCase> = {
  '3213_cart_foundation': {
    async before(db, organizationId) {
      cartId = randomUUID();
      receiptId = randomUUID();
      const type = await sql<{
        id: string;
      }>`insert into catalog.product_types(organization_id,code,name) values(${organizationId},'cart-upgrade','Cart upgrade') returning id`.execute(
        db,
      );
      const product = await sql<{
        id: string;
      }>`insert into catalog.products(organization_id,product_type_id,handle,title) values(${organizationId},${type.rows[0]!.id},'cart-upgrade','Cart upgrade') returning id`.execute(
        db,
      );
      const variant = await sql<{
        id: string;
      }>`insert into catalog.product_variants(organization_id,product_id,sku,sku_normalized,option_signature) values(${organizationId},${product.rows[0]!.id},'CART-UPGRADE','CART-UPGRADE','default') returning id`.execute(
        db,
      );
      await sql`insert into cart.carts(id,organization_id,public_token_hash,currency_code,expires_at,version) values(${cartId},${organizationId},${digest},'BDT',now()+interval '1 day',3)`.execute(
        db,
      );
      await sql`insert into cart.cart_lines(organization_id,cart_id,variant_id,quantity) values(${organizationId},${cartId},${variant.rows[0]!.id},2)`.execute(
        db,
      );
      await sql`insert into platform.idempotency_records(id,organization_id,principal_type,principal_id,operation_type,idempotency_key,request_fingerprint,status,safe_response,completed_at) values(${receiptId},${organizationId},'GUEST_CART',${cartId},'cart.add_line',${randomUUID()},'synthetic','SUCCEEDED','{}'::jsonb,now())`.execute(
        db,
      );
    },
    async after(db) {
      const rows = await sql<{
        owner_context: string;
        owner_account_id: string | null;
        public_token_hash: string;
      }>`select owner_context,owner_account_id,public_token_hash from cart.carts where id=${cartId}`.execute(
        db,
      );
      assert.match(rows.rows[0]!.owner_context, /^[0-9a-f-]{36}$/);
      assert.equal(rows.rows[0]!.owner_account_id, null);
      assert.equal(rows.rows[0]!.public_token_hash, digest);
    },
  },
  '3214_cart_credential_retirement': {
    async before(db) {
      const rows = await sql<{
        count: number;
      }>`select count(*)::int count from cart.carts where id=${cartId} and public_token_hash=${digest}`.execute(
        db,
      );
      assert.equal(rows.rows[0]!.count, 1);
    },
    async after(db, organizationId) {
      const rows = await sql<{
        credential_state: string;
        public_token_hash: string;
        version: string;
        quantity: string;
        receipts: number;
      }>`select credential_state,public_token_hash,version::text,(select quantity::text from cart.cart_lines where cart_id=c.id) quantity,(select count(*)::int from platform.idempotency_records where id=${receiptId}) receipts from cart.carts c where id=${cartId}`.execute(
        db,
      );
      assert.deepEqual(rows.rows[0], {
        credential_state: 'RETIRED',
        public_token_hash: 'retired:' + digest,
        version: '3',
        quantity: '2.000000',
        receipts: 1,
      });
      await assert.rejects(
        () =>
          sql`update cart.carts set credential_state='SLOT_V1',public_token_hash=${digest} where id=${cartId}`.execute(
            db,
          ),
        /not permitted/,
      );
      await assert.rejects(
        () =>
          sql`insert into cart.carts(organization_id,public_token_hash,currency_code,expires_at) values(${organizationId},${hashToken(randomUUID())},'BDT',now()+interval '1 day')`.execute(
            db,
          ),
        /cart_credential_state_check/,
      );
      await sql`insert into cart.carts(organization_id,public_token_hash,currency_code,expires_at,credential_state) values(${organizationId},${hashToken(randomUUID())},'BDT',now()+interval '1 day','SLOT_V1')`.execute(
        db,
      );
    },
  },
  '3215_cart_integrity': {
    async before(db) {
      const rows = await sql<{
        quantity: string;
      }>`select quantity::text from cart.cart_lines where cart_id=${cartId}`.execute(db);
      assert.equal(rows.rows[0]!.quantity, '2.000000');
    },
    async after(db) {
      const rows = await sql<{
        quantity: string;
      }>`select quantity::text from cart.cart_lines where cart_id=${cartId}`.execute(db);
      assert.equal(rows.rows[0]!.quantity, '2.000000');
      await assert.rejects(
        () => sql`update cart.cart_lines set quantity=0.5 where cart_id=${cartId}`.execute(db),
        /cart_line_discrete_quantity/,
      );
      await assert.rejects(
        () => sql`update cart.cart_lines set quantity=100 where cart_id=${cartId}`.execute(db),
        /cart_line_discrete_quantity/,
      );
    },
  },
};
