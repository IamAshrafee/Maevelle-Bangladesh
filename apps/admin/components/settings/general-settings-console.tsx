'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  Clock,
  Coins,
  History,
  Lock,
  Package,
  RefreshCw,
  RotateCcw,
  Shield,
  SlidersHorizontal,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SettingsCard, SettingsSection } from '@/components/settings/settings-card';
import { SettingField } from '@/components/settings/setting-field';
import { SettingsSaveBar } from '@/components/settings/settings-save-bar';
import { SettingsConfirmationDialog } from '@/components/settings/settings-confirmation-dialog';
import { SettingsAuditDrawer } from '@/components/settings/settings-audit-drawer';
import { SettingStatusBadge, RuntimeEffectBadge } from '@/components/settings/setting-status-badge';
import { SettingsNav } from '@/components/settings/settings-nav';
import { fetchApiData } from '@/lib/api';
import type { GeneralSettingsDto, ModuleSettingsResponseDto } from '@maevelle/contracts';

export function GeneralSettingsConsole() {
  const [initialData, setInitialData] = useState<ModuleSettingsResponseDto<GeneralSettingsDto>>();
  const [storeName, setStoreName] = useState('Maevelle Bangladesh');
  const [supportEmail, setSupportEmail] = useState('support@maevelle.com');
  const [timezone, setTimezone] = useState('Asia/Dhaka');
  const [defaultCurrency, setDefaultCurrency] = useState('BDT');
  const [lowStockThreshold, setLowStockThreshold] = useState(5);
  const [sessionTimeoutMinutes, setSessionTimeoutMinutes] = useState(1440);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [auditDrawerOpen, setAuditDrawerOpen] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setFeedback(null);
    try {
      const res = await fetchApiData<ModuleSettingsResponseDto<GeneralSettingsDto>>(
        '/admin/settings/general',
      );
      if (res) {
        setInitialData(res);
        setStoreName(res.settings.storeName || 'Maevelle Bangladesh');
        setSupportEmail(res.settings.supportEmail || 'support@maevelle.com');
        setTimezone(res.settings.timezone || 'Asia/Dhaka');
        setDefaultCurrency(res.settings.defaultCurrency || 'BDT');
        setLowStockThreshold(Number(res.settings.lowStockThreshold) || 5);
        setSessionTimeoutMinutes(Number(res.settings.sessionTimeoutMinutes) || 1440);
      }
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Could not load general settings.',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const isDirty = Boolean(
    initialData &&
      (storeName !== initialData.settings.storeName ||
        supportEmail !== initialData.settings.supportEmail ||
        timezone !== initialData.settings.timezone ||
        lowStockThreshold !== initialData.settings.lowStockThreshold ||
        sessionTimeoutMinutes !== initialData.settings.sessionTimeoutMinutes),
  );

  const handleDiscard = () => {
    if (!initialData) return;
    setStoreName(initialData.settings.storeName);
    setSupportEmail(initialData.settings.supportEmail);
    setTimezone(initialData.settings.timezone);
    setDefaultCurrency(initialData.settings.defaultCurrency);
    setLowStockThreshold(initialData.settings.lowStockThreshold);
    setSessionTimeoutMinutes(initialData.settings.sessionTimeoutMinutes);
    setFeedback(null);
  };

  const handleSave = async () => {
    if (!initialData) return;
    setSaving(true);
    setFeedback(null);

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(supportEmail)) {
      setFeedback({ type: 'error', message: 'Support email is not formatted correctly.' });
      setSaving(false);
      return;
    }

    try {
      const updated = await fetchApiData<ModuleSettingsResponseDto<GeneralSettingsDto>>(
        '/admin/settings/general',
        {
          method: 'PATCH',
          body: JSON.stringify({
            settings: {
              'general.storeName': storeName.trim(),
              'general.supportEmail': supportEmail.trim().toLowerCase(),
              'general.timezone': timezone.trim(),
              'general.lowStockThreshold': Number(lowStockThreshold),
              'general.sessionTimeoutMinutes': Number(sessionTimeoutMinutes),
            },
            expectedVersion: initialData.version,
            reason: 'Administrative update to general settings',
          }),
        },
      );

      if (updated) {
        setInitialData(updated);
        setFeedback({
          type: 'success',
          message: 'General settings saved successfully.',
        });
      }
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to save general configuration.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmReset = async () => {
    setSaving(true);
    try {
      const resetRes = await fetchApiData<ModuleSettingsResponseDto<GeneralSettingsDto>>(
        '/admin/settings/general/reset',
        {
          method: 'POST',
          body: JSON.stringify({ reason: 'Administrator reset general settings to defaults' }),
        },
      );
      if (resetRes) {
        setInitialData(resetRes);
        setStoreName(resetRes.settings.storeName);
        setSupportEmail(resetRes.settings.supportEmail);
        setTimezone(resetRes.settings.timezone);
        setLowStockThreshold(resetRes.settings.lowStockThreshold);
        setSessionTimeoutMinutes(resetRes.settings.sessionTimeoutMinutes);
        setResetConfirmOpen(false);
        setFeedback({ type: 'success', message: 'General settings restored to system defaults.' });
      }
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Could not reset general settings.',
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading && !initialData) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-2 text-muted-foreground text-xs">
        <RefreshCw className="size-5 animate-spin text-primary" />
        <span>Loading General Settings...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-20 max-w-4xl">
      <SettingsNav />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-xl font-semibold tracking-tight text-foreground">General Settings</h1>
            <SettingStatusBadge status="ready" label="Configured" />
            <RuntimeEffectBadge runtimeMutable requiresRestart={false} />
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Global application profile, primary timezone, inventory alert defaults, and operator session security.
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

      {/* Business Identity Section */}
      <SettingsSection
        title="Business Identity & Localization"
        description="Core operational entity parameters and canonical business timezone."
      >
        <SettingsCard title="Business Identity" icon={Building2}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <SettingField
              id="org-name-input"
              label="Organization Name"
              description="Primary legal and operational organization title."
              required
            >
              <Input
                id="org-name-input"
                value={storeName}
                onChange={(e) => setStoreName(e.target.value)}
                placeholder="Maevelle Bangladesh"
                className="text-xs h-9"
              />
            </SettingField>

            <SettingField
              id="org-support-email-input"
              label="Support Email"
              description="Primary operations contact mailbox."
              required
            >
              <Input
                id="org-support-email-input"
                type="email"
                value={supportEmail}
                onChange={(e) => setSupportEmail(e.target.value)}
                placeholder="support@maevelle.com"
                className="text-xs h-9 font-mono"
              />
            </SettingField>

            <SettingField
              id="timezone-select"
              label="Business Timezone"
              description="Canonical timezone used for day boundaries, scheduling, and analytics reports."
              required
            >
              <Select value={timezone} onValueChange={(val) => { if (val) setTimezone(val); }}>
                <SelectTrigger id="timezone-select" className="text-xs h-9">
                  <SelectValue placeholder="Select timezone" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Asia/Dhaka" className="text-xs">
                    Asia/Dhaka (UTC+6 - Bangladesh Standard Time)
                  </SelectItem>
                  <SelectItem value="UTC" className="text-xs">
                    UTC (Coordinated Universal Time)
                  </SelectItem>
                  <SelectItem value="Asia/Kolkata" className="text-xs">
                    Asia/Kolkata (UTC+5:30)
                  </SelectItem>
                  <SelectItem value="Europe/London" className="text-xs">
                    Europe/London (GMT/BST)
                  </SelectItem>
                </SelectContent>
              </Select>
            </SettingField>

            <SettingField
              id="currency-input"
              label="Operational Currency"
              description="Authoritative accounting and pricing currency code."
              consequenceHint="Base currency cannot be altered at runtime because ledger transactions, valuation entries, and inventory balances are denominated in this unit."
            >
              <div className="flex items-center gap-2">
                <Input
                  id="currency-input"
                  value={defaultCurrency}
                  disabled
                  className="text-xs h-9 font-mono max-w-[100px] bg-muted/50"
                />
                <span className="text-xs text-muted-foreground font-medium">Bangladeshi Taka</span>
                <span className="text-[10px] font-medium text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded border border-amber-200 dark:border-amber-800">
                  Fixed Base Currency
                </span>
              </div>
            </SettingField>
          </div>
        </SettingsCard>
      </SettingsSection>

      {/* Operational Thresholds Section */}
      <SettingsSection
        title="Operational Defaults"
        description="Cross-module thresholds for inventory alerts and operator session lifetime."
      >
        <SettingsCard title="System Thresholds" icon={SlidersHorizontal}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <SettingField
              id="low-stock-input"
              label="Low Stock Warning Threshold"
              description="Available quantity at or below which inventory variants trigger low stock warnings."
              consequenceHint="Affects stock indicator badges across Catalog, Orders, and Inventory workspaces."
              required
            >
              <div className="flex items-center gap-2">
                <Input
                  id="low-stock-input"
                  type="number"
                  min={0}
                  max={500}
                  value={lowStockThreshold}
                  onChange={(e) => setLowStockThreshold(Number(e.target.value))}
                  className="text-xs h-9 max-w-[120px]"
                />
                <span className="text-xs font-semibold text-muted-foreground">Units</span>
              </div>
            </SettingField>

            <SettingField
              id="session-timeout-input"
              label="Admin Session Inactivity Timeout"
              description="Inactivity duration before operator sessions require re-authentication."
              consequenceHint="Applies across all administrative operators in the current organization."
              required
            >
              <div className="flex items-center gap-2">
                <Input
                  id="session-timeout-input"
                  type="number"
                  min={15}
                  max={43200}
                  value={sessionTimeoutMinutes}
                  onChange={(e) => setSessionTimeoutMinutes(Number(e.target.value))}
                  className="text-xs h-9 max-w-[120px]"
                />
                <span className="text-xs font-semibold text-muted-foreground">Minutes</span>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">
                Equivalent: {(sessionTimeoutMinutes / 60).toFixed(1)} hours
              </p>
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
        title="Reset General Settings to Defaults?"
        description="This will restore the business timezone, support contact, and operational thresholds to system defaults."
        confirmLabel="Reset to defaults"
        variant="destructive"
        loading={saving}
        onConfirm={handleConfirmReset}
      />

      {/* Audit Drawer */}
      <SettingsAuditDrawer
        open={auditDrawerOpen}
        onOpenChange={setAuditDrawerOpen}
        module="general"
        title="General Settings History"
      />
    </div>
  );
}
