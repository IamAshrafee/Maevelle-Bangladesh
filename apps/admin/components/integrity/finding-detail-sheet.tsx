'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  ExternalLink,
  History,
  Info,
  Lock,
  RefreshCw,
  ShieldAlert,
  Wrench,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { StatusBadge } from '@/components/status-badge';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { PagePanel } from '@/components/ui/page-shell';
import { useAdminCapability } from '@/components/admin-capabilities';
import {
  fetchIntegrityFinding,
  updateFindingStatus,
} from '@/lib/integrity/api';
import type {
  IntegrityFindingDetailDto,
  IntegrityFindingListItemDto,
} from '@/lib/integrity/types';

interface FindingDetailSheetProps {
  finding: IntegrityFindingListItemDto | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRefreshList: () => void;
  onStartRepair: (finding: IntegrityFindingDetailDto) => void;
}

export function FindingDetailSheet({
  finding,
  open,
  onOpenChange,
  onRefreshList,
  onStartRepair,
}: FindingDetailSheetProps) {
  const [detail, setDetail] = React.useState<IntegrityFindingDetailDto | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Status mutation state
  const [targetStatus, setTargetStatus] = React.useState<'OPEN' | 'INVESTIGATING' | 'ACCEPTED'>('OPEN');
  const [acceptedReason, setAcceptedReason] = React.useState('');
  const [updatingStatus, setUpdatingStatus] = React.useState(false);
  const [statusFeedback, setStatusFeedback] = React.useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const canViewFinance = useAdminCapability('finance.view');
  const canRepair = useAdminCapability('admin.integrity.repair');

  // Load finding detail
  React.useEffect(() => {
    if (!finding?.id || !open) {
      setDetail(null);
      setError(null);
      setStatusFeedback(null);
      return;
    }

    let active = true;
    setLoading(true);
    setError(null);

    fetchIntegrityFinding(finding.id)
      .then((data) => {
        if (active) {
          setDetail(data);
          setTargetStatus(
            data.status === 'ACCEPTED'
              ? 'ACCEPTED'
              : data.status === 'INVESTIGATING'
                ? 'INVESTIGATING'
                : 'OPEN',
          );
        }
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : 'Failed to load finding details.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [finding?.id, open]);

  if (!finding) return null;

  const handleUpdateStatus = async () => {
    if (!detail) return;
    if (targetStatus === 'ACCEPTED' && acceptedReason.trim().length < 8) {
      setStatusFeedback({
        type: 'error',
        message: 'An acceptance rationale of at least 8 characters is required.',
      });
      return;
    }

    setUpdatingStatus(true);
    setStatusFeedback(null);

    try {
      await updateFindingStatus(detail.id, {
        version: Number(detail.version),
        status: targetStatus,
        reason: targetStatus === 'ACCEPTED' ? acceptedReason.trim() : undefined,
      });

      setStatusFeedback({
        type: 'success',
        message: `Status updated to ${targetStatus}.`,
      });

      // Reload detail & refresh list
      const updated = await fetchIntegrityFinding(detail.id);
      setDetail(updated);
      onRefreshList();
    } catch (err) {
      setStatusFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to update finding status.',
      });
    } finally {
      setUpdatingStatus(false);
    }
  };

  // Helper to determine business impact text
  const getBusinessImpact = (code: string, domain: string) => {
    switch (code) {
      case 'RATING_SUMMARY_DRIFT':
        return 'Customer-facing product rating count or average score does not match the sum of approved visible reviews. This can mislead shoppers or degrade search relevance.';
      case 'ACTIVE_DUPLICATE_REVIEW':
        return 'A single customer has multiple published reviews for the same product, which can distort review credibility and aggregated rating statistics.';
      case 'ORDER_CUSTOMER_TENANT_MISMATCH':
        return 'Critical tenant boundary violation: an Order is linked to a Customer belonging to a different Organization.';
      case 'FULFILLMENT_QUANTITY_EXCEEDS_ORDER':
        return 'Dispatched or active fulfillment items exceed the authorized purchase quantity on the original order line, risking inventory loss or over-dispatch.';
      case 'DELIVERY_FULFILLMENT_ORDER_MISMATCH':
        return 'Delivery manifest refers to a different Order than its parent Fulfillment entity, causing tracking and courier reconciliation errors.';
      case 'DEAD_LETTER_JOB':
        return 'A background job exhausted maximum retry attempts and was moved to dead-letter queue. Operations must investigate to prevent lost side effects.';
      case 'UNKNOWN_INTEGRATION_OUTCOME':
        return 'External provider API call timed out with uncertain completion. Blind replay is blocked to avoid duplicate charges or duplicate shipments.';
      default:
        if (domain === 'Finance') {
          return 'Financial records or ledger entries show inconsistency with source transactions or balance projections. Authoritative accounting reconciliation required.';
        }
        if (domain === 'Inventory') {
          return 'Physical stock reservations or condition balances do not reconcile with ledger movements, risking inventory stockouts or overselling.';
        }
        return 'Data invariant check identified inconsistency between authoritative state and downstream projections.';
    }
  };

  // Helper for entity link
  const getEntityDestination = (entityType: string | null, entityId: string | null) => {
    if (!entityType || !entityId) return null;
    switch (entityType.toLowerCase()) {
      case 'orders.order':
        return { href: `/orders?order=${entityId}`, label: 'View Order in Orders Workspace' };
      case 'customers.customer':
        return { href: `/customers?customer=${entityId}`, label: 'View Customer Profile' };
      case 'catalog.product':
        return { href: `/products?product=${entityId}`, label: 'View Product in Catalog' };
      case 'delivery.delivery':
        return { href: `/deliveries?delivery=${entityId}`, label: 'View Delivery Shipment' };
      case 'reviews.review':
        return { href: `/reviews?review=${entityId}`, label: 'View Review in Moderation' };
      case 'assets.asset':
        return { href: `/assets`, label: 'View Asset in Fixed Assets' };
      case 'media.asset':
        return { href: `/media`, label: 'View Media Asset' };
      default:
        return null;
    }
  };

  const entityDest = getEntityDestination(finding.entity_type, finding.entity_id);
  const isFinanceProtected = finding.domain === 'Finance' && !canViewFinance;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-xl md:max-w-2xl w-full overflow-y-auto p-0 flex flex-col h-full bg-background">
        {/* Header */}
        <div className="p-6 border-b border-border bg-card sticky top-0 z-10 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <StatusBadge status={finding.severity} />
              <StatusBadge status={finding.status} />
              {finding.occurrence_count > 1 && (
                <span className="text-2xs px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-400 font-mono font-semibold">
                  {finding.occurrence_count} occurrences
                </span>
              )}
            </div>
            <span className="text-2xs font-mono text-muted-foreground">
              v{detail?.version ?? finding.version}
            </span>
          </div>

          <div>
            <SheetTitle className="text-xl font-bold text-foreground">
              {finding.summary}
            </SheetTitle>
            <SheetDescription className="text-xs text-muted-foreground mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
              <span>Domain: <strong className="text-foreground">{finding.domain}</strong></span>
              <span>·</span>
              <span>Check: <code className="font-mono text-primary">{finding.check_id}</code></span>
              <span>·</span>
              <span>Code: <code className="font-mono">{finding.code}</code></span>
            </SheetDescription>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-6 flex-1">
          {loading && !detail ? (
            <div className="flex h-48 flex-col items-center justify-center gap-2 text-muted-foreground">
              <RefreshCw className="size-5 animate-spin text-primary" />
              <p className="text-xs">Loading comprehensive evidence and timeline…</p>
            </div>
          ) : error ? (
            <PagePanel className="p-4 border-rose-200 bg-rose-50/50 text-rose-800 text-sm">
              {error}
            </PagePanel>
          ) : (
            <>
              {/* 1. Business Impact & Explanation */}
              <div className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Business Impact
                </h4>
                <div className="p-4 rounded-xl border border-border bg-card text-sm leading-relaxed text-foreground">
                  {getBusinessImpact(finding.code, finding.domain)}
                </div>
              </div>

              {/* 2. Expected vs Observed Comparison Panel */}
              <div className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Expected vs Observed Evidence
                </h4>
                {isFinanceProtected ? (
                  <PagePanel className="p-4 border-amber-200 bg-amber-50/40 dark:bg-amber-950/20 text-amber-800 dark:text-amber-300 text-xs flex items-center gap-2.5">
                    <Lock className="size-4 shrink-0 text-amber-600" />
                    <span>
                      Financial evidence details are restricted. Your role requires <code className="font-mono font-semibold">finance.view</code> permission to inspect authoritative amounts.
                    </span>
                  </PagePanel>
                ) : (
                  <div className="overflow-hidden rounded-xl border border-border bg-card">
                    <table className="w-full text-xs">
                      <tbody>
                        <tr className="border-b border-border">
                          <td className="p-3 font-medium text-muted-foreground w-1/3 bg-muted/20">
                            Expected Invariant
                          </td>
                          <td className="p-3 font-mono font-semibold text-emerald-700 dark:text-emerald-400">
                            {finding.details.expected ?? 'Consistent state (0 discrepancy)'}
                          </td>
                        </tr>
                        <tr className="border-b border-border">
                          <td className="p-3 font-medium text-muted-foreground w-1/3 bg-muted/20">
                            Observed Reality
                          </td>
                          <td className="p-3 font-mono font-semibold text-rose-700 dark:text-rose-400">
                            {finding.details.observed ?? 'Discrepancy detected during scan'}
                          </td>
                        </tr>
                        <tr>
                          <td className="p-3 font-medium text-muted-foreground w-1/3 bg-muted/20">
                            Confidence Assessment
                          </td>
                          <td className="p-3">
                            <span className="font-semibold text-foreground">
                              {finding.confidence}
                            </span>{' '}
                            <span className="text-muted-foreground">
                              (Evaluated via authoritative PostgreSQL verifier)
                            </span>
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* 3. Affected Business Entity */}
              <div className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Affected Domain Record
                </h4>
                <div className="p-4 rounded-xl border border-border bg-card flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-0.5 min-w-0">
                    <p className="text-xs text-muted-foreground">
                      Entity Type: <span className="font-mono text-foreground font-medium">{finding.entity_type ?? 'Global / Module'}</span>
                    </p>
                    <p className="text-xs font-mono text-foreground break-all">
                      {finding.entity_id ?? 'No single entity ID (aggregate discrepancy)'}
                    </p>
                  </div>
                  {entityDest && (
                    <Button
                      variant="outline"
                      size="sm"
                      render={
                        <Link href={entityDest.href} target="_blank">
                          {entityDest.label}
                          <ExternalLink className="size-3 ml-1" />
                        </Link>
                      }
                      className="shrink-0 h-8 text-xs cursor-pointer"
                    />
                  )}
                </div>
              </div>

              {/* 4. Recovery & Safe Repair Action */}
              <div className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Recovery & Repair
                </h4>
                <div className="p-4 rounded-xl border border-border bg-card space-y-3">
                  {finding.repairability === 'REBUILDABLE_PROJECTION' ? (
                    <div className="space-y-3">
                      <div className="flex items-start gap-2.5 text-xs text-muted-foreground">
                        <Wrench className="size-4 text-primary shrink-0 mt-0.5" />
                        <div>
                          <p className="font-semibold text-foreground">Safe Projection Rebuild Available</p>
                          <p className="mt-0.5">
                            This discrepancy affects a derived read projection that can be rebuilt from authoritative source records without mutating transactional truth.
                          </p>
                        </div>
                      </div>

                      {canRepair ? (
                        detail && (
                          <Button
                            size="sm"
                            onClick={() => onStartRepair(detail)}
                            className="w-full sm:w-auto cursor-pointer"
                          >
                            <Wrench className="size-3.5 mr-1.5" />
                            Preview & Execute Repair
                          </Button>
                        )
                      ) : (
                        <p className="text-xs text-amber-600 dark:text-amber-400">
                          Your role does not possess <code className="font-mono font-semibold">admin.integrity.repair</code> capability.
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="flex items-start gap-2.5 text-xs text-muted-foreground">
                      <Info className="size-4 text-muted-foreground shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <p className="font-semibold text-foreground">Diagnosis Only — Manual Reconciliation Required</p>
                        <p className="leading-relaxed">
                          Transactional facts (Orders, Inventory ledgers, Finance entries) are immutable. System Integrity does not perform blind balance corrections or artificial offsetting movements.
                        </p>
                        {entityDest && (
                          <div className="pt-2">
                            <Button
                              variant="outline"
                              size="sm"
                              render={
                                <Link href={entityDest.href}>
                                  Open authoritative workflow
                                  <ArrowRight className="size-3 ml-1" />
                                </Link>
                              }
                              className="h-7 text-xs"
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* 5. Investigation Status Management */}
              <div className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Investigation Status & Tolerance
                </h4>
                <div className="p-4 rounded-xl border border-border bg-card space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setTargetStatus('OPEN')}
                      className={`px-3 py-1.5 rounded-lg border text-xs font-medium cursor-pointer transition-colors ${
                        targetStatus === 'OPEN'
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-muted/50 border-border text-muted-foreground hover:bg-muted'
                      }`}
                    >
                      Open
                    </button>
                    <button
                      type="button"
                      onClick={() => setTargetStatus('INVESTIGATING')}
                      className={`px-3 py-1.5 rounded-lg border text-xs font-medium cursor-pointer transition-colors ${
                        targetStatus === 'INVESTIGATING'
                          ? 'bg-amber-600 text-white border-amber-600'
                          : 'bg-muted/50 border-border text-muted-foreground hover:bg-muted'
                      }`}
                    >
                      Investigating
                    </button>
                    <button
                      type="button"
                      onClick={() => setTargetStatus('ACCEPTED')}
                      className={`px-3 py-1.5 rounded-lg border text-xs font-medium cursor-pointer transition-colors ${
                        targetStatus === 'ACCEPTED'
                          ? 'bg-slate-700 text-white border-slate-700'
                          : 'bg-muted/50 border-border text-muted-foreground hover:bg-muted'
                      }`}
                    >
                      Accept as Tolerated
                    </button>
                  </div>

                  {targetStatus === 'ACCEPTED' && (
                    <div className="space-y-1.5 pt-1">
                      <label className="text-xs font-semibold text-foreground">
                        Acceptance Rationale (Required, min 8 characters)
                      </label>
                      <Textarea
                        value={acceptedReason}
                        onChange={(e) => setAcceptedReason(e.target.value)}
                        placeholder="Explain why this discrepancy is currently tolerated or accepted (e.g. known supplier timing variance, documented test artifact)..."
                        className="text-xs min-h-[70px]"
                      />
                    </div>
                  )}

                  {statusFeedback && (
                    <div
                      className={`text-xs p-2.5 rounded-lg border ${
                        statusFeedback.type === 'success'
                          ? 'bg-emerald-50/50 border-emerald-200 text-emerald-800'
                          : 'bg-rose-50/50 border-rose-200 text-rose-800'
                      }`}
                    >
                      {statusFeedback.message}
                    </div>
                  )}

                  <div className="pt-1">
                    <Button
                      size="sm"
                      onClick={handleUpdateStatus}
                      disabled={updatingStatus || targetStatus === detail?.status}
                      className="cursor-pointer"
                    >
                      {updatingStatus ? (
                        <>
                          <RefreshCw className="size-3.5 animate-spin mr-1.5" />
                          Updating…
                        </>
                      ) : (
                        'Save Status Change'
                      )}
                    </Button>
                  </div>
                </div>
              </div>

              {/* 6. Timeline & Occurrence History */}
              {detail?.events && detail.events.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <History className="size-3.5" />
                    Lifecycle Timeline & Audit Events
                  </h4>
                  <div className="rounded-xl border border-border bg-card p-4 space-y-3">
                    <div className="relative pl-6 space-y-4 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-border">
                      {detail.events.map((evt, idx) => (
                        <div key={idx} className="relative space-y-1 text-xs">
                          <div className="absolute -left-6 top-1 size-2 rounded-full bg-primary" />
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-foreground">{evt.event_type}</span>
                            {evt.to_status && (
                              <span className="text-2xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono">
                                → {evt.to_status}
                              </span>
                            )}
                            <span className="text-2xs text-muted-foreground">
                              {new Date(evt.created_at).toLocaleString('en-BD')}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
