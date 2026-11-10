/** New formatting debt gate. Full-repository Prettier remains a separate check. */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as prettier from 'prettier';

export const formattingFingerprint = (text) =>
  createHash('sha256').update(text.replaceAll('\r\n', '\n')).digest('hex');

export function assessFormatting(files, baseline) {
  const failures = [];
  let existingDebt = 0;
  for (const file of files) {
    if (baseline.protected[file.path] && baseline.protected[file.path] !== file.hash)
      failures.push({ file: file.path, reason: 'Protected migration content changed.' });
    if (file.formatted) continue;
    if (baseline.debt[file.path] === file.hash) existingDebt++;
    else failures.push({ file: file.path, reason: 'New or changed formatting violation.' });
  }
  return { failures, existingDebt };
}

export async function inspectFormatting(root) {
  const paths = execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    {
      cwd: root,
      encoding: 'utf8',
    },
  )
    .split('\0')
    .filter(Boolean)
    .sort();
  const files = [];
  for (const path of paths) {
    const absolute = resolve(root, path);
    try {
      await access(absolute);
    } catch (error) {
      if (error.code === 'ENOENT') continue; // A deliberate Git deletion has no content to format.
      throw error;
    }
    const info = await prettier.getFileInfo(absolute, {
      ignorePath: resolve(root, '.prettierignore'),
    });
    if (info.ignored || !info.inferredParser) continue;
    const text = await readFile(absolute, 'utf8');
    const options = {
      ...(await prettier.resolveConfig(absolute, { editorconfig: true })),
      filepath: absolute,
    };
    files.push({
      path,
      hash: formattingFingerprint(text),
      formatted: await prettier.check(text, options),
    });
  }
  return files;
}

export async function checkFormatting(root) {
  const baseline = JSON.parse(
    await readFile(resolve(root, 'tooling/format-debt-baseline.json'), 'utf8'),
  );
  if (baseline.version !== 1) throw new Error('Unsupported formatting baseline.');
  for (const [path, expected] of Object.entries(baseline.configuration)) {
    if (formattingFingerprint(await readFile(resolve(root, path), 'utf8')) !== expected)
      throw new Error(
        `Formatting policy changed: review configuration and baseline together (${path}).`,
      );
  }
  const files = await inspectFormatting(root);
  const result = assessFormatting(files, baseline);
  // Check protected material even when ignored or removed, never silently exempt it.
  for (const [path, expected] of Object.entries(baseline.protected)) {
    try {
      if (
        formattingFingerprint(await readFile(resolve(root, path), 'utf8')) !== expected &&
        !result.failures.some((failure) => failure.file === path)
      )
        result.failures.push({ file: path, reason: 'Protected migration content changed.' });
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      result.failures.push({ file: path, reason: 'Protected migration removed.' });
    }
  }
  return { ...result, inspected: files.length };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await checkFormatting(resolve(import.meta.dirname, '..'));
  for (const failure of result.failures) console.error(`${failure.file}: ${failure.reason}`);
  console.log(
    `Formatting regression gate: ${result.failures.length} failures; ${result.existingDebt} unchanged inherited violations; full formatting is a separate gate.`,
  );
  process.exitCode = result.failures.length ? 1 : 0;
}
