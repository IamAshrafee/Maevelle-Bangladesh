'use client';

import { Clock3, MessageSquareText, UsersRound } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { format, subDays } from 'date-fns';
import type { MessagingReportSummary } from '@maevelle/contracts/messaging';
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
  async function load() {
    setState('loading');
    try {
      setReport(
        await api.getReport({
          from: new Date(`${range.from}T00:00:00`).toISOString(),
          to: new Date(`${range.to}T23:59:59.999`).toISOString(),
        }),
      );
      setState('ready');
    } catch {
      setState('error');
    }
  }
  useEffect(() => {
    void load();
  }, []);
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
  const total = Object.values(report.totals).reduce((sum, value) => sum + value, 0);
  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6">
      <div className="mx-auto max-w-6xl space-y-5">
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-end">
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
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric icon={MessageSquareText} label="Conversation events" value={String(total)} />
          <Metric
            icon={Clock3}
            label="Avg. first response"
            value={duration(report.response.averageFirstResponseSeconds)}
          />
          <Metric
            icon={Clock3}
            label="Avg. resolution"
            value={duration(report.response.averageResolutionSeconds)}
          />
          <Metric icon={UsersRound} label="Active agents" value={String(report.byAgent.length)} />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="rounded-xl border border-border bg-card p-4">
            <h3 className="font-semibold">By channel</h3>
            <div className="mt-4 space-y-3">
              {report.byChannel.map((item) => {
                const max = Math.max(1, ...report.byChannel.map((row) => row.count));
                return (
                  <div key={item.channelKind}>
                    <div className="mb-1 flex justify-between text-xs">
                      <span>{item.channelKind.toLowerCase()}</span>
                      <span className="font-mono tabular-nums">{item.count}</span>
                    </div>
                    <div className="h-2 rounded-full bg-muted">
                      <div
                        className="h-2 rounded-full bg-primary"
                        style={{ width: `${(item.count / max) * 100}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
          <section className="rounded-xl border border-border bg-card p-4">
            <h3 className="font-semibold">Agent workload</h3>
            <div className="mt-3 divide-y divide-border">
              {report.byAgent.map((agent) => (
                <div
                  key={agent.membershipId}
                  className="grid grid-cols-[1fr_auto_auto] gap-3 py-2 text-sm"
                >
                  <span className="truncate">{agent.displayName}</span>
                  <span className="font-mono text-xs tabular-nums">{agent.assigned} assigned</span>
                  <span className="font-mono text-xs tabular-nums">
                    {agent.outboundMessages} replies
                  </span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function Metric({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-2xs">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="size-4" />
        {label}
      </div>
      <p className="mt-3 font-mono text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}
function duration(seconds: number | null) {
  if (seconds === null) return '—';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${(seconds / 3600).toFixed(1)}h`;
}
