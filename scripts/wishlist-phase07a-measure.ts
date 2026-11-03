/** Bounded HTTP measurements against the dedicated synthetic acceptance fixture. */
import { writeFileSync } from 'node:fs';
import { createDatabase, sql } from '../packages/database/src/index.ts';
import {
  phase07aConfig as config,
  assertPhase07aTarget,
  phase07aFixturePassword,
} from './wishlist-phase07a-config.ts';
assertPhase07aTarget();
const base = 'http://127.0.0.1:3002';
const login = await fetch(`${base}/auth/sign-in/email`, {
  method: 'POST',
  headers: { origin: 'http://wishlist-07a.localhost:3001', 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'analyst-07a@example.test', password: phase07aFixturePassword }),
});
if (!login.ok) throw new Error(`Synthetic login failed: ${login.status}`);
const cookie = login.headers
  .getSetCookie()
  .map((value) => value.split(';')[0])
  .join('; ');
const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dhaka' }).format(new Date());
const reports: Record<string, unknown> = {};
for (const endpoint of ['summary', 'activity', 'products', 'categories', 'sharing', 'operations']) {
  const samples: number[] = [];
  let result: unknown;
  for (let sample = 0; sample < 20; sample++) {
    const start = performance.now();
    const response = await fetch(
      `${base}/admin/analytics/wishlist/${endpoint}?from=${day}&to=${day}`,
      { headers: { cookie } },
    );
    if (!response.ok) throw new Error(`${endpoint}: ${response.status}`);
    const body = (await response.json()) as { data: { result: unknown } };
    result = body.data.result;
    samples.push(performance.now() - start);
  }
  samples.sort((a, b) => a - b);
  reports[endpoint] = {
    samples: samples.length,
    p50Ms: Number(samples[9]!.toFixed(2)),
    p95Ms: Number(samples[18]!.toFixed(2)),
    result: endpoint === 'summary' ? result : undefined,
  };
}
const database = createDatabase({ connectionString: config.databaseUrl, maxConnections: 1 });
try {
  const truth =
    await sql`select count(*)::int saved_items, count(distinct product_id)::int distinct_products,
    count(distinct wishlist_id)::int nonempty_lists from wishlist.account_items
    where organization_id=(select id from platform.organizations where code='maevelle')`.execute(
      database.db,
    );
  const observations =
    await sql`select event_name, count(*)::int count from analytics.storefront_events where event_name like 'WISHLIST_%' group by event_name`.execute(
      database.db,
    );
  const output = {
    measuredAt: new Date().toISOString(),
    transport: 'loopback HTTP, sequential, warm API, 20 samples per endpoint',
    reports,
    truth: truth.rows,
    observations: observations.rows,
  };
  writeFileSync('/tmp/maevelle-phase07a/performance.json', JSON.stringify(output, null, 2));
  console.log(JSON.stringify(output, null, 2));
} finally {
  await database.close();
}
