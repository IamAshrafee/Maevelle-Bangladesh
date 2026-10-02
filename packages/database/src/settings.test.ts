import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'kysely';

import { createDatabase } from './index.js';
import { createOrganization } from './platform.js';
import {
  SETTING_DEFINITIONS,
  getSettingMetadataList,
  resolveEmailSettings,
  resolveMediaSettings,
  resolveStorefrontSettings,
  resolveGeneralSettings,
  updateSingleSetting,
  updateModuleSettings,
  resetSingleSetting,
  resetModuleSettings,
  saveIntegrationSecret,
  getIntegrationSecret,
  hasIntegrationSecret,
  deleteIntegrationSecret,
  invalidateSettingsCache,
  SettingsDomainError,
  type SettingMetadataDto,
} from './settings.js';

const database = createDatabase({
  connectionString: process.env.TEST_DATABASE_URL!,
  maxConnections: 4,
});

const testActorId = '018f0000-0000-7000-8000-000000000001';

afterAll(async () => database.close());

beforeEach(() => {
  invalidateSettingsCache();
});

async function createTestOrg(prefix: string): Promise<string> {
  const org = await createOrganization(database.db, {
    code: `settings-${prefix}-${crypto.randomUUID().slice(0, 8)}`,
    displayName: `Settings Test ${prefix}`,
    timezone: 'UTC',
    defaultLocale: 'en',
    defaultCurrency: 'BDT',
  });
  return org.id;
}

describe('Settings Definitions & Metadata Registry', () => {
  it('registers all core settings across general, email, media, storefront, and security modules', () => {
    const list = getSettingMetadataList();
    expect(list.length).toBeGreaterThanOrEqual(14);

    const keys = list.map((s: SettingMetadataDto) => s.key);
    expect(keys).toContain('email.enabled');
    expect(keys).toContain('email.fromName');
    expect(keys).toContain('email.fromAddress');
    expect(keys).toContain('email.replyTo');
    expect(keys).toContain('email.testRecipientOverride');
    expect(keys).toContain('media.maxUploadBytes');
    expect(keys).toContain('media.uploadExpirySeconds');
    expect(keys).toContain('storefront.publicBaseUrl');
    expect(keys).toContain('storefront.storeName');
    expect(keys).toContain('general.lowStockThreshold');
  });

  it('provides authoritative default values and validation rules', () => {
    expect(SETTING_DEFINITIONS['email.enabled']?.defaultValue).toBe(false);
    expect(SETTING_DEFINITIONS['media.maxUploadBytes']?.defaultValue).toBe(10 * 1024 * 1024);
    expect(SETTING_DEFINITIONS['media.uploadExpirySeconds']?.defaultValue).toBe(900);
    expect(SETTING_DEFINITIONS['storefront.publicBaseUrl']?.defaultValue).toBe('http://localhost:8080');
  });
});

describe('Typed Module Setting Resolution & Precedence', () => {
  it('resolves email settings with schema defaults when no override exists', async () => {
    const orgId = await createTestOrg('email-def');
    const { settings, readiness } = await resolveEmailSettings(database.db, orgId);

    expect(settings.enabled).toBe(false);
    expect(settings.provider).toBe('local');
    expect(settings.fromName).toBe('Maevelle');
    expect(settings.fromAddress).toBe('orders@example.invalid');
    expect(settings.replyTo).toBe('maevelleBangladesh@gmail.com');
    expect(settings.testRecipientOverride).toBeUndefined();
    expect(readiness.status).toBe('ready');
  });

  it('resolves database overrides when configured', async () => {
    const orgId = await createTestOrg('email-override');
    await updateModuleSettings(database.db, {
      organizationId: orgId,
      actorId: testActorId,
      module: 'email',
      settings: {
        'email.enabled': true,
        'email.fromName': 'Maevelle Store',
        'email.fromAddress': 'noreply@maevelle.com',
        'email.testRecipientOverride': 'qa@maevelle.local',
      },
    });

    const { settings } = await resolveEmailSettings(database.db, orgId);
    expect(settings.enabled).toBe(true);
    expect(settings.fromName).toBe('Maevelle Store');
    expect(settings.fromAddress).toBe('noreply@maevelle.com');
    expect(settings.testRecipientOverride).toBe('qa@maevelle.local');
  });

  it('resolves media settings with validation and custom limits', async () => {
    const orgId = await createTestOrg('media-res');
    const defaults = await resolveMediaSettings(database.db, orgId);
    expect(defaults.maxUploadBytes).toBe(10 * 1024 * 1024);
    expect(defaults.uploadExpirySeconds).toBe(900);

    await updateSingleSetting(database.db, {
      organizationId: orgId,
      actorId: testActorId,
      key: 'media.maxUploadBytes',
      value: 20 * 1024 * 1024,
    });
    invalidateSettingsCache();

    const updated = await resolveMediaSettings(database.db, orgId);
    expect(updated.maxUploadBytes).toBe(20 * 1024 * 1024);
  });

  it('resolves storefront settings and general operational thresholds', async () => {
    const orgId = await createTestOrg('storefront-res');
    const sf = await resolveStorefrontSettings(database.db, orgId);
    expect(sf.publicBaseUrl).toBe('http://localhost:8080');
    expect(sf.storeName).toBe('Maevelle');

    const general = await resolveGeneralSettings(database.db, orgId);
    expect(general.lowStockThreshold).toBe(5);
    expect(general.sessionTimeoutMinutes).toBe(1440);
  });
});

describe('Multi-Tenant Isolation & Concurrency', () => {
  it('isolates configuration overrides between different organizations', async () => {
    const orgA = await createTestOrg('iso-a');
    const orgB = await createTestOrg('iso-b');

    await updateSingleSetting(database.db, {
      organizationId: orgA,
      actorId: testActorId,
      key: 'email.fromName',
      value: 'Org A Brand',
    });

    const resA = await resolveEmailSettings(database.db, orgA);
    const resB = await resolveEmailSettings(database.db, orgB);

    expect(resA.settings.fromName).toBe('Org A Brand');
    expect(resB.settings.fromName).toBe('Maevelle'); // Default for Org B
  });
});

describe('Validation & Invariants', () => {
  it('rejects invalid email addresses for fromAddress', async () => {
    const orgId = await createTestOrg('val-email');
    await expect(
      updateSingleSetting(database.db, {
        organizationId: orgId,
        actorId: testActorId,
        key: 'email.fromAddress',
        value: 'not-an-email',
      }),
    ).rejects.toThrow(SettingsDomainError);
  });

  it('rejects negative or out-of-range upload byte sizes', async () => {
    const orgId = await createTestOrg('val-media');
    await expect(
      updateSingleSetting(database.db, {
        organizationId: orgId,
        actorId: testActorId,
        key: 'media.maxUploadBytes',
        value: -100,
      }),
    ).rejects.toThrow(SettingsDomainError);

    await expect(
      updateSingleSetting(database.db, {
        organizationId: orgId,
        actorId: testActorId,
        key: 'media.maxUploadBytes',
        value: 1000 * 1024 * 1024, // Exceeds 100MB limit
      }),
    ).rejects.toThrow(SettingsDomainError);
  });

  it('rejects unknown setting keys', async () => {
    const orgId = await createTestOrg('val-unknown');
    await expect(
      updateSingleSetting(database.db, {
        organizationId: orgId,
        actorId: testActorId,
        key: 'invalid.randomKey',
        value: 'hello',
      }),
    ).rejects.toThrow(SettingsDomainError);
  });
});

describe('Reset to Default Behavior', () => {
  it('resets an individual setting override back to the schema default', async () => {
    const orgId = await createTestOrg('reset-single');
    await updateSingleSetting(database.db, {
      organizationId: orgId,
      actorId: testActorId,
      key: 'storefront.storeName',
      value: 'Custom Boutique',
    });

    let sf = await resolveStorefrontSettings(database.db, orgId);
    expect(sf.storeName).toBe('Custom Boutique');

    await resetSingleSetting(database.db, {
      organizationId: orgId,
      actorId: testActorId,
      key: 'storefront.storeName',
    });

    sf = await resolveStorefrontSettings(database.db, orgId);
    expect(sf.storeName).toBe('Maevelle');
  });

  it('resets an entire module back to defaults', async () => {
    const orgId = await createTestOrg('reset-module');
    await updateModuleSettings(database.db, {
      organizationId: orgId,
      actorId: testActorId,
      module: 'general',
      settings: {
        'general.lowStockThreshold': 20,
        'general.sessionTimeoutMinutes': 60,
      },
    });

    let general = await resolveGeneralSettings(database.db, orgId);
    expect(general.lowStockThreshold).toBe(20);

    await resetModuleSettings(database.db, {
      organizationId: orgId,
      actorId: testActorId,
      module: 'general',
    });

    general = await resolveGeneralSettings(database.db, orgId);
    expect(general.lowStockThreshold).toBe(5);
  });
});

describe('Encrypted Integration Secrets Architecture', () => {
  const testKey = {
    id: 'test-root-key',
    value: Buffer.from('MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=', 'base64'),
  };

  it('stores secrets encrypted with AES-256-GCM and never exposes ciphertext in status', async () => {
    const orgId = await createTestOrg('secrets-enc');

    const status = await saveIntegrationSecret(database.db, {
      organizationId: orgId,
      actorId: testActorId,
      providerCode: 'RESEND',
      keyName: 'apiKey',
      plaintextSecret: 're_1234567890abcdef',
      encryptionKey: testKey,
    });

    expect(status.configured).toBe(true);
    expect(status.providerCode).toBe('RESEND');
    expect(status.keyName).toBe('apikey');
    expect((status as unknown as Record<string, unknown>).secret_ciphertext).toBeUndefined();

    const exists = await hasIntegrationSecret(database.db, {
      organizationId: orgId,
      providerCode: 'RESEND',
      keyName: 'apiKey',
    });
    expect(exists).toBe(true);

    // Verify raw database row is encrypted
    const row = await sql<{
      secret_ciphertext: string;
      secret_key_id: string;
    }>`select secret_ciphertext, secret_key_id from settings.integration_secrets where organization_id=${orgId}::uuid and provider_code='RESEND' and secret_key_name='apikey'`.execute(database.db);
    expect(row.rows[0]?.secret_ciphertext).not.toBe('re_1234567890abcdef');
    expect(row.rows[0]?.secret_ciphertext).toContain(':');

    // Reveal secret only through authoritative decryptor
    const revealed = await getIntegrationSecret(database.db, {
      organizationId: orgId,
      providerCode: 'RESEND',
      keyName: 'apiKey',
      encryptionKey: testKey,
    });
    expect(revealed).toBe('re_1234567890abcdef');

    // Delete/revoke secret
    await deleteIntegrationSecret(database.db, {
      organizationId: orgId,
      actorId: testActorId,
      providerCode: 'RESEND',
      keyName: 'apiKey',
    });

    const existsAfter = await hasIntegrationSecret(database.db, {
      organizationId: orgId,
      providerCode: 'RESEND',
      keyName: 'apiKey',
    });
    expect(existsAfter).toBe(false);
  });
});
