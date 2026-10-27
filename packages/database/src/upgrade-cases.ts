import type { Kysely } from 'kysely';
import type { DatabaseSchema } from './index.js';

/**
 * Every post-baseline migration needs a case that seeds its pre-upgrade state
 * and proves its intended post-upgrade behavior. CI rejects uncovered names.
 */
export interface UpgradeCase {
  before(db: Kysely<DatabaseSchema>, organizationId: string): Promise<void>;
  after(db: Kysely<DatabaseSchema>, organizationId: string): Promise<void>;
}

export const upgradeCases: Record<string, UpgradeCase> = {};
