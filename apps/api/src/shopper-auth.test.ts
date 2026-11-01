import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { RuntimeConfig } from '@maevelle/config';
import { createDatabase, sql, type DatabaseClient } from '@maevelle/database';
import { runMigrations } from '@maevelle/database/migrate';
import { createOrganization } from '@maevelle/database/platform';
import { anonymizeCustomer } from '@maevelle/database/customers';
import { createShare } from '@maevelle/database/wishlist-share-lifecycle';
import type { FastifyInstance } from 'fastify';
import { buildApi } from './app.js';
import type { ShopperAuthEmail } from './auth/shopper-auth.js';

const testUrl = process.env.TEST_DATABASE_URL;
const databaseName = `maevelle_shopper_${crypto.randomUUID().replaceAll('-', '')}`;
let admin: DatabaseClient;
let database: DatabaseClient;
let app: FastifyInstance;
let organizationId: string;
const mailbox: ShopperAuthEmail[] = [];
const email = `shopper-${crypto.randomUUID()}@example.test`;
const password = 'correct-horse-battery-staple-123';
const newPassword = 'new-correct-horse-battery-staple-456';
const origin = 'http://localhost:3001';
let customerId: string;
let shopperUserId: string;
let accountShareId: string;

function config(databaseUrl: string): RuntimeConfig {
  return {
    nodeEnv: 'test',
    databaseUrl,
    testDatabaseUrl: databaseUrl,
    databasePoolMax: 6,
    apiHost: '127.0.0.1',
    apiPort: 3000,
    logLevel: 'error',
    workerHeartbeatIntervalMs: 30_000,
    betterAuthSecret: 'test-only-better-auth-secret-that-is-long-enough',
    authEncryptionKey: 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=',
    authBaseUrl: 'http://localhost:3000',
    authTrustedOrigins: [origin],
    authTotpIssuer: 'Maevelle',
    authTotpChallengeSeconds: 600,
    authTotpMaxFailedAttempts: 10,
    authTotpLockSeconds: 900,
    mediaStorageProvider: 'local',
    mediaStoragePath: 'var/test-shopper-media',
    mediaStorageRegion: 'auto',
    mediaPrivateBucket: 'private',
    mediaPublicBucket: 'public',
    mediaStorageForcePathStyle: true,
    mediaMaxUploadBytes: 10 * 1024 * 1024,
    mediaUploadExpirySeconds: 900,
    storefrontOrganizationCode: 'maevelle',
    storefrontBaseUrl: origin,
    storefrontInternalApiUrl: 'http://localhost:3000',
    emailEnabled: false,
    emailProvider: 'local',
    emailEnvironment: 'test',
    emailFromName: 'Maevelle',
    emailFromAddress: 'test@example.test',
    emailReplyTo: 'test@example.test',
    emailAllowedTestRecipients: [],
    smsEnabled: false,
    smsProvider: 'none',
    smsEnvironment: 'test',
    smsTestMode: true,
    smsAllowedTestRecipients: [],
    smsSenderType: 'PROVIDER_DEFAULT',
    smsMaxPerTick: 20,
    metaOAuthScopes: [],
    metaRequestTimeoutMs: 10_000,
  };
}

function cookie(response: { headers: Record<string, unknown> }, prefix: string): string {
  const value = response.headers['set-cookie'];
  const rows = Array.isArray(value) ? value : typeof value === 'string' ? [value] : [];
  const pair = rows
    .map((row) => String(row).split(';', 1)[0] ?? '')
    .find((row) => row.includes(prefix));
  if (!pair) throw new Error(`Missing ${prefix} cookie`);
  return pair;
}

async function post(path: string, body: object, cookieValue?: string, requestOrigin = origin) {
  return app.inject({
    method: 'POST',
    url: path,
    headers: {
      origin: requestOrigin,
      'content-type': 'application/json',
      ...(cookieValue ? { cookie: cookieValue } : {}),
    },
    payload: body,
  });
}

beforeAll(async () => {
  if (!testUrl || new URL(testUrl).pathname !== '/maevelle_test')
    throw new Error('The isolated maevelle_test URL is required.');
  const adminUrl = new URL(testUrl);
  adminUrl.pathname = '/postgres';
  admin = createDatabase({ connectionString: adminUrl.toString(), maxConnections: 1 });
  await sql.raw(`create database "${databaseName}"`).execute(admin.db);
  const url = new URL(testUrl);
  url.pathname = `/${databaseName}`;
  database = createDatabase({ connectionString: url.toString(), maxConnections: 6 });
  await runMigrations(database.db);
  organizationId = (
    await createOrganization(database.db, {
      code: 'maevelle',
      displayName: 'Maevelle',
      timezone: 'Asia/Dhaka',
      defaultLocale: 'en',
      defaultCurrency: 'BDT',
    })
  ).id;
  app = buildApi({
    database,
    config: config(url.toString()),
    logger: false,
    shopperAuthEmailSender: async (message) => {
      mailbox.push(message);
    },
  });
  await app.ready();
});

afterAll(async () => {
  await app?.close();
  await database?.close();
  if (admin) {
    await sql.raw(`drop database if exists "${databaseName}"`).execute(admin.db);
    await admin.close();
  }
});

describe('shopper realm and private Wishlist', () => {
  it('limits repeated verification-email requests with a durable counter', async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await post('/shopper-auth/send-verification-email', {
        email: 'unknown-shopper@example.test',
      });
      expect(response.statusCode).not.toBe(429);
    }
    const blocked = await post('/shopper-auth/send-verification-email', {
      email: 'unknown-shopper@example.test',
    });
    expect(blocked.statusCode).toBe(429);
    expect(blocked.headers['retry-after']).toBe('3600');
  });

  it('requires verification, isolates Admin cookies, ignores CRM matches and protects writes', async () => {
    const crm = await sql<{ id: string }>`
      insert into customers.customers (organization_id,customer_number,display_name)
      values (${organizationId},'PREEXISTING','Unclaimed contact') returning id::text
    `.execute(database.db);
    await sql`insert into customers.customer_emails
      (organization_id,customer_id,raw_value,normalized_value,is_primary)
      values (${organizationId},${crm.rows[0]!.id}::uuid,${email},${email.toLowerCase()},true)`.execute(
      database.db,
    );

    const registration = await post('/shopper-auth/sign-up/email', {
      name: 'Shopper',
      email,
      password,
      callbackURL: `${origin}/account?verified=1`,
    });
    expect(registration.statusCode).toBe(200);
    expect(mailbox).toHaveLength(1);
    const beforeVerification = await post('/shopper-auth/sign-in/email', { email, password });
    expect(beforeVerification.statusCode).toBe(403);
    const verificationUrl = new URL(mailbox[0]!.text.match(/https?:\/\/\S+/)![0]);
    const verified = await app.inject({
      method: 'GET',
      url: `${verificationUrl.pathname}${verificationUrl.search}`,
    });
    expect([200, 302]).toContain(verified.statusCode);

    const adminLogin = await post('/auth/sign-in/email', { email, password });
    expect(adminLogin.statusCode).toBe(200);
    const adminCookie = cookie(adminLogin, 'better-auth.session_token');
    const adminOnly = await app.inject({
      method: 'GET',
      url: '/storefront/v1/wishlist',
      headers: { cookie: adminCookie },
    });
    expect(adminOnly.statusCode).toBe(401);
    const renamedAdminCookie = adminCookie.replace('better-auth.', 'maevelle-shopper.');
    const copiedAdmin = await app.inject({
      method: 'GET',
      url: '/storefront/v1/wishlist',
      headers: { cookie: renamedAdminCookie },
    });
    expect(copiedAdmin.statusCode).toBe(401);

    const login = await post('/shopper-auth/sign-in/email', { email, password });
    expect(login.statusCode).toBe(200);
    const shopperCookie = cookie(login, 'maevelle-shopper.session_token');
    const session = await app.inject({
      method: 'GET',
      url: '/storefront/v1/shopper/session',
      headers: { cookie: shopperCookie },
    });
    expect(session.statusCode).toBe(200);
    expect(session.json().data.partition).toMatch(/^[A-Za-z0-9_-]{43}$/);
    for (const report of ['summary','activity','products','categories','sharing','operations']) {
      const denied = await app.inject({ method: 'GET', url: `/admin/analytics/wishlist/${report}?from=2026-11-01&to=2026-11-01`, headers: { cookie: shopperCookie } });
      expect(denied.statusCode).toBe(403);
    }
    const account = await sql<{ customer_id: string; user_id: string }>`
      select customer_id::text,user_id::text from customers.customer_accounts
      where organization_id=${organizationId}
    `.execute(database.db);
    expect(account.rows).toHaveLength(1);
    expect(account.rows[0]!.customer_id).not.toBe(crm.rows[0]!.id);
    customerId = account.rows[0]!.customer_id;
    shopperUserId = account.rows[0]!.user_id;
    const analyticsPath = '/admin/analytics/wishlist/summary?from=2026-11-01&to=2026-11-01';
    expect((await app.inject({ method: 'GET', url: analyticsPath, headers: { cookie: adminCookie } })).statusCode).toBe(403);
    const membership = await sql<{ id: string }>`insert into iam.organization_memberships
      (organization_id,user_id,membership_type,status,display_name,activated_at)
      values (${organizationId},${shopperUserId}::uuid,'STANDARD','ACTIVE','Analytics test',now()) returning id::text`.execute(database.db);
    await sql`insert into iam.membership_capability_grants(membership_id,capability_code)
      values (${membership.rows[0]!.id}::uuid,'analytics.view')`.execute(database.db);
    for (const report of ['summary','activity','products','categories','sharing','operations']) {
      const authorized = await app.inject({ method: 'GET', url: `/admin/analytics/wishlist/${report}?from=2026-11-01&to=2026-11-01`, headers: { cookie: adminCookie } });
      expect(authorized.statusCode, authorized.body).toBe(200);
      const shopperDenied = await app.inject({ method: 'GET', url: `/admin/analytics/wishlist/${report}?from=2026-11-01&to=2026-11-01`, headers: { cookie: shopperCookie } });
      expect(shopperDenied.statusCode).toBe(403);
    }
    await sql`delete from iam.membership_capability_grants where membership_id=${membership.rows[0]!.id}::uuid`.execute(database.db);
    await sql`update iam.organization_memberships set status='DISABLED' where id=${membership.rows[0]!.id}::uuid`.execute(database.db);


    const type = await sql<{ id: string }>`
      insert into catalog.product_types (organization_id,code,name)
      values (${organizationId},'wishlist','Wishlist') returning id::text
    `.execute(database.db);
    const product = await sql<{ id: string }>`
      insert into catalog.products
        (organization_id,product_type_id,handle,title,status,publication_status,published_at)
      values (${organizationId},${type.rows[0]!.id}::uuid,'saved','Saved',
        'ACTIVE','PUBLISHED',now()) returning id::text
    `.execute(database.db);
    const path = `/storefront/v1/wishlist/items/${product.rows[0]!.id}`;
    const badOrigin = await app.inject({
      method: 'PUT',
      url: path,
      headers: {
        cookie: shopperCookie,
        origin: 'https://attacker.example',
        'content-type': 'application/json',
      },
      payload: {},
    });
    expect(badOrigin.statusCode).toBe(403);
    const saved = await app.inject({
      method: 'PUT',
      url: path,
      headers: { cookie: shopperCookie, origin, 'content-type': 'application/json' },
      payload: { expectedVersion: 1 },
    });
    expect(saved.statusCode).toBe(200);
    const repeated = await app.inject({
      method: 'PUT',
      url: path,
      headers: { cookie: shopperCookie, origin, 'content-type': 'application/json' },
      payload: {},
    });
    expect(repeated.statusCode).toBe(200);
    expect(repeated.json().data.version).toBe(saved.json().data.version);
    const page = await app.inject({
      method: 'GET',
      url: '/storefront/v1/wishlist',
      headers: { cookie: shopperCookie },
    });
    expect(page.statusCode).toBe(200);
    expect(page.json().data.count).toBe(1);
    const another = await sql<{ id: string }>`
      insert into catalog.products
        (organization_id,product_type_id,handle,title,status,publication_status,published_at)
      values (${organizationId},${type.rows[0]!.id}::uuid,'merged','Merged',
        'ACTIVE','PUBLISHED',now()) returning id::text
    `.execute(database.db);
    const mergeId = crypto.randomUUID();
    const mergeBody = {
      mergeId,
      baseVersion: page.json().data.version,
      items: [product.rows[0]!.id, another.rows[0]!.id].map((productId) => ({
        productId,
        preferredVariantId: null,
        savedAt: new Date().toISOString(),
      })),
    };
    expect((await post('/storefront/v1/wishlist/merges', mergeBody, adminCookie)).statusCode).toBe(
      401,
    );
    expect(
      (
        await post(
          '/storefront/v1/wishlist/merges',
          mergeBody,
          shopperCookie,
          'https://attacker.example',
        )
      ).statusCode,
    ).toBe(403);
    const merged = await post('/storefront/v1/wishlist/merges', mergeBody, shopperCookie);
    expect(merged.statusCode).toBe(200);
    expect(merged.json().data.acceptedProductIds).toEqual([another.rows[0]!.id]);
    expect(merged.json().data.alreadyPresentProductIds).toEqual([product.rows[0]!.id]);
    const replayed = await post('/storefront/v1/wishlist/merges', mergeBody, shopperCookie);
    expect(replayed.statusCode).toBe(200);
    expect(replayed.json().data.previouslyApplied).toBe(true);
    expect(
      (
        await post(
          '/storefront/v1/wishlist/merges',
          {
            ...mergeBody,
            items: mergeBody.items.slice(0, 1),
          },
          shopperCookie,
        )
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await post(
          '/storefront/v1/wishlist/merges',
          {
            ...mergeBody,
            mergeId: crypto.randomUUID(),
          },
          shopperCookie,
        )
      ).statusCode,
    ).toBe(409);
    const unrelated = await app.inject({
      method: 'GET',
      url: '/storefront/v1/wishlist',
      headers: {
        cookie: adminCookie,
        'x-organization-id': organizationId,
        'x-customer-id': account.rows[0]!.customer_id,
      },
    });
    expect(unrelated.statusCode).toBe(401);
    const signOut = await post('/shopper-auth/sign-out', {}, shopperCookie);
    expect(signOut.statusCode).toBe(200);
    const afterLogout = await app.inject({
      method: 'GET',
      url: '/storefront/v1/wishlist',
      headers: { cookie: shopperCookie },
    });
    expect(afterLogout.statusCode).toBe(401);
  });

  it('resets a password with a single-use capability and invalidates earlier sessions', async () => {
    const login = await post('/shopper-auth/sign-in/email', { email, password });
    expect(login.statusCode).toBe(200);
    const oldCookie = cookie(login, 'maevelle-shopper.session_token');
    const request = await post('/shopper-auth/request-password-reset', {
      email,
      redirectTo: `${origin}/account?view=reset`,
    });
    expect(request.statusCode).toBe(200);
    const link = new URL(mailbox.at(-1)!.text.match(/https?:\/\/\S+/)![0]);
    const token = link.pathname.split('/').at(-1)!;
    const callback = await app.inject({ method: 'GET', url: `${link.pathname}${link.search}` });
    expect(callback.statusCode).toBe(302);
    const changed = await post('/shopper-auth/reset-password', { token, newPassword });
    expect(changed.statusCode).toBe(200);
    expect((await post('/shopper-auth/reset-password', { token, newPassword })).statusCode).toBe(
      400,
    );
    expect((await post('/shopper-auth/sign-in/email', { email, password })).statusCode).not.toBe(
      200,
    );
    const expiredSession = await app.inject({
      method: 'GET',
      url: '/storefront/v1/wishlist',
      headers: { cookie: oldCookie },
    });
    expect(expiredSession.statusCode).toBe(401);
    expect(
      (await post('/shopper-auth/sign-in/email', { email, password: newPassword })).statusCode,
    ).toBe(200);
  });

  it('authorizes guest and account sharing routes through real shopper sessions', async () => {
    const login = await post('/shopper-auth/sign-in/email', { email, password: newPassword });
    expect(login.statusCode).toBe(200);
    const shopperCookie = cookie(login, 'maevelle-shopper.session_token');
    const product = await sql<{ id: string; handle: string; title: string }>`
      select id::text,handle,title from catalog.products where organization_id=${organizationId} and handle='saved'
    `.execute(database.db);
    const productId = product.rows[0]!.id;
    await sql`insert into search.catalog_documents
      (organization_id,product_id,handle,title,search_text,published_at)
      values (${organizationId},${productId}::uuid,'saved','Saved','Saved',now())
      on conflict (organization_id,product_id) do nothing`.execute(database.db);
    const operationId = () => Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url');
    const expiresAt = new Date(Date.now() + 30 * 86400_000).toISOString();
    const guestBody = { productIds: [productId], operationId: operationId(), expiresAt };
    expect((await post('/storefront/v1/wishlist/shares', guestBody, undefined, 'https://attacker.example')).statusCode).toBe(403);
    const guestResponse = await post('/storefront/v1/wishlist/shares', guestBody);
    expect(guestResponse.statusCode).toBe(200);
    const guest = guestResponse.json().data as { id: string; viewToken: string; manageToken: string };
    expect(guest.viewToken).not.toBe(guest.manageToken);
    expect((await post('/storefront/v1/wishlist/shares', guestBody)).json().data).toEqual(guestResponse.json().data);
    expect((await post('/storefront/v1/wishlist/shares', { ...guestBody, productIds: [] })).statusCode).toBe(400);
    const opened = await post('/storefront/v1/wishlist/shares/open', { token: guest.viewToken });
    expect(opened.statusCode).toBe(200);
    expect(opened.headers['cache-control']).toContain('no-store');
    expect(opened.headers['referrer-policy']).toBe('no-referrer');
    expect(opened.json().data.products.map((item: { id: string }) => item.id)).toEqual([productId]);
    expect(JSON.stringify(opened.json())).not.toContain(guest.manageToken);
    expect(JSON.stringify(opened.json())).not.toContain(customerId);
    expect(JSON.stringify(opened.json())).not.toContain(email);
    expect((await post('/storefront/v1/wishlist/shares/manage', { token: guest.viewToken, action: 'revoke' })).statusCode).toBe(404);
    const renewedAt = new Date(Date.now() + 40 * 86400_000).toISOString();
    const renewed = await post('/storefront/v1/wishlist/shares/manage', { token: guest.manageToken, action: 'renew', expiresAt: renewedAt });
    expect(renewed.statusCode).toBe(200);
    const renewedAgain = await post('/storefront/v1/wishlist/shares/manage', { token: guest.manageToken, action: 'renew', expiresAt: renewedAt });
    expect(renewedAgain.json().data.version).toBe(renewed.json().data.version);
    const accountBody = { operationId: operationId(), expiresAt, selection: 'selected', items: [{ productId }] };
    expect((await post('/storefront/v1/wishlist/account-shares', accountBody)).statusCode).toBe(401);
    expect((await post('/storefront/v1/wishlist/account-shares', accountBody, shopperCookie, 'https://attacker.example')).statusCode).toBe(403);
    const created = await post('/storefront/v1/wishlist/account-shares', accountBody, shopperCookie);
    expect(created.statusCode).toBe(200);
    const accountShare = created.json().data as { id: string; viewToken: string; itemCount: number };
    accountShareId = accountShare.id;
    expect(accountShare.itemCount).toBe(1);
    expect((await post('/storefront/v1/wishlist/account-shares', accountBody, shopperCookie)).json().data).toEqual(accountShare);
    const all = await post('/storefront/v1/wishlist/account-shares',
      { operationId: operationId(), expiresAt, selection: 'all', items: [] }, shopperCookie);
    expect(all.statusCode).toBe(200);
    expect(all.json().data.itemCount).toBe(1);
    const otherEmail = `other-share-${crypto.randomUUID()}@example.test`;
    expect((await post('/shopper-auth/sign-up/email', {
      name: 'Other shopper', email: otherEmail, password,
      callbackURL: `${origin}/account?verified=1`,
    })).statusCode).toBe(200);
    const verificationUrl = new URL(mailbox.at(-1)!.text.match(/https?:\/\/\S+/)![0]);
    expect([200, 302]).toContain((await app.inject({ method: 'GET', url: `${verificationUrl.pathname}${verificationUrl.search}` })).statusCode);
    const otherLogin = await post('/shopper-auth/sign-in/email', { email: otherEmail, password });
    expect(otherLogin.statusCode).toBe(200);
    const otherCookie = cookie(otherLogin, 'maevelle-shopper.session_token');
    expect((await post('/storefront/v1/wishlist/account-shares',
      { operationId: operationId(), expiresAt, selection: 'selected', items: [{ productId }] }, otherCookie)).statusCode).toBe(422);
    expect((await post(`/storefront/v1/wishlist/account-shares/${accountShare.id}/link`, {}, otherCookie)).statusCode).toBe(404);
    expect((await post(`/storefront/v1/wishlist/account-shares/${guest.id}/claim`,
      { manageToken: guest.viewToken }, otherCookie)).statusCode).toBe(404);
    const listed = await app.inject({ method: 'GET', url: '/storefront/v1/wishlist/account-shares', headers: { cookie: shopperCookie } });
    expect(listed.statusCode).toBe(200);
    expect(listed.json().data.items.some((share: { id: string }) => share.id === accountShare.id)).toBe(true);
    expect(JSON.stringify(listed.json())).not.toContain(accountShare.viewToken);
    const detail = await app.inject({ method: 'GET', url: `/storefront/v1/wishlist/account-shares/${accountShare.id}`, headers: { cookie: shopperCookie } });
    expect(detail.statusCode).toBe(200);
    expect((await post(`/storefront/v1/wishlist/account-shares/${accountShare.id}/link`, {}, shopperCookie)).json().data.viewToken).toBe(accountShare.viewToken);
    const rotated = await post(`/storefront/v1/wishlist/account-shares/${accountShare.id}/rotate-link`, { expectedVersion: detail.json().data.version }, shopperCookie);
    expect(rotated.statusCode).toBe(200);
    expect((await post('/storefront/v1/wishlist/shares/open', { token: accountShare.viewToken })).statusCode).toBe(404);
    expect((await post(`/storefront/v1/wishlist/account-shares/${accountShare.id}/rotate-link`, { expectedVersion: detail.json().data.version }, shopperCookie)).statusCode).toBe(409);
    const claimed = await post(`/storefront/v1/wishlist/account-shares/${guest.id}/claim`, { manageToken: guest.manageToken }, shopperCookie);
    expect(claimed.statusCode).toBe(200);
    expect((await post('/storefront/v1/wishlist/shares/manage', { token: guest.manageToken, action: 'inspect' })).statusCode).toBe(404);
    expect((await post('/storefront/v1/wishlist/shares/open', { token: guest.viewToken })).statusCode).toBe(200);
    const revoke = await app.inject({ method: 'DELETE', url: `/storefront/v1/wishlist/account-shares/${accountShare.id}`, headers: { cookie: shopperCookie, origin } });
    expect(revoke.statusCode).toBe(415);
    const revoked = await app.inject({ method: 'DELETE', url: `/storefront/v1/wishlist/account-shares/${accountShare.id}`, headers: { cookie: shopperCookie, origin, 'content-type': 'application/json' }, payload: {} });
    expect(revoked.statusCode).toBe(200);
    expect((await post('/storefront/v1/wishlist/shares/open', { token: rotated.json().data.viewToken })).statusCode).toBe(404);
  });

  it('rejects a share capability from another storefront organization', async () => {
    const other = await createOrganization(database.db, { code: `other-${crypto.randomUUID().slice(0, 8)}`,
      displayName: 'Other store', timezone: 'Asia/Dhaka', defaultLocale: 'en', defaultCurrency: 'BDT' });
    const type = await sql<{ id: string }>`insert into catalog.product_types(organization_id,code,name)
      values (${other.id},'other','Other') returning id::text`.execute(database.db);
    const product = await sql<{ id: string }>`insert into catalog.products
      (organization_id,product_type_id,handle,title,status,publication_status,published_at)
      values (${other.id},${type.rows[0]!.id}::uuid,'other-product','Other product','ACTIVE','PUBLISHED',now())
      returning id::text`.execute(database.db);
    await sql`insert into search.catalog_documents(organization_id,product_id,handle,title,search_text,published_at)
      values (${other.id},${product.rows[0]!.id}::uuid,'other-product','Other product','Other product',now())`.execute(database.db);
    const share = await createShare(database.db, other.id, [{ productId: product.rows[0]!.id }], {
      key: Buffer.alloc(32, 7), operationId: Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url'),
      expiresAt: new Date(Date.now() + 30 * 86400_000).toISOString(),
    });
    expect((await post('/storefront/v1/wishlist/shares/open', { token: share.viewToken })).statusCode).toBe(404);
    expect((await post('/storefront/v1/wishlist/shares/manage', { token: share.manageToken, action: 'inspect' })).statusCode).toBe(404);
  });

  it('purges account Wishlist data on authorized CRM anonymization without deleting guest shares', async () => {
    const login = await post('/shopper-auth/sign-in/email', { email, password: newPassword });
    expect(login.statusCode).toBe(200);
    const activeCookie = cookie(login, 'maevelle-shopper.session_token');
    const guest = await sql<{ id: string }>`
      insert into wishlist.shares
        (organization_id,view_token_digest,manage_token_digest,expires_at)
      values (${organizationId},${Buffer.from(crypto.randomUUID())},
        ${Buffer.from(crypto.randomUUID())},now()+interval '30 days')
      returning id::text
    `.execute(database.db);
    const before = await sql<{ count: string }>`
      select count(*)::text as count from wishlist.account_items
      where organization_id=${organizationId}
    `.execute(database.db);
    expect(Number(before.rows[0]!.count)).toBe(2);
    const version = await sql<{ version: string }>`
      select version::text from customers.customers
      where organization_id=${organizationId} and id=${customerId}::uuid
    `.execute(database.db);
    await anonymizeCustomer(database.db, {
      organizationId,
      actorId: shopperUserId,
      customerId,
      expectedVersion: Number(version.rows[0]!.version),
      reasonCode: 'PRIVACY_REQUEST',
      idempotencyKey: crypto.randomUUID(),
    });
    const after = await sql<{ count: string }>`
      select count(*)::text as count from wishlist.account_lists
      where organization_id=${organizationId}
    `.execute(database.db);
    expect(Number(after.rows[0]!.count)).toBe(0);
    const removedShare = await sql<{ count: number }>`select count(*)::int as count from wishlist.shares
      where organization_id=${organizationId} and id=${accountShareId}::uuid`.execute(database.db);
    expect(removedShare.rows[0]!.count).toBe(0);
    const preserved = await sql<{ count: string }>`
      select count(*)::text as count from wishlist.shares
      where organization_id=${organizationId} and id=${guest.rows[0]!.id}::uuid
    `.execute(database.db);
    expect(Number(preserved.rows[0]!.count)).toBe(1);
    const denied = await app.inject({
      method: 'GET',
      url: '/storefront/v1/wishlist',
      headers: { cookie: activeCookie },
    });
    expect(denied.statusCode).toBe(401);
  });
  it('rate-limits repeated invalid guest management attempts with PostgreSQL counters', async () => {
    const invalid = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url');
    let blocked: Awaited<ReturnType<typeof post>> | undefined;
    for (let attempt = 0; attempt < 35; attempt += 1) {
      const response = await post('/storefront/v1/wishlist/shares/manage', { token: invalid, action: 'inspect' });
      if (response.statusCode === 429) { blocked = response; break; }
      expect(response.statusCode).toBe(404);
    }
    expect(blocked?.statusCode).toBe(429);
    expect(blocked?.headers['retry-after']).toBe('3600');
  });
  it('rate limits consented Wishlist observations through the existing API limiter', async () => {
    const payload = { schemaVersion: 1, eventId: crypto.randomUUID(), name: 'WISHLIST_PAGE_VIEWED', origin: 'BROWSER',
      sessionId: crypto.randomUUID(), occurredAt: new Date().toISOString(),
      consent: { necessary: 'GRANTED', analytics: 'GRANTED', marketing: 'DENIED', preferences: 'UNKNOWN', recordedAt: new Date().toISOString() }, data: { mode: 'GUEST' } };
    for (let index=0; index<120; index++) expect((await post('/storefront/v1/analytics/events', payload)).statusCode).toBe(202);
    const blocked = await post('/storefront/v1/analytics/events', payload);
    expect(blocked.statusCode).toBe(429); expect(blocked.headers['retry-after']).toBeDefined();
  });
  it('fails closed when the guest capability limiter database is unavailable', async () => {
    const unavailableUrl = new URL(testUrl!);
    unavailableUrl.port = '1';
    const unavailableDatabase = createDatabase({ connectionString: unavailableUrl.toString(), maxConnections: 1 });
    const unavailableApp = buildApi({ database: unavailableDatabase, config: config(unavailableUrl.toString()), logger: false });
    try {
      await unavailableApp.ready();
      const response = await unavailableApp.inject({
        method: 'POST',
        url: '/storefront/v1/wishlist/shares/manage',
        headers: { origin, 'content-type': 'application/json' },
        payload: { token: Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url'), action: 'inspect' },
      });
      expect(response.statusCode).toBe(503);
      expect(response.json()).toEqual({ error: { code: 'UNAVAILABLE', message: 'Request protection is temporarily unavailable.' } });
    } finally {
      await unavailableApp.close();
      await unavailableDatabase.close();
    }
  });
});
