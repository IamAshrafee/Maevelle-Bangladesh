'use client';

import * as React from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  BarChart3,
  Bell,
  Boxes,
  Building2,
  Calendar,
  CreditCard,
  Download,
  Eye,
  FolderTree,
  Globe,
  HeartHandshake,
  LayoutDashboard,
  Megaphone,
  PackageSearch,
  RefreshCw,
  RotateCcw,
  Settings,
  ShoppingBag,
  Sparkles,
  Truck,
  Users,
} from 'lucide-react';

import { useAdminCapability } from '@/components/admin-capabilities';
import { Button } from '@/components/ui/button';
import { AdminPage, PageActions, PageHeader, PageSection } from '@/components/ui/page-shell';
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
import {
  getDateRangeFromPreset,
  type AnalyticsFreshnessDto,
  type AnalyticsViewKey,
  type DateRangePreset,
  type DateRangeSelection,
} from '@/lib/analytics/types';
import { cn } from '@/lib/utils';

const VIEW_NAVIGATION: readonly {
  readonly id: AnalyticsViewKey;
  readonly label: string;
  readonly icon: React.ComponentType<{ className?: string }>;
  readonly capability?: string;
}[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'sales', label: 'Sales & Orders', icon: ShoppingBag },
  { id: 'products', label: 'Products & SKUs', icon: PackageSearch },
  { id: 'customers', label: 'Customers & LTV', icon: Users },
  { id: 'inventory', label: 'Inventory', icon: Boxes },
  { id: 'finance', label: 'Finance & Profitability', icon: CreditCard, capability: 'analytics.financial.view' },
  { id: 'supply', label: 'Supply & Procurement', icon: Building2 },
  { id: 'delivery', label: 'Delivery & Logistics', icon: Truck },
  { id: 'storefront', label: 'Storefront Funnel', icon: Eye },
  { id: 'marketing', label: 'Marketing & UTM', icon: Megaphone },
  { id: 'operations', label: 'Returns & Ops', icon: RotateCcw },
  { id: 'settings', label: 'Data Status & Settings', icon: Settings },
];

export function AnalyticsWorkspace() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // 1. URL State Parsing
  const activeView: AnalyticsViewKey = React.useMemo(() => {
    const rawView = searchParams.get('view')?.toLowerCase();
    const valid = VIEW_NAVIGATION.find((v) => v.id === rawView);
    return (valid?.id as AnalyticsViewKey) ?? 'overview';
  }, [searchParams]);

  const selection: DateRangeSelection = React.useMemo(() => {
    const presetParam = searchParams.get('preset') as DateRangePreset | null;
    const fromParam = searchParams.get('from');
    const toParam = searchParams.get('to');
    const granParam = searchParams.get('granularity') as 'DAY' | 'WEEK' | 'MONTH' | null;
    const currParam = searchParams.get('currency');

    if (presetParam && presetParam !== 'CUSTOM') {
      const { from, to } = getDateRangeFromPreset(presetParam);
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

    const { from, to } = getDateRangeFromPreset('LAST_30_DAYS');
    return {
      preset: 'LAST_30_DAYS',
      from,
      to,
      granularity: granParam ?? 'DAY',
      currency: currParam ?? 'BDT',
    };
  }, [searchParams]);

  // 2. URL State Updater
  const updateUrl = React.useCallback(
    (newView: AnalyticsViewKey, newSelection: DateRangeSelection) => {
      const params = new URLSearchParams();
      params.set('view', newView);
      params.set('preset', newSelection.preset);
      params.set('from', newSelection.from);
      params.set('to', newSelection.to);
      params.set('granularity', newSelection.granularity);
      if (newSelection.currency !== 'BDT') {
        params.set('currency', newSelection.currency);
      }
      router.push(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router],
  );

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
      />

      {/* Local Workspace Subnavigation */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 -mt-2 border-b border-border/70 scrollbar-none">
        {VIEW_NAVIGATION.map((item) => {
          const isActive = activeView === item.id;
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleViewChange(item.id)}
              className={cn(
                'inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs sm:text-sm font-medium whitespace-nowrap transition-colors duration-150 cursor-pointer select-none',
                isActive
                  ? 'bg-primary text-primary-foreground font-semibold shadow-2xs'
                  : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
              )}
            >
              <Icon className="size-4 shrink-0" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>

      {/* Global Filter Toolbar */}
      <AnalyticsFilterToolbar
        selection={selection}
        onChange={handleSelectionChange}
        showGranularity={activeView === 'overview' || activeView === 'sales'}
        onExportClick={() => handleViewChange('settings')}
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
        {activeView === 'marketing' && <MarketingView selection={selection} />}
        {activeView === 'operations' && <OperationsView selection={selection} />}
        {activeView === 'settings' && <SettingsView selection={selection} />}
      </div>
    </AdminPage>
  );
}
