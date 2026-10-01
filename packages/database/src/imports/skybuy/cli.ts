import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { createSkyBuyImportPlan } from './plan.js';
import { readSkyBuyWorkbook } from './workbook.js';

interface CliOptions {
  readonly workbookPath: string;
  readonly outputPath?: string;
}

function parseArgs(args: readonly string[]): CliOptions {
  let workbookPath: string | undefined;
  let outputPath: string | undefined;
  for (const arg of args) {
    if (arg === '--help' || arg === '-h') {
      console.log(`
SkyBuy workbook import planner

Usage:
  pnpm --filter @maevelle/database import:skybuy -- <workbook.xlsx> [--output=<plan.json>]

This command is read-only. It validates every populated workbook row, reconciles
orders, items, charges, and payments, and emits a deterministic import plan.
`);
      process.exit(0);
    }
    if (arg.startsWith('--output=')) {
      outputPath = arg.slice('--output='.length).trim();
      continue;
    }
    if (!arg.startsWith('-') && !workbookPath) workbookPath = arg;
  }
  if (!workbookPath) throw new Error('A SkyBuy .xlsx path is required.');
  return {
    workbookPath: resolve(workbookPath),
    ...(outputPath ? { outputPath: resolve(outputPath) } : {}),
  };
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const workbook = await readSkyBuyWorkbook(options.workbookPath);
  const plan = createSkyBuyImportPlan(workbook);
  const serialized = `${JSON.stringify(plan, null, 2)}\n`;
  if (options.outputPath) {
    await mkdir(dirname(options.outputPath), { recursive: true });
    await writeFile(options.outputPath, serialized, 'utf8');
    console.log(`SkyBuy import plan written to ${options.outputPath}`);
    console.log(JSON.stringify(plan.summary, null, 2));
    return;
  }
  process.stdout.write(serialized);
}

await main();
