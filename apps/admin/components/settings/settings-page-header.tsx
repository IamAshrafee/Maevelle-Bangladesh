'use client';

import type { ReactNode } from 'react';
import { History, RotateCcw } from 'lucide-react';
import type { SettingsReadinessStatus } from '@maevelle/contracts';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-shell';
import { SettingStatusBadge, RuntimeEffectBadge } from './setting-status-badge';

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

/**
 * Compatibility settings header delegating layout and breadcrumbs to Layer 4 `<PageHeader>`.
 */
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
    <PageHeader
      {...(backHref
        ? {
            breadcrumbs: [
              { label: backLabel ?? 'Settings', href: backHref },
              { label: title, current: true },
            ],
          }
        : {})}
      eyebrow="Platform Settings"
      title={title}
      badge={
        <div className="flex flex-wrap items-center gap-2">
          {readinessStatus ? (
            <SettingStatusBadge status={readinessStatus} label={readinessLabel} />
          ) : null}
          <RuntimeEffectBadge runtimeMutable={runtimeMutable} requiresRestart={requiresRestart} />
        </div>
      }
      description={description}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          {onOpenHistory ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onOpenHistory}
              className="gap-1.5 text-xs"
            >
              <History className="size-3.5 text-muted-foreground" />
              History
            </Button>
          ) : null}
          {onResetDefaults ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onResetDefaults}
              disabled={resetLoading}
              className="gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              <RotateCcw className="size-3.5" />
              Reset to defaults
            </Button>
          ) : null}
          {actions}
        </div>
      }
      className="mb-6"
    />
  );
}
