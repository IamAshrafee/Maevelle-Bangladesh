import { sql } from 'kysely';
import {
  createCatalogVocabularyItem,
  updateCatalogVocabularyItem,
  type CatalogClassificationStatus,
  type CatalogVocabularyKind,
} from '../../catalog-classification.js';
import { slugify } from '../helpers/slug.js';
import type { SeedContext, SeedModule, SeedModuleResult, VocabularySeedItem } from '../types.js';

interface ExistingVocabularyRow {
  readonly id: string;
  readonly handle: string;
  readonly name: string;
  readonly description: string | null;
  readonly status: CatalogClassificationStatus;
  readonly position: number;
  readonly version: string;
}

export interface VocabularySeedModuleConfig {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly kind: CatalogVocabularyKind;
  readonly items: readonly VocabularySeedItem[];
  readonly dependencies?: readonly string[];
}

/**
 * Creates a reusable SeedModule for flat classification vocabularies (Tags, Occasions, Collections).
 */
export function createVocabularySeedModule(config: {
  id: string;
  name: string;
  description: string;
  kind: CatalogVocabularyKind;
  items: readonly VocabularySeedItem[];
  dependencies?: readonly string[];
}): SeedModule {
  return {
    id: config.id,
    name: config.name,
    description: config.description,
    scope: 'bootstrap',
    ...(config.dependencies ? { dependencies: config.dependencies } : {}),
    async run(context: SeedContext): Promise<SeedModuleResult> {
      // 1. Fetch current vocabulary items for this organization and kind
      let existingRows: readonly ExistingVocabularyRow[] = [];

      if (config.kind === 'TAG') {
        existingRows = (
          await sql<ExistingVocabularyRow>`
            select id::text, handle, name, description, status, 0 as position, version::text
            from catalog.tags
            where organization_id = ${context.organizationId}
          `.execute(context.db)
        ).rows;
      } else if (config.kind === 'OCCASION') {
        existingRows = (
          await sql<ExistingVocabularyRow>`
            select id::text, handle, name, description, status, 0 as position, version::text
            from catalog.occasions
            where organization_id = ${context.organizationId}
          `.execute(context.db)
        ).rows;
      } else {
        existingRows = (
          await sql<ExistingVocabularyRow>`
            select id::text, handle, name, description, status, position, version::text
            from catalog.collections
            where organization_id = ${context.organizationId}
          `.execute(context.db)
        ).rows;
      }

      const existingByHandle = new Map<string, ExistingVocabularyRow>();
      for (const row of existingRows) {
        existingByHandle.set(row.handle, row);
      }

      let createdCount = 0;
      let updatedCount = 0;
      let unchangedCount = 0;
      let totalCount = 0;

      for (let i = 0; i < config.items.length; i++) {
        const item = config.items[i]!;
        totalCount += 1;

        const handle = item.handle ? item.handle.trim().toLowerCase() : slugify(item.name);
        const position =
          item.position !== undefined
            ? item.position
            : config.kind === 'COLLECTION'
              ? (i + 1) * 10
              : 0;
        const status = item.status ?? 'ACTIVE';
        const description = item.description?.trim() || null;

        // Check if item exists by handle or declared previousHandles
        let existing = existingByHandle.get(handle);
        if (!existing && item.previousHandles?.length) {
          for (const prev of item.previousHandles) {
            const found = existingByHandle.get(prev);
            if (found) {
              existing = found;
              break;
            }
          }
        }

        if (!existing) {
          // CREATE NEW
          const createInput: Parameters<typeof createCatalogVocabularyItem>[1] = {
            organizationId: context.organizationId,
            actorId: context.actorId,
            kind: config.kind,
            name: item.name.trim(),
            handle,
            status,
            ...(description ? { description } : {}),
            ...(config.kind === 'COLLECTION' ? { position } : {}),
          };

          const created = await createCatalogVocabularyItem(context.db, createInput);
          createdCount += 1;

          existingByHandle.set(handle, {
            id: created.id,
            handle,
            name: item.name.trim(),
            description,
            status,
            position,
            version: '1',
          });
        } else {
          // EVALUATE FOR UPDATES
          const nameChanged = item.name.trim() !== existing.name;
          const handleChanged = handle !== existing.handle;
          const statusChanged = status !== existing.status;
          const descriptionChanged = description !== existing.description;
          const positionChanged = config.kind === 'COLLECTION' && position !== existing.position;

          if (
            nameChanged ||
            handleChanged ||
            statusChanged ||
            descriptionChanged ||
            positionChanged
          ) {
            const updateInput: Parameters<typeof updateCatalogVocabularyItem>[1] = {
              organizationId: context.organizationId,
              actorId: context.actorId,
              kind: config.kind,
              itemId: existing.id,
              expectedVersion: Number(existing.version),
              name: item.name.trim(),
              handle,
              status,
              description,
              ...(config.kind === 'COLLECTION' ? { position } : {}),
            };

            await updateCatalogVocabularyItem(context.db, updateInput);
            updatedCount += 1;

            existingByHandle.set(handle, {
              ...existing,
              handle,
              name: item.name.trim(),
              description,
              status,
              position,
              version: String(Number(existing.version) + 1),
            });
          } else {
            unchangedCount += 1;
          }
        }
      }

      return {
        moduleId: config.id,
        moduleName: config.name,
        totalCount,
        createdCount,
        updatedCount,
        unchangedCount,
        failedCount: 0,
      };
    },
  };
}
