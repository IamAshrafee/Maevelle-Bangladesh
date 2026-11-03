import { upgradeCases } from '../../upgrade-cases.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Migrator } from 'kysely/migration';
import { createDatabase, sql, type DatabaseClient } from '../../index.js';
import { migrationProvider } from '../../migrations/index.js';
import { createOrganization } from '../../platform.js';
import {
  saveWishlistProduct,
  removeWishlistProduct,
  mergeGuestWishlist,
  getWishlistPage,
  type WishlistOwner,
} from '../../wishlist/account.js';
import {
  createShare,
  claimGuestShare,
  manageAccountShare,
  manageGuestShare,
  rotateAccountShareLink,
  cleanupWishlistShares,
} from '../../wishlist/share-lifecycle.js';
import { shareToken } from '../../wishlist/share-crypto.js';
import { getWishlistAnalytics } from './reporting.js';
import { recordWishlistOutcome } from './events.js';
import {
  processWishlistAnalyticsOutbox,
  cleanupWishlistAnalytics,
  recordExpiredWishlistShares,
} from './processing.js';
import { ingestStorefrontEvent } from '../behavioral.js';
import { validateWishlistObservation } from './observations.js';
import type { WishlistObservationDto } from '@maevelle/contracts';

const url = process.env.TEST_DATABASE_URL!;
const name = `maevelle_analytics_${crypto.randomUUID().replaceAll('-', '')}`;
let admin: DatabaseClient;
let database: DatabaseClient;
let organizationId: string;
let owner: WishlistOwner;
let productId: string;
let variantId: string;
let legacyShare: string;
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka' }).format(new Date());
const period = { from: today, to: today };

async function makeOwner(org = organizationId): Promise<WishlistOwner> {
  const user = await sql<{
    id: string;
  }>`insert into iam.users(name,email,email_verified) values ('Analytics fixture',${`${crypto.randomUUID()}@example.test`},true) returning id::text`.execute(
    database.db,
  );
  const customer = await sql<{
    id: string;
  }>`insert into customers.customers(organization_id,customer_number,display_name) values (${org},${crypto.randomUUID()},'Analytics fixture') returning id::text`.execute(
    database.db,
  );
  const account = await sql<{
    id: string;
  }>`insert into customers.customer_accounts(organization_id,customer_id,user_id,link_type,status)
    values (${org},${customer.rows[0]!.id}::uuid,${user.rows[0]!.id}::uuid,'GUEST_CONVERSION','ACTIVE') returning id::text`.execute(
    database.db,
  );
  return { organizationId: org, accountId: account.rows[0]!.id };
}
async function counts() {
  const rows = await sql<{
    event_type: string;
    count: number;
  }>`select event_type,count(*)::int count from platform.outbox_events where organization_id=${organizationId} and aggregate_type='wishlist.analytics' group by event_type`.execute(
    database.db,
  );
  return Object.fromEntries(rows.rows.map((r) => [r.event_type, r.count]));
}
function observation(): WishlistObservationDto {
  return {
    schemaVersion: 1,
    eventId: crypto.randomUUID(),
    name: 'WISHLIST_PAGE_VIEWED',
    origin: 'BROWSER',
    occurredAt: new Date().toISOString(),
    sessionId: crypto.randomUUID(),
    consent: {
      necessary: 'GRANTED',
      analytics: 'GRANTED',
      marketing: 'DENIED',
      preferences: 'UNKNOWN',
      recordedAt: new Date().toISOString(),
    },
    data: { mode: 'GUEST' },
  };
}

beforeAll(async () => {
  if (
    !url ||
    new URL(url).pathname !== '/maevelle_test' ||
    (!['localhost', '127.0.0.1'].includes(new URL(url).hostname) &&
      !/^maevelle-ci-pg-[a-f0-9]{12}$/.test(new URL(url).hostname))
  )
    throw new Error(
      'Use a local or dedicated Maevelle CI test PostgreSQL source named maevelle_test',
    );
  const a = new URL(url);
  a.pathname = '/postgres';
  admin = createDatabase({ connectionString: a.toString(), maxConnections: 1 });
  await sql.raw(`create database "${name}"`).execute(admin.db);
  const d = new URL(url);
  d.pathname = `/${name}`;
  database = createDatabase({ connectionString: d.toString(), maxConnections: 8 });
  const migrator = new Migrator({ db: database.db, provider: migrationProvider });
  const before = await migrator.migrateTo('3211_wishlist_share_receipt_tombstones');
  if (before.error) throw before.error;
  organizationId = (
    await createOrganization(database.db, {
      code: 'analytics-wishlist',
      displayName: 'Analytics',
      timezone: 'Asia/Dhaka',
      defaultLocale: 'en',
      defaultCurrency: 'BDT',
    })
  ).id;
  owner = await makeOwner();
  const type = await sql<{
    id: string;
  }>`insert into catalog.product_types(organization_id,code,name) values (${organizationId},'test','Test') returning id::text`.execute(
    database.db,
  );
  const product = await sql<{
    id: string;
  }>`insert into catalog.products(organization_id,product_type_id,handle,title,status,publication_status,published_at)
    values (${organizationId},${type.rows[0]!.id}::uuid,'analytics-product','Product','ACTIVE','PUBLISHED',now()) returning id::text`.execute(
    database.db,
  );
  productId = product.rows[0]!.id;
  const variant = await sql<{
    id: string;
  }>`insert into catalog.product_variants(organization_id,product_id,sku,sku_normalized,option_signature)
    values (${organizationId},${productId}::uuid,'ANALYTICS','ANALYTICS','default') returning id::text`.execute(
    database.db,
  );
  variantId = variant.rows[0]!.id;
  await sql`insert into search.catalog_documents(organization_id,product_id,handle,title,search_text,published_at,available)
    values (${organizationId},${productId}::uuid,'analytics-product','Product','Product',now(),true)`.execute(
    database.db,
  );
  // Seed prior-release rows directly: running new command code before migration would be invalid.
  const list = await sql<{
    id: string;
  }>`insert into wishlist.account_lists(organization_id,owner_account_id) values (${organizationId},${owner.accountId}::uuid) returning id::text`.execute(
    database.db,
  );
  await sql`insert into wishlist.account_items(organization_id,wishlist_id,product_id) values (${organizationId},${list.rows[0]!.id}::uuid,${productId}::uuid)`.execute(
    database.db,
  );
  const share = await sql<{
    id: string;
  }>`insert into wishlist.shares(organization_id,view_token_digest,manage_token_digest,expires_at)
    values (${organizationId},${Buffer.alloc(32, 1)},${Buffer.alloc(32, 2)},now()+interval '30 days') returning id::text`.execute(
    database.db,
  );
  legacyShare = share.rows[0]!.id;
  await upgradeCases['3212_wishlist_analytics']!.before(database.db, organizationId);
  const upgrade = await migrator.migrateToLatest();
  if (upgrade.error) throw upgrade.error;
  await upgradeCases['3212_wishlist_analytics']!.after(database.db, organizationId);
}, 30000);
afterAll(async () => {
  await database?.close();
  if (admin) {
    await sql.raw(`drop database if exists "${name}"`).execute(admin.db);
    await admin.close();
  }
});

describe('Wishlist analytics database, events and Worker', () => {
  it('preserves populated upgrade without inventing legacy activity or scope', async () => {
    expect((await getWishlistPage(database.db, owner)).count).toBe(1);
    expect(await counts()).toEqual({});
    const row = await sql<{
      creation_scope: string;
    }>`select creation_scope from wishlist.shares where id=${legacyShare}::uuid`.execute(
      database.db,
    );
    expect(row.rows[0]!.creation_scope).toBe('UNKNOWN');
    expect(
      (await getWishlistAnalytics(database.db, organizationId, 'summary', period)).result
        .savedItems,
    ).toBe(1);
  });
  it('suppresses no-ops and preferences, deduplicates concurrent saves/removes and merge replay', async () => {
    await saveWishlistProduct(database.db, owner, productId);
    await saveWishlistProduct(database.db, owner, productId, { preferredVariantId: variantId });
    expect(await counts()).toEqual({});
    await Promise.all([
      removeWishlistProduct(database.db, owner, productId),
      removeWishlistProduct(database.db, owner, productId),
    ]);
    await Promise.all([
      saveWishlistProduct(database.db, owner, productId),
      saveWishlistProduct(database.db, owner, productId),
    ]);
    expect(await counts()).toMatchObject({ 'wishlist.item.saved': 1, 'wishlist.item.removed': 1 });
    await removeWishlistProduct(database.db, owner, productId);
    const input = {
      mergeId: crypto.randomUUID(),
      baseVersion: (await getWishlistPage(database.db, owner)).version,
      items: [{ productId, preferredVariantId: null, savedAt: new Date().toISOString() }],
    };
    await Promise.all([
      mergeGuestWishlist(database.db, owner, input),
      mergeGuestWishlist(database.db, owner, input),
    ]);
    expect(await counts()).toMatchObject({
      'wishlist.item.saved': 2,
      'wishlist.item.removed': 2,
      'wishlist.merge.completed': 1,
    });
  });
  it('rolls back event production and failed mutation together', async () => {
    const before = await counts();
    await expect(
      database.db.transaction().execute(async (tx) => {
        await recordWishlistOutcome(tx, organizationId, {
          name: 'wishlist.item.saved',
          productId,
          source: 'MANUAL',
        });
        throw new Error('Injected rollback');
      }),
    ).rejects.toThrow('Injected rollback');
    await expect(
      saveWishlistProduct(database.db, owner, crypto.randomUUID()),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(await counts()).toEqual(before);
  });
  it('projects concurrently and on retry exactly once; shows lag and local timezone buckets', async () => {
    expect(
      (await getWishlistAnalytics(database.db, organizationId, 'activity', period)).metadata
        .projection,
    ).toBe('LAGGING');
    await Promise.all([
      processWishlistAnalyticsOutbox(database.db),
      processWishlistAnalyticsOutbox(database.db),
    ]);
    expect(await processWishlistAnalyticsOutbox(database.db)).toBe(0);
    const trends = await getWishlistAnalytics(database.db, organizationId, 'activity', period);
    expect(trends.result.reduce((n, r) => n + r.saved, 0)).toBe(2);
    expect(trends.result.reduce((n, r) => n + r.mergeAdditions, 0)).toBe(1);
    expect(trends.metadata.timezone).toBe('Asia/Dhaka');
    await recordWishlistOutcome(
      database.db,
      organizationId,
      { name: 'wishlist.merge.completed' },
      new Date(Date.parse(`${today}T00:00:00Z`) - 5 * 3600000),
    );
    await processWishlistAnalyticsOutbox(database.db);
    expect(
      (await getWishlistAnalytics(database.db, organizationId, 'activity', period)).result.find(
        (r) => r.day === today,
      )!.merges,
    ).toBeGreaterThanOrEqual(1);
  });
  it('records lifecycle changes once and keeps origin separate from claim', async () => {
    const options = {
      operationId: shareToken(),
      expiresAt: new Date(Date.now() + 30 * 86400000).toISOString(),
      key: Buffer.alloc(32, 3),
    };
    const shares = await Promise.all([
      createShare(database.db, organizationId, [{ productId }], options),
      createShare(database.db, organizationId, [{ productId }], options),
    ]);
    expect(shares[0]).toEqual(shares[1]);
    const share = shares[0]!;
    const expiresAt = new Date(Date.now() + 40 * 86400000).toISOString();
    await manageGuestShare(
      database.db,
      organizationId,
      share.manageToken!,
      'set-expiry',
      expiresAt,
    );
    await manageGuestShare(
      database.db,
      organizationId,
      share.manageToken!,
      'set-expiry',
      expiresAt,
    );
    await claimGuestShare(database.db, owner, share.id, share.manageToken!);
    await claimGuestShare(database.db, owner, share.id, share.manageToken!);
    const version = (await manageAccountShare(database.db, owner, share.id, 'inspect')).version;
    await rotateAccountShareLink(database.db, owner, share.id, options.key, version);
    await manageAccountShare(database.db, owner, share.id, 'revoke');
    await manageAccountShare(database.db, owner, share.id, 'revoke');
    expect(await counts()).toMatchObject({
      'wishlist.share.created': 1,
      'wishlist.share.claimed': 1,
      'wishlist.share.expiry_changed': 1,
      'wishlist.share.link_rotated': 1,
      'wishlist.share.revoked': 1,
    });
    await processWishlistAnalyticsOutbox(database.db);
    const report = await getWishlistAnalytics(database.db, organizationId, 'sharing', period);
    expect(report.result.outcomes.find((r) => r.name === 'wishlist.share.created')).toMatchObject({
      count: 1,
      guest: 1,
      unknown: 1,
      averageSize: 1,
    });
    const payloads = await sql<{
      payload: object;
    }>`select payload from platform.outbox_events where organization_id=${organizationId} and aggregate_type='wishlist.analytics'`.execute(
      database.db,
    );
    expect(JSON.stringify(payloads.rows)).not.toContain(share.viewToken);
    expect(JSON.stringify(payloads.rows)).not.toContain(share.manageToken!);
    expect(JSON.stringify(payloads.rows)).not.toContain(owner.accountId);
  });
  it('records authoritative expiration time before bounded purge, never twice', async () => {
    await sql`update wishlist.shares set created_at=now()-interval '100 days',expires_at=now()-interval '31 days' where id=${legacyShare}::uuid`.execute(
      database.db,
    );
    expect(await recordExpiredWishlistShares(database.db, 1)).toBe(1);
    expect(await recordExpiredWishlistShares(database.db, 1)).toBe(0);
    expect((await cleanupWishlistShares(database.db, 1)).shares).toBe(1);
    await processWishlistAnalyticsOutbox(database.db);
    expect((await counts())['wishlist.share.expired']).toBeUndefined(); // No fabricated pre-instrumentation expiry.
    const options = {
      operationId: shareToken(),
      expiresAt: new Date(Date.now() + 2 * 86400_000).toISOString(),
      key: Buffer.alloc(32, 3),
    };
    const share = await createShare(database.db, organizationId, [{ productId }], options);
    await sql`update wishlist.shares set created_at=now()-interval '1 day',expires_at=clock_timestamp()-interval '1 millisecond' where id=${share.id}::uuid`.execute(
      database.db,
    );
    expect(await recordExpiredWishlistShares(database.db)).toBe(1);
    expect(await recordExpiredWishlistShares(database.db)).toBe(0);
    expect((await counts())['wishlist.share.expired']).toBe(1);
  });
  it('enforces tenant isolation, suppression, pagination and date boundaries', async () => {
    const other = (
      await createOrganization(database.db, {
        code: 'other-analytics',
        displayName: 'Other',
        timezone: 'UTC',
        defaultLocale: 'en',
        defaultCurrency: 'BDT',
      })
    ).id;
    expect(
      (await getWishlistAnalytics(database.db, other, 'summary', period)).result.savedItems,
    ).toBe(0);
    expect(
      (await getWishlistAnalytics(database.db, organizationId, 'products', period)).result.items,
    ).toEqual([]);
    for (let n = 0; n < 2; n++)
      await saveWishlistProduct(database.db, await makeOwner(), productId);
    const report = await getWishlistAnalytics(database.db, organizationId, 'products', {
      ...period,
      pageSize: 1,
    });
    expect(report.result.items).toHaveLength(1);
    expect(report.result.items[0]!.saved).toBe(3);
    expect(
      (await getWishlistAnalytics(database.db, organizationId, 'categories', period)).result
        .items[0]!.saved,
    ).toBe(3);
    for (const input of [
      { from: '2026-02-30', to: '2026-03-01' },
      { from: '2026-11-02', to: '2026-11-01' },
      { from: '2026-01-01', to: '2026-11-01' },
      { ...period, page: 0 },
    ])
      await expect(
        getWishlistAnalytics(database.db, organizationId, 'summary', input),
      ).rejects.toHaveProperty('code', 'INVALID_ANALYTICS_QUERY');
  });
  it('accepts only minimal consented observations, deduplicates retries and rejects secrets/spoofing', async () => {
    const event = observation();
    expect(await ingestStorefrontEvent(database.db, organizationId, event)).toMatchObject({
      accepted: true,
      duplicate: false,
    });
    expect(await ingestStorefrontEvent(database.db, organizationId, event)).toMatchObject({
      duplicate: true,
    });
    expect(
      await ingestStorefrontEvent(database.db, organizationId, {
        ...observation(),
        consent: { ...event.consent, analytics: 'DENIED' },
      }),
    ).toMatchObject({ accepted: false });
    for (const value of [
      { ...event, data: { ...event.data, url: 'https://evil.test/#secret' } },
      { ...event, shareId: crypto.randomUUID() },
      { ...event, data: { token: shareToken(), mode: 'GUEST' } },
      { ...event, origin: 'SERVER' },
      { ...event, name: 'wishlist.item.saved' },
      { ...event, occurredAt: '2020-01-01T00:00:00Z' },
      { ...event, anonymousId: crypto.randomUUID() },
    ])
      expect(() => validateWishlistObservation(value)).toThrow();
  });

  it('measures bounded catalog/interest/event workloads with query plans', async () => {
    const perfOrg = (
      await createOrganization(database.db, {
        code: 'perf-analytics',
        displayName: 'Synthetic performance',
        timezone: 'Asia/Dhaka',
        defaultLocale: 'en',
        defaultCurrency: 'BDT',
      })
    ).id;
    await sql`insert into iam.users(name,email,email_verified)
      select 'Synthetic analytics '||n,'perf-analytics-'||n||'@example.test',true from generate_series(1,50) n`.execute(
      database.db,
    );
    await sql`insert into customers.customers(organization_id,customer_number,display_name)
      select ${perfOrg},'PERF-'||n,'Synthetic analytics '||n from generate_series(1,50) n`.execute(
      database.db,
    );
    await sql`insert into customers.customer_accounts(organization_id,customer_id,user_id,link_type,status)
      select ${perfOrg},c.id,u.id,'GUEST_CONVERSION','ACTIVE' from customers.customers c
      join iam.users u on u.name=c.display_name and u.email like 'perf-analytics-%@example.test' where c.organization_id=${perfOrg}`.execute(
      database.db,
    );
    await sql`insert into wishlist.account_lists(organization_id,owner_account_id)
      select organization_id,id from customers.customer_accounts where organization_id=${perfOrg}`.execute(
      database.db,
    );
    const type = (
      await sql<{
        id: string;
      }>`insert into catalog.product_types(organization_id,code,name) values (${perfOrg},'perf','Performance') returning id::text`.execute(
        database.db,
      )
    ).rows[0]!.id;
    await sql`insert into catalog.products(organization_id,product_type_id,handle,title,status,publication_status,published_at)
      select ${perfOrg},${type}::uuid,'perf-'||n,'Synthetic product '||n,'ACTIVE','PUBLISHED',now() from generate_series(1,2000) n`.execute(
      database.db,
    );
    await sql`with products as (select id,row_number() over(order by id) n from catalog.products where organization_id=${perfOrg}),
      lists as (select id,row_number() over(order by id) n from wishlist.account_lists where organization_id=${perfOrg})
      insert into wishlist.account_items(organization_id,wishlist_id,product_id)
      select ${perfOrg},l.id,p.id from products p cross join lists l where (p.n+l.n)%10=0`.execute(
      database.db,
    );
    await sql`insert into platform.outbox_events(organization_id,event_type,event_version,aggregate_type,aggregate_id,aggregate_version,payload,occurred_at)
      select ${perfOrg},'wishlist.item.saved',1,'wishlist.analytics',uuidv7(),1,
        jsonb_build_object('productId',product_id,'source','MANUAL'),now() from wishlist.account_items where organization_id=${perfOrg} limit 5000`.execute(
      database.db,
    );
    const begin = performance.now();
    let processed = 0;
    for (let n = 0; n < 5; n++)
      processed += await processWishlistAnalyticsOutbox(database.db, 1000);
    const processingMs = performance.now() - begin;
    expect(processed).toBe(5000);
    const timings: Record<string, number> = {};
    for (const report of [
      'summary',
      'activity',
      'products',
      'categories',
      'sharing',
      'operations',
    ] as const) {
      const start = performance.now();
      const response = await getWishlistAnalytics(database.db, perfOrg, report, {
        from: new Date(Date.parse(today) - 89 * 86400000).toISOString().slice(0, 10),
        to: today,
        pageSize: 100,
      });
      timings[report] = Math.round((performance.now() - start) * 100) / 100;
      if (report === 'summary')
        expect((response.result as { savedItems: number }).savedItems).toBe(10000);
      if (report === 'products')
        expect((response.result as { items: unknown[] }).items).toHaveLength(100);
    }
    const plans = await sql<{
      'QUERY PLAN': { 'Execution Time': number; Plan: Record<string, unknown> }[];
    }>`explain (analyze,buffers,format json)
      select product_id,count(*) from wishlist.account_items where organization_id=${perfOrg} group by product_id order by count(*) desc,product_id limit 100`.execute(
      database.db,
    );
    const plan = plans.rows[0]!['QUERY PLAN'][0]!;
    process.stdout.write(
      'WISHLIST_PERFORMANCE ' +
        JSON.stringify({
          products: 2000,
          lists: 50,
          savedItems: 10000,
          outcomes: 5000,
          processingMs: Math.round(processingMs),
          reportMs: timings,
          rankingPlanExecutionMs: plan['Execution Time'],
          plan: plan.Plan,
        }) +
        '\n',
    );
  }, 60000);

  it('cleans expired observations and their orphan sessions without affecting other events', async () => {
    const input = observation();
    await ingestStorefrontEvent(database.db, organizationId, input);
    await sql`update analytics.storefront_events set received_at=now()-interval '91 days' where organization_id=${organizationId} and event_id=${input.eventId}::uuid`.execute(
      database.db,
    );
    await sql`update analytics.storefront_sessions set last_seen_at=now()-interval '91 days' where organization_id=${organizationId} and session_id=${input.sessionId}::uuid`.execute(
      database.db,
    );
    expect((await cleanupWishlistAnalytics(database.db)).observations).toBe(1);
    const sessions = await sql<{
      count: number;
    }>`select count(*)::int count from analytics.storefront_sessions where organization_id=${organizationId} and session_id=${input.sessionId}::uuid`.execute(
      database.db,
    );
    expect(sessions.rows[0]!.count).toBe(0);
  });

  it('preserves deduplication receipts after retention and exposes failed event retry', async () => {
    const id = await sql<{
      id: string;
    }>`select min(outbox_event_id)::text id from analytics.wishlist_outcomes where organization_id=${organizationId}`.execute(
      database.db,
    );
    await sql`update analytics.wishlist_outcomes set occurred_at=now()-interval '401 days' where outbox_event_id=${id.rows[0]!.id}::bigint`.execute(
      database.db,
    );
    expect((await cleanupWishlistAnalytics(database.db)).facts).toBe(1);
    expect(await processWishlistAnalyticsOutbox(database.db)).toBeGreaterThanOrEqual(0);
    const missing = await sql<{
      count: number;
    }>`select count(*)::int count from analytics.wishlist_outcomes where outbox_event_id=${id.rows[0]!.id}::bigint`.execute(
      database.db,
    );
    expect(missing.rows[0]!.count).toBe(0);
    await sql`insert into platform.outbox_events(organization_id,event_type,event_version,aggregate_type,aggregate_id,aggregate_version,payload,occurred_at)
      values (${organizationId},'wishlist.unknown',9,'wishlist.analytics',${crypto.randomUUID()}::uuid,1,'{}',now())`.execute(
      database.db,
    );
    await expect(processWishlistAnalyticsOutbox(database.db)).rejects.toThrow(
      'pending events retained',
    );
    expect(
      (await getWishlistAnalytics(database.db, organizationId, 'operations', period)).metadata
        .projection,
    ).toBe('FAILED');
    await sql`delete from platform.outbox_events where organization_id=${organizationId} and event_type='wishlist.unknown'`.execute(
      database.db,
    );
    await recordWishlistOutcome(database.db, organizationId, { name: 'wishlist.merge.completed' });
    await processWishlistAnalyticsOutbox(database.db);
    expect(
      (await getWishlistAnalytics(database.db, organizationId, 'operations', period)).metadata
        .projection,
    ).toBe('CURRENT');
  });
});
