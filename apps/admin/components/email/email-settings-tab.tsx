'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  ExternalLink,
  History,
  KeyRound,
  Mail,
  Plus,
  RefreshCw,
  RotateCcw,
  Send,
  Server,
  Shield,
  Trash2,
  X,
  Zap,
} from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { SettingsCard, SettingsSection } from '@/components/settings/settings-card';
import { SettingField, SettingToggle } from '@/components/settings/setting-field';
import { SettingsSaveBar } from '@/components/settings/settings-save-bar';
import { SettingsConfirmationDialog } from '@/components/settings/settings-confirmation-dialog';
import { SettingsAuditDrawer } from '@/components/settings/settings-audit-drawer';
import { SettingStatusBadge, RuntimeEffectBadge } from '@/components/settings/setting-status-badge';
import { apiRequest, fetchApiData } from '@/lib/api';
import type {
  EmailReadinessDto,
  EmailSettingsDto,
  IntegrationSummaryDto,
  ModuleSettingsResponseDto,
} from '@maevelle/contracts';

interface EmailSettingsState {
  enabled: boolean;
  provider: 'local' | 'resend';
  fromName: string;
  fromAddress: string;
  replyTo: string;
  testRecipientOverride: string;
  allowedTestRecipients: string[];
}

export function EmailSettingsTab() {
  const [initialData, setInitialData] = useState<ModuleSettingsResponseDto<EmailSettingsDto>>();
  const [form, setForm] = useState<EmailSettingsState>({
    enabled: false,
    provider: 'local',
    fromName: 'Maevelle',
    fromAddress: 'orders@example.invalid',
    replyTo: 'maevelleBangladesh@gmail.com',
    testRecipientOverride: '',
    allowedTestRecipients: [],
  });

  const [resendIntegration, setResendIntegration] = useState<IntegrationSummaryDto>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // New recipient input state for allow list
  const [newRecipientInput, setNewRecipientInput] = useState('');

  // Confirmation dialogs
  const [disableConfirmOpen, setDisableConfirmOpen] = useState(false);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [auditDrawerOpen, setAuditDrawerOpen] = useState(false);

  // Test email modal state
  const [testModalOpen, setTestModalOpen] = useState(false);
  const [testRecipient, setTestRecipient] = useState('');
  const [testNotificationType, setTestNotificationType] = useState('ORDER_PLACED_CONFIRMATION');
  const [testSending, setTestSending] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [res, intRes] = await Promise.all([
        fetchApiData<ModuleSettingsResponseDto<EmailSettingsDto>>('/admin/settings/email'),
        fetchApiData<IntegrationSummaryDto>('/admin/settings/integrations/resend').catch(() => undefined),
      ]);

      if (res) {
        setInitialData(res);
        setForm({
          enabled: Boolean(res.settings.enabled),
          provider: (res.settings.provider as 'local' | 'resend') ?? 'local',
          fromName: res.settings.fromName ?? 'Maevelle',
          fromAddress: res.settings.fromAddress ?? 'orders@example.invalid',
          replyTo: res.settings.replyTo ?? 'maevelleBangladesh@gmail.com',
          testRecipientOverride: res.settings.testRecipientOverride ?? '',
          allowedTestRecipients: [...(res.settings.allowedTestRecipients ?? [])],
        });
      }
      if (intRes) {
        setResendIntegration(intRes);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load email configuration.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  // Compute dirty state
  const isDirty = Boolean(
    initialData &&
      (form.enabled !== initialData.settings.enabled ||
        form.provider !== initialData.settings.provider ||
        form.fromName !== initialData.settings.fromName ||
        form.fromAddress !== initialData.settings.fromAddress ||
        form.replyTo !== initialData.settings.replyTo ||
        form.testRecipientOverride !== (initialData.settings.testRecipientOverride ?? '') ||
        JSON.stringify(form.allowedTestRecipients) !==
          JSON.stringify(initialData.settings.allowedTestRecipients ?? [])),
  );

  const handleDiscard = () => {
    if (!initialData) return;
    setForm({
      enabled: Boolean(initialData.settings.enabled),
      provider: initialData.settings.provider,
      fromName: initialData.settings.fromName,
      fromAddress: initialData.settings.fromAddress,
      replyTo: initialData.settings.replyTo,
      testRecipientOverride: initialData.settings.testRecipientOverride ?? '',
      allowedTestRecipients: [...(initialData.settings.allowedTestRecipients ?? [])],
    });
    setFeedback(null);
  };

  const handleSave = async () => {
    if (!initialData) return;
    setSaving(true);
    setFeedback(null);

    // Front-end email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(form.fromAddress)) {
      setFeedback({ type: 'error', message: 'Sender email address is formatted incorrectly.' });
      setSaving(false);
      return;
    }
    if (!emailRegex.test(form.replyTo)) {
      setFeedback({ type: 'error', message: 'Reply-To email address is formatted incorrectly.' });
      setSaving(false);
      return;
    }

    try {
      const payload: Record<string, unknown> = {
        'email.enabled': form.enabled,
        'email.provider': form.provider,
        'email.fromName': form.fromName.trim(),
        'email.fromAddress': form.fromAddress.trim().toLowerCase(),
        'email.replyTo': form.replyTo.trim().toLowerCase(),
        'email.testRecipientOverride': form.testRecipientOverride.trim() || null,
        'email.allowedTestRecipients': form.allowedTestRecipients,
      };

      const updated = await fetchApiData<ModuleSettingsResponseDto<EmailSettingsDto>>(
        '/admin/settings/email',
        {
          method: 'PATCH',
          body: JSON.stringify({
            settings: payload,
            expectedVersion: initialData.version,
            reason: 'Administrative update to email module configuration',
          }),
        },
      );

      if (updated) {
        setInitialData(updated);
        setForm({
          enabled: Boolean(updated.settings.enabled),
          provider: updated.settings.provider,
          fromName: updated.settings.fromName,
          fromAddress: updated.settings.fromAddress,
          replyTo: updated.settings.replyTo,
          testRecipientOverride: updated.settings.testRecipientOverride ?? '',
          allowedTestRecipients: [...(updated.settings.allowedTestRecipients ?? [])],
        });
        setFeedback({
          type: 'success',
          message: 'Email settings saved successfully. Outbox workers updated.',
        });
      }
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to save email configuration.',
      });
    } finally {
      setSaving(false);
    }
  };

  // High impact toggle confirmation for disabling transactional email
  const handleToggleEnabled = (next: boolean) => {
    if (!next && form.enabled) {
      // Opening disable confirmation modal
      setDisableConfirmOpen(true);
    } else {
      setForm((prev) => ({ ...prev, enabled: next }));
    }
  };

  // Reset all module settings to defaults
  const handleConfirmReset = async () => {
    setSaving(true);
    try {
      const resetRes = await fetchApiData<ModuleSettingsResponseDto<EmailSettingsDto>>(
        '/admin/settings/email/reset',
        {
          method: 'POST',
          body: JSON.stringify({ reason: 'Administrator reset email settings to defaults' }),
        },
      );
      if (resetRes) {
        setInitialData(resetRes);
        setForm({
          enabled: Boolean(resetRes.settings.enabled),
          provider: resetRes.settings.provider,
          fromName: resetRes.settings.fromName,
          fromAddress: resetRes.settings.fromAddress,
          replyTo: resetRes.settings.replyTo,
          testRecipientOverride: resetRes.settings.testRecipientOverride ?? '',
          allowedTestRecipients: [...(resetRes.settings.allowedTestRecipients ?? [])],
        });
        setResetConfirmOpen(false);
        setFeedback({ type: 'success', message: 'Email settings reset to system defaults.' });
      }
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Could not reset email settings.',
      });
    } finally {
      setSaving(false);
    }
  };

  // Add recipient to test allow-list
  const handleAddAllowedRecipient = () => {
    const trimmed = newRecipientInput.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!trimmed || !emailRegex.test(trimmed)) return;
    if (!form.allowedTestRecipients.includes(trimmed)) {
      setForm((prev) => ({
        ...prev,
        allowedTestRecipients: [...prev.allowedTestRecipients, trimmed],
      }));
    }
    setNewRecipientInput('');
  };

  // Remove recipient from test allow-list
  const handleRemoveAllowedRecipient = (emailToRemove: string) => {
    setForm((prev) => ({
      ...prev,
      allowedTestRecipients: prev.allowedTestRecipients.filter((e) => e !== emailToRemove),
    }));
  };

  // Send real test email through worker pipeline
  const handleSendTestEmail = async () => {
    const trimmed = testRecipient.trim().toLowerCase();
    if (!trimmed) return;
    setTestSending(true);
    setTestResult(null);
    try {
      const result = await apiRequest<{ data: { notificationId: string } }>(
        '/admin/email/test-send',
        {
          method: 'POST',
          body: JSON.stringify({
            notificationType: testNotificationType,
            testRecipient: trimmed,
            reason: 'Administrative test email send from Email Settings console',
          }),
        },
      );
      setTestResult({
        success: true,
        message: `Test email queued successfully (Notification #${result.data.notificationId.slice(0, 8)}).`,
      });
    } catch (err) {
      setTestResult({
        success: false,
        message: err instanceof Error ? err.message : 'Test email send rejected by server policy.',
      });
    } finally {
      setTestSending(false);
    }
  };

  if (loading && !initialData) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-2 text-muted-foreground text-xs">
        <RefreshCw className="size-5 animate-spin text-primary" />
        <span>Loading Email Settings...</span>
      </div>
    );
  }

  const readiness = initialData?.readiness;
  const isResend = form.provider === 'resend';
  const resendApiKeyConfigured = Boolean(
    resendIntegration?.secrets.find((s) => s.keyName === 'api_key')?.configured,
  );
  const resendWebhookConfigured = Boolean(
    resendIntegration?.secrets.find((s) => s.keyName === 'webhook_secret')?.configured,
  );

  return (
    <div className="space-y-6 pb-20 max-w-5xl">
      {/* Header & Quick Status */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="text-xl font-semibold tracking-tight text-foreground">Email Settings</h2>
            <SettingStatusBadge
              status={form.enabled ? readiness?.status ?? 'ready' : 'disabled'}
              label={form.enabled ? (readiness?.status === 'ready' ? 'Ready' : 'Needs attention') : 'Disabled'}
            />
            <RuntimeEffectBadge runtimeMutable requiresRestart={false} />
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Configure how Maevelle sends transactional customer notifications, authenticates providers, and safeguards testing.
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
            variant="outline"
            size="sm"
            onClick={() => setTestModalOpen(true)}
            className="text-xs h-8 gap-1.5 bg-primary/5 hover:bg-primary/10 text-primary border-primary/20"
          >
            <Send className="size-3.5" />
            Send test email
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setResetConfirmOpen(true)}
            className="text-xs h-8 text-muted-foreground hover:text-foreground"
          >
            <RotateCcw className="size-3.5" />
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
            <X className="size-3.5" />
          </Button>
        </div>
      )}

      {/* 1. Transactional Email Master Switch */}
      <SettingsSection
        title="Transactional Email Dispatch"
        description="Master switch controlling whether customer notifications are dispatched by background email workers."
      >
        <SettingToggle
          id="email-enabled-switch"
          label="Transactional Email"
          description="Send transactional emails for customer order receipts, payment notifications, shipping updates, cancellations, and refunds."
          consequenceHint="When disabled, Maevelle will stop sending new transactional emails. Existing email history remains preserved in the audit log."
          checked={form.enabled}
          onCheckedChange={handleToggleEnabled}
        />
      </SettingsSection>

      {/* 2. Email Provider Configuration */}
      <SettingsSection
        title="Email Delivery Provider"
        description="Choose the active transactional dispatch provider and review credential connectivity."
      >
        <SettingsCard
          title="Active Dispatch Adapter"
          description="Select Resend for production cloud deliverability or Local for local development log capture."
          icon={Server}
          badge={
            <SettingStatusBadge
              status={isResend ? (resendApiKeyConfigured ? 'CONNECTED' : 'NEEDS_CONFIGURATION') : 'CONNECTED'}
              label={isResend ? (resendApiKeyConfigured ? 'Connected' : 'Missing credentials') : 'Local Mode'}
            />
          }
          actions={
            isResend ? (
              <Link
                href="/settings/integrations/resend"
                className={buttonVariants({ variant: 'outline', size: 'sm', className: 'text-xs h-7.5 gap-1.5' })}
              >
                Manage Resend
                <ArrowUpRight className="size-3.5" />
              </Link>
            ) : undefined
          }
        >
          <div className="space-y-4">
            <SettingField
              id="email-provider-select"
              label="Provider"
              description="Active engine used by background workers to send emails."
            >
              <Select
                value={form.provider}
                onValueChange={(val) => {
                  if (val === 'local' || val === 'resend') {
                    setForm((prev) => ({ ...prev, provider: val }));
                  }
                }}
              >
                <SelectTrigger id="email-provider-select" className="max-w-xs text-xs h-9">
                  <SelectValue placeholder="Select provider" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="resend" className="text-xs">
                    Resend (Recommended for production delivery)
                  </SelectItem>
                  <SelectItem value="local" className="text-xs">
                    Local Development (Capture in logs & database only)
                  </SelectItem>
                </SelectContent>
              </Select>
            </SettingField>

            {isResend && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <div className="p-3 rounded-lg border border-border bg-muted/20 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-foreground">API Credential</span>
                    {resendApiKeyConfigured ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 className="size-3" />
                        Configured
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                        <AlertTriangle className="size-3" />
                        Not configured
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Required for authenticated dispatch via Resend API.
                  </p>
                </div>

                <div className="p-3 rounded-lg border border-border bg-muted/20 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-foreground">Webhook Secret</span>
                    {resendWebhookConfigured ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 className="size-3" />
                        Configured
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
                        Optional in development
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Authenticates delivery callbacks (`email.delivered`, `email.bounced`).
                  </p>
                </div>
              </div>
            )}
          </div>
        </SettingsCard>
      </SettingsSection>

      {/* 3. Sender Identity */}
      <SettingsSection
        title="Sender Identity"
        description="Brand identity and mailbox addresses presented to customers in their email inboxes."
      >
        <SettingsCard title="Mailbox Addresses" icon={Mail}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <SettingField
              id="from-name-input"
              label="Sender Display Name"
              description="Name shown in customer inbox headers (e.g. Maevelle)."
              required
            >
              <Input
                id="from-name-input"
                value={form.fromName}
                onChange={(e) => setForm((prev) => ({ ...prev, fromName: e.target.value }))}
                className="text-xs h-9"
                placeholder="Maevelle"
              />
            </SettingField>

            <SettingField
              id="from-address-input"
              label="Sender Email Address"
              description="Sending mailbox. Must belong to your verified domain in production."
              consequenceHint="In production, this domain must match your verified DNS records (SPF, DKIM, DMARC)."
              required
            >
              <Input
                id="from-address-input"
                type="email"
                value={form.fromAddress}
                onChange={(e) => setForm((prev) => ({ ...prev, fromAddress: e.target.value }))}
                className="text-xs h-9 font-mono"
                placeholder="orders@maevelle.com"
              />
            </SettingField>

            <div className="sm:col-span-2">
              <SettingField
                id="reply-to-input"
                label="Reply-To Email Address"
                description="Human customer support mailbox where customer email replies are routed."
                consequenceHint="Replies sent by customers to notification emails will arrive here."
                required
              >
                <Input
                  id="reply-to-input"
                  type="email"
                  value={form.replyTo}
                  onChange={(e) => setForm((prev) => ({ ...prev, replyTo: e.target.value }))}
                  className="text-xs h-9 font-mono max-w-md"
                  placeholder="maevelleBangladesh@gmail.com"
                />
              </SettingField>
            </div>
          </div>
        </SettingsCard>
      </SettingsSection>

      {/* 4. Development & Testing Safety */}
      <SettingsSection
        title="Development & Testing Safety"
        description="Safeguards ensuring non-production environments never deliver emails to real customer mailboxes."
      >
        <SettingsCard
          title="Testing Rules"
          icon={Shield}
          badge={
            <Badge variant="outline" className="text-[10px] uppercase font-mono">
              Safe Mode
            </Badge>
          }
        >
          <div className="space-y-4">
            <SettingField
              id="test-override-input"
              label="Test Recipient Override"
              description="When populated in non-production environments, all outbound transactional emails redirect to this specific mailbox."
              consequenceHint="In production environments, this override is strictly forbidden by server policy."
            >
              <Input
                id="test-override-input"
                type="email"
                value={form.testRecipientOverride}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, testRecipientOverride: e.target.value }))
                }
                placeholder="developer@example.com (Leave empty for standard delivery)"
                className="text-xs h-9 font-mono max-w-md"
              />
            </SettingField>

            <div className="space-y-2 pt-2 border-t">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-semibold text-foreground">
                    Allowed Test Recipients
                  </span>
                  <p className="text-[11px] text-muted-foreground">
                    Only addresses in this list can receive test dispatches in non-production.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                {form.allowedTestRecipients.length === 0 ? (
                  <span className="text-xs text-muted-foreground italic">
                    No explicit test recipients configured.
                  </span>
                ) : (
                  form.allowedTestRecipients.map((email) => (
                    <Badge
                      key={email}
                      variant="secondary"
                      className="inline-flex items-center gap-1 text-xs py-1 px-2.5 font-mono"
                    >
                      <span>{email}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveAllowedRecipient(email)}
                        className="hover:text-destructive rounded-full"
                        aria-label={`Remove ${email}`}
                      >
                        <X className="size-3" />
                      </button>
                    </Badge>
                  ))
                )}
              </div>

              <div className="flex items-center gap-2 max-w-sm pt-2">
                <Input
                  type="email"
                  placeholder="new-tester@example.com"
                  value={newRecipientInput}
                  onChange={(e) => setNewRecipientInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddAllowedRecipient();
                    }
                  }}
                  className="text-xs h-8"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddAllowedRecipient}
                  disabled={!newRecipientInput.trim()}
                  className="text-xs h-8 shrink-0"
                >
                  <Plus className="size-3.5 mr-1" />
                  Add
                </Button>
              </div>
            </div>
          </div>
        </SettingsCard>
      </SettingsSection>

      {/* 5. Configuration Health Checklist */}
      <SettingsSection
        title="Configuration Health Status"
        description="Authoritative server verification of operational email readiness."
      >
        <div className="p-4 rounded-xl border border-border bg-card space-y-3">
          <div className="flex items-center justify-between border-b pb-2">
            <span className="text-xs font-semibold text-foreground uppercase tracking-wider">
              Verification Checklist
            </span>
            <SettingStatusBadge status={readiness?.status ?? 'ready'} />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            <div className="flex items-center gap-2">
              {form.provider === 'local' || resendApiKeyConfigured ? (
                <CheckCircle2 className="size-4 text-emerald-600" />
              ) : (
                <AlertTriangle className="size-4 text-amber-500" />
              )}
              <span>Provider configured ({form.provider})</span>
            </div>

            <div className="flex items-center gap-2">
              {!form.fromAddress.endsWith('.invalid') ? (
                <CheckCircle2 className="size-4 text-emerald-600" />
              ) : (
                <AlertTriangle className="size-4 text-amber-500" />
              )}
              <span>Sender address valid</span>
            </div>

            <div className="flex items-center gap-2">
              {form.provider === 'local' || resendWebhookConfigured ? (
                <CheckCircle2 className="size-4 text-emerald-600" />
              ) : (
                <AlertTriangle className="size-4 text-amber-500" />
              )}
              <span>Webhook signing secret verified</span>
            </div>

            <div className="flex items-center gap-2">
              {form.enabled ? (
                <CheckCircle2 className="size-4 text-emerald-600" />
              ) : (
                <AlertCircle className="size-4 text-muted-foreground" />
              )}
              <span>Transactional email enabled</span>
            </div>
          </div>

          {readiness?.reasons && readiness.reasons.length > 0 && (
            <div className="pt-2 border-t space-y-1">
              {readiness.reasons.map((r, i) => (
                <p key={i} className="text-xs text-muted-foreground flex items-center gap-1.5">
                  <span className="size-1.5 rounded-full bg-muted-foreground/60 shrink-0" />
                  {r}
                </p>
              ))}
            </div>
          )}
        </div>
      </SettingsSection>

      {/* Sticky Save Bar */}
      <SettingsSaveBar
        dirty={isDirty}
        saving={saving}
        onSave={handleSave}
        onDiscard={handleDiscard}
      />

      {/* Disable Transactional Email Confirmation Dialog */}
      <SettingsConfirmationDialog
        open={disableConfirmOpen}
        onOpenChange={setDisableConfirmOpen}
        title="Disable Transactional Email?"
        description="Are you sure you want to turn off transactional email dispatch across Maevelle?"
        consequences={[
          'New customer order confirmation emails will not be sent.',
          'Payment receipts, refund notifications, and shipping tracking updates will be paused.',
          'Background workers will skip outbound email dispatches.',
          'Historical email delivery records will remain intact.',
        ]}
        confirmLabel="Disable transactional email"
        variant="destructive"
        onConfirm={() => {
          setForm((prev) => ({ ...prev, enabled: false }));
          setDisableConfirmOpen(false);
        }}
      />

      {/* Reset Defaults Confirmation Dialog */}
      <SettingsConfirmationDialog
        open={resetConfirmOpen}
        onOpenChange={setResetConfirmOpen}
        title="Reset Email Settings to Defaults?"
        description="This will restore all transactional email configuration, mailbox addresses, and testing overrides to system defaults."
        consequences={[
          'Any custom sender addresses or Reply-To addresses will be reverted.',
          'Test recipient overrides will be cleared.',
        ]}
        confirmLabel="Reset to defaults"
        variant="destructive"
        loading={saving}
        onConfirm={handleConfirmReset}
      />

      {/* Send Test Email Modal */}
      <Dialog open={testModalOpen} onOpenChange={setTestModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold">Send Test Transactional Email</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground pt-1">
              Queues an authentic email through Maevelle&apos;s real background worker pipeline to verify template rendering and provider delivery.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2 text-xs">
            <div className="space-y-1.5">
              <label htmlFor="test-template-select" className="font-medium text-foreground">
                Notification Template
              </label>
              <Select
                value={testNotificationType}
                onValueChange={(val) => {
                  if (val) setTestNotificationType(val);
                }}
              >
                <SelectTrigger id="test-template-select" className="text-xs h-9">
                  <SelectValue placeholder="Select template" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ORDER_PLACED_CONFIRMATION" className="text-xs">
                    Order Confirmation (ORDER_PLACED_CONFIRMATION)
                  </SelectItem>
                  <SelectItem value="ORDER_PAYMENT_CONFIRMED" className="text-xs">
                    Payment Receipt (ORDER_PAYMENT_CONFIRMED)
                  </SelectItem>
                  <SelectItem value="ORDER_SHIPPED_DELIVERY" className="text-xs">
                    Order Shipped (ORDER_SHIPPED_DELIVERY)
                  </SelectItem>
                  <SelectItem value="ORDER_REFUND_CONFIRMATION" className="text-xs">
                    Refund Notice (ORDER_REFUND_CONFIRMATION)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="test-recipient-input" className="font-medium text-foreground">
                Recipient Email
              </label>
              <Input
                id="test-recipient-input"
                type="email"
                value={testRecipient}
                onChange={(e) => setTestRecipient(e.target.value)}
                placeholder="tester@example.com"
                className="text-xs h-9 font-mono"
              />
              <p className="text-[11px] text-muted-foreground">
                Must belong to the allowed test recipients list in non-production.
              </p>
            </div>

            {testResult && (
              <div
                className={`p-3 rounded-lg text-xs flex items-center gap-2 border ${
                  testResult.success
                    ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300 border-emerald-500/20'
                    : 'bg-destructive/10 text-destructive border-destructive/20'
                }`}
              >
                {testResult.success ? (
                  <CheckCircle2 className="size-4 text-emerald-600 shrink-0" />
                ) : (
                  <AlertCircle className="size-4 shrink-0" />
                )}
                <span>{testResult.message}</span>
              </div>
            )}
          </div>

          <DialogFooter className="flex flex-row justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setTestModalOpen(false);
                setTestResult(null);
              }}
              disabled={testSending}
              className="text-xs h-9"
            >
              Close
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleSendTestEmail}
              disabled={testSending || !testRecipient.trim()}
              className="text-xs h-9 font-medium"
            >
              {testSending ? (
                <>
                  <RefreshCw className="size-3.5 animate-spin mr-1.5" />
                  Queuing...
                </>
              ) : (
                <>
                  <Send className="size-3.5 mr-1.5" />
                  Send test email
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Audit Drawer */}
      <SettingsAuditDrawer
        open={auditDrawerOpen}
        onOpenChange={setAuditDrawerOpen}
        module="email"
        title="Email Settings History"
      />
    </div>
  );
}
