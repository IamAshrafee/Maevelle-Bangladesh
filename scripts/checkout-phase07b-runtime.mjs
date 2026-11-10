/** Dedicated local browser fixture; never reads .env or contacts external providers. */
import { writeFile } from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { isolatedCartDatabase } from '../packages/database/dist/src/testing/cart-fixture.js';
import { manualPaymentFixture } from '../packages/database/dist/src/testing/manual-payment-fixture.js';
import { runMigrations } from '../packages/database/dist/src/migrate.js';
import { sql } from '../packages/database/dist/src/index.js';
import { parseConfig } from '../packages/config/dist/src/index.js';
import { buildApi } from '../apps/api/dist/src/app.js';
import { createAuth } from '../apps/api/dist/src/auth/auth.js';
import { resolveOrEnrollShopper } from '../packages/database/dist/src/shopper.js';
import { verifyManualPayment } from '../packages/database/dist/src/payments/manual-receipts.js';
import {
  processCommerceAnalyticsOutbox,
  setCommerceConsent,
} from '../packages/database/dist/src/analytics.js';

if (
  process.env.TEST_DATABASE_URL !== 'postgresql://postgres@127.0.0.1:5548/maevelle_test' ||
  !process.env.CHECKOUT_07B_OUTPUT
)
  throw new Error('Explicit disposable PostgreSQL target and output directory required.');
const isolated = await isolatedCartDatabase();
await runMigrations(isolated.database.db);
const f = await manualPaymentFixture(isolated.database.db);
const db = isolated.database.db;
await sql`update platform.organizations set code='privacy-browser-fixture' where id=${f.organizationId}`.execute(
  db,
);
await sql`insert into analytics.commerce_reporting_scopes values(${f.organizationId},'SYNTHETIC')`.execute(
  db,
);
const claim = await f.order();
await verifyManualPayment(db, {
  organizationId: f.organizationId,
  actorId: f.reviewer,
  attemptId: claim.attemptId,
  confirmedAmount: '40.0000',
  idempotencyKey: randomUUID(),
  evidence: claim.evidence,
});
await processCommerceAnalyticsOutbox(db);
const config = parseConfig({
  NODE_ENV: 'test',
  DATABASE_URL: isolated.url,
  TEST_DATABASE_URL: isolated.url,
  BETTER_AUTH_SECRET: Buffer.alloc(48, 27).toString('base64'),
  AUTH_ENCRYPTION_KEY: Buffer.alloc(32, 24).toString('base64'),
  BETTER_AUTH_URL: 'http://localhost:3001',
  AUTH_TRUSTED_ORIGINS: 'http://localhost:3001,http://localhost:3000',
  STOREFRONT_ORGANIZATION_CODE: 'privacy-browser-fixture',
  STOREFRONT_BASE_URL: 'http://localhost:3000',
  API_HOST: '127.0.0.1',
  API_PORT: '3002',
  EMAIL_ENABLED: 'false',
  SMS_ENABLED: 'false',
});
const auth = createAuth(config, isolated.database, true);
const password = 'SYN-07b-' + randomUUID();
const users = {};
for (const role of ['owner', 'reader']) {
  const email = `${role}-privacy@example.test`;
  const signed = await auth.api.signUpEmail({
    body: { email, password, name: `Synthetic ${role}` },
  });
  await sql`update iam.users set email_verified=true where id=${signed.user.id}`.execute(db);
  const membership =
    role === 'owner'
      ? (
          await sql`update iam.organization_memberships set user_id=${signed.user.id}
    where organization_id=${f.organizationId} and user_id=${f.owner} returning id`.execute(db)
        ).rows[0]
      : (
          await sql`insert into iam.organization_memberships(organization_id,user_id,membership_type,status)
    values(${f.organizationId},${signed.user.id},'STANDARD','ACTIVE') returning id`.execute(db)
        ).rows[0];
  if (role === 'reader')
    await sql`insert into iam.membership_capability_grants(membership_id,capability_code) values(${membership.id},'analytics.view')`.execute(
      db,
    );
  users[role] = { email, id: signed.user.id };
}
const api = buildApi({
  database: isolated.database,
  config,
  logger: false,
  shopperAuthEmailSender: async () => {},
});
await api.ready();
for (const label of ['A', 'B']) {
  const email = `shopper-${label.toLowerCase()}-privacy@example.test`;
  const response = await api.inject({
    method: 'POST',
    url: '/shopper-auth/sign-up/email',
    headers: { origin: 'http://localhost:3000' },
    payload: { name: `Synthetic ${label}`, email, password },
  });
  if (response.statusCode >= 300)
    throw new Error(`Synthetic shopper signup failed (${response.statusCode}).`);
  const id = (await sql`select id from iam.users where email=${email}`.execute(db)).rows[0].id;
  await sql`update iam.users set email_verified=true where id=${id}`.execute(db);
  const p = await resolveOrEnrollShopper(db, f.organizationId, id);
  if (label === 'A')
    for (const purpose of ['ANALYTICS', 'ADVERTISING'])
      await setCommerceConsent(
        db,
        { organizationId: f.organizationId, subjectId: p.accountId, scope: 'ACCOUNT' },
        {
          purpose,
          decision: 'DENIED',
          policyVersion: 'privacy-choices-v1',
          expectedRevision: '0',
          expiresAt: new Date(Date.now() + 86400000),
        },
      );
  users[label] = { email, id };
}
await writeFile(
  join(process.env.CHECKOUT_07B_OUTPUT, 'fixture.json'),
  JSON.stringify({ databaseUrl: isolated.url, organizationId: f.organizationId, users, password }),
);
await api.listen({ host: '127.0.0.1', port: 3002 });
console.log('Disposable Phase 07B API ready at loopback port 3002.');
let closed = false;
async function close() {
  if (closed) return;
  closed = true;
  await api.close();
  await isolated.close();
  process.exit(0);
}
process.on('SIGINT', () => void close());
process.on('SIGTERM', () => void close());

process.stdin.setEncoding('utf8');
process.stdin.on('data', (value) => {
  if (value.trim() === 'stop') void close();
});
