import type { MaevelleDatabase } from '../index.js';
import { printBanner, printModuleResult, printSummary } from './helpers/format.js';
import { resolveActorId, resolveOrganization, type ResolvedTenant } from './helpers/tenant.js';
import { categoriesSeedModule } from './modules/categories.seed.js';
import { collectionsSeedModule } from './modules/collections.seed.js';
import { occasionsSeedModule } from './modules/occasions.seed.js';
import { productTypesSeedModule } from './modules/product-types.seed.js';
import { productTypeAttributesSeedModule } from './modules/product-type-attributes.seed.js';
import { sizingSeedModule } from './modules/sizing.seed.js';
import { tagsSeedModule } from './modules/tags.seed.js';
import type { SeedContext, SeedModule, SeedModuleResult, SeedRunnerOptions } from './types.js';

export const DEFAULT_SEED_MODULES: readonly SeedModule[] = [
  categoriesSeedModule,
  productTypesSeedModule,
  productTypeAttributesSeedModule,
  tagsSeedModule,
  occasionsSeedModule,
  collectionsSeedModule,
  sizingSeedModule,
];

class DryRunRollbackSignal extends Error {
  public constructor(public readonly results: SeedModuleResult[]) {
    super('DRY_RUN_ROLLBACK_SIGNAL');
    this.name = 'DryRunRollbackSignal';
  }
}

/**
 * Validates dependencies between seed modules to ensure deterministic execution order.
 */
export function sortSeedModules(modules: readonly SeedModule[]): SeedModule[] {
  const result: SeedModule[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const moduleMap = new Map<string, SeedModule>(modules.map((m) => [m.id, m]));

  function visit(mod: SeedModule) {
    if (visited.has(mod.id)) return;
    if (visiting.has(mod.id)) {
      throw new Error(`Circular seed module dependency detected at "${mod.id}"`);
    }
    visiting.add(mod.id);

    if (mod.dependencies) {
      for (const depId of mod.dependencies) {
        const dep = moduleMap.get(depId);
        if (!dep) {
          throw new Error(`Seed module "${mod.id}" depends on missing module "${depId}"`);
        }
        visit(dep);
      }
    }

    visiting.delete(mod.id);
    visited.add(mod.id);
    result.push(mod);
  }

  for (const mod of modules) {
    visit(mod);
  }

  return result;
}

export interface SeedExecutionOutcome {
  readonly tenant: ResolvedTenant;
  readonly results: readonly SeedModuleResult[];
  readonly durationMs: number;
}

/**
 * Executes registered seed modules against the target database and organization.
 * Automatically wraps execution in a transaction for atomicity and dry-run safety.
 */
export async function runSeeds(
  db: MaevelleDatabase,
  options: SeedRunnerOptions = {},
  availableModules: readonly SeedModule[] = DEFAULT_SEED_MODULES,
): Promise<SeedExecutionOutcome> {
  const startTime = Date.now();

  // 1. Resolve Target Organization
  const orgCode =
    options.organizationCode ??
    process.env.SEED_ORGANIZATION_CODE ??
    process.env.BOOTSTRAP_ORGANIZATION_CODE ??
    process.env.STOREFRONT_ORGANIZATION_CODE ??
    'maevelle';

  const orgName = process.env.BOOTSTRAP_ORGANIZATION_NAME ?? 'Maevelle Bangladesh';

  const tenant = await resolveOrganization(db, orgCode, orgName);
  const actorId = await resolveActorId(db, tenant.id, process.env.SEED_ACTOR_ID);

  if (options.verbose !== false) {
    printBanner(tenant, options);
  }

  // 2. Filter & Sort Modules
  let modulesToRun = availableModules;

  if (options.targetScope) {
    modulesToRun = modulesToRun.filter((m) => m.scope === options.targetScope);
  }

  if (options.targetModules && options.targetModules.length > 0) {
    const moduleById = new Map(availableModules.map((module) => [module.id, module]));
    const selectedIds = new Set<string>();
    const includeWithDependencies = (moduleId: string): void => {
      if (selectedIds.has(moduleId)) return;
      const module = moduleById.get(moduleId);
      if (!module) throw new Error(`Requested seed module "${moduleId}" is not registered.`);
      selectedIds.add(moduleId);
      for (const dependencyId of module.dependencies ?? []) includeWithDependencies(dependencyId);
    };
    for (const moduleId of options.targetModules) includeWithDependencies(moduleId);
    modulesToRun = availableModules.filter((module) => selectedIds.has(module.id));
  }

  // Environment Safety Guard: Production cannot run 'development' scope
  if (process.env.NODE_ENV === 'production') {
    const forbidden = modulesToRun.filter((m) => m.scope === 'development');
    if (forbidden.length > 0) {
      throw new Error(
        `Production safety violation: modules [${forbidden.map((m) => m.id).join(', ')}] are scoped for development only.`,
      );
    }
  }

  const sortedModules = sortSeedModules(modulesToRun);

  if (sortedModules.length === 0) {
    console.log('No seed modules matched the given criteria.');
    return {
      tenant,
      results: [],
      durationMs: Date.now() - startTime,
    };
  }

  let results: SeedModuleResult[] = [];

  // 3. Execute in Transaction (either committing or rolling back for dry-run)
  try {
    await db.transaction().execute(async (transaction) => {
      const context: SeedContext = {
        db: transaction,
        organizationId: tenant.id,
        organizationCode: tenant.code,
        actorId,
        options,
      };

      for (const mod of sortedModules) {
        const modResult = await mod.run(context);
        results.push(modResult);
        if (options.verbose !== false) {
          printModuleResult(modResult);
        }
      }

      if (options.dryRun) {
        throw new DryRunRollbackSignal(results);
      }
    });
  } catch (error) {
    if (error instanceof DryRunRollbackSignal) {
      results = error.results;
    } else {
      throw error;
    }
  }

  const durationMs = Date.now() - startTime;
  if (options.verbose !== false) {
    printSummary(results, durationMs, options.dryRun);
  }

  return {
    tenant,
    results,
    durationMs,
  };
}
