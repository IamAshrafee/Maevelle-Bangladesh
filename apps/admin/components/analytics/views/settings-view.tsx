'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  BookOpen,
  CheckCircle2,
  Database,
  Download,
  ExternalLink,
  Flame,
  Globe,
  Loader2,
  Plug,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';

import { useAdminCapability } from '@/components/admin-capabilities';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { EmptyState, ErrorState, LoadingState, PagePanel, PageSection } from '@/components/ui/page-shell';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  fetchAnalyticsDestinations,
  fetchAnalyticsExports,
  fetchAnalyticsIntegrity,
  fetchMetricCatalog,
  requestAnalyticsExport,
  triggerAnalyticsRebuild,
} from '@/lib/analytics/api';
import {
  formatAnalyticsCount,
  type AnalyticsFreshnessDto,
  type AnalyticsIntegrityFindingDto,
  type AnalyticsMetricDefinitionDto,
  type AnalyticsReportExportDto,
  type AnalyticsReportKeyDto,
  type DateRangeSelection,
  type DestinationStatusDto,
} from '@/lib/analytics/types';

interface SettingsViewProps {
  readonly selection: DateRangeSelection;
  readonly freshness?: AnalyticsFreshnessDto;
  readonly onRebuildCompleted?: () => void;
}

export function SettingsView({ selection, freshness, onRebuildCompleted }: SettingsViewProps) {
  const canManageAnalytics = useAdminCapability('analytics.manage');
  const canExportAnalytics = useAdminCapability('analytics.export');

  const [activeTab, setActiveTab] = React.useState<'pipeline' | 'exports' | 'metrics' | 'destinations' | 'integrity'>('pipeline');

  // Rebuild dialog state
  const [rebuildConfirmOpen, setRebuildConfirmOpen] = React.useState(false);
  const [rebuilding, setRebuilding] = React.useState(false);
  const [rebuildResult, setRebuildResult] = React.useState<string | null>(null);

  // New Export dialog state
  const [exportModalOpen, setExportModalOpen] = React.useState(false);
  const [exportReportKey, setExportReportKey] = React.useState<AnalyticsReportKeyDto>('SALES');
  const [exportSubmitting, setExportSubmitting] = React.useState(false);

  // Data states
  const [exportsList, setExportsList] = React.useState<readonly AnalyticsReportExportDto[]>([]);
  const [metricsCatalog, setMetricsCatalog] = React.useState<readonly AnalyticsMetricDefinitionDto[]>([]);
  const [integrityFindings, setIntegrityFindings] = React.useState<readonly AnalyticsIntegrityFindingDto[]>([]);
  const [destinations, setDestinations] = React.useState<readonly DestinationStatusDto[]>([]);

  const [metricSearch, setMetricSearch] = React.useState('');
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const loadData = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [exps, mets, integ, dests] = await Promise.all([
        canExportAnalytics ? fetchAnalyticsExports(1, 25).catch(() => ({ items: [] })) : Promise.resolve({ items: [] }),
        fetchMetricCatalog().catch(() => []),
        fetchAnalyticsIntegrity().catch(() => []),
        fetchAnalyticsDestinations().catch(() => []),
      ]);
      setExportsList(exps.items);
      setMetricsCatalog(mets);
      setIntegrityFindings(integ);
      setDestinations(dests);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load analytics settings.');
    } finally {
      setLoading(false);
    }
  }, [canExportAnalytics]);

  React.useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleRebuild = async () => {
    setRebuildConfirmOpen(false);
    setRebuilding(true);
    setRebuildResult(null);
    try {
      const result = await triggerAnalyticsRebuild();
      setRebuildResult(
        `Reporting projections successfully rebuilt! Projected ${result.projections.salesFacts ?? 0} sales facts, ${result.projections.orders ?? 0} orders, ${result.projections.deliveries ?? 0} deliveries, and ${result.projections.payments ?? 0} payments.`,
      );
      if (onRebuildCompleted) onRebuildCompleted();
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Projection rebuild failed.');
    } finally {
      setRebuilding(false);
    }
  };

  const handleCreateExport = async () => {
    setExportSubmitting(true);
    try {
      await requestAnalyticsExport(exportReportKey, {
        from: selection.from,
        to: selection.to,
        granularity: selection.granularity,
        currency: selection.currency,
      });
      setExportModalOpen(false);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to request export.');
    } finally {
      setExportSubmitting(false);
    }
  };

  const filteredMetrics = metricsCatalog.filter((m) => {
    if (!metricSearch) return true;
    const q = metricSearch.toLowerCase();
    return (
      m.metric_key.toLowerCase().includes(q) ||
      m.display_name.toLowerCase().includes(q) ||
      m.description.toLowerCase().includes(q) ||
      m.calculation_semantics.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {/* Rebuild Feedback */}
      {rebuildResult ? (
        <div className="p-4 rounded-xl border border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200 text-xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>{rebuildResult}</span>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setRebuildResult(null)}
            className="h-7 text-xs"
          >
            Dismiss
          </Button>
        </div>
      ) : null}

      {error ? <ErrorState title="Error" message={error} onRetry={loadData} /> : null}

      <Tabs
        value={activeTab}
        onValueChange={(val) => setActiveTab(val as typeof activeTab)}
        className="space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 pb-3">
          <TabsList>
            <TabsTrigger value="pipeline" className="gap-1.5">
              <Database className="size-3.5" />
              <span>Projections & Freshness</span>
            </TabsTrigger>
            <TabsTrigger value="exports" className="gap-1.5">
              <Download className="size-3.5" />
              <span>Export Center</span>
              <span className="text-[10px] font-mono text-muted-foreground ml-1">({exportsList.length})</span>
            </TabsTrigger>
            <TabsTrigger value="metrics" className="gap-1.5">
              <BookOpen className="size-3.5" />
              <span>Metric Dictionary</span>
              <span className="text-[10px] font-mono text-muted-foreground ml-1">({metricsCatalog.length})</span>
            </TabsTrigger>
            <TabsTrigger value="destinations" className="gap-1.5">
              <Plug className="size-3.5" />
              <span>External Destinations</span>
            </TabsTrigger>
            <TabsTrigger value="integrity" className="gap-1.5">
              <ShieldCheck className="size-3.5" />
              <span>Integrity Checks</span>
              <span className="text-[10px] font-mono text-muted-foreground ml-1">({integrityFindings.length})</span>
            </TabsTrigger>
          </TabsList>
        </div>

        {/* =================================================================== */}
        {/* Tab 1: Projections & Freshness */}
        {/* =================================================================== */}
        <TabsContent value="pipeline" className="space-y-6">
          <PageSection
            title="Analytical Projection Status & Rebuild Engine"
            description="Analytics read models are completely rebuildable from authoritative transactional source facts."
            actions={
              canManageAnalytics ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={rebuilding}
                  onClick={() => setRebuildConfirmOpen(true)}
                  className="h-9 gap-1.5 text-xs"
                >
                  <RefreshCw className={rebuilding ? 'size-3.5 animate-spin' : 'size-3.5'} />
                  <span>{rebuilding ? 'Rebuilding Projections…' : 'Rebuild Projections'}</span>
                </Button>
              ) : null
            }
          >
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
              <PagePanel className="p-4 space-y-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Projection State
                </span>
                <div className="flex items-center gap-2">
                  <StatusBadge
                    status={freshness?.status ?? 'CURRENT'}
                    tone={
                      freshness?.status === 'CURRENT'
                        ? 'success'
                        : freshness?.status === 'FAILED'
                          ? 'danger'
                          : 'warning'
                    }
                  />
                  <span className="text-xs text-muted-foreground font-mono">v2 architecture</span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Projections stay synchronized via batched outbox events.
                </p>
              </PagePanel>

              <PagePanel className="p-4 space-y-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Last Processed
                </span>
                <div className="text-sm font-semibold font-mono text-foreground">
                  {freshness?.lastProcessedAt ? new Date(freshness.lastProcessedAt).toLocaleString() : 'Not yet processed'}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Time the last event batch was ingested into read models.
                </p>
              </PagePanel>

              <PagePanel className="p-4 space-y-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Last Successful Rebuild
                </span>
                <div className="text-sm font-semibold font-mono text-foreground">
                  {freshness?.lastSuccessAt ? new Date(freshness.lastSuccessAt).toLocaleString() : 'Baseline initialized'}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  High-watermark verification of domain projections.
                </p>
              </PagePanel>
            </div>

            <div className="p-4 rounded-xl bg-info/10 border border-info/20 text-xs text-foreground/80 flex items-start gap-2.5">
              <Database className="size-4 text-info shrink-0 mt-0.5" />
              <div>
                <strong className="text-foreground font-semibold">Authoritative Source Protection:</strong>{' '}
                Analytics is strictly a read and measurement domain. Orders, Payments, Costing,
                Inventory, Delivery, and Returns are the source of truth. Triggering a rebuild
                re-populates the analytical fact tables from transactional records without modifying
                or risking any live customer, order, or financial ledger data.
              </div>
            </div>
          </PageSection>
        </TabsContent>

        {/* =================================================================== */}
        {/* Tab 2: Export Center */}
        {/* =================================================================== */}
        <TabsContent value="exports" className="space-y-6">
          <PageSection
            title="Asynchronous CSV Report Exports"
            description="Leased background worker exports with formula injection protection and 7-day retention."
            actions={
              canExportAnalytics ? (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => setExportModalOpen(true)}
                  className="h-9 gap-1.5 text-xs"
                >
                  <Download className="size-3.5" />
                  <span>Request New Export</span>
                </Button>
              ) : null
            }
          >
            <div className="rounded-xl border border-border bg-card shadow-2xs overflow-hidden">
              <Table density="compact">
                <TableHeader>
                  <TableRow>
                    <TableHead>Report Key</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>File Name</TableHead>
                    <TableHead className="text-right">Rows</TableHead>
                    <TableHead>Requested At</TableHead>
                    <TableHead>Expires</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {exportsList.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-xs text-muted-foreground">
                        No report exports requested yet. Click &ldquo;Request New Export&rdquo; to queue an asynchronous CSV export.
                      </TableCell>
                    </TableRow>
                  ) : (
                    exportsList.map((exp) => (
                      <TableRow key={exp.id}>
                        <TableCell className="font-semibold text-foreground text-xs font-mono">
                          {exp.report_key}
                        </TableCell>
                        <TableCell>
                          <StatusBadge
                            status={exp.status}
                            tone={
                              exp.status === 'READY'
                                ? 'success'
                                : exp.status === 'FAILED'
                                  ? 'danger'
                                  : 'warning'
                            }
                            className="text-[10px] px-1.5 py-0"
                          />
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {exp.file_name ?? 'Generating…'}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs tabular-nums text-foreground">
                          {exp.row_count ? formatAnalyticsCount(exp.row_count) : '—'}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {new Date(exp.created_at).toLocaleString()}
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {exp.expires_at ? new Date(exp.expires_at).toLocaleDateString() : '7 days'}
                        </TableCell>
                        <TableCell className="text-right">
                          {exp.status === 'READY' ? (
                            <a
                              href={`/api/admin/analytics/exports/${exp.id}/download`}
                              download
                              className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                            >
                              <Download className="size-3" />
                              <span>Download</span>
                            </a>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </PageSection>
        </TabsContent>

        {/* =================================================================== */}
        {/* Tab 3: Metric Dictionary */}
        {/* =================================================================== */}
        <TabsContent value="metrics" className="space-y-6">
          <PageSection
            title="Versioned Metric Definitions Catalog"
            description="Review authoritative metric grain, time basis, included states, and calculation semantics."
            actions={
              <div className="w-64">
                <Input
                  type="search"
                  placeholder="Search metrics…"
                  value={metricSearch}
                  onChange={(e) => setMetricSearch(e.target.value)}
                  className="h-8 text-xs bg-background"
                />
              </div>
            }
          >
            <div className="rounded-xl border border-border bg-card shadow-2xs overflow-hidden">
              <Table density="compact">
                <TableHeader>
                  <TableRow>
                    <TableHead>Metric Key</TableHead>
                    <TableHead>Display Name</TableHead>
                    <TableHead>Grain</TableHead>
                    <TableHead>Time Basis</TableHead>
                    <TableHead>Currency Rule</TableHead>
                    <TableHead>Calculation Semantics</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredMetrics.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-6 text-xs text-muted-foreground">
                        No metric definitions matched your search.
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredMetrics.map((m) => (
                      <TableRow key={`${m.metric_key}-v${m.semantic_version}`}>
                        <TableCell className="font-mono text-xs font-bold text-foreground">
                          {m.metric_key}
                          <span className="text-[10px] text-muted-foreground ml-1">v{m.semantic_version}</span>
                        </TableCell>
                        <TableCell className="text-xs font-medium text-foreground">
                          {m.display_name}
                        </TableCell>
                        <TableCell className="font-mono text-[11px] text-muted-foreground">
                          {m.grain}
                        </TableCell>
                        <TableCell className="font-mono text-[11px] text-muted-foreground">
                          {m.time_basis}
                        </TableCell>
                        <TableCell className="font-mono text-[11px] text-primary">
                          {m.currency_treatment}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-sm truncate" title={m.calculation_semantics}>
                          {m.calculation_semantics}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </PageSection>
        </TabsContent>

        {/* =================================================================== */}
        {/* Tab 4: External Destinations Status */}
        {/* =================================================================== */}
        <TabsContent value="destinations" className="space-y-6">
          <PageSection
            title="External Measurement Destinations (GA4 & Meta CAPI)"
            description="Diagnostics on external tracking pipelines. GA4 and Meta are external advertising observation destinations, never internal Finance truth."
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {destinations.map((dest) => (
                <PagePanel key={dest.providerCode} className="p-5 space-y-3">
                  <div className="flex items-center justify-between border-b border-border/60 pb-2.5">
                    <div className="flex items-center gap-2">
                      <Plug className="size-4 text-primary" />
                      <h4 className="text-sm font-semibold text-foreground">{dest.name}</h4>
                    </div>
                    <StatusBadge
                      status={dest.status}
                      tone="neutral"
                      className="text-[10px]"
                    />
                  </div>

                  <p className="text-xs text-muted-foreground">{dest.description}</p>

                  <div className="rounded-lg border border-border/60 bg-muted/20 p-3 space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Browser Tracking:</span>
                      <strong className="text-foreground font-mono">{dest.browserTracking.status}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Server-Side Protocol (CAPI):</span>
                      <strong className="text-foreground font-mono">{dest.serverTracking.status}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Deduplication Contract:</span>
                      <strong className="text-emerald-700 dark:text-emerald-400 font-mono">
                        {dest.eventDeduplication.status}
                      </strong>
                    </div>
                  </div>

                  <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-[11px] text-foreground/80">
                    <strong className="font-semibold block text-amber-800 dark:text-amber-300 mb-0.5">
                      Truth Boundary:
                    </strong>
                    {dest.notes}
                  </div>
                </PagePanel>
              ))}
            </div>
          </PageSection>
        </TabsContent>

        {/* =================================================================== */}
        {/* Tab 5: Integrity Checks */}
        {/* =================================================================== */}
        <TabsContent value="integrity" className="space-y-6">
          <PageSection
            title="Read Model Integrity Verification"
            description="Continuous reconciliation checks detecting projection drift against authoritative transactional records."
            actions={
              <Link
                href="/integrity"
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline font-medium"
              >
                <span>System integrity module</span>
                <ExternalLink className="size-3" />
              </Link>
            }
          >
            <div className="rounded-xl border border-border bg-card shadow-2xs overflow-hidden">
              <Table density="compact">
                <TableHeader>
                  <TableRow>
                    <TableHead>Check Code</TableHead>
                    <TableHead>Integrity Finding Detail</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {integrityFindings.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center py-8 text-xs text-muted-foreground">
                        <div className="flex items-center justify-center gap-2 text-emerald-700 dark:text-emerald-400 font-medium">
                          <CheckCircle2 className="size-4" />
                          <span>All projection integrity checks passed cleanly. Zero drift detected.</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    integrityFindings.map((finding) => (
                      <TableRow key={finding.code}>
                        <TableCell className="font-mono text-xs font-bold text-rose-600 dark:text-rose-400">
                          {finding.code}
                        </TableCell>
                        <TableCell className="text-xs text-foreground">
                          {finding.detail}
                        </TableCell>
                        <TableCell className="text-center">
                          <StatusBadge status="DRIFT" tone="danger" className="text-[10px]" />
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </PageSection>
        </TabsContent>
      </Tabs>

      {/* Confirmation Dialog for Projection Rebuild */}
      <Dialog open={rebuildConfirmOpen} onOpenChange={setRebuildConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <RefreshCw className="size-5 text-primary" />
              <span>Confirm Projection Rebuild</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground pt-1">
              Are you sure you want to rebuild all analytics read models from authoritative
              transactional records?
            </DialogDescription>
          </DialogHeader>

          <div className="text-xs space-y-2 py-2 text-muted-foreground">
            <p>
              This operation reads authoritative <strong>Orders, Payments, Returns, Costing, and Finance</strong> data
              and regenerates the reporting projections for your organization.
            </p>
            <p className="text-amber-800 dark:text-amber-300 font-medium">
              Source transactional databases are never mutated. This action creates an audit event.
            </p>
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setRebuildConfirmOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => void handleRebuild()}
              className="gap-1.5"
            >
              <RefreshCw className="size-3.5" />
              <span>Start Rebuild</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Request New Export Modal */}
      <Dialog open={exportModalOpen} onOpenChange={setExportModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Download className="size-5 text-primary" />
              <span>Request Report CSV Export</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground pt-1">
              Select the report family to export. The background worker will generate an audited, formula-injection protected CSV file.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs">
            <div className="space-y-1">
              <label className="font-semibold text-foreground" htmlFor="export-report-select">
                Report Family:
              </label>
              <NativeSelect
                id="export-report-select"
                value={exportReportKey}
                onChange={(e) => setExportReportKey(e.target.value as AnalyticsReportKeyDto)}
                className="h-9 text-xs bg-background"
              >
                <option value="SALES">Sales Performance (Totals & Series)</option>
                <option value="ORDERS">Orders by Channel & Method</option>
                <option value="PRODUCTS">Products & Variants Profitability</option>
                <option value="CUSTOMERS">Customer Purchasing & LTV</option>
                <option value="INVENTORY">Warehouse Daily Inventory Snapshots</option>
                <option value="FINANCE">Finance Cash Movement Ledger</option>
                <option value="PAYMENTS">Payments & Settlement Facts</option>
                <option value="DELIVERY">Fulfillment & Delivery Outcomes</option>
                <option value="RETURNS">Returns & RTO Cases</option>
                <option value="SUPPLY">Procurement & Purchases</option>
                <option value="STOREFRONT">Storefront Funnel Progression</option>
                <option value="MARKETING">UTM Campaign Attribution</option>
              </NativeSelect>
            </div>

            <div className="rounded-lg bg-muted/40 p-3 space-y-1 text-muted-foreground">
              <div>Export window: <strong className="text-foreground font-mono">{selection.from} to {selection.to}</strong></div>
              <div>Timezone: <strong className="text-foreground font-mono">Asia/Dhaka (UTC+6)</strong></div>
              <div>Currency: <strong className="text-foreground font-mono">{selection.currency}</strong></div>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setExportModalOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={exportSubmitting}
              onClick={() => void handleCreateExport()}
              className="gap-1.5"
            >
              {exportSubmitting ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
              <span>Queue Export</span>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
