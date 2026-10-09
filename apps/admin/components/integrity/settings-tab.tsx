'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  Bell,
  Calendar,
  Clock,
  ExternalLink,
  Info,
  Lock,
  Radio,
  Shield,
  Sliders,
  SlidersHorizontal,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PagePanel, PageSection } from '@/components/ui/page-shell';

export function SettingsTab() {
  return (
    <div className="space-y-6">
      {/* 1. Scheduled Cadences Overview */}
      <PageSection
        title="Automated Integrity Scan Cadence"
        description="Automated schedules run deterministically in the background via the leased Worker service."
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <PagePanel className="p-5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-sm text-foreground flex items-center gap-1.5">
                <Clock className="size-4 text-sky-500" /> Hourly Frequent Checks
              </span>
              <span className="px-2 py-0.5 rounded bg-sky-500/10 text-sky-700 dark:text-sky-300 font-semibold font-mono text-2xs">
                EVERY 1 HOUR
              </span>
            </div>
            <p className="text-muted-foreground leading-relaxed">
              Lightweight checks that evaluate high-velocity operational state, dead-letter jobs, notification webhooks, and payment allocations.
            </p>
            <div className="pt-2 border-t border-border/60 space-y-1">
              <p className="font-semibold text-foreground">Included Checks:</p>
              <ul className="list-disc pl-4 space-y-0.5 text-muted-foreground font-mono text-2xs">
                <li>payments.core (Payment & Refund allocation totals)</li>
                <li>notifications.integrations (Template & webhook evidence)</li>
                <li>platform.recovery (Dead-letter jobs & unknown integration outcomes)</li>
              </ul>
            </div>
          </PagePanel>

          <PagePanel className="p-5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-sm text-foreground flex items-center gap-1.5">
                <Calendar className="size-4 text-primary" /> Nightly Comprehensive Scans
              </span>
              <span className="px-2 py-0.5 rounded bg-primary/10 text-primary font-semibold font-mono text-2xs">
                00:00 ASIA/DHAKA
              </span>
            </div>
            <p className="text-muted-foreground leading-relaxed">
              Deep invariant cross-checks evaluating costing layers, double-entry finance, inventory condition ledgers, and catalog relationships.
            </p>
            <div className="pt-2 border-t border-border/60 space-y-1">
              <p className="font-semibold text-foreground">Included Checks:</p>
              <ul className="list-disc pl-4 space-y-0.5 text-muted-foreground font-mono text-2xs">
                <li>inventory.core, costing.core, returns.core</li>
                <li>finance.core, commerce.relationships, reviews.projection</li>
                <li>analytics.projection, supply.assets.provenance, media.metadata</li>
              </ul>
            </div>
          </PagePanel>
        </div>
      </PageSection>

      {/* 2. Deduplication & Concurrency Policy */}
      <PageSection
        title="Concurrency & Execution Architecture"
        description="Deterministic bucket keys prevent overlapping duplicate scans across distributed workers."
      >
        <PagePanel className="p-5 space-y-3 text-xs">
          <div className="space-y-1">
            <h4 className="font-semibold text-foreground">Deterministic Execution Keys</h4>
            <p className="text-muted-foreground leading-relaxed">
              Hourly scans use keys matching <code className="font-mono text-primary">frequent:YYYY-MM-DDTHH</code>, and nightly scans use <code className="font-mono text-primary">nightly:YYYY-MM-DD</code>. If multiple workers trigger at the same time, the unique PostgreSQL index rejects duplicate jobs with conflict avoidance.
            </p>
          </div>

          <div className="space-y-1 pt-2 border-t border-border/60">
            <h4 className="font-semibold text-foreground">Timezone Alignment</h4>
            <p className="text-muted-foreground leading-relaxed">
              All nightly schedules trigger at 18:00 UTC, which corresponds to midnight (00:00 BST) in the configured organizational timezone (<strong>Asia/Dhaka, UTC+6</strong>).
            </p>
          </div>
        </PagePanel>
      </PageSection>

      {/* 3. Alert Routing Configuration */}
      <PageSection
        title="Notification & Alert Routing"
        description="Automated alerts emitted when new critical inconsistencies are detected."
      >
        <PagePanel className="p-5 space-y-3 text-xs">
          <div className="flex items-start gap-3">
            <Bell className="size-5 text-primary shrink-0 mt-0.5" />
            <div className="space-y-1.5">
              <h4 className="font-semibold text-foreground">Critical Finding Outbox Events</h4>
              <p className="text-muted-foreground leading-relaxed">
                When a new <strong className="text-rose-600">CRITICAL</strong> finding is detected, the integrity engine emits an outbox event (<code className="font-mono">integrity.critical_finding.detected</code>). Staff members possessing the <code className="font-mono">admin.integrity.view</code> capability receive an operational notification with direct link to the finding.
              </p>
              <div className="pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  render={
                    <Link href="/notifications?tab=rules">
                      View Dispatch Rules in Notifications Center
                      <ExternalLink className="size-3 ml-1" />
                    </Link>
                  }
                  className="h-8 text-xs"
                />
              </div>
            </div>
          </div>
        </PagePanel>
      </PageSection>
    </div>
  );
}
