'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  CreditCard,
  HardDrive,
  Lock,
  Mail,
  RefreshCw,
  Truck,
} from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { SettingsNav } from '@/components/settings/settings-nav';
import { SettingStatusBadge } from '@/components/settings/setting-status-badge';
import { fetchApiData } from '@/lib/api';
import type { IntegrationSummaryDto, MediaRuntimeDto } from '@maevelle/contracts';

export function IntegrationsHub() {
  const [integrations, setIntegrations] = useState<readonly IntegrationSummaryDto[]>([]);
  const [mediaRuntime, setMediaRuntime] = useState<MediaRuntimeDto>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [res, runtime] = await Promise.all([
        fetchApiData<readonly IntegrationSummaryDto[]>('/admin/settings/integrations'),
        fetchApiData<MediaRuntimeDto>('/admin/settings/media/runtime'),
      ]);
      if (res) setIntegrations(res);
      if (runtime) setMediaRuntime(runtime);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load integrations list.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  if (loading && integrations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-2 text-muted-foreground text-xs">
        <RefreshCw className="size-5 animate-spin text-primary" />
        <span>Loading Integrations...</span>
      </div>
    );
  }

  const resend = integrations.find((i) => i.providerCode === 'RESEND');
  const pathao = integrations.find((i) => i.providerCode === 'PATHAO');

  return (
    <div className="space-y-6 pb-20 max-w-5xl">
      <SettingsNav />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Integrations</h1>
          <p className="text-xs text-muted-foreground mt-1">
            External provider configuration and the active media storage backend.
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
          Refresh Status
        </Button>
      </div>

      {error && (
        <div className="p-3 text-xs rounded-lg bg-destructive/10 text-destructive border border-destructive/20">
          {error}
        </div>
      )}

      {/* Primary Integration Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {/* 1. Resend */}
        <div className="flex flex-col justify-between p-5 rounded-xl border border-border bg-card shadow-xs hover:border-primary/40 transition-colors space-y-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Mail className="size-5" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-foreground">Resend</h2>
                  <span className="text-[11px] text-muted-foreground">Email Delivery</span>
                </div>
              </div>
              <SettingStatusBadge status={resend?.status ?? 'NEEDS_CONFIGURATION'} />
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed">
              Automated transactional email notifications, delivery tracking webhooks, and deliverability protection.
            </p>

            <div className="pt-2 border-t space-y-1 text-xs">
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>Used by:</span>
                <span className="font-medium text-foreground">Email Operations</span>
              </div>
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>Credentials:</span>
                <span className="font-mono text-foreground">
                  {resend?.secrets.filter((s) => s.configured).length ?? 0} of {resend?.secrets.length ?? 2} configured
                </span>
              </div>
            </div>
          </div>

          <Link
            href="/settings/integrations/resend"
            className={buttonVariants({ size: 'sm', className: 'w-full text-xs h-8 gap-1.5 font-medium mt-2' })}
          >
            Manage Integration
            <ArrowRight className="size-3.5" />
          </Link>
        </div>

        {/* 2. Pathao Courier */}
        <div className="flex flex-col justify-between p-5 rounded-xl border border-border bg-card shadow-xs hover:border-primary/40 transition-colors space-y-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="flex size-9 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600">
                  <Truck className="size-5" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-foreground">Pathao Courier</h2>
                  <span className="text-[11px] text-muted-foreground">Logistics & Parcel Dispatch</span>
                </div>
              </div>
              <SettingStatusBadge status={pathao?.status ?? 'CONNECTED'} />
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed">
              Nationwide doorstep delivery, instant parcel consignment, tracking webhooks, and COD settlements.
            </p>

            <div className="pt-2 border-t space-y-1 text-xs">
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>Used by:</span>
                <span className="font-medium text-foreground">Delivery & Couriers</span>
              </div>
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>Webhook Integration:</span>
                <span className="font-mono text-success font-medium">Active</span>
              </div>
            </div>
          </div>

          <Link
            href="/delivery/couriers"
            className={buttonVariants({ variant: 'outline', size: 'sm', className: 'w-full text-xs h-8 gap-1.5 font-medium mt-2' })}
          >
            Configure Couriers
            <ArrowRight className="size-3.5" />
          </Link>
        </div>

        {/* 3. Active storage backend */}
        <div className="flex flex-col justify-between p-5 rounded-xl border border-border bg-card shadow-xs hover:border-primary/40 transition-colors space-y-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="flex size-9 items-center justify-center rounded-lg bg-warning/10 text-warning">
                  <HardDrive className="size-5" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-foreground">{mediaRuntime?.storageLabel ?? 'Storage backend'}</h2>
                  <span className="text-[11px] text-muted-foreground">Object Storage</span>
                </div>
              </div>
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded border border-border">
                <Lock className="size-2.5" />
                Deployment Managed
              </span>
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed">
              Active media storage backend selected by deployment configuration. Live connectivity is checked in the Media Library.
            </p>

            <div className="pt-2 border-t space-y-1 text-xs">
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>Used by:</span>
                <span className="font-medium text-foreground">Media Library</span>
              </div>
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>Backend:</span>
                <span className="font-mono text-foreground font-medium">{mediaRuntime?.storageProvider === 'local' ? 'Local volume' : 'S3-compatible'}</span>
              </div>
            </div>
          </div>

          <Link
            href="/media/settings"
            className={buttonVariants({ variant: 'outline', size: 'sm', className: 'w-full text-xs h-8 gap-1.5 font-medium mt-2' })}
          >
            Media Settings
            <ArrowRight className="size-3.5" />
          </Link>
        </div>

        {/* 4. Payment Gateways */}
        <div className="flex flex-col justify-between p-5 rounded-xl border border-border bg-card shadow-xs hover:border-primary/40 transition-colors space-y-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="flex size-9 items-center justify-center rounded-lg bg-success/10 text-success">
                  <CreditCard className="size-5" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-foreground">Payment Gateways</h2>
                  <span className="text-[11px] text-muted-foreground">bKash, Nagad, COD</span>
                </div>
              </div>
              <SettingStatusBadge status="CONNECTED" label="Operational" />
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed">
              Customer payment collection methods, transaction reconciliation, refunds, and Cash on Delivery.
            </p>

            <div className="pt-2 border-t space-y-1 text-xs">
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>Used by:</span>
                <span className="font-medium text-foreground">Checkout & Finance</span>
              </div>
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>Methods active:</span>
                <span className="font-mono text-foreground">bKash, Nagad, COD</span>
              </div>
            </div>
          </div>

          <Link
            href="/payments"
            className={buttonVariants({ variant: 'outline', size: 'sm', className: 'w-full text-xs h-8 gap-1.5 font-medium mt-2' })}
          >
            Payments Console
            <ArrowRight className="size-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}
