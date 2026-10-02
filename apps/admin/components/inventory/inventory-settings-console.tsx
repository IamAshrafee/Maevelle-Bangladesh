'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  Boxes,
  CheckCircle2,
  History,
  Package,
  RefreshCw,
  RotateCcw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SettingsCard, SettingsSection } from '@/components/settings/settings-card';
import { SettingField } from '@/components/settings/setting-field';
import { SettingsSaveBar } from '@/components/settings/settings-save-bar';
import { SettingsConfirmationDialog } from '@/components/settings/settings-confirmation-dialog';
import { SettingsAuditDrawer } from '@/components/settings/settings-audit-drawer';
import { SettingStatusBadge, RuntimeEffectBadge } from '@/components/settings/setting-status-badge';
import { fetchApiData } from '@/lib/api';
import type { ModuleSettingsResponseDto } from '@maevelle/contracts';

interface InventorySettingsDto {
  readonly lowStockThreshold: number;
}

export function InventorySettingsConsole() {
  const [initialData, setInitialData] = useState<ModuleSettingsResponseDto<InventorySettingsDto>>();
  const [threshold, setThreshold] = useState<number>(5);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [auditDrawerOpen, setAuditDrawerOpen] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setFeedback(null);
    try {
      const res = await fetchApiData<ModuleSettingsResponseDto<InventorySettingsDto>>(
        '/admin/settings/inventory',
      );
      if (res) {
        setInitialData(res);
        setThreshold(Number(res.settings.lowStockThreshold) || 5);
      }
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Could not load inventory settings.',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const isDirty = Boolean(initialData && threshold !== initialData.settings.lowStockThreshold);

  const handleDiscard = () => {
    if (!initialData) return;
    setThreshold(initialData.settings.lowStockThreshold);
    setFeedback(null);
  };

  const handleSave = async () => {
    if (!initialData) return;
    setSaving(true);
    setFeedback(null);

    if (threshold < 0 || threshold > 1000) {
      setFeedback({ type: 'error', message: 'Low stock threshold must be between 0 and 1000 units.' });
      setSaving(false);
      return;
    }

    try {
      const updated = await fetchApiData<ModuleSettingsResponseDto<InventorySettingsDto>>(
        '/admin/settings/inventory',
        {
          method: 'PATCH',
          body: JSON.stringify({
            settings: {
              'inventory.lowStockThreshold': Number(threshold),
            },
            expectedVersion: initialData.version,
            reason: `Updated inventory low stock alert threshold to ${threshold} units`,
          }),
        },
      );

      if (updated) {
        setInitialData(updated);
        setFeedback({
          type: 'success',
          message: 'Inventory settings saved. Stock alarms updated across catalog and warehouses.',
        });
      }
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to save inventory configuration.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmReset = async () => {
    setSaving(true);
    try {
      const resetRes = await fetchApiData<ModuleSettingsResponseDto<InventorySettingsDto>>(
        '/admin/settings/inventory/reset',
        {
          method: 'POST',
          body: JSON.stringify({ reason: 'Administrator reset inventory settings to defaults' }),
        },
      );
      if (resetRes) {
        setInitialData(resetRes);
        setThreshold(resetRes.settings.lowStockThreshold);
        setResetConfirmOpen(false);
        setFeedback({ type: 'success', message: 'Inventory settings restored to defaults (5 units).' });
      }
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Could not reset inventory settings.',
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading && !initialData) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-2 text-muted-foreground text-xs">
        <RefreshCw className="size-5 animate-spin text-primary" />
        <span>Loading Inventory Settings...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-20 max-w-4xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b">
        <div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <Link href="/inventory" className="hover:text-foreground flex items-center gap-1">
              <Boxes className="size-3.5" />
              Inventory
            </Link>
            <span>/</span>
            <span className="text-foreground font-medium">Settings</span>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-xl font-semibold tracking-tight text-foreground">Inventory Settings</h1>
            <SettingStatusBadge status="ready" label="Configured" />
            <RuntimeEffectBadge runtimeMutable requiresRestart={false} />
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Operational thresholds for inventory reorder alerts, low stock indicators, and variant allocation rules.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setAuditDrawerOpen(true)}
            className="text-xs h-8 gap-1.5"
          >
            <History className="size-3.5 text-muted-foreground" />
            History
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setResetConfirmOpen(true)}
            className="text-xs h-8 text-muted-foreground hover:text-foreground"
          >
            <RotateCcw className="size-3.5 mr-1" />
            Reset to default
          </Button>
        </div>
      </div>

      {feedback && (
        <div
          className={`p-3.5 rounded-lg text-xs flex items-center justify-between border ${
            feedback.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300 border-emerald-500/20'
              : 'bg-destructive/10 text-destructive border-destructive/20'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="size-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="size-4 shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setFeedback(null)}
            className="size-6 p-0 hover:bg-transparent"
          >
            ×
          </Button>
        </div>
      )}

      {/* Stock Alert Rules */}
      <SettingsSection
        title="Stock Level Triggers"
        description="Thresholds controlling operational low-stock notifications and warning badges."
      >
        <SettingsCard title="Alert Threshold" icon={Package}>
          <div className="space-y-4">
            <SettingField
              id="low-stock-threshold-input"
              label="Low Stock Warning Threshold"
              description="Inventory count at or below which variants trigger operational low-stock alarms."
              consequenceHint="When a variant's sellable stock reaches this count, warning badges appear in Stock, Orders, and Procurement consoles."
              required
            >
              <div className="flex items-center gap-2">
                <Input
                  id="low-stock-threshold-input"
                  type="number"
                  min={0}
                  max={1000}
                  value={threshold}
                  onChange={(e) => setThreshold(Number(e.target.value))}
                  className="text-xs h-9 max-w-[120px]"
                />
                <span className="text-xs font-semibold text-muted-foreground">Units</span>
              </div>
            </SettingField>
          </div>
        </SettingsCard>
      </SettingsSection>

      {/* Sticky Save Bar */}
      <SettingsSaveBar
        dirty={isDirty}
        saving={saving}
        onSave={handleSave}
        onDiscard={handleDiscard}
      />

      {/* Reset Confirmation */}
      <SettingsConfirmationDialog
        open={resetConfirmOpen}
        onOpenChange={setResetConfirmOpen}
        title="Reset Inventory Settings to Defaults?"
        description="This will restore the low-stock alarm threshold to 5 units."
        confirmLabel="Reset to defaults"
        variant="destructive"
        loading={saving}
        onConfirm={handleConfirmReset}
      />

      {/* Audit Drawer */}
      <SettingsAuditDrawer
        open={auditDrawerOpen}
        onOpenChange={setAuditDrawerOpen}
        module="inventory"
        title="Inventory Settings History"
      />
    </div>
  );
}
