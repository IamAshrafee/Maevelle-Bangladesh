import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { validateMigrationHistory } from './check-migration-history.mjs';

const repository = resolve(import.meta.dirname, '..');

function fixture(run) {
  const root = mkdtempSync(join(tmpdir(), 'maevelle-history-'));
  const migrations = join(root, 'packages/database/src/migrations');
  cpSync(join(repository, 'packages/database/src/migrations'), migrations, { recursive: true });
  cpSync(
    join(repository, 'packages/database/migration-history-baseline.json'),
    join(root, 'packages/database/migration-history-baseline.json'),
  );
  try {
    run({ root, migrations, registry: join(migrations, 'index.ts') });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test('accepts the historical release and a new registered migration', () =>
  fixture(({ root, migrations, registry }) => {
    assert.deepEqual(validateMigrationHistory(root).errors, []);
    const name = '3300_upgrade_fixture';
    writeFileSync(join(migrations, `${name}.ts`), 'export async function up() {}\n');
    let source = readFileSync(registry, 'utf8');
    source = source.replace(
      "import type { Migration, MigrationProvider } from 'kysely/migration';",
      "import type { Migration, MigrationProvider } from 'kysely/migration';\nimport * as upgradeFixture from './3300_upgrade_fixture.js';",
    );
    source = source.replace(
      "  '3202_messaging_performance': messagingPerformance,",
      "  '3202_messaging_performance': messagingPerformance,\n  '3300_upgrade_fixture': upgradeFixture,",
    );
    writeFileSync(registry, source);
    assert.deepEqual(validateMigrationHistory(root).errors, []);
  }));

test('rejects changed or deleted history and registry/file mismatches', () =>
  fixture(({ root, migrations, registry }) => {
    const historical = join(migrations, '0300_sizing.ts');
    writeFileSync(historical, `${readFileSync(historical, 'utf8')}\n// unauthorized edit\n`);
    assert.match(
      validateMigrationHistory(root).errors.join('\n'),
      /Historical migration changed: 0300_sizing/,
    );
    unlinkSync(historical);
    assert.match(
      validateMigrationHistory(root).errors.join('\n'),
      /Historical migration deleted: 0300_sizing/,
    );
    writeFileSync(join(migrations, '3300_unregistered.ts'), 'export async function up() {}\n');
    assert.match(
      validateMigrationHistory(root).errors.join('\n'),
      /Unregistered migration file: 3300_unregistered/,
    );
    writeFileSync(
      registry,
      readFileSync(registry, 'utf8').replace(
        "  '3202_messaging_performance': messagingPerformance,",
        "  '3202_messaging_performance': messagingPerformance,\n  '3300_missing': missing,",
      ),
    );
    assert.match(
      validateMigrationHistory(root).errors.join('\n'),
      /Registry migration has no source file: 3300_missing/,
    );
  }));

test('rejects duplicate identifiers and a new migration inside historical ordering', () =>
  fixture(({ root, migrations, registry }) => {
    const name = '0302_illegal_backfill';
    writeFileSync(join(migrations, `${name}.ts`), 'export async function up() {}\n');
    let source = readFileSync(registry, 'utf8');
    source = source.replace(
      "import type { Migration, MigrationProvider } from 'kysely/migration';",
      "import type { Migration, MigrationProvider } from 'kysely/migration';\nimport * as illegalBackfill from './0302_illegal_backfill.js';",
    );
    source = source.replace(
      "  '3202_messaging_performance': messagingPerformance,",
      "  '3202_messaging_performance': messagingPerformance,\n  '0302_illegal_backfill': illegalBackfill,\n  '3202_messaging_performance': messagingPerformance,",
    );
    writeFileSync(registry, source);
    const errors = validateMigrationHistory(root).errors.join('\n');
    assert.match(errors, /Duplicate migration identifier: 3202_messaging_performance/);
    assert.match(errors, /sorts before or within the immutable baseline/);
  }));

test('rejects a silently regenerated baseline manifest', () =>
  fixture(({ root }) => {
    const path = join(root, 'packages/database/migration-history-baseline.json');
    const baseline = JSON.parse(readFileSync(path, 'utf8'));
    baseline.migrations['0300_sizing'] = '0'.repeat(64);
    writeFileSync(path, `${JSON.stringify(baseline, null, 2)}\n`);
    assert.match(validateMigrationHistory(root).errors.join('\n'), /baseline manifest changed/);
  }));
