'use client';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { AlertCircle, Ban, Eye } from 'lucide-react';
import type { CustomerRestrictionTypeDto } from '@maevelle/contracts';

interface CustomerRestrictionBadgeProps {
  readonly restrictionType: CustomerRestrictionTypeDto | string;
  readonly className?: string;
  readonly showIcon?: boolean;
}

export function CustomerRestrictionBadge({
  restrictionType,
  className,
  showIcon = true,
}: CustomerRestrictionBadgeProps) {
  switch (restrictionType) {
    case 'ORDERING_BLOCKED':
      return (
        <Badge
          variant="destructive"
          className={cn('gap-1 font-medium bg-rose-600 hover:bg-rose-700 text-white', className)}
        >
          {showIcon && <Ban className="size-3" aria-hidden="true" />}
          Ordering Blocked
        </Badge>
      );
    case 'COD_RESTRICTED':
      return (
        <Badge
          variant="outline"
          className={cn(
            'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-300 gap-1 font-medium',
            className,
          )}
        >
          {showIcon && <AlertCircle className="size-3 text-amber-600" aria-hidden="true" />}
          COD Restricted
        </Badge>
      );
    case 'ORDER_REVIEW_REQUIRED':
      return (
        <Badge
          variant="outline"
          className={cn(
            'border-blue-300 bg-blue-50 text-blue-900 dark:border-blue-800 dark:bg-blue-950/60 dark:text-blue-300 gap-1 font-medium',
            className,
          )}
        >
          {showIcon && <Eye className="size-3 text-blue-600" aria-hidden="true" />}
          Order Review Required
        </Badge>
      );
    default:
      return (
        <Badge variant="outline" className={cn('capitalize font-medium', className)}>
          {restrictionType.toLowerCase().replaceAll('_', ' ')}
        </Badge>
      );
  }
}
