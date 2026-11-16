'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

interface TableProps extends React.ComponentProps<'table'> {
  density?: 'compact' | 'comfortable';
  stickyHeader?: boolean;
  containerClassName?: string;
}

function Table({
  className,
  density = 'comfortable',
  stickyHeader = false,
  containerClassName,
  ...props
}: TableProps) {
  return (
    <div
      data-slot="table-container"
      data-density={density}
      data-sticky-header={stickyHeader ? 'true' : undefined}
      className={cn(
        'relative w-full overflow-x-auto overscroll-x-contain rounded-lg border border-border bg-card shadow-2xs',
        stickyHeader && 'max-h-[72vh] overflow-y-auto overscroll-y-contain',
        containerClassName,
      )}
    >
      <table
        data-slot="table"
        data-density={density}
        className={cn('w-full caption-bottom text-sm border-collapse text-left', className)}
        {...props}
      />
    </div>
  );
}

interface TableHeaderProps extends React.ComponentProps<'thead'> {
  sticky?: boolean;
}

function TableHeader({ className, sticky, ...props }: TableHeaderProps) {
  return (
    <thead
      data-slot="table-header"
      className={cn(
        'border-b border-border bg-muted/40 font-medium text-xs text-muted-foreground',
        (sticky || undefined) !== undefined && sticky
          ? 'sticky top-0 z-10 bg-muted'
          : 'in-data-[sticky-header=true]:sticky in-data-[sticky-header=true]:top-0 in-data-[sticky-header=true]:z-10 in-data-[sticky-header=true]:bg-muted',
        className,
      )}
      {...props}
    />
  );
}

function TableBody({ className, ...props }: React.ComponentProps<'tbody'>) {
  return (
    <tbody
      data-slot="table-body"
      className={cn('[&_tr:last-child]:border-0 divide-y divide-border/60', className)}
      {...props}
    />
  );
}

function TableFooter({ className, ...props }: React.ComponentProps<'tfoot'>) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        'border-t border-border bg-muted/50 font-medium [&>tr]:last:border-b-0',
        className,
      )}
      {...props}
    />
  );
}

function TableRow({ className, ...props }: React.ComponentProps<'tr'>) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        'border-b border-border/60 transition-colors hover:bg-muted/30 has-aria-expanded:bg-muted/40 data-[state=selected]:bg-primary/5 data-[state=selected]:hover:bg-primary/10',
        className,
      )}
      {...props}
    />
  );
}

function TableHead({ className, ...props }: React.ComponentProps<'th'>) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        'h-9 px-3.5 text-left align-middle font-semibold whitespace-nowrap text-muted-foreground text-xs select-none tracking-tight in-data-[density=compact]:h-8 in-data-[density=compact]:px-2.5 [&:has([role=checkbox])]:pr-0',
        className,
      )}
      {...props}
    />
  );
}

function TableCell({ className, ...props }: React.ComponentProps<'td'>) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        'p-3.5 align-middle whitespace-nowrap text-sm text-foreground in-data-[density=compact]:py-2 in-data-[density=compact]:px-2.5 [&:has([role=checkbox])]:pr-0',
        className,
      )}
      {...props}
    />
  );
}

function TableCaption({ className, ...props }: React.ComponentProps<'caption'>) {
  return (
    <caption
      data-slot="table-caption"
      className={cn('mt-4 text-xs text-muted-foreground', className)}
      {...props}
    />
  );
}

export { Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell, TableCaption };
