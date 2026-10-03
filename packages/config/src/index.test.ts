import { describe, expect, it } from 'vitest';

import { ConfigurationError, parseConfig } from './index.js';

const validEnvironment = {
  NODE_ENV: 'development',
  DATABASE_URL: 'postgresql://maevelle_dev:development-password@localhost:5434/maevelle_dev',
  TEST_DATABASE_URL: 'postgresql://maevelle_dev:development-password@localhost:5434/maevelle_test',
  BETTER_AUTH_SECRET: 'development-only-test-secret-at-least-32-chars',
  AUTH_ENCRYPTION_KEY: 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=',
};

describe('parseConfig', () => {
  it('parses valid runtime configuration with safe defaults', () => {
    const config = parseConfig(validEnvironment);

    expect(config).toMatchObject({
      nodeEnv: 'development',
      databaseUrl: validEnvironment.DATABASE_URL,
      testDatabaseUrl: validEnvironment.TEST_DATABASE_URL,
      databasePoolMax: 10,
      apiHost: '127.0.0.1',
      apiPort: 3000,
      logLevel: 'info',
      storefrontOrganizationCode: 'maevelle',
      emailEnabled: false,
      emailProvider: 'local',
      emailReplyTo: 'maevellebangladesh@gmail.com',
      smsEnabled: false,
      smsProvider: 'none',
      smsTestMode: true,
    });
  });

  it('rejects a production test-recipient override', () => {
    expect(() =>
      parseConfig({
        ...validEnvironment,
        NODE_ENV: 'production',
        EMAIL_ENVIRONMENT: 'production',
        EMAIL_TEST_RECIPIENT_OVERRIDE: 'developer@example.test',
        EMAIL_ALLOWED_TEST_RECIPIENTS: 'developer@example.test',
      }),
    ).toThrow(/EMAIL_TEST_RECIPIENT_OVERRIDE/);
  });

  it('requires Resend secrets when production sending is enabled', () => {
    expect(() =>
      parseConfig({
        ...validEnvironment,
        NODE_ENV: 'production',
        EMAIL_ENVIRONMENT: 'production',
        EMAIL_ENABLED: 'true',
        EMAIL_PROVIDER: 'resend',
        EMAIL_FROM_ADDRESS: 'orders@maevelle.example',
      }),
    ).toThrow(/RESEND_API_KEY/);
  });

  it('rejects unsafe production SMS test configuration', () => {
    expect(() => parseConfig({ ...validEnvironment, NODE_ENV: 'production', SMS_ENVIRONMENT: 'production', SMS_TEST_MODE: 'true' })).toThrow(/SMS_TEST_MODE/);
  });

  it('requires an SMS provider when sending is enabled', () => {
    expect(() => parseConfig({ ...validEnvironment, SMS_ENABLED: 'true', SMS_PROVIDER: 'none' })).toThrow(/SMS_PROVIDER/);
  });

  it('selects the distinct test database when NODE_ENV is test', () => {
    const config = parseConfig({ ...validEnvironment, NODE_ENV: 'test' });

    expect(config.databaseUrl).toBe(validEnvironment.TEST_DATABASE_URL);
  });

  it('fails closed when a required database URL is absent', () => {
    expect(() => parseConfig({ NODE_ENV: 'development' })).toThrow(ConfigurationError);
  });

  it('does not expose invalid secret values in configuration errors', () => {
    const secret = 'this-must-never-appear-in-an-error';

    try {
      parseConfig({
        ...validEnvironment,
        DATABASE_URL: `mysql://user:${secret}@localhost/maevelle`,
      });
      throw new Error('Expected configuration parsing to fail.');
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigurationError);
      expect((error as Error).message).not.toContain(secret);
      expect((error as Error).message).toContain('DATABASE_URL');
    }
  });

  it('populates storefrontInternalApiUrl with fallback when omitted', () => {
    const config = parseConfig(validEnvironment);
    expect(config.storefrontInternalApiUrl).toBe('http://127.0.0.1:3000');
  });

  it('boots cleanly with Category A deployment variables only without requiring business settings', () => {
    const minimalCategoryAEnv = {
      NODE_ENV: 'development',
      DATABASE_URL: 'postgresql://maevelle_dev:dev@localhost:5434/maevelle_dev',
      BETTER_AUTH_SECRET: 'k'.repeat(32),
      AUTH_ENCRYPTION_KEY: Buffer.alloc(32).toString('base64'),
    };

    const config = parseConfig(minimalCategoryAEnv);
    expect(config.databaseUrl).toBe(minimalCategoryAEnv.DATABASE_URL);
    expect(config.emailEnabled).toBe(false); // safe default; DB settings govern
    expect(config.mediaMaxUploadBytes).toBe(10 * 1024 * 1024);
    expect(config.mediaUploadExpirySeconds).toBe(900);
  });
});
