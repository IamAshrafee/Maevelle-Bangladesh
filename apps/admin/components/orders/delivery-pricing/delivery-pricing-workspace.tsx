'use client';

import * as React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertCircle,
  Calculator,
  CheckCircle2,
  Plus,
  Truck,
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
import { fetchApiData } from '@/lib/api';

import { DeliveryPricingStats } from './delivery-pricing-stats';
import { DeliveryPricingToolbar } from './delivery-pricing-toolbar';
import { DeliveryPricingTable } from './delivery-pricing-table';
import { DeliveryPricingSimulator } from './delivery-pricing-simulator';
import { DeliveryPricingRuleDialog } from './delivery-pricing-rule-dialog';
import { DeliveryPricingInfoCard } from './delivery-pricing-info-card';
import type {
  DeliveryPricingRule,
  DeliveryPricingScopeFilter,
  DeliveryPricingSortOption,
  DeliveryPricingStatusTab,
} from './types';

export function DeliveryPricingWorkspace() {
  const [rules, setRules] = React.useState<readonly DeliveryPricingRule[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  // Notification Banner
  const [notification, setNotification] = React.useState<{
    text: string;
    type: 'success' | 'error';
  } | null>(null);

  // Filters & State
  const [query, setQuery] = React.useState('');
  const [activeTab, setActiveTab] = React.useState<DeliveryPricingStatusTab>('ALL');
  const [scopeFilter, setScopeFilter] = React.useState<DeliveryPricingScopeFilter>('ALL');
  const [sortOption, setSortOption] = React.useState<DeliveryPricingSortOption>('PRIORITY_DESC');
  const [density, setDensity] = React.useState<'comfortable' | 'compact'>('comfortable');

  // Simulator Toggle & Target
  const [showSimulator, setShowSimulator] = React.useState(false);
  const [targetSimulatorRule, setTargetSimulatorRule] = React.useState<DeliveryPricingRule | null>(null);

  // Dialog State
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editingRule, setEditingRule] = React.useState<DeliveryPricingRule | null>(null);

  const loadRules = React.useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setLoadError(null);
    try {
      const data = await fetchApiData<readonly DeliveryPricingRule[]>(
        '/admin/orders/delivery-pricing-rules',
      );
      setRules(data ?? []);
    } catch (err) {
      setLoadError(
        err instanceof Error ? err.message : 'Delivery pricing rules could not be loaded.',
      );
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadRules();
  }, [loadRules]);

  function showNotification(text: string, type: 'success' | 'error' = 'success') {
    setNotification({ text, type });
    setTimeout(() => {
      setNotification((curr) => (curr?.text === text ? null : curr));
    }, 4500);
  }

  // Handle Create or Update
  async function handleSubmitRule(formData: {
    name: string;
    countryCode: string;
    geographyNodeId?: string | null | undefined;
    flatAmount: string;
    currency: string;
    priority: number;
    status: 'ACTIVE' | 'INACTIVE';
    version?: number | undefined;
  }) {
    setBusy(true);
    try {
      if (editingRule) {
        // PATCH existing rule
        await fetchApiData(`/admin/orders/delivery-pricing-rules/${editingRule.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            version: formData.version ?? editingRule.version,
            name: formData.name,
            countryCode: formData.countryCode,
            geographyNodeId: formData.geographyNodeId ? formData.geographyNodeId : null,
            flatAmount: formData.flatAmount,
            currency: formData.currency,
            priority: formData.priority,
            status: formData.status,
          }),
        });
        showNotification(`Delivery rule "${formData.name}" was updated successfully.`);
      } else {
        // POST new rule
        await fetchApiData('/admin/orders/delivery-pricing-rules', {
          method: 'POST',
          body: JSON.stringify({
            name: formData.name,
            countryCode: formData.countryCode,
            geographyNodeId: formData.geographyNodeId ? formData.geographyNodeId : null,
            flatAmount: formData.flatAmount,
            currency: formData.currency,
            priority: formData.priority,
          }),
        });
        showNotification(`Delivery rule "${formData.name}" was created successfully.`);
      }
      await loadRules(true);
    } finally {
      setBusy(false);
    }
  }

  // Handle Toggle Status (Activate / Deactivate)
  async function handleToggleStatus(rule: DeliveryPricingRule) {
    const nextStatus = rule.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    const confirmMessage =
      nextStatus === 'INACTIVE'
        ? `Deactivate rule "${rule.name}"? Existing order quotes will remain unchanged.`
        : `Activate rule "${rule.name}"? This rule will immediately take effect for matching customer addresses.`;

    if (!window.confirm(confirmMessage)) return;

    setBusy(true);
    try {
      await fetchApiData(`/admin/orders/delivery-pricing-rules/${rule.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          version: rule.version,
          name: rule.name,
          countryCode: rule.country_code,
          geographyNodeId: rule.geography_node_id ?? undefined,
          flatAmount: rule.flat_amount,
          currency: rule.currency_code,
          priority: rule.priority,
          status: nextStatus,
        }),
      });
      showNotification(
        `Rule "${rule.name}" is now ${nextStatus === 'ACTIVE' ? 'active' : 'inactive'}.`,
      );
      await loadRules(true);
    } catch (err) {
      showNotification(
        err instanceof Error ? err.message : 'Could not change rule status.',
        'error',
      );
    } finally {
      setBusy(false);
    }
  }

  function handleOpenCreate() {
    setEditingRule(null);
    setDialogOpen(true);
  }

  function handleOpenEdit(rule: DeliveryPricingRule) {
    setEditingRule(rule);
    setDialogOpen(true);
  }

  function handleTestInSimulator(rule: DeliveryPricingRule) {
    setTargetSimulatorRule(rule);
    setShowSimulator(true);
    // Scroll smoothly to simulator
    window.scrollTo({ top: 120, behavior: 'smooth' });
  }

  // Tab counts
  const tabCounts = React.useMemo(() => {
    let active = 0;
    let inactive = 0;
    for (const r of rules) {
      if (r.status === 'ACTIVE') active++;
      else inactive++;
    }
    return {
      ALL: rules.length,
      ACTIVE: active,
      INACTIVE: inactive,
    };
  }, [rules]);

  // Filtered & Sorted Rules
  const filteredRules = React.useMemo(() => {
    let list = [...rules];

    // Status Tab Filter
    if (activeTab === 'ACTIVE') {
      list = list.filter((r) => r.status === 'ACTIVE');
    } else if (activeTab === 'INACTIVE') {
      list = list.filter((r) => r.status === 'INACTIVE');
    }

    // Geographic Scope Filter
    if (scopeFilter === 'NATIONWIDE') {
      list = list.filter((r) => !r.geography_node_id);
    } else if (scopeFilter === 'GEOGRAPHIC') {
      list = list.filter((r) => Boolean(r.geography_node_id));
    }

    // Search Query Filter
    if (query.trim()) {
      const q = query.toLowerCase().trim();
      list = list.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          r.country_code.toLowerCase().includes(q) ||
          (r.geography_node_name && r.geography_node_name.toLowerCase().includes(q)) ||
          (r.geography_parent_name && r.geography_parent_name.toLowerCase().includes(q)) ||
          (r.geography_node_type && r.geography_node_type.toLowerCase().includes(q)) ||
          r.flat_amount.includes(q),
      );
    }

    // Sort
    list.sort((a, b) => {
      switch (sortOption) {
        case 'PRIORITY_DESC':
          return b.priority - a.priority || a.name.localeCompare(b.name);
        case 'AMOUNT_ASC':
          return parseFloat(a.flat_amount) - parseFloat(b.flat_amount);
        case 'AMOUNT_DESC':
          return parseFloat(b.flat_amount) - parseFloat(a.flat_amount);
        case 'NAME_ASC':
          return a.name.localeCompare(b.name);
        default:
          return b.priority - a.priority;
      }
    });

    return list;
  }, [rules, activeTab, scopeFilter, query, sortOption]);

  return (
    <AdminPage>
      {/* Page Header */}
      <PageHeader
        eyebrow="Commerce Operations"
        title="Delivery pricing"
        description="Checkout calculates delivery charges from these server-owned rules. New rules take effect on the next checkout calculation while placed orders preserve immutable rate snapshots."
        actions={
          <PageActions>
            <Button
              variant={showSimulator ? 'secondary' : 'outline'}
              size="sm"
              onClick={() => setShowSimulator((prev) => !prev)}
              className="gap-1.5"
            >
              <Calculator className="size-3.5" />
              <span>{showSimulator ? 'Hide simulator' : 'Test fee simulator'}</span>
            </Button>

            <RefreshButton
              onRefresh={() => loadRules(true)}
              loading={loading}
              tooltip="Refresh delivery rules"
            />

            <Button size="sm" onClick={handleOpenCreate} className="gap-1.5">
              <Plus className="size-4" />
              <span>New rule</span>
            </Button>
          </PageActions>
        }
      />

      {/* Notification Toast Banner */}
      <AnimatePresence>
        {notification && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
            className={`flex items-center justify-between rounded-xl border p-3.5 text-xs shadow-2xs ${
              notification.type === 'success'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/40 dark:text-emerald-200'
                : 'border-destructive/30 bg-destructive/10 text-destructive'
            }`}
          >
            <div className="flex items-center gap-2">
              {notification.type === 'success' ? (
                <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              ) : (
                <AlertCircle className="size-4 text-destructive shrink-0" />
              )}
              <span className="font-medium">{notification.text}</span>
            </div>
            <button
              type="button"
              onClick={() => setNotification(null)}
              className="p-1 rounded text-muted-foreground hover:text-foreground cursor-pointer"
              aria-label="Dismiss notification"
            >
              <X className="size-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error state */}
      {loadError && (
        <ErrorState
          title="Could not load delivery pricing"
          message={loadError}
          onRetry={() => void loadRules()}
        />
      )}

      {/* KPI Stats */}
      <DeliveryPricingStats rules={rules} />

      {/* Interactive Delivery Fee Simulator (Expandable) */}
      <AnimatePresence>
        {showSimulator && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <DeliveryPricingSimulator
              rules={rules}
              targetRule={targetSimulatorRule}
              onClearTarget={() => setTargetSimulatorRule(null)}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Rules Section: Toolbar + Table */}
      <PageSection>
        <DeliveryPricingToolbar
          query={query}
          onQueryChange={setQuery}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          scopeFilter={scopeFilter}
          onScopeFilterChange={setScopeFilter}
          sortOption={sortOption}
          onSortOptionChange={setSortOption}
          density={density}
          onDensityChange={setDensity}
          totalCount={rules.length}
          filteredCount={filteredRules.length}
          tabCounts={tabCounts}
        />

        {loading ? (
          <LoadingState message="Loading delivery pricing rules…" />
        ) : (
          <DeliveryPricingTable
            rules={filteredRules}
            density={density}
            busy={busy}
            onEdit={handleOpenEdit}
            onToggleStatus={handleToggleStatus}
            onTestInSimulator={handleTestInSimulator}
            onResetFilters={() => {
              setQuery('');
              setActiveTab('ALL');
              setScopeFilter('ALL');
              setSortOption('PRIORITY_DESC');
            }}
          />
        )}
      </PageSection>

      {/* Informational Guidance Card */}
      <DeliveryPricingInfoCard />

      {/* Create / Edit Modal Dialog */}
      <DeliveryPricingRuleDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        rule={editingRule}
        busy={busy}
        onSubmit={handleSubmitRule}
      />
    </AdminPage>
  );
}
