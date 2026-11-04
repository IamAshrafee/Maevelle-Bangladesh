import { afterAll, beforeAll, describe, it, expect } from 'vitest';
import { sql } from 'kysely';
import { runMigrations } from '../migrate.js';
import { isolatedCartDatabase, cartFixture } from '../testing/cart-fixture.js';
import { deliveryAreasQuery, searchDeliveryAreas } from '../geography-delivery.js';
import { deliveryServiceability } from '../orders/delivery-serviceability.js';
import { createCheckoutGuestSession } from './authority.js';
import { createCheckoutDraft } from './commands.js';
import { updateCheckoutDelivery, getCheckoutDelivery } from './delivery.js';
import type { CheckoutAuthority } from './types.js';

describe('isolated Phase 02A bounded-query synthetic measurements', () => {
  let isolation: Awaited<ReturnType<typeof isolatedCartDatabase>>,
    f: Awaited<ReturnType<typeof cartFixture>>,
    area: string;
  beforeAll(async () => {
    isolation = await isolatedCartDatabase();
    const db = isolation.database.db;
    await runMigrations(db);
    f = await cartFixture(isolation.database);
    const country = (
      await sql<{
        id: string;
      }>`insert into geography.nodes(node_type,canonical_name,country_code) values('COUNTRY','Synthetic BD','BD') returning id`.execute(
        db,
      )
    ).rows[0]!.id;
    const district = (
      await sql<{
        id: string;
      }>`insert into geography.nodes(parent_id,node_type,canonical_name) values(${country},'DISTRICT','Synthetic district') returning id`.execute(
        db,
      )
    ).rows[0]!.id;
    await sql`insert into geography.nodes(parent_id,node_type,canonical_name) select ${district},'LOCALITY','Synthetic area '||n from generate_series(1,2500) n`.execute(
      db,
    );
    area = (
      await sql<{
        id: string;
      }>`select id from geography.nodes where parent_id=${district} limit 1`.execute(db)
    ).rows[0]!.id;
    await sql`insert into orders.delivery_pricing_rules(organization_id,name,country_code,geography_node_id,flat_amount,currency_code,checkout_serviceability) values(${f.organizationId},'Synthetic','BD',${district},0,'BDT','SUPPORTED')`.execute(
      db,
    );
    await sql`insert into delivery.delivery_methods(organization_id,code,name,method_type) values(${f.organizationId},'HOME_DELIVERY','Synthetic','HOME_DELIVERY')`.execute(
      db,
    );
  }, 60000);
  afterAll(async () => {
    if (isolation) await isolation.close();
  });
  it('measures single-query lookups and full fenced draft updates without claiming production benchmarks', async () => {
    let count = 0;
    const db = isolation.database.db.withPlugin({
      transformQuery(args) {
        count++;
        return args.node;
      },
      async transformResult(args) {
        return args.result;
      },
    });
    const context = { organizationId: f.organizationId, currency: 'BDT' };
    const guest = await createCheckoutGuestSession(db, context);
    const owner: CheckoutAuthority = {
      kind: 'GUEST',
      organizationId: f.organizationId,
      sessionId: guest.session.id,
      token: guest.token,
    };
    const draft = await createCheckoutDraft(
      db,
      context,
      owner,
      { source: { kind: 'BUY_NOW', variantId: f.variantId, quantity: '1' } },
      crypto.randomUUID(),
    );
    const plan =
      await sql`explain (analyze, buffers, format json) ${deliveryAreasQuery({ ...context, query: 'Synthetic area', offset: 0 })}`.execute(
        db,
      );
    const details = (
      plan.rows[0] as {
        'QUERY PLAN': { 'Execution Time': number; Plan: { 'Shared Hit Blocks': number } }[];
      }
    )['QUERY PLAN'][0]!;
    console.info(
      'CHECKOUT_02A_SEARCH_PLAN',
      JSON.stringify({
        executionMs: details['Execution Time'],
        sharedHitBlocks: details.Plan['Shared Hit Blocks'],
      }),
    );
    const samples: Record<
      string,
      { p50Ms: number; p95Ms: number; queries: number; maxBytes: number }
    > = {};
    let revision = '1';
    const actions = {
      serviceability: () => deliveryServiceability(db, { ...context, geographyNodeId: area }),
      search: () => searchDeliveryAreas(db, { ...context, query: 'Synthetic area', offset: 0 }),
      update: async () => {
        const result = await updateCheckoutDelivery(
          db,
          owner,
          draft.id,
          {
            revision,
            delivery: {
              recipientName: 'Synthetic shopper',
              mobile: '01712345678',
              addressLine1: 'Synthetic address',
              geographyNodeId: area,
            },
          },
          crypto.randomUUID(),
        );
        revision = result.revision;
        return result;
      },
      restore: () => getCheckoutDelivery(db, owner, draft.id),
    };
    for (const [name, run] of Object.entries(actions)) {
      const times: number[] = [];
      let queryCount = 0,
        maxBytes = 0;
      for (let i = 0; i < 25; i++) {
        count = 0;
        const started = performance.now();
        const result = await run();
        const elapsed = performance.now() - started;
        if (i >= 5) {
          times.push(elapsed);
          queryCount = count;
          maxBytes = Math.max(maxBytes, Buffer.byteLength(JSON.stringify(result)));
        }
      }
      times.sort((a, b) => a - b);
      samples[name] = {
        p50Ms: Number(times[10]!.toFixed(2)),
        p95Ms: Number(times[18]!.toFixed(2)),
        queries: queryCount,
        maxBytes,
      };
    }
    expect(samples.serviceability!.queries).toBe(1);
    expect(samples.search!.queries).toBe(1);
    const page = await actions.search();
    expect(page.items).toHaveLength(20);
    expect(page.nextOffset).toBe(20);
    console.info(
      'CHECKOUT_02A_SYNTHETIC_MEASUREMENTS',
      JSON.stringify({
        postgresMajor: 18,
        areaNodes: 2500,
        samplesPerOperation: 20,
        concurrency: 1,
        samples,
      }),
    );
  }, 30000);
});
