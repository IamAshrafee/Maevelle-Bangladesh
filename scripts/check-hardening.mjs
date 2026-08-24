import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const tracked = spawnSync('git', ['ls-files', '*.ts', '*.tsx', '*.mjs'], {
  encoding: 'utf8',
  shell: false,
});
if (tracked.status !== 0) process.exit(tracked.status ?? 1);
const files = tracked.stdout.trim().split(/\r?\n/u).filter(Boolean);
const failures = [];
for (const file of files) {
  const source = readFileSync(file, 'utf8');
  if (/\beval\s*\(|new\s+Function\s*\(/u.test(source))
    failures.push(`${file}: executable string evaluation`);
  if (/document\.write\s*\(|\.innerHTML\s*=/u.test(source))
    failures.push(`${file}: unsafe browser HTML sink`);
  if (/dangerouslySetInnerHTML/u.test(source) && !file.endsWith('products/[handle]/page.tsx'))
    failures.push(`${file}: unreviewed React HTML sink`);
  if (/AKIA[0-9A-Z]{16}|-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/u.test(source))
    failures.push(`${file}: credential material`);
}

const appSource = readFileSync('apps/api/src/app.ts', 'utf8');
for (const requirement of [
  'ORIGIN_REJECTED',
  'x-content-type-options',
  'content-security-policy',
  '/auth/',
  '/storefront/v1/reviews',
  '/storefront/v1/orders/confirmation',
]) {
  if (!appSource.includes(requirement))
    failures.push(`API hardening requirement missing: ${requirement}`);
}

const routeFiles = files.filter(
  (file) => file.startsWith('apps/api/src/routes/') && file.endsWith('.ts'),
);
for (const file of routeFiles) {
  const source = readFileSync(file, 'utf8');
  if (
    source.includes("'/admin/") &&
    !/(requireCapability|findActiveAdminContext|context\(|admin\()/u.test(source)
  )
    failures.push(`${file}: Admin route lacks a recognizable server authorization boundary`);
}

if (failures.length > 0) {
  console.error('Hardening check failed:\n' + failures.map((failure) => `- ${failure}`).join('\n'));
  process.exit(1);
}
console.log(
  `Hardening check passed across ${files.length} tracked TypeScript/JavaScript sources and ${routeFiles.length} API route modules.`,
);
