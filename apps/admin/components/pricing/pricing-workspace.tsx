'use client';

import * as React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertCircle,
  CheckCircle2,
  Plus,
  X,
} from 'lucide-react';

import {
  AdminPage,
  ErrorState,
  LoadingState,
  PageActions,
  PageHeader,
  PageSection,
} from '@/components/ui/page-shell';
import { Button } from '@/components/ui/button';
import { RefreshButton } from '@/components/ui/refresh-button';
import { apiRequest, ApiRequestError } from '@/lib/api';

import { PricingStats } from './pricing-stats';
import { PricingToolbar, type PricingFilterTab } from './pricing-toolbar';
import { PricingTable } from './pricing-table';
import { CreatePriceSheet } from './create-price-sheet';
import { QuickPriceDialog } from './quick-price-dialog';
import { VariantHistoryDrawer } from './variant-history-drawer';
import { ArchivePriceDialog } from './archive-price-dialog';
import {
  getScheduleCategory,
  type CatalogProductSummary,
  type VariantPriceItem,
} from './types';

export function PricingWorkspace() {
  const [prices, setPrices] = React.useState<readonly VariantPriceItem[]>([]);
  const [products, setProducts] = React.useState<readonly CatalogProductSummary[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);

  // Notification Banner
  const [notification, setNotification] = React.useState<{
    text: string;
    type: 'success' | 'error';
  } | null>(null);

  // Filters & State
  const [query, setQuery] = React.useState('');
  const [activeTab, setActiveTab] = React.useState<PricingFilterTab>('ALL');
  const [currency, setCurrency] = React.useState('ALL');
  const [density, setDensity] = React.useState<'comfortable' | 'compact'>('comfortable');

  // Dialog & Sheet States
  const [createSheetOpen, setCreateSheetOpen] = React.useState(false);
  const [quickUpdateItem, setQuickUpdateItem] = React.useState<VariantPriceItem | null>(null);
  const [quickUpdateOpen, setQuickUpdateOpen] = React.useState(false);
  const [historyItem, setHistoryItem] = React.useState<VariantPriceItem | null>(null);
  const [historyOpen, setHistoryOpen] = React.useState(false);
  const [archiveItem, setArchiveItem] = React.useState<VariantPriceItem | null>(null);
  const [archiveOpen, setArchiveOpen] = React.useState(false);

  // Load Initial Data
  const loadWorkspaceData = React.useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setLoadError(null);
    try {
      const [priceRes, productRes] = await Promise.all([
        apiRequest<{ data: readonly VariantPriceItem[] }>('/admin/pricing/prices'),
        apiRequest<{ data: readonly CatalogProductSummary[] }>('/admin/catalog/products'),
      ]);
      setPrices(priceRes.data ?? []);
      setProducts(productRes.data ?? []);
    } catch (err) {
      setLoadError(
        err instanceof ApiRequestError ? err.message : 'Pricing workspace could not be loaded.',
      );
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadWorkspaceData();
  }, [loadWorkspaceData]);

  function showNotification(text: string, type: 'success' | 'error' = 'success') {
    setNotification({ text, type });
    setTimeout(() => {
      setNotification((curr) => (curr?.text === text ? null : curr));
    }, 4500);
  }

  // Filter Computation
  const now = new Date();

  const tabCounts = React.useMemo(() => {
    let live = 0;
    let upcoming = 0;
    let draft = 0;
    let archived = 0;

    for (const p of prices) {
      const cat = getScheduleCategory(p, now);
      if (cat === 'LIVE_ACTIVE') live++;
      else if (cat === 'UPCOMING') upcoming++;
      else if (cat === 'DRAFT') draft++;
      else if (cat === 'ARCHIVED' || cat === 'EXPIRED') archived++;
    }

    return {
      ALL: prices.length,
      LIVE_ACTIVE: live,
      UPCOMING: upcoming,
      DRAFT: draft,
      ARCHIVED: archived,
    };
  }, [prices, now]);

  const filteredPrices = React.useMemo(() => {
    const q = query.trim().toLowerCase();

    return prices.filter((item) => {
      // 1. Currency filter
      if (currency !== 'ALL' && item.currency !== currency) {
        return false;
      }

      // 2. Tab Category filter
      if (activeTab !== 'ALL') {
        const cat = getScheduleCategory(item, now);
        if (activeTab === 'LIVE_ACTIVE' && cat !== 'LIVE_ACTIVE') return false;
        if (activeTab === 'UPCOMING' && cat !== 'UPCOMING') return false;
        if (activeTab === 'DRAFT' && cat !== 'DRAFT') return false;
        if (activeTab === 'ARCHIVED' && cat !== 'ARCHIVED' && cat !== 'EXPIRED') return false;
      }

      // 3. Search query filter
      if (q) {
        const matchesProduct = item.productTitle?.toLowerCase().includes(q);
        const matchesSku = item.sku?.toLowerCase().includes(q);
        const matchesVariant = item.variantTitle?.toLowerCase().includes(q);
        const matchesCurrency = item.currency?.toLowerCase().includes(q);
        const matchesAmount = item.amount?.includes(q);
        if (!matchesProduct && !matchesSku && !matchesVariant && !matchesCurrency && !matchesAmount) {
          return false;
        }
      }

      return true;
    });
  }, [prices, query, activeTab, currency, now]);

  // Handlers
  function handleOpenQuickUpdate(item: VariantPriceItem) {
    setQuickUpdateItem(item);
    setQuickUpdateOpen(true);
  }

  function handleOpenHistory(item: VariantPriceItem) {
    setHistoryItem(item);
    setHistoryOpen(true);
  }

  function handleOpenArchive(item: VariantPriceItem) {
    setArchiveItem(item);
    setArchiveOpen(true);
  }

  return (
    <AdminPage>
      {/* Header */}
      <PageHeader
        eyebrow="Commerce / Pricing"
        title="Variant Pricing & Schedules"
        description="Manage authoritative selling prices, compare-at retail markdowns, and promotional date schedules."
        actions={
          <PageActions>
            <RefreshButton
              onRefresh={() => void loadWorkspaceData(true)}
              tooltip="Refresh pricing records"
            />
            <Button
              onClick={() => setCreateSheetOpen(true)}
              className="gap-1.5 shadow-2xs"
            >
              <Plus className="size-4" aria-hidden="true" />
              <span>Set Variant Price</span>
            </Button>
          </PageActions>
        }
      />

      {/* Floating / Inline Notification Banner */}
      <AnimatePresence>
        {notification && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
            className={`flex items-center justify-between gap-3 rounded-xl border p-3.5 text-xs sm:text-sm font-medium ${
              notification.type === 'success'
                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200'
                : 'border-destructive/30 bg-destructive/10 text-destructive'
            }`}
            role="status"
          >
            <div className="flex items-center gap-2.5">
              {notification.type === 'success' ? (
                <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              ) : (
                <AlertCircle className="size-4 text-destructive shrink-0" />
              )}
              <span>{notification.text}</span>
            </div>
            <button
              type="button"
              onClick={() => setNotification(null)}
              className="rounded-md p-1 opacity-70 hover:opacity-100 cursor-pointer"
              aria-label="Dismiss notification"
            >
              <X className="size-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Load Error State */}
      {loadError && (
        <ErrorState
          title="Pricing Workspace Error"
          message={loadError}
          onRetry={() => void loadWorkspaceData()}
        />
      )}

      {/* Executive Metrics Overview */}
      <PricingStats items={prices} />

      {/* Main Worklist Section */}
      <PageSection>
        {/* Interactive Filter Toolbar */}
        <PricingToolbar
          query={query}
          onQueryChange={setQuery}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          currency={currency}
          onCurrencyChange={setCurrency}
          density={density}
          onDensityChange={setDensity}
          totalCount={prices.length}
          filteredCount={filteredPrices.length}
          tabCounts={tabCounts}
        />

        {/* Content Area: Table / Loading / Empty */}
        {loading ? (
          <LoadingState message="Loading variant prices and schedules…" />
        ) : (
          <PricingTable
            items={filteredPrices}
            density={density}
            onQuickUpdatePrice={handleOpenQuickUpdate}
            onViewHistory={handleOpenHistory}
            onArchivePrice={handleOpenArchive}
            hasFilters={query.trim() !== '' || currency !== 'ALL' || activeTab !== 'ALL'}
            onClearFilters={() => {
              setQuery('');
              setCurrency('ALL');
              setActiveTab('ALL');
            }}
          />
        )}
      </PageSection>

      {/* Slide-over Create / Schedule Price Sheet */}
      <CreatePriceSheet
        open={createSheetOpen}
        onOpenChange={setCreateSheetOpen}
        products={products}
        existingPrices={prices}
        onSuccess={(msg) => {
          showNotification(msg, 'success');
          void loadWorkspaceData(true);
        }}
      />

      {/* Quick Price Update Modal */}
      <QuickPriceDialog
        item={quickUpdateItem}
        open={quickUpdateOpen}
        onOpenChange={setQuickUpdateOpen}
        onSuccess={(_item, msg) => {
          showNotification(msg, 'success');
          void loadWorkspaceData(true);
        }}
      />

      {/* Variant Price History & Schedules Timeline Drawer */}
      <VariantHistoryDrawer
        item={historyItem}
        allPrices={prices}
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        onQuickUpdatePrice={handleOpenQuickUpdate}
        onArchivePrice={handleOpenArchive}
      />

      {/* Archive / Deactivate Confirmation Dialog */}
      <ArchivePriceDialog
        item={archiveItem}
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        onSuccess={(_id, msg) => {
          showNotification(msg, 'success');
          void loadWorkspaceData(true);
        }}
      />
    </AdminPage>
  );
}

