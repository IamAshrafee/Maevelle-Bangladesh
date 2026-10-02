import { copyFileSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { spawnSync } from 'node:child_process';

const action = process.argv[2];
const assumeYes = process.argv.slice(3).includes('--yes');
const root = fileURLToPath(new URL('../', import.meta.url));

process.chdir(root);

function runDocker(...args) {
  const result = spawnSync('docker', args, { stdio: 'inherit' });
  if (result.error) {
    throw new Error('Docker Desktop is required and must be running.');
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function runPnpm(...args) {
  const result = spawnSync('pnpm', args, { stdio: 'inherit' });
  if (result.error) {
    throw new Error('pnpm is required to seed the local database. Install it, then try again.');
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function optionalEnvironmentValue(name) {
  const value = process.env[name]?.trim();
  return value || undefined;
}

function applyConfiguredSkyBuyImport() {
  const configuredWorkbookPath = optionalEnvironmentValue('SKYBUY_IMPORT_WORKBOOK_PATH');
  if (!configuredWorkbookPath) return;

  const workbookPath = resolve(configuredWorkbookPath);
  if (!existsSync(workbookPath) || !statSync(workbookPath).isFile()) {
    throw new Error(
      `SKYBUY_IMPORT_WORKBOOK_PATH points to a missing workbook: ${workbookPath}. ` +
        'Restore the local workbook or remove the setting before running Prepare or Reset.',
    );
  }
  if (!/\.xlsx$/i.test(workbookPath)) {
    throw new Error('SKYBUY_IMPORT_WORKBOOK_PATH must point to a .xlsx workbook.');
  }

  const organizationCode = optionalEnvironmentValue('SKYBUY_IMPORT_ORGANIZATION_CODE') ?? 'maevelle';
  const locationCode = optionalEnvironmentValue('SKYBUY_IMPORT_LOCATION_CODE') ?? 'WH-EAST-MAISHA';
  console.log('Reapplying configured SkyBuy catalog and procurement history...');
  runPnpm(
    '--filter',
    '@maevelle/database',
    'import:skybuy:apply',
    '--',
    workbookPath,
    `--org=${organizationCode}`,
    `--location=${locationCode}`,
    '--apply',
  );
}

function assertDockerAvailable() {
  const result = spawnSync('docker', ['compose', 'version'], { stdio: 'ignore' });
  if (result.error || result.status !== 0) {
    throw new Error('Docker Compose v2 is required. Start Docker Desktop, then try again.');
  }
}

async function prepare() {
  assertDockerAvailable();
  if (!existsSync('.env')) {
    copyFileSync('.env.example', '.env');
    console.log('Created .env from .env.example.');
  }

  console.log('Building and starting Maevelle...');
  // Recreate the one-shot services so migrations and the local Owner bootstrap always run.
  runDocker('compose', 'up', '-d', '--build', '--force-recreate');

  console.log('Waiting for the Admin login page...');
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await fetch('http://localhost:8080/admin/login');
      if (response.ok) {
        console.log('Seeding canonical catalog data...');
        runPnpm('db:seed');
        applyConfiguredSkyBuyImport();
        console.log('\nMaevelle is ready.');
        console.log('Storefront:   http://localhost:8080/');
        console.log('Admin login: http://localhost:8080/admin/login');
        console.log('Credentials: see BOOTSTRAP_OWNER_EMAIL and BOOTSTRAP_OWNER_PASSWORD in .env');
        return;
      }
    } catch {
      // Services are still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }

  throw new Error(
    'Maevelle did not become ready. Run: docker compose ps && docker compose logs --tail=100',
  );
}

async function reset() {
  assertDockerAvailable();
  if (!assumeYes) {
    console.log('WARNING: This permanently deletes all local Maevelle Docker data:');
    console.log('- PostgreSQL databases, users, orders, inventory, and migrations');
    console.log('- locally uploaded media');
    console.log('- Caddy local state');
    const prompt = createInterface({ input: stdin, output: stdout });
    const confirmation = await prompt.question('\nType RESET to continue: ');
    prompt.close();
    if (confirmation !== 'RESET') {
      console.log('Reset cancelled.');
      return;
    }
  }

  console.log('Removing the local Maevelle Docker environment and its named volumes...');
  runDocker('compose', 'down', '--volumes', '--remove-orphans');
  await prepare();
}

if (action === 'prepare') {
  await prepare();
} else if (action === 'reset') {
  await reset();
} else {
  console.error('Usage: node scripts/local-environment.mjs <prepare|reset> [--yes]');
  process.exit(1);
}
