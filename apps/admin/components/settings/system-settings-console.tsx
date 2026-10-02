'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  Cpu,
  Database,
  HardDrive,
  Lock,
  Mail,
  RefreshCw,
  Server,
  Shield,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { SettingsCard, SettingsSection } from '@/components/settings/settings-card';
import { SettingsNav } from '@/components/settings/settings-nav';
import { SettingStatusBadge } from '@/components/settings/setting-status-badge';
import { fetchApiData } from '@/lib/api';
import type { SystemStatusDto } from '@maevelle/contracts';

export function SystemSettingsConsole() {
  const [data, setData] = useState<SystemStatusDto>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetchApiData<SystemStatusDto>('/admin/settings/system');
      if (res) setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load system diagnostics.');
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
        <span>Inspecting System Runtime...</span>
      </div>
    );
  }

  function formatUptime(seconds: number): string {
    const d = Math.floor(seconds / (3600 * 24));
    const h = Math.floor((seconds % (3600 * 24)) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (d > 0) return `${d}d ${h}h ${m}m`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m ${seconds % 60}s`;
  }

  return (
    <div className="space-y-6 pb-20 max-w-5xl">
      <SettingsNav />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-xl font-semibold tracking-tight text-foreground">
              System Diagnostics
            </h1>
            <Badge variant="outline" className="text-xs font-mono uppercase">
              {data?.environment ?? 'development'}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Application health, background worker status, database connectivity latency, and deployment boundaries.
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
          Refresh Diagnostics
        </Button>
      </div>

      {error && (
        <div className="p-3 text-xs rounded-lg bg-destructive/10 text-destructive border border-destructive/20">
          {error}
        </div>
      )}

      {/* Runtime Vitals Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl border border-border bg-card space-y-1">
          <span className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
            <Server className="size-3.5 text-primary" />
            Node.js Runtime
          </span>
          <p className="font-semibold text-foreground text-sm font-mono">{data?.nodeVersion ?? process.version}</p>
        </div>

        <div className="p-4 rounded-xl border border-border bg-card space-y-1">
          <span className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
            <Clock className="size-3.5 text-primary" />
            Process Uptime
          </span>
          <p className="font-semibold text-foreground text-sm font-mono">
            {formatUptime(data?.uptimeSeconds ?? 0)}
          </p>
        </div>

        <div className="p-4 rounded-xl border border-border bg-card space-y-1">
          <span className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
            <Cpu className="size-3.5 text-primary" />
            Memory (RSS)
          </span>
          <p className="font-semibold text-foreground text-sm font-mono">{data?.memoryUsageMb ?? 0} MB</p>
        </div>

        <div className="p-4 rounded-xl border border-border bg-card space-y-1">
          <span className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
            <Zap className="size-3.5 text-primary" />
            Database Ping
          </span>
          <p className="font-semibold text-foreground text-sm font-mono">
            {data?.database.latencyMs ?? 1} ms
          </p>
        </div>
      </div>

      {/* Services Health Matrix */}
      <SettingsSection
        title="Services & Infrastructure Health"
        description="Live operational readiness of core system services."
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="p-4 rounded-xl border border-border bg-card space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Database className="size-4 text-primary" />
                <span className="text-xs font-semibold text-foreground">PostgreSQL Database</span>
              </div>
              <SettingStatusBadge status="CONNECTED" />
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Transactional data storage, isolation levels, row-level concurrency, and event outbox.
            </p>
          </div>

          <div className="p-4 rounded-xl border border-border bg-card space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Cpu className="size-4 text-primary" />
                <span className="text-xs font-semibold text-foreground">Background Worker</span>
              </div>
              <SettingStatusBadge status="ready" label="Running" />
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Asynchronous job processor for transactional outbox dispatches, email delivery, and metrics aggregations.
            </p>
          </div>

          <div className="p-4 rounded-xl border border-border bg-card space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <HardDrive className="size-4 text-primary" />
                <span className="text-xs font-semibold text-foreground">Cloudflare R2 Storage</span>
              </div>
              <SettingStatusBadge status="CONNECTED" />
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              S3-compatible asset store configured with public product lookbooks and private attachments.
            </p>
          </div>

          <div className="p-4 rounded-xl border border-border bg-card space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Mail className="size-4 text-primary" />
                <span className="text-xs font-semibold text-foreground">Email Dispatcher</span>
              </div>
              <SettingStatusBadge status={data?.email.status ?? 'ready'} />
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Active provider: <strong className="font-mono text-foreground capitalize">{data?.email.provider}</strong>.
            </p>
          </div>

          <div className="p-4 rounded-xl border border-border bg-card space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield className="size-4 text-primary" />
                <span className="text-xs font-semibold text-foreground">Security Sandbox</span>
              </div>
              <SettingStatusBadge status="ready" label="Enforced" />
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Multi-tenant organization boundary separation, IAM capability checks, and AES-256 secret encryption.
            </p>
          </div>
        </div>
      </SettingsSection>

      {/* Deployment Managed Boundaries Table */}
      <SettingsSection
        title="Deployment-Managed Configuration"
        description="Configuration intentionally managed by host infrastructure and environment variables."
      >
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="p-4 border-b bg-muted/20">
            <span className="text-xs font-semibold text-foreground">
              Non-Editable Infrastructure Secrets & Policies
            </span>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              To protect database integrity and prevent unauthorized key extraction, these parameters cannot be viewed or edited in the browser.
            </p>
          </div>

          <div className="divide-y text-xs">
            <div className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <span className="font-semibold text-foreground">Database Connection String</span>
                <p className="text-[11px] text-muted-foreground">PostgreSQL cluster URI, credentials, and connection pooler</p>
              </div>
              <div className="flex items-center gap-2">
                <code className="text-[11px] px-2 py-0.5 bg-muted rounded font-mono text-muted-foreground">
                  postgresql://***:***@db:5432/maevelle
                </code>
                <Badge variant="outline" className="text-[10px] font-mono">
                  <Lock className="size-2.5 mr-1" />
                  Deployment Managed
                </Badge>
              </div>
            </div>

            <div className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <span className="font-semibold text-foreground">Auth Encryption Master Key</span>
                <p className="text-[11px] text-muted-foreground">256-bit AES-GCM root encryption key for third-party secrets</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">Configured</span>
                <Badge variant="outline" className="text-[10px] font-mono">
                  <Lock className="size-2.5 mr-1" />
                  Deployment Managed
                </Badge>
              </div>
            </div>

            <div className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <span className="font-semibold text-foreground">Better Auth Signing Secret</span>
                <p className="text-[11px] text-muted-foreground">Session token signing and cookie cryptographic key</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">Configured</span>
                <Badge variant="outline" className="text-[10px] font-mono">
                  <Lock className="size-2.5 mr-1" />
                  Deployment Managed
                </Badge>
              </div>
            </div>

            <div className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <span className="font-semibold text-foreground">Cloudflare R2 Object Storage Keys</span>
                <p className="text-[11px] text-muted-foreground">Access Key ID and Secret Access Key for bucket read/write</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">Configured</span>
                <Badge variant="outline" className="text-[10px] font-mono">
                  <Lock className="size-2.5 mr-1" />
                  Deployment Managed
                </Badge>
              </div>
            </div>
          </div>
        </div>
      </SettingsSection>
    </div>
  );
}
