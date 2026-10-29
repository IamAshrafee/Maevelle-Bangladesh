import { expect, it } from 'vitest';

import { mapSettledLimited } from './concurrency';

it('caps active uploads and preserves each result position', async () => {
  let active = 0;
  let peak = 0;
  const results = await mapSettledLimited([0, 1, 2, 3, 4, 5], 2, async (item) => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 1));
    active -= 1;
    if (item === 3) throw new Error('failed');
    return item * 2;
  });
  expect(peak).toBe(2);
  expect(results.map((item) => item.status)).toEqual([
    'fulfilled','fulfilled','fulfilled','rejected','fulfilled','fulfilled',
  ]);
  expect(results[5]).toEqual({ status: 'fulfilled', value: 10 });
});
