'use client';

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { CartAnalyticsDayDto } from '@maevelle/contracts';
import { PagePanel } from '@/components/ui/page-shell';

export function CartTrend({
  title,
  from,
  to,
  rows,
}: {
  title: string;
  from: string;
  to: string;
  rows: readonly CartAnalyticsDayDto[];
}) {
  if (!rows.length) return null;
  const counts = new Map(rows.map(({ day, count }) => [day, Number(count)]));
  const data = [];
  for (let time = Date.parse(from); time <= Date.parse(to); time += 86_400_000) {
    const day = new Date(time).toISOString().slice(0, 10);
    data.push({ day, count: counts.get(day) ?? 0 });
  }

  return (
    <PagePanel className="min-w-0 space-y-3">
      <h3 className="text-sm font-semibold">{title}</h3>
      <div className="h-56 w-full min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} accessibilityLayer>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis
              dataKey="day"
              tickFormatter={(day: string) => day.slice(5)}
              minTickGap={28}
              fontSize={11}
            />
            <YAxis allowDecimals={false} width={44} fontSize={11} />
            <Tooltip
              content={({ active, payload, label }) =>
                active && payload?.length ? (
                  <div className="rounded-md border border-border bg-card p-2 text-xs font-mono tabular-nums shadow-md">
                    {label} · {Number(payload[0]?.value).toLocaleString()}
                  </div>
                ) : null
              }
            />
            <Bar dataKey="count" name={title} fill="var(--chart-1)" isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="text-xs text-muted-foreground">
        Blank days have no records in this report. Coverage may vary.
      </p>
      <details className="text-sm">
        <summary className="cursor-pointer text-muted-foreground">Recorded daily counts</summary>
        <dl className="mt-2 grid max-h-44 grid-cols-[1fr_auto] gap-x-4 gap-y-1 overflow-auto font-mono tabular-nums">
          {rows.map(({ day, count }) => (
            <div key={day} className="contents">
              <dt>{day}</dt>
              <dd className="text-right">{BigInt(count).toLocaleString()}</dd>
            </div>
          ))}
        </dl>
      </details>
    </PagePanel>
  );
}
