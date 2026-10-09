'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Layers,
  Play,
  RefreshCw,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Wrench,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/status-badge';
import { PagePanel, PageSection } from '@/components/ui/page-shell';
import type {
  IntegrityModuleSummaryDto,
  IntegrityOverviewDto,
  IntegrityFindingListItemDto,
} from '@/lib/integrity/types';

interface OverviewTabProps {
  overview: IntegrityOverviewDto | null;
  loading: boolean;
  onRefresh: () => void;
  onSelectTab: (tab: any, filterParams?: Record<string, string>) => void;
  onOpenFinding: (finding: IntegrityFindingListItemDto) => void;
  onOpenLauncher: () => void;
  canRunChecks: boolean;
}

export function OverviewTab({
  overview,
  loading,
  onRefresh,
  onSelectTab,
  onOpenFinding,
  onOpenLauncher,
  canRunChecks,
}: OverviewTabProps) {
  if (loading && !overview) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3 text-muted-foreground">
        <RefreshCw className="size-6 animate-spin text-primary" />
        <p className="text-sm">Assessing platform integrity condition...</p>
      </div>
    );
  }

  if (!overview) {
    return (
      <PagePanel className="p-8 text-center space-y-4">
        <ShieldAlert className="size-10 text-muted-foreground mx-auto" />
        <h3 className="text-lg font-semibold text-foreground">Integrity overview unavailable</h3>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          Unable to retrieve the system integrity assessment. Please refresh or verify API connectivity.
        </p>
        <Button variant="outline" onClick={onRefresh}>
          <RefreshCw className="size-4 mr-2" />
          Retry assessment
        </Button>
      </PagePanel>
    );
  }

  const { overallStatus, latestRun, activeRun, checksSummary, findingsCounts, modules, recentFindings } = overview;

  // Status configuration mapping
  const statusConfig = {
    HEALTHY_IN_COMPLETED_CHECKS: {
      badgeText: 'Verified Consistent in Completed Checks',
      tone: 'success' as const,
      icon: ShieldCheck,
      headline: 'No discrepancies detected in completed checks',
      description:
        latestRun
          ? `The last scan evaluated ${latestRun.checks_completed} checks across ${latestRun.records_inspected} records with zero findings.`
          : 'All completed checks have passed without recorded discrepancies.',
      bgColor: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300',
    },
    CRITICAL_ISSUES_DETECTED: {
      badgeText: 'Critical Inconsistencies Detected',
      tone: 'danger' as const,
      icon: ShieldAlert,
      headline: `${findingsCounts.critical} critical ${findingsCounts.critical === 1 ? 'issue requires' : 'issues require'} immediate attention`,
      description:
        'Authoritative business invariants have reported discrepancies affecting financial, commerce, or transactional integrity.',
      bgColor: 'bg-rose-500/10 border-rose-500/30 text-rose-700 dark:text-rose-300',
    },
    ATTENTION_REQUIRED: {
      badgeText: 'Attention Required',
      tone: 'warning' as const,
      icon: AlertTriangle,
      headline: `${findingsCounts.totalOpen} open ${findingsCounts.totalOpen === 1 ? 'finding' : 'findings'} detected`,
      description:
        'One or more checks identified discrepancies or projection drift that should be investigated.',
      bgColor: 'bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-300',
    },
    CHECKS_INCOMPLETE: {
      badgeText: 'Checks Incomplete',
      tone: 'warning' as const,
      icon: AlertCircle,
      headline: 'Last scan did not fully complete',
      description:
        latestRun?.error_summary
          ? `The scan concluded with partial coverage: ${latestRun.error_summary}`
          : 'Some integrity checks failed or were interrupted during execution. Full platform health cannot be guaranteed.',
      bgColor: 'bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-300',
    },
    SCAN_IN_PROGRESS: {
      badgeText: 'Scan In Progress',
      tone: 'info' as const,
      icon: RefreshCw,
      headline: 'An integrity scan is actively executing',
      description:
        'A scheduled or manual integrity scan is currently processing platform records. Results will refresh upon completion.',
      bgColor: 'bg-sky-500/10 border-sky-500/30 text-sky-700 dark:text-sky-300',
    },
    NOT_ASSESSED: {
      badgeText: 'Not Yet Assessed',
      tone: 'neutral' as const,
      icon: Shield,
      headline: 'No historical scans recorded',
      description:
        'Integrity checks have not yet completed for this organization. Run an initial scan to assess platform state.',
      bgColor: 'bg-slate-500/10 border-slate-500/30 text-slate-700 dark:text-slate-300',
    },
  }[overallStatus];

  const StatusIcon = statusConfig.icon;

  return (
    <div className="space-y-6">
      {/* 1. Authoritative Assessed State Banner */}
      <div className={`rounded-xl border p-5 sm:p-6 ${statusConfig.bgColor} transition-colors`}>
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="rounded-lg p-2.5 bg-background/80 shadow-2xs shrink-0">
              <StatusIcon className="size-6 text-foreground" />
            </div>
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={statusConfig.badgeText} tone={statusConfig.tone} />
                {latestRun?.completed_at ? (
                  <span className="text-xs text-muted-foreground">
                    Last evaluated: {new Date(latestRun.completed_at).toLocaleString('en-BD')}
                  </span>
                ) : null}
              </div>
              <h2 className="text-lg sm:text-xl font-bold tracking-tight text-foreground">
                {statusConfig.headline}
              </h2>
              <p className="text-sm opacity-90 max-w-2xl leading-relaxed text-foreground/80">
                {statusConfig.description}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 shrink-0 self-end sm:self-start">
            <Button
              variant="outline"
              size="sm"
              onClick={onRefresh}
              disabled={loading}
              className="bg-background/80 hover:bg-background"
            >
              <RefreshCw className={`size-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            {canRunChecks && (
              <Button size="sm" onClick={onOpenLauncher} className="cursor-pointer">
                <Play className="size-3.5 mr-1.5" />
                Run Integrity Scan
              </Button>
            )}
          </div>
        </div>

        {/* Active Scan progress callout if active */}
        {activeRun && (
          <div className="mt-4 pt-4 border-t border-border/50 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 text-foreground font-medium">
              <RefreshCw className="size-3.5 animate-spin text-primary" />
              <span>
                Active scan: {activeRun.scope_module ? `Module: ${activeRun.scope_module}` : 'Full organization'}
              </span>
              <span className="font-mono text-muted-foreground">({activeRun.status})</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-primary"
              onClick={() => onSelectTab('scans')}
            >
              Monitor live progress
              <ArrowRight className="size-3 ml-1" />
            </Button>
          </div>
        )}
      </div>

      {/* 2. Key Metrics Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <PagePanel className="p-4 sm:p-5 space-y-1.5">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium">Open Findings</span>
            <AlertCircle className="size-4 text-amber-500" />
          </div>
          <p className="text-2xl sm:text-3xl font-bold tracking-tight font-mono tabular-nums text-foreground">
            {findingsCounts.totalOpen}
          </p>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {findingsCounts.critical > 0 ? (
              <span className="text-rose-600 font-semibold">{findingsCounts.critical} critical</span>
            ) : (
              <span>0 critical</span>
            )}
            <span>·</span>
            <span>{findingsCounts.error} errors</span>
          </div>
        </PagePanel>

        <PagePanel className="p-4 sm:p-5 space-y-1.5">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium">Checks Catalog</span>
            <Layers className="size-4 text-primary" />
          </div>
          <p className="text-2xl sm:text-3xl font-bold tracking-tight font-mono tabular-nums text-foreground">
            {checksSummary.total}
          </p>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{checksSummary.nightlyCount} nightly</span>
            <span>·</span>
            <span>{checksSummary.frequentCount} hourly</span>
          </div>
        </PagePanel>

        <PagePanel className="p-4 sm:p-5 space-y-1.5">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium">Last Scan Coverage</span>
            <Activity className="size-4 text-sky-500" />
          </div>
          <p className="text-2xl sm:text-3xl font-bold tracking-tight font-mono tabular-nums text-foreground">
            {latestRun ? `${latestRun.checks_completed}/${latestRun.checks_total}` : '0/0'}
          </p>
          <div className="text-xs text-muted-foreground truncate">
            {latestRun
              ? `${latestRun.records_inspected} records evaluated`
              : 'No execution records'}
          </div>
        </PagePanel>

        <PagePanel className="p-4 sm:p-5 space-y-1.5">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-xs font-medium">Resolution History</span>
            <CheckCircle2 className="size-4 text-emerald-500" />
          </div>
          <p className="text-2xl sm:text-3xl font-bold tracking-tight font-mono tabular-nums text-foreground">
            {findingsCounts.resolved}
          </p>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{findingsCounts.accepted} accepted</span>
            <span>·</span>
            <span className="text-primary font-medium">{checksSummary.repairableCount} repairable</span>
          </div>
        </PagePanel>
      </div>

      {/* 3. Action Required / Recent Findings Section */}
      <PageSection
        title="Needs Attention"
        description="Active findings prioritized by severity. Direct investigation and recovery workflows are available."
        actions={
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onSelectTab('findings')}
            className="text-xs font-medium text-primary"
          >
            View all ({findingsCounts.totalOpen})
            <ArrowRight className="size-3.5 ml-1" />
          </Button>
        }
      >
        {recentFindings.length === 0 ? (
          <PagePanel className="p-8 text-center space-y-2">
            <CheckCircle2 className="size-8 text-emerald-500 mx-auto" />
            <h4 className="text-sm font-semibold text-foreground">No open findings requiring attention</h4>
            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
              All checks in the most recent scan completed without surfacing unresolved discrepancies.
            </p>
          </PagePanel>
        ) : (
          <div className="space-y-2.5">
            {recentFindings.map((finding) => (
              <div
                key={finding.id}
                onClick={() => onOpenFinding(finding)}
                className="group flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl border border-border bg-card hover:bg-muted/40 transition-colors cursor-pointer"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <div className="mt-0.5 shrink-0">
                    <StatusBadge status={finding.severity} />
                  </div>
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
                        {finding.summary}
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground font-mono">
                        {finding.domain}
                      </span>
                      {finding.repairability === 'REBUILDABLE_PROJECTION' && (
                        <span className="text-2xs px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium flex items-center gap-1">
                          <Wrench className="size-2.5" />
                          Repairable
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span>Code: <code className="font-mono">{finding.code}</code></span>
                      {finding.occurrence_count > 1 && (
                        <span className="font-mono tabular-nums text-amber-600 dark:text-amber-400">
                          Seen {finding.occurrence_count} times
                        </span>
                      )}
                      <span>
                        Last detected: {new Date(finding.last_detected_at).toLocaleString('en-BD')}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs group-hover:border-primary/50"
                  >
                    Investigate
                    <ArrowRight className="size-3 ml-1" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </PageSection>

      {/* 4. Domain / Module Integrity Grid */}
      <PageSection
        title="Domain Coverage & Module Health"
        description="Integrity status broken down by business domain. Click any module to filter its findings or run targeted checks."
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
          {modules.map((mod) => {
            const hasIssues = mod.openFindingsCount > 0;
            const isCritical = mod.criticalCount > 0;

            return (
              <div
                key={mod.module}
                onClick={() => onSelectTab('findings', { module: mod.module })}
                className="group flex flex-col justify-between p-4 rounded-xl border border-border bg-card hover:border-primary/40 hover:bg-muted/20 transition-colors cursor-pointer"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-foreground group-hover:text-primary transition-colors">
                      {mod.module}
                    </span>
                    <StatusBadge
                      status={
                        isCritical
                          ? 'CRITICAL'
                          : hasIssues
                            ? 'ATTENTION'
                            : latestRun
                              ? 'HEALTHY'
                              : 'NOT_RUN'
                      }
                    />
                  </div>
                  <div className="space-y-1 text-xs text-muted-foreground">
                    <div className="flex items-center justify-between">
                      <span>Registered checks:</span>
                      <span className="font-mono font-medium text-foreground">{mod.checkCount}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span>Open findings:</span>
                      <span
                        className={`font-mono font-bold ${
                          isCritical
                            ? 'text-rose-600 dark:text-rose-400'
                            : hasIssues
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-foreground'
                        }`}
                      >
                        {mod.openFindingsCount}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-border/60 flex items-center justify-between text-2xs text-muted-foreground">
                  <span>
                    {mod.lastDetectedAt
                      ? `Last finding: ${new Date(mod.lastDetectedAt).toLocaleDateString()}`
                      : 'Clean record'}
                  </span>
                  <span className="text-primary font-medium group-hover:translate-x-0.5 transition-transform flex items-center">
                    Explore
                    <ArrowRight className="size-2.5 ml-0.5" />
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </PageSection>
    </div>
  );
}
