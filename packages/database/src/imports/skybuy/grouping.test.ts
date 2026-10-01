import { describe, expect, it } from 'vitest';

import { resolveSkyBuyLogicalProductGroup } from './grouping.js';

function group(sourceListingId: string, attributes: Readonly<Record<string, string>>): string {
  return resolveSkyBuyLogicalProductGroup(sourceListingId, attributes).key;
}

describe('SkyBuy logical Product grouping', () => {
  it('keeps true size Variants in one Product', () => {
    const listing = 'abb-0451938299661';
    expect(group(listing, { Color: 'black', Size: '36' })).toBe(
      group(listing, { Color: 'black', Size: '38' }),
    );
  });

  it('splits unrelated supplier assortment designs', () => {
    const listing = 'abb-0348332031434';
    expect(group(listing, { Color: 'No. 20 flower gripper' })).not.toBe(
      group(listing, { Color: 'No. 21 flower gripper' }),
    );
  });

  it('merges an explicitly reviewed color family but not another design', () => {
    const listing = 'abb-06515262684980';
    expect(group(listing, { Color: 'Blue lace daisy' })).toBe(
      group(listing, { Color: 'Pink lace daisy' }),
    );
    expect(group(listing, { Color: 'Blue lace daisy' })).not.toBe(
      group(listing, { Color: 'White bow headband' }),
    );
  });

  it('merges reviewed flower colorways and separates flower designs', () => {
    const listing = 'abb-06586962329587';
    expect(group(listing, { Color: 'Blue narcissus' })).toBe(
      group(listing, { Color: 'Pink narcissus' }),
    );
    expect(group(listing, { Color: 'Blue narcissus' })).not.toBe(
      group(listing, { Color: 'Blue lily' }),
    );
  });

  it('merges supplier style codes whose suffix only describes color', () => {
    const listing = 'abb-0480136948429';
    expect(group(listing, { Color: 'Bl 4095m colors', Size: 'M' })).toBe(
      group(listing, { Color: 'Bl4095 milk white', Size: 'M' }),
    );
  });

  it('defaults an unreviewed assortment to separate Products', () => {
    const listing = 'future-assortment';
    expect(group(listing, { Style: 'Design A' })).not.toBe(group(listing, { Style: 'Design B' }));
  });
});
