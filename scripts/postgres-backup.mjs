import { mkdirSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', shell: false, ...options });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function databaseName(value, restore = false) {
  const pattern = restore ? /^maevelle_restore_[a-z0-9_]+$/u : /^maevelle_[a-z0-9_]+$/u;
  if (!pattern.test(value)) throw new Error(`Unsafe database name: ${value}`);
  return value;
}

const action = process.argv[2] ?? 'backup';
const user = process.env.POSTGRES_USER ?? 'maevelle_dev';
if (action === 'backup') {
  const source = databaseName(process.argv[3] ?? 'maevelle_dev');
  const directory = resolve(process.argv[4] ?? 'var/backups');
  mkdirSync(directory, { recursive: true });
  const stamp = new Date().toISOString().replaceAll(/[:.]/gu, '-');
  const filename = `${source}-${stamp}.dump`;
  const containerPath = `/tmp/${filename}`;
  run('docker', [
    'compose',
    'exec',
    '-T',
    'postgres',
    'pg_dump',
    '--username',
    user,
    '--dbname',
    source,
    '--format',
    'custom',
    '--file',
    containerPath,
  ]);
  run('docker', [
    'cp',
    `maevelle-bangladesh-postgres-1:${containerPath}`,
    resolve(directory, filename),
  ]);
  run('docker', ['compose', 'exec', '-T', 'postgres', 'rm', '--', containerPath]);
  console.log(resolve(directory, filename));
} else if (action === 'restore-drill') {
  const backup = resolve(process.argv[3] ?? '');
  const target = databaseName(process.argv[4] ?? `maevelle_restore_${Date.now()}`, true);
  const containerPath = `/tmp/${basename(backup)}`;
  run('docker', ['cp', backup, `maevelle-bangladesh-postgres-1:${containerPath}`]);
  run('docker', [
    'compose',
    'exec',
    '-T',
    'postgres',
    'psql',
    '--username',
    user,
    '--dbname',
    'postgres',
    '--set',
    'ON_ERROR_STOP=1',
    '--command',
    `select pg_terminate_backend(pid) from pg_stat_activity where datname='${target}';`,
  ]);
  run('docker', [
    'compose',
    'exec',
    '-T',
    'postgres',
    'dropdb',
    '--username',
    user,
    '--if-exists',
    target,
  ]);
  run('docker', ['compose', 'exec', '-T', 'postgres', 'createdb', '--username', user, target]);
  run('docker', [
    'compose',
    'exec',
    '-T',
    'postgres',
    'pg_restore',
    '--username',
    user,
    '--dbname',
    target,
    '--exit-on-error',
    containerPath,
  ]);
  run('docker', [
    'compose',
    'exec',
    '-T',
    'postgres',
    'psql',
    '--username',
    user,
    '--dbname',
    target,
    '--tuples-only',
    '--command',
    "select count(*) from information_schema.schemata where schema_name in ('platform','catalog','orders','inventory','costing','analytics','search');",
  ]);
  run('docker', ['compose', 'exec', '-T', 'postgres', 'dropdb', '--username', user, target]);
  run('docker', ['compose', 'exec', '-T', 'postgres', 'rm', '--', containerPath]);
  console.log(`Restore drill passed and disposable database ${target} was removed.`);
} else {
  throw new Error(
    'Usage: postgres-backup.mjs backup [source] [directory] | restore-drill <file> [target]',
  );
}
