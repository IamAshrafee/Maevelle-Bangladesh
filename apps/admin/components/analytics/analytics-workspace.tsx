'use client';

import * as React from 'react';
import dynamic from 'next/dynamic';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import { useAdminContext } from '@/components/admin-capabilities';
import { type NavIconKey } from '@/lib/navigation/route-registry';
import { RefreshButton } from '@/components/ui/refresh-button';
import { AdminPage, ErrorState, LoadingState, PageHeader } from '@/components/ui/page-shell';
import { WorkspaceTabs, type WorkspaceTabItem } from '@/components/ui/workspace-tabs';
import { AnalyticsFilterToolbar } from './analytics-filter-toolbar';
import { CustomersView } from './views/customers-view';
import { DeliveryView } from './views/delivery-view';
import { FinanceView } from './views/finance-view';
import { InventoryView } from './views/inventory-view';
import { MarketingView } from './views/marketing-view';
import { OperationsView } from './views/operations-view';
import { OverviewView } from './views/overview-view';
import { ProductsView } from './views/products-view';
import { SalesView } from './views/sales-view';
import { SettingsView } from './views/settings-view';
import { StorefrontView } from './views/storefront-view';
import { SupplyView } from './views/supply-view';
import { WishlistView } from './views/wishlist-view';
import {
  getDateRangeFromPreset,
  type AnalyticsViewKey,
  type DateRangePreset,
  type DateRangeSelection,
} from '@/lib/analytics/types';

const CommerceView = dynamic(
  () => import('./views/commerce-view').then((module) => module.CommerceView),
  { loading: () => <LoadingState message="Loading commerce reporting…" /> },
);

const CartView = dynamic(() => import('./views/cart-view').then((module) => module.CartView), {
  loading: () => <LoadingState message="Loading Cart Analytics…" />,
});

const VIEW_NAVIGATION: readonly {
  readonly id: AnalyticsViewKey;
  readonly label: string;
  readonly icon: NavIconKey;
  readonly capability?: string;
}[] = [
  { id: 'overview', label: 'Overview', icon: 'layout-dashboard' },
  { id: 'sales', label: 'Sales & Orders', icon: 'shopping-bag' },
  { id: 'products', label: 'Products & SKUs', icon: 'package-search' },
  { id: 'customers', label: 'Customers & LTV', icon: 'users' },
  { id: 'inventory', label: 'Inventory', icon: 'boxes' },
  {
    id: 'finance',
    label: 'Finance & Profitability',
    icon: 'credit-card',
    capability: 'analytics.financial.view',
  },
  { id: 'supply', label: 'Supply & Procurement', icon: 'building' },
  { id: 'delivery', label: 'Delivery & Logistics', icon: 'truck' },
  { id: 'storefront', label: 'Storefront Funnel', icon: 'activity' },
  {
    id: 'commerce',
    label: 'Commerce integrity',
    icon: 'shield-check',
    capability: 'analytics.financial.view',
  },
  { id: 'cart', label: 'Cart Analytics', icon: 'shopping-bag', capability: 'analytics.view' },
  { id: 'wishlist', label: 'Wishlist & Demand', icon: 'sparkles', capability: 'analytics.view' },
  { id: 'marketing', label: 'Marketing & UTM', icon: 'bar-chart' },
  { id: 'operations', label: 'Returns & Ops', icon: 'refresh-cw' },
  { id: 'settings', label: 'Data Status & Settings', icon: 'settings' },
];

export function AnalyticsWorkspace() {
  const router = useRouter();
  const adminContext = useAdminContext();
  const [reportRefreshVersion, setReportRefreshVersion] = React.useState(0);
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const ownerKey = `${adminContext.actorId}:${adminContext.organizationId}`;
  const [reportTimezone, setReportTimezone] = React.useState({
    owner: ownerKey,
    timezone: 'Asia/Dhaka',
  });
  const timezone = reportTimezone.owner === ownerKey ? reportTimezone.timezone : 'Asia/Dhaka';
  const handleTimezoneChange = React.useCallback(
    (value: string) => setReportTimezone({ owner: ownerKey, timezone: value }),
    [ownerKey],
  );

  // 1. URL State Parsing
  const activeView: AnalyticsViewKey = React.useMemo(() => {
    const rawView = searchParams.get('view')?.toLowerCase();
    const valid = VIEW_NAVIGATION.find((v) => v.id === rawView);
    return (valid?.id as AnalyticsViewKey) ?? 'overview';
  }, [searchParams]);

  const calendarTimezone = activeView === 'commerce' ? 'UTC' : timezone;
  const selection: DateRangeSelection = React.useMemo(() => {
    const presetParam = searchParams.get('preset') as DateRangePreset | null;
    const fromParam = searchParams.get('from');
    const toParam = searchParams.get('to');
    const granParam = searchParams.get('granularity') as 'DAY' | 'WEEK' | 'MONTH' | null;
    const currParam = searchParams.get('currency');

    if (presetParam && presetParam !== 'CUSTOM') {
      const { from, to } = getDateRangeFromPreset(presetParam, calendarTimezone);
      return {
        preset: presetParam,
        from: fromParam ?? from,
        to: toParam ?? to,
        granularity: granParam ?? 'DAY',
        currency: currParam ?? 'BDT',
      };
    }

    if (fromParam && toParam) {
      return {
        preset: 'CUSTOM',
        from: fromParam,
        to: toParam,
        granularity: granParam ?? 'DAY',
        currency: currParam ?? 'BDT',
      };
    }

    const { from, to } = getDateRangeFromPreset('LAST_30_DAYS', calendarTimezone);
    return {
      preset: 'LAST_30_DAYS',
      from,
      to,
      granularity: granParam ?? 'DAY',
      currency: currParam ?? 'BDT',
    };
  }, [searchParams, calendarTimezone]);

  // 2. URL State Updater
  const updateUrl = React.useCallback(
    (newView: AnalyticsViewKey, newSelection: DateRangeSelection) => {
      const params = new URLSearchParams();
      params.set('view', newView);
      if (newView === 'commerce' && searchParams.get('trafficClass'))
        params.set('trafficClass', searchParams.get('trafficClass')!);
      params.set('preset', newSelection.preset);
      params.set('from', newSelection.from);
      params.set('to', newSelection.to);
      params.set('granularity', newSelection.granularity);
      if (newSelection.currency !== 'BDT') {
        params.set('currency', newSelection.currency);
      }
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  type AnalyticsCategoryId = 'commerce' | 'merchandise' | 'logistics' | 'finance';

  const ANALYTICS_CATEGORIES: readonly {
    id: AnalyticsCategoryId;
    label: string;
    views: readonly AnalyticsViewKey[];
  }[] = [
    {
      id: 'commerce',
      label: 'Commerce & Orders',
      views: ['overview', 'commerce', 'sales', 'customers', 'marketing'],
    },
    {
      id: 'merchandise',
      label: 'Merchandise & Demand',
      views: ['products', 'storefront', 'cart', 'wishlist'],
    },
    {
      id: 'logistics',
      label: 'Inventory & Logistics',
      views: ['inventory', 'supply', 'delivery'],
    },
    {
      id: 'finance',
      label: 'Finance & Integrity',
      views: ['finance', 'operations', 'settings'],
    },
  ];

  const permittedViews = React.useMemo(
    () =>
      VIEW_NAVIGATION.filter(
        (item) => !item.capability || adminContext.capabilities.includes(item.capability),
      ),
    [adminContext.capabilities],
  );

  const visibleCategories: WorkspaceTabItem<AnalyticsCategoryId>[] = React.useMemo(
    () =>
      ANALYTICS_CATEGORIES.filter((cat) =>
        cat.views.some((v) => permittedViews.some((item) => item.id === v)),
      ).map((cat) => ({
        value: cat.id,
        label: cat.label,
      })),
    [permittedViews],
  );

  const activeCategory: AnalyticsCategoryId = React.useMemo(() => {
    const matched = ANALYTICS_CATEGORIES.find((cat) => cat.views.includes(activeView));
    return matched?.id ?? visibleCategories[0]?.value ?? 'commerce';
  }, [activeView, visibleCategories]);

  const visibleTabs: WorkspaceTabItem<AnalyticsViewKey>[] = React.useMemo(() => {
    const currentCategory = ANALYTICS_CATEGORIES.find((cat) => cat.id === activeCategory);
    const allowedIds = new Set(currentCategory?.views ?? []);
    return permittedViews
      .filter((item) => allowedIds.has(item.id))
      .map((item) => ({
        value: item.id,
        label: item.label,
        icon: item.icon,
      }));
  }, [activeCategory, permittedViews]);

  const handleCategoryChange = (categoryId: AnalyticsCategoryId) => {
    const category = ANALYTICS_CATEGORIES.find((cat) => cat.id === categoryId);
    const firstPermitted = category?.views.find((v) =>
      permittedViews.some((item) => item.id === v),
    );
    if (firstPermitted) {
      updateUrl(firstPermitted, selection);
    }
  };

  const handleViewChange = (view: AnalyticsViewKey) => {
    updateUrl(view, selection);
  };

  const handleSelectionChange = (nextSelection: DateRangeSelection) => {
    updateUrl(activeView, nextSelection);
  };

  return (
    <AdminPage>
      {/* Page Header */}
      <PageHeader
        eyebrow="Operations & Intelligence"
        title="Analytics & Business Intelligence"
        description="Comprehensive commercial reporting, period-over-period comparisons, and cross-domain operational intelligence. Derived from authoritative transactional source facts."
        actions={
          <RefreshButton
            tooltip="Refresh analytics data"
            onRefresh={() => {
              if (activeView === 'wishlist' || activeView === 'cart' || activeView === 'commerce')
                setReportRefreshVersion((value) => value + 1);
              else router.refresh();
            }}
          />
        }
      />

      {/* Two-Tier Workspace Subnavigation: Category (Tier 1) + Views (Tier 2) */}
      <div className="-mt-2 flex flex-col gap-2.5 border-b border-border/70 pb-3">
        {visibleCategories.length > 1 ? (
          <WorkspaceTabs
            items={visibleCategories}
            value={activeCategory}
            onValueChange={handleCategoryChange}
            maxVisible={4}
            variant="pill"
            ariaLabel="Analytics categories"
          />
        ) : null}
        <WorkspaceTabs
          items={visibleTabs}
          value={activeView}
          onValueChange={handleViewChange}
          maxVisible={5}
          variant="underline"
          ariaLabel="Analytics reporting views"
        />
      </div>

      {/* Global Filter Toolbar */}
      <AnalyticsFilterToolbar
        timezone={
          activeView === 'commerce' ? 'UTC' : activeView === 'wishlist' ? timezone : 'Asia/Dhaka'
        }
        exportDisabled={activeView === 'commerce'}
        selection={selection}
        onChange={handleSelectionChange}
        showGranularity={activeView === 'overview' || activeView === 'sales'}
        {...(activeView === 'cart' ? {} : { onExportClick: () => handleViewChange('settings') })}
      />

      {/* Active Reporting View */}
      <div className="min-w-0">
        {activeView === 'overview' && (
          <OverviewView selection={selection} onNavigateView={handleViewChange} />
        )}
        {activeView === 'sales' && <SalesView selection={selection} />}
        {activeView === 'products' && <ProductsView selection={selection} />}
        {activeView === 'customers' && <CustomersView selection={selection} />}
        {activeView === 'inventory' && <InventoryView selection={selection} />}
        {activeView === 'finance' && <FinanceView selection={selection} />}
        {activeView === 'supply' && <SupplyView selection={selection} />}
        {activeView === 'delivery' && <DeliveryView selection={selection} />}
        {activeView === 'storefront' && <StorefrontView selection={selection} />}
        {activeView === 'cart' &&
          (adminContext.capabilities.includes('analytics.view') ? (
            <CartView
              key={ownerKey}
              from={selection.from}
              to={selection.to}
              organizationId={adminContext.organizationId}
              refreshVersion={reportRefreshVersion}
            />
          ) : (
            <ErrorState title="Cart Analytics access denied" />
          ))}
        {activeView === 'wishlist' && (
          <WishlistView
            key={`${adminContext.actorId}:${adminContext.organizationId}`}
            refreshVersion={reportRefreshVersion}
            onTimezoneChange={handleTimezoneChange}
            selection={selection}
            onSwitchPreset={(preset) =>
              handleSelectionChange({
                ...selection,
                preset,
                ...getDateRangeFromPreset(preset, timezone),
              })
            }
          />
        )}
        {activeView === 'commerce' && (
          <CommerceView
            from={selection.from}
            to={selection.to}
            currency={selection.currency}
            refreshVersion={reportRefreshVersion}
          />
        )}
        {activeView === 'marketing' && <MarketingView selection={selection} />}
        {activeView === 'operations' && <OperationsView selection={selection} />}
        {activeView === 'settings' && <SettingsView selection={selection} />}
      </div>
    </AdminPage>
  );
}
