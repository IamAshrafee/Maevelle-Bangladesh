'use client';

import Link from 'next/link';
import { Calendar, ExternalLink, Plus, ReceiptText, User, Wrench, XCircle } from 'lucide-react';
import type { AssetDetailDto } from '@maevelle/contracts';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatAssetDate, formatAssetMoney, humanizeAssetCode } from '@/lib/assets/format';
import { isTerminalAsset } from '../types';

interface AssetMaintenanceTabProps {
  asset: AssetDetailDto;
  canManage: boolean;
  onRecordMaintenance: () => void;
  onVoidMaintenance: (maintenanceId: string) => void;
}

export function AssetMaintenanceTab({
  asset,
  canManage,
  onRecordMaintenance,
  onVoidMaintenance,
}: AssetMaintenanceTabProps) {
  const terminal = isTerminalAsset(asset.status);

  return (
    <Card>
      <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <CardTitle>Maintenance & Service Records</CardTitle>
          <CardDescription>
            Audit log of repairs, scheduled services, diagnostics, and part replacements.
          </CardDescription>
        </div>

        {canManage && !terminal ? (
          <Button onClick={onRecordMaintenance} size="sm">
            <Plus className="size-4 mr-1.5" />
            <span>Record Maintenance</span>
          </Button>
        ) : null}
      </CardHeader>

      <CardContent className="grid gap-4">
        {asset.maintenance.length === 0 ? (
          <div className="rounded-xl border border-dashed p-8 text-center space-y-3">
            <Wrench className="size-8 mx-auto text-muted-foreground/60" />
            <div className="space-y-1">
              <p className="text-sm font-semibold text-foreground">No Maintenance Records</p>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                No inspections, repairs, or service logs have been recorded for this equipment yet.
              </p>
            </div>
            {canManage && !terminal ? (
              <Button onClick={onRecordMaintenance} variant="outline" size="sm">
                <Plus className="size-4 mr-1.5" />
                Record First Service
              </Button>
            ) : null}
          </div>
        ) : (
          asset.maintenance.map((m) => {
            const isVoided = m.status === 'VOIDED';

            return (
              <div
                key={m.id}
                className={`rounded-xl border bg-card p-4 transition-all space-y-3 ${
                  isVoided ? 'opacity-60 bg-muted/20 border-dashed' : 'hover:border-primary/40'
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-foreground">
                      {humanizeAssetCode(m.type)}
                    </span>
                    <span className="text-xs text-muted-foreground">·</span>
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Calendar className="size-3" />
                      {formatAssetDate(m.occurredOn)}
                    </span>
                    {isVoided ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 text-destructive border border-destructive/20 px-2 py-0.5 text-[11px] font-medium">
                        <XCircle className="size-3" />
                        Voided
                      </span>
                    ) : null}
                  </div>

                  {m.expenseId ? (
                    <Link
                      className="font-medium text-xs text-primary hover:underline flex items-center gap-1 bg-primary/5 px-2.5 py-1 rounded-full border border-primary/20"
                      href={`/finance/expenses/${m.expenseId}`}
                    >
                      <ReceiptText className="size-3.5" />
                      <span>
                        {m.expenseNumber} ·{' '}
                        {formatAssetMoney(m.expenseAmount ?? '0', asset.currencyCode)}
                      </span>
                      <ExternalLink className="size-3 ml-0.5" />
                    </Link>
                  ) : (
                    <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded">
                      Zero-cost / Warranty
                    </span>
                  )}
                </div>

                {m.issue ? (
                  <div className="text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">Reported Issue: </span>
                    <span>{m.issue}</span>
                  </div>
                ) : null}

                <div className="text-sm text-foreground bg-muted/30 rounded-lg p-3">
                  <p className="font-medium text-xs uppercase tracking-wider text-muted-foreground mb-1">
                    Work Performed
                  </p>
                  <p>{m.workPerformed}</p>
                </div>

                <div className="flex flex-wrap items-center justify-between text-xs text-muted-foreground pt-1 border-t gap-2">
                  <div className="flex flex-wrap items-center gap-3">
                    {m.serviceProvider ? (
                      <span className="flex items-center gap-1">
                        <User className="size-3" />
                        Provider: {m.serviceProvider}
                      </span>
                    ) : null}

                    {m.nextServiceOn ? (
                      <span className="flex items-center gap-1 text-primary">
                        <Calendar className="size-3" />
                        Next Service: {formatAssetDate(m.nextServiceOn)}
                      </span>
                    ) : null}
                  </div>

                  {m.voidReason ? (
                    <p className="text-xs text-destructive italic">Void Reason: {m.voidReason}</p>
                  ) : canManage && !terminal ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-xs text-muted-foreground hover:text-destructive h-7 px-2"
                      onClick={() => onVoidMaintenance(m.id)}
                    >
                      Void incorrect entry
                    </Button>
                  ) : null}
                </div>
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
