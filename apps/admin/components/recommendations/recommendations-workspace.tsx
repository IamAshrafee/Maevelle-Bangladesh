'use client';

import * as React from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'motion/react';
import {
  Sparkles,
  Layers,
  Settings2,
  Eye,
  BarChart3,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  RefreshCw,
} from 'lucide-react';
import type { RecommendationPlacementSettingsDto } from '@maevelle/contracts';
import { fetchApiData } from '@/lib/api';
import { AdminPage, PageHeader } from '@/components/ui/page-shell';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useAdminCapability } from '@/components/admin-capabilities';

import type {
  CoverageResponse,
  PerformanceResponse,
  ProductTypeItem,
  RuleItem,
} from './recommendations-types';
import { RecommendationsStats } from './recommendations-stats';
import { CoverageTab } from './tabs/coverage-tab';
import { CompatibilityRulesTab } from './tabs/compatibility-rules-tab';
import { PlacementsTab } from './tabs/placements-tab';
import { PreviewInspectorTab } from './tabs/preview-inspector-tab';
import { AnalyticsTab } from './tabs/analytics-tab';
import { CompatibilityRuleDialog } from './compatibility-rule-dialog';
import { DeleteRuleDialog } from './delete-rule-dialog';
import { BulkMerchandisingSheet } from './bulk-merchandising-sheet';

function dateOffset(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

export function RecommendationsWorkspace() {
  const canManage = useAdminCapability('recommendations.manage');
  const canCurate = useAdminCapability('recommendations.curate');
  const canViewAnalytics = useAdminCapability('analytics.view');

  // Navigation tab state
  const [activeTab, setActiveTab] = React.useState('coverage');

  // Core Data States
  const [placements, setPlacements] = React.useState<RecommendationPlacementSettingsDto[]>([]);
  const [types, setTypes] = React.useState<ProductTypeItem[]>([]);

  // Rules Tab State
  const [rules, setRules] = React.useState<RuleItem[]>([]);
  const [rulePage, setRulePage] = React.useState(1);
  const [ruleQuery, setRuleQuery] = React.useState('');
  const [ruleTotal, setRuleTotal] = React.useState(0);
  const [rulesLoading, setRulesLoading] = React.useState(false);

  // Coverage Tab State
  const [coverage, setCoverage] = React.useState<CoverageResponse | null>(null);
  const [coveragePage, setCoveragePage] = React.useState(1);
  const [coverageQuery, setCoverageQuery] = React.useState('');
  const [coverageLoading, setCoverageLoading] = React.useState(false);
  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);

  // Analytics & Stats State
  const [performance, setPerformance] = React.useState<PerformanceResponse | null>(null);
  const [performanceLoading, setPerformanceLoading] = React.useState(false);
  const [dateRange, setDateRange] = React.useState<{ from: string; to: string }>(() => ({
    from: dateOffset(-30),
    to: dateOffset(0),
  }));

  // Preview Inspector State
  const [inspectProductId, setInspectProductId] = React.useState('');

  // Dialog & Sheet States
  const [ruleDialogOpen, setRuleDialogOpen] = React.useState(false);
  const [editingRule, setEditingRule] = React.useState<RuleItem | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = React.useState(false);
  const [deletingRule, setDeletingRule] = React.useState<RuleItem | null>(null);
  const [bulkSheetOpen, setBulkSheetOpen] = React.useState(false);

  // Status & Feedback messages
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [message, setMessage] = React.useState('');

  const showNotification = React.useCallback(
    (text: string, isError = false) => {
      if (isError) {
        setError(text);
        setMessage('');
      } else {
        setMessage(text);
        setError('');
      }
      setTimeout(() => {
        setMessage((current) => (current === text ? '' : current));
      }, 5000);
    },
    [],
  );

  // 1. Load Placements Defaults & Product Types
  const loadPlacements = React.useCallback(async () => {
    try {
      const data = await fetchApiData<RecommendationPlacementSettingsDto[]>(
        '/admin/recommendations/placements',
      );
      setPlacements(data);
    } catch (caught) {
      showNotification(
        caught instanceof Error ? caught.message : 'Unable to load placements.',
        true,
      );
    }
  }, [showNotification]);

  const loadProductTypes = React.useCallback(async () => {
    try {
      const data = await fetchApiData<ProductTypeItem[]>('/admin/catalog/product-types');
      setTypes(data);
    } catch {
      // Ignore background type fetching failure
    }
  }, []);

  // 2. Load Compatibility Rules
  const loadRules = React.useCallback(async () => {
    setRulesLoading(true);
    try {
      const params = new URLSearchParams({
        q: ruleQuery,
        page: String(rulePage),
        pageSize: '20',
      });
      const result = await fetchApiData<{ items: RuleItem[]; total: number }>(
        `/admin/recommendations/compatibility-rules?${params}`,
      );
      setRules(result.items);
      setRuleTotal(result.total);
    } catch (caught) {
      showNotification(
        caught instanceof Error ? caught.message : 'Unable to load compatibility rules.',
        true,
      );
    } finally {
      setRulesLoading(false);
    }
  }, [ruleQuery, rulePage, showNotification]);

  // 3. Load Catalog Coverage
  const loadCoverage = React.useCallback(async () => {
    setCoverageLoading(true);
    try {
      const params = new URLSearchParams({
        q: coverageQuery,
        page: String(coveragePage),
        pageSize: '10',
      });
      const data = await fetchApiData<CoverageResponse>(
        `/admin/recommendations/coverage?${params}`,
      );
      setCoverage(data);
    } catch (caught) {
      showNotification(
        caught instanceof Error ? caught.message : 'Unable to load catalog coverage.',
        true,
      );
    } finally {
      setCoverageLoading(false);
    }
  }, [coverageQuery, coveragePage, showNotification]);

  // 4. Load Analytics Performance
  const loadPerformance = React.useCallback(async () => {
    if (!canViewAnalytics) return;
    setPerformanceLoading(true);
    try {
      const data = await fetchApiData<PerformanceResponse>(
        `/admin/recommendations/performance?from=${dateRange.from}&to=${dateRange.to}`,
      );
      setPerformance(data);
    } catch {
      setPerformance(null);
    } finally {
      setPerformanceLoading(false);
    }
  }, [dateRange, canViewAnalytics]);

  // Initial mount loads
  React.useEffect(() => {
    void loadPlacements();
    void loadProductTypes();
  }, [loadPlacements, loadProductTypes]);

  // Fetch rules when query or page changes
  React.useEffect(() => {
    void loadRules();
  }, [loadRules]);

  // Fetch coverage when query or page changes
  React.useEffect(() => {
    void loadCoverage();
  }, [loadCoverage]);

  // Fetch performance metrics when dateRange changes
  React.useEffect(() => {
    void loadPerformance();
  }, [loadPerformance]);

  // Handlers for Placements
  async function handleSavePlacement(item: RecommendationPlacementSettingsDto) {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const saved = await fetchApiData<RecommendationPlacementSettingsDto>(
        `/admin/recommendations/placements/${item.code}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ ...item, expectedVersion: item.version }),
        },
      );
      setPlacements((prev) => prev.map((p) => (p.code === item.code ? saved : p)));
      showNotification(`${item.code === 'pdp_complementary' ? 'Complete Your Look' : 'You May Also Like'} settings updated.`);
    } catch (caught) {
      showNotification(caught instanceof Error ? caught.message : 'Unable to save placement.', true);
      throw caught;
    } finally {
      setBusy(false);
    }
  }

  // Handlers for Compatibility Rules
  async function handleSaveRule(input: {
    sourceProductTypeId: string;
    targetProductTypeId: string;
    strength: number;
    enabled: boolean;
    expectedVersion: number;
  }) {
    await fetchApiData('/admin/recommendations/compatibility-rules', {
      method: 'PUT',
      body: JSON.stringify(input),
    });
    await loadRules();
    showNotification('Compatibility rule saved successfully.');
  }

  async function handleToggleRule(rule: RuleItem) {
    try {
      await fetchApiData('/admin/recommendations/compatibility-rules', {
        method: 'PUT',
        body: JSON.stringify({
          sourceProductTypeId: rule.sourceProductTypeId,
          targetProductTypeId: rule.targetProductTypeId,
          strength: rule.strength,
          enabled: !rule.enabled,
          expectedVersion: rule.version,
        }),
      });
      await loadRules();
      showNotification(`Rule ${rule.enabled ? 'disabled' : 'enabled'}.`);
    } catch (caught) {
      showNotification(caught instanceof Error ? caught.message : 'Unable to toggle rule.', true);
    }
  }

  async function handleDeleteRule(ruleId: string) {
    await fetchApiData(`/admin/recommendations/compatibility-rules/${ruleId}`, {
      method: 'DELETE',
    });
    await loadRules();
    showNotification('Compatibility rule deleted.');
  }

  // Handlers for Coverage & Bulk
  function handleToggleSelect(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  }

  function handleSelectAllPage(ids: string[]) {
    setSelectedIds((prev) => Array.from(new Set([...prev, ...ids])));
  }

  function handleInspectProduct(productId: string) {
    setInspectProductId(productId);
    setActiveTab('preview');
  }

  const selectedProducts = React.useMemo(() => {
    return (coverage?.items ?? []).filter((item) => selectedIds.includes(item.id));
  }, [coverage, selectedIds]);

  return (
    <AdminPage>
      {/* Page Header */}
      <PageHeader
        eyebrow="Catalog Merchandising"
        title="Product Recommendations"
        description="Configure storefront PDP discovery carousels, cross-sell styling affinity rules, catalog coverage, and consented shopper engagement."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => {
                void loadPlacements();
                void loadRules();
                void loadCoverage();
                void loadPerformance();
                showNotification('All data refreshed.');
              }}
              className="h-9 text-xs gap-1.5"
            >
              <RefreshCw className={`size-3.5 ${busy ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button
              render={<Link href="/products" />}
              nativeButton={false}
              variant="default"
              size="sm"
              className="h-9 text-xs gap-1.5 shadow-sm"
            >
              <ExternalLink className="size-3.5" />
              Open Products Catalog
            </Button>
          </div>
        }
      />

      {/* Global Notification Banner */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            role="alert"
            className="flex items-center gap-2.5 rounded-xl border border-destructive/30 bg-destructive/10 p-3.5 text-xs sm:text-sm text-destructive"
          >
            <AlertCircle className="size-4 shrink-0" />
            <span className="flex-1 font-medium">{error}</span>
            <button
              type="button"
              onClick={() => setError('')}
              className="text-destructive/80 hover:text-destructive cursor-pointer"
            >
              Dismiss
            </button>
          </motion.div>
        )}
        {message && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            role="status"
            className="flex items-center gap-2.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-xs sm:text-sm text-emerald-700 dark:text-emerald-400"
          >
            <CheckCircle2 className="size-4 shrink-0" />
            <span className="flex-1 font-medium">{message}</span>
            <button
              type="button"
              onClick={() => setMessage('')}
              className="text-emerald-700/80 hover:text-emerald-700 dark:text-emerald-400 cursor-pointer"
            >
              Dismiss
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hero Overview & KPI Stats */}
      {canViewAnalytics && (
        <RecommendationsStats
          performance={performance}
          loading={performanceLoading}
          dateRange={dateRange}
          onDateRangeChange={(from, to) => setDateRange({ from, to })}
          onRefresh={() => void loadPerformance()}
        />
      )}

      {/* Navigation Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-5">
        <div className="overflow-x-auto pb-1">
          <TabsList className="h-10 p-1">
            <TabsTrigger value="coverage" className="gap-2 text-xs sm:text-sm">
              <Layers className="size-3.5" />
              <span>Catalog Coverage</span>
              {coverage && (
                <span className="rounded-full bg-muted/80 px-1.5 py-0.2 font-mono text-[11px] tabular-nums">
                  {coverage.total}
                </span>
              )}
            </TabsTrigger>

            <TabsTrigger value="compatibility" className="gap-2 text-xs sm:text-sm">
              <Sparkles className="size-3.5" />
              <span>Compatibility Rules</span>
              <span className="rounded-full bg-muted/80 px-1.5 py-0.2 font-mono text-[11px] tabular-nums">
                {ruleTotal}
              </span>
            </TabsTrigger>

            <TabsTrigger value="placements" className="gap-2 text-xs sm:text-sm">
              <Settings2 className="size-3.5" />
              <span>Placement Settings</span>
            </TabsTrigger>

            <TabsTrigger value="preview" className="gap-2 text-xs sm:text-sm">
              <Eye className="size-3.5" />
              <span>Storefront Preview</span>
            </TabsTrigger>

            {canViewAnalytics && (
              <TabsTrigger value="analytics" className="gap-2 text-xs sm:text-sm">
                <BarChart3 className="size-3.5" />
                <span>Analytics</span>
              </TabsTrigger>
            )}
          </TabsList>
        </div>

        {/* Tab 1: Catalog Coverage */}
        <TabsContent value="coverage" className="outline-none focus:ring-0">
          <CoverageTab
            coverage={coverage}
            loading={coverageLoading}
            query={coverageQuery}
            onQueryChange={setCoverageQuery}
            page={coveragePage}
            onPageChange={setCoveragePage}
            selectedIds={selectedIds}
            onToggleSelect={handleToggleSelect}
            onSelectAllPage={handleSelectAllPage}
            onClearSelected={() => setSelectedIds([])}
            onOpenBulkSheet={() => setBulkSheetOpen(true)}
            onInspectProduct={handleInspectProduct}
            canCurate={canCurate}
          />
        </TabsContent>

        {/* Tab 2: Compatibility Rules */}
        <TabsContent value="compatibility" className="outline-none focus:ring-0">
          <CompatibilityRulesTab
            rules={rules}
            loading={rulesLoading}
            total={ruleTotal}
            page={rulePage}
            query={ruleQuery}
            onPageChange={setRulePage}
            onQueryChange={setRuleQuery}
            onAddRule={() => {
              setEditingRule(null);
              setRuleDialogOpen(true);
            }}
            onEditRule={(rule) => {
              setEditingRule(rule);
              setRuleDialogOpen(true);
            }}
            onDeleteRule={(rule) => {
              setDeletingRule(rule);
              setDeleteDialogOpen(true);
            }}
            onToggleRule={handleToggleRule}
            canManage={canManage}
          />
        </TabsContent>

        {/* Tab 3: Placements Settings */}
        <TabsContent value="placements" className="outline-none focus:ring-0">
          <PlacementsTab
            placements={placements}
            onSavePlacement={handleSavePlacement}
            canManage={canManage}
            busy={busy}
          />
        </TabsContent>

        {/* Tab 4: Storefront Preview & Inspector */}
        <TabsContent value="preview" className="outline-none focus:ring-0">
          <PreviewInspectorTab
            initialProductId={inspectProductId}
            placements={placements}
          />
        </TabsContent>

        {/* Tab 5: Analytics */}
        {canViewAnalytics && (
          <TabsContent value="analytics" className="outline-none focus:ring-0">
            <AnalyticsTab
              performance={performance}
              loading={performanceLoading}
              dateRange={dateRange}
              onDateRangeChange={(from, to) => setDateRange({ from, to })}
              canViewAnalytics={canViewAnalytics}
            />
          </TabsContent>
        )}
      </Tabs>

      {/* Modal Dialogs and Sheets */}
      <CompatibilityRuleDialog
        open={ruleDialogOpen}
        onOpenChange={setRuleDialogOpen}
        types={types}
        editingRule={editingRule}
        onSave={handleSaveRule}
      />

      <DeleteRuleDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        rule={deletingRule}
        onConfirm={handleDeleteRule}
      />

      <BulkMerchandisingSheet
        open={bulkSheetOpen}
        onOpenChange={setBulkSheetOpen}
        selectedIds={selectedIds}
        selectedProducts={selectedProducts}
        onRemoveSelected={(id) => setSelectedIds((prev) => prev.filter((i) => i !== id))}
        onClearSelected={() => setSelectedIds([])}
        onSuccess={(msg) => {
          showNotification(msg);
          void loadCoverage();
        }}
      />
    </AdminPage>
  );
}
