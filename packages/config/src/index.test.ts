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
    });
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
});
