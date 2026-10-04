'use client';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { AlertTriangle, CheckCircle, HelpCircle, ShieldAlert } from 'lucide-react';

interface CustomerRiskBadgeProps {
  readonly level: 'INSUFFICIENT_HISTORY' | 'LOW' | 'MODERATE' | 'ELEVATED' | string;
  readonly className?: string;
  readonly showIcon?: boolean;
}

export function CustomerRiskBadge({
  level,
  className,
  showIcon = true,
}: CustomerRiskBadgeProps) {
  switch (level) {
    case 'LOW':
      return (
        <Badge
          variant="outline"
          className={cn(
            'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 gap-1 font-medium',
            className,
          )}
        >
          {showIcon && <CheckCircle className="size-3 text-emerald-600" aria-hidden="true" />}
          Low Delivery Risk
        </Badge>
      );
    case 'MODERATE':
      return (
        <Badge
          variant="outline"
          className={cn(
            'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-300 gap-1 font-medium',
            className,
          )}
        >
          {showIcon && <AlertTriangle className="size-3 text-amber-600" aria-hidden="true" />}
          Moderate Delivery Risk
        </Badge>
      );
    case 'ELEVATED':
      return (
        <Badge
          variant="outline"
          className={cn(
            'border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-300 gap-1 font-medium',
            className,
          )}
        >
          {showIcon && <ShieldAlert className="size-3 text-rose-600" aria-hidden="true" />}
          Elevated RTO Risk
        </Badge>
      );
    case 'INSUFFICIENT_HISTORY':
    default:
      return (
        <Badge
          variant="outline"
          className={cn(
            'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 gap-1 font-medium',
            className,
          )}
        >
          {showIcon && <HelpCircle className="size-3 text-slate-500" aria-hidden="true" />}
          Limited History
        </Badge>
      );
  }
}
