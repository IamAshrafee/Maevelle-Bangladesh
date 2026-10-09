'use client';

import * as React from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Layers,
  RefreshCw,
  Shield,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/status-badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { fetchIntegrityRun } from '@/lib/integrity/api';
import type { IntegrityRunDetailDto } from '@/lib/integrity/types';

interface RunDetailDialogProps {
  runId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function RunDetailDialog({
  runId,
  open,
  onOpenChange,
}: RunDetailDialogProps) {
  const [detail, setDetail] = React.useState<IntegrityRunDetailDto | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!runId || !open) {
      setDetail(null);
      setError(null);
      return;
    }

    let active = true;
    setLoading(true);
    setError(null);

    fetchIntegrityRun(runId)
      .then((data) => {
        if (active) setDetail(data);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : 'Unable to load run details.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [runId, open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-1">
            {detail && <StatusBadge status={detail.status} />}
            <span className="text-2xs font-mono text-muted-foreground">{runId}</span>
          </div>
          <DialogTitle className="text-lg font-bold text-foreground">
            Integrity Scan Execution Details
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Check-by-check duration, inspection coverage, and findings recorded during this run.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-12 flex flex-col items-center justify-center gap-2 text-muted-foreground">
            <RefreshCw className="size-6 animate-spin text-primary" />
            <p className="text-xs">Loading execution metrics and per-check outcomes…</p>
          </div>
        ) : error ? (
          <div className="p-4 rounded-lg bg-rose-50 text-rose-800 text-xs">{error}</div>
        ) : detail ? (
          <div className="space-y-4 py-2">
            {/* Run Overview Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
              <div className="p-3 rounded-lg border border-border bg-card space-y-0.5">
                <span className="text-muted-foreground">Trigger</span>
                <p className="font-semibold text-foreground">{detail.trigger_type}</p>
              </div>
              <div className="p-3 rounded-lg border border-border bg-card space-y-0.5">
                <span className="text-muted-foreground">Scope</span>
                <p className="font-semibold text-foreground">
                  {detail.scope_module ? `Module: ${detail.scope_module}` : detail.scope_type}
                </p>
              </div>
              <div className="p-3 rounded-lg border border-border bg-card space-y-0.5">
                <span className="text-muted-foreground">Coverage</span>
                <p className="font-mono font-semibold text-foreground tabular-nums">
                  {detail.checks_completed}/{detail.checks_total} checks
                </p>
              </div>
              <div className="p-3 rounded-lg border border-border bg-card space-y-0.5">
                <span className="text-muted-foreground">Records Inspected</span>
                <p className="font-mono font-semibold text-foreground tabular-nums">
                  {detail.records_inspected}
                </p>
              </div>
            </div>

            {/* Error summary if partial / failed */}
            {detail.error_summary && (
              <div className="p-3.5 rounded-lg border border-rose-500/20 bg-rose-500/5 text-rose-800 dark:text-rose-300 text-xs space-y-1">
                <span className="font-semibold flex items-center gap-1.5">
                  <AlertCircle className="size-3.5" /> Scan Execution Notice
                </span>
                <p className="font-mono leading-relaxed">{detail.error_summary}</p>
              </div>
            )}

            {/* Per-Check Results Table */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Check Outcomes ({detail.checks.length})
              </h4>
              <div className="rounded-lg border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30">
                      <TableHead className="text-xs font-semibold">Check ID</TableHead>
                      <TableHead className="w-24 text-xs font-semibold">Status</TableHead>
                      <TableHead className="w-24 text-xs font-semibold text-right">Inspected</TableHead>
                      <TableHead className="w-24 text-xs font-semibold text-right">Findings</TableHead>
                      <TableHead className="w-24 text-xs font-semibold text-right">Duration</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detail.checks.map((c) => (
                      <TableRow key={c.check_id} className="text-xs">
                        <TableCell>
                          <div className="space-y-0.5">
                            <span className="font-mono font-medium text-foreground">{c.check_id}</span>
                            {c.error_summary && (
                              <p className="text-2xs text-rose-600 font-mono">{c.error_summary}</p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={c.status} />
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums">
                          {c.records_inspected}
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums font-semibold">
                          {c.findings_detected > 0 ? (
                            <span className="text-rose-600 dark:text-rose-400">
                              {c.findings_detected}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">0</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums text-muted-foreground">
                          {c.duration_ms ? `${c.duration_ms}ms` : '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>
        ) : null}

        <DialogFooter className="pt-2 border-t border-border">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="cursor-pointer"
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
