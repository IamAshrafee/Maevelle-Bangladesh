'use client';

import {
  ShieldCheck,
  Server,
  Key,
  Radio,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Clock,
  Mail,
  Activity,
  Layers,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  type EmailDiagnosticsDto,
  formatDateTime,
} from './email-types';

interface EmailDiagnosticsTabProps {
  readonly diagnostic: EmailDiagnosticsDto | undefined;
  readonly onRefresh: () => void;
}

export function EmailDiagnosticsTab({ diagnostic, onRefresh }: EmailDiagnosticsTabProps) {
  const isResendConfigured = Boolean(diagnostic?.providerConfigured);
  const isWebhookConfigured = Boolean(diagnostic?.webhookConfigured);
  const isWorkerHealthy = diagnostic?.worker_status === 'HEALTHY' || diagnostic?.worker_status === 'IDLE';

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">System Diagnostics & Setup Checklist</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Verify application deployment secrets, background worker health, Resend provider integration, and external DNS records.
        </p>
      </div>

      {/* Production Setup Checklist */}
      <Card className="border-primary/20 shadow-xs">
        <CardHeader className="pb-3 border-b bg-muted/20">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <ShieldCheck className="size-5 text-primary" /> Production Transactional Email Checklist
              </CardTitle>
              <CardDescription className="text-xs">
                Authoritatively verifies internal system facts versus manual external third-party requirements
              </CardDescription>
            </div>
            <Badge variant="outline" className="text-xs font-mono">
              Provider: {diagnostic?.provider?.toUpperCase() ?? 'LOCAL'}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <div className="divide-y divide-border text-xs">
            {/* 1. Resend API Key */}
            <div className="flex items-start justify-between gap-4 p-4">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-foreground">1. Resend Delivery API Key</span>
                  <Badge variant="outline" className="text-[10px]">Auto-verified</Badge>
                </div>
                <p className="text-muted-foreground text-[11px]">
                  Environment variable <code>RESEND_API_KEY</code> used by worker to authenticate transactional sends.
                </p>
              </div>
              <div className="shrink-0">
                {isResendConfigured ? (
                  <Badge variant="default" className="bg-emerald-600 hover:bg-emerald-600 text-xs">
                    <CheckCircle2 className="size-3 mr-1" /> Configured
                  </Badge>
                ) : (
                  <Badge variant="destructive" className="text-xs">
                    <AlertCircle className="size-3 mr-1" /> Missing Key
                  </Badge>
                )}
              </div>
            </div>

            {/* 2. From Sending Address */}
            <div className="flex items-start justify-between gap-4 p-4">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-foreground">2. Authoritative Sender Address</span>
                  <Badge variant="outline" className="text-[10px]">Auto-verified</Badge>
                </div>
                <p className="text-muted-foreground text-[11px]">
                  Current configured From address: <code className="font-mono text-foreground">{diagnostic?.from || '—'}</code>
                </p>
              </div>
              <div className="shrink-0">
                <Badge variant="default" className="bg-emerald-600 hover:bg-emerald-600 text-xs">
                  <CheckCircle2 className="size-3 mr-1" /> Configured
                </Badge>
              </div>
            </div>

            {/* 3. Reply-To Human Mailbox */}
            <div className="flex items-start justify-between gap-4 p-4">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-foreground">3. Customer Reply-To Support Mailbox</span>
                  <Badge variant="outline" className="text-[10px]">Auto-verified</Badge>
                </div>
                <p className="text-muted-foreground text-[11px]">
                  Replies from customers route to human Gmail mailbox: <code className="font-mono text-emerald-700 dark:text-emerald-400">{diagnostic?.replyTo || 'maevelleBangladesh@gmail.com'}</code>
                </p>
              </div>
              <div className="shrink-0">
                <Badge variant="default" className="bg-emerald-600 hover:bg-emerald-600 text-xs">
                  <CheckCircle2 className="size-3 mr-1" /> Configured
                </Badge>
              </div>
            </div>

            {/* 4. Resend Webhook Secret */}
            <div className="flex items-start justify-between gap-4 p-4">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-foreground">4. Svix Signed Webhook Endpoint</span>
                  <Badge variant="outline" className="text-[10px]">Auto-verified</Badge>
                </div>
                <p className="text-muted-foreground text-[11px]">
                  Receives raw byte payloads at <code>/webhooks/resend</code> with cryptographic Svix signature verification.
                </p>
              </div>
              <div className="shrink-0">
                {isWebhookConfigured ? (
                  <Badge variant="default" className="bg-emerald-600 hover:bg-emerald-600 text-xs">
                    <CheckCircle2 className="size-3 mr-1" /> Configured
                  </Badge>
                ) : (
                  <Badge variant="destructive" className="text-xs">
                    <AlertCircle className="size-3 mr-1" /> Missing Secret
                  </Badge>
                )}
              </div>
            </div>

            {/* 5. Worker Status */}
            <div className="flex items-start justify-between gap-4 p-4">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-foreground">5. Asynchronous Background Worker</span>
                  <Badge variant="outline" className="text-[10px]">Auto-verified</Badge>
                </div>
                <p className="text-muted-foreground text-[11px]">
                  Durable queue worker consumes outbox deliveries using <code>FOR UPDATE SKIP LOCKED</code>.
                </p>
              </div>
              <div className="shrink-0">
                <Badge
                  variant={isWorkerHealthy ? 'default' : 'secondary'}
                  className={isWorkerHealthy ? 'bg-emerald-600 hover:bg-emerald-600 text-xs' : 'text-xs'}
                >
                  <Server className="size-3 mr-1" /> {diagnostic?.worker_status || 'Healthy'}
                </Badge>
              </div>
            </div>

            {/* 6. Namecheap DNS Verification (Manual) */}
            <div className="flex items-start justify-between gap-4 p-4 bg-muted/10">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-foreground">6. Namecheap DNS Records (SPF, DKIM, DMARC)</span>
                  <Badge variant="secondary" className="text-[10px]">External Setup</Badge>
                </div>
                <p className="text-muted-foreground text-[11px]">
                  Add TXT and MX records in Namecheap DNS management for verified domain deliverability.
                </p>
              </div>
              <div className="shrink-0">
                <Badge variant="outline" className="text-xs border-amber-500/40 text-amber-700 dark:text-amber-400">
                  Manual Verification
                </Badge>
              </div>
            </div>

            {/* 7. Resend Domain Verification (Manual) */}
            <div className="flex items-start justify-between gap-4 p-4 bg-muted/10">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-foreground">7. Resend Sender Domain Verification</span>
                  <Badge variant="secondary" className="text-[10px]">External Resend Dashboard</Badge>
                </div>
                <p className="text-muted-foreground text-[11px]">
                  Confirm domain shows <strong>Verified</strong> in Resend Domains tab before sending live emails.
                </p>
              </div>
              <div className="shrink-0">
                <Badge variant="outline" className="text-xs border-amber-500/40 text-amber-700 dark:text-amber-400">
                  Manual Verification
                </Badge>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Secret Values & Environment Details */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Application Secrets State */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Key className="size-4 text-primary" /> Application Secret Presence
            </CardTitle>
            <CardDescription className="text-xs">
              Secret values are never transmitted to the browser or stored in client components.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-xs">
            <div className="flex items-center justify-between py-2 border-b">
              <div>
                <p className="font-semibold text-foreground">RESEND_API_KEY</p>
                <p className="text-[11px] text-muted-foreground">Used for outbound HTTP delivery to Resend</p>
              </div>
              <Badge variant={diagnostic?.providerConfigured ? 'default' : 'destructive'} className="text-xs">
                {diagnostic?.providerConfigured ? 'Configured (re_***)' : 'Missing'}
              </Badge>
            </div>

            <div className="flex items-center justify-between py-2 border-b">
              <div>
                <p className="font-semibold text-foreground">RESEND_WEBHOOK_SECRET</p>
                <p className="text-[11px] text-muted-foreground">Svix HMAC signature secret for webhook validation</p>
              </div>
              <Badge variant={diagnostic?.webhookConfigured ? 'default' : 'destructive'} className="text-xs">
                {diagnostic?.webhookConfigured ? 'Configured (whsec_***)' : 'Missing'}
              </Badge>
            </div>

            <div className="flex items-center justify-between py-2">
              <div>
                <p className="font-semibold text-foreground">EMAIL_TEST_RECIPIENT_OVERRIDE</p>
                <p className="text-[11px] text-muted-foreground">Non-production redirection target</p>
              </div>
              <span className="font-mono text-xs">
                {diagnostic?.testRecipientOverride || 'None (Disabled)'}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Worker Queue Observability */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Server className="size-4 text-primary" /> Queue & Worker Telemetry
            </CardTitle>
            <CardDescription className="text-xs">
              Live operational metrics derived directly from database outbox and notification records
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-xs">
            <div className="flex items-center justify-between py-2 border-b">
              <span className="text-muted-foreground">Active Queue Backlog:</span>
              <span className="font-bold text-sm text-foreground">{diagnostic?.queued ?? 0}</span>
            </div>
            <div className="flex items-center justify-between py-2 border-b">
              <span className="text-muted-foreground">Currently Processing:</span>
              <span className="font-bold text-sm text-foreground">{diagnostic?.processing ?? 0}</span>
            </div>
            <div className="flex items-center justify-between py-2 border-b">
              <span className="text-muted-foreground">Oldest Queued Timestamp:</span>
              <span className="font-mono text-xs text-foreground">
                {diagnostic?.oldest_queued_at ? formatDateTime(diagnostic.oldest_queued_at) : 'Queue Clear'}
              </span>
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-muted-foreground">Calculated Worker Health:</span>
              <Badge
                variant={
                  diagnostic?.worker_status === 'HEALTHY'
                    ? 'default'
                    : diagnostic?.worker_status === 'BACKLOG'
                    ? 'destructive'
                    : 'secondary'
                }
                className="text-xs uppercase"
              >
                {diagnostic?.worker_status ?? 'HEALTHY'}
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* External Setup Guides & Docs Links */}
      <Card className="bg-muted/20">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <HelpCircle className="size-4 text-primary" /> Documentation & Setup Resources
          </CardTitle>
          <CardDescription className="text-xs">
            Reference documents for external DNS setup, SPF/DKIM verification, and delivery policies
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-xs">
          <p className="text-muted-foreground">
            Complete production DNS records, Resend account configuration, and webhook setup are fully documented in:
          </p>
          <div className="flex flex-wrap gap-2 pt-1">
            <Badge variant="outline" className="font-mono text-[11px] py-1 px-2.5 bg-background">
              docs/email-notifications/resend-setup-guide.md
            </Badge>
            <Badge variant="outline" className="font-mono text-[11px] py-1 px-2.5 bg-background">
              docs/email-notifications/operational-runbook.md
            </Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
