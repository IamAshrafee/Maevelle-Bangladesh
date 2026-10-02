'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowUpRight,
  CheckCircle2,
  ExternalLink,
  Globe,
  History,
  KeyRound,
  Loader2,
  Mail,
  Plug,
  RefreshCw,
  RotateCw,
  Server,
  Shield,
  Zap,
} from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { SettingsCard, SettingsSection } from './settings-card';
import { SettingsPageHeader } from './settings-page-header';
import { IntegrationCredentialField } from './integration-credential-field';
import { SettingStatusBadge } from './setting-status-badge';
import { SettingsAuditDrawer } from './settings-audit-drawer';
import { apiRequest, fetchApiData } from '@/lib/api';
import type { IntegrationSummaryDto, IntegrationTestResultDto } from '@maevelle/contracts';

export function ResendIntegrationConsole() {
  const [data, setData] = useState<IntegrationSummaryDto>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [auditDrawerOpen, setAuditDrawerOpen] = useState(false);

  // Live test connection state
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<IntegrationTestResultDto | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetchApiData<IntegrationSummaryDto>('/admin/settings/integrations/resend');
      if (res) setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load Resend integration status.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Test live connection to Resend API
  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const result = await apiRequest<{ data: IntegrationTestResultDto }>(
        '/admin/settings/integrations/resend/test',
        { method: 'POST' },
      );
      setTestResult(result.data);
    } catch (err) {
      setTestResult({
        success: false,
        message: err instanceof Error ? err.message : 'Connection test request failed.',
        checkedAt: new Date().toISOString(),
      });
    } finally {
      setTesting(false);
    }
  };

  // Replace secret
  const handleSaveSecret = async (keyName: string, secretValue: string) => {
    await apiRequest('/admin/settings/integrations/resend/secret', {
      method: 'POST',
      body: JSON.stringify({
        keyName,
        secret: secretValue,
        reason: `Administrative update of Resend ${keyName}`,
      }),
    });
    await loadData();
  };

  // Revoke secret
  const handleRemoveSecret = async (keyName: string) => {
    await apiRequest(`/admin/settings/integrations/resend/secret?keyName=${keyName}`, {
      method: 'DELETE',
    });
    await loadData();
  };

  if (loading && !data) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-2 text-muted-foreground text-xs">
        <RefreshCw className="size-5 animate-spin text-primary" />
        <span>Loading Resend Integration...</span>
      </div>
    );
  }

  const apiKeySecret = data?.secrets.find((s) => s.keyName === 'api_key');
  const webhookSecret = data?.secrets.find((s) => s.keyName === 'webhook_secret');
  const isConnected = data?.status === 'CONNECTED';

  return (
    <div className="space-y-6 pb-16 max-w-4xl">
      <SettingsPageHeader
        title="Resend Integration"
        description="External transactional email delivery provider used by Maevelle for customer notifications."
        backHref="/settings/integrations"
        backLabel="All Integrations"
        readinessStatus={isConnected ? 'ready' : 'needs_configuration'}
        readinessLabel={isConnected ? 'Connected' : 'Missing credentials'}
        runtimeMutable={true}
        onOpenHistory={() => setAuditDrawerOpen(true)}
        actions={
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleTestConnection}
            disabled={testing || !apiKeySecret?.configured}
            className="text-xs h-8 gap-1.5 shadow-xs"
          >
            {testing ? (
              <>
                <Loader2 className="size-3.5 animate-spin text-primary" />
                Testing connection...
              </>
            ) : (
              <>
                <Zap className="size-3.5 text-primary" />
                Test connection
              </>
            )}
          </Button>
        }
      />

      {error && (
        <div className="p-3 text-xs rounded-lg bg-destructive/10 text-destructive border border-destructive/20">
          {error}
        </div>
      )}

      {/* Test Connection Result Alert */}
      {testResult && (
        <div
          className={`p-4 rounded-xl text-xs border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
            testResult.success
              ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300 border-emerald-500/20'
              : 'bg-destructive/10 text-destructive border-destructive/20'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {testResult.success ? (
              <CheckCircle2 className="size-5 text-emerald-600 shrink-0" />
            ) : (
              <Shield className="size-5 shrink-0" />
            )}
            <div>
              <p className="font-semibold">{testResult.message}</p>
              {testResult.latencyMs !== undefined && (
                <p className="text-[11px] opacity-80">Round-trip response latency: {testResult.latencyMs}ms</p>
              )}
            </div>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setTestResult(null)}
            className="h-7 text-xs self-end sm:self-center"
          >
            Dismiss
          </Button>
        </div>
      )}

      {/* Overview Status Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl border border-border bg-card space-y-1">
          <span className="text-xs text-muted-foreground font-medium">Provider Status</span>
          <div className="pt-1">
            <SettingStatusBadge status={data?.status ?? 'NEEDS_CONFIGURATION'} />
          </div>
        </div>

        <div className="p-4 rounded-xl border border-border bg-card space-y-1">
          <span className="text-xs text-muted-foreground font-medium">Sending Domain</span>
          <div className="pt-1 flex items-center gap-1.5 font-mono text-xs font-semibold text-foreground">
            <Globe className="size-3.5 text-primary" />
            <span>maevelle.com</span>
          </div>
        </div>

        <div className="p-4 rounded-xl border border-border bg-card space-y-1">
          <span className="text-xs text-muted-foreground font-medium">Used By</span>
          <div className="pt-1">
            <Link
              href="/email?tab=settings"
              className={buttonVariants({ variant: 'link', size: 'sm', className: 'h-auto p-0 text-xs font-semibold inline-flex items-center gap-1' })}
            >
              <Mail className="size-3.5" />
              Email Operations
              <ArrowUpRight className="size-3" />
            </Link>
          </div>
        </div>
      </div>

      {/* Encrypted Secrets Management */}
      <SettingsSection
        title="Authentication Credentials"
        description="Encrypted API keys and webhook signing secrets. Values are never exposed in browser payloads."
      >
        <div className="space-y-4">
          <IntegrationCredentialField
            label="Resend API Key"
            description="Production API key beginning with re_ used by background email workers to dispatch transactional messages."
            configured={Boolean(apiKeySecret?.configured)}
            isDeploymentManaged={apiKeySecret?.source === 'DEPLOYMENT'}
            lastReplaced={apiKeySecret?.updatedAt}
            onSaveSecret={(val) => handleSaveSecret('api_key', val)}
            onRemoveSecret={() => handleRemoveSecret('api_key')}
            removalConsequence="Transactional emails will fail to send through Resend until a new valid API key is saved."
          />

          <IntegrationCredentialField
            label="Webhook Signing Secret"
            description="Webhook verification secret beginning with whsec_ used to authenticate incoming delivery receipts and bounce events."
            configured={Boolean(webhookSecret?.configured)}
            isDeploymentManaged={webhookSecret?.source === 'DEPLOYMENT'}
            lastReplaced={webhookSecret?.updatedAt}
            onSaveSecret={(val) => handleSaveSecret('webhook_secret', val)}
            onRemoveSecret={() => handleRemoveSecret('webhook_secret')}
            removalConsequence="Real-time delivery status updates and automatic bounce suppression will stop functioning."
          />
        </div>
      </SettingsSection>

      {/* External Provider Resources */}
      <div className="p-4 rounded-xl border border-dashed border-border bg-muted/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <div className="space-y-0.5">
          <span className="font-semibold text-foreground">Need to manage DNS or create API keys?</span>
          <p className="text-muted-foreground">
            Visit your Resend dashboard to inspect domain DNS records (SPF, DKIM, DMARC) or generate restricted tokens.
          </p>
        </div>
        <a
          href="https://resend.com/overview"
          target="_blank"
          rel="noopener noreferrer"
          className={buttonVariants({ variant: 'outline', size: 'sm', className: 'text-xs h-8 shrink-0 gap-1.5' })}
        >
          Resend Console
          <ExternalLink className="size-3.5" />
        </a>
      </div>

      {/* Audit Drawer */}
      <SettingsAuditDrawer
        open={auditDrawerOpen}
        onOpenChange={setAuditDrawerOpen}
        module="integrations"
        title="Resend Integration History"
      />
    </div>
  );
}
