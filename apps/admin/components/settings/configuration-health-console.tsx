'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  HardDrive,
  HeartPulse,
  Info,
  Mail,
  RefreshCw,
  Server,
  Shield,
  Store,
  Truck,
} from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { SettingsNav } from '@/components/settings/settings-nav';
import { SettingStatusBadge } from '@/components/settings/setting-status-badge';
import { fetchApiData } from '@/lib/api';
import type {
  ConfigurationHealthIssueDto,
  ConfigurationHealthResponseDto,
} from '@maevelle/contracts';

export function ConfigurationHealthConsole() {
  const [data, setData] = useState<ConfigurationHealthResponseDto>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetchApiData<ConfigurationHealthResponseDto>('/admin/settings/health');
      if (res) setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load configuration health status.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  if (loading && !data) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-2 text-muted-foreground text-xs">
        <RefreshCw className="size-5 animate-spin text-primary" />
        <span>Auditing Configuration Health...</span>
      </div>
    );
  }

  const overall = data?.overallStatus ?? 'HEALTHY';
  const issues = data?.issues ?? [];
  const moduleStatuses = data?.moduleStatuses ?? {};

  const moduleIconMap: Record<string, any> = {
    email: Mail,
    media: HardDrive,
    storefront: Store,
    delivery: Truck,
    general: Server,
    security: Shield,
  };

  return (
    <div className="space-y-6 pb-20 max-w-5xl">
      <SettingsNav />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Configuration Health
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Authoritative readiness verification across business modules, external integrations, and delivery pipelines.
          </p>
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={loadData}
          disabled={loading}
          className="text-xs h-8 gap-1.5"
        >
          <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
          Run Health Audit
        </Button>
      </div>

      {error && (
        <div className="p-3 text-xs rounded-lg bg-destructive/10 text-destructive border border-destructive/20">
          {error}
        </div>
      )}

      {/* Overall Health Banner */}
      <div
        className={`p-5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
          overall === 'HEALTHY'
            ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-500/30 text-emerald-900 dark:text-emerald-200'
            : overall === 'NEEDS_ATTENTION'
              ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-500/30 text-amber-900 dark:text-amber-200'
              : 'bg-destructive/10 border-destructive/30 text-destructive'
        }`}
      >
        <div className="flex items-start gap-3">
          <div
            className={`flex size-10 items-center justify-center rounded-lg shrink-0 ${
              overall === 'HEALTHY'
                ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                : overall === 'NEEDS_ATTENTION'
                  ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                  : 'bg-destructive/15 text-destructive'
            }`}
          >
            {overall === 'HEALTHY' ? (
              <CheckCircle2 className="size-6" />
            ) : overall === 'NEEDS_ATTENTION' ? (
              <AlertTriangle className="size-6" />
            ) : (
              <AlertCircle className="size-6" />
            )}
          </div>
          <div className="space-y-0.5">
            <h2 className="text-base font-semibold">
              {overall === 'HEALTHY'
                ? 'Maevelle is Healthy & Fully Configured'
                : overall === 'NEEDS_ATTENTION'
                  ? 'Configuration Needs Operator Attention'
                  : 'Critical Configuration Blockers Detected'}
            </h2>
            <p className="text-xs opacity-90 leading-relaxed max-w-2xl">
              {overall === 'HEALTHY'
                ? 'All transactional providers, storage endpoints, brand domains, and operational parameters meet production prerequisites.'
                : overall === 'NEEDS_ATTENTION'
                  ? 'Some modules have optional warnings, test redirection rules, or non-critical configuration gaps.'
                  : 'Essential credentials or mandatory domain settings are missing. Affected customer-facing operations are paused.'}
            </p>
          </div>
        </div>

        <div className="shrink-0 self-end sm:self-center">
          <Badge
            variant="outline"
            className="text-xs font-mono font-semibold uppercase px-3 py-1 bg-background/60"
          >
            {overall === 'HEALTHY' ? '● Healthy' : overall === 'NEEDS_ATTENTION' ? '⚠ Attention' : '✖ Critical'}
          </Badge>
        </div>
      </div>

      {/* Domain Readiness Cards Grid */}
      <div>
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Module Readiness Overview
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {Object.entries(moduleStatuses).map(([modKey, modInfo]) => {
            const Icon = moduleIconMap[modKey] || Server;
            return (
              <div
                key={modKey}
                className="p-3 rounded-lg border border-border bg-card space-y-1.5 shadow-2xs"
              >
                <div className="flex items-center justify-between">
                  <Icon className="size-4 text-primary shrink-0" />
                  <SettingStatusBadge status={modInfo.status} />
                </div>
                <div className="pt-1">
                  <span className="text-xs font-semibold text-foreground block truncate">
                    {modInfo.label}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {modInfo.issueCount > 0 ? (
                      <strong className="text-amber-600 dark:text-amber-400">
                        {modInfo.issueCount} issue{modInfo.issueCount > 1 ? 's' : ''}
                      </strong>
                    ) : (
                      'All checks pass'
                    )}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Actionable Health Issues List */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Actionable Configuration Items ({issues.length})
          </h3>
          {data?.checkedAt && (
            <span className="text-[11px] text-muted-foreground">
              Last checked: {new Date(data.checkedAt).toLocaleTimeString()}
            </span>
          )}
        </div>

        {issues.length === 0 ? (
          <div className="p-8 rounded-xl border border-dashed border-border bg-muted/10 text-center space-y-2">
            <CheckCircle2 className="size-8 mx-auto text-emerald-600" />
            <p className="text-sm font-semibold text-foreground">Zero configuration issues detected</p>
            <p className="text-xs text-muted-foreground">
              All credentials, domains, URLs, and operational thresholds are operating normally.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {issues.map((issue) => (
              <div
                key={issue.id}
                className="p-4 rounded-xl border border-border bg-card flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xs"
              >
                <div className="flex items-start gap-3">
                  <div className="pt-0.5 shrink-0">
                    {issue.severity === 'BLOCKING' ? (
                      <AlertCircle className="size-5 text-destructive" />
                    ) : issue.severity === 'WARNING' ? (
                      <AlertTriangle className="size-5 text-amber-500" />
                    ) : (
                      <Info className="size-5 text-blue-500" />
                    )}
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-foreground">{issue.title}</span>
                      <Badge
                        variant="outline"
                        className={`text-[10px] uppercase font-mono py-0 ${
                          issue.severity === 'BLOCKING'
                            ? 'border-destructive text-destructive'
                            : issue.severity === 'WARNING'
                              ? 'border-amber-500 text-amber-600'
                              : 'border-blue-500 text-blue-600'
                        }`}
                      >
                        {issue.severity}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
                        • {issue.module}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {issue.description}
                    </p>
                  </div>
                </div>

                {issue.actionHref && (
                  <Link
                    href={issue.actionHref}
                    className={buttonVariants({ variant: 'outline', size: 'sm', className: 'text-xs h-8 shrink-0 gap-1.5' })}
                  >
                    {issue.actionLabel ?? 'Fix configuration'}
                    <ArrowRight className="size-3" />
                  </Link>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
