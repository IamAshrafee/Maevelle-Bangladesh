import type { SeedModuleResult, SeedRunnerOptions } from '../types.js';
import type { ResolvedTenant } from './tenant.js';

export function printBanner(tenant: ResolvedTenant, options: SeedRunnerOptions): void {
  console.log('\n🌱 Maevelle Database Seed');
  console.log(`Organization: ${tenant.displayName} (${tenant.code})`);
  console.log(
    `Scope: ${options.targetScope ?? 'all'} | Dry-run: ${options.dryRun ? 'true (changes will NOT be committed)' : 'false'}`,
  );
  if (options.targetModules?.length) {
    console.log(`Target Modules: ${options.targetModules.join(', ')}`);
  }
  console.log('');
}

export function printModuleResult(result: SeedModuleResult): void {
  console.log(`▶ ${result.moduleName}`);
  if (result.rootCount !== undefined) {
    console.log(`  ✓ ${result.rootCount} root categories`);
  }
  console.log(`  ✓ ${result.totalCount} items evaluated`);
  console.log(`  ✓ ${result.createdCount} created`);
  console.log(`  ✓ ${result.updatedCount} updated`);
  console.log(`  ✓ ${result.unchangedCount} already up-to-date`);
  if (result.failedCount > 0) {
    console.log(`  ✗ ${result.failedCount} failed`);
  }
  console.log('');
}

export function printSummary(
  results: readonly SeedModuleResult[],
  durationMs: number,
  dryRun?: boolean,
): void {
  const totalCreated = results.reduce((acc, r) => acc + r.createdCount, 0);
  const totalUpdated = results.reduce((acc, r) => acc + r.updatedCount, 0);
  const totalUnchanged = results.reduce((acc, r) => acc + r.unchangedCount, 0);
  const totalFailed = results.reduce((acc, r) => acc + r.failedCount, 0);

  console.log('──────────────────────────────────────────────────');
  if (dryRun) {
    console.log('DRY RUN PREVIEW COMPLETE (all changes were rolled back):');
    console.log(
      `Would create: ${totalCreated} | Would update: ${totalUpdated} | Already current: ${totalUnchanged}`,
    );
  } else if (totalFailed === 0) {
    console.log(
      `Seed completed successfully in ${durationMs}ms: ${totalCreated} created, ${totalUpdated} updated, ${totalUnchanged} unchanged.`,
    );
  } else {
    console.error(
      `Seed finished with ${totalFailed} failure(s) in ${durationMs}ms. Check error logs above.`,
    );
  }
  console.log('');
}
