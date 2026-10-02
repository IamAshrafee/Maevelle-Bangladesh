'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowLeft, History, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SettingStatusBadge, RuntimeEffectBadge } from './setting-status-badge';
import type { SettingsReadinessStatus } from '@maevelle/contracts';

interface SettingsPageHeaderProps {
  readonly title: string;
  readonly description: string;
  readonly backHref?: string;
  readonly backLabel?: string;
  readonly readinessStatus?: SettingsReadinessStatus;
  readonly readinessLabel?: string;
  readonly runtimeMutable?: boolean;
  readonly requiresRestart?: boolean;
  readonly onOpenHistory?: () => void;
  readonly onResetDefaults?: () => void;
  readonly resetLoading?: boolean;
  readonly actions?: ReactNode;
}

export function SettingsPageHeader({
  title,
  description,
  backHref,
  backLabel,
  readinessStatus,
  readinessLabel,
  runtimeMutable = true,
  requiresRestart = false,
  onOpenHistory,
  onResetDefaults,
  resetLoading = false,
  actions,
}: SettingsPageHeaderProps) {
  return (
    <div className="mb-6 space-y-3 pb-5 border-b">
      {backHref && (
        <div>
          <Link
            href={backHref}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="size-3.5" />
            {backLabel ?? 'Back to Settings'}
          </Link>
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
            {readinessStatus && (
              <SettingStatusBadge status={readinessStatus} label={readinessLabel} />
            )}
            <RuntimeEffectBadge
              runtimeMutable={runtimeMutable}
              requiresRestart={requiresRestart}
            />
          </div>
          <p className="text-sm text-muted-foreground max-w-2xl">{description}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1 sm:pt-0">
          {onOpenHistory && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onOpenHistory}
              className="inline-flex items-center gap-1.5 text-xs h-8"
            >
              <History className="size-3.5 text-muted-foreground" />
              History
            </Button>
          )}

          {onResetDefaults && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onResetDefaults}
              disabled={resetLoading}
              className="inline-flex items-center gap-1.5 text-xs h-8 text-muted-foreground hover:text-foreground"
            >
              <RotateCcw className="size-3.5" />
              Reset to defaults
            </Button>
          )}

          {actions}
        </div>
      </div>
    </div>
  );
}
