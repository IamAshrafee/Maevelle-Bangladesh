'use client';

import {
  CalendarClock,
  CheckCircle2,
  Clock3,
  HelpCircle,
  Inbox,
  MessageCircle,
  MessageSquareReply,
  MessageSquareText,
  RefreshCw,
  UsersRound,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { format, subDays } from 'date-fns';
import type { MessagingReportSummary } from '@maevelle/contracts/messaging';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ErrorState, LoadingState } from '@/components/ui/page-shell';
import * as api from './api';

export function ReportsView() {
  const defaults = useMemo(
    () => ({
      from: format(subDays(new Date(), 30), 'yyyy-MM-dd'),
      to: format(new Date(), 'yyyy-MM-dd'),
    }),
    [],
  );
  const [range, setRange] = useState(defaults);
  const [report, setReport] = useState<MessagingReportSummary | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

  async function load(customRange?: { from: string; to: string }) {
    const activeRange = customRange ?? range;
    setState('loading');
    try {
      const summary = await api.getReport({
        from: new Date(`${activeRange.from}T00:00:00`).toISOString(),
        to: new Date(`${activeRange.to}T23:59:59.999`).toISOString(),
      });
      setReport(summary);
      setState('ready');
    } catch {
      setState('error');
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function setPresetDays(days: number) {
    const next = {
      from: format(subDays(new Date(), days), 'yyyy-MM-dd'),
      to: format(new Date(), 'yyyy-MM-dd'),
    };
    setRange(next);
    void load(next);
  }

  if (state === 'loading' && !report)
    return <LoadingState message="Building messaging report…" className="h-full" />;
  if (state === 'error' && !report)
    return (
      <ErrorState
        title="Report unavailable"
        message="The messaging report could not be loaded."
        onRetry={() => void load()}
        className="m-4"
      />
    );
  if (!report) return null;

  const totals = report.totals;

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        {/* Date Filters & Presets */}
        <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex flex-wrap items-end gap-3">
            <label className="space-y-1 text-sm font-medium">
              From
              <Input
                type="date"
                value={range.from}
                onChange={(event) => setRange({ ...range, from: event.target.value })}
              />
            </label>
            <label className="space-y-1 text-sm font-medium">
              To
              <Input
                type="date"
                value={range.to}
                onChange={(event) => setRange({ ...range, to: event.target.value })}
              />
            </label>
            <Button onClick={() => void load()}>Apply range</Button>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 pt-1 sm:pt-0">
            <span className="text-xs text-muted-foreground mr-1">Quick presets:</span>
            <Button variant="outline" size="sm" onClick={() => setPresetDays(7)}>
              7 days
            </Button>
            <Button variant="outline" size="sm" onClick={() => setPresetDays(30)}>
              30 days
            </Button>
            <Button variant="outline" size="sm" onClick={() => setPresetDays(90)}>
              90 days
            </Button>
          </div>
        </div>

        {/* Top-Level Operational KPIs */}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric
            icon={MessageSquareText}
            label="Total conversations"
            value={String(totals.total ?? 0)}
          />
          <Metric
            icon={Clock3}
            label="Avg. first response"
            value={duration(report.response.averageFirstResponseSeconds)}
            subtext={`${report.response.firstResponseCount} responses measured`}
          />
          <Metric
            icon={CheckCircle2}
            label="Avg. resolution time"
            value={duration(report.response.averageResolutionSeconds)}
            subtext={`${report.response.resolutionCount} resolved`}
          />
          <Metric
            icon={UsersRound}
            label="Active agents"
            value={String(report.byAgent.length)}
            subtext="with assigned or reply activity"
          />
        </div>

        {/* Secondary Metrics: Messages, Unanswered & Reopened */}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric
            icon={Inbox}
            label="Inbound customer messages"
            value={String(totals.inboundMessages ?? 0)}
          />
          <Metric
            icon={MessageSquareReply}
            label="Outbound staff replies"
            value={String(totals.outboundMessages ?? 0)}
          />
          <Metric
            icon={HelpCircle}
            label="Unanswered conversations"
            value={String(totals.unanswered ?? 0)}
            highlight={Boolean(totals.unanswered && totals.unanswered > 0)}
          />
          <Metric
            icon={RefreshCw}
            label="Reopened conversations"
            value={String(totals.reopened ?? 0)}
          />
        </div>

        {/* Conversation Status Distribution & Follow-ups */}
        <div className="grid gap-4 lg:grid-cols-2">
          {/* Status Breakdown */}
          <section className="rounded-xl border border-border bg-card p-4">
            <h3 className="text-sm font-semibold">Conversation status breakdown</h3>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <StatusCard label="New" count={totals.new ?? 0} />
              <StatusCard label="Open" count={totals.open ?? 0} />
              <StatusCard label="Pending" count={totals.pending ?? 0} />
              <StatusCard label="Resolved" count={totals.resolved ?? 0} />
              <StatusCard label="Closed" count={totals.closed ?? 0} />
            </div>
          </section>

          {/* Follow-ups Breakdown */}
          <section className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center gap-2">
              <CalendarClock className="size-4 text-primary" />
              <h3 className="text-sm font-semibold">Follow-up operations</h3>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-border bg-muted/30 p-3">
                <p className="text-xs text-muted-foreground">Pending reminders</p>
                <p className="mt-2 font-mono text-2xl font-semibold tabular-nums">
                  {totals.pendingFollowUps ?? 0}
                </p>
              </div>
              <div
                className={`rounded-xl border p-3 ${
                  totals.overdueFollowUps
                    ? 'border-destructive/40 bg-destructive/10'
                    : 'border-border bg-muted/30'
                }`}
              >
                <p className="text-xs text-muted-foreground">Overdue follow-ups</p>
                <p
                  className={`mt-2 font-mono text-2xl font-semibold tabular-nums ${
                    totals.overdueFollowUps ? 'text-destructive' : ''
                  }`}
                >
                  {totals.overdueFollowUps ?? 0}
                </p>
              </div>
            </div>
          </section>
        </div>

        {/* Channel Distribution & Agent Workload */}
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Volume by channel</h3>
              <Badge variant="outline" className="text-xs">
                {report.byChannel.length} channel{report.byChannel.length === 1 ? '' : 's'}
              </Badge>
            </div>
            <div className="mt-4 space-y-3">
              {report.byChannel.map((item) => {
                const max = Math.max(1, ...report.byChannel.map((row) => row.count));
                return (
                  <div key={item.channelKind}>
                    <div className="mb-1 flex justify-between text-xs">
                      <span className="flex items-center gap-1.5 font-medium">
                        <MessageCircle className="size-3.5 text-primary" />
                        {item.channelKind.toLowerCase()}
                      </span>
                      <span className="font-mono tabular-nums">{item.count}</span>
                    </div>
                    <div className="h-2 rounded-full bg-muted">
                      <div
                        className="h-2 rounded-full bg-primary transition-colors"
                        style={{ width: `${(item.count / max) * 100}%` }}
                      />
                    </div>
                  </div>
                );
              })}
              {!report.byChannel.length ? (
                <p className="py-6 text-center text-xs text-muted-foreground">
                  No conversation activity in this period.
                </p>
              ) : null}
            </div>
          </section>

          <section className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Agent workload & replies</h3>
              <Badge variant="outline" className="text-xs">
                {report.byAgent.length} agent{report.byAgent.length === 1 ? '' : 's'}
              </Badge>
            </div>
            <div className="mt-3 divide-y divide-border">
              {report.byAgent.map((agent) => (
                <div
                  key={agent.membershipId}
                  className="grid grid-cols-[1fr_auto_auto] items-center gap-3 py-2.5 text-sm"
                >
                  <span className="truncate font-medium">{agent.displayName}</span>
                  <span className="font-mono text-xs tabular-nums text-muted-foreground">
                    {agent.assigned} assigned
                  </span>
                  <Badge variant="secondary" className="font-mono text-xs tabular-nums">
                    {agent.outboundMessages} replies
                  </Badge>
                </div>
              ))}
              {!report.byAgent.length ? (
                <p className="py-6 text-center text-xs text-muted-foreground">
                  No agent activity recorded in this period.
                </p>
              ) : null}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  subtext,
  highlight,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  subtext?: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-4 shadow-2xs ${
        highlight ? 'border-warning/50 bg-warning/5' : 'border-border bg-card'
      }`}
    >
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="size-4 text-primary" />
        {label}
      </div>
      <p
        className={`mt-2 font-mono text-2xl font-semibold tabular-nums ${
          highlight ? 'text-warning' : ''
        }`}
      >
        {value}
      </p>
      {subtext ? <p className="mt-1 text-[11px] text-muted-foreground">{subtext}</p> : null}
    </div>
  );
}

function StatusCard({ label, count }: { label: string; count: number }) {
  return (
    <div className="rounded-xl border border-border bg-muted/20 p-2.5 text-center">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-mono text-lg font-semibold tabular-nums">{count}</p>
    </div>
  );
}

function duration(seconds: number | null) {
  if (seconds === null) return '—';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${(seconds / 3600).toFixed(1)}h`;
}

