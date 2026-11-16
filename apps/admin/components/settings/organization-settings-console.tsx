'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  Building2,
  CheckCircle2,
  History,
  RefreshCw,
  RotateCcw,
  Store,
} from 'lucide-react';
import { AdminPage, PageHeader } from '@/components/ui/page-shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Stats, StatsCard, StatsTitle, StatsValue, StatsDescription } from '@/components/ui/stats';
import { SettingsCard, SettingsSection } from '@/components/settings/settings-card';
import { SettingField } from '@/components/settings/setting-field';
import { SettingsSaveBar } from '@/components/settings/settings-save-bar';
import { SettingsConfirmationDialog } from '@/components/settings/settings-confirmation-dialog';
import { SettingsAuditDrawer } from '@/components/settings/settings-audit-drawer';
import { SettingStatusBadge, RuntimeEffectBadge } from '@/components/settings/setting-status-badge';
import { SettingsNav } from '@/components/settings/settings-nav';
import { fetchApiData } from '@/lib/api';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard';

export interface OrganizationProfileDto {
  readonly organization_id: string;
  readonly display_name: string;
  readonly timezone: string;
  readonly default_locale: string;
  readonly default_currency: string;
  readonly schema_version: number | null;
  readonly business_profile: {
    readonly businessName?: string;
    readonly lowStockThreshold?: number;
    readonly supportEmail?: string;
    readonly supportPhone?: string;
  } | null;
  readonly storefront_profile: {
    readonly publicStoreName?: string;
    readonly announcement?: string;
  } | null;
  readonly updated_at: string | null;
}

interface OrganizationFormState {
  businessName: string;
  supportEmail: string;
  supportPhone: string;
  lowStockThreshold: number;
  publicStoreName: string;
  announcement: string;
}

export function OrganizationSettingsConsole() {
  const [initialData, setInitialData] = useState<OrganizationProfileDto>();
  const [form, setForm] = useState<OrganizationFormState>({
    businessName: '',
    supportEmail: '',
    supportPhone: '',
    lowStockThreshold: 5,
    publicStoreName: '',
    announcement: '',
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null,
  );

  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [auditDrawerOpen, setAuditDrawerOpen] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setFeedback(null);
    try {
      const res = await fetchApiData<OrganizationProfileDto>('/admin/settings/organization');
      if (res) {
        setInitialData(res);
        setForm({
          businessName: String(res.business_profile?.businessName ?? res.display_name ?? ''),
          supportEmail: String(res.business_profile?.supportEmail ?? ''),
          supportPhone: String(res.business_profile?.supportPhone ?? ''),
          lowStockThreshold: Number(res.business_profile?.lowStockThreshold ?? 5),
          publicStoreName: String(
            res.storefront_profile?.publicStoreName ?? res.display_name ?? '',
          ),
          announcement: String(res.storefront_profile?.announcement ?? ''),
        });
      }
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Could not load organization settings.',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const initialBusinessName = String(
    initialData?.business_profile?.businessName ?? initialData?.display_name ?? '',
  );
  const initialSupportEmail = String(initialData?.business_profile?.supportEmail ?? '');
  const initialSupportPhone = String(initialData?.business_profile?.supportPhone ?? '');
  const initialLowStock = Number(initialData?.business_profile?.lowStockThreshold ?? 5);
  const initialPublicStoreName = String(
    initialData?.storefront_profile?.publicStoreName ?? initialData?.display_name ?? '',
  );
  const initialAnnouncement = String(initialData?.storefront_profile?.announcement ?? '');

  const isDirty = Boolean(
    initialData &&
    (form.businessName !== initialBusinessName ||
      form.supportEmail !== initialSupportEmail ||
      form.supportPhone !== initialSupportPhone ||
      form.lowStockThreshold !== initialLowStock ||
      form.publicStoreName !== initialPublicStoreName ||
      form.announcement !== initialAnnouncement),
  );

  const { guardDialog } = useUnsavedChangesGuard({
    when: isDirty && !saving,
    message: 'You have unsaved organization settings. Leave without saving?',
  });

  const handleDiscard = () => {
    if (!initialData) return;
    setForm({
      businessName: initialBusinessName,
      supportEmail: initialSupportEmail,
      supportPhone: initialSupportPhone,
      lowStockThreshold: initialLowStock,
      publicStoreName: initialPublicStoreName,
      announcement: initialAnnouncement,
    });
    setFeedback(null);
  };

  const handleSave = async () => {
    if (!initialData) return;
    setSaving(true);
    setFeedback(null);

    if (!form.businessName.trim()) {
      setFeedback({ type: 'error', message: 'Legal business name cannot be empty.' });
      setSaving(false);
      return;
    }

    if (!form.publicStoreName.trim()) {
      setFeedback({ type: 'error', message: 'Public store name cannot be empty.' });
      setSaving(false);
      return;
    }

    if (form.supportEmail.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(form.supportEmail.trim())) {
        setFeedback({ type: 'error', message: 'Support email is not formatted correctly.' });
        setSaving(false);
        return;
      }
    }

    try {
      await fetchApiData('/admin/settings/organization', {
        method: 'PUT',
        body: JSON.stringify({
          businessProfile: {
            businessName: form.businessName.trim(),
            lowStockThreshold: Number(form.lowStockThreshold) || 0,
            supportEmail: form.supportEmail.trim(),
            supportPhone: form.supportPhone.trim(),
          },
          storefrontProfile: {
            publicStoreName: form.publicStoreName.trim(),
            announcement: form.announcement.trim(),
          },
        }),
      });

      await loadData();
      setFeedback({
        type: 'success',
        message: 'Organization profile updated. Commercial records and audit history recorded.',
      });
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Could not save organization settings.',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminPage variant="narrow" className="pb-20">
      {guardDialog}
      <SettingsNav />

      <PageHeader
        eyebrow="Platform Settings"
        title="Organization Settings"
        badge={
          <>
            <SettingStatusBadge status="ready" label="Identity Configured" />
            <RuntimeEffectBadge runtimeMutable requiresRestart={false} />
          </>
        }
        description="Legal business identity, customer-facing storefront presentation, and tenant operational defaults."
        actions={
          <>
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
              disabled={!isDirty}
              className="text-xs h-8 text-muted-foreground hover:text-foreground"
            >
              <RotateCcw className="size-3.5 mr-1" />
              Reset changes
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void loadData()}
              disabled={loading}
              className="text-xs h-8 gap-1.5"
            >
              <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </>
        }
      />

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

      {/* Tenant Identity Stats Card */}
      <Stats className="grid-cols-2 md:grid-cols-4">
        <StatsCard>
          <StatsTitle>Organization</StatsTitle>
          <StatsValue className="truncate text-base sm:text-lg">
            {initialData?.display_name ?? '—'}
          </StatsValue>
          <StatsDescription>Tenant identity</StatsDescription>
        </StatsCard>
        <StatsCard>
          <StatsTitle>Timezone</StatsTitle>
          <StatsValue className="font-mono text-base sm:text-lg">
            {initialData?.timezone ?? '—'}
          </StatsValue>
          <StatsDescription>Operational display</StatsDescription>
        </StatsCard>
        <StatsCard>
          <StatsTitle>Locale</StatsTitle>
          <StatsValue className="font-mono text-base sm:text-lg">
            {initialData?.default_locale ?? '—'}
          </StatsValue>
          <StatsDescription>Default language</StatsDescription>
        </StatsCard>
        <StatsCard>
          <StatsTitle>Currency</StatsTitle>
          <StatsValue className="font-mono text-base sm:text-lg">
            {initialData?.default_currency ?? '—'}
          </StatsValue>
          <StatsDescription>Commercial default</StatsDescription>
        </StatsCard>
      </Stats>

      {/* Business Identity Section */}
      <SettingsSection
        title="Business Profile"
        description="Operator-facing identity and official company contacts used in records and notices."
      >
        <SettingsCard
          icon={Building2}
          title="Company Details & Operations"
          description="Legal business name and contact information."
        >
          <div className="space-y-4">
            <SettingField
              id="businessName"
              label="Legal Business Name"
              description="Official registered business entity name."
              consequenceHint="Appears on purchase orders, invoices, and operational reports."
            >
              <Input
                id="businessName"
                value={form.businessName}
                onChange={(e) => setForm({ ...form, businessName: e.target.value })}
                placeholder="Maevelle Bangladesh Limited"
                maxLength={160}
                required
                disabled={loading || saving}
              />
            </SettingField>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <SettingField
                id="supportEmail"
                label="Support Email"
                description="Primary administrative support inbox."
                consequenceHint="Receives operational alerts and administrative notifications."
              >
                <Input
                  id="supportEmail"
                  type="email"
                  value={form.supportEmail}
                  onChange={(e) => setForm({ ...form, supportEmail: e.target.value })}
                  placeholder="support@maevelle.com"
                  autoComplete="email"
                  disabled={loading || saving}
                />
              </SettingField>

              <SettingField
                id="supportPhone"
                label="Support Phone"
                description="Official company phone contact."
                consequenceHint="Used by couriers and partners for operational contact."
              >
                <Input
                  id="supportPhone"
                  type="tel"
                  value={form.supportPhone}
                  onChange={(e) => setForm({ ...form, supportPhone: e.target.value })}
                  placeholder="+880 1700-000000"
                  autoComplete="tel"
                  disabled={loading || saving}
                />
              </SettingField>
            </div>

            <SettingField
              id="lowStockThreshold"
              label="Low-Stock Attention Threshold"
              description="Global inventory threshold triggering attention flags."
              consequenceHint="Variants with available stock at or below this count show warnings in inventory."
            >
              <Input
                id="lowStockThreshold"
                type="number"
                min={0}
                max={100000}
                value={form.lowStockThreshold}
                onChange={(e) =>
                  setForm({
                    ...form,
                    lowStockThreshold: Math.max(0, parseInt(e.target.value) || 0),
                  })
                }
                disabled={loading || saving}
                className="font-mono tabular-nums max-w-[200px]"
              />
            </SettingField>

            <p className="text-xs text-muted-foreground border-t border-border/50 pt-3">
              Organization timezone, locale, and currency are foundational tenant identity
              parameters established during initial provisioning and remain read-only.
            </p>
          </div>
        </SettingsCard>
      </SettingsSection>

      {/* Storefront Presentation Section */}
      <SettingsSection
        title="Storefront Profile"
        description="Public storefront presentation values visible to customers across the shopping experience."
      >
        <SettingsCard
          icon={Store}
          title="Customer-Facing Store Identity"
          description="Public brand name and sitewide announcement."
        >
          <div className="space-y-4">
            <SettingField
              id="publicStoreName"
              label="Public Store Name"
              description="Display brand name shown on the storefront header, page title, and receipts."
              consequenceHint="Overrides fallback title on customer-facing pages."
            >
              <Input
                id="publicStoreName"
                value={form.publicStoreName}
                onChange={(e) => setForm({ ...form, publicStoreName: e.target.value })}
                placeholder="Maevelle Bangladesh"
                maxLength={160}
                required
                disabled={loading || saving}
              />
            </SettingField>

            <SettingField
              id="announcement"
              label="Storefront Announcement"
              description="Optional sitewide announcement or alert banner."
              consequenceHint="Displayed at the top of supported storefront layouts."
            >
              <Textarea
                id="announcement"
                value={form.announcement}
                onChange={(e) => setForm({ ...form, announcement: e.target.value })}
                placeholder="e.g. Free express delivery across Dhaka for orders over ৳3,000"
                rows={3}
                maxLength={500}
                disabled={loading || saving}
              />
            </SettingField>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between text-xs text-muted-foreground border-t border-border/50 pt-3 gap-2">
              <span>
                Schema version {initialData?.schema_version ?? 1}
                {initialData?.updated_at
                  ? ` · Last updated ${new Date(initialData.updated_at).toLocaleString()}`
                  : ''}
              </span>
              <span className="text-muted-foreground/80">
                Saving updates business and storefront profiles without altering unrelated module
                keys.
              </span>
            </div>
          </div>
        </SettingsCard>
      </SettingsSection>

      <SettingsSaveBar
        dirty={isDirty}
        saving={saving}
        onSave={handleSave}
        onDiscard={handleDiscard}
        message="You have unsaved organization settings."
      />

      <SettingsConfirmationDialog
        open={resetConfirmOpen}
        onOpenChange={setResetConfirmOpen}
        title="Discard Unsaved Changes?"
        description="Are you sure you want to revert all changes back to their saved values?"
        confirmLabel="Discard changes"
        onConfirm={handleDiscard}
      />

      <SettingsAuditDrawer
        open={auditDrawerOpen}
        onOpenChange={setAuditDrawerOpen}
        module="organization"
      />
    </AdminPage>
  );
}
