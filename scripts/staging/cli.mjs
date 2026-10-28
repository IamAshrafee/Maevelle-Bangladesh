import { parseOptions, workflow } from './operator.mjs';

try {
  await workflow(parseOptions(process.argv.slice(2)));
} catch (error) {
  console.error(
    `Staging command failed: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
}
