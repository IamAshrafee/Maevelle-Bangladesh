'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  FileCheck,
  HardDrive,
  History,
  Image as ImageIcon,
  Lock,
  RefreshCw,
  RotateCcw,
  Server,
  Shield,
  Upload,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { SettingsCard, SettingsSection } from '@/components/settings/settings-card';
import { SettingField } from '@/components/settings/setting-field';
import { SettingsSaveBar } from '@/components/settings/settings-save-bar';
import { SettingsConfirmationDialog } from '@/components/settings/settings-confirmation-dialog';
import { SettingsAuditDrawer } from '@/components/settings/settings-audit-drawer';
import { SettingStatusBadge, RuntimeEffectBadge } from '@/components/settings/setting-status-badge';
import { fetchApiData } from '@/lib/api';
import type { MediaSettingsDto, ModuleSettingsResponseDto } from '@maevelle/contracts';

export function MediaSettingsConsole() {
  const [initialData, setInitialData] = useState<ModuleSettingsResponseDto<MediaSettingsDto>>();
  const [maxUploadMb, setMaxUploadMb] = useState<number>(10);
  const [expiryMinutes, setExpiryMinutes] = useState<number>(15);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [auditDrawerOpen, setAuditDrawerOpen] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setFeedback(null);
    try {
      const res = await fetchApiData<ModuleSettingsResponseDto<MediaSettingsDto>>(
        '/admin/settings/media',
      );
      if (res) {
        setInitialData(res);
        const bytes = res.settings.maxUploadBytes || 10485760;
        const seconds = res.settings.uploadExpirySeconds || 900;
        setMaxUploadMb(Math.round(bytes / (1024 * 1024)));
        setExpiryMinutes(Math.round(seconds / 60));
      }
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Could not load media settings.',
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Dirty state calculation
  const initialMb = initialData ? Math.round((initialData.settings.maxUploadBytes || 10485760) / (1024 * 1024)) : 10;
  const initialMin = initialData ? Math.round((initialData.settings.uploadExpirySeconds || 900) / 60) : 15;
  const isDirty = maxUploadMb !== initialMb || expiryMinutes !== initialMin;

  const handleDiscard = () => {
    setMaxUploadMb(initialMb);
    setExpiryMinutes(initialMin);
    setFeedback(null);
  };

  const handleSave = async () => {
    if (!initialData) return;
    setSaving(true);
    setFeedback(null);

    // Validation: 1MB to 50MB
    if (maxUploadMb < 1 || maxUploadMb > 50) {
      setFeedback({ type: 'error', message: 'Maximum upload size must be between 1 MB and 50 MB.' });
      setSaving(false);
      return;
    }
    // Validation: 1 to 60 minutes
    if (expiryMinutes < 1 || expiryMinutes > 60) {
      setFeedback({ type: 'error', message: 'Upload session expiry must be between 1 and 60 minutes.' });
      setSaving(false);
      return;
    }

    try {
      const bytes = maxUploadMb * 1024 * 1024;
      const seconds = expiryMinutes * 60;

      const updated = await fetchApiData<ModuleSettingsResponseDto<MediaSettingsDto>>(
        '/admin/settings/media',
        {
          method: 'PATCH',
          body: JSON.stringify({
            settings: {
              'media.maxUploadBytes': bytes,
              'media.uploadExpirySeconds': seconds,
            },
            expectedVersion: initialData.version,
            reason: `Updated media upload limit to ${maxUploadMb} MB and expiry to ${expiryMinutes} minutes`,
          }),
        },
      );

      if (updated) {
        setInitialData(updated);
        setFeedback({
          type: 'success',
          message: 'Media settings saved successfully. Upload policies updated.',
        });
      }
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to save media settings.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmReset = async () => {
    setSaving(true);
    try {
      const resetRes = await fetchApiData<ModuleSettingsResponseDto<MediaSettingsDto>>(
        '/admin/settings/media/reset',
        {
          method: 'POST',
          body: JSON.stringify({ reason: 'Administrator reset media settings to defaults' }),
        },
      );
      if (resetRes) {
        setInitialData(resetRes);
        const bytes = resetRes.settings.maxUploadBytes || 10485760;
        const seconds = resetRes.settings.uploadExpirySeconds || 900;
        setMaxUploadMb(Math.round(bytes / (1024 * 1024)));
        setExpiryMinutes(Math.round(seconds / 60));
        setResetConfirmOpen(false);
        setFeedback({ type: 'success', message: 'Media settings restored to Maevelle defaults (10 MB).' });
      }
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Could not reset media settings.',
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading && !initialData) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-2 text-muted-foreground text-xs">
        <RefreshCw className="size-5 animate-spin text-primary" />
        <span>Loading Media Settings...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-20 max-w-4xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b">
        <div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <Link href="/media" className="hover:text-foreground flex items-center gap-1">
              <ImageIcon className="size-3.5" />
              Media Library
            </Link>
            <span>/</span>
            <span className="text-foreground font-medium">Settings</span>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-xl font-semibold tracking-tight text-foreground">Media Settings</h1>
            <SettingStatusBadge status="ready" label="Ready" />
            <RuntimeEffectBadge runtimeMutable requiresRestart={false} />
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Manage file upload policies, upload session expiration, and review cloud storage readiness.
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

      {/* Upload Limits Section */}
      <SettingsSection
        title="Upload Limits & Session Policies"
        description="Configure file size boundaries and duration limits for media asset ingestion."
      >
        <SettingsCard title="Upload Controls" icon={Upload}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <SettingField
              id="upload-size-input"
              label="Maximum Upload Size"
              description="Maximum allowable file size for new media asset uploads."
              consequenceHint="Maximum file size allowed for new uploads. Existing files larger than this limit will not be affected."
              required
            >
              <div className="flex items-center gap-2">
                <Input
                  id="upload-size-input"
                  type="number"
                  min={1}
                  max={50}
                  value={maxUploadMb}
                  onChange={(e) => setMaxUploadMb(Number(e.target.value))}
                  className="text-xs h-9 max-w-[120px]"
                />
                <span className="text-xs font-semibold text-muted-foreground">Megabytes (MB)</span>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">
                Converted to byte representation: {(maxUploadMb * 1024 * 1024).toLocaleString()} bytes
              </p>
            </SettingField>

            <SettingField
              id="expiry-input"
              label="Upload Session Expiry"
              description="Duration before an initiated, uncompleted upload session expires."
              consequenceHint="Unfinished multi-part or signed direct uploads must finalize before this window."
              required
            >
              <div className="flex items-center gap-2">
                <Input
                  id="expiry-input"
                  type="number"
                  min={1}
                  max={60}
                  value={expiryMinutes}
                  onChange={(e) => setExpiryMinutes(Number(e.target.value))}
                  className="text-xs h-9 max-w-[120px]"
                />
                <span className="text-xs font-semibold text-muted-foreground">Minutes</span>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">
                Converted to seconds: {(expiryMinutes * 60).toLocaleString()} seconds
              </p>
            </SettingField>
          </div>

          <div className="mt-5 pt-4 border-t flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-2">
              <FileCheck className="size-4 text-emerald-600" />
              <span>Accepted Media Formats: JPEG, PNG, WebP, AVIF, MP4, PDF</span>
            </div>
            <span className="text-[11px] bg-muted px-2 py-0.5 rounded font-mono">
              Maevelle Default: 10 MB / 15 Minutes
            </span>
          </div>
        </SettingsCard>
      </SettingsSection>

      {/* Storage Backend (Deployment Managed) */}
      <SettingsSection
        title="Storage Infrastructure"
        description="Active object storage engine connected for media asset retention."
      >
        <SettingsCard
          title="Cloudflare R2 Object Storage"
          description="High-availability S3-compatible cloud storage for product imagery and attachments."
          icon={HardDrive}
          badge={<SettingStatusBadge status="CONNECTED" label="Connected" />}
        >
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-3 rounded-lg border border-border bg-muted/20 space-y-1">
                <span className="text-xs text-muted-foreground font-medium">Public Bucket</span>
                <p className="font-semibold text-foreground text-xs font-mono">Configured</p>
              </div>

              <div className="p-3 rounded-lg border border-border bg-muted/20 space-y-1">
                <span className="text-xs text-muted-foreground font-medium">Private Bucket</span>
                <p className="font-semibold text-foreground text-xs font-mono">Configured</p>
              </div>

              <div className="p-3 rounded-lg border border-border bg-muted/20 space-y-1">
                <span className="text-xs text-muted-foreground font-medium">Configuration Source</span>
                <div className="pt-0.5">
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700">
                    <Lock className="size-2.5" />
                    Deployment managed
                  </span>
                </div>
              </div>
            </div>

            <div className="p-3.5 rounded-lg bg-muted/30 border border-border/70 text-xs text-muted-foreground leading-relaxed">
              <strong className="text-foreground">Why are storage credentials read-only?</strong> Cloudflare R2
              endpoint URLs, bucket names, and AWS S3 signature keys are provisioned directly by server infrastructure
              and container environment files. They cannot be edited through the browser to safeguard master asset buckets.
            </div>
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

      {/* Reset Defaults Confirmation */}
      <SettingsConfirmationDialog
        open={resetConfirmOpen}
        onOpenChange={setResetConfirmOpen}
        title="Reset Media Settings to Defaults?"
        description="This will restore the maximum file upload size to 10 MB and upload session timeout to 15 minutes."
        confirmLabel="Reset to defaults"
        variant="destructive"
        loading={saving}
        onConfirm={handleConfirmReset}
      />

      {/* Audit Drawer */}
      <SettingsAuditDrawer
        open={auditDrawerOpen}
        onOpenChange={setAuditDrawerOpen}
        module="media"
        title="Media Settings History"
      />
    </div>
  );
}
