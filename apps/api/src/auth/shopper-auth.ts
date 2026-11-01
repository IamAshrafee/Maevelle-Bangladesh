import { createHmac } from 'node:crypto';
import { betterAuth } from 'better-auth';
import { Resend } from 'resend';

import type { RuntimeConfig } from '@maevelle/config';
import type { DatabaseClient } from '@maevelle/database';
import { createAuthSecondaryStorage } from './secondary-storage.js';

export interface ShopperAuthEmail {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
}

export type ShopperAuthEmailSender = (message: ShopperAuthEmail) => Promise<void>;

function realmSecret(secret: string): string {
  return createHmac('sha256', secret).update('maevelle:shopper-auth:v1').digest('hex');
}

/** Production delivery uses the existing Resend configuration; tests inject a local mailbox. */
export function createShopperAuthEmailSender(config: RuntimeConfig): ShopperAuthEmailSender | null {
  if (!config.emailEnabled || config.emailProvider !== 'resend' || !config.resendApiKey)
    return null;
  const resend = new Resend(config.resendApiKey);
  return async ({ to, subject, text }) => {
    if (
      config.emailEnvironment !== 'production' &&
      !config.emailAllowedTestRecipients.includes(to.toLowerCase())
    )
      throw new Error('Shopper authentication email recipient is not allowed in this environment.');
    const result = await resend.emails.send({
      from: `${config.emailFromName} <${config.emailFromAddress}>`,
      to,
      replyTo: config.emailReplyTo,
      subject,
      text,
    });
    if (result.error) throw new Error('Shopper authentication email delivery failed.');
  };
}

/**
 * Separate cookie and secondary-storage namespaces prevent a copied Admin
 * session cookie from authenticating in the shopper realm.
 */
export function createShopperAuth(
  config: RuntimeConfig,
  database: DatabaseClient,
  sendEmail: ShopperAuthEmailSender,
) {
  const secret = realmSecret(config.betterAuthSecret);
  return betterAuth({
    appName: 'Maevelle Storefront',
    baseURL: config.authBaseUrl,
    basePath: '/shopper-auth',
    secret,
    trustedOrigins: [new URL(config.storefrontBaseUrl).origin],
    database: { db: database.db, type: 'postgres', casing: 'snake' },
    advanced: { cookiePrefix: 'maevelle-shopper', database: { generateId: false } },
    user: {
      modelName: 'iam.users',
      fields: { emailVerified: 'email_verified', createdAt: 'created_at', updatedAt: 'updated_at' },
      additionalFields: {
        emailNormalized: {
          type: 'string',
          fieldName: 'email_normalized',
          required: false,
          input: false,
          returned: false,
        },
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
      modelName: 'iam.sessions',
      expiresIn: 12 * 60 * 60,
      updateAge: 60,
      cookieCache: { enabled: false },
      storeSessionInDatabase: false,
      preserveSessionInDatabase: false,
    },
    secondaryStorage: createAuthSecondaryStorage({
      database,
      hmacSecret: secret,
      encryptionKey: Buffer.from(config.authEncryptionKey, 'base64'),
    }),
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: false,
      autoSignInAfterVerification: false,
      expiresIn: 900,
      sendVerificationEmail: async ({ user, url }) => {
        await sendEmail({
          to: user.email,
          subject: 'Verify your Maevelle account',
          text: `Open this link to verify your Maevelle account. It expires in 15 minutes:\n${url}`,
        });
      },
    },
    emailAndPassword: {
      enabled: true,
      disableSignUp: false,
      requireEmailVerification: true,
      autoSignIn: false,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      resetPasswordTokenExpiresIn: 900,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        await sendEmail({
          to: user.email,
          subject: 'Reset your Maevelle password',
          text: `Open this link to reset your Maevelle password. It expires in 15 minutes:\n${url}`,
        });
      },
    },
  });
}
