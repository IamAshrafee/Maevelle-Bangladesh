import { afterAll, describe, expect, it } from 'vitest';
import { base32 } from '@better-auth/utils/base32';

import type { RuntimeConfig } from '@maevelle/config';
import { createDatabase } from '@maevelle/database';
import { createOrganization, createOwnerMembership } from '@maevelle/database/platform';

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
  mediaStoragePath: 'var/test-media',
  mediaMaxUploadBytes: 10 * 1024 * 1024,
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
      expect(allowed.statusCode).toBe(200);
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
      expect(beforeEnrollment.statusCode).toBe(200);

      const enrollment = await auth.api.enableTwoFactor({
        headers: new Headers({ cookie: initialSession }),
        body: { password: user.password },
      });
      const encodedSecret = new URL(enrollment.totpURI).searchParams.get('secret');
      expect(encodedSecret).toBeTruthy();
      // Better Auth exposes the enrollment secret as standard Base32 in the
      // authenticator URI; use its own utility rather than reimplementing TOTP.
      const secret = new TextDecoder().decode(base32.decode(encodedSecret!));
      const validCode = await auth.api.generateTOTP({ body: { secret } });
      expect(validCode.code).toMatch(/^\d{6}$/);

      const enrollmentVerification = await app.inject({
        method: 'POST',
        url: '/auth/two-factor/verify-totp',
        headers: { cookie: initialSession },
        payload: { code: validCode.code },
      });
      expect(enrollmentVerification.statusCode, enrollmentVerification.body).toBe(200);
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
    } finally {
      await app.close();
    }
  });
});
