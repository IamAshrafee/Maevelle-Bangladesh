import { expect, it } from 'vitest';
import { getDateRangeFromPreset } from './types';
it('uses the organization calendar instead of the browser timezone around midnight', () => {
  const instant = new Date('2026-11-01T19:00:00Z');
  expect(getDateRangeFromPreset('TODAY', 'Asia/Dhaka', instant)).toEqual({
    from: '2026-11-02',
    to: '2026-11-02',
  });
  expect(getDateRangeFromPreset('TODAY', 'UTC', instant)).toEqual({
    from: '2026-11-01',
    to: '2026-11-01',
  });
  expect(getDateRangeFromPreset('LAST_7_DAYS', 'Asia/Dhaka', instant)).toEqual({
    from: '2026-10-27',
    to: '2026-11-02',
  });
});
it('keeps previous-month boundaries correct across leap years', () => {
  expect(getDateRangeFromPreset('LAST_MONTH', 'UTC', new Date('2024-03-01T01:00:00Z'))).toEqual({
    from: '2024-02-01',
    to: '2024-02-29',
  });
});
