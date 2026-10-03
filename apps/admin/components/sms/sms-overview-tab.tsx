import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  MessageSquareText,
  Server,
  ShieldCheck,
} from 'lucide-react';
import type { SmsDiagnosticsDto, SmsNotificationRowDto, SmsTabKey } from './sms-types';
import { formatSmsDate, smsEventLabel } from './sms-types';
import { SmsStatusBadge } from './sms-status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export function SmsOverviewTab({
  diagnostics,
  recent,
  onSelectTab,
  onInspect,
}: {
  readonly diagnostics: SmsDiagnosticsDto | undefined;
  readonly recent: readonly SmsNotificationRowDto[];
  readonly onSelectTab: (tab: SmsTabKey) => void;
  readonly onInspect: (id: string) => void;
}) {
  const noProductionProvider =
    !diagnostics?.providerConfigured ||
    diagnostics.provider === 'none' ||
    diagnostics.provider === 'mock';
  return (
    <div className="space-y-6">
      {diagnostics && !diagnostics.enabled ? (
        <div className="flex flex-col gap-4 rounded-2xl border border-amber-300 bg-amber-50 p-5 text-amber-950 dark:bg-amber-950 dark:text-amber-100 sm:flex-row sm:items-center">
          <AlertTriangle aria-hidden="true" className="size-8 shrink-0 text-amber-600" />
          <div className="flex-1">
            <h2 className="font-semibold">SMS Sending Globally Disabled</h2>
            <p className="mt-1 text-sm">
              Maevelle will not send transactional SMS automatically. Existing order processing
              continues normally. Queued messages remain held, and mock scenarios in the Test Lab
              remain available for verification.
            </p>
          </div>
          <Button variant="outline" onClick={() => onSelectTab('policies')}>
            Review Policies
          </Button>
        </div>
      ) : null}
      {noProductionProvider ? (
        <div className="flex flex-col gap-4 rounded-2xl border border-blue-300 bg-blue-50 p-5 text-blue-950 dark:bg-blue-950 dark:text-blue-100 sm:flex-row sm:items-center">
          <ShieldCheck aria-hidden="true" className="size-8 shrink-0" />
          <div className="flex-1">
            <h2 className="font-semibold">Production SMS Provider Not Connected Yet</h2>
            <p className="mt-1 text-sm">
              Maevelle’s SMS infrastructure is ready. Real customer sending remains safely
              unavailable until a Bangladesh provider, credentials, and approved sender are
              connected.
            </p>
          </div>
          <Button variant="outline" onClick={() => onSelectTab('diagnostics')}>
            View Provider Requirements
          </Button>
        </div>
      ) : null}
      {diagnostics?.recipientOverride ? (
        <div className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:bg-amber-950 dark:text-amber-100">
          <AlertTriangle aria-hidden="true" className="size-5 shrink-0" />
          <div>
            <p className="font-semibold">Test Recipient Override Active</p>
            <p className="mt-1 text-xs">
              Customer recipients are redirected to{' '}
              <span className="font-mono">{diagnostics.recipientOverride}</span> in this
              environment.
            </p>
          </div>
        </div>
      ) : null}
      <section aria-label="SMS system status" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatusCard
          label="SMS System"
          value={diagnostics?.enabled ? 'Enabled' : 'Disabled'}
          detail={
            diagnostics?.enabled
              ? 'Delivery processing is allowed.'
              : 'New automatic and manual production sends are blocked.'
          }
          icon={MessageSquareText}
          ready={Boolean(diagnostics?.enabled)}
        />
        <StatusCard
          label="Provider"
          value={
            diagnostics?.provider === 'none'
              ? 'Not Connected'
              : diagnostics?.provider === 'mock'
                ? 'Mock Provider'
                : (diagnostics?.provider ?? 'Unknown')
          }
          detail={
            diagnostics?.mode === 'MOCK'
              ? 'Development simulation only.'
              : diagnostics?.providerConfigured
                ? 'Adapter is configured.'
                : 'Valid pre-provider state.'
          }
          icon={ShieldCheck}
          ready={Boolean(diagnostics?.providerConfigured)}
        />
        <StatusCard
          label="Worker"
          value={diagnostics?.workerStatus ?? 'Unavailable'}
          detail={
            diagnostics?.oldestQueuedAt
              ? `Oldest queued: ${formatSmsDate(diagnostics.oldestQueuedAt)}`
              : 'No queued backlog.'
          }
          icon={Server}
          ready={diagnostics?.workerStatus !== 'BACKLOG'}
        />
        <StatusCard
          label="Environment"
          value={diagnostics?.environment ?? 'Unknown'}
          detail={`${diagnostics?.senderType?.replaceAll('_', ' ') ?? 'Provider default'} sender`}
          icon={Activity}
          ready
        />
      </section>
      <section aria-labelledby="today-heading">
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <h2 id="today-heading" className="text-lg font-semibold">
              Today’s SMS Operations
            </h2>
            <p className="text-xs text-muted-foreground">
              Lifecycle facts recorded since midnight in the configured database timezone.
            </p>
          </div>
          <Button size="sm" variant="ghost" onClick={() => onSelectTab('activity')}>
            Open Activity <ArrowRight aria-hidden="true" className="ml-1 size-3.5" />
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-8">
          {[
            ['Created', diagnostics?.today.created ?? 0],
            ['Queued', diagnostics?.today.queued ?? 0],
            ['Accepted', diagnostics?.today.accepted ?? 0],
            ['Delivered', diagnostics?.today.delivered ?? 0],
            ['Failed', diagnostics?.today.failed ?? 0],
            ['Skipped', diagnostics?.today.skipped ?? 0],
            ['Suppressed', diagnostics?.today.suppressed ?? 0],
            ['Segments', diagnostics?.today.estimatedSegments ?? 0],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl border bg-card p-3">
              <p className="text-[11px] text-muted-foreground">{label}</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
            </div>
          ))}
        </div>
      </section>
      <div className="grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Recent SMS</CardTitle>
              <CardDescription>
                Accepted means provider handoff, not handset delivery.
              </CardDescription>
            </div>
            <Badge variant="outline">{recent.length} shown</Badge>
          </CardHeader>
          <CardContent className="p-0">
            {recent.length ? (
              <div className="divide-y">
                {recent.slice(0, 8).map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    onClick={() => onInspect(item.id)}
                    className="flex min-h-16 w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {smsEventLabel(item.notification_type)}{' '}
                        <span className="text-muted-foreground">
                          · {item.order_number ?? item.source_id}
                        </span>
                      </p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {item.customer_name ?? 'Customer'} · {item.trigger_type} ·{' '}
                        {formatSmsDate(item.created_at)}
                      </p>
                    </div>
                    <SmsStatusBadge status={item.status} compact />
                  </button>
                ))}
              </div>
            ) : (
              <EmptyState
                title="No SMS Yet"
                description="SMS records will appear here when authoritative business events or controlled test sends create them."
              />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Platform Readiness</CardTitle>
            <CardDescription>
              External provider work remains separate from Maevelle platform readiness.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {diagnostics?.readiness.map((item) => (
              <div key={item.key} className="flex gap-3">
                <div
                  className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full ${item.state === 'READY' ? 'bg-emerald-100 text-emerald-700' : 'bg-muted text-muted-foreground'}`}
                >
                  {item.state === 'READY' ? (
                    <CheckCircle2 aria-hidden="true" className="size-4" />
                  ) : (
                    <Clock3 aria-hidden="true" className="size-4" />
                  )}
                </div>
                <div>
                  <p className="text-sm font-medium">{item.label}</p>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {item.explanation}
                  </p>
                </div>
              </div>
            )) ?? <p className="text-sm text-muted-foreground">Loading readiness…</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatusCard({
  label,
  value,
  detail,
  icon: Icon,
  ready,
}: {
  readonly label: string;
  readonly value: string;
  readonly detail: string;
  readonly icon: typeof Activity;
  readonly ready: boolean;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription className="flex items-center justify-between">
          <span>{label}</span>
          <Icon aria-hidden="true" className="size-4" />
        </CardDescription>
        <CardTitle className="text-xl text-balance">{value}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground">{detail}</p>
        <span className="sr-only">{ready ? 'Ready' : 'Not ready'}</span>
      </CardContent>
    </Card>
  );
}
function EmptyState({
  title,
  description,
}: {
  readonly title: string;
  readonly description: string;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      <MessageSquareText aria-hidden="true" className="size-8 text-muted-foreground" />
      <p className="mt-3 font-medium">{title}</p>
      <p className="mt-1 max-w-sm text-xs text-muted-foreground">{description}</p>
    </div>
  );
}
