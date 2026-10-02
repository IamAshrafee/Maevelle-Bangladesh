'use client';

import { useEffect, useState } from 'react';
import { Clock, History, Loader2, User } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { fetchApiData } from '@/lib/api';
import type { SettingsAuditItemDto, SettingsAuditListResponseDto } from '@maevelle/contracts';

interface SettingsAuditDrawerProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly module?: string;
  readonly title?: string;
}

export function SettingsAuditDrawer({
  open,
  onOpenChange,
  module,
  title = 'Configuration Change History',
}: SettingsAuditDrawerProps) {
  const [items, setItems] = useState<readonly SettingsAuditItemDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;

    let mounted = true;
    setLoading(true);
    setError('');

    const query = new URLSearchParams({ limit: '30' });
    if (module) query.set('module', module);

    fetchApiData<SettingsAuditListResponseDto>(`/admin/settings/audit?${query.toString()}`)
      .then((data) => {
        if (mounted) {
          setItems(data?.items ?? []);
        }
      })
      .catch((err) => {
        if (mounted) {
          setError(err instanceof Error ? err.message : 'Unable to load configuration history.');
        }
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [open, module]);

  function formatAction(action: string): string {
    switch (action) {
      case 'settings.updated':
        return 'Updated single setting';
      case 'settings.module_updated':
        return 'Updated module settings';
      case 'settings.reset':
        return 'Reset setting to default';
      case 'settings.module_reset':
        return 'Reset module to defaults';
      case 'settings.secret_stored':
        return 'Configured encrypted secret';
      case 'settings.secret_revoked':
        return 'Revoked encrypted secret';
      default:
        return action.replace('settings.', '').replace('_', ' ');
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="sm:max-w-lg w-full flex flex-col p-6">
        <SheetHeader className="pb-4 border-b">
          <div className="flex items-center gap-2">
            <History className="size-5 text-primary" />
            <SheetTitle className="text-base font-semibold">{title}</SheetTitle>
          </div>
          <SheetDescription className="text-xs text-muted-foreground leading-relaxed">
            Immutable audit log of configuration adjustments and secret modifications. Plaintext
            credentials are never recorded.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto py-4 space-y-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-48 gap-2 text-muted-foreground text-xs">
              <Loader2 className="size-5 animate-spin text-primary" />
              <span>Loading audit events...</span>
            </div>
          ) : error ? (
            <div className="p-3 text-xs rounded-lg bg-destructive/10 text-destructive border border-destructive/20">
              {error}
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-12 text-xs text-muted-foreground space-y-1">
              <Clock className="size-8 mx-auto text-muted-foreground/40 mb-2" />
              <p className="font-medium text-foreground">No configuration changes yet</p>
              <p>Modifications to settings and credentials will appear here automatically.</p>
            </div>
          ) : (
            <div className="relative pl-6 space-y-6 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-border">
              {items.map((item) => (
                <div key={item.id} className="relative space-y-1.5 text-xs">
                  <div className="absolute -left-6 top-1 size-2 rounded-full bg-primary ring-4 ring-background" />

                  <div className="flex items-center justify-between gap-2">
                    <Badge variant="outline" className="text-[10px] font-mono capitalize py-0">
                      {formatAction(item.action)}
                    </Badge>
                    <span className="text-[11px] text-muted-foreground">
                      {new Date(item.createdAt).toLocaleString(undefined, {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <User className="size-3 text-muted-foreground/70" />
                    <span>{item.actorName || 'System Administrator'}</span>
                    {item.targetId && (
                      <>
                        <span>•</span>
                        <span className="font-mono text-[10px] text-foreground/80">
                          {item.targetId}
                        </span>
                      </>
                    )}
                  </div>

                  {item.reason && (
                    <p className="text-xs text-foreground bg-muted/40 p-2 rounded border border-border/50">
                      {item.reason}
                    </p>
                  )}

                  {/* Diff visualization */}
                  {item.afterDiff && Object.keys(item.afterDiff).length > 0 && (
                    <div className="bg-muted/20 p-2 rounded border border-border/40 font-mono text-[11px] space-y-0.5">
                      {Object.entries(item.afterDiff).map(([key, afterVal]) => {
                        const beforeVal = item.beforeDiff ? item.beforeDiff[key] : undefined;
                        const isRedacted = afterVal === '[REDACTED]';
                        return (
                          <div key={key} className="flex flex-wrap items-center gap-1.5">
                            <span className="text-muted-foreground">{key}:</span>
                            {beforeVal !== undefined && (
                              <>
                                <span className="line-through text-destructive/80">
                                  {isRedacted ? '[REDACTED]' : JSON.stringify(beforeVal)}
                                </span>
                                <span>→</span>
                              </>
                            )}
                            <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                              {isRedacted ? '[REDACTED]' : JSON.stringify(afterVal)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
