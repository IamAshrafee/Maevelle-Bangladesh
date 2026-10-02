'use client';

import { Activity, Clock, User } from 'lucide-react';
import type { AssetDetailDto } from '@maevelle/contracts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatAssetDate, humanizeAssetCode } from '@/lib/assets/format';

interface AssetActivityTabProps {
  asset: AssetDetailDto;
}

export function AssetActivityTab({ asset }: AssetActivityTabProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Physical Lifecycle Timeline</CardTitle>
        <CardDescription>
          Domain events complement the platform Audit trail without duplicating financial ledgers.
        </CardDescription>
      </CardHeader>

      <CardContent>
        {asset.history.length === 0 ? (
          <div className="rounded-xl border border-dashed p-8 text-center space-y-2">
            <Activity className="size-8 mx-auto text-muted-foreground/60" />
            <p className="text-sm font-semibold text-foreground">No Activity Recorded</p>
            <p className="text-xs text-muted-foreground">
              Lifecycle events will appear here as the asset is operated, moved, or serviced.
            </p>
          </div>
        ) : (
          <div className="grid gap-0 pl-2">
            {asset.history.map((event) => {
              return (
                <div
                  key={event.id}
                  className="relative border-l-2 border-muted pl-6 pb-6 last:pb-0"
                >
                  {/* Timeline dot */}
                  <span className="absolute -left-1.5 top-1 size-3 rounded-full bg-primary ring-4 ring-background" />

                  <div className="grid gap-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <strong className="text-sm font-semibold text-foreground">
                        {humanizeAssetCode(event.type)}
                      </strong>
                      <span className="text-xs text-muted-foreground flex items-center gap-1 font-mono">
                        <Clock className="size-3" />
                        {formatAssetDate(event.occurredAt, true)}
                      </span>
                    </div>

                    <p className="text-sm text-foreground">{event.summary}</p>

                    {event.actorName ? (
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                        <User className="size-3" />
                        <span>Performed by {event.actorName}</span>
                      </p>
                    ) : null}

                    {/* Before / After Snapshot Diff (if present) */}
                    {event.beforeState || event.afterState ? (
                      <div className="mt-2 text-xs rounded-md bg-muted/40 p-2.5 space-y-1 font-mono">
                        {event.beforeState && Object.keys(event.beforeState).length > 0 ? (
                          <div className="text-muted-foreground">
                            <span className="font-semibold text-destructive/80 mr-1.5">
                              - Previous:
                            </span>
                            {JSON.stringify(event.beforeState)}
                          </div>
                        ) : null}
                        {event.afterState && Object.keys(event.afterState).length > 0 ? (
                          <div className="text-muted-foreground">
                            <span className="font-semibold text-emerald-600 dark:text-emerald-400 mr-1.5">
                              + Result:
                            </span>
                            {JSON.stringify(event.afterState)}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
