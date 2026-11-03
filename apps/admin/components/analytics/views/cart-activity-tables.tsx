'use client';

import { useState } from 'react';
import type {
  CartActivityBreakdown,
  CartAnalyticsDto,
  CartMutationOperation,
} from '@maevelle/contracts';
import { NativeSelect } from '@/components/ui/native-select';
import { PagePanel } from '@/components/ui/page-shell';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const operationLabels: Record<CartMutationOperation, string> = {
  add_line: 'Add item',
  remove_line: 'Remove item',
  set_quantity: 'Change quantity',
  replace_variant: 'Change variant',
  clear: 'Clear Bag',
  apply_coupon: 'Apply coupon',
  remove_coupon: 'Remove coupon',
  wishlist_transfer: 'Wishlist transfer',
  merge_guest: 'Merge guest Bag',
};

export const formatCartCount = (count: string) => BigInt(count).toLocaleString();
const numericCell = 'text-right font-mono tabular-nums';

export function CartActivityTable({ rows }: { rows: readonly CartActivityBreakdown[] }) {
  const [operation, setOperation] = useState('');
  const available = [...new Set(rows.map((row) => row.operation))];
  const selected = available.some((key) => key === operation) ? operation : '';
  const visible = rows.filter((row) => !selected || row.operation === selected);
  return (
    <PagePanel className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Changes by operation and Cart type</h3>
        <NativeSelect
          aria-label="Filter operation breakdown"
          value={selected}
          onChange={(event) => setOperation(event.target.value)}
        >
          <option value="">All operations</option>
          {available.map((key) => (
            <option key={key} value={key}>
              {operationLabels[key]}
            </option>
          ))}
        </NativeSelect>
      </div>
      <Table aria-label="Cart changes by operation, owner and currency" density="compact">
        <TableHeader>
          <TableRow>
            <TableHead>Operation</TableHead>
            <TableHead>Cart type</TableHead>
            <TableHead>Currency</TableHead>
            <TableHead className="text-right">Changes</TableHead>
            <TableHead className="text-right">Net units</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {visible.map((row) => (
            <TableRow key={[row.operation, row.owner, row.wishlistAction, row.currency].join(':')}>
              <TableCell>
                {row.wishlistAction === 'ADD'
                  ? 'Add from Wishlist'
                  : row.wishlistAction === 'MOVE'
                    ? 'Move from Wishlist'
                    : operationLabels[row.operation]}
              </TableCell>
              <TableCell>{row.owner === 'GUEST' ? 'Guest' : 'Account'}</TableCell>
              <TableCell>{row.currency}</TableCell>
              <TableCell className={numericCell}>{formatCartCount(row.mutations)}</TableCell>
              <TableCell className={numericCell}>{formatCartCount(row.netUnitChange)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </PagePanel>
  );
}

export function CartValueTable({ values }: { values: CartAnalyticsDto['committed']['values'] }) {
  return (
    <PagePanel className="space-y-3">
      <h3 className="text-sm font-semibold">Average merchandise value after a change</h3>
      <p className="text-sm text-muted-foreground">
        Each committed change contributes one snapshot, so frequently changed Bags contribute more
        often. Values reflect evaluated merchandise only. Revenue is measured separately from
        orders.
      </p>
      <Table aria-label="Average merchandise value per committed change" density="compact">
        <TableHeader>
          <TableRow>
            <TableHead>Currency</TableHead>
            <TableHead className="text-right">Gross</TableHead>
            <TableHead className="text-right">Net</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {values.map((row) => (
            <TableRow key={row.currency}>
              <TableCell>{row.currency}</TableCell>
              <TableCell className={numericCell}>{row.averageGross}</TableCell>
              <TableCell className={numericCell}>{row.averageNet}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </PagePanel>
  );
}
