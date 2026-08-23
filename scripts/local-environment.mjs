import { copyFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
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
