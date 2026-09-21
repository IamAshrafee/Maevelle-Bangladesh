import React from 'react';

import { cn } from '../lib/utils';

const success = new Set([
  'ACTIVE',
  'PUBLISHED',
  'PAID',
  'VERIFIED',
  'DELIVERED',
  'COMPLETED',
  'RECEIVED',
  'HEALTHY',
  'SUCCEEDED',
  'READY',
  'MATCHED',
]);
const warning = new Set([
  'PENDING',
  'PARTIALLY_PAID',
  'PARTIALLY_RECEIVED',
  'PARTIALLY_SHIPPED',
  'ORDERED',
  'SHIPPED',
  'OUTSTANDING',
  'IN_TRANSIT',
  'INSPECTION',
  'QUARANTINE',
  'ON_HOLD',
  'RETRY_WAIT',
  'UNKNOWN_OUTCOME',
  'ATTENTION',
  'NOT_POSTED',
  'UNRECONCILED',
  'OPEN',
  'EXCEPTION',
]);
const danger = new Set([
  'FAILED',
  'CANCELLED',
  'REJECTED',
  'RTO',
  'DEAD_LETTER',
  'CRITICAL',
  'DISABLED',
  'BLOCKED',
]);

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const key = status.toUpperCase();
  const tone = success.has(key)
    ? 'success'
    : warning.has(key)
      ? 'warning'
      : danger.has(key)
        ? 'danger'
        : 'neutral';
  return (
    <span className={cn('status-badge', `status-${tone}`, className)}>
      {status.replaceAll('_', ' ')}
    </span>
  );
}
