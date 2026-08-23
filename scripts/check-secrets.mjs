import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const tracked = spawnSync('git', ['ls-files'], { encoding: 'utf8' });
if (tracked.status !== 0) throw new Error('Could not enumerate tracked files for the secret scan.');
const patterns = [
  { name: 'AWS access key', expression: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'private key', expression: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { name: 'GitHub token', expression: /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/ },
  {
    name: 'generic production secret assignment',
    expression: /(?:api[_-]?key|secret|password)\s*[:=]\s*['"][^'"\s]{20,}['"]/i,
  },
];
const allowed = new Set(['.env.example', 'compose.yaml', 'docs/implementation/status.md']);
const findings = [];
for (const file of tracked.stdout.split(/\r?\n/).filter(Boolean)) {
  if (
    allowed.has(file) ||
    /(?:^|\/)(?:pnpm-lock\.yaml|package-lock\.json)$/.test(file) ||
    /(?:\.test|\.spec)\.[cm]?[jt]sx?$/.test(file)
  )
    continue;
  let content;
  try {
    content = readFileSync(file, 'utf8');
  } catch {
    continue;
  }
  for (const pattern of patterns)
    if (pattern.expression.test(content)) findings.push(`${pattern.name}: ${file}`);
}
if (findings.length) {
  console.error('Potential committed secret(s) found:\n' + findings.join('\n'));
  process.exit(1);
}
console.log('Secret scan passed: no high-confidence tracked credential patterns found.');
