'use client';

import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  RotateCw,
  Server,
  Radio,
  Mail,
  ShieldAlert,
  ArrowRight,
  TrendingUp,
  Ban,
  Activity,
  Zap,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmailStatusBadge } from './email-status-badge';
import {
  type EmailDiagnosticsDto,
  type EmailNotificationRowDto,
  type EmailTabKey,
  formatDateTime,
} from './email-types';

interface EmailOverviewTabProps {
  readonly diagnostic: EmailDiagnosticsDto | undefined;
  readonly recentEmails: readonly EmailNotificationRowDto[];
  readonly onSelectTab: (tab: EmailTabKey) => void;
  readonly onInspectEmail: (email: EmailNotificationRowDto) => void;
  readonly onRefresh: () => void;
}

export function EmailOverviewTab({
  diagnostic,
  recentEmails,
  onSelectTab,
  onInspectEmail,
  onRefresh,
}: EmailOverviewTabProps) {
  const isGlobalDisabled = diagnostic && !diagnostic.enabled;
  const isRedirectActive = Boolean(diagnostic?.testRecipientOverride);
  const isMissingSecrets = diagnostic && (!diagnostic.providerConfigured || !diagnostic.webhookConfigured);

  const recentFailures = recentEmails.filter(
    (e) => e.status === 'FAILED' || e.status === 'BOUNCED',
  );

  return (
    <div className="space-y-6">
      {/* Warning Banners */}
      {isGlobalDisabled ? (
        <div className="flex items-start gap-3 rounded-xl border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          <AlertTriangle className="size-5 shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="font-semibold">Email Sending is Disabled Globally</h3>
            <p className="mt-1 text-xs opacity-90">
              No automatic or transactional emails will be queued or sent to customers by the system. You can update this in the Policies tab.
            </p>
          </div>
          <Button
            size="sm"
            variant="destructive"
            onClick={() => onSelectTab('policies')}
            className="shrink-0"
          >
            Review Policies
          </Button>
        </div>
      ) : null}

      {isRedirectActive ? (
        <div className="flex items-start gap-3 rounded-xl border border-blue-500/40 bg-blue-500/10 p-4 text-sm text-blue-950 dark:text-blue-200">
          <Radio className="size-5 shrink-0 text-blue-600 dark:text-blue-400 mt-0.5 animate-pulse" />
          <div className="flex-1">
            <h3 className="font-semibold">Development Recipient Redirect Active</h3>
            <p className="mt-1 text-xs opacity-90">
              Transactional customer emails in this environment are automatically redirected to{' '}
              <strong className="font-mono">{diagnostic?.testRecipientOverride}</strong> to prevent accidental customer contact.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onSelectTab('diagnostics')}
            className="shrink-0 border-blue-500/30 text-xs"
          >
            Diagnostics
          </Button>
        </div>
      ) : null}

      {isMissingSecrets ? (
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-950 dark:text-amber-200">
          <ShieldAlert className="size-5 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
          <div className="flex-1">
            <h3 className="font-semibold">Provider or Webhook Configuration Missing</h3>
            <p className="mt-1 text-xs opacity-90">
              {!diagnostic?.providerConfigured
                ? 'Resend API key is not configured in environment variables. '
                : ''}
              {!diagnostic?.webhookConfigured
                ? 'Resend Webhook Secret is not configured. Delivery events cannot be cryptographically verified.'
                : ''}
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onSelectTab('diagnostics')}
            className="shrink-0 border-amber-500/30 text-xs"
          >
            Setup Checklist
          </Button>
        </div>
      ) : null}

      {/* Primary Status Grid */}
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Card className="relative overflow-hidden">
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center justify-between text-xs">
              <span>Email System</span>
              <span
                className={`size-2 rounded-full ${
                  diagnostic?.enabled ? 'bg-emerald-500' : 'bg-destructive'
                }`}
              />
            </CardDescription>
            <CardTitle className="text-xl font-bold">
              {diagnostic?.enabled ? 'Sending Active' : 'Disabled'}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            {diagnostic?.provider === 'resend' ? 'Resend Delivery Provider' : 'Local Adapter'}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center justify-between text-xs">
              <span>Delivery Worker</span>
              <Server className="size-3.5 text-muted-foreground" />
            </CardDescription>
            <CardTitle className="text-xl font-bold capitalize">
              {diagnostic?.worker_status?.toLowerCase() ?? 'Healthy'}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            {diagnostic?.queued ? `${diagnostic.queued} queued in backlog` : 'Queue clear · Idle'}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center justify-between text-xs">
              <span>Environment</span>
              <Badge variant="outline" className="text-[10px] uppercase">
                {diagnostic?.environment ?? 'local'}
              </Badge>
            </CardDescription>
            <CardTitle className="text-xl font-bold capitalize">
              {diagnostic?.environment ?? 'Development'}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground truncate">
            {diagnostic?.from ?? 'Maevelle'}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center justify-between text-xs">
              <span>Last Webhook</span>
              <Activity className="size-3.5 text-muted-foreground" />
            </CardDescription>
            <CardTitle className="text-lg font-bold">
              {diagnostic?.last_webhook_at ? formatDateTime(diagnostic.last_webhook_at) : 'No Webhooks'}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            {diagnostic?.webhookConfigured ? 'Svix Signed ✓' : 'Secret Missing'}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center justify-between text-xs">
              <span>Human Reply-To</span>
              <Mail className="size-3.5 text-muted-foreground" />
            </CardDescription>
            <CardTitle className="text-sm font-semibold truncate text-emerald-800 dark:text-emerald-400">
              {diagnostic?.replyTo ?? 'maevelleBangladesh@gmail.com'}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            Customer replies route here
          </CardContent>
        </Card>
      </section>

      {/* Deliverability Metrics & Health */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Today's Operational KPIs */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Today&apos;s Deliverability Snapshot</CardTitle>
                <CardDescription className="text-xs">
                  Authoritative email deliveries created and processed today
                </CardDescription>
              </div>
              <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={onRefresh}>
                <RotateCw className="mr-1.5 size-3.5" /> Refresh
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div className="rounded-lg border p-3">
                <span className="text-xs text-muted-foreground">Delivered</span>
                <p className="mt-1 text-2xl font-bold text-emerald-700 dark:text-emerald-400">
                  {diagnostic?.today?.delivered ?? diagnostic?.delivered ?? 0}
                </p>
                <span className="text-[11px] text-muted-foreground">Successful handoffs</span>
              </div>
              <div className="rounded-lg border p-3">
                <span className="text-xs text-muted-foreground">Queued</span>
                <p className="mt-1 text-2xl font-bold text-amber-700 dark:text-amber-400">
                  {diagnostic?.today?.queued ?? diagnostic?.queued ?? 0}
                </p>
                <span className="text-[11px] text-muted-foreground">In delivery queue</span>
              </div>
              <div className="rounded-lg border p-3">
                <span className="text-xs text-muted-foreground">Failed</span>
                <p className="mt-1 text-2xl font-bold text-destructive">
                  {diagnostic?.today?.failed ?? diagnostic?.failed ?? 0}
                </p>
                <span className="text-[11px] text-muted-foreground">Technical send errors</span>
              </div>
              <div className="rounded-lg border p-3">
                <span className="text-xs text-muted-foreground">Bounced / Blocks</span>
                <p className="mt-1 text-2xl font-bold text-purple-700 dark:text-purple-400">
                  {(diagnostic?.today?.bounced ?? 0) + (diagnostic?.suppressed ?? 0)}
                </p>
                <span className="text-[11px] text-muted-foreground">Rejected / Suppressed</span>
              </div>
            </div>

            {/* 7-Day Success Rate */}
            <div className="mt-6 rounded-lg bg-muted/40 p-4">
              <div className="flex items-center justify-between text-xs mb-2">
                <span className="font-semibold flex items-center gap-1.5">
                  <TrendingUp className="size-3.5 text-primary" /> 7-Day Delivery Success Ratio
                </span>
                <span className="font-bold text-sm">
                  {diagnostic?.last_7_days?.success_rate != null
                    ? `${diagnostic.last_7_days.success_rate}%`
                    : '100%'}
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-emerald-600 rounded-full transition-all"
                  style={{
                    width: `${diagnostic?.last_7_days?.success_rate ?? 100}%`,
                  }}
                />
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                Calculated from {diagnostic?.last_7_days?.total ?? 0} transactional messages dispatched in the last 7 days.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Quick Triage / Diagnostics Summary */}
        <Card className="flex flex-col justify-between">
          <CardHeader>
            <CardTitle className="text-base">Operational Health & Triage</CardTitle>
            <CardDescription className="text-xs">
              Real-time worker backlog and failure alerts
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 flex-1">
            {diagnostic?.top_failure_reason ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs">
                <span className="font-semibold text-destructive flex items-center gap-1.5">
                  <AlertTriangle className="size-3.5" /> Top Failure Reason
                </span>
                <p className="mt-1 font-mono font-medium text-foreground">
                  {diagnostic.top_failure_reason.code} ({diagnostic.top_failure_reason.count} occurrences)
                </p>
              </div>
            ) : (
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-800 dark:text-emerald-300">
                <p className="font-semibold flex items-center gap-1.5">
                  <CheckCircle2 className="size-3.5" /> No Systemic Failures Detected
                </p>
                <p className="mt-0.5 text-muted-foreground">
                  Provider delivery is running smoothly without high error rates.
                </p>
              </div>
            )}

            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1.5 border-b">
                <span className="text-muted-foreground">Active Suppressions:</span>
                <span className="font-semibold">{diagnostic?.suppressed ?? 0}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b">
                <span className="text-muted-foreground">Oldest Queued Item:</span>
                <span className="font-mono">{diagnostic?.oldest_queued_at ? formatDateTime(diagnostic.oldest_queued_at) : 'None'}</span>
              </div>
              <div className="flex justify-between py-1.5">
                <span className="text-muted-foreground">Test Recipient Redirection:</span>
                <span className="font-mono">{diagnostic?.testRecipientOverride ?? 'Disabled'}</span>
              </div>
            </div>
          </CardContent>

          <div className="border-t p-4 flex gap-2">
            <Button
              size="sm"
              variant="outline"
              className="flex-1 text-xs"
              onClick={() => onSelectTab('test-lab')}
            >
              <Zap className="mr-1.5 size-3.5 text-primary" /> Test Lab
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="flex-1 text-xs"
              onClick={() => onSelectTab('templates')}
            >
              Templates
            </Button>
          </div>
        </Card>
      </div>

      {/* Recent Failures / Attention Row */}
      {recentFailures.length > 0 ? (
        <Card className="border-destructive/30">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="size-4 text-destructive" />
                <CardTitle className="text-sm font-semibold text-destructive">
                  Recent Delivery Failures Requiring Review ({recentFailures.length})
                </CardTitle>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs text-primary"
                onClick={() => onSelectTab('activity')}
              >
                View all in Activity <ArrowRight className="ml-1 size-3" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {recentFailures.slice(0, 3).map((item) => (
                <div
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-3 p-3 sm:px-4 hover:bg-muted/40 cursor-pointer text-xs"
                  onClick={() => onInspectEmail(item)}
                >
                  <div className="space-y-0.5">
                    <p className="font-medium text-foreground">{item.rendered_subject || item.notification_type}</p>
                    <p className="text-muted-foreground">
                      Recipient: <span className="font-mono">{item.intended_recipient ?? 'No email'}</span> ·{' '}
                      {formatDateTime(item.created_at)}
                    </p>
                    {item.failure_code ? (
                      <p className="text-destructive font-mono text-[11px]">
                        Error: {item.failure_code}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <EmailStatusBadge status={item.status} />
                    <Button size="sm" variant="outline" className="h-7 text-xs">
                      Inspect
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
