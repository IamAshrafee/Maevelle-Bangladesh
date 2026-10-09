'use client';

import * as React from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Info,
  Layers,
  Lock,
  RefreshCw,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Wrench,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/status-badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { PagePanel, PageSection } from '@/components/ui/page-shell';
import { useAdminCapability } from '@/components/admin-capabilities';
import type {
  IntegrityFindingDetailDto,
  IntegrityFindingListItemDto,
} from '@/lib/integrity/types';

interface RecoveryTabProps {
  repairableFindings: readonly IntegrityFindingListItemDto[];
  loading: boolean;
  onRefresh: () => void;
  onStartRepair: (finding: IntegrityFindingDetailDto) => void;
  onOpenFinding: (finding: IntegrityFindingListItemDto) => void;
}

export function RecoveryTab({
  repairableFindings,
  loading,
  onRefresh,
  onStartRepair,
  onOpenFinding,
}: RecoveryTabProps) {
  const canRepair = useAdminCapability('admin.integrity.repair');

  return (
    <div className="space-y-6">
      {/* 1. Recovery Safety Policy Banner */}
      <div className="rounded-xl border border-teal-500/30 bg-teal-500/5 p-5 text-xs space-y-2">
        <div className="flex items-center gap-2 font-bold text-foreground text-sm">
          <ShieldCheck className="size-4 text-teal-600" />
          Authoritative Recovery Boundaries
        </div>
        <p className="text-muted-foreground leading-relaxed max-w-3xl">
          System Integrity recovery workflows are strictly restricted to <strong>allow-listed, deterministic read projections</strong> (such as Product review rating aggregates and Organization analytics fact projections). Invariant violations in Orders, Inventory, Payments, and Finance require operator investigation via authoritative domain workflows.
        </p>
      </div>

      {/* 2. Open Repairable Projections */}
      <PageSection
        title={`Pending Repairable Projections (${repairableFindings.length})`}
        description="Findings where authoritative source data is intact and derived read projections can be safely recalculated."
        actions={
          <Button variant="outline" size="sm" onClick={onRefresh} disabled={loading} className="h-8 text-xs">
            <RefreshCw className={`size-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        }
      >
        {repairableFindings.length === 0 ? (
          <PagePanel className="p-8 text-center space-y-2">
            <CheckCircle2 className="size-8 text-emerald-500 mx-auto" />
            <h4 className="text-sm font-semibold text-foreground">No repairable projection drift detected</h4>
            <p className="text-xs text-muted-foreground max-w-md mx-auto">
              All review rating summaries and analytics facts are in full agreement with underlying transactional records.
            </p>
          </PagePanel>
        ) : (
          <div className="space-y-3">
            {repairableFindings.map((finding) => (
              <div
                key={finding.id}
                className="p-4 rounded-xl border border-border bg-card flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-primary/40 transition-colors"
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={finding.severity} />
                    <span className="text-sm font-bold text-foreground">{finding.summary}</span>
                    <span className="text-xs font-mono px-2 py-0.5 rounded bg-muted text-muted-foreground">
                      {finding.domain}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    <span>Code: <code className="font-mono">{finding.code}</code></span>
                    <span>·</span>
                    <span>Target: <code className="font-mono">{finding.entity_id ?? 'Global'}</code></span>
                    <span>·</span>
                    <span>Detected: {new Date(finding.last_detected_at).toLocaleString('en-BD')}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => onOpenFinding(finding)}
                  >
                    Investigate
                  </Button>
                  {canRepair && (
                    <Button
                      size="sm"
                      className="h-8 text-xs cursor-pointer"
                      onClick={() => onOpenFinding(finding)}
                    >
                      <Wrench className="size-3 mr-1.5" />
                      Rebuild & Verify
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </PageSection>

      {/* 3. Non-Repairable Invariant Reference Card */}
      <PagePanel className="p-5 space-y-3">
        <h4 className="text-sm font-bold text-foreground flex items-center gap-2">
          <Info className="size-4 text-muted-foreground" />
          Transactional Invariants (Diagnosis-Only)
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-muted-foreground">
          <div className="p-3 rounded-lg border border-border bg-muted/20 space-y-1">
            <span className="font-semibold text-foreground">Inventory & Reservations</span>
            <p className="leading-relaxed">
              Stock movement ledgers and reservations cannot be forcefully corrected. If discrepancies exist, perform physical stocktakes or terminal order reconciliations in the Inventory module.
            </p>
          </div>
          <div className="p-3 rounded-lg border border-border bg-muted/20 space-y-1">
            <span className="font-semibold text-foreground">Finance & Double-Entry Ledgers</span>
            <p className="leading-relaxed">
              Account balances derive from immutable double-entry journal postings. System Integrity does not inject balancing entries or fabricate cash reconciliations.
            </p>
          </div>
          <div className="p-3 rounded-lg border border-border bg-muted/20 space-y-1">
            <span className="font-semibold text-foreground">Orders, Fulfillments & Deliveries</span>
            <p className="leading-relaxed">
              Quantity mismatches or tenant violations reflect business relationship drift. Resolve via standard Order cancellations, return receipts, or delivery updates.
            </p>
          </div>
          <div className="p-3 rounded-lg border border-border bg-muted/20 space-y-1">
            <span className="font-semibold text-foreground">External Provider Integrations</span>
            <p className="leading-relaxed">
              Operations with unknown provider outcomes (SMS, email, bKash) are flagged for human verification to prevent duplicate charges or duplicate shipments.
            </p>
          </div>
        </div>
      </PagePanel>
    </div>
  );
}
