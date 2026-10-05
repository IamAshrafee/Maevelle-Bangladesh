import { afterAll, describe, expect, it } from 'vitest';
import { base32 } from '@better-auth/utils/base32';

import type { RuntimeConfig } from '@maevelle/config';
import { createDatabase } from '@maevelle/database';
import { listIamAuditEvents, updateOrganizationTwoFactorPolicy } from '@maevelle/database/iam';
import {
  createOrganization,
  createOwnerMembership,
  findActiveAdminContext,
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
  mediaStoragePath: 'var/test-media',
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

async function createOrganizationFixture(label: string): Promise<string> {
  const organization = await createOrganization(database.db, {
    code: `identity-${label}-${crypto.randomUUID().slice(0, 8)}`,
    displayName: `Identity ${label}`,
    timezone: 'UTC',
    defaultLocale: 'en',
    defaultCurrency: 'USD',
  });
  return organization.id;
}

async function createUser(
  emailLabel: string,
): Promise<{ id: string; email: string; password: string }> {
  const email = `${emailLabel}-${crypto.randomUUID()}@test.local`;
  const password = 'Maevelle-test-password-2026';
  const auth = createAuth(config, database, true);
  const result = await auth.api.signUpEmail({
    body: { email, password, name: `Test ${emailLabel}` },
  });
  if (!result.user?.id) throw new Error('Test user signup did not return an identifier.');
  return { id: result.user.id, email, password };
}

async function signIn(app: ReturnType<typeof buildApi>, email: string, password: string) {
  return app.inject({
    method: 'POST',
    url: '/auth/sign-in/email',
    payload: { email, password },
  });
}

afterAll(async () => database.close());

describe('central organization context authorization', () => {
  it('fails closed across organizations, memberships, and capabilities', async () => {
    const app = buildApi({ database, config, logger: false });
    const organizationA = await createOrganizationFixture('a');
    const organizationB = await createOrganizationFixture('b');
    const userA = await createUser('a');
    const userB = await createUser('b');
    const userWithoutMembership = await createUser('none');
    await createOwnerMembership(database.db, organizationA, userA.id, 'User A');
    await createOwnerMembership(database.db, organizationB, userB.id, 'User B');

    try {
      const signedInA = await signIn(app, userA.email, userA.password);
      const signedInB = await signIn(app, userB.email, userB.password);
      const signedInWithoutMembership = await signIn(
        app,
        userWithoutMembership.email,
        userWithoutMembership.password,
      );
      expect(signedInA.statusCode).toBe(200);
      expect(signedInB.statusCode).toBe(200);
      expect(signedInWithoutMembership.statusCode).toBe(200);

      const sessionA = cookieHeader(signedInA.headers['set-cookie']);
      const sessionB = cookieHeader(signedInB.headers['set-cookie']);
      const sessionWithoutMembership = cookieHeader(
        signedInWithoutMembership.headers['set-cookie'],
      );

      const allowed = await app.inject({
        method: 'GET',
        url: `/admin/context?organizationId=${organizationA}`,
        headers: { cookie: sessionA },
      });
      expect(allowed.statusCode, allowed.body).toBe(200);
      expect(allowed.json()).toMatchObject({ actorId: userA.id, organizationId: organizationA });

      const aToB = await app.inject({
        method: 'GET',
        url: `/admin/context?organizationId=${organizationB}`,
        headers: { cookie: sessionA },
      });
      const bToA = await app.inject({
        method: 'GET',
        url: `/admin/context?organizationId=${organizationA}`,
        headers: { cookie: sessionB },
      });
      const noMembership = await app.inject({
        method: 'GET',
        url: `/admin/context?organizationId=${organizationA}`,
        headers: { cookie: sessionWithoutMembership },
      });
      const missingCapability = await app.inject({
        method: 'GET',
        url: `/admin/context?organizationId=${organizationA}&requiredCapability=platform.manage`,
        headers: { cookie: sessionA },
      });

      for (const response of [aToB, bToA, noMembership, missingCapability]) {
        expect(response.statusCode).toBe(403);
        expect(response.json()).toEqual({ error: 'FORBIDDEN' });
      }
      expect(aToB.body).not.toContain(organizationB);
    } finally {
      await app.close();
    }
  });
});

describe('Better Auth TOTP enforcement', () => {
  it('enforces a zero-grace organization requirement on protected Admin APIs', async () => {
    const app = buildApi({ database, config, logger: false });
    const organizationId = await createOrganizationFixture('mfa-policy-gate');
    const user = await createUser('mfa-policy-gate');
    await createOwnerMembership(database.db, organizationId, user.id, 'Policy Gate Owner');
    const actor = await findActiveAdminContext(database.db, user.id, { organizationId });
    if (!actor) throw new Error('Owner context was not created.');

    try {
      const signedIn = await signIn(app, user.email, user.password);
      const session = cookieHeader(signedIn.headers['set-cookie']);
      await updateOrganizationTwoFactorPolicy(database.db, {
        actor: {
          organizationId,
          userId: user.id,
          membershipId: actor.membershipId,
        },
        expectedVersion: 0,
        mode: 'ALL_MEMBERS',
        gracePeriodHours: 0,
        reason: 'Integration-test mandatory enrollment gate',
      });

      const context = await app.inject({
        method: 'GET',
        url: '/admin/context',
        headers: { cookie: session },
      });
      expect(context.statusCode, context.body).toBe(200);
      expect(context.json()).toMatchObject({
        twoFactor: { enrollmentRequired: true, accessRestricted: true },
      });
      const enrollmentStatus = await app.inject({
        method: 'GET',
        url: '/admin/security/two-factor/status',
        headers: { cookie: session },
      });
      expect(enrollmentStatus.statusCode, enrollmentStatus.body).toBe(200);

      const protectedRoute = await app.inject({
        method: 'GET',
        url: '/admin/security/two-factor/policy',
        headers: { cookie: session },
      });
      expect(protectedRoute.statusCode, protectedRoute.body).toBe(403);
      expect(protectedRoute.json()).toMatchObject({
        error: { code: 'TWO_FACTOR_ENROLLMENT_REQUIRED' },
      });
    } finally {
      await app.close();
    }
  });

  it('requires a valid second factor before restoring protected access and revokes it on logout', async () => {
    const app = buildApi({ database, config, logger: false });
    const organizationId = await createOrganizationFixture('mfa');
    const user = await createUser('mfa');
    await createOwnerMembership(database.db, organizationId, user.id, 'MFA User');
    const auth = createAuth(config, database, true);

    try {
      const initialLogin = await signIn(app, user.email, user.password);
      expect(initialLogin.statusCode).toBe(200);
      const initialSession = cookieHeader(initialLogin.headers['set-cookie']);
      const beforeEnrollment = await app.inject({
        method: 'GET',
        url: '/admin/context',
        headers: { cookie: initialSession },
      });
      expect(beforeEnrollment.statusCode, beforeEnrollment.body).toBe(200);

      const enrollmentResponse = await app.inject({
        method: 'POST',
        url: '/admin/security/two-factor/enrollment',
        headers: { cookie: initialSession },
        payload: { password: user.password },
      });
      expect(enrollmentResponse.statusCode, enrollmentResponse.body).toBe(200);
      const enrollment = enrollmentResponse.json<{ data: { totpUri: string } }>().data;
      const encodedSecret = new URL(enrollment.totpUri).searchParams.get('secret');
      expect(encodedSecret).toBeTruthy();
      // Better Auth exposes the enrollment secret as standard Base32 in the
      // authenticator URI; use its own utility rather than reimplementing TOTP.
      const secret = new TextDecoder().decode(base32.decode(encodedSecret!));
      const validCode = await auth.api.generateTOTP({ body: { secret } });
      expect(validCode.code).toMatch(/^\d{6}$/);

      const enrollmentVerification = await app.inject({
        method: 'POST',
        url: '/admin/security/two-factor/enrollment/verify',
        headers: { cookie: initialSession },
        payload: { code: validCode.code },
      });
      expect(enrollmentVerification.statusCode, enrollmentVerification.body).toBe(200);
      const backupCodes = enrollmentVerification.json<{
        data: { backupCodes: string[] };
      }>().data.backupCodes;
      expect(backupCodes.length).toBeGreaterThan(1);
      const firstBackupCode = backupCodes[0];
      if (!firstBackupCode) throw new Error('Enrollment did not return a recovery code.');
      const enrolledSession = cookieHeader(enrollmentVerification.headers['set-cookie']);

      const signOutInitial = await app.inject({
        method: 'POST',
        url: '/auth/sign-out',
        headers: { cookie: enrolledSession },
        payload: {},
      });
      expect(signOutInitial.statusCode).toBe(200);

      const passwordOnly = await signIn(app, user.email, user.password);
      expect(passwordOnly.statusCode).toBe(200);
      expect(passwordOnly.json()).toMatchObject({ twoFactorRedirect: true });
      const challengeCookie = cookieHeader(passwordOnly.headers['set-cookie']);
      const blocked = await app.inject({
        method: 'GET',
        url: '/admin/context',
        headers: { cookie: challengeCookie },
      });
      expect(blocked.statusCode).toBe(401);

      const invalidCode = '000000';
      const invalidVerification = await app.inject({
        method: 'POST',
        url: '/auth/two-factor/verify-totp',
        headers: { cookie: challengeCookie },
        payload: { code: invalidCode },
      });
      expect(invalidVerification.statusCode).toBeGreaterThanOrEqual(400);
      expect(invalidVerification.body).not.toContain(invalidCode);
      expect(invalidVerification.body).not.toContain(secret!);
      expect(invalidVerification.body).not.toContain(user.password);

      const validVerification = await app.inject({
        method: 'POST',
        url: '/auth/two-factor/verify-totp',
        headers: { cookie: challengeCookie },
        payload: { code: validCode.code },
      });
      expect(validVerification.statusCode).toBe(200);
      const authenticatedSession = cookieHeader(validVerification.headers['set-cookie']);
      const allowed = await app.inject({
        method: 'GET',
        url: '/admin/context',
        headers: { cookie: authenticatedSession },
      });
      expect(allowed.statusCode).toBe(200);

      const signOut = await app.inject({
        method: 'POST',
        url: '/auth/sign-out',
        headers: { cookie: authenticatedSession },
        payload: {},
      });
      expect(signOut.statusCode).toBe(200);
      const afterLogout = await app.inject({
        method: 'GET',
        url: '/admin/context',
        headers: { cookie: authenticatedSession },
      });
      expect(afterLogout.statusCode).toBe(401);

      const recoverySignIn = await signIn(app, user.email, user.password);
      expect(recoverySignIn.json()).toMatchObject({ twoFactorRedirect: true });
      const recoveryChallenge = cookieHeader(recoverySignIn.headers['set-cookie']);
      const recoveryVerification = await app.inject({
        method: 'POST',
        url: '/auth/two-factor/verify-backup-code',
        headers: { cookie: recoveryChallenge },
        payload: { code: firstBackupCode },
      });
      expect(recoveryVerification.statusCode, recoveryVerification.body).toBe(200);
      const recoverySession = cookieHeader(recoveryVerification.headers['set-cookie']);
      expect(
        (
          await app.inject({
            method: 'GET',
            url: '/admin/context',
            headers: { cookie: recoverySession },
          })
        ).statusCode,
      ).toBe(200);

      await app.inject({
        method: 'POST',
        url: '/auth/sign-out',
        headers: { cookie: recoverySession },
        payload: {},
      });
      const reusedCodeSignIn = await signIn(app, user.email, user.password);
      const reusedCodeChallenge = cookieHeader(reusedCodeSignIn.headers['set-cookie']);
      const reusedCode = await app.inject({
        method: 'POST',
        url: '/auth/two-factor/verify-backup-code',
        headers: { cookie: reusedCodeChallenge },
        payload: { code: firstBackupCode },
      });
      expect(reusedCode.statusCode).toBeGreaterThanOrEqual(400);
      expect(reusedCode.body).not.toContain(firstBackupCode);

      const secondBackupCode = backupCodes[1];
      const oldUnusedBackupCode = backupCodes[2];
      if (!secondBackupCode || !oldUnusedBackupCode)
        throw new Error('Enrollment returned too few recovery codes for lifecycle verification.');
      const secondRecovery = await app.inject({
        method: 'POST',
        url: '/auth/two-factor/verify-backup-code',
        headers: { cookie: reusedCodeChallenge },
        payload: { code: secondBackupCode },
      });
      expect(secondRecovery.statusCode, secondRecovery.body).toBe(200);
      const secondRecoverySession = cookieHeader(secondRecovery.headers['set-cookie']);
      const currentTotp = await auth.api.generateTOTP({ body: { secret } });
      const regenerated = await app.inject({
        method: 'POST',
        url: '/admin/security/two-factor/backup-codes',
        headers: { cookie: secondRecoverySession },
        payload: { password: user.password, code: currentTotp.code },
      });
      expect(regenerated.statusCode, regenerated.body).toBe(200);
      const regeneratedCodes = regenerated.json<{ data: { backupCodes: string[] } }>().data
        .backupCodes;
      const firstRegeneratedCode = regeneratedCodes[0];
      if (!firstRegeneratedCode) throw new Error('Recovery-code regeneration returned no codes.');

      await app.inject({
        method: 'POST',
        url: '/auth/sign-out',
        headers: { cookie: secondRecoverySession },
        payload: {},
      });
      const regeneratedSignIn = await signIn(app, user.email, user.password);
      const regeneratedChallenge = cookieHeader(regeneratedSignIn.headers['set-cookie']);
      const invalidatedOldCode = await app.inject({
        method: 'POST',
        url: '/auth/two-factor/verify-backup-code',
        headers: { cookie: regeneratedChallenge },
        payload: { code: oldUnusedBackupCode },
      });
      expect(invalidatedOldCode.statusCode).toBeGreaterThanOrEqual(400);
      const validRegeneratedCode = await app.inject({
        method: 'POST',
        url: '/auth/two-factor/verify-backup-code',
        headers: { cookie: regeneratedChallenge },
        payload: { code: firstRegeneratedCode },
      });
      expect(validRegeneratedCode.statusCode, validRegeneratedCode.body).toBe(200);

      const audit = await listIamAuditEvents(database.db, organizationId, {
        search: 'iam.two_factor.',
      });
      expect(audit.items.map((row) => row.action)).toEqual(
        expect.arrayContaining([
          'iam.two_factor.enrollment_started',
          'iam.two_factor.enabled',
          'iam.two_factor.backup_codes_regenerated',
          'iam.two_factor.recovery_code_used',
        ]),
      );
      const serializedAudit = JSON.stringify(audit.items);
      expect(serializedAudit).not.toContain(secret);
      for (const backupCode of backupCodes) expect(serializedAudit).not.toContain(backupCode);
      for (const backupCode of regeneratedCodes) expect(serializedAudit).not.toContain(backupCode);
    } finally {
      await app.close();
    }
  });

  it('temporarily locks a protected account after the configured failed-attempt limit', async () => {
    const lockConfig: RuntimeConfig = {
      ...config,
      authTotpMaxFailedAttempts: 3,
      authTotpLockSeconds: 60,
    };
    const app = buildApi({ database, config: lockConfig, logger: false });
    const organizationId = await createOrganizationFixture('mfa-lock');
    const user = await createUser('mfa-lock');
    await createOwnerMembership(database.db, organizationId, user.id, 'Locked MFA User');
    const auth = createAuth(lockConfig, database, true);

    try {
      const initialLogin = await signIn(app, user.email, user.password);
      const initialSession = cookieHeader(initialLogin.headers['set-cookie']);
      const enrollment = await app.inject({
        method: 'POST',
        url: '/admin/security/two-factor/enrollment',
        headers: { cookie: initialSession },
        payload: { password: user.password },
      });
      expect(enrollment.statusCode, enrollment.body).toBe(200);
      const encodedSecret = new URL(
        enrollment.json<{ data: { totpUri: string } }>().data.totpUri,
      ).searchParams.get('secret');
      if (!encodedSecret) throw new Error('Enrollment did not return a TOTP secret.');
      const secret = new TextDecoder().decode(base32.decode(encodedSecret));
      const validCode = (await auth.api.generateTOTP({ body: { secret } })).code;
      const verified = await app.inject({
        method: 'POST',
        url: '/admin/security/two-factor/enrollment/verify',
        headers: { cookie: initialSession },
        payload: { code: validCode },
      });
      expect(verified.statusCode, verified.body).toBe(200);
      await app.inject({
        method: 'POST',
        url: '/auth/sign-out',
        headers: { cookie: cookieHeader(verified.headers['set-cookie']) },
        payload: {},
      });

      const challenge = await signIn(app, user.email, user.password);
      const challengeCookie = cookieHeader(challenge.headers['set-cookie']);
      const invalidCodes = ['000000', '000001', '000002', '000003'].filter(
        (candidate) => candidate !== validCode,
      );
      for (const invalidCode of invalidCodes.slice(0, 3)) {
        const failed = await app.inject({
          method: 'POST',
          url: '/auth/two-factor/verify-totp',
          headers: { cookie: challengeCookie },
          payload: { code: invalidCode },
        });
        expect(failed.statusCode).toBeGreaterThanOrEqual(400);
        expect(failed.body).not.toContain(invalidCode);
      }
      const locked = await app.inject({
        method: 'POST',
        url: '/auth/two-factor/verify-totp',
        headers: { cookie: challengeCookie },
        payload: { code: invalidCodes[3] ?? '999999' },
      });
      expect(locked.statusCode, locked.body).toBe(429);
      expect(locked.json()).toMatchObject({ code: 'ACCOUNT_TEMPORARILY_LOCKED' });
    } finally {
      await app.close();
    }
  });
});
