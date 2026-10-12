'use client';

import React from 'react';
import type { UnitStatusDto } from '@maevelle/contracts';
import { StatusBadge } from '@/components/status-badge';
import { cn } from '@/lib/utils';

const STATUS_LABELS: Record<UnitStatusDto, string> = {
  AVAILABLE: 'Available',
  AWAITING_QC: 'Awaiting QC',
  ON_HOLD: 'On Hold',
  RESERVED: 'Reserved',
  IN_FULFILLMENT: 'In Fulfillment',
  IN_TRANSFER: 'In Transfer',
  DISPATCHED: 'Dispatched',
  RETURNED: 'Returned',
  WRITTEN_OFF: 'Written Off',
};

const STATUS_TONES: Record<
  UnitStatusDto,
  'success' | 'warning' | 'danger' | 'info' | 'neutral'
> = {
  AVAILABLE: 'success',
  AWAITING_QC: 'warning',
  ON_HOLD: 'warning',
  RESERVED: 'info',
  IN_FULFILLMENT: 'info',
  IN_TRANSFER: 'info',
  DISPATCHED: 'neutral',
  RETURNED: 'info',
  WRITTEN_OFF: 'danger',
};

export function UnitStatusBadge({
  status,
  className,
}: {
  readonly status: UnitStatusDto;
  readonly className?: string;
}) {
  const tone = STATUS_TONES[status] ?? 'neutral';
  const label = STATUS_LABELS[status] ?? status;

  return (
    <StatusBadge
      status={label}
      tone={tone}
      className={cn('font-medium', className)}
    />
  );
}
