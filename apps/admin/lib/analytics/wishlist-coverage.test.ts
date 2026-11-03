import { expect, it } from 'vitest';
import { hasWishlistDayCoverage } from './wishlist-coverage';
const metadata = {
  instrumentationStart: '2026-11-01T19:00:00Z',
  retainedFrom: '2025-11-01T00:00:00Z',
  timezone: 'Asia/Dhaka',
};
it('does not present pre-instrumentation history as measured zero', () => {
  expect(hasWishlistDayCoverage('2026-11-01', metadata)).toBe(false);
  expect(hasWishlistDayCoverage('2026-11-02', metadata)).toBe(true);
  expect(hasWishlistDayCoverage('2026-11-02', null)).toBe(false);
});
it('respects retention and the organization calendar', () => {
  expect(hasWishlistDayCoverage('2026-11-01', { ...metadata, timezone: 'UTC' })).toBe(true);
  expect(
    hasWishlistDayCoverage('2026-11-02', { ...metadata, retainedFrom: '2026-11-03T00:00:00Z' }),
  ).toBe(false);
});
