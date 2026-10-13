'use client';

import {
  AlertCircle,
  ArrowRight,
  Check,
  CheckCircle2,
  CircleAlert,
  FileWarning,
  GitCompareArrows,
  Layers,
  Loader2,
  Plus,
  RefreshCw,
  Ruler,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  TableProperties,
  TriangleAlert,
} from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';

import type {
  SizeDefinitionDto,
  SizeOptionValueMappingDto,
  SizingQualityChecksDto,
} from '@maevelle/contracts';

import {
  fetchSizeOptionValues,
  fetchSizingQualityChecks,
  fetchSizingWorkspace,
  linkOptionValueToSizeDefinition,
} from '@/lib/sizing/api';

import {
  AdminPage,
  EmptyState,
  ErrorState,
  LoadingState,
  PageActions,
  PageDescription,
  PageHeader,
  PagePanel,
  PageSection,
  PageTitle,
} from '@/components/ui/page-shell';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { NativeSelect } from '@/components/ui/native-select';
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from '@/components/ui/drawer';

type Feedback = { message: string; tone: 'success' | 'warning' | 'destructive' } | null;

type Metric = {
  id: string;
  title: string;
  value: number;
  description: string;
  severity: 'warning' | 'destructive';
  category: 'critical' | 'readiness' | 'hygiene';
  href: string;
  actionText: string;
};

export default function SizingDashboardPage() {
  const [checks, setChecks] = useState<SizingQualityChecksDto | null>(null);
  const [optionValues, setOptionValues] = useState<readonly SizeOptionValueMappingDto[]>([]);
  const [sizeDefinitions, setSizeDefinitions] = useState<readonly SizeDefinitionDto[]>([]);
  const [totalGuides, setTotalGuides] = useState(0);
  const [totalProductsConfigured, setTotalProductsConfigured] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [mappingBusyId, setMappingBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [quickFixDrawerOpen, setQuickFixDrawerOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const [checksData, optionData, workspaceData] = await Promise.all([
        fetchSizingQualityChecks(),
        fetchSizeOptionValues({ page: 1, pageSize: 20, mappingStatus: 'UNMAPPED' }),
        fetchSizingWorkspace(),
      ]);

      setChecks(checksData);
      setOptionValues(optionData.items);
      setSizeDefinitions(workspaceData.sizeDefinitions.filter((def) => def.status === 'ACTIVE'));
      setTotalGuides(workspaceData.guides.length);
      setTotalProductsConfigured(workspaceData.productConfigurations.length);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sizing overview.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const metrics = useMemo<Metric[]>(() => {
    if (!checks) return [];

    return [
      // Critical Tier
      {
        id: 'system-guide-mismatch',
        title: 'System / Guide Mismatch',
        value: checks.productConfigurationsWithSystemGuideMismatch,
        description: 'Product configured size system and attached guide belong to different domains or schemas.',
        severity: 'destructive',
        category: 'critical',
        href: '/products',
        actionText: 'Inspect Products',
      },
      {
        id: 'archived-guide-in-use',
        title: 'Archived Guides in Use',
        value: checks.productsUsingArchivedGuide,
        description: 'Active products still reference an archived or discontinued measurement guide.',
        severity: 'destructive',
        category: 'critical',
        href: '/sizing/guides?status=ARCHIVED',
        actionText: 'Resolve References',
      },
      {
        id: 'empty-published-revisions',
        title: 'Empty Published Revisions',
        value: checks.publishedRevisionsWithEmptyRows,
        description: 'A customer-facing published revision exists with zero measurement rows.',
        severity: 'destructive',
        category: 'critical',
        href: '/sizing/guides',
        actionText: 'Repair Guides',
      },
      {
        id: 'published-rows-without-values',
        title: 'Rows Lacking Measurements',
        value: checks.publishedRowsWithoutMeasurements,
        description: 'Published size rows exist where no measurement cells were filled in.',
        severity: 'destructive',
        category: 'critical',
        href: '/sizing/guides',
        actionText: 'Fill Matrix',
      },
      {
        id: 'guide-row-system-mismatch',
        title: 'Guide Rows Outside System',
        value: checks.guideRowsWithSystemMismatch,
        description: 'Guide rows point to size definitions outside the guide’s bound system.',
        severity: 'destructive',
        category: 'critical',
        href: '/sizing/guides',
        actionText: 'Fix Guide Rows',
      },
      {
        id: 'unavailable-category-defaults',
        title: 'Broken Category Defaults',
        value: checks.categoryDefaultsUsingUnavailableGuide,
        description: 'Category defaults reference an unavailable, archived, or draft-only size guide.',
        severity: 'destructive',
        category: 'critical',
        href: '/categories',
        actionText: 'Update Categories',
      },

      // Readiness Tier
      {
        id: 'missing-sizing-config',
        title: 'Missing Size Configurations',
        value: checks.productsWithSizeAxisButNoSizingConfig,
        description: 'Apparel products have a Size variant axis but have no sizing system configured.',
        severity: 'warning',
        category: 'readiness',
        href: '/products',
        actionText: 'Configure Products',
      },
      {
        id: 'config-without-published-guide',
        title: 'Missing Published Guides',
        value: checks.productsWithConfigButNoPublishedGuide,
        description: 'Products have sizing systems configured, but no published guide is available for customers.',
        severity: 'warning',
        category: 'readiness',
        href: '/sizing/guides',
        actionText: 'Publish Guides',
      },
      {
        id: 'unlinked-size-options',
        title: 'Unlinked Variant Options',
        value: checks.optionValuesInSizeAxisWithoutSizeDefinitionLink,
        description: 'Catalog size options are not yet normalized to canonical size definitions.',
        severity: 'warning',
        category: 'readiness',
        href: '/sizing/mappings?mappingStatus=UNMAPPED',
        actionText: 'Map Values',
      },
      {
        id: 'options-outside-system',
        title: 'Options Outside Configured System',
        value: checks.optionValuesMappedOutsideConfiguredSystem,
        description: 'Variant option values point to definitions outside the product’s configured system.',
        severity: 'destructive',
        category: 'critical',
        href: '/sizing/mappings',
        actionText: 'Fix Mappings',
      },

      // Hygiene Tier
      {
        id: 'definitions-under-archived-system',
        title: 'Definitions Under Archived System',
        value: checks.activeDefinitionsUnderArchivedSystem,
        description: 'Active canonical sizes remain attached to an archived size system.',
        severity: 'warning',
        category: 'hygiene',
        href: '/sizing/standards?tab=sizes',
        actionText: 'Review Sizes',
      },
      {
        id: 'measurements-under-archived-domain',
        title: 'Columns Under Archived Domain',
        value: checks.activeMeasurementsUnderArchivedDomain,
        description: 'Active measurement dimensions remain attached to an archived sizing domain.',
        severity: 'warning',
        category: 'hygiene',
        href: '/sizing/standards?tab=measurements',
        actionText: 'Review Columns',
      },
    ];
  }, [checks]);

  const criticalIssues = metrics
    .filter((m) => m.severity === 'destructive')
    .reduce((sum, m) => sum + m.value, 0);

  const warningIssues = metrics
    .filter((m) => m.severity === 'warning')
    .reduce((sum, m) => sum + m.value, 0);

  const totalIssues = criticalIssues + warningIssues;

  async function handleMapOptionValue(option: SizeOptionValueMappingDto, sizeDefinitionId: string) {
    setMappingBusyId(option.optionValueId);
    setFeedback(null);

    try {
      await linkOptionValueToSizeDefinition(option.optionValueId, sizeDefinitionId || null);
      setFeedback({ message: 'Size option mapping updated successfully.', tone: 'success' });
      await load();
    } catch (err) {
      setFeedback({
        message: err instanceof Error ? err.message : 'Failed to update size option mapping.',
        tone: 'destructive',
      });
    } finally {
      setMappingBusyId(null);
    }
  }

  return (
    <AdminPage>
      <PageHeader
        eyebrow="Operations · Catalog Quality"
        title="Sizing & Fit Operations"
        description="Audit customer-facing fit charts, canonical sizing systems, catalog option normalization, and automated data integrity."
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void load()}
              className="min-h-10 sm:min-h-9 touch-manipulation gap-1.5"
            >
              <RefreshCw className="size-3.5" />
              <span>Refresh</span>
            </Button>
            <Button
              size="sm"
              render={<Link href="/sizing/guides?create=true" />}
              className="min-h-10 sm:min-h-9 touch-manipulation gap-1.5 shadow-xs"
            >
              <Plus className="size-4" />
              <span>New Size Guide</span>
            </Button>
          </>
        }
      />

      {feedback ? (
        <div
          role="status"
          className={`flex items-center gap-2.5 rounded-lg border px-4 py-3 text-sm animate-in fade-in duration-150 ${
            feedback.tone === 'success'
              ? 'border-success/30 bg-success-subtle text-success'
              : feedback.tone === 'warning'
                ? 'border-warning/30 bg-warning-subtle text-warning'
                : 'border-destructive/30 bg-destructive-subtle text-destructive'
          }`}
        >
          {feedback.tone === 'success' ? (
            <CheckCircle2 className="size-4 shrink-0" />
          ) : (
            <AlertCircle className="size-4 shrink-0" />
          )}
          <span>{feedback.message}</span>
        </div>
      ) : null}

      {loading ? (
        <LoadingState message="Auditing sizing integrity and catalog coverage…" />
      ) : error ? (
        <ErrorState title="Could not load sizing dashboard" message={error} onRetry={() => void load()} />
      ) : checks ? (
        <div className="space-y-6">
          {/* Executive Overview KPI Strip */}
          <section className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <PagePanel className="p-4 sm:p-5 flex flex-col justify-between">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Overall Health
                </span>
                {totalIssues === 0 ? (
                  <ShieldCheck className="size-4 text-success" />
                ) : criticalIssues > 0 ? (
                  <ShieldAlert className="size-4 text-destructive" />
                ) : (
                  <CircleAlert className="size-4 text-warning" />
                )}
              </div>
              <div className="mt-3">
                <span className="font-mono text-2xl sm:text-3xl font-bold tracking-tight text-foreground tabular-nums">
                  {totalIssues === 0 ? '100%' : `${totalIssues}`}
                </span>
                <p className="mt-1 text-xs text-muted-foreground">
                  {totalIssues === 0 ? 'All sizing rules verified healthy.' : `${criticalIssues} critical · ${warningIssues} warnings`}
                </p>
              </div>
            </PagePanel>

            <PagePanel className="p-4 sm:p-5 flex flex-col justify-between">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Active Guides
                </span>
                <TableProperties className="size-4 text-primary" />
              </div>
              <div className="mt-3">
                <span className="font-mono text-2xl sm:text-3xl font-bold tracking-tight text-foreground tabular-nums">
                  {totalGuides}
                </span>
                <p className="mt-1 text-xs text-muted-foreground">
                  Published & revisioned chart templates
                </p>
              </div>
            </PagePanel>

            <PagePanel className="p-4 sm:p-5 flex flex-col justify-between">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Products Configured
                </span>
                <Layers className="size-4 text-info" />
              </div>
              <div className="mt-3">
                <span className="font-mono text-2xl sm:text-3xl font-bold tracking-tight text-foreground tabular-nums">
                  {totalProductsConfigured}
                </span>
                <p className="mt-1 text-xs text-muted-foreground">
                  Direct sizing systems attached
                </p>
              </div>
            </PagePanel>

            <PagePanel className="p-4 sm:p-5 flex flex-col justify-between">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Unlinked Options
                </span>
                <GitCompareArrows className="size-4 text-warning" />
              </div>
              <div className="mt-3 flex items-baseline justify-between">
                <span className="font-mono text-2xl sm:text-3xl font-bold tracking-tight text-foreground tabular-nums">
                  {checks.optionValuesInSizeAxisWithoutSizeDefinitionLink}
                </span>
                {checks.optionValuesInSizeAxisWithoutSizeDefinitionLink > 0 ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs text-primary px-2"
                    onClick={() => setQuickFixDrawerOpen(true)}
                  >
                    Quick Fix
                  </Button>
                ) : null}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Variant values waiting for mapping
              </p>
            </PagePanel>
          </section>

          {/* Critical Integrity Rules Section */}
          <PageSection
            title="Data Integrity & Rule Diagnostics"
            description="Continuous validation across catalog products, category inheritance, and sizing matrix baselines."
          >
            <div className="grid gap-3 sm:gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {metrics.map((metric) => {
                const isHealthy = metric.value === 0;
                return (
                  <PagePanel
                    key={metric.id}
                    className={`flex flex-col justify-between p-4 sm:p-5 transition-colors ${
                      isHealthy
                        ? 'border-border/60 bg-card hover:border-border'
                        : metric.severity === 'destructive'
                          ? 'border-destructive/30 bg-destructive-subtle/30'
                          : 'border-warning/30 bg-warning-subtle/30'
                    }`}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="text-xs font-semibold text-foreground leading-snug">
                          {metric.title}
                        </h3>
                        {isHealthy ? (
                          <span className="flex size-5 items-center justify-center rounded-full bg-success/10 text-success shrink-0">
                            <Check className="size-3" />
                          </span>
                        ) : metric.severity === 'destructive' ? (
                          <span className="flex size-5 items-center justify-center rounded-full bg-destructive/10 text-destructive shrink-0">
                            <AlertCircle className="size-3" />
                          </span>
                        ) : (
                          <span className="flex size-5 items-center justify-center rounded-full bg-warning/10 text-warning shrink-0">
                            <FileWarning className="size-3" />
                          </span>
                        )}
                      </div>
                      <p
                        className={`mt-2 font-mono text-2xl font-bold tabular-nums ${
                          isHealthy
                            ? 'text-muted-foreground/60'
                            : metric.severity === 'destructive'
                              ? 'text-destructive'
                              : 'text-warning'
                        }`}
                      >
                        {metric.value}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                        {metric.description}
                      </p>
                    </div>

                    {!isHealthy ? (
                      <div className="mt-4 pt-3 border-t border-border/40">
                        <Button
                          variant="ghost"
                          size="sm"
                          render={<Link href={metric.href} />}
                          className="h-8 w-full justify-between px-2 text-xs font-semibold text-foreground hover:text-primary"
                        >
                          <span>{metric.actionText}</span>
                          <ArrowRight className="size-3.5" />
                        </Button>
                      </div>
                    ) : null}
                  </PagePanel>
                );
              })}
            </div>
          </PageSection>

          {/* Quick-Remediation Drawer / Embedded Card */}
          {optionValues.length > 0 ? (
            <PagePanel className="p-5 border-border">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-border/60 pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <Sparkles className="size-4 text-primary" />
                    <h3 className="text-sm font-semibold text-foreground">
                      Unlinked Option Quick Fix
                    </h3>
                    <Badge variant="outline" className="font-mono text-xs">
                      {optionValues.length} waiting
                    </Badge>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Connect variant size values directly to canonical size definitions. For high-volume batches, use the Option Mapping console.
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  render={<Link href="/sizing/mappings?mappingStatus=UNMAPPED" />}
                  className="min-h-10 sm:min-h-8 touch-manipulation text-xs gap-1"
                >
                  <span>Full Mapping Console</span>
                  <ArrowRight className="size-3.5" />
                </Button>
              </div>

              {/* Mobile Card List / Desktop Responsive Table */}
              <div className="mt-4 divide-y divide-border/40">
                {optionValues.slice(0, 5).map((option) => {
                  const isBusy = mappingBusyId === option.optionValueId;
                  const candidates = sizeDefinitions.filter((def) =>
                    option.configuredSizeSystemId ? def.sizeSystemId === option.configuredSizeSystemId : true,
                  );

                  return (
                    <div
                      key={option.optionValueId}
                      className="py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5"
                    >
                      <div className="min-w-0">
                        <Link
                          href={`/products/${option.productId}`}
                          className="text-xs font-medium text-foreground hover:text-primary hover:underline truncate block"
                        >
                          {option.productTitle}
                        </Link>
                        <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                          <span>Axis: {option.optionAxisName}</span>
                          <span>·</span>
                          <strong className="font-mono text-foreground font-semibold">
                            &quot;{option.optionValueLabel}&quot;
                          </strong>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <NativeSelect
                          disabled={isBusy}
                          defaultValue=""
                          onChange={(e) => void handleMapOptionValue(option, e.target.value)}
                          className="h-9 min-w-44 text-xs bg-card"
                        >
                          <option value="">Choose canonical size…</option>
                          {candidates.map((def) => (
                            <option key={def.id} value={def.id}>
                              {def.label} ({def.code})
                            </option>
                          ))}
                        </NativeSelect>
                        {isBusy ? <Loader2 className="size-4 animate-spin text-primary" /> : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </PagePanel>
          ) : null}
        </div>
      ) : null}

      {/* Full Quick Fix Drawer for Mobile & Fast Remediation */}
      <Drawer open={quickFixDrawerOpen} onOpenChange={setQuickFixDrawerOpen}>
        <DrawerContent className="max-h-[85vh] p-4 sm:p-6">
          <DrawerHeader className="px-0 pb-4">
            <DrawerTitle className="text-base font-semibold">
              Batch Unlinked Option Quick-Fix
            </DrawerTitle>
            <DrawerDescription className="text-xs">
              Assign canonical size definitions to incoming catalog variants.
            </DrawerDescription>
          </DrawerHeader>

          <div className="overflow-y-auto space-y-3 py-2">
            {optionValues.map((option) => {
              const isBusy = mappingBusyId === option.optionValueId;
              const candidates = sizeDefinitions.filter((def) =>
                option.configuredSizeSystemId ? def.sizeSystemId === option.configuredSizeSystemId : true,
              );

              return (
                <div
                  key={option.optionValueId}
                  className="rounded-lg border border-border bg-card p-3 flex flex-col gap-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-foreground truncate">
                      {option.productTitle}
                    </span>
                    <Badge variant="outline" className="text-[10px] font-mono shrink-0">
                      {option.optionValueLabel}
                    </Badge>
                  </div>
                  <NativeSelect
                    disabled={isBusy}
                    defaultValue=""
                    onChange={(e) => void handleMapOptionValue(option, e.target.value)}
                    className="min-h-11 text-xs bg-muted/20"
                  >
                    <option value="">Select canonical definition…</option>
                    {candidates.map((def) => (
                      <option key={def.id} value={def.id}>
                        {def.label} ({def.code})
                      </option>
                    ))}
                  </NativeSelect>
                </div>
              );
            })}
          </div>
        </DrawerContent>
      </Drawer>
    </AdminPage>
  );
}
