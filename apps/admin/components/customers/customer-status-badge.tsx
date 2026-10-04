'use client';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { AlertOctagon, CheckCircle2, GitMerge, PauseCircle, ShieldAlert } from 'lucide-react';

interface CustomerStatusBadgeProps {
  readonly status: 'ACTIVE' | 'INACTIVE' | 'BLOCKED' | 'MERGED' | 'ANONYMIZED' | string;
  readonly className?: string;
}

export function CustomerStatusBadge({ status, className }: CustomerStatusBadgeProps) {
  switch (status) {
    case 'ACTIVE':
      return (
        <Badge
          variant="outline"
          className={cn(
            'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-400 gap-1 font-medium',
            className,
          )}
        >
          <CheckCircle2 className="size-3" aria-hidden="true" />
          Active
        </Badge>
      );
    case 'INACTIVE':
      return (
        <Badge
          variant="outline"
          className={cn(
            'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 gap-1 font-medium',
            className,
          )}
        >
          <PauseCircle className="size-3" aria-hidden="true" />
          Inactive
        </Badge>
      );
    case 'BLOCKED':
      return (
        <Badge
          variant="outline"
          className={cn(
            'border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/50 dark:text-rose-400 gap-1 font-medium',
            className,
          )}
        >
          <AlertOctagon className="size-3" aria-hidden="true" />
          Blocked
        </Badge>
      );
    case 'MERGED':
      return (
        <Badge
          variant="outline"
          className={cn(
            'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/50 dark:text-amber-300 gap-1 font-medium',
            className,
          )}
        >
          <GitMerge className="size-3" aria-hidden="true" />
          Merged Alias
        </Badge>
      );
    case 'ANONYMIZED':
      return (
        <Badge
          variant="outline"
          className={cn(
            'border-slate-300 bg-slate-100 text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-500 gap-1 font-medium',
            className,
          )}
        >
          <ShieldAlert className="size-3" aria-hidden="true" />
          Anonymized
        </Badge>
      );
    default:
      return (
        <Badge variant="outline" className={cn('capitalize font-medium', className)}>
          {status.toLowerCase().replaceAll('_', ' ')}
        </Badge>
      );
  }
}
