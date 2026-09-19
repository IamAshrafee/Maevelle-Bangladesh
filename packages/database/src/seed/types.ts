import type { MaevelleDatabase } from '../index.js';

export type SeedScope = 'bootstrap' | 'development' | 'test';

export interface SeedRunnerOptions {
  readonly dryRun?: boolean;
  readonly verbose?: boolean;
  readonly targetScope?: SeedScope;
  readonly targetModules?: readonly string[];
  readonly organizationCode?: string;
}

export interface SeedContext {
  readonly db: MaevelleDatabase;
  readonly organizationId: string;
  readonly organizationCode: string;
  readonly actorId: string;
  readonly options: SeedRunnerOptions;
}

export interface SeedModuleResult {
  readonly moduleId: string;
  readonly moduleName: string;
  readonly rootCount?: number;
  readonly totalCount: number;
  readonly createdCount: number;
  readonly updatedCount: number;
  readonly unchangedCount: number;
  readonly failedCount: number;
  readonly details?: unknown;
}

export interface SeedModule {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly scope: SeedScope;
  readonly dependencies?: readonly string[];
  run(context: SeedContext): Promise<SeedModuleResult>;
}

export interface CategorySeedItem {
  readonly name: string;
  readonly handle?: string;
  readonly previousHandles?: readonly string[];
  readonly status?: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
  readonly position?: number;
  readonly defaultSizeGuideId?: string | null;
  readonly children?: readonly CategorySeedItem[];
}

export interface VocabularySeedItem {
  readonly name: string;
  readonly handle?: string;
  readonly previousHandles?: readonly string[];
  readonly description?: string | null;
  readonly status?: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
  readonly position?: number;
}

export interface ProductTypeSeedItem {
  readonly name: string;
  readonly code: string;
  /** Category handle used as this structural type's default catalog placement. */
  readonly primaryCategoryHandle: string;
  readonly status?: 'ACTIVE' | 'ARCHIVED';
}
