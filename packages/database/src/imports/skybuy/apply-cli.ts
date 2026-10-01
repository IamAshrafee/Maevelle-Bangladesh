import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { sql } from 'kysely';

import { createDatabase } from '../../index.js';
import { resolveActorId, resolveOrganization } from '../../seed/helpers/tenant.js';
import { applySkyBuyCatalogAndProcurement } from './apply.js';
import { createSkyBuyImportPlan } from './plan.js';
import { readSkyBuyWorkbook } from './workbook.js';

if (!process.env.DATABASE_URL) {
  let directory = dirname(fileURLToPath(import.meta.url));
  while (directory !== dirname(directory)) {
    const candidate = resolve(directory, '.env');
    if (existsSync(candidate)) {
      process.loadEnvFile?.(candidate);
      if (process.env.DATABASE_URL) break;
    }
    directory = dirname(directory);
  }
}

interface ApplyCliOptions {
  readonly workbookPath: string;
  readonly organizationCode: string;
  readonly locationCode: string;
}

function parseArgs(args: readonly string[]): ApplyCliOptions {
  let workbookPath: string | undefined;
  let organizationCode = 'maevelle';
  let locationCode = 'WH-EAST-MAISHA';
  let confirmed = false;
  for (const arg of args) {
    if (arg === '--apply') confirmed = true;
    else if (arg.startsWith('--org=')) organizationCode = arg.slice('--org='.length).trim();
    else if (arg.startsWith('--location='))
      locationCode = arg.slice('--location='.length).trim().toUpperCase();
    else if (!arg.startsWith('-') && !workbookPath) workbookPath = arg;
  }
  if (!confirmed)
    throw new Error('Refusing to modify the database without the explicit --apply flag.');
  if (!workbookPath) throw new Error('A SkyBuy .xlsx path is required.');
  return { workbookPath: resolve(workbookPath), organizationCode, locationCode };
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
  const database = createDatabase({
    connectionString: process.env.DATABASE_URL,
    maxConnections: 4,
  });
  try {
    const workbook = await readSkyBuyWorkbook(options.workbookPath);
    const plan = createSkyBuyImportPlan(workbook);
    const tenant = await resolveOrganization(
      database.db,
      options.organizationCode,
      'Maevelle Bangladesh',
    );
    const actorId = await resolveActorId(database.db, tenant.id, process.env.SEED_ACTOR_ID);
    const location = await sql<{ id: string }>`select location.id::text
      from warehouse.locations location
      join warehouse.location_capabilities capability
        on capability.organization_id=location.organization_id and capability.location_id=location.id
      where location.organization_id=${tenant.id} and location.code=${options.locationCode}
        and location.status='ACTIVE' and capability.capability_code='PURCHASE_RECEIVING'`.execute(
      database.db,
    );
    if (!location.rows[0]) {
      throw new Error(
        `Active receiving location ${options.locationCode} was not found. Run the bootstrap seeds first.`,
      );
    }
    const result = await applySkyBuyCatalogAndProcurement(database.db, plan, workbook, {
      organizationId: tenant.id,
      actorId,
      destinationLocationId: location.rows[0].id,
    });
    console.log(JSON.stringify(result, null, 2));
    console.log(
      'Catalog and Procurement history applied. Inventory, receipts, landed-cost finalization, and supplier payments remain intentionally blocked.',
    );
  } finally {
    await database.close();
  }
}

await main();
