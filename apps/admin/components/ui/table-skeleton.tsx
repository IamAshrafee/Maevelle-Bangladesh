import * as React from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { TableRow, TableCell } from '@/components/ui/table';
import { cn } from '@/lib/utils';

export interface TableSkeletonRowsProps {
  readonly columns?: number;
  readonly rows?: number;
  readonly columnWidths?: readonly (string | undefined)[];
}

/**
 * Standard table body skeleton rows for data tables during initial loading.
 * Preserves column alignment without shifting layout.
 */
export function TableSkeletonRows({
  columns = 6,
  rows = 5,
  columnWidths,
}: TableSkeletonRowsProps) {
  return (
    <>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <TableRow key={`skeleton-row-${rowIndex}`} className="hover:bg-transparent">
          {Array.from({ length: columns }).map((_, colIndex) => {
            const customWidth = columnWidths?.[colIndex];
            return (
              <TableCell key={`skeleton-cell-${colIndex}`}>
                <Skeleton
                  className={cn(
                    'h-4',
                    customWidth ??
                      (colIndex === 0
                        ? 'w-32 sm:w-44'
                        : colIndex === 1
                          ? 'w-24'
                          : colIndex === columns - 1
                            ? 'w-8 ml-auto'
                            : 'w-20'),
                  )}
                />
              </TableCell>
            );
          })}
        </TableRow>
      ))}
    </>
  );
}

export interface CardSkeletonStackProps {
  readonly count?: number;
  readonly className?: string;
}

/**
 * Stack of card skeletons for mobile / tablet views (< lg or md).
 */
export function CardSkeletonStack({ count = 4, className }: CardSkeletonStackProps) {
  return (
    <div className={cn('space-y-3', className)} aria-busy="true">
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={`card-skeleton-${index}`}
          className="rounded-xl border border-border bg-card p-4 shadow-2xs space-y-3"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1.5 flex-1 min-w-0">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-3 w-24" />
            </div>
            <Skeleton className="h-5 w-16" />
          </div>
          <div className="flex items-center justify-between gap-2 pt-1 border-t border-border/50">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-6 w-24 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Skeleton placeholder for stats values while metrics load.
 */
export function StatsValueSkeleton({ className }: { readonly className?: string }) {
  return <Skeleton className={cn('h-7 w-16 inline-block', className)} />;
}
