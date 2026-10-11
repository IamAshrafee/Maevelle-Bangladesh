import { describe, expect, it } from 'vitest';

import {
  grossMarginPercent,
  merchandisingCost,
  suggestedSellingPrice,
} from '../components/products/creator/utils/pricing';

describe('Catalog merchandising pricing', () => {
  const finalizedCost = {
    amount: '1025.50',
    currency: 'BDT',
    state: 'FINALIZED' as const,
    receiptNumber: 'RCV-101',
    receivedAt: '2026-10-11T10:00:00.000Z',
  };

  it('uses receipt-backed landed cost ahead of the planning estimate', () => {
    expect(merchandisingCost('900', finalizedCost)).toEqual({
      amount: '1025.50',
      source: 'LANDED_COST',
      acquisition: finalizedCost,
    });
  });

  it('keeps the estimate as a fallback before landed cost exists', () => {
    expect(merchandisingCost('900', null)).toEqual({
      amount: '900',
      source: 'ESTIMATE',
      acquisition: null,
    });
  });

  it('does not mix a foreign-currency acquisition cost into BDT margin', () => {
    expect(merchandisingCost('900', { ...finalizedCost, currency: 'CNY' })).toMatchObject({
      amount: '900',
      source: 'ESTIMATE',
    });
  });

  it('calculates margin and rounds target-margin prices upward to a useful BDT step', () => {
    expect(grossMarginPercent('1600', '1000')).toBe(37.5);
    expect(suggestedSellingPrice('1000', 40)).toBe('1670');
    expect(suggestedSellingPrice('1000', 50)).toBe('2000');
  });

  it('rejects incomplete or impossible pricing inputs', () => {
    expect(grossMarginPercent('', '1000')).toBeNull();
    expect(suggestedSellingPrice('1000', 100)).toBeNull();
    expect(suggestedSellingPrice('0', 40)).toBeNull();
  });
});
