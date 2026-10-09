'use client';

import * as React from 'react';
import {
  Bell,
  CheckCircle2,
  Clock,
  AlertCircle,
  XCircle,
  AlertTriangle,
  RotateCw,
  Mail,
  MessageSquare,
  Ban,
  Send,
  Smartphone,
  Eye,
  HelpCircle,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export interface NotificationStatusBadgeProps {
  readonly status: string;
  readonly className?: string;
  readonly showIcon?: boolean;
}

export function NotificationStatusBadge({
  status,
  className,
  showIcon = true,
}: NotificationStatusBadgeProps) {
  const normalized = status.toUpperCase();

  switch (normalized) {
    case 'DELIVERED':
    case 'READ':
      return (
        <Badge
          variant="outline"
          className={cn(
            'border-emerald-500/30 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 gap-1 text-[11px] font-medium',
            className,
          )}
        >
          {showIcon && <CheckCircle2 className="size-3 text-emerald-600 dark:text-emerald-400" />}
          {normalized === 'READ' ? 'Read' : 'Delivered'}
        </Badge>
      );

    case 'SENT':
    case 'ACCEPTED':
    case 'PROVIDER_ACCEPTED':
      return (
        <Badge
          variant="outline"
          className={cn(
            'border-sky-500/30 bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-400 gap-1 text-[11px] font-medium',
            className,
          )}
        >
          {showIcon && <Clock className="size-3 text-sky-600 dark:text-sky-400" />}
          {normalized === 'PROVIDER_ACCEPTED' ? 'Provider Accepted' : 'Sent'}
        </Badge>
      );

    case 'QUEUED':
    case 'SCHEDULED':
      return (
        <Badge
          variant="outline"
          className={cn(
            'border-amber-500/30 bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 gap-1 text-[11px] font-medium',
            className,
          )}
        >
          {showIcon && <Clock className="size-3 text-amber-600 dark:text-amber-400" />}
          {normalized === 'SCHEDULED' ? 'Scheduled' : 'Queued'}
        </Badge>
      );

    case 'PROCESSING':
      return (
        <Badge
          variant="outline"
          className={cn(
            'border-indigo-500/30 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-400 gap-1 text-[11px] font-medium',
            className,
          )}
        >
          {showIcon && <RotateCw className="size-3 text-indigo-600 dark:text-indigo-400 animate-spin" />}
          Processing
        </Badge>
      );

    case 'RETRY_WAIT':
    case 'RETRY_PENDING':
    case 'PENDING_MANUAL':
      return (
        <Badge
          variant="outline"
          className={cn(
            'border-orange-500/30 bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-400 gap-1 text-[11px] font-medium',
            className,
          )}
        >
          {showIcon && <RotateCw className="size-3 text-orange-600 dark:text-orange-400" />}
          {normalized === 'PENDING_MANUAL' ? 'Pending Manual' : 'Retry Scheduled'}
        </Badge>
      );

    case 'UNKNOWN_PROVIDER_OUTCOME':
    case 'UNKNOWN_OUTCOME':
    case 'UNKNOWN':
      return (
        <Badge
          variant="outline"
          className={cn(
            'border-purple-500/30 bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-400 gap-1 text-[11px] font-medium',
            className,
          )}
        >
          {showIcon && <HelpCircle className="size-3 text-purple-600 dark:text-purple-400" />}
          Outcome Unknown
        </Badge>
      );

    case 'FAILED':
    case 'REJECTED':
    case 'UNDELIVERABLE':
    case 'BOUNCED':
    case 'COMPLAINED':
      return (
        <Badge
          variant="outline"
          className={cn(
            'border-rose-500/30 bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400 gap-1 text-[11px] font-medium',
            className,
          )}
        >
          {showIcon && <XCircle className="size-3 text-rose-600 dark:text-rose-400" />}
          {normalized === 'BOUNCED'
            ? 'Bounced'
            : normalized === 'COMPLAINED'
              ? 'Spam Complaint'
              : normalized === 'UNDELIVERABLE'
                ? 'Undeliverable'
                : 'Failed'}
        </Badge>
      );

    case 'SUPPRESSED':
    case 'SKIPPED':
    case 'SKIPPED_NO_EMAIL':
    case 'SKIPPED_NO_PHONE':
    case 'NOT_APPLICABLE':
      return (
        <Badge
          variant="outline"
          className={cn(
            'border-border bg-muted/50 text-muted-foreground gap-1 text-[11px] font-medium',
            className,
          )}
        >
          {showIcon && <Ban className="size-3 text-muted-foreground" />}
          {normalized === 'SKIPPED_NO_EMAIL'
            ? 'No Email'
            : normalized === 'SKIPPED_NO_PHONE'
              ? 'No Phone'
              : normalized === 'SUPPRESSED'
                ? 'Suppressed'
                : 'Skipped'}
        </Badge>
      );

    case 'CANCELLED':
      return (
        <Badge
          variant="outline"
          className={cn(
            'border-border bg-muted/40 text-muted-foreground gap-1 text-[11px] font-medium',
            className,
          )}
        >
          {showIcon && <Ban className="size-3 text-muted-foreground" />}
          Cancelled
        </Badge>
      );

    case 'UNREAD':
      return (
        <Badge
          variant="outline"
          className={cn(
            'border-primary/30 bg-primary/10 text-primary gap-1 text-[11px] font-medium',
            className,
          )}
        >
          {showIcon && <AlertCircle className="size-3 text-primary" />}
          Unread
        </Badge>
      );

    default:
      return (
        <Badge
          variant="outline"
          className={cn('border-border bg-card text-foreground gap-1 text-[11px]', className)}
        >
          {status.replaceAll('_', ' ')}
        </Badge>
      );
  }
}

export interface NotificationChannelBadgeProps {
  readonly channel: string;
  readonly className?: string;
}

export function NotificationChannelBadge({ channel, className }: NotificationChannelBadgeProps) {
  const normalized = channel.toUpperCase();

  switch (normalized) {
    case 'IN_APP':
      return (
        <Badge
          variant="secondary"
          className={cn('bg-secondary text-secondary-foreground gap-1 text-[11px]', className)}
        >
          <Bell className="size-3 text-muted-foreground" />
          In-App
        </Badge>
      );
    case 'EMAIL':
      return (
        <Badge
          variant="secondary"
          className={cn(
            'bg-sky-500/10 text-sky-700 dark:text-sky-300 border border-sky-500/20 gap-1 text-[11px]',
            className,
          )}
        >
          <Mail className="size-3 text-sky-600 dark:text-sky-400" />
          Email
        </Badge>
      );
    case 'SMS':
      return (
        <Badge
          variant="secondary"
          className={cn(
            'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20 gap-1 text-[11px]',
            className,
          )}
        >
          <MessageSquare className="size-3 text-emerald-600 dark:text-emerald-400" />
          SMS
        </Badge>
      );
    case 'TELEGRAM':
      return (
        <Badge
          variant="secondary"
          className={cn('bg-muted text-muted-foreground gap-1 text-[11px]', className)}
        >
          <Send className="size-3 text-muted-foreground" />
          Telegram
        </Badge>
      );
    case 'PUSH':
      return (
        <Badge
          variant="secondary"
          className={cn('bg-muted text-muted-foreground gap-1 text-[11px]', className)}
        >
          <Smartphone className="size-3 text-muted-foreground" />
          Push
        </Badge>
      );
    default:
      return (
        <Badge variant="outline" className={cn('text-[11px]', className)}>
          {channel}
        </Badge>
      );
  }
}

export interface NotificationPriorityBadgeProps {
  readonly priority: 'LOW' | 'NORMAL' | 'HIGH' | 'CRITICAL' | string;
  readonly className?: string;
}

export function NotificationPriorityBadge({ priority, className }: NotificationPriorityBadgeProps) {
  const normalized = priority.toUpperCase();

  switch (normalized) {
    case 'CRITICAL':
      return (
        <Badge
          variant="destructive"
          className={cn('bg-destructive text-destructive-foreground text-[10px] font-semibold tracking-wider uppercase', className)}
        >
          Critical
        </Badge>
      );
    case 'HIGH':
      return (
        <Badge
          variant="outline"
          className={cn('border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400 text-[10px] font-semibold tracking-wider uppercase', className)}
        >
          High
        </Badge>
      );
    case 'NORMAL':
      return (
        <Badge
          variant="outline"
          className={cn('border-border bg-card text-muted-foreground text-[10px] font-medium uppercase', className)}
        >
          Normal
        </Badge>
      );
    case 'LOW':
      return (
        <Badge
          variant="outline"
          className={cn('border-border/60 bg-muted/40 text-muted-foreground text-[10px] font-normal uppercase', className)}
        >
          Low
        </Badge>
      );
    default:
      return null;
  }
}
