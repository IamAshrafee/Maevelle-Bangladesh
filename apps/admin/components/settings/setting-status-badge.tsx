'use client';

import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Lock,
  MinusCircle,
  Power,
  RotateCcw,
  Shield,
  Zap,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { HealthSeverity, IntegrationStatus, SettingsReadinessStatus, SettingSource } from '@maevelle/contracts';

interface SettingStatusBadgeProps {
  readonly status?:
    | SettingsReadinessStatus
    | IntegrationStatus
    | HealthSeverity
    | 'enabled'
    | 'disabled'
    | 'CRITICAL'
    | 'NEEDS_ATTENTION'
    | undefined;
  readonly className?: string | undefined;
  readonly label?: string | undefined;
}

export function SettingStatusBadge({ status, className, label }: SettingStatusBadgeProps) {
  if (!status) return null;

  switch (status) {
    case 'ready':
    case 'HEALTHY':
    case 'CONNECTED':
    case 'enabled':
      return (
        <Badge
          variant="outline"
          className={cn(
            'inline-flex items-center gap-1.5 border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-medium px-2 py-0.5 text-xs',
            className,
          )}
        >
          <CheckCircle2 className="size-3.5 text-emerald-600 dark:text-emerald-400" />
          {label ?? (status === 'enabled' ? 'Enabled' : status === 'CONNECTED' ? 'Connected' : 'Ready')}
        </Badge>
      );

    case 'needs_configuration':
    case 'WARNING':
    case 'NEEDS_ATTENTION':
    case 'NEEDS_CONFIGURATION':
      return (
        <Badge
          variant="outline"
          className={cn(
            'inline-flex items-center gap-1.5 border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400 font-medium px-2 py-0.5 text-xs',
            className,
          )}
        >
          <AlertTriangle className="size-3.5 text-amber-600 dark:text-amber-400" />
          {label ?? 'Needs attention'}
        </Badge>
      );

    case 'disabled':
      return (
        <Badge
          variant="outline"
          className={cn(
            'inline-flex items-center gap-1.5 border-muted-foreground/30 bg-muted text-muted-foreground font-medium px-2 py-0.5 text-xs',
            className,
          )}
        >
          <Power className="size-3.5 text-muted-foreground" />
          {label ?? 'Disabled'}
        </Badge>
      );

    case 'restricted':
    case 'RESTRICTED':
    case 'INFO':
      return (
        <Badge
          variant="outline"
          className={cn(
            'inline-flex items-center gap-1.5 border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-400 font-medium px-2 py-0.5 text-xs',
            className,
          )}
        >
          <Shield className="size-3.5 text-blue-600 dark:text-blue-400" />
          {label ?? 'Restricted (Test Mode)'}
        </Badge>
      );

    case 'error':
    case 'BLOCKING':
    case 'CRITICAL':
      return (
        <Badge
          variant="outline"
          className={cn(
            'inline-flex items-center gap-1.5 border-destructive/30 bg-destructive/10 text-destructive font-medium px-2 py-0.5 text-xs',
            className,
          )}
        >
          <AlertCircle className="size-3.5 text-destructive" />
          {label ?? (status === 'CRITICAL' ? 'Critical' : 'Action required')}
        </Badge>
      );

    case 'DEPLOYMENT_MANAGED':
      return (
        <Badge
          variant="outline"
          className={cn(
            'inline-flex items-center gap-1.5 border-slate-500/30 bg-slate-500/10 text-slate-700 dark:text-slate-400 font-medium px-2 py-0.5 text-xs',
            className,
          )}
        >
          <Lock className="size-3.5 text-slate-600 dark:text-slate-400" />
          {label ?? 'Deployment managed'}
        </Badge>
      );

    default:
      return (
        <Badge variant="outline" className={cn('text-xs', className)}>
          {label ?? String(status)}
        </Badge>
      );
  }
}

export function RuntimeEffectBadge({
  runtimeMutable,
  requiresRestart,
  className,
}: {
  readonly runtimeMutable: boolean;
  readonly requiresRestart: boolean;
  readonly className?: string;
}) {
  if (!runtimeMutable) {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1 text-[11px] font-medium text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800/60 px-2 py-0.5 rounded-md border border-slate-200 dark:border-slate-700',
          className,
        )}
      >
        <Lock className="size-3" />
        Deployment managed
      </span>
    );
  }

  if (requiresRestart) {
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded-md border border-amber-200 dark:border-amber-800/40',
          className,
        )}
      >
        <RotateCcw className="size-3" />
        Restart required
      </span>
    );
  }

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-md border border-emerald-200 dark:border-emerald-800/40',
        className,
      )}
    >
      <Zap className="size-3 text-emerald-600 dark:text-emerald-400" />
      Takes effect immediately
    </span>
  );
}

export function SettingSourceBadge({
  source,
  className,
}: {
  readonly source: SettingSource;
  readonly className?: string;
}) {
  switch (source) {
    case 'DATABASE':
      return (
        <span
          className={cn(
            'inline-flex items-center gap-1 text-[10px] font-medium text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/40 px-1.5 py-0.5 rounded border border-blue-200 dark:border-blue-900/40',
            className,
          )}
        >
          Custom value
        </span>
      );
    case 'DEPLOYMENT_OVERRIDE':
      return (
        <span
          className={cn(
            'inline-flex items-center gap-1 text-[10px] font-medium text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/40 px-1.5 py-0.5 rounded border border-purple-200 dark:border-purple-900/40',
            className,
          )}
        >
          <Lock className="size-2.5" />
          Deployment override
        </span>
      );
    case 'DEFAULT':
    default:
      return (
        <span
          className={cn(
            'inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded border border-border',
            className,
          )}
        >
          Maevelle default
        </span>
      );
  }
}
