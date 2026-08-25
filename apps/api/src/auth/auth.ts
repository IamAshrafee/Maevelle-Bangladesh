import { betterAuth } from 'better-auth';
import { twoFactor } from 'better-auth/plugins';

import type { RuntimeConfig } from '@maevelle/config';
import type { DatabaseClient } from '@maevelle/database';

import { createAuthSecondaryStorage } from './secondary-storage.js';

export interface MaevelleAuth {
  readonly handler: (request: Request) => Promise<Response>;
  readonly api: {
    getSession(input: { headers: Headers }): Promise<{ user?: { id?: string } } | null>;
    signUpEmail(input: {
      body: { email: string; password: string; name: string };
    }): Promise<{ user?: { id?: string } }>;
    enableTwoFactor(input: {
      headers: Headers;
      body: { password: string; issuer?: string };
    }): Promise<{ totpURI: string; backupCodes: string[] }>;
    generateTOTP(input: { body: { secret: string } }): Promise<{ code: string }>;
  };
}

/**
 * Better Auth 1.6.25 is authentication-only. Maevelle authorization is
 * resolved separately through active organization membership and capabilities.
 */
export function createAuth(
  config: RuntimeConfig,
  database: DatabaseClient,
  allowBootstrapSignUp = false,
): MaevelleAuth {
  return betterAuth({
    appName: 'Maevelle Admin',
    baseURL: config.authBaseUrl,
    basePath: '/auth',
    secret: config.betterAuthSecret,
    trustedOrigins: config.authTrustedOrigins as string[],
    database: {
      db: database.db,
      type: 'postgres',
      casing: 'snake',
    },
    advanced: { database: { generateId: false } },
    user: {
      modelName: 'iam.users',
      fields: {
        emailVerified: 'email_verified',
        createdAt: 'created_at',
        updatedAt: 'updated_at',
      },
    },
    account: {
      modelName: 'iam.auth_accounts',
      fields: {
        accountId: 'account_id',
        providerId: 'provider_id',
        userId: 'user_id',
        accessToken: 'access_token',
        refreshToken: 'refresh_token',
        idToken: 'id_token',
        accessTokenExpiresAt: 'access_token_expires_at',
        refreshTokenExpiresAt: 'refresh_token_expires_at',
        createdAt: 'created_at',
        updatedAt: 'updated_at',
      },
    },
    verification: {
      modelName: 'iam.auth_verifications',
      fields: { expiresAt: 'expires_at', createdAt: 'created_at', updatedAt: 'updated_at' },
    },
    session: {
      // Authentication secrets live only in encrypted secondary storage. Cookie cache remains disabled.
      modelName: 'iam.sessions',
      expiresIn: 12 * 60 * 60,
      updateAge: 60,
      cookieCache: { enabled: false },
      storeSessionInDatabase: false,
      preserveSessionInDatabase: true,
    },
    emailAndPassword: {
      enabled: true,
      disableSignUp: !allowBootstrapSignUp,
      minPasswordLength: 12,
      maxPasswordLength: 128,
    },
    secondaryStorage: createAuthSecondaryStorage({
      database,
      hmacSecret: config.betterAuthSecret,
      encryptionKey: Buffer.from(config.authEncryptionKey, 'base64'),
    }),
    plugins: [
      twoFactor({
        issuer: 'Maevelle Admin',
        twoFactorTable: 'iam.auth_two_factor',
        schema: {
          user: {
            fields: {
              twoFactorEnabled: 'two_factor_enabled',
            },
          },
          twoFactor: {
            fields: {
              userId: 'user_id',
              backupCodes: 'backup_codes',
              failedVerificationCount: 'failed_verification_count',
              lockedUntil: 'locked_until',
            },
          },
        },
      }),
    ],
  });
}
