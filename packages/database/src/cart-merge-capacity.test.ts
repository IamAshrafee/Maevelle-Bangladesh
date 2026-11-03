import { afterAll, beforeAll, expect, it } from 'vitest';
import { sql, type KyselyPlugin } from 'kysely';
import { createGuestCart, establishAccountCart, previewCartMerge } from './cart.js';
import { runMigrations } from './migrate.js';
import { resolveOrEnrollShopper } from './shopper.js';
import { cartFixture, isolatedCartDatabase } from './testing/cart-fixture.js';

let isolation: Awaited<ReturnType<typeof isolatedCartDatabase>>;
beforeAll(async () => {
  isolation = await isolatedCartDatabase();
  await runMigrations(isolation.database.db);
}, 30_000);
afterAll(async () => isolation?.close());

it('bounds a stocked merge preview at 100 combined lines without per-line database round trips', async () => {
  const { database } = isolation;
  const { organizationId, productId } = await cartFixture(database);
  const db = database.db;
  const user = await sql<{ id: string }>`
    insert into iam.users(name,email,email_normalized,email_verified)
    values('Synthetic capacity','capacity@example.test','capacity@example.test',true) returning id
  `.execute(db);
  const principal = await resolveOrEnrollShopper(db, organizationId, user.rows[0]!.id);
  expect(principal).toBeTruthy();
  const owner = { ...principal!, currency: 'BDT' };
  const account = await establishAccountCart(db, owner);
  const guest = await createGuestCart(db, { organizationId, currency: 'BDT' });
  const selection = {
    ownerContext: account.ownerContext,
    guestCartId: guest.cart.id,
    guestOwnerContext: guest.cart.ownerContext,
  };
  const variants = await sql<{ id: string }>`
    with products as (
      insert into catalog.products (organization_id,product_type_id,handle,title,status,publication_status,published_at)
      select product.organization_id,product.product_type_id,'merge-capacity-'||n,'Synthetic merge variant',
        'ACTIVE','PUBLISHED',now()
      from catalog.products product cross join generate_series(1,101) n where product.id=${productId}
      returning id,organization_id,handle
    )
    insert into catalog.product_variants(organization_id,product_id,sku,sku_normalized,option_signature)
    select organization_id,id,upper(handle),upper(handle),'default' from products returning id
  `.execute(db);
  const ids = variants.rows.map((row) => row.id);
  await sql`
    insert into pricing.price_definitions(organization_id,variant_id,currency_code,amount,effective_from,status)
    select ${organizationId}, id,'BDT',10,now()-interval '1 day','ACTIVE'
    from unnest(${ids}::uuid[]) id
  `.execute(db);
  await sql`
    with items as (
      insert into inventory.inventory_items(organization_id,variant_id)
      select ${organizationId},id from unnest(${ids}::uuid[]) id returning id,organization_id
    )
    insert into inventory.inventory_levels(organization_id,inventory_item_id,location_id,sellable_quantity)
    select items.organization_id,items.id,location.id,5
    from items join warehouse.locations location on location.organization_id=items.organization_id
    where location.code='TEST'
  `.execute(db);
  const insertLines = (cartId: string, variantIds: string[]) =>
    sql`
    insert into cart.cart_lines(organization_id,cart_id,variant_id,quantity)
    select ${organizationId},${cartId},id,1 from unnest(${variantIds}::uuid[]) id
    on conflict (cart_id,variant_id) do nothing
  `.execute(db);

  let queries = 0;
  const counter: KyselyPlugin = {
    transformQuery({ node }) {
      queries++;
      return node;
    },
    async transformResult({ result }) {
      return result;
    },
  };
  const measured = db.withPlugin(counter);
  const samples = [];
  for (const side of [1, 10, 50]) {
    await insertLines(account.id, ids.slice(0, side));
    await insertLines(guest.cart.id, ids.slice(50, 50 + side));
    const times = [];
    for (let attempt = 0; attempt < 5; attempt++) {
      queries = 0;
      const start = performance.now();
      const preview = await previewCartMerge(measured, owner, selection, guest.token);
      times.push(performance.now() - start);
      expect(preview.projected?.lines).toHaveLength(side * 2);
      expect(preview.projected?.merchandiseNet).toBe((side * 20).toFixed(4));
    }
    samples.push({
      lines: side * 2,
      queries,
      medianMs: Number(times.sort((a, b) => a - b)[2]!.toFixed(2)),
    });
  }
  expect(new Set(samples.map((sample) => sample.queries)).size).toBe(1);
  console.log('Account Cart merge preview samples', JSON.stringify(samples));

  await insertLines(guest.cart.id, ids.slice(100));
  const review = await previewCartMerge(db, owner, selection, guest.token);
  expect(review.blockers).toEqual(['LINE_LIMIT']);
  expect(review.projected).toBeNull();
  expect(review.account.lines).toHaveLength(50);
  expect(review.guest.lines).toHaveLength(51);
});
