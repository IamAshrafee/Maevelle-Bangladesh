'use client';

import * as React from 'react';
import {
  Activity,
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Layers,
  Play,
  RefreshCw,
  ShieldAlert,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/status-badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { PagePanel, PageSection } from '@/components/ui/page-shell';
import { RunDetailDialog } from './run-detail-dialog';
import { cancelIntegrityRun } from '@/lib/integrity/api';
import type { IntegrityRunDto } from '@/lib/integrity/types';

interface ScansTabProps {
  runs: readonly IntegrityRunDto[];
  activeRun: IntegrityRunDto | null;
  totalItems: number;
  totalPages: number;
  currentPage: number;
  loading: boolean;
  onPageChange: (page: number) => void;
  onRefresh: () => void;
  onOpenLauncher: () => void;
  canRunChecks: boolean;
}

export function ScansTab({
  runs,
  activeRun,
  totalItems,
  totalPages,
  currentPage,
  loading,
  onPageChange,
  onRefresh,
  onOpenLauncher,
  canRunChecks,
}: ScansTabProps) {
  const [selectedRunId, setSelectedRunId] = React.useState<string | null>(null);
  const [cancelling, setCancelling] = React.useState(false);

  // Auto-polling for active scan
  React.useEffect(() => {
    if (!activeRun) return;

    const interval = setInterval(() => {
      onRefresh();
    }, 3000);

    return () => clearInterval(interval);
  }, [activeRun?.id, activeRun?.status, onRefresh]);

  const handleCancel = async (runId: string) => {
    setCancelling(true);
    try {
      await cancelIntegrityRun(runId);
      onRefresh();
    } catch {
      // Ignored
    } finally {
      setCancelling(false);
    }
  };

  const formatDuration = (start: string | null, end: string | null) => {
    if (!start || !end) return '—';
    const ms = new Date(end).getTime() - new Date(start).getTime();
    if (ms < 1000) return `${ms}ms`;
    const sec = (ms / 1000).toFixed(1);
    return `${sec}s`;
  };

  return (
    <div className="space-y-6">
      {/* 1. Active Scan Tracker (if running/queued) */}
      {activeRun && (
        <div className="p-5 rounded-xl border border-sky-500/30 bg-sky-500/5 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="rounded-lg p-2 bg-background shrink-0">
                <RefreshCw className="size-5 animate-spin text-primary" />
              </div>
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-foreground">
                    Active Integrity Scan in Progress
                  </span>
                  <StatusBadge status={activeRun.status} />
                </div>
                <p className="text-xs text-muted-foreground">
                  Scope: <strong className="text-foreground">{activeRun.scope_module ? `Module: ${activeRun.scope_module}` : 'Full Organization'}</strong> · Trigger:{' '}
                  <span className="font-mono">{activeRun.trigger_type}</span>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {activeRun.status === 'QUEUED' && canRunChecks && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleCancel(activeRun.id)}
                  disabled={cancelling}
                  className="h-8 text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                >
                  <X className="size-3.5 mr-1" />
                  Cancel Queued Scan
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedRunId(activeRun.id)}
                className="h-8 text-xs cursor-pointer"
              >
                Inspect Live Checks
              </Button>
            </div>
          </div>

          {/* Progress row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-sky-500/20 text-xs">
            <div>
              <span className="text-muted-foreground">Checks Completed:</span>{' '}
              <strong className="font-mono text-foreground">
                {activeRun.checks_completed} / {activeRun.checks_total}
              </strong>
            </div>
            <div>
              <span className="text-muted-foreground">Checks Failed:</span>{' '}
              <strong className="font-mono text-foreground">{activeRun.checks_failed}</strong>
            </div>
            <div>
              <span className="text-muted-foreground">Records Inspected:</span>{' '}
              <strong className="font-mono text-foreground">{activeRun.records_inspected}</strong>
            </div>
            <div>
              <span className="text-muted-foreground">Findings Detected:</span>{' '}
              <strong className="font-mono text-rose-600 dark:text-rose-400 font-semibold">
                {activeRun.findings_detected}
              </strong>
            </div>
          </div>
        </div>
      )}

      {/* 2. Controls & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-foreground">Scan Execution History</h3>
          <p className="text-xs text-muted-foreground">
            Authoritative audit trail of scheduled, manual, and recovery verification scans.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={onRefresh} disabled={loading} className="h-8 text-xs">
            <RefreshCw className={`size-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh History
          </Button>
          {canRunChecks && (
            <Button size="sm" onClick={onOpenLauncher} className="h-8 text-xs cursor-pointer">
              <Play className="size-3.5 mr-1.5" />
              Launch Scan
            </Button>
          )}
        </div>
      </div>

      {/* 3. History Table */}
      <PagePanel className="p-0 overflow-hidden border border-border">
        {loading && runs.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center gap-2 text-muted-foreground">
            <RefreshCw className="size-6 animate-spin text-primary" />
            <p className="text-xs">Loading execution history…</p>
          </div>
        ) : runs.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <Clock className="size-8 text-muted-foreground mx-auto" />
            <h4 className="text-sm font-semibold text-foreground">No historical runs recorded</h4>
            <p className="text-xs text-muted-foreground">
              Integrity scans will appear here once executed.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40">
                  <TableHead className="w-24 text-xs font-semibold">Status</TableHead>
                  <TableHead className="text-xs font-semibold">Run ID / Scope</TableHead>
                  <TableHead className="w-24 text-xs font-semibold">Trigger</TableHead>
                  <TableHead className="w-28 text-xs font-semibold text-center">Coverage</TableHead>
                  <TableHead className="w-28 text-xs font-semibold text-right">Inspected</TableHead>
                  <TableHead className="w-24 text-xs font-semibold text-right">Findings</TableHead>
                  <TableHead className="w-28 text-xs font-semibold">Duration</TableHead>
                  <TableHead className="w-36 text-xs font-semibold">Executed At</TableHead>
                  <TableHead className="w-20 text-xs font-semibold text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map((run) => (
                  <TableRow
                    key={run.id}
                    className="hover:bg-muted/30 cursor-pointer transition-colors"
                    onClick={() => setSelectedRunId(run.id)}
                  >
                    <TableCell>
                      <StatusBadge status={run.status} />
                    </TableCell>
                    <TableCell>
                      <div className="space-y-0.5">
                        <span className="font-mono text-xs text-foreground font-semibold">
                          {run.id.slice(0, 8)}…
                        </span>
                        <p className="text-2xs text-muted-foreground">
                          {run.scope_module ? `Module: ${run.scope_module}` : run.scope_type}
                        </p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs font-mono px-2 py-0.5 rounded bg-muted text-muted-foreground">
                        {run.trigger_type}
                      </span>
                    </TableCell>
                    <TableCell className="text-center font-mono text-xs tabular-nums">
                      {run.checks_completed}/{run.checks_total}
                      {run.checks_failed > 0 && (
                        <span className="text-2xs text-rose-600 block">
                          ({run.checks_failed} failed)
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs tabular-nums">
                      {run.records_inspected}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs tabular-nums font-semibold">
                      {run.findings_detected > 0 ? (
                        <span className="text-rose-600 dark:text-rose-400">
                          {run.findings_detected}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">0</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground font-mono tabular-nums">
                      {formatDuration(run.started_at, run.completed_at)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {run.created_at ? new Date(run.created_at).toLocaleString('en-BD') : '—'}
                    </TableCell>
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs px-2 cursor-pointer"
                        onClick={() => setSelectedRunId(run.id)}
                      >
                        Inspect
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 border-t border-border bg-card">
            <p className="text-xs text-muted-foreground">
              Showing page <span className="font-mono font-medium text-foreground">{currentPage}</span> of{' '}
              <span className="font-mono font-medium text-foreground">{totalPages}</span> ({totalItems} total runs)
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onPageChange(currentPage - 1)}
                disabled={currentPage <= 1 || loading}
                className="h-8 text-xs cursor-pointer"
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onPageChange(currentPage + 1)}
                disabled={currentPage >= totalPages || loading}
                className="h-8 text-xs cursor-pointer"
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </PagePanel>

      {/* Run Detail Modal */}
      <RunDetailDialog
        runId={selectedRunId}
        open={Boolean(selectedRunId)}
        onOpenChange={(isOpen) => !isOpen && setSelectedRunId(null)}
      />
    </div>
  );
}
