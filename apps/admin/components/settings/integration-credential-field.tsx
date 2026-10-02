'use client';

import { useState } from 'react';
import { KeyRound, Lock, Trash2, RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { SettingsConfirmationDialog } from './settings-confirmation-dialog';
import { cn } from '@/lib/utils';

interface IntegrationCredentialFieldProps {
  readonly label: string;
  readonly description: string;
  readonly configured: boolean;
  readonly isDeploymentManaged?: boolean | undefined;
  readonly lastReplaced?: string | null | undefined;
  readonly onSaveSecret: (secretValue: string) => Promise<void>;
  readonly onRemoveSecret?: (() => Promise<void>) | undefined;
  readonly removalConsequence?: string | undefined;
  readonly className?: string | undefined;
}

export function IntegrationCredentialField({
  label,
  description,
  configured,
  isDeploymentManaged = false,
  lastReplaced,
  onSaveSecret,
  onRemoveSecret,
  removalConsequence = 'Services depending on this credential will stop functioning until a new key is provided.',
  className,
}: IntegrationCredentialFieldProps) {
  const [replaceModalOpen, setReplaceModalOpen] = useState(false);
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false);
  const [newSecret, setNewSecret] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function handleSaveNewSecret() {
    if (!newSecret.trim()) {
      setError('Secret value cannot be empty.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await onSaveSecret(newSecret.trim());
      setNewSecret('');
      setReplaceModalOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update credential.');
    } finally {
      setBusy(false);
    }
  }

  async function handleConfirmRemove() {
    if (!onRemoveSecret) return;
    setBusy(true);
    try {
      await onRemoveSecret();
      setRemoveDialogOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove credential.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className={cn(
        'p-4 rounded-lg border border-border bg-card/60 space-y-3',
        className,
      )}
    >
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <KeyRound className="size-4 text-muted-foreground shrink-0" />
            <span className="text-sm font-semibold text-foreground">{label}</span>
            {isDeploymentManaged && (
              <span className="text-[10px] font-medium text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700 inline-flex items-center gap-1">
                <Lock className="size-2.5" />
                Deployment managed
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
        </div>

        <div className="flex items-center gap-2 shrink-0 self-start sm:self-center">
          {configured ? (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-500/20 text-emerald-700 dark:text-emerald-400 text-xs font-mono font-medium">
              <CheckCircle2 className="size-3.5 text-emerald-600" />
              <span>••••••••••••••••</span>
            </div>
          ) : (
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-muted text-muted-foreground text-xs font-medium border border-border">
              <AlertCircle className="size-3 text-muted-foreground" />
              Not configured
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t text-xs text-muted-foreground">
        <div>
          {configured ? (
            <span>
              Status: <strong className="text-foreground">Configured</strong>
              {lastReplaced && ` · Last updated ${new Date(lastReplaced).toLocaleDateString()}`}
            </span>
          ) : (
            <span className="text-amber-600 dark:text-amber-400">Missing required secret</span>
          )}
        </div>

        {!isDeploymentManaged && (
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setNewSecret('');
                setError('');
                setReplaceModalOpen(true);
              }}
              className="text-xs h-7.5 px-3"
            >
              <RefreshCw className="size-3 mr-1.5" />
              {configured ? 'Replace credential' : 'Configure credential'}
            </Button>

            {configured && onRemoveSecret && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setRemoveDialogOpen(true)}
                className="text-xs h-7.5 px-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="size-3 mr-1" />
                Remove
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Replace Credential Modal */}
      <Dialog open={replaceModalOpen} onOpenChange={(open) => !busy && setReplaceModalOpen(open)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-semibold text-foreground">
              {configured ? `Replace ${label}` : `Configure ${label}`}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground pt-1.5 leading-relaxed">
              Enter the new secret below. The value will be encrypted with AES-256-GCM before storage.
              Maevelle never displays plaintext credentials once saved.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="credential-input" className="text-xs font-medium">
                Secret Value
              </Label>
              <Input
                id="credential-input"
                type="password"
                placeholder={label.toLowerCase().includes('key') ? 're_123...' : 'whsec_...'}
                value={newSecret}
                onChange={(e) => {
                  setNewSecret(e.target.value);
                  setError('');
                }}
                disabled={busy}
                className="font-mono text-xs"
                autoComplete="off"
              />
            </div>

            {error && <p className="text-xs font-medium text-destructive">{error}</p>}
          </div>

          <DialogFooter className="flex flex-row justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setReplaceModalOpen(false)}
              disabled={busy}
              className="text-xs h-9"
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleSaveNewSecret}
              disabled={busy || !newSecret.trim()}
              className="text-xs h-9 font-medium"
            >
              {busy ? 'Saving...' : 'Save encrypted credential'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remove Credential Confirmation */}
      <SettingsConfirmationDialog
        open={removeDialogOpen}
        onOpenChange={setRemoveDialogOpen}
        title={`Remove ${label}?`}
        description={`Are you sure you want to revoke and delete this credential?`}
        consequences={[removalConsequence]}
        confirmLabel="Remove credential"
        variant="destructive"
        loading={busy}
        onConfirm={handleConfirmRemove}
      />
    </div>
  );
}
