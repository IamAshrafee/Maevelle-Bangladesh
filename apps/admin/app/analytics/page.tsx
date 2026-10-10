import { Suspense } from 'react';
import { AnalyticsWorkspace } from '@/components/analytics/analytics-workspace';

export default function AnalyticsPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-background p-6 space-y-6">
          <div className="h-10 w-64 bg-muted/40 animate-pulse rounded-md" />
          <div className="h-12 w-full bg-muted/30 animate-pulse rounded-md" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="h-28 bg-card border border-border/60 animate-pulse rounded-lg" />
            <div className="h-28 bg-card border border-border/60 animate-pulse rounded-lg" />
            <div className="h-28 bg-card border border-border/60 animate-pulse rounded-lg" />
            <div className="h-28 bg-card border border-border/60 animate-pulse rounded-lg" />
          </div>
          <div className="h-80 bg-card border border-border/60 animate-pulse rounded-lg" />
        </main>
      }
    >
      <AnalyticsWorkspace />
    </Suspense>
  );
}
