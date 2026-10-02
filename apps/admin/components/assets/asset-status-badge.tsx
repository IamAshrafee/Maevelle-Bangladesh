'use client';

import {
  AlertTriangle,
  Archive,
  Ban,
  CheckCircle2,
  DollarSign,
  HelpCircle,
  Wrench,
} from 'lucide-react';
import type { AssetConditionDto, AssetStatusDto } from '@maevelle/contracts';
import { cn } from '@/lib/utils';
import { humanizeAssetCode } from '@/lib/assets/format';

interface AssetStatusBadgeProps {
  status: AssetStatusDto | string;
  className?: string;
  showIcon?: boolean;
}

export function AssetStatusBadge({ status, className, showIcon = true }: AssetStatusBadgeProps) {
  const normalized = status.toUpperCase();

  let tone = 'neutral';
  let Icon = HelpCircle;

  switch (normalized) {
    case 'ACTIVE':
      tone = 'success';
      Icon = CheckCircle2;
      break;
    case 'IN_STORAGE':
      tone = 'neutral';
      Icon = Archive;
      break;
    case 'UNDER_REPAIR':
      tone = 'warning';
      Icon = Wrench;
      break;
    case 'DAMAGED':
    case 'LOST':
      tone = 'danger';
      Icon = AlertTriangle;
      break;
    case 'SOLD':
      tone = 'neutral';
      Icon = DollarSign;
      break;
    case 'DISPOSED':
      tone = 'danger';
      Icon = Ban;
      break;
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium',
        tone === 'success' &&
          'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20',
        tone === 'warning' &&
          'bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20',
        tone === 'danger' &&
          'bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-500/20',
        tone === 'neutral' && 'bg-muted text-muted-foreground border border-border',
        className,
      )}
    >
      {showIcon ? <Icon className="size-3.5 shrink-0" /> : null}
      <span>{humanizeAssetCode(status)}</span>
    </span>
  );
}

interface AssetConditionBadgeProps {
  condition: AssetConditionDto | string;
  className?: string;
}

export function AssetConditionBadge({ condition, className }: AssetConditionBadgeProps) {
  const normalized = condition.toUpperCase();

  let tone = 'neutral';
  switch (normalized) {
    case 'GOOD':
      tone = 'success';
      break;
    case 'FAIR':
      tone = 'neutral';
      break;
    case 'NEEDS_REPAIR':
      tone = 'warning';
      break;
    case 'DAMAGED':
      tone = 'danger';
      break;
  }

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-normal',
        tone === 'success' &&
          'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400',
        tone === 'warning' && 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400',
        tone === 'danger' && 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400',
        tone === 'neutral' && 'bg-muted/60 text-muted-foreground',
        className,
      )}
    >
      Condition: {humanizeAssetCode(condition)}
    </span>
  );
}
