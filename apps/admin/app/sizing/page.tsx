'use client';

import {
  ShieldCheck,
  AlertCircle,
  FileWarning,
  Layers,
  ArrowRight,
  Check,
  Loader2,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import {
  fetchSizingQualityChecks,
  fetchSizeOptionValues,
  fetchSizingWorkspace,
  linkOptionValueToSizeDefinition,
} from '@/lib/sizing/api';
import type {
  SizingQualityChecksDto,
  SizeOptionValueMappingDto,
  SizeDefinitionDto,
} from '@maevelle/contracts';

import {
  OperationalPageHeader,
  OperationalEmptyState,
  OperationalFeedback,
} from '../../components/operational-worklist';

export default function SizingDashboardPage() {
  const [checks, setChecks] = useState<SizingQualityChecksDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Unlinked Option Values Mapping Tool
  const [optionValues, setOptionValues] = useState<readonly SizeOptionValueMappingDto[]>([]);
  const [sizeDefinitions, setSizeDefinitions] = useState<readonly SizeDefinitionDto[]>([]);
  const [mappingBusyId, setMappingBusyId] = useState<string | null>(null);
  const [mappingMessage, setMappingMessage] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [checksData, optionsData, workspaceData] = await Promise.all([
        fetchSizingQualityChecks(),
        fetchSizeOptionValues(),
        fetchSizingWorkspace(),
      ]);

      setChecks(checksData);
      setOptionValues(optionsData);
      setSizeDefinitions(workspaceData.sizeDefinitions ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load checks');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleMapOptionValue = async (optionValueId: string, sizeDefinitionId: string) => {
    setMappingBusyId(optionValueId);
    setMappingMessage('');
    try {
      await linkOptionValueToSizeDefinition(optionValueId, sizeDefinitionId || null);
      setMappingMessage('Size option linked successfully.');
      await load();
    } catch (err) {
      setMappingMessage(err instanceof Error ? err.message : 'Failed to map option.');
    } finally {
      setMappingBusyId(null);
    }
  };

  const unlinkedOptions = optionValues.filter((ov) => !ov.sizeDefinitionId);

  return (
    <div className="flex h-full flex-col">
      <OperationalPageHeader
        eyebrow="Dashboard"
        title="Sizing Overview"
        description="Monitor data quality, catalog coverage, and standardized size mappings."
      />
      <div className="flex-1 overflow-y-auto p-6 space-y-8">
        {loading ? (
          <div className="animate-pulse space-y-4">
            <div className="h-28 rounded-xl bg-slate-100" />
            <div className="h-28 rounded-xl bg-slate-100" />
          </div>
        ) : error ? (
          <OperationalEmptyState title="Could not load dashboard" description={error} />
        ) : checks ? (
          <>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-600">
                Data Quality Signals
              </h2>
              <button
                onClick={() => void load()}
                className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-800"
              >
                <RefreshCw className="h-3 w-3" /> Refresh
              </button>
            </div>

            <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
              <MetricCard
                title="Missing Size Configurations"
                value={checks.productsWithSizeAxisButNoSizingConfig}
                description="Products with a 'Size' option axis but no sizing system or guide attached."
                icon={<Layers className="h-5 w-5 text-amber-500" />}
                status={checks.productsWithSizeAxisButNoSizingConfig > 0 ? 'warning' : 'ok'}
                actionHref="/products"
                actionLabel="Review Products"
              />
              <MetricCard
                title="Missing Published Guides"
                value={checks.productsWithConfigButNoPublishedGuide}
                description="Products referencing a guide that has not yet been published."
                icon={<FileWarning className="h-5 w-5 text-amber-500" />}
                status={checks.productsWithConfigButNoPublishedGuide > 0 ? 'warning' : 'ok'}
                actionHref="/sizing/guides"
                actionLabel="Publish Guides"
              />
              <MetricCard
                title="Archived Guides in Use"
                value={checks.productsUsingArchivedGuide}
                description="Products that are currently referencing an archived size guide."
                icon={<AlertCircle className="h-5 w-5 text-red-500" />}
                status={checks.productsUsingArchivedGuide > 0 ? 'danger' : 'ok'}
                actionHref="/sizing/guides"
                actionLabel="Update Configurations"
              />
              <MetricCard
                title="Empty Published Revisions"
                value={checks.publishedRevisionsWithEmptyRows}
                description="Published guides that have 0 measurement rows."
                icon={<ShieldCheck className="h-5 w-5 text-amber-500" />}
                status={checks.publishedRevisionsWithEmptyRows > 0 ? 'warning' : 'ok'}
                actionHref="/sizing/guides"
                actionLabel="Fix Guides"
              />
              <MetricCard
                title="Unlinked Size Options"
                value={checks.optionValuesInSizeAxisWithoutSizeDefinitionLink}
                description="Variant size choices not mapped to standardized size definitions."
                icon={<AlertCircle className="h-5 w-5 text-amber-500" />}
                status={
                  checks.optionValuesInSizeAxisWithoutSizeDefinitionLink > 0 ? 'warning' : 'ok'
                }
              />
            </div>

            {/* Interactive Standardization Section */}
            <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-blue-600" />
                    <h3 className="text-sm font-semibold text-slate-900">
                      Standardize Product Size Options
                    </h3>
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Map individual product variant sizes (e.g. &ldquo;M&rdquo; on Linen Dress) to
                    canonical size definitions to enable accurate filtering, returns, and analytics.
                  </p>
                </div>
                <div className="text-xs font-medium text-slate-500">
                  {unlinkedOptions.length} unlinked option{unlinkedOptions.length === 1 ? '' : 's'}
                </div>
              </div>

              {mappingMessage && (
                <OperationalFeedback tone="success">{mappingMessage}</OperationalFeedback>
              )}

              {optionValues.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400">
                  No active products with size option axes found in the catalog.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-100 text-left text-xs">
                    <thead className="bg-slate-50 text-slate-600 font-semibold">
                      <tr>
                        <th className="px-3 py-2.5">Product</th>
                        <th className="px-3 py-2.5">Option Axis</th>
                        <th className="px-3 py-2.5">Variant Size</th>
                        <th className="px-3 py-2.5">Canonical Size Definition</th>
                        <th className="px-3 py-2.5 text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {optionValues.slice(0, 15).map((ov) => {
                        const isBusy = mappingBusyId === ov.optionValueId;
                        return (
                          <tr key={ov.optionValueId} className="hover:bg-slate-50/60">
                            <td className="px-3 py-2 font-medium text-slate-900">
                              <Link
                                href={`/products/${ov.productId}`}
                                className="hover:underline"
                              >
                                {ov.productTitle}
                              </Link>
                            </td>
                            <td className="px-3 py-2 text-slate-500">{ov.optionAxisName}</td>
                            <td className="px-3 py-2 font-semibold text-slate-800">
                              {ov.optionValueLabel}
                            </td>
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-2">
                                <select
                                  disabled={isBusy}
                                  value={ov.sizeDefinitionId ?? ''}
                                  onChange={(e) =>
                                    void handleMapOptionValue(ov.optionValueId, e.target.value)
                                  }
                                  className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs outline-none focus:border-slate-600"
                                >
                                  <option value="">Unlinked</option>
                                  {sizeDefinitions.map((sd) => (
                                    <option key={sd.id} value={sd.id}>
                                      {sd.label} ({sd.code})
                                    </option>
                                  ))}
                                </select>
                                {isBusy && (
                                  <Loader2 className="h-3 w-3 animate-spin text-slate-400" />
                                )}
                              </div>
                            </td>
                            <td className="px-3 py-2 text-right">
                              {ov.sizeDefinitionId ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                                  <Check className="h-3 w-3" /> Mapped
                                </span>
                              ) : (
                                <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                                  Unlinked
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {optionValues.length > 15 && (
                    <p className="mt-2 text-center text-[11px] text-slate-400">
                      Showing first 15 of {optionValues.length} size options.
                    </p>
                  )}
                </div>
              )}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

function MetricCard({
  title,
  value,
  description,
  icon,
  status,
  actionHref,
  actionLabel,
}: {
  title: string;
  value: number;
  description: string;
  icon: React.ReactNode;
  status: 'ok' | 'warning' | 'danger';
  actionHref?: string;
  actionLabel?: string;
}) {
  const bgClass =
    status === 'ok'
      ? 'bg-emerald-50/50 border-emerald-200'
      : status === 'warning'
        ? 'bg-amber-50/50 border-amber-200'
        : 'bg-red-50/50 border-red-200';

  const textClass =
    status === 'ok'
      ? 'text-emerald-700'
      : status === 'warning'
        ? 'text-amber-700'
        : 'text-red-700';

  return (
    <div className={`flex flex-col justify-between rounded-xl border p-5 shadow-2xs ${bgClass}`}>
      <div>
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-800">{title}</h3>
          {icon}
        </div>
        <div className={`mt-2 text-3xl font-extrabold tracking-tight ${textClass}`}>{value}</div>
        <p className="mt-1 text-xs text-slate-600 leading-relaxed">{description}</p>
      </div>

      {actionHref && value > 0 && (
        <div className="mt-4 pt-3 border-t border-slate-200/60">
          <Link
            href={actionHref}
            className="inline-flex items-center gap-1 text-xs font-semibold text-slate-900 hover:underline"
          >
            {actionLabel ?? 'Resolve'} <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
      )}
    </div>
  );
}
