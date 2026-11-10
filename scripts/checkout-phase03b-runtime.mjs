import { fixtureSigningSecret, fixturePassword } from './fixtures/browser-credentials.mjs';
import { randomUUID } from 'node:crypto';
/** Isolated synthetic runtime; never uses .env or a persistent database. */
import { writeFileSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import { join } from 'node:path';
import { parseConfig } from '../packages/config/dist/src/index.js';
import {
  isolatedCartDatabase,
  cartFixture,
} from '../packages/database/dist/src/testing/cart-fixture.js';
import { runMigrations } from '../packages/database/dist/src/migrate.js';
import { sql } from '../packages/database/dist/src/index.js';
import { rebuildStorefrontSearch } from '../packages/database/dist/src/storefront.js';
import { createPromotion, createCouponCode } from '../packages/database/dist/src/promotions.js';
import { setCurrentVariantPrice } from '../packages/database/dist/src/pricing.js';
import { createCheckoutQuote } from '../packages/database/dist/src/checkout/index.js';
import { checkoutGuestAuthority } from '../apps/api/dist/src/routes/checkout-context.js';
import { buildApi } from '../apps/api/dist/src/app.js';

if (
  process.env.TEST_DATABASE_URL !== 'postgresql://checkout_fixture@127.0.0.1:55445/maevelle_test' ||
  !process.env.CHECKOUT_03B_OUTPUT
)
  throw new Error('Explicit local disposable Checkout03B cluster and output directory required.');
const isolated = await isolatedCartDatabase();
const identity =
  await sql`select current_database(),current_user,inet_server_addr(),inet_server_port(),version()`.execute(
    isolated.database.db,
  );
console.log('Disposable browser target', JSON.stringify(identity.rows));
await runMigrations(isolated.database.db);
const fixture = await cartFixture(isolated.database);
await rebuildStorefrontSearch(isolated.database.db, fixture.organizationId);
const country = (
  await sql`insert into geography.nodes(node_type,canonical_name,country_code) values('COUNTRY','Synthetic Bangladesh','BD') returning id`.execute(
    isolated.database.db,
  )
).rows[0].id;
const district = (
  await sql`insert into geography.nodes(node_type,canonical_name) values('DISTRICT','Synthetic Dhaka') returning id`.execute(
    isolated.database.db,
  )
).rows[0].id;
await sql`update geography.nodes set parent_id=${country} where id=${district}`.execute(
  isolated.database.db,
);
const areaRows = (
  await sql`insert into geography.nodes(parent_id,node_type,canonical_name,local_name)
 select ${district},'LOCALITY','Synthetic Area '||lpad(n::text,2,'0'),'পরীক্ষা এলাকা '||n::text from generate_series(1,25) n returning id,canonical_name`.execute(
    isolated.database.db,
  )
).rows;
await sql`insert into delivery.delivery_methods(organization_id,code,name,method_type) values(${fixture.organizationId},'HOME_DELIVERY','Synthetic home delivery','HOME_DELIVERY')`.execute(
  isolated.database.db,
);
const policy = (
  await sql`insert into orders.delivery_pricing_rules(organization_id,name,country_code,geography_node_id,flat_amount,currency_code,priority,checkout_serviceability)
 values(${fixture.organizationId},'Synthetic confirmed coverage','BD',${district},0,'BDT',10,'SUPPORTED') returning id`.execute(
    isolated.database.db,
  )
).rows[0].id;
const offer = await createPromotion(isolated.database.db, {
  organizationId: fixture.organizationId,
  actorId: fixture.actorId,
  name: 'Synthetic ten percent',
  promotionType: 'COUPON',
  combinability: 'STACKABLE',
  benefitType: 'PERCENTAGE_DISCOUNT',
  benefitValue: '10',
});
await createCouponCode(isolated.database.db, {
  organizationId: fixture.organizationId,
  actorId: fixture.actorId,
  promotionId: offer.id,
  code: 'SYNTH10',
  usageLimitTotal: 1,
});
const mailbox = [];
const config = parseConfig({
  NODE_ENV: 'test',
  DATABASE_URL: isolated.url,
  TEST_DATABASE_URL: isolated.url,
  BETTER_AUTH_SECRET: fixtureSigningSecret(),
  AUTH_ENCRYPTION_KEY: Buffer.alloc(32, 29).toString('base64'),
  STOREFRONT_ORGANIZATION_CODE: fixture.code,
  STOREFRONT_BASE_URL: 'http://localhost:3000',
  BETTER_AUTH_URL: 'http://localhost:3000',
  CHECKOUT_DRAFTS_ENABLED: 'true',
  API_HOST: '127.0.0.1',
  API_PORT: '3002',
});
const api = buildApi({
  database: isolated.database,
  config,
  logger: false,
  shopperAuthEmailSender: async (value) => {
    mailbox.push(value);
  },
});
// Test control surface is registered only in this standalone loopback fixture.
let fault = null;
api.addHook('preHandler', async (request, reply) => {
  if (
    request.method === 'POST' &&
    /^\/storefront\/v1\/checkouts\/[^/]+\/quotes/.test(request.url) &&
    fault === 'rate-limit'
  ) {
    fault = null;
    reply.header('retry-after', '2').code(429);
    return {
      error: { code: 'RATE_LIMITED', message: 'Synthetic test limit', requestId: request.id },
    };
  }
});
api.addHook('onSend', async (request, reply, payload) => {
  if (
    request.method === 'POST' &&
    /^\/storefront\/v1\/checkouts\/[^/]+\/quotes/.test(request.url) &&
    reply.statusCode < 300 &&
    fault
  ) {
    const current = fault;
    fault = null;
    if (current === 'lost-response') {
      reply.code(503).header('retry-after', '2');
      return JSON.stringify({
        error: { code: 'UNAVAILABLE', message: 'Synthetic response loss', requestId: request.id },
      });
    }
    if (current === 'delay-response') await new Promise((resolve) => setTimeout(resolve, 8000));
    if (current === 'supersede') {
      const q = JSON.parse(payload).data;
      const owner = checkoutGuestAuthority(request, config, fixture.organizationId);
      await createCheckoutQuote(
        isolated.database.db,
        owner,
        q.draftId,
        { revision: q.draftRevision, couponCodes: q.facts.coupons.map((c) => c.code) },
        randomUUID(),
      );
    }
  }
  return payload;
});
api.post('/__checkout03b/control', async (request) => {
  const body = request.body ?? {};
  if (['lost-response', 'delay-response', 'rate-limit', 'supersede'].includes(body.fault))
    fault = body.fault;
  if (body.price !== undefined)
    await setCurrentVariantPrice(isolated.database.db, {
      organizationId: fixture.organizationId,
      actorId: fixture.actorId,
      variantId: fixture.variantId,
      currency: 'BDT',
      amount: String(body.price),
    });
  if (body.promotionStatus)
    await sql`update promotions.promotions set status=${body.promotionStatus},version=version+1 where id=${offer.id}`.execute(
      isolated.database.db,
    );
  if (body.shipping !== undefined)
    await sql`update orders.delivery_pricing_rules set flat_amount=${String(body.shipping)}::numeric,version=version+1 where id=${policy}`.execute(
      isolated.database.db,
    );
  if (body.stock !== undefined)
    await sql`update inventory.inventory_levels set sellable_quantity=${String(body.stock)}::numeric where organization_id=${fixture.organizationId}`.execute(
      isolated.database.db,
    );
  if (body.shortLifetime)
    await sql`update orders.checkout_drafts set expires_at=clock_timestamp()+(${body.shortLifetime}::integer*interval '1 second') where status='ACTIVE'`.execute(
      isolated.database.db,
    );
  if (body.coverage)
    await sql`update orders.delivery_pricing_rules set checkout_serviceability=${body.coverage},version=version+1 where id=${policy}`.execute(
      isolated.database.db,
    );
  if (body.expire)
    await sql`update orders.checkout_drafts set expires_at=clock_timestamp()-interval '1 second'`.execute(
      isolated.database.db,
    );
  if (body.conflict)
    await sql`update orders.checkout_drafts set revision=revision+1`.execute(isolated.database.db);
  return { data: { configured: true } };
});
api.get('/__checkout03b/facts', async () => ({
  data: (
    await sql`
  select (select count(*) from orders.checkout_drafts)::integer drafts,
    (select count(*) from orders.orders)::integer orders,
    (select count(*) from inventory.inventory_reservations)::integer reservations,
    (select count(*) from payments.payment_intents)::integer obligations,
    (select count(*) from promotions.promotion_usage)::integer redemptions,
    (select count(*) from cart.carts where status='CONVERTED')::integer converted,
    (select count(*) from platform.outbox_events where event_type='orders.order.placed')::integer purchases,
    (select count(*) from payments.payments where status='CONFIRMED')::integer confirmed_payments,
    (select count(*) from finance.finance_transactions)::integer finance_postings,
    (select count(*) from analytics.storefront_events where event_name in ('ORDER_PLACED','PAYMENT_CONFIRMED'))::integer purchase_events,
    (select count(*) from orders.checkout_quotes)::integer quotes,
    (select count(*) from orders.checkout_quote_acknowledgements)::integer acknowledgements`.execute(
      isolated.database.db,
    )
  ).rows[0],
}));
api.post('/__checkout03b/expire-drafts', async () => {
  await sql`update orders.checkout_drafts set expires_at=clock_timestamp()-interval '1 second'`.execute(
    isolated.database.db,
  );
  return { data: true };
});
api.post('/__checkout03b/expire-guests', async () => {
  await sql`update orders.checkout_guest_sessions set expires_at=clock_timestamp()-interval '1 second'`.execute(
    isolated.database.db,
  );
  return { data: true };
});
api.post('/__checkout03b/stop', async () => {
  setTimeout(() => void close(), 100);
  return { data: true };
});
for (const letter of ['a', 'b']) {
  const email = `checkout03b-${letter}@example.test`,
    password = fixturePassword;
  const signup = await api.inject({
    method: 'POST',
    url: '/shopper-auth/sign-up/email',
    headers: { origin: config.storefrontBaseUrl },
    payload: { name: `Synthetic ${letter}`, email, password },
  });
  if (signup.statusCode !== 200) throw new Error(`Fixture signup failed ${signup.statusCode}`);
  const url = new URL(mailbox.find((m) => m.to === email).text.match(/https?:\/\/\S+/)[0]);
  await api.inject({ method: 'GET', url: url.pathname + url.search });
  const user = (
    await sql`select id from iam.users where email=${email}`.execute(isolated.database.db)
  ).rows[0].id;
  const { resolveOrEnrollShopper } = await import('../packages/database/dist/src/shopper.js');
  const principal = await resolveOrEnrollShopper(
    isolated.database.db,
    fixture.organizationId,
    user,
  );
  await sql`insert into customers.customer_addresses(organization_id,customer_id,recipient_name,phone,address_line_1,country_code,geography_node_id,is_default)
    select ${fixture.organizationId},${principal.customerId},${`Synthetic ${letter.toUpperCase()}`}||' '||n,'+8801712345678',${`Synthetic ${letter.toUpperCase()} private address `}||n,'BD',${areaRows[0].id},n=1
    from generate_series(1,${letter === 'a' ? 23 : 1}::integer)n`.execute(isolated.database.db);
}
await api.listen({ host: '127.0.0.1', port: 3002 });
writeFileSync(
  join(process.env.CHECKOUT_03B_OUTPUT, 'fixture.json'),
  JSON.stringify({
    handle: fixture.code,
    variantId: fixture.variantId,
    organizationId: fixture.organizationId,
    areaId: areaRows[0].id,
  }),
);
console.log('Isolated Checkout03B API ready on loopback 3002');
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  await api.close();
  await isolated.close();
  process.exit(0);
}
process.on('SIGTERM', () => void close());
process.on('SIGINT', () => void close());
