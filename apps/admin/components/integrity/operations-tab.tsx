'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  Activity,
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Cpu,
  Database,
  ExternalLink,
  Layers,
  RefreshCw,
  Server,
  Shield,
  ShieldAlert,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/status-badge';
import { PagePanel, PageSection } from '@/components/ui/page-shell';
import type { IntegrityOverviewDto } from '@/lib/integrity/types';

interface OperationsTabProps {
  overview: IntegrityOverviewDto | null;
  loading: boolean;
  onRefresh: () => void;
}

export function OperationsTab({
  overview,
  loading,
  onRefresh,
}: OperationsTabProps) {
  const queueHealth = overview?.queueHealth ?? {
    queuedRuns: 0,
    runningRuns: 0,
    failedRuns: 0,
  };

  const isWorkerHealthy = queueHealth.queuedRuns === 0 || queueHealth.runningRuns > 0;

  return (
    <div className="space-y-6">
      {/* 1. Architecture Distinction Notice */}
      <div className="rounded-xl border border-border bg-card p-5 text-xs space-y-2">
        <div className="flex items-center gap-2 font-bold text-foreground text-sm">
          <Activity className="size-4 text-primary" />
          Integrity Engine Operational Visibility
        </div>
        <p className="text-muted-foreground leading-relaxed max-w-3xl">
          This workspace distinguishes <strong>operational execution health</strong> (queue status, background worker leases, scanner availability) from <strong>business data consistency</strong> (financial or inventory balance). A healthy worker can detect inconsistent data, and consistent data can exist even if a background worker is temporarily restarting.
        </p>
      </div>

      {/* 2. Operational Health Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <PagePanel className="p-4 sm:p-5 space-y-1">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium">Scan Queue Backlog</span>
            <Layers className="size-4 text-primary" />
          </div>
          <p className="text-2xl sm:text-3xl font-bold tracking-tight font-mono tabular-nums text-foreground">
            {queueHealth.queuedRuns}
          </p>
          <p className="text-xs text-muted-foreground">
            {queueHealth.queuedRuns === 0
              ? 'No pending scans awaiting worker claim'
              : `${queueHealth.queuedRuns} scan waiting for worker execution`}
          </p>
        </PagePanel>

        <PagePanel className="p-4 sm:p-5 space-y-1">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium">Active Concurrent Scans</span>
            <Activity className="size-4 text-sky-500" />
          </div>
          <p className="text-2xl sm:text-3xl font-bold tracking-tight font-mono tabular-nums text-foreground">
            {queueHealth.runningRuns}
          </p>
          <p className="text-xs text-muted-foreground">
            {queueHealth.runningRuns === 0
              ? 'Worker idle / no scans running'
              : 'Scan currently executing with renewable lease'}
          </p>
        </PagePanel>

        <PagePanel className="p-4 sm:p-5 space-y-1">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium">Interrupted / Failed Runs</span>
            <AlertCircle className="size-4 text-rose-500" />
          </div>
          <p className="text-2xl sm:text-3xl font-bold tracking-tight font-mono tabular-nums text-foreground">
            {queueHealth.failedRuns}
          </p>
          <p className="text-xs text-muted-foreground">
            {queueHealth.failedRuns === 0
              ? 'No expired worker leases or aborts'
              : 'Runs with expired lease or execution errors'}
          </p>
        </PagePanel>
      </div>

      {/* 3. Worker Execution Model & Recovery Controls */}
      <PageSection
        title="Durable Execution Engine"
        description="Integrity scans utilize PostgreSQL SKIP LOCKED concurrency claims with 10-minute renewable leases."
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <PagePanel className="p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Server className="size-4 text-primary" />
              <h4 className="text-sm font-bold text-foreground">Worker Lease & Recovery Policy</h4>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              If a Worker crashes mid-scan, the lease expires after 10 minutes. The next worker pass automatically transitions the expired scan to <code className="font-mono font-semibold">INTERRUPTED</code> without losing partial findings or falsely reporting clean health.
            </p>
            <div className="pt-2">
              <Button
                variant="outline"
                size="sm"
                render={
                  <Link href="/operations">
                    View General Operations Dashboard
                    <ExternalLink className="size-3 ml-1.5" />
                  </Link>
                }
                className="h-8 text-xs cursor-pointer"
              />
            </div>
          </PagePanel>

          <PagePanel className="p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Database className="size-4 text-primary" />
              <h4 className="text-sm font-bold text-foreground">Cross-Cutting Recovery Evidence</h4>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              System Integrity monitors dead-letter jobs, failed outbox consumer receipts, and external operations with unknown outcomes (<code className="font-mono">UNKNOWN_OUTCOME</code>).
            </p>
            <div className="pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={onRefresh}
                disabled={loading}
                className="h-8 text-xs"
              >
                <RefreshCw className={`size-3 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
                Refresh Operational Diagnostics
              </Button>
            </div>
          </PagePanel>
        </div>
      </PageSection>
    </div>
  );
}
