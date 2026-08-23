import { describe, expect, it } from 'vitest';

import { allocateDeterministically, CostingDomainError } from './costing.js';

describe('landed-cost deterministic allocation', () => {
  const targets = [
    { id: 'a', shipmentAllocationId: 'shipment-a', basis: '1' },
    { id: 'b', shipmentAllocationId: 'shipment-b', basis: '1' },
    { id: 'c', shipmentAllocationId: 'shipment-c', basis: '1' },
  ];

  it('uses stable largest-remainder rounding and preserves the committed component total', () => {
    const first = allocateDeterministically('100.0000', targets);
    const second = allocateDeterministically('100.0000', targets);
    expect(first).toEqual(second);
    expect(first.map((item) => item.amount)).toEqual(['33.3334', '33.3333', '33.3333']);
    expect(first.reduce((total, item) => total + Number(item.amount), 0)).toBeCloseTo(100, 10);
  });

  it('allocates quantity and purchase-value bases exactly without JavaScript float arithmetic', () => {
    expect(
      allocateDeterministically('100.0000', [
        { id: 'a', shipmentAllocationId: 'a', basis: '6.000000' },
        { id: 'b', shipmentAllocationId: 'b', basis: '4.000000' },
      ]),
    ).toMatchObject([{ amount: '60.0000' }, { amount: '40.0000' }]);
    expect(
      allocateDeterministically('100.0000', [
        { id: 'a', shipmentAllocationId: 'a', basis: '300.000000' },
        { id: 'b', shipmentAllocationId: 'b', basis: '100.000000' },
      ]),
    ).toMatchObject([{ amount: '75.0000' }, { amount: '25.0000' }]);
  });

  it('rejects unavailable or zero allocation metadata rather than silently falling back', () => {
    expect(() =>
      allocateDeterministically('10.0000', [{ id: 'a', shipmentAllocationId: 'a', basis: '0' }]),
    ).toThrow(CostingDomainError);
  });
});
