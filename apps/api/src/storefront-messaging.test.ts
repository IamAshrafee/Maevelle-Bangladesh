import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { RuntimeConfig } from '@maevelle/config';
import { createDatabase } from '@maevelle/database';
import { createOrganization } from '@maevelle/database/platform';

import { buildApi } from './app.js';

const databaseUrl = process.env.TEST_DATABASE_URL!;
const database = createDatabase({ connectionString: databaseUrl, maxConnections: 6 });
const organizationCode = `chat-api-${crypto.randomUUID().slice(0, 8)}`;
const config: RuntimeConfig = {
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
  authTrustedOrigins: ['http://localhost:3000', 'http://localhost:3001'],
  authTotpIssuer: 'Maevelle',
  authTotpChallengeSeconds: 600,
  authTotpMaxFailedAttempts: 10,
  authTotpLockSeconds: 900,
  mediaStorageProvider: 'local',
  mediaStoragePath: `/tmp/maevelle-storefront-chat-${crypto.randomUUID()}`,
  mediaStorageRegion: 'auto',
  mediaPrivateBucket: 'private',
  mediaPublicBucket: 'public',
  mediaStorageForcePathStyle: true,
  mediaMaxUploadBytes: 10 * 1024 * 1024,
  mediaUploadExpirySeconds: 900,
  storefrontOrganizationCode: organizationCode,
  storefrontBaseUrl: 'http://localhost:3001',
  storefrontInternalApiUrl: 'http://127.0.0.1:3000',
  emailEnabled: false,
  emailProvider: 'local',
  emailEnvironment: 'test',
  emailFromName: 'Maevelle',
  emailFromAddress: 'notifications@maevelle.example',
  emailReplyTo: 'support@maevelle.example',
  emailAllowedTestRecipients: [],
  smsEnabled: false,
  smsProvider: 'none',
  smsEnvironment: 'test',
  smsTestMode: true,
  smsAllowedTestRecipients: [],
  smsSenderType: 'PROVIDER_DEFAULT',
  smsMaxPerTick: 20,
};
const app = buildApi({ database, config, logger: false });
const tinyPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

beforeAll(async () => {
  await createOrganization(database.db, {
    code: organizationCode,
    displayName: 'Storefront Messaging API Test',
    timezone: 'UTC',
    defaultLocale: 'en',
    defaultCurrency: 'USD',
  });
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await database.close();
});

function visitorCookie(setCookie: string | string[] | undefined): string {
  if (!setCookie) throw new Error('Expected visitor credential cookie.');
  const value = Array.isArray(setCookie) ? setCookie[0]! : setCookie;
  return value.split(';', 1)[0]!;
}

describe('storefront messaging API', () => {
  it('creates a protected visitor session and exposes canonical history with conflict semantics', async () => {
    const session = await app.inject({
      method: 'POST',
      url: '/storefront/v1/chat/session',
      headers: { origin: config.storefrontBaseUrl },
      payload: { context: { pageType: 'OTHER', path: '/support' } },
    });
    expect(session.statusCode).toBe(201);
    expect(session.headers['set-cookie']).toContain('HttpOnly');
    expect(session.headers['set-cookie']).toContain('SameSite=Lax');
    const cookie = visitorCookie(session.headers['set-cookie']);
    const conversationId = session.json().data.conversation.id as string;

    const anonymousHistory = await app.inject({
      method: 'GET',
      url: `/storefront/v1/chat/conversations/${conversationId}/messages`,
    });
    expect(anonymousHistory.statusCode).toBe(401);

    const idempotencyKey = crypto.randomUUID();
    const clientMessageId = crypto.randomUUID();
    const sent = await app.inject({
      method: 'POST',
      url: `/storefront/v1/chat/conversations/${conversationId}/messages`,
      headers: {
        cookie,
        origin: config.storefrontBaseUrl,
        'idempotency-key': idempotencyKey,
      },
      payload: { clientMessageId, text: 'Hello support' },
    });
    expect(sent.statusCode).toBe(202);

    const replay = await app.inject({
      method: 'POST',
      url: `/storefront/v1/chat/conversations/${conversationId}/messages`,
      headers: {
        cookie,
        origin: config.storefrontBaseUrl,
        'idempotency-key': idempotencyKey,
      },
      payload: { clientMessageId, text: 'Hello support' },
    });
    expect(replay.statusCode).toBe(200);
    expect(replay.json().data.id).toBe(sent.json().data.id);

    const conflict = await app.inject({
      method: 'POST',
      url: `/storefront/v1/chat/conversations/${conversationId}/messages`,
      headers: {
        cookie,
        origin: config.storefrontBaseUrl,
        'idempotency-key': idempotencyKey,
      },
      payload: { clientMessageId, text: 'Changed input' },
    });
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json().error.code).toBe('IDEMPOTENCY_KEY_REUSED');

    const history = await app.inject({
      method: 'GET',
      url: `/storefront/v1/chat/conversations/${conversationId}/messages`,
      headers: { cookie },
    });
    expect(history.statusCode).toBe(200);
    expect(history.json().data).toEqual([
      expect.objectContaining({ id: sent.json().data.id, text: 'Hello support' }),
    ]);
  });

  it('rejects cross-origin mutations before creating a visitor credential', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/storefront/v1/chat/session',
      headers: { origin: 'https://attacker.example' },
      payload: {},
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe('ORIGIN_REJECTED');
    expect(response.headers['set-cookie']).toBeUndefined();

    const malformed = await app.inject({
      method: 'POST',
      url: '/storefront/v1/chat/session',
      headers: { origin: 'not a valid origin' },
      payload: {},
    });
    expect(malformed.statusCode).toBe(403);
    expect(malformed.json().error.code).toBe('ORIGIN_REJECTED');
  });

  it('authorizes, verifies, and completes a visitor-owned local image upload', async () => {
    const session = await app.inject({
      method: 'POST',
      url: '/storefront/v1/chat/session',
      headers: { origin: config.storefrontBaseUrl },
      payload: {},
    });
    const cookie = visitorCookie(session.headers['set-cookie']);
    const conversationId = session.json().data.conversation.id as string;
    const checksum = createHash('sha256').update(tinyPng).digest('hex');
    const initialized = await app.inject({
      method: 'POST',
      url: '/storefront/v1/chat/uploads',
      headers: { cookie, origin: config.storefrontBaseUrl },
      payload: {
        conversationId,
        fileName: 'question.png',
        mimeType: 'image/png',
        byteSize: tinyPng.length,
        sha256: checksum,
      },
    });
    expect(initialized.statusCode).toBe(201);
    expect(initialized.json().data.upload).toMatchObject({
      strategy: 'API_PROXY',
      method: 'PUT',
    });
    const uploadId = initialized.json().data.id as string;
    const content = await app.inject({
      method: 'PUT',
      url: `/storefront/v1/chat/uploads/${uploadId}/content`,
      headers: { cookie, origin: config.storefrontBaseUrl, 'content-type': 'image/png' },
      payload: tinyPng,
    });
    expect(content.statusCode, content.body).toBe(204);
    const completed = await app.inject({
      method: 'POST',
      url: `/storefront/v1/chat/uploads/${uploadId}/complete`,
      headers: { cookie, origin: config.storefrontBaseUrl },
    });
    expect(completed.statusCode).toBe(202);
    expect(completed.json().data).toMatchObject({ id: uploadId, status: 'PROCESSING' });
  });
});
