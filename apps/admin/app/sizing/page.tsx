'use client';

import {
  AlertCircle,
  ArrowRight,
  Check,
  CircleAlert,
  FileWarning,
  GitCompareArrows,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Sparkles,
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
  OperationalEmptyState,
  OperationalFeedback,
  OperationalPageHeader,
} from '../../components/operational-worklist';

type Feedback = { message: string; tone: 'success' | 'warning' | 'danger' } | null;

type Metric = {
  title: string;
  value: number;
  description: string;
  severity: 'warning' | 'danger';
  href?: string;
  action?: string;
};

export default function SizingDashboardPage() {
  const [checks, setChecks] = useState<SizingQualityChecksDto | null>(null);
  const [optionValues, setOptionValues] = useState<readonly SizeOptionValueMappingDto[]>([]);
  const [sizeDefinitions, setSizeDefinitions] = useState<readonly SizeDefinitionDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [mappingBusyId, setMappingBusyId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const [checksData, optionData, workspaceData] = await Promise.all([
        fetchSizingQualityChecks(),
        fetchSizeOptionValues({ page: 1, pageSize: 10, mappingStatus: 'UNMAPPED' }),
        fetchSizingWorkspace(),
      ]);

      setChecks(checksData);
      setOptionValues(optionData.items);
      setSizeDefinitions(workspaceData.sizeDefinitions.filter((definition) => definition.status === 'ACTIVE'));
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
      {
        title: 'Missing size configurations',
        value: checks.productsWithSizeAxisButNoSizingConfig,
        description: 'Products expose a size option axis but have no sizing configuration.',
        severity: 'warning',
        href: '/products',
        action: 'Review products',
      },
      {
        title: 'Missing published guides',
        value: checks.productsWithConfigButNoPublishedGuide,
        description: 'Configured products have no usable published guide.',
        severity: 'warning',
        href: '/sizing/guides',
        action: 'Review guides',
      },
      {
        title: 'Archived guides in use',
        value: checks.productsUsingArchivedGuide,
        description: 'Active product configuration still references an archived guide.',
        severity: 'danger',
        href: '/sizing/guides?status=ARCHIVED',
        action: 'Resolve references',
      },
      {
        title: 'System / guide mismatches',
        value: checks.productConfigurationsWithSystemGuideMismatch,
        description: 'Product sizing system and guide system/domain do not agree.',
        severity: 'danger',
        href: '/products',
        action: 'Fix products',
      },
      {
        title: 'Empty published revisions',
        value: checks.publishedRevisionsWithEmptyRows,
        description: 'Published revisions contain no usable measurement matrix.',
        severity: 'danger',
        href: '/sizing/guides',
        action: 'Review guides',
      },
      {
        title: 'Published rows without measurements',
        value: checks.publishedRowsWithoutMeasurements,
        description: 'Published size rows exist without any measurement values.',
        severity: 'danger',
        href: '/sizing/guides',
        action: 'Repair rows',
      },
      {
        title: 'Unlinked size options',
        value: checks.optionValuesInSizeAxisWithoutSizeDefinitionLink,
        description: 'Catalog size values are not mapped to canonical size definitions.',
        severity: 'warning',
        href: '/sizing/mappings?mappingStatus=UNMAPPED',
        action: 'Map options',
      },
      {
        title: 'Option mappings outside system',
        value: checks.optionValuesMappedOutsideConfiguredSystem,
        description: 'Mapped option values point to definitions outside the product system.',
        severity: 'danger',
        href: '/sizing/mappings',
        action: 'Repair mappings',
      },
      {
        title: 'Guide row system mismatches',
        value: checks.guideRowsWithSystemMismatch,
        description: 'Guide rows use size definitions outside the guide’s bound system.',
        severity: 'danger',
        href: '/sizing/guides',
        action: 'Repair guides',
      },
      {
        title: 'Unavailable category defaults',
        value: checks.categoryDefaultsUsingUnavailableGuide,
        description: 'A category default points to an unavailable or unpublished guide.',
        severity: 'danger',
        href: '/sizing/categories',
        action: 'Fix defaults',
      },
      {
        title: 'Definitions under archived systems',
        value: checks.activeDefinitionsUnderArchivedSystem,
        description: 'Active size definitions remain under an archived size system.',
        severity: 'warning',
        href: '/sizing/sizes',
        action: 'Review definitions',
      },
      {
        title: 'Measurements under archived domains',
        value: checks.activeMeasurementsUnderArchivedDomain,
        description: 'Active measurements remain under an archived sizing domain.',
        severity: 'warning',
        href: '/sizing/measurements',
        action: 'Review measurements',
      },
    ];
  }, [checks]);

  const totalIssues = metrics.reduce((sum, metric) => sum + metric.value, 0);
  const criticalIssues = metrics
    .filter((metric) => metric.severity === 'danger')
    .reduce((sum, metric) => sum + metric.value, 0);

  async function handleMapOptionValue(option: SizeOptionValueMappingDto, sizeDefinitionId: string) {
    setMappingBusyId(option.optionValueId);
    setFeedback(null);

    try {
      await linkOptionValueToSizeDefinition(option.optionValueId, sizeDefinitionId || null);
      setFeedback({ message: 'Size option mapping updated.', tone: 'success' });
      await load();
    } catch (err) {
      setFeedback({
        message: err instanceof Error ? err.message : 'Failed to update size option mapping.',
        tone: 'danger',
      });
    } finally {
      setMappingBusyId(null);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <OperationalPageHeader
        eyebrow="Sizing"
        title="Sizing Overview"
        description="Monitor sizing integrity, guide readiness, catalog mappings, and data quality across the business."
      />

      <div className="flex-1 space-y-7 overflow-y-auto p-6">
        {loading ? (
          <div className="animate-pulse space-y-4">
            <div className="h-28 rounded-xl bg-slate-100" />
            <div className="grid gap-4 md:grid-cols-3">
              <div className="h-32 rounded-xl bg-slate-100" />
              <div className="h-32 rounded-xl bg-slate-100" />
              <div className="h-32 rounded-xl bg-slate-100" />
            </div>
          </div>
        ) : error ? (
          <OperationalEmptyState title="Could not load sizing dashboard" description={error} />
        ) : checks ? (
          <>
            {feedback ? <OperationalFeedback tone={feedback.tone}>{feedback.message}</OperationalFeedback> : null}

            <section className="grid gap-4 md:grid-cols-3">
              <SummaryCard
                title="Overall health"
                value={totalIssues === 0 ? 'Healthy' : `${totalIssues} issue${totalIssues === 1 ? '' : 's'}`}
                description={totalIssues === 0 ? 'No sizing integrity issues were detected.' : 'Items requiring review across sizing and catalog integration.'}
                icon={totalIssues === 0 ? <ShieldCheck className="h-5 w-5" /> : <CircleAlert className="h-5 w-5" />}
                tone={totalIssues === 0 ? 'ok' : 'warning'}
              />
              <SummaryCard
                title="Critical integrity"
                value={String(criticalIssues)}
                description="High-impact mismatches or unavailable production sizing data."
                icon={<TriangleAlert className="h-5 w-5" />}
                tone={criticalIssues > 0 ? 'danger' : 'ok'}
              />
              <SummaryCard
                title="Unlinked options"
                value={String(checks.optionValuesInSizeAxisWithoutSizeDefinitionLink)}
                description="Catalog size option values still waiting for canonical mapping."
                icon={<GitCompareArrows className="h-5 w-5" />}
                tone={checks.optionValuesInSizeAxisWithoutSizeDefinitionLink > 0 ? 'warning' : 'ok'}
              />
            </section>

            <section>
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold text-slate-900">Data quality checks</h2>
                  <p className="text-xs text-slate-500">Production-facing sizing rules checked across catalog and sizing data.</p>
                </div>
                <button
                  type="button"
                  onClick={() => void load()}
                  className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
                >
                  <RefreshCw className="h-3.5 w-3.5" /> Refresh
                </button>
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {metrics.map((metric) => (
                  <MetricCard key={metric.title} {...metric} />
                ))}
              </div>
            </section>

            <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-5">
                <div>
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-blue-600" />
                    <h2 className="text-sm font-semibold text-slate-900">Unlinked option quick-fix</h2>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    Map the first unlinked product size values. Use Option Mapping for the full paginated workspace.
                  </p>
                </div>
                <Link
                  href="/sizing/mappings?mappingStatus=UNMAPPED"
                  className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:underline"
                >
                  Open mapping workspace <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>

              {optionValues.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500">
                  <Check className="mx-auto mb-2 h-5 w-5 text-emerald-600" />
                  No unlinked size options were found in the first quality pass.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-100 text-left text-xs">
                    <thead className="bg-slate-50 font-semibold text-slate-600">
                      <tr>
                        <th className="px-4 py-3">Product</th>
                        <th className="px-4 py-3">Axis</th>
                        <th className="px-4 py-3">Value</th>
                        <th className="px-4 py-3">Canonical definition</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {optionValues.map((option) => {
                        const candidates = sizeDefinitions.filter((definition) =>
                          option.configuredSizeSystemId
                            ? definition.sizeSystemId === option.configuredSizeSystemId
                            : true,
                        );
                        const isBusy = mappingBusyId === option.optionValueId;

                        return (
                          <tr key={option.optionValueId} className="hover:bg-slate-50/70">
                            <td className="px-4 py-3">
                              <Link href={`/products/${option.productId}`} className="font-medium text-slate-900 hover:underline">
                                {option.productTitle}
                              </Link>
                            </td>
                            <td className="px-4 py-3 text-slate-500">{option.optionAxisName}</td>
                            <td className="px-4 py-3 font-semibold text-slate-800">{option.optionValueLabel}</td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <select
                                  disabled={isBusy}
                                  defaultValue=""
                                  onChange={(event) => void handleMapOptionValue(option, event.target.value)}
                                  className="min-w-56 rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs outline-none focus:border-slate-600"
                                >
                                  <option value="">Choose definition…</option>
                                  {candidates.map((definition) => (
                                    <option key={definition.id} value={definition.id}>
                                      {definition.label} ({definition.code})
                                    </option>
                                  ))}
                                </select>
                                {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" /> : null}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        ) : null}
      </div>
    </div>
  );
}

function SummaryCard({
  title,
  value,
  description,
  icon,
  tone,
}: {
  title: string;
  value: string;
  description: string;
  icon: React.ReactNode;
  tone: 'ok' | 'warning' | 'danger';
}) {
  const classes =
    tone === 'ok'
      ? 'border-emerald-200 bg-emerald-50/50 text-emerald-800'
      : tone === 'warning'
        ? 'border-amber-200 bg-amber-50/60 text-amber-800'
        : 'border-red-200 bg-red-50/60 text-red-800';

  return (
    <div className={`rounded-xl border p-5 ${classes}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wider">{title}</p>
        {icon}
      </div>
      <p className="mt-2 text-2xl font-bold tracking-tight">{value}</p>
      <p className="mt-1 text-xs leading-relaxed opacity-80">{description}</p>
    </div>
  );
}

function MetricCard({ title, value, description, severity, href, action }: Metric) {
  const healthy = value === 0;
  const icon = healthy ? (
    <Check className="h-4 w-4 text-emerald-600" />
  ) : severity === 'danger' ? (
    <AlertCircle className="h-4 w-4 text-red-600" />
  ) : (
    <FileWarning className="h-4 w-4 text-amber-600" />
  );

  const classes = healthy
    ? 'border-slate-200 bg-white'
    : severity === 'danger'
      ? 'border-red-200 bg-red-50/40'
      : 'border-amber-200 bg-amber-50/40';

  return (
    <div className={`flex min-h-36 flex-col justify-between rounded-xl border p-4 shadow-sm ${classes}`}>
      <div>
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-xs font-semibold text-slate-800">{title}</h3>
          {icon}
        </div>
        <p className={`mt-2 text-2xl font-bold ${healthy ? 'text-emerald-700' : severity === 'danger' ? 'text-red-700' : 'text-amber-700'}`}>
          {value}
        </p>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">{description}</p>
      </div>
      {href && value > 0 ? (
        <Link href={href} className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-slate-800 hover:underline">
          {action ?? 'Review'} <ArrowRight className="h-3 w-3" />
        </Link>
      ) : null}
    </div>
  );
}
