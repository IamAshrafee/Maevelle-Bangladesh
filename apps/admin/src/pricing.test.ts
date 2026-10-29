import { describe, expect, it } from 'vitest';

import {
  calculateDiscountPercent,
  formatScheduleWindow,
  getScheduleCategory,
} from '../components/pricing/types';

describe('Pricing calculations and schedule classification', () => {
  const referenceNow = new Date('2026-10-29T12:00:00.000Z');

  it('classifies archived and draft price definitions regardless of dates', () => {
    expect(
      getScheduleCategory(
        {
          status: 'ARCHIVED',
          effectiveFrom: '2026-10-01T00:00:00.000Z',
          effectiveTo: null,
        },
        referenceNow,
      ),
    ).toBe('ARCHIVED');

    expect(
      getScheduleCategory(
        {
          status: 'DRAFT',
          effectiveFrom: '2026-10-01T00:00:00.000Z',
          effectiveTo: null,
        },
        referenceNow,
      ),
    ).toBe('DRAFT');
  });

  it('classifies active prices into live, upcoming, or expired based on the temporal window', () => {
    // Currently live (open ended)
    expect(
      getScheduleCategory(
        {
          status: 'ACTIVE',
          effectiveFrom: '2026-10-01T00:00:00.000Z',
          effectiveTo: null,
        },
        referenceNow,
      ),
    ).toBe('LIVE_ACTIVE');

    // Currently live (within range)
    expect(
      getScheduleCategory(
        {
          status: 'ACTIVE',
          effectiveFrom: '2026-10-25T00:00:00.000Z',
          effectiveTo: '2026-10-31T00:00:00.000Z',
        },
        referenceNow,
      ),
    ).toBe('LIVE_ACTIVE');

    // Upcoming campaign
    expect(
      getScheduleCategory(
        {
          status: 'ACTIVE',
          effectiveFrom: '2026-11-01T00:00:00.000Z',
          effectiveTo: '2026-11-07T00:00:00.000Z',
        },
        referenceNow,
      ),
    ).toBe('UPCOMING');

    // Expired schedule
    expect(
      getScheduleCategory(
        {
          status: 'ACTIVE',
          effectiveFrom: '2026-10-01T00:00:00.000Z',
          effectiveTo: '2026-10-15T00:00:00.000Z',
        },
        referenceNow,
      ),
    ).toBe('EXPIRED');
  });

  it('calculates discount percentage accurately for valid numbers', () => {
    // 2000 compare at, 1500 selling -> 25% discount
    expect(calculateDiscountPercent('1500', '2000')).toBe(25);

    // 1600 compare at, 1200 selling -> 25% discount
    expect(calculateDiscountPercent('1200', '1600')).toBe(25);

    // 1000 compare at, 850 selling -> 15% discount
    expect(calculateDiscountPercent('850', '1000')).toBe(15);
  });

  it('returns null discount when compareAt is null, empty, or not strictly greater than selling price', () => {
    expect(calculateDiscountPercent('1500', null)).toBeNull();
    expect(calculateDiscountPercent('1500', '')).toBeNull();
    expect(calculateDiscountPercent('1500', '1500')).toBeNull();
    expect(calculateDiscountPercent('1500', '1400')).toBeNull();
    expect(calculateDiscountPercent('0', '1500')).toBeNull();
  });

  it('formats schedule window with open-ended or bounded dates', () => {
    const openEnded = formatScheduleWindow('2026-10-01T00:00:00.000Z', null);
    expect(openEnded.primary).toContain('From');
    expect(openEnded.secondary).toBe('Open-ended (No expiry)');

    const bounded = formatScheduleWindow(
      '2026-10-01T00:00:00.000Z',
      '2026-10-15T00:00:00.000Z',
    );
    expect(bounded.primary).toContain('→');
  });
});

