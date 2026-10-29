'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  CheckCircle2,
  FileCheck,
  HardDrive,
  History,
  Image as ImageIcon,
  RefreshCw,
  RotateCcw,
  Upload,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SettingsCard, SettingsSection } from '@/components/settings/settings-card';
import { SettingField } from '@/components/settings/setting-field';
import { SettingsSaveBar } from '@/components/settings/settings-save-bar';
import { SettingsConfirmationDialog } from '@/components/settings/settings-confirmation-dialog';
import { SettingsAuditDrawer } from '@/components/settings/settings-audit-drawer';
import { RuntimeEffectBadge } from '@/components/settings/setting-status-badge';
import { fetchApiData } from '@/lib/api';
import type { MediaModuleSettingsDto, MediaRuntimeDto, ModuleSettingsResponseDto } from '@maevelle/contracts';

const MIB = 1024 * 1024;
const formatMiB = (bytes: number) => `${Number((bytes / MIB).toFixed(3))} MiB`;
const formatInputMiB = (bytes: number) => Number((bytes / MIB).toFixed(6));
const acceptedFormatLabels: Record<MediaRuntimeDto['acceptedMimeTypes'][number], string> = {
  'image/jpeg': 'JPEG', 'image/png': 'PNG', 'image/webp': 'WebP', 'application/pdf': 'PDF',
};

export function MediaSettingsConsole() {
  const [initialData, setInitialData] = useState<ModuleSettingsResponseDto<MediaModuleSettingsDto>>();
  const [runtime, setRuntime] = useState<MediaRuntimeDto>();
  const [maxUploadBytes, setMaxUploadBytes] = useState<number>(10 * MIB);
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
      const [res, runtimeRes] = await Promise.all([
        fetchApiData<ModuleSettingsResponseDto<MediaModuleSettingsDto>>('/admin/settings/media'),
        fetchApiData<MediaRuntimeDto>('/admin/settings/media/runtime'),
      ]);
      if (runtimeRes) setRuntime(runtimeRes);
      if (res) {
        setInitialData(res);
        const bytes = res.effective['media.maxUploadBytes'];
        const seconds = res.settings['media.uploadExpirySeconds'];
        setMaxUploadBytes(bytes);
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
  const initialBytes = initialData?.effective['media.maxUploadBytes'] ?? 10 * MIB;
  const initialMin = initialData ? Math.round(initialData.settings['media.uploadExpirySeconds'] / 60) : 15;
  const isDirty = maxUploadBytes !== initialBytes || expiryMinutes !== initialMin;

  const handleDiscard = () => {
    setMaxUploadBytes(initialBytes);
    setExpiryMinutes(initialMin);
    setFeedback(null);
  };

  const handleSave = async () => {
    if (!initialData) return;
    setSaving(true);
    setFeedback(null);

    if (!Number.isSafeInteger(maxUploadBytes) || maxUploadBytes < 1024 ||
        maxUploadBytes > Math.min(runtime?.deploymentMaxUploadBytes ?? 0, 50 * MIB)) {
      setFeedback({ type: 'error', message: `Maximum upload size must be between 1 KiB and ${formatMiB(runtime?.deploymentMaxUploadBytes ?? 0)}.` });
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
      const bytes = maxUploadBytes;
      const seconds = expiryMinutes * 60;

      const updated = await fetchApiData<ModuleSettingsResponseDto<MediaModuleSettingsDto>>(
        '/admin/settings/media',
        {
          method: 'PATCH',
          body: JSON.stringify({
            settings: {
              'media.maxUploadBytes': bytes,
              'media.uploadExpirySeconds': seconds,
            },
            expectedVersion: initialData.version,
            reason: `Updated media upload limit to ${formatMiB(maxUploadBytes)} and expiry to ${expiryMinutes} minutes`,
          }),
        },
      );

      if (updated) {
        setInitialData(updated);
        setMaxUploadBytes(updated.effective['media.maxUploadBytes']);
        setExpiryMinutes(Math.round(updated.settings['media.uploadExpirySeconds'] / 60));
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
      const resetRes = await fetchApiData<ModuleSettingsResponseDto<MediaModuleSettingsDto>>(
        '/admin/settings/media/reset',
        {
          method: 'POST',
          body: JSON.stringify({ reason: 'Administrator reset media settings to defaults' }),
        },
      );
      if (resetRes) {
        setInitialData(resetRes);
        const bytes = resetRes.effective['media.maxUploadBytes'];
        const seconds = resetRes.settings['media.uploadExpirySeconds'];
        setMaxUploadBytes(bytes);
        setExpiryMinutes(Math.round(seconds / 60));
        setResetConfirmOpen(false);
        setFeedback({ type: 'success', message: 'Media settings reset. The effective upload limit follows the deployment ceiling.' });
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

  if (!initialData || !runtime) {
    return (
      <div className="rounded-lg border border-destructive/20 bg-card p-5 text-sm">
        <p className="text-destructive">{feedback?.message ?? 'Media settings could not be loaded.'}</p>
        <Button type="button" variant="outline" className="mt-3" onClick={() => void loadData()}>
          Retry
        </Button>
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
            <RuntimeEffectBadge runtimeMutable requiresRestart={false} />
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Manage upload limits and session expiry, and inspect the active storage configuration.
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
              ? 'bg-success/10 text-success border-success/20'
              : 'bg-destructive/10 text-destructive border-destructive/20'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="size-4 text-success shrink-0" />
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
                  min={1024 / MIB}
                  max={runtime ? formatInputMiB(runtime.deploymentMaxUploadBytes) : undefined}
                  step="any"
                  value={formatInputMiB(maxUploadBytes)}
                  disabled={!runtime || runtime.deploymentMaxUploadBytes < 1024}
                  onChange={(e) => setMaxUploadBytes(Math.round(Number(e.target.value) * MIB))}
                  className="text-xs h-9 max-w-[120px]"
                />
                <span className="text-xs font-semibold text-muted-foreground">Mebibytes (MiB)</span>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">
                Active deployment ceiling: {runtime ? formatMiB(runtime.deploymentMaxUploadBytes) : "Loading…"}. Effective limit: {initialData ? formatMiB(initialData.effective['media.maxUploadBytes']) : "Loading…"}.
              </p>
              {initialData && initialData.settings['media.maxUploadBytes'] !== initialData.effective['media.maxUploadBytes'] && (
                <p className="mt-1 text-xs text-warning" role="status">
                  A saved override of {formatMiB(initialData.settings['media.maxUploadBytes'])} exceeds the current deployment ceiling. New uploads use {formatMiB(initialData.effective['media.maxUploadBytes'])}.
                </p>
              )}
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
              <FileCheck className="size-4 text-success" />
              <span>Accepted Media Formats: {runtime?.acceptedMimeTypes.map((mime) => acceptedFormatLabels[mime]).join(', ') ?? 'Loading…'}</span>
            </div>
            <span className="text-[11px] bg-muted px-2 py-0.5 rounded font-mono">
              Review uploads: up to {runtime ? formatMiB(Math.min(runtime.reviewMaxUploadBytes, initialData?.effective['media.maxUploadBytes'] ?? runtime.reviewMaxUploadBytes)) : "Loading…"}
            </span>
          </div>
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title="Storage Infrastructure" description="Backend selected by deployment configuration; live storage health is checked separately.">
        <SettingsCard title={runtime?.storageLabel ?? 'Storage backend'} icon={HardDrive}>
          <div className="space-y-3 text-xs text-muted-foreground">
            <p>Active backend: <strong className="text-foreground">{runtime?.storageLabel ?? 'Loading…'}</strong></p>
            <p>Storage credentials and paths are managed on the server. This configuration does not establish live connectivity.</p>
            <Link href="/media" className="inline-flex min-h-10 items-center text-primary underline-offset-2 hover:underline">Open Media Library to run a health check</Link>
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
        description="This will clear the saved media overrides. The deployment upload ceiling will still apply."
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
