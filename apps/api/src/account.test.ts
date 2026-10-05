import { afterAll, describe, expect, it } from 'vitest';

import type { RuntimeConfig } from '@maevelle/config';
import { createDatabase } from '@maevelle/database';
import { findUserAuthVerificationValue } from '@maevelle/database/iam';
import {
  createOrganization,
  createOwnerMembership,
  createStandardMembership,
} from '@maevelle/database/platform';

import { buildApi } from './app.js';
import { createAuth } from './auth/auth.js';

const databaseUrl = process.env.TEST_DATABASE_URL!;
const database = createDatabase({ connectionString: databaseUrl, maxConnections: 6 });
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
  authTrustedOrigins: ['http://localhost:3000'],
  authTotpIssuer: 'Maevelle',
  authTotpChallengeSeconds: 600,
  authTotpMaxFailedAttempts: 10,
  authTotpLockSeconds: 900,
  mediaStorageProvider: 'local',
  mediaStoragePath: 'var/test-media-account',
  mediaStorageRegion: 'auto',
  mediaPrivateBucket: 'private',
  mediaPublicBucket: 'public',
  mediaStorageForcePathStyle: true,
  mediaMaxUploadBytes: 10 * 1024 * 1024,
  mediaUploadExpirySeconds: 900,
  storefrontOrganizationCode: 'maevelle',
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

function cookieHeader(setCookie: string | string[] | undefined): string {
  if (!setCookie) throw new Error('Expected Better Auth to set a cookie.');
  const values = Array.isArray(setCookie) ? setCookie : [setCookie];
  return values.map((value) => value.split(';', 1)[0]).join('; ');
}

async function createOrgFixture(label: string): Promise<string> {
  const organization = await createOrganization(database.db, {
    code: `acc-${label}-${crypto.randomUUID().slice(0, 8)}`,
    displayName: `Account Test ${label}`,
    timezone: 'UTC',
    defaultLocale: 'en',
    defaultCurrency: 'USD',
  });
  return organization.id;
}

async function createUserFixture(
  emailLabel: string,
  name = 'Account Test User',
): Promise<{ id: string; email: string; password: string }> {
  const email = `${emailLabel}-${crypto.randomUUID()}@test.local`;
  const password = 'Maevelle-test-password-2026';
  const auth = createAuth(config, database, true);
  const result = await auth.api.signUpEmail({
    body: { email, password, name },
  });
  if (!result.user?.id) throw new Error('Test user signup failed.');
  return { id: result.user.id, email, password };
}

async function signIn(app: ReturnType<typeof buildApi>, email: string, password: string) {
  return app.inject({
    method: 'POST',
    url: '/auth/sign-in/email',
    payload: { email, password },
  });
}

// 1x1 valid PNG buffer
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

afterAll(async () => {
  await database.close();
});

describe('My Account / Self-Service Account Management API', () => {
  it('allows an ordinary staff member with NO administrative permissions to access My Account overview', async () => {
    const orgId = await createOrgFixture('basic');
    const user = await createUserFixture('employee', 'Rahim Ahmed');

    // Create standard membership with zero administrative capabilities
    await createStandardMembership(database.db, orgId, user.id, 'Rahim Ahmed');

    const app = buildApi({ database, config, logger: false });
    const authRes = await signIn(app, user.email, user.password);
    expect(authRes.statusCode).toBe(200);
    const cookie = cookieHeader(authRes.headers['set-cookie']);

    // Call GET /admin/account
    const res = await app.inject({
      method: 'GET',
      url: '/admin/account',
      headers: { cookie, 'x-organization-id': orgId },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data).toBeDefined();
    expect(body.data.profile.name).toBe('Rahim Ahmed');
    expect(body.data.profile.email).toBe(user.email);
    expect(body.data.profile.emailVerified).toBe(false);
    expect(body.data.membership.organizationId).toBe(orgId);
    expect(body.data.membership.membershipType).toBe('STANDARD');
    expect(body.data.security.hasPassword).toBe(true);
    expect(body.data.security.twoFactorEnabled).toBe(false);
  });

  it('updates display name and rejects mass-assignment attempts', async () => {
    const orgId = await createOrgFixture('name');
    const user = await createUserFixture('name-test', 'Original Name');
    await createOwnerMembership(database.db, orgId, user.id, 'Owner User');

    const app = buildApi({ database, config, logger: false });
    const authRes = await signIn(app, user.email, user.password);
    const cookie = cookieHeader(authRes.headers['set-cookie']);

    // Valid name update
    const updateRes = await app.inject({
      method: 'PATCH',
      url: '/admin/account/profile',
      headers: { cookie },
      payload: { name: 'Md. Kabir Hasan' },
    });

    expect(updateRes.statusCode).toBe(200);
    expect(updateRes.json().data.name).toBe('Md. Kabir Hasan');

    // Verify name changed in database
    const checkRes = await app.inject({
      method: 'GET',
      url: '/admin/account',
      headers: { cookie },
    });
    expect(checkRes.json().data.profile.name).toBe('Md. Kabir Hasan');

    // Mass assignment attempt (trying to elevate role or force emailVerified)
    const attackRes = await app.inject({
      method: 'PATCH',
      url: '/admin/account/profile',
      headers: { cookie },
      payload: {
        name: 'Attacker Name',
        role: 'OWNER',
        permissions: ['*'],
        emailVerified: true,
      },
    });

    // Fastify schema validation strictly rejects unrecognized additional properties
    expect(attackRes.statusCode).toBe(400);

    // Empty or whitespace name rejected
    const emptyRes = await app.inject({
      method: 'PATCH',
      url: '/admin/account/profile',
      headers: { cookie },
      payload: { name: '    ' },
    });
    expect(emptyRes.statusCode).toBe(422);
  });

  it('manages avatar upload, image processing, public delivery, and removal', async () => {
    const orgId = await createOrgFixture('avatar');
    const user = await createUserFixture('avatar-user');
    await createOwnerMembership(database.db, orgId, user.id, 'Owner User');

    const app = buildApi({ database, config, logger: false });
    const authRes = await signIn(app, user.email, user.password);
    const cookie = cookieHeader(authRes.headers['set-cookie']);

    // 1. Upload valid image buffer
    const uploadRes = await app.inject({
      method: 'POST',
      url: '/admin/account/avatar',
      headers: {
        cookie,
        'content-type': 'image/png',
      },
      payload: TINY_PNG,
    });

    expect(uploadRes.statusCode).toBe(201);
    const uploadData = uploadRes.json().data;
    expect(uploadData.avatarUrl).toMatch(/^\/media\/avatars\/[a-zA-Z0-9_-]+\.webp$/);

    // 2. Fetch avatar via public route
    const avatarRes = await app.inject({
      method: 'GET',
      url: uploadData.avatarUrl,
    });
    expect(avatarRes.statusCode).toBe(200);
    expect(avatarRes.headers['content-type']).toBe('image/webp');
    expect(avatarRes.headers['cache-control']).toContain('immutable');

    // 3. Reject invalid file signature
    const invalidRes = await app.inject({
      method: 'POST',
      url: '/admin/account/avatar',
      headers: {
        cookie,
        'content-type': 'image/jpeg',
      },
      payload: Buffer.from('this is not an image at all'),
    });
    expect(invalidRes.statusCode).toBe(422);

    // 4. Remove avatar
    const deleteRes = await app.inject({
      method: 'DELETE',
      url: '/admin/account/avatar',
      headers: { cookie },
    });
    expect(deleteRes.statusCode).toBe(200);
    expect(deleteRes.json().data.avatarUrl).toBeNull();

    // Verify profile reflects null image
    const overviewRes = await app.inject({
      method: 'GET',
      url: '/admin/account',
      headers: { cookie },
    });
    expect(overviewRes.json().data.profile.image).toBeNull();
  });

  it('supports email verification request and token confirmation', async () => {
    const orgId = await createOrgFixture('verify');
    const user = await createUserFixture('unverified-user');
    await createOwnerMembership(database.db, orgId, user.id, 'Owner User');

    const app = buildApi({ database, config, logger: false });
    const authRes = await signIn(app, user.email, user.password);
    const cookie = cookieHeader(authRes.headers['set-cookie']);

    // 1. Request verification resend
    const reqRes = await app.inject({
      method: 'POST',
      url: '/admin/account/email/verification',
      headers: { cookie },
    });
    expect(reqRes.statusCode).toBe(200);
    expect(reqRes.json().data.expiresAt).toBeDefined();

    // 2. Fetch token from database directly (simulating clicking link sent to email)
    const token = await findUserAuthVerificationValue(
      database.db,
      `email-verification:${user.id}`,
    );
    expect(token).toBeDefined();

    // 3. Confirm verification
    const verifyRes = await app.inject({
      method: 'POST',
      url: '/admin/account/email/verify',
      headers: { cookie },
      payload: { token },
    });
    expect(verifyRes.statusCode).toBe(200);
    expect(verifyRes.json().data.emailVerified).toBe(true);

    // 4. Verify account overview reflects verified state
    const checkRes = await app.inject({
      method: 'GET',
      url: '/admin/account',
      headers: { cookie },
    });
    expect(checkRes.json().data.profile.emailVerified).toBe(true);
  });

  it('supports secure email change with reauthentication and session revocation', async () => {
    const orgId = await createOrgFixture('change-email');
    const user = await createUserFixture('change-email-user');
    await createOwnerMembership(database.db, orgId, user.id, 'Owner User');

    const app = buildApi({ database, config, logger: false });
    const authRes = await signIn(app, user.email, user.password);
    const cookie = cookieHeader(authRes.headers['set-cookie']);

    const newEmail = `new-email-${crypto.randomUUID()}@test.local`;

    // 1. Reauthentication failure on wrong password
    const failRes = await app.inject({
      method: 'POST',
      url: '/admin/account/email/change',
      headers: { cookie },
      payload: { newEmail, currentPassword: 'WrongPassword123!' },
    });
    expect(failRes.statusCode).toBe(401);

    // 2. Initiate email change with correct password
    const changeRes = await app.inject({
      method: 'POST',
      url: '/admin/account/email/change',
      headers: { cookie },
      payload: { newEmail, currentPassword: user.password },
    });
    expect(changeRes.statusCode).toBe(200);
    expect(changeRes.json().data.pendingEmail).toBe(newEmail);

    // 3. Check overview shows pending change
    const overviewPending = await app.inject({
      method: 'GET',
      url: '/admin/account',
      headers: { cookie },
    });
    expect(overviewPending.json().data.pendingEmailChange?.pendingEmail).toBe(newEmail);

    // 4. Retrieve verification token for the pending email change
    const tokenVal = await findUserAuthVerificationValue(
      database.db,
      `email-change:${user.id}`,
    );
    expect(tokenVal).toBeDefined();
    const parsed = JSON.parse(tokenVal!) as { token: string };

    // 5. Confirm change with verification token
    const confirmRes = await app.inject({
      method: 'POST',
      url: '/admin/account/email/change/confirm',
      headers: { cookie },
      payload: { token: parsed.token },
    });
    expect(confirmRes.statusCode).toBe(200);
    expect(confirmRes.json().data.newEmail).toBe(newEmail);

    // 6. Verify canonical email changed and pending state cleared
    const overviewFinal = await app.inject({
      method: 'GET',
      url: '/admin/account',
      headers: { cookie },
    });
    expect(overviewFinal.json().data.profile.email).toBe(newEmail);
    expect(overviewFinal.json().data.profile.emailVerified).toBe(true);
    expect(overviewFinal.json().data.pendingEmailChange).toBeUndefined();
  });

  it('changes password with verification and rejects duplicate password', async () => {
    const orgId = await createOrgFixture('pwd');
    const user = await createUserFixture('pwd-user');
    await createOwnerMembership(database.db, orgId, user.id, 'Owner User');

    const app = buildApi({ database, config, logger: false });
    const authRes = await signIn(app, user.email, user.password);
    const cookie = cookieHeader(authRes.headers['set-cookie']);

    // 1. Wrong current password
    const failRes = await app.inject({
      method: 'POST',
      url: '/admin/account/password',
      headers: { cookie },
      payload: {
        currentPassword: 'WrongPassword!',
        newPassword: 'BrandNewPassword1234!',
      },
    });
    expect(failRes.statusCode).toBe(401);

    // 2. Same password rejected
    const sameRes = await app.inject({
      method: 'POST',
      url: '/admin/account/password',
      headers: { cookie },
      payload: {
        currentPassword: user.password,
        newPassword: user.password,
      },
    });
    expect(sameRes.statusCode).toBe(422);

    // 3. Valid password change
    const newPassword = 'BrandNewPassword1234!';
    const successRes = await app.inject({
      method: 'POST',
      url: '/admin/account/password',
      headers: { cookie },
      payload: {
        currentPassword: user.password,
        newPassword,
      },
    });
    expect(successRes.statusCode).toBe(200);
    expect(successRes.json().data.success).toBe(true);

    // 4. Verify login with new password succeeds
    const newLoginRes = await signIn(app, user.email, newPassword);
    expect(newLoginRes.statusCode).toBe(200);

    // 5. Old password fails
    const oldLoginRes = await signIn(app, user.email, user.password);
    expect(oldLoginRes.statusCode).toBe(401);
  });

  it('lists active sessions with friendly device labels and manages revocation', async () => {
    const orgId = await createOrgFixture('sessions');
    const user = await createUserFixture('session-user');
    await createOwnerMembership(database.db, orgId, user.id, 'Owner User');

    const app = buildApi({ database, config, logger: false });
    const authRes = await signIn(app, user.email, user.password);
    const cookie = cookieHeader(authRes.headers['set-cookie']);

    // List sessions
    const sessionsRes = await app.inject({
      method: 'GET',
      url: '/admin/account/sessions',
      headers: { cookie },
    });

    expect(sessionsRes.statusCode).toBe(200);
    const sessions = sessionsRes.json().data;
    expect(Array.isArray(sessions)).toBe(true);
    expect(sessions.length).toBeGreaterThanOrEqual(1);

    const currentSession = sessions.find((s: { isCurrent: boolean }) => s.isCurrent);
    expect(currentSession).toBeDefined();
    expect(currentSession.deviceLabel).toBeDefined();

    // Attempting to revoke current session via individual endpoint is prevented
    const revokeCurrentRes = await app.inject({
      method: 'POST',
      url: `/admin/account/sessions/${currentSession.id}/revoke`,
      headers: { cookie },
    });
    expect(revokeCurrentRes.statusCode).toBe(400);

    // Sign out everywhere revokes all sessions and sets expired cookie
    const revokeAllRes = await app.inject({
      method: 'POST',
      url: '/admin/account/sessions/revoke-all',
      headers: { cookie },
    });
    expect(revokeAllRes.statusCode).toBe(200);
    expect(revokeAllRes.headers['set-cookie']).toBeDefined();
  });

  it('retrieves security activity timeline without leaking internal secrets', async () => {
    const orgId = await createOrgFixture('activity');
    const user = await createUserFixture('activity-user');
    await createOwnerMembership(database.db, orgId, user.id, 'Owner User');

    const app = buildApi({ database, config, logger: false });
    const authRes = await signIn(app, user.email, user.password);
    const cookie = cookieHeader(authRes.headers['set-cookie']);

    // Perform an action that logs an audit event
    await app.inject({
      method: 'PATCH',
      url: '/admin/account/profile',
      headers: { cookie },
      payload: { name: 'Audited Profile Name' },
    });

    // Fetch activity feed
    const activityRes = await app.inject({
      method: 'GET',
      url: '/admin/account/activity',
      headers: { cookie },
    });

    expect(activityRes.statusCode).toBe(200);
    const activities = activityRes.json().data;
    expect(Array.isArray(activities)).toBe(true);
    expect(activities.length).toBeGreaterThan(0);

    // Verify activity entry does not contain password, token, or secret
    const serialized = JSON.stringify(activities);
    expect(serialized).not.toContain('password');
    expect(serialized).not.toContain('passwordHash');
    expect(serialized).not.toContain('sessionToken');
    expect(serialized).not.toContain('totpSecret');
  });
});
