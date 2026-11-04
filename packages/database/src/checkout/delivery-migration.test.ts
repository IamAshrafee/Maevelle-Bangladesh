import { afterAll, beforeAll, describe, it, expect } from 'vitest';
import { sql } from 'kysely';
import { Migrator } from 'kysely/migration';
import { migrationProvider } from '../migrations/index.js';
import { runMigrations } from '../migrate.js';
import { isolatedCartDatabase, cartFixture } from '../testing/cart-fixture.js';
import { checkoutDeliveryUpgradeCase } from './delivery-upgrade-case.js';
import { normalizeDeliveryContact } from '../customers/delivery-contact.js';

describe('Phase 02A populated 3219 upgrade and referential integrity', () => {
  let isolation: Awaited<ReturnType<typeof isolatedCartDatabase>>,
    f: Awaited<ReturnType<typeof cartFixture>>;
  beforeAll(async () => {
    isolation = await isolatedCartDatabase();
    const previous = await new Migrator({
      db: isolation.database.db,
      provider: migrationProvider,
    }).migrateTo('3219_checkout_foundation');
    if (previous.error) throw previous.error;
    f = await cartFixture(isolation.database);
    await checkoutDeliveryUpgradeCase.before(isolation.database.db, f.organizationId);
    expect((await runMigrations(isolation.database.db)).executed).toEqual([
      '3220_checkout_delivery',
    ]);
    await checkoutDeliveryUpgradeCase.after(isolation.database.db, f.organizationId);
  }, 60000);
  afterAll(async () => {
    if (isolation) await isolation.close();
  });
  it('rejects cross-tenant drafts, incomplete saved-address references and invalid contacts at the database boundary', async () => {
    const db = isolation.database.db;
    const draft = (
      await sql<{
        id: string;
      }>`select id from orders.checkout_drafts where organization_id=${f.organizationId} limit 1`.execute(
        db,
      )
    ).rows[0]!.id;
    const geo = (
      await sql<{
        id: string;
      }>`insert into geography.nodes(node_type,canonical_name) values('LOCALITY','Synthetic') returning id`.execute(
        db,
      )
    ).rows[0]!.id;
    const other = await cartFixture(isolation.database);
    const insert = (org: string, mobile = '+8801712345678') =>
      sql`insert into orders.checkout_draft_delivery(organization_id,draft_id,recipient_name,mobile,geography_node_id,country_code,address_line_1,configuration_revision)
      values(${org},${draft},'Recipient',${mobile},${geo},'BD','Address',${'x'.repeat(43)})`.execute(
        db,
      );
    await expect(insert(other.organizationId)).rejects.toMatchObject({ code: '23503' });
    await expect(insert(f.organizationId, '01712345678')).rejects.toMatchObject({ code: '23514' });
    await insert(f.organizationId);
    await expect(
      sql`update orders.checkout_draft_delivery set saved_address_id=uuidv7() where draft_id=${draft}`.execute(
        db,
      ),
    ).rejects.toMatchObject({ code: '23514' });
    const address = (
      await sql<{
        id: string;
        customer_id: string;
      }>`select id,customer_id from customers.customer_addresses where organization_id=${f.organizationId} limit 1`.execute(
        db,
      )
    ).rows[0]!;
    await expect(
      sql`update orders.checkout_draft_delivery set saved_address_id=${address.id},saved_customer_id=${address.customer_id},saved_address_revision=null where draft_id=${draft}`.execute(
        db,
      ),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      sql`update orders.checkout_draft_delivery set saved_address_id=${address.id},saved_customer_id=uuidv7(),saved_address_revision=1 where draft_id=${draft}`.execute(
        db,
      ),
    ).rejects.toMatchObject({ code: '23503' });
    await expect(
      sql`update orders.checkout_draft_delivery set geography_node_id=uuidv7() where draft_id=${draft}`.execute(
        db,
      ),
    ).rejects.toMatchObject({ code: '23503' });
    await expect(
      sql`update orders.checkout_draft_delivery set instructions=${'x'.repeat(501)} where draft_id=${draft}`.execute(
        db,
      ),
    ).rejects.toMatchObject({ code: '23514' });
  });
});
describe('Bangladesh contact domain validation', () => {
  const base = {
    recipientName: 'উম্মে হানি',
    mobile: '01712345678',
    geographyNodeId: crypto.randomUUID(),
    addressLine1: 'গ্রাম, বাড়ি ১',
  };
  it.each(['01712345678', '+8801712345678', '8801712345678', '০১৭১২৩৪৫৬৭৮'])(
    'normalizes %s through the existing identity service',
    (mobile) => {
      expect(normalizeDeliveryContact({ ...base, mobile })).toMatchObject({
        mobile: '+8801712345678',
        recipientName: base.recipientName,
      });
    },
  );
  it('preserves shaping joiners and emoji while rejecting controls, bidi overrides and lone surrogates', () => {
    expect(normalizeDeliveryContact({ ...base, addressLine1: 'বাড়ি\u200d 🏠' }).addressLine1).toBe(
      'বাড়ি\u200d 🏠'.normalize('NFC'),
    );
    for (const name of ['a\u0000', 'a\u202e', 'a\ud800'])
      expect(() => normalizeDeliveryContact({ ...base, recipientName: name })).toThrow();
  });
});
