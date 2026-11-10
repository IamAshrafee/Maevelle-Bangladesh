import assert from 'node:assert/strict';
import test from 'node:test';
import { reviewFormatting } from './format-safety.mjs';

test('accepts layout-only changes while preserving exact monetary strings', () => {
  assert.equal(
    reviewFormatting("const money='81.0000';", "const money = '81.0000';\n", 'money.ts').safe,
    true,
  );
  assert.equal(
    reviewFormatting("const money='81.0000';", "const money='80.0000';", 'money.ts').safe,
    false,
  );
});
test('rejects changes to SQL/template bytes even when whitespace looks cosmetic', () => {
  const result = reviewFormatting('const q=sql`select  1`;', 'const q=sql`select 1`;', 'query.ts');
  assert.equal(result.templateBytesEqual, false);
  assert.equal(result.safe, false);
});
test('detects meaningful JSX whitespace and business-operator changes', () => {
  assert.equal(
    reviewFormatting('const v=<p>A B</p>;', 'const v=<p>AB</p>;', 'view.tsx').safe,
    false,
  );
  assert.equal(
    reviewFormatting('const due=total-cash;', 'const due=total+cash;', 'money.ts').safe,
    false,
  );
});
