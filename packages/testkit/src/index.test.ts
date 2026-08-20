import { describe, expect, it } from 'vitest';

import { createDeterministicIdGenerator, createFakeClock, getTestDatabaseUrl } from './index.js';

describe('testkit foundation', () => {
  it('controls time deterministically', () => {
    const clock = createFakeClock();

    clock.advance(2_500);
    expect(clock.now().toISOString()).toBe('2020-01-01T00:00:02.500Z');
  });

  it('generates deterministic test identifiers', () => {
    const nextId = createDeterministicIdGenerator('order');

    expect(nextId()).toBe('order_0001');
    expect(nextId()).toBe('order_0002');
  });

  it('requires a test database URL distinct from runtime configuration', () => {
    expect(() => getTestDatabaseUrl({})).toThrow('TEST_DATABASE_URL');
    expect(() =>
      getTestDatabaseUrl({
        DATABASE_URL: 'postgresql://example/maevelle_dev',
        TEST_DATABASE_URL: 'postgresql://example/maevelle_dev',
      }),
    ).toThrow('must not be the same');
  });
});
