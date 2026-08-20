import { describe, expect, it } from 'vitest';

describe('repository toolchain', () => {
  it('runs TypeScript ESM tests', () => {
    expect(import.meta.url).toMatch(/^file:/);
  });
});
