import { afterAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';

import { createDatabase } from '../index.js';
import { createOrganization } from '../platform.js';
import { createManagedCategory, createCatalogVocabularyItem } from '../catalog-classification.js';
import { categorySeedData } from './data/categories.js';
import { slugify } from './helpers/slug.js';
import { categoriesSeedModule, createCategoriesSeedModule } from './modules/categories.seed.js';
import { tagsSeedModule, createTagsSeedModule } from './modules/tags.seed.js';
import { occasionsSeedModule, createOccasionsSeedModule } from './modules/occasions.seed.js';
import { collectionsSeedModule, createCollectionsSeedModule } from './modules/collections.seed.js';
import { runSeeds, sortSeedModules, DEFAULT_SEED_MODULES } from './runner.js';
import type { CategorySeedItem, SeedModule, VocabularySeedItem } from './types.js';

const database = createDatabase({
  connectionString: process.env.TEST_DATABASE_URL!,
  maxConnections: 4,
});

afterAll(async () => database.close());

async function createTestOrg() {
  const code = `seed-test-${crypto.randomUUID().slice(0, 10)}`;
  const org = await createOrganization(database.db, {
    code,
    displayName: `Seed Test Org ${code}`,
    timezone: 'Asia/Dhaka',
    defaultLocale: 'en-BD',
    defaultCurrency: 'BDT',
  });
  return {
    organizationId: org.id,
    organizationCode: code,
  };
}

describe('database seed system', () => {
  describe('slugify helper', () => {
    it('normalizes category titles into clean database handles', () => {
      expect(slugify('Hair Accessories')).toBe('hair-accessories');
      expect(slugify('Beauty & Nails')).toBe('beauty-and-nails');
      expect(slugify('Hats & Headwear')).toBe('hats-and-headwear');
      expect(slugify('Two-Piece Sets')).toBe('two-piece-sets');
      expect(slugify('  Closet   Organization  ')).toBe('closet-organization');
    });

    it('rejects strings that cannot produce valid slugs', () => {
      expect(() => slugify('   ')).toThrow();
      expect(() => slugify('---')).toThrow();
    });
  });

  describe('module dependency sorting', () => {
    it('sorts independent modules and preserves valid dependencies', () => {
      const modA: SeedModule = {
        id: 'categories',
        name: 'Categories',
        description: '',
        scope: 'bootstrap',
        run: async () => ({
          moduleId: 'categories',
          moduleName: 'Categories',
          totalCount: 0,
          createdCount: 0,
          updatedCount: 0,
          unchangedCount: 0,
          failedCount: 0,
        }),
      };
      const modB: SeedModule = {
        id: 'products',
        name: 'Products',
        description: '',
        scope: 'development',
        dependencies: ['categories'],
        run: async () => ({
          moduleId: 'products',
          moduleName: 'Products',
          totalCount: 0,
          createdCount: 0,
          updatedCount: 0,
          unchangedCount: 0,
          failedCount: 0,
        }),
      };

      const sorted = sortSeedModules([modB, modA]);
      expect(sorted.map((m) => m.id)).toEqual(['categories', 'products']);
    });

    it('detects circular dependencies', () => {
      const modA: SeedModule = {
        id: 'a',
        name: 'A',
        description: '',
        scope: 'bootstrap',
        dependencies: ['b'],
        run: async () => ({}) as any,
      };
      const modB: SeedModule = {
        id: 'b',
        name: 'B',
        description: '',
        scope: 'bootstrap',
        dependencies: ['a'],
        run: async () => ({}) as any,
      };
      expect(() => sortSeedModules([modA, modB])).toThrow(/Circular seed module dependency/);
    });
  });

  describe('categories seed module', () => {
    it('seeds a complete hierarchical taxonomy with correct parent/child relationships', async () => {
      const { organizationCode, organizationId } = await createTestOrg();

      const outcome = await runSeeds(database.db, { organizationCode, verbose: false }, [
        categoriesSeedModule,
      ]);

      expect(outcome.results).toHaveLength(1);
      const catResult = outcome.results[0]!;
      expect(catResult.rootCount).toBe(7);
      expect(catResult.totalCount).toBe(44);
      expect(catResult.createdCount).toBe(44);
      expect(catResult.updatedCount).toBe(0);
      expect(catResult.unchangedCount).toBe(0);

      // Verify records in database
      const rows = (
        await sql<{ handle: string; name: string; parent_handle: string | null }>`
          select c.handle, c.name, p.handle as parent_handle
          from catalog.categories c
          left join catalog.categories p on p.id = c.parent_category_id
          where c.organization_id = ${organizationId}
        `.execute(database.db)
      ).rows;

      expect(rows).toHaveLength(44);

      // Check root categories have no parent
      const hairAccessories = rows.find((r) => r.handle === 'hair-accessories');
      expect(hairAccessories).toBeDefined();
      expect(hairAccessories?.parent_handle).toBeNull();

      // Check level 1 categories have root parent
      const hairClips = rows.find((r) => r.handle === 'hair-clips-pins');
      expect(hairClips).toBeDefined();
      expect(hairClips?.parent_handle).toBe('hair-accessories');

      // Check level 2 categories have level 1 parent
      const flowerClips = rows.find((r) => r.handle === 'flower-hair-clips');
      expect(flowerClips).toBeDefined();
      expect(flowerClips?.parent_handle).toBe('hair-clips-pins');

      const waistChains = rows.find((r) => r.handle === 'waist-chains');
      expect(waistChains?.parent_handle).toBe('body-jewelry');

      const crochetTops = rows.find((r) => r.handle === 'crochet-tops');
      expect(crochetTops?.parent_handle).toBe('tops');
    });

    it('is strictly idempotent when run repeatedly', async () => {
      const { organizationCode, organizationId } = await createTestOrg();

      // Run 1: initial seed
      const outcome1 = await runSeeds(database.db, { organizationCode, verbose: false }, [
        categoriesSeedModule,
      ]);
      expect(outcome1.results[0]?.createdCount).toBe(44);
      expect(outcome1.results[0]?.unchangedCount).toBe(0);

      // Run 2: immediately re-run
      const outcome2 = await runSeeds(database.db, { organizationCode, verbose: false }, [
        categoriesSeedModule,
      ]);
      expect(outcome2.results[0]?.createdCount).toBe(0);
      expect(outcome2.results[0]?.updatedCount).toBe(0);
      expect(outcome2.results[0]?.unchangedCount).toBe(44);

      // Run 3: third run
      const outcome3 = await runSeeds(database.db, { organizationCode, verbose: false }, [
        categoriesSeedModule,
      ]);
      expect(outcome3.results[0]?.createdCount).toBe(0);
      expect(outcome3.results[0]?.updatedCount).toBe(0);
      expect(outcome3.results[0]?.unchangedCount).toBe(44);

      // Total count in database remains exactly 44
      const countResult = await sql<{ count: string }>`
        select count(*)::text count from catalog.categories where organization_id = ${organizationId}
      `.execute(database.db);
      expect(Number(countResult.rows[0]?.count)).toBe(44);
    });

    it('updates matching categories in-place when display names or positions change', async () => {
      const { organizationCode, organizationId } = await createTestOrg();

      const initialTree: readonly CategorySeedItem[] = [
        {
          name: 'Hair Accessories',
          handle: 'hair-accessories',
          children: [{ name: 'Hair Clips', handle: 'hair-clips', position: 10 }],
        },
      ];

      // Initial run
      const seeder1 = createCategoriesSeedModule(initialTree);
      await runSeeds(database.db, { organizationCode, verbose: false }, [seeder1]);

      // Modified tree: rename display title and change position
      const modifiedTree: readonly CategorySeedItem[] = [
        {
          name: 'Hair & Head Accessories',
          handle: 'hair-accessories', // Same handle
          children: [{ name: 'Clips & Barrettes', handle: 'hair-clips', position: 20 }],
        },
      ];

      const seeder2 = createCategoriesSeedModule(modifiedTree);
      const outcome = await runSeeds(database.db, { organizationCode, verbose: false }, [seeder2]);

      expect(outcome.results[0]?.createdCount).toBe(0);
      expect(outcome.results[0]?.updatedCount).toBe(2);
      expect(outcome.results[0]?.unchangedCount).toBe(0);

      // Verify updated titles in database
      const rows = (
        await sql<{ handle: string; name: string; position: number }>`
          select handle, name, position from catalog.categories
          where organization_id = ${organizationId}
          order by handle
        `.execute(database.db)
      ).rows;

      expect(rows).toEqual([
        { handle: 'hair-accessories', name: 'Hair & Head Accessories', position: 0 },
        { handle: 'hair-clips', name: 'Clips & Barrettes', position: 20 },
      ]);
    });

    it('preserves unrelated manual categories in the database', async () => {
      const { organizationCode, organizationId } = await createTestOrg();

      // Pre-create an existing manual category created by an operator
      await createManagedCategory(database.db, {
        organizationId,
        actorId: '00000000-0000-0000-0000-000000000000',
        name: 'Manual Flash Deals',
        handle: 'flash-deals',
      });

      // Run seeder
      const tree: readonly CategorySeedItem[] = [{ name: 'Jewelry', handle: 'jewelry' }];
      const seeder = createCategoriesSeedModule(tree);
      await runSeeds(database.db, { organizationCode, verbose: false }, [seeder]);

      // Verify that 'flash-deals' is untouched and still exists
      const rows = (
        await sql<{ handle: string; name: string }>`
          select handle, name from catalog.categories
          where organization_id = ${organizationId}
          order by handle
        `.execute(database.db)
      ).rows;

      expect(rows).toHaveLength(2);
      expect(rows.map((r) => r.handle)).toContain('flash-deals');
      expect(rows.map((r) => r.handle)).toContain('jewelry');
    });

    it('supports dry-run mode without committing changes to the database', async () => {
      const { organizationCode, organizationId } = await createTestOrg();

      const tree: readonly CategorySeedItem[] = [{ name: 'Bags', handle: 'bags' }];
      const seeder = createCategoriesSeedModule(tree);

      const dryRunOutcome = await runSeeds(
        database.db,
        { organizationCode, dryRun: true, verbose: false },
        [seeder],
      );

      expect(dryRunOutcome.results[0]?.createdCount).toBe(1);

      // Verify nothing was actually saved in the database
      const rows = (
        await sql<{ count: string }>`
          select count(*)::text count from catalog.categories where organization_id = ${organizationId}
        `.execute(database.db)
      ).rows;

      expect(Number(rows[0]?.count)).toBe(0);
    });

    it('rolls back completely if a category violates database constraints', async () => {
      const { organizationCode, organizationId } = await createTestOrg();

      const invalidTree: readonly CategorySeedItem[] = [
        { name: 'Valid Parent', handle: 'valid-parent' },
        // Invalid slug that will fail constraint or validation
        { name: '', handle: 'invalid slug with spaces' },
      ];
      const seeder = createCategoriesSeedModule(invalidTree);

      await expect(
        runSeeds(database.db, { organizationCode, verbose: false }, [seeder]),
      ).rejects.toThrow();

      // Transaction rollback ensures Valid Parent was NOT left behind
      const rows = (
        await sql<{ count: string }>`
          select count(*)::text count from catalog.categories where organization_id = ${organizationId}
        `.execute(database.db)
      ).rows;

      expect(Number(rows[0]?.count)).toBe(0);
    });
  });

  describe('tags seed module', () => {
    it('seeds canonical 29 tags and handles idempotency cleanly', async () => {
      const { organizationCode, organizationId } = await createTestOrg();

      // Run 1: initial seed
      const outcome1 = await runSeeds(
        database.db,
        { organizationCode, targetModules: ['tags'], verbose: false },
        DEFAULT_SEED_MODULES,
      );

      expect(outcome1.results).toHaveLength(1);
      expect(outcome1.results[0]?.moduleId).toBe('tags');
      expect(outcome1.results[0]?.totalCount).toBe(29);
      expect(outcome1.results[0]?.createdCount).toBe(29);
      expect(outcome1.results[0]?.unchangedCount).toBe(0);

      // Verify records in database
      const rows = (
        await sql<{ handle: string; name: string }>`
          select handle, name from catalog.tags where organization_id = ${organizationId} order by handle
        `.execute(database.db)
      ).rows;

      expect(rows).toHaveLength(29);
      expect(rows.map((r) => r.handle)).toContain('boho');
      expect(rows.map((r) => r.handle)).toContain('3d-detail');
      expect(rows.map((r) => r.handle)).toContain('beach-style');
      expect(rows.map((r) => r.handle)).toContain('straw');

      // Run 2: immediately re-run (idempotency check)
      const outcome2 = await runSeeds(
        database.db,
        { organizationCode, targetModules: ['tags'], verbose: false },
        DEFAULT_SEED_MODULES,
      );

      expect(outcome2.results[0]?.createdCount).toBe(0);
      expect(outcome2.results[0]?.updatedCount).toBe(0);
      expect(outcome2.results[0]?.unchangedCount).toBe(29);
    });

    it('updates tag descriptions in-place and preserves manual tags', async () => {
      const { organizationCode, organizationId } = await createTestOrg();

      // Pre-create an unrelated manual tag
      await createCatalogVocabularyItem(database.db, {
        organizationId,
        actorId: '00000000-0000-0000-0000-000000000000',
        kind: 'TAG',
        name: 'Manual Clearance',
        handle: 'manual-clearance',
      });

      const initial: readonly VocabularySeedItem[] = [
        { name: 'Boho', handle: 'boho', description: 'Old description' },
      ];
      const seeder1 = createTagsSeedModule(initial);
      await runSeeds(database.db, { organizationCode, verbose: false }, [seeder1]);

      const updated: readonly VocabularySeedItem[] = [
        { name: 'Boho Chic', handle: 'boho', description: 'Updated bohemian aesthetic' },
      ];
      const seeder2 = createTagsSeedModule(updated);
      const outcome = await runSeeds(database.db, { organizationCode, verbose: false }, [seeder2]);

      expect(outcome.results[0]?.createdCount).toBe(0);
      expect(outcome.results[0]?.updatedCount).toBe(1);

      const rows = (
        await sql<{ handle: string; name: string; description: string }>`
          select handle, name, description from catalog.tags where organization_id = ${organizationId} order by handle
        `.execute(database.db)
      ).rows;

      expect(rows).toHaveLength(2);
      expect(rows.find((r) => r.handle === 'boho')).toEqual({
        handle: 'boho',
        name: 'Boho Chic',
        description: 'Updated bohemian aesthetic',
      });
      expect(rows.map((r) => r.handle)).toContain('manual-clearance');
    });
  });

  describe('occasions seed module', () => {
    it('seeds canonical 9 occasions and verifies idempotency', async () => {
      const { organizationCode, organizationId } = await createTestOrg();

      const outcome1 = await runSeeds(
        database.db,
        { organizationCode, targetModules: ['occasions'], verbose: false },
        DEFAULT_SEED_MODULES,
      );

      expect(outcome1.results).toHaveLength(1);
      expect(outcome1.results[0]?.moduleId).toBe('occasions');
      expect(outcome1.results[0]?.totalCount).toBe(9);
      expect(outcome1.results[0]?.createdCount).toBe(9);

      const rows = (
        await sql<{ handle: string; name: string }>`
          select handle, name from catalog.occasions where organization_id = ${organizationId} order by handle
        `.execute(database.db)
      ).rows;

      expect(rows).toHaveLength(9);
      expect(rows.map((r) => r.handle)).toContain('beach-and-vacation');
      expect(rows.map((r) => r.handle)).toContain('photoshoot');
      expect(rows.map((r) => r.handle)).toContain('date-and-dinner');

      // Re-run
      const outcome2 = await runSeeds(
        database.db,
        { organizationCode, targetModules: ['occasions'], verbose: false },
        DEFAULT_SEED_MODULES,
      );
      expect(outcome2.results[0]?.createdCount).toBe(0);
      expect(outcome2.results[0]?.unchangedCount).toBe(9);
    });
  });

  describe('collections seed module', () => {
    it('seeds canonical 14 collections with positions preserved', async () => {
      const { organizationCode, organizationId } = await createTestOrg();

      const outcome1 = await runSeeds(
        database.db,
        { organizationCode, targetModules: ['collections'], verbose: false },
        DEFAULT_SEED_MODULES,
      );

      expect(outcome1.results).toHaveLength(1);
      expect(outcome1.results[0]?.moduleId).toBe('collections');
      expect(outcome1.results[0]?.totalCount).toBe(14);
      expect(outcome1.results[0]?.createdCount).toBe(14);

      const rows = (
        await sql<{ handle: string; name: string; position: number }>`
          select handle, name, position from catalog.collections
          where organization_id = ${organizationId}
          order by position asc
        `.execute(database.db)
      ).rows;

      expect(rows).toHaveLength(14);
      expect(rows[0]?.handle).toBe('new-arrivals');
      expect(rows[0]?.position).toBe(10);
      expect(rows[1]?.handle).toBe('best-sellers');
      expect(rows[1]?.position).toBe(20);
      expect(rows[13]?.handle).toBe('nail-art-collection');
      expect(rows[13]?.position).toBe(140);

      // Re-run (idempotency)
      const outcome2 = await runSeeds(
        database.db,
        { organizationCode, targetModules: ['collections'], verbose: false },
        DEFAULT_SEED_MODULES,
      );
      expect(outcome2.results[0]?.createdCount).toBe(0);
      expect(outcome2.results[0]?.unchangedCount).toBe(14);
    });
  });

  describe('multi-module comprehensive seed run', () => {
    it('seeds categories, tags, occasions, and collections together in one transaction', async () => {
      const { organizationCode, organizationId } = await createTestOrg();

      const outcome = await runSeeds(
        database.db,
        { organizationCode, verbose: false },
        DEFAULT_SEED_MODULES,
      );

      expect(outcome.results).toHaveLength(4);
      expect(outcome.results.map((r) => r.moduleId)).toEqual([
        'categories',
        'tags',
        'occasions',
        'collections',
      ]);

      const [catRes, tagRes, occRes, colRes] = outcome.results;
      expect(catRes?.createdCount).toBe(44);
      expect(tagRes?.createdCount).toBe(29);
      expect(occRes?.createdCount).toBe(9);
      expect(colRes?.createdCount).toBe(14);

      // Verify all counts in database
      const [cats, tags, occs, cols] = await Promise.all([
        sql<{
          count: string;
        }>`select count(*)::text from catalog.categories where organization_id=${organizationId}`.execute(
          database.db,
        ),
        sql<{
          count: string;
        }>`select count(*)::text from catalog.tags where organization_id=${organizationId}`.execute(
          database.db,
        ),
        sql<{
          count: string;
        }>`select count(*)::text from catalog.occasions where organization_id=${organizationId}`.execute(
          database.db,
        ),
        sql<{
          count: string;
        }>`select count(*)::text from catalog.collections where organization_id=${organizationId}`.execute(
          database.db,
        ),
      ]);

      expect(Number(cats.rows[0]?.count)).toBe(44);
      expect(Number(tags.rows[0]?.count)).toBe(29);
      expect(Number(occs.rows[0]?.count)).toBe(9);
      expect(Number(cols.rows[0]?.count)).toBe(14);
    });
  });
});
