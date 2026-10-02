'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  CheckCircle2,
  Globe,
  History,
  Mail,
  Phone,
  RefreshCw,
  RotateCcw,
  Store,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SettingsCard, SettingsSection } from '@/components/settings/settings-card';
import { SettingField } from '@/components/settings/setting-field';
import { SettingsSaveBar } from '@/components/settings/settings-save-bar';
import { SettingsConfirmationDialog } from '@/components/settings/settings-confirmation-dialog';
import { SettingsAuditDrawer } from '@/components/settings/settings-audit-drawer';
import { SettingStatusBadge, RuntimeEffectBadge } from '@/components/settings/setting-status-badge';
import { SettingsNav } from '@/components/settings/settings-nav';
import { fetchApiData } from '@/lib/api';
import type { ModuleSettingsResponseDto, StorefrontSettingsDto } from '@maevelle/contracts';

interface StorefrontFormState {
  publicBaseUrl: string;
  storeName: string;
  supportEmail: string;
  supportPhone: string;
}

export function StorefrontSettingsConsole() {
  const [initialData, setInitialData] = useState<ModuleSettingsResponseDto<StorefrontSettingsDto>>();
  const [form, setForm] = useState<StorefrontFormState>({
    publicBaseUrl: 'http://localhost:8080',
    storeName: 'Maevelle Bangladesh',
    supportEmail: 'support@maevelle.com',
    supportPhone: '+8801700000000',
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [auditDrawerOpen, setAuditDrawerOpen] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setFeedback(null);
    try {
      const res = await fetchApiData<ModuleSettingsResponseDto<StorefrontSettingsDto>>(
        '/admin/settings/storefront',
      );
      if (res) {
        setInitialData(res);
        setForm({
          publicBaseUrl: res.settings.publicBaseUrl || 'http://localhost:8080',
          storeName: res.settings.storeName || 'Maevelle Bangladesh',
          supportEmail: res.settings.supportEmail || 'support@maevelle.com',
          supportPhone: res.settings.supportPhone || '+8801700000000',
        });
      }
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Could not load storefront settings.',
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
      (form.publicBaseUrl !== initialData.settings.publicBaseUrl ||
        form.storeName !== initialData.settings.storeName ||
        form.supportEmail !== initialData.settings.supportEmail ||
        form.supportPhone !== initialData.settings.supportPhone),
  );

  const handleDiscard = () => {
    if (!initialData) return;
    setForm({
      publicBaseUrl: initialData.settings.publicBaseUrl,
      storeName: initialData.settings.storeName,
      supportEmail: initialData.settings.supportEmail,
      supportPhone: initialData.settings.supportPhone,
    });
    setFeedback(null);
  };

  const handleSave = async () => {
    if (!initialData) return;
    setSaving(true);
    setFeedback(null);

    // Front-end URL validation
    try {
      const url = new URL(form.publicBaseUrl.trim());
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new Error();
      }
    } catch {
      setFeedback({ type: 'error', message: 'Public storefront URL must be a valid HTTP or HTTPS address.' });
      setSaving(false);
      return;
    }

    try {
      const updated = await fetchApiData<ModuleSettingsResponseDto<StorefrontSettingsDto>>(
        '/admin/settings/storefront',
        {
          method: 'PATCH',
          body: JSON.stringify({
            settings: {
              'storefront.publicBaseUrl': form.publicBaseUrl.trim(),
              'storefront.storeName': form.storeName.trim(),
              'storefront.supportEmail': form.supportEmail.trim().toLowerCase(),
              'storefront.supportPhone': form.supportPhone.trim(),
            },
            expectedVersion: initialData.version,
            reason: 'Administrative update to storefront settings',
          }),
        },
      );

      if (updated) {
        setInitialData(updated);
        setFeedback({
          type: 'success',
          message: 'Storefront settings saved. Public URLs and notification links updated.',
        });
      }
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to save storefront configuration.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmReset = async () => {
    setSaving(true);
    try {
      const resetRes = await fetchApiData<ModuleSettingsResponseDto<StorefrontSettingsDto>>(
        '/admin/settings/storefront/reset',
        {
          method: 'POST',
          body: JSON.stringify({ reason: 'Administrator reset storefront settings to defaults' }),
        },
      );
      if (resetRes) {
        setInitialData(resetRes);
        setForm({
          publicBaseUrl: resetRes.settings.publicBaseUrl,
          storeName: resetRes.settings.storeName,
          supportEmail: resetRes.settings.supportEmail,
          supportPhone: resetRes.settings.supportPhone,
        });
        setResetConfirmOpen(false);
        setFeedback({ type: 'success', message: 'Storefront settings restored to system defaults.' });
      }
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Could not reset storefront settings.',
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading && !initialData) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-2 text-muted-foreground text-xs">
        <RefreshCw className="size-5 animate-spin text-primary" />
        <span>Loading Storefront Settings...</span>
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
            <h1 className="text-xl font-semibold tracking-tight text-foreground">Storefront Settings</h1>
            <SettingStatusBadge status="ready" label="Configured" />
            <RuntimeEffectBadge runtimeMutable requiresRestart={false} />
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Customer-facing URLs, public brand identifiers, and customer helpline contact numbers.
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

      {/* Public URL & Cross-Module Effects */}
      <SettingsSection
        title="Public Origin & URLs"
        description="Publicly reachable web address of the customer storefront."
      >
        <SettingsCard title="Storefront Origin" icon={Globe}>
          <div className="space-y-4">
            <SettingField
              id="public-base-url-input"
              label="Public Storefront URL"
              description="Full origin URL used by customers to visit Maevelle."
              consequenceHint="Public URL customers use to access the Maevelle storefront. Used in email links, order links and customer-facing URLs."
              required
            >
              <Input
                id="public-base-url-input"
                type="url"
                value={form.publicBaseUrl}
                onChange={(e) => setForm((prev) => ({ ...prev, publicBaseUrl: e.target.value }))}
                placeholder="https://maevelle.com"
                className="text-xs h-9 font-mono max-w-lg"
              />
            </SettingField>

            <div className="p-3.5 rounded-lg bg-muted/40 border border-border/80 text-xs space-y-1.5">
              <span className="font-semibold text-foreground text-[11px] uppercase tracking-wider">
                Cross-Module Dependency Map:
              </span>
              <ul className="list-disc pl-4 space-y-1 text-muted-foreground text-[11px]">
                <li>
                  <strong className="text-foreground">Transactional Email:</strong> Renders order tracking buttons, invoice links, and password resets pointing to this domain.
                </li>
                <li>
                  <strong className="text-foreground">Payment Gateways:</strong> Used as the base return and cancellation redirect URL for online bKash / Nagad sessions.
                </li>
                <li>
                  <strong className="text-foreground">Internal Services:</strong> Internal backend APIs remain hidden behind deployment networking and are never derived from this URL.
                </li>
              </ul>
            </div>
          </div>
        </SettingsCard>
      </SettingsSection>

      {/* Brand & Customer Support */}
      <SettingsSection
        title="Branding & Contact Info"
        description="Public brand title and customer support channels."
      >
        <SettingsCard title="Public Helpline" icon={Store}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <SettingField
              id="store-name-input"
              label="Public Store Name"
              description="Brand title presented on customer receipts and page titles."
              required
            >
              <Input
                id="store-name-input"
                value={form.storeName}
                onChange={(e) => setForm((prev) => ({ ...prev, storeName: e.target.value }))}
                placeholder="Maevelle Bangladesh"
                className="text-xs h-9"
              />
            </SettingField>

            <SettingField
              id="support-email-input"
              label="Customer Support Email"
              description="Public contact email displayed in storefront footer and policy pages."
              required
            >
              <Input
                id="support-email-input"
                type="email"
                value={form.supportEmail}
                onChange={(e) => setForm((prev) => ({ ...prev, supportEmail: e.target.value }))}
                placeholder="support@maevelle.com"
                className="text-xs h-9 font-mono"
              />
            </SettingField>

            <SettingField
              id="support-phone-input"
              label="Customer Helpline Phone"
              description="Public customer hotline phone number."
              required
            >
              <Input
                id="support-phone-input"
                type="tel"
                value={form.supportPhone}
                onChange={(e) => setForm((prev) => ({ ...prev, supportPhone: e.target.value }))}
                placeholder="+8801700000000"
                className="text-xs h-9 font-mono"
              />
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
        title="Reset Storefront Settings to Defaults?"
        description="This will restore the public URL and support contact information to initial system values."
        confirmLabel="Reset to defaults"
        variant="destructive"
        loading={saving}
        onConfirm={handleConfirmReset}
      />

      {/* Audit Drawer */}
      <SettingsAuditDrawer
        open={auditDrawerOpen}
        onOpenChange={setAuditDrawerOpen}
        module="storefront"
        title="Storefront Settings History"
      />
    </div>
  );
}
