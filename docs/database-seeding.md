# Database Seed & Data Bootstrap System

The Maevelle database seed system provides an idempotent, modular mechanism to synchronize canonical reference data (such as product categories, sizing systems, product types, and tags) with PostgreSQL.

It is designed to run safely across fresh database rebuilds, local development, staging environments, and operational upgrades without corrupting manual data or duplicating records.

---

## Quick Start

### Run the Default Seed
```bash
pnpm db:seed
```
Synchronizes all canonical bootstrap data (including the complete category taxonomy) for the active organization.

### Dry-Run Preview
```bash
pnpm db:seed --dry-run
```
Executes the seed inside a PostgreSQL transaction and rolls back at the end, displaying an exact count of items that would be created, updated, or left unchanged without persisting any changes.

### Target Specific Scope or Module
```bash
# Target only categories module
pnpm db:seed --module=categories

# Target a specific organization
pnpm db:seed --org=maevelle

# Filter by environment scope (bootstrap | development | test)
pnpm db:seed --scope=bootstrap
```

---

## Directory Structure

All seed files reside in `packages/database/src/seed/`:

```text
packages/database/src/seed/
├── data/                      # Human-readable business data definitions
│   └── categories.ts          # Category taxonomy hierarchy
│
├── modules/                   # Domain synchronization seeders
│   └── categories.seed.ts     # Category change detection & tree synchronization
│
├── helpers/                   # Reusable seed utilities
│   ├── slug.ts                # Handle/slug normalization & validation
│   ├── tenant.ts              # Organization & actor resolution
│   └── format.ts              # Terminal output formatter
│
├── types.ts                   # Core interfaces (SeedModule, SeedContext, CategorySeedItem)
├── runner.ts                  # Dependency coordinator & transaction manager
├── cli.ts                     # CLI argument parsing & database lifecycle
└── index.ts                   # Programmatic exports
```

---

## How Idempotency & Synchronization Work

1. **Natural Identity Keys**:
   - Categories are uniquely identified by `(organization_id, handle)`.
   - The database enforces `unique (organization_id, handle)`.
2. **Display Name Renames**:
   - If a display name is renamed (e.g. `"Hair Accessories"` → `"Hair & Head Accessories"`) while keeping `handle: "hair-accessories"`, the seeder matches the existing record by `handle` and updates `name` in-place. It does **not** create a duplicate record or break existing foreign-key references.
3. **Slug Migrations**:
   - If a slug must change, the `previousHandles` array allows seamless migration to a new handle using `catalog.category_handle_history` and `updateManagedCategory`.
4. **Change Detection (No-op Protection)**:
   - On each run, existing records are compared against the seed definition (`name`, `position`, `status`, `parent_category_id`, `default_size_guide_id`).
   - If fields match, the record is marked **already up-to-date**. No database writes, version bumps, or outbox events occur.
5. **Non-Destructive Guarantee**:
   - Unrelated records in the database (such as categories created manually by operators in Admin) are **never deleted**.
6. **Arbitrary Nesting Depth**:
   - Nested `children` arrays are traversed recursively. Parent IDs are resolved dynamically and propagated down the tree.

---

## Environments & Safety Rules

- **Bootstrap Scope (`'bootstrap'`)**:
  - Safe for all environments: development, test, staging, and production bootstrap.
  - Represents canonical taxonomies, product types, sizing reference data, etc.
- **Development Scope (`'development'`)**:
  - Fake customers, demo products, sample orders, mock suppliers.
  - **Safety Guard**: When `NODE_ENV=production`, development-scoped modules are strictly blocked by the runner.
- **Transactional Safety**:
  - The runner executes modules inside a database transaction. If any item fails validation or database constraints, the transaction rolls back cleanly, preventing partial corruption.

---

## How to Add a New Seed Module

Adding a new domain seed (e.g., `tags`) requires 3 steps:

### 1. Define Business Data (`data/tags.ts`)
```ts
export const tagSeedData = [
  { name: 'Eco Friendly', handle: 'eco-friendly' },
  { name: 'Handmade', handle: 'handmade' },
];
```

### 2. Implement Seed Module (`modules/tags.seed.ts`)
```ts
import type { SeedModule, SeedContext, SeedModuleResult } from '../types.js';
import { tagSeedData } from '../data/tags.js';

export const tagsSeedModule: SeedModule = {
  id: 'tags',
  name: 'Tags',
  description: 'Standard product tags',
  scope: 'bootstrap',
  async run(context: SeedContext): Promise<SeedModuleResult> {
    // Look up existing, insert missing, update modified
    return {
      moduleId: 'tags',
      moduleName: 'Tags',
      totalCount: tagSeedData.length,
      createdCount: ...,
      updatedCount: ...,
      unchangedCount: ...,
      failedCount: 0,
    };
  },
};
```

### 3. Register Module in `runner.ts`
Add to `DEFAULT_SEED_MODULES`:
```ts
export const DEFAULT_SEED_MODULES: readonly SeedModule[] = [
  categoriesSeedModule,
  tagsSeedModule,
];
```
If your module depends on another module (e.g. products depending on categories), declare `dependencies: ['categories']`. The runner will automatically sort execution in topological order.
