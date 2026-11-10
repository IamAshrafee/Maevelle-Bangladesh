import { expect, it } from 'vitest';
import { Migrator } from 'kysely/migration';
import { migrationProvider } from '../../migrations/index.js';
import { isolatedCartDatabase } from '../../testing/cart-fixture.js';
import { manualPaymentFixture } from '../../testing/manual-payment-fixture.js';
import { runMigrations } from '../../migrate.js';
import { privacyPreferencesUpgradeCase } from './privacy-upgrade-case.js';

it('upgrades populated 3224 consent without backfilling browser authority', async () => {
  const isolated = await isolatedCartDatabase();
  try {
    const db = isolated.database.db;
    const prior = await new Migrator({ db, provider: migrationProvider }).migrateTo(
      '3224_commerce_measurement',
    );
    if (prior.error) throw prior.error;
    const f = await manualPaymentFixture(db);
    await privacyPreferencesUpgradeCase.before(db, f.organizationId);
    expect((await runMigrations(db)).executed).toEqual(['3225_privacy_preferences']);
    await privacyPreferencesUpgradeCase.after(db, f.organizationId);
    expect((await runMigrations(db)).executed).toEqual([]);
  } finally {
    await isolated.close();
  }
}, 30_000);
