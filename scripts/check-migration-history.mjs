import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const defaultRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const namePattern = /^\d{4}_[a-z0-9_]+$/u;
// Anchors the reviewed baseline file; validation never regenerates either value.
const baselineDigest = '2fba6929c46eb456a26c279885a3d1a932ed268eb609b733a61635a25036a288';

export function validateMigrationHistory(root = defaultRoot) {
  const directory = resolve(root, 'packages/database/src/migrations');
  const baselineBytes = readFileSync(
    resolve(root, 'packages/database/migration-history-baseline.json'),
  );
  const baseline = JSON.parse(baselineBytes.toString('utf8'));
  const source = readFileSync(resolve(directory, 'index.ts'), 'utf8');
  const errors = [];
  if (createHash('sha256').update(baselineBytes).digest('hex') !== baselineDigest)
    errors.push(
      'Historical migration baseline manifest changed; review an explicit cross-environment rebaseline.',
    );
  const imports = new Map();
  for (const match of source.matchAll(/^import \* as (\w+) from '\.\/(\w+)\.js';$/gmu)) {
    if (imports.has(match[1])) errors.push(`Duplicate migration import alias: ${match[1]}`);
    imports.set(match[1], match[2]);
  }
  const entries = [...source.matchAll(/^  '([^']+)': (\w+),$/gmu)].map((match) => ({
    name: match[1],
    alias: match[2],
  }));
  const names = entries.map((entry) => entry.name);
  const files = readdirSync(directory)
    .filter((file) => file.endsWith('.ts') && file !== 'index.ts')
    .map((file) => file.slice(0, -3));
  const nameSet = new Set(names);
  const fileSet = new Set(files);
  const historical = Object.keys(baseline.migrations).sort();

  if (
    baseline.algorithm !== 'sha256' ||
    baseline.release !== 'ccd405c1e6fa8c827307977b947a4a3dbce859f5'
  ) {
    errors.push('Migration history baseline metadata is invalid.');
  }
  if (historical.length !== 51)
    errors.push(`Historical baseline must contain 51 migrations; found ${historical.length}.`);
  for (const name of names) {
    if (!namePattern.test(name)) errors.push(`Invalid migration identifier: ${name}`);
    if (names.filter((other) => other === name).length > 1)
      errors.push(`Duplicate migration identifier: ${name}`);
  }
  for (const { name, alias } of entries) {
    if (imports.get(alias) !== name)
      errors.push(`Registry ${name} does not map to import ${alias} from ./${name}.js.`);
  }
  for (const [alias, file] of imports) {
    if (!entries.some((entry) => entry.alias === alias))
      errors.push(`Unregistered migration import: ${file}`);
  }
  for (const name of files)
    if (!nameSet.has(name)) errors.push(`Unregistered migration file: ${name}.ts`);
  for (const name of names)
    if (!fileSet.has(name)) errors.push(`Registry migration has no source file: ${name}.ts`);
  for (const name of historical) {
    if (!fileSet.has(name)) {
      errors.push(`Historical migration deleted: ${name}.ts`);
      continue;
    }
    const actual = createHash('sha256')
      .update(readFileSync(resolve(directory, `${name}.ts`)))
      .digest('hex');
    if (actual !== baseline.migrations[name])
      errors.push(`Historical migration changed: ${name}.ts`);
  }
  const latestHistorical = historical.at(-1);
  for (const name of names) {
    if (!(name in baseline.migrations) && name <= latestHistorical)
      errors.push(
        `New migration ${name} sorts before or within the immutable baseline ending at ${latestHistorical}.`,
      );
  }
  const sorted = [...nameSet].sort();
  if (sorted.length !== fileSet.size)
    errors.push('Migration registry and source file counts differ.');
  return {
    errors: [...new Set(errors)],
    count: names.length,
    historicalCount: historical.length,
    latestHistorical,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = validateMigrationHistory();
  if (result.errors.length) {
    console.error(
      `Migration history invalid:\n${result.errors.map((error) => `- ${error}`).join('\n')}`,
    );
    process.exitCode = 1;
  } else {
    console.log(
      `Migration history valid: ${result.count} registered, ${result.historicalCount} immutable baseline migrations.`,
    );
  }
}
