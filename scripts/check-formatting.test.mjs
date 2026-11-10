import assert from 'node:assert/strict';
import test from 'node:test';
import { assessFormatting, formattingFingerprint } from './check-formatting.mjs';

const baseline = { debt: { 'old.ts': 'old' }, protected: { 'migration.ts': 'immutable' } };
test('recognizes unchanged debt without pretending full formatting passes', () => {
  assert.deepEqual(
    assessFormatting([{ path: 'old.ts', hash: 'old', formatted: false }], baseline),
    { failures: [], existingDebt: 1 },
  );
});
test('rejects both new and changed unformatted source', () => {
  assert.equal(
    assessFormatting(
      [
        { path: 'old.ts', hash: 'changed', formatted: false },
        { path: 'new.ts', hash: 'new', formatted: false },
      ],
      baseline,
    ).failures.length,
    2,
  );
});
test('accepts debt removal but rejects migration tampering even if formatted', () => {
  assert.equal(
    assessFormatting([{ path: 'old.ts', hash: 'fixed', formatted: true }], baseline).failures
      .length,
    0,
  );
  assert.equal(
    assessFormatting([{ path: 'migration.ts', hash: 'changed', formatted: true }], baseline)
      .failures.length,
    1,
  );
});
test('fingerprints normalize checkout EOL only, preserving significant data', () => {
  assert.equal(formattingFingerprint('a\r\nb'), formattingFingerprint('a\nb'));
  assert.notEqual(formattingFingerprint('81.0000'), formattingFingerprint('80.0000'));
  assert.notEqual(formattingFingerprint('select  1'), formattingFingerprint('select 1'));
});
