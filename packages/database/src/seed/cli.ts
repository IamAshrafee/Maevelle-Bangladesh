import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDatabase } from '../index.js';
import { runSeeds } from './runner.js';
import type { SeedRunnerOptions, SeedScope } from './types.js';

// Automatically locate and load repository .env file if DATABASE_URL is not already exported
if (!process.env.DATABASE_URL) {
  let dir = dirname(fileURLToPath(import.meta.url));
  while (dir && dir !== dirname(dir)) {
    const candidate = resolve(dir, '.env');
    if (existsSync(candidate)) {
      try {
        process.loadEnvFile?.(candidate);
        if (process.env.DATABASE_URL) break;
      } catch {
        // Continue search
      }
    }
    dir = dirname(dir);
  }
}

function parseCliArgs(argv: string[]): SeedRunnerOptions & { showHelp?: boolean } {
  const options: {
    dryRun?: boolean;
    organizationCode?: string;
    targetScope?: SeedScope;
    targetModules?: string[];
    showHelp?: boolean;
  } = {};

  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') {
      options.showHelp = true;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg.startsWith('--org=') || arg.startsWith('--organization=')) {
      const val = arg.split('=')[1]?.trim();
      if (val) {
        options.organizationCode = val;
      }
    } else if (arg.startsWith('--scope=')) {
      const val = arg.split('=')[1]?.trim() as SeedScope;
      if (val === 'bootstrap' || val === 'development' || val === 'test') {
        options.targetScope = val;
      } else {
        throw new Error(`Invalid scope: "${val}". Supported: bootstrap, development, test.`);
      }
    } else if (arg.startsWith('--module=')) {
      const val = arg.split('=')[1]?.trim();
      if (val) {
        options.targetModules = (options.targetModules ?? []).concat(
          val
            .split(',')
            .map((m) => m.trim())
            .filter(Boolean),
        );
      }
    }
  }

  return options;
}

function printHelp(): void {
  console.log(`
Maevelle Database Seed CLI

Usage:
  pnpm db:seed [options]
  node dist/src/seed/cli.js [options]

Options:
  --dry-run                Simulate the seed run in a transaction and roll back
  --org=<code|name>        Target organization code (defaults to $BOOTSTRAP_ORGANIZATION_CODE or 'maevelle')
  --scope=<scope>          Filter modules by scope: 'bootstrap' | 'development' | 'test'
  --module=<id>            Run specific module(s) by ID (e.g. --module=categories)
  --help, -h               Show this help message

Examples:
  pnpm db:seed
  pnpm db:seed --dry-run
  pnpm db:seed --module=categories
  pnpm db:seed --org=maevelle --scope=bootstrap
`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const options = parseCliArgs(args);

  if (options.showHelp) {
    printHelp();
    process.exit(0);
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('Error: DATABASE_URL environment variable is required to run database seeds.');
    process.exit(1);
  }

  const database = createDatabase({
    connectionString: databaseUrl,
    maxConnections: 2,
  });

  try {
    const outcome = await runSeeds(database.db, options);
    const hasFailures = outcome.results.some((r) => r.failedCount > 0);
    if (hasFailures) {
      process.exit(1);
    }
  } catch (error) {
    console.error('\n❌ Seed failed with an unhandled exception:');
    console.error(error);
    process.exit(1);
  } finally {
    await database.close();
  }
}

await main();
