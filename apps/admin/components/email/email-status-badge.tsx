'use client';

import {
  CheckCircle2,
  Clock,
  ClockAlert,
  XCircle,
  Undo2,
  ShieldAlert,
  Ban,
  MailX,
  Hand,
  MinusCircle,
  RefreshCw,
  Send,
  Eye,
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { statusExplanations, type EmailNotificationStatus } from './email-types';

interface EmailStatusBadgeProps {
  readonly status: string;
  readonly className?: string;
  readonly showTooltip?: boolean;
  readonly size?: 'sm' | 'default';
}

const statusConfig: Record<
  string,
  {
    label: string;
    icon: typeof CheckCircle2;
    classes: string;
    iconClasses?: string;
  }
> = {
  DELIVERED: {
    label: 'Delivered',
    icon: CheckCircle2,
    classes: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  },
  SENT: {
    label: 'Accepted by Resend',
    icon: Send,
    classes: 'border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-400',
  },
  QUEUED: {
    label: 'Queued',
    icon: Clock,
    classes: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400',
  },
  PROCESSING: {
    label: 'Processing',
    icon: RefreshCw,
    classes: 'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-400',
    iconClasses: 'animate-spin',
  },
  DELIVERY_DELAYED: {
    label: 'Delivery Delayed',
    icon: ClockAlert,
    classes: 'border-amber-600/30 bg-amber-600/10 text-amber-800 dark:text-amber-300',
  },
  FAILED: {
    label: 'Failed',
    icon: XCircle,
    classes: 'border-destructive/30 bg-destructive/10 text-destructive',
  },
  BOUNCED: {
    label: 'Bounced',
    icon: Undo2,
    classes: 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-400',
  },
  COMPLAINED: {
    label: 'Spam Complaint',
    icon: ShieldAlert,
    classes: 'border-purple-500/30 bg-purple-500/10 text-purple-700 dark:text-purple-400',
  },
  SUPPRESSED: {
    label: 'Suppressed',
    icon: Ban,
    classes: 'border-zinc-500/30 bg-zinc-500/10 text-zinc-700 dark:text-zinc-400',
  },
  SKIPPED_NO_EMAIL: {
    label: 'No Email (Skipped)',
    icon: MailX,
    classes: 'border-slate-500/30 bg-slate-500/10 text-slate-700 dark:text-slate-400',
  },
  PENDING_MANUAL: {
    label: 'Manual Pending',
    icon: Hand,
    classes: 'border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-400',
  },
  NOT_APPLICABLE: {
    label: 'Not Applicable',
    icon: MinusCircle,
    classes: 'border-muted-foreground/30 bg-muted text-muted-foreground',
  },
  READ: {
    label: 'Read',
    icon: Eye,
    classes: 'border-muted-foreground/30 bg-muted text-foreground',
  },
};

export function EmailStatusBadge({ status, className, showTooltip = true, size = 'default' }: EmailStatusBadgeProps) {
  const normalized = status.toUpperCase();
  const config = statusConfig[normalized] ?? {
    label: status.replaceAll('_', ' '),
    icon: Clock,
    classes: 'border-muted bg-muted/50 text-foreground',
  };

  const explanation = statusExplanations[normalized as EmailNotificationStatus] ?? 'Email delivery status.';
  const Icon = config.icon;

  const isSmall = size === 'sm';
  const badgeElement = (
    <span
      className={cn(
        'inline-flex items-center rounded-full border font-medium tracking-tight transition-colors',
        isSmall ? 'gap-1 px-2 py-0.5 text-[10px]' : 'gap-1.5 px-2.5 py-0.5 text-xs',
        config.classes,
        className,
      )}
      role="status"
      aria-label={`Status: ${config.label}`}
    >
      <Icon className={cn(isSmall ? 'size-3 shrink-0' : 'size-3.5 shrink-0', config.iconClasses)} aria-hidden="true" />
      <span>{config.label}</span>
    </span>
  );

  if (!showTooltip) return badgeElement;

  return (
    <TooltipProvider delay={200}>
      <Tooltip>
        <TooltipTrigger>{badgeElement}</TooltipTrigger>
        <TooltipContent side="top" className="max-w-xs text-xs">
          <p className="font-semibold">{config.label}</p>
          <p className="text-muted-foreground mt-0.5">{explanation}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
