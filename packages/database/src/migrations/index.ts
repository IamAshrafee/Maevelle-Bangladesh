import type { Migration, MigrationProvider } from 'kysely/migration';

import * as baseline from './0000_extensions_and_database_baseline.js';
import * as platform from './0001_platform_core.js';
import * as audit from './0002_audit_foundation.js';
import * as operations from './0003_platform_operations.js';
import * as iam from './0004_iam_and_authentication.js';
import * as emailNormalization from './0005_iam_user_normalization.js';
import * as catalog from './0200_catalog.js';
import * as sizing from './0300_sizing.js';
import * as media from './0400_media.js';

/**
 * The migration list is deliberately explicit. Migration files are reviewed
 * source, not a runtime schema-push mechanism or Better Auth auto-migration.
 */
export const migrations = {
  '0000_extensions_and_database_baseline': baseline,
  '0001_platform_core': platform,
  '0002_audit_foundation': audit,
  '0003_platform_operations': operations,
  '0004_iam_and_authentication': iam,
  '0005_iam_user_normalization': emailNormalization,
  '0200_catalog': catalog,
  '0300_sizing': sizing,
  '0400_media': media,
} satisfies Record<string, Migration>;

export const migrationProvider: MigrationProvider = {
  async getMigrations(): Promise<Record<string, Migration>> {
    return migrations;
  },
};
