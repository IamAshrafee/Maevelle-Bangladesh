'use client';

import * as React from 'react';
import { useState } from 'react';
import {
  AlertCircle,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  RefreshCw,
  ShieldAlert,
  ShieldOff,
} from 'lucide-react';

import type { ApiEnvelope, TwoFactorStatusDto } from '@maevelle/contracts';
import { apiRequest, ApiRequestError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { TotpCodeInput } from './totp-code-input';
import { RecoveryCodesPanel } from './recovery-codes-panel';

export type ManagementMode = 'regenerate' | 'disable';

export interface TwoFactorManagementDialogProps {
  readonly open: boolean;
  readonly mode: ManagementMode;
  readonly status: TwoFactorStatusDto;
  readonly userEmail?: string | undefined;
  readonly onOpenChange: (open: boolean) => void;
  readonly onSuccess: () => void;
}

export function TwoFactorManagementDialog({
  open,
  mode,
  status,
  userEmail,
  onOpenChange,
  onSuccess,
}: TwoFactorManagementDialogProps) {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [totpCode, setTotpCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newRecoveryCodes, setNewRecoveryCodes] = useState<readonly string[] | null>(null);

  const resetState = () => {
    setPassword('');
    setShowPassword(false);
    setTotpCode('');
    setError(null);
    setLoading(false);
    setNewRecoveryCodes(null);
  };

  const handleClose = () => {
    resetState();
    onOpenChange(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password || totpCode.length !== 6) return;

    setLoading(true);
    setError(null);

    try {
      if (mode === 'regenerate') {
        const response = await apiRequest<ApiEnvelope<{ backupCodes: readonly string[] }>>(
          '/admin/security/two-factor/backup-codes',
          {
            method: 'POST',
            body: JSON.stringify({ password, code: totpCode }),
          },
        );
        setPassword('');
        setTotpCode('');
        setNewRecoveryCodes(response.data.backupCodes);
      } else {
        await apiRequest('/admin/security/two-factor/disable', {
          method: 'POST',
          body: JSON.stringify({ password, code: totpCode }),
        });
        window.location.assign('/admin/login');
      }
    } catch (err) {
      if (err instanceof ApiRequestError) {
        if (err.code === 'STEP_UP_REQUIRED') {
          setError('Recent re-authentication is required. Please sign in again before performing this sensitive operation.');
        } else if (err.code === 'TWO_FACTOR_REQUIRED_BY_POLICY') {
          setError('Organization policy requires two-factor authentication for your account. It cannot be disabled.');
        } else if (err.status === 400 || err.code === 'INVALID_TOTP') {
          setError('Invalid verification code. Check the current code in your authenticator app.');
        } else if (err.status === 401 || err.code === 'INVALID_PASSWORD') {
          setError('Incorrect password. Please verify your current password.');
        } else {
          setError(err.message);
        }
      } else {
        setError('Security action could not be completed. Check your connection and try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const isPolicyRestricted = mode === 'disable' && status.isRequired;

  return (
    <Dialog open={open} onOpenChange={(val) => !val && handleClose()}>
      <DialogContent className="sm:max-w-lg">
        {newRecoveryCodes ? (
          <div className="space-y-4">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <KeyRound className="size-4 text-primary" />
                New recovery codes generated
              </DialogTitle>
              <DialogDescription>
                Your previous recovery codes have been permanently invalidated. Save these new codes now.
              </DialogDescription>
            </DialogHeader>

            <RecoveryCodesPanel
              codes={newRecoveryCodes}
              userEmail={userEmail}
              requireAcknowledgement={true}
              confirmLabel="I have saved my new recovery codes"
              onConfirmed={() => {
                handleClose();
                onSuccess();
              }}
            />
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <DialogHeader>
              <DialogTitle
                className={`flex items-center gap-2 ${
                  mode === 'disable' ? 'text-destructive' : 'text-foreground'
                }`}
              >
                {mode === 'disable' ? (
                  <>
                    <ShieldOff className="size-5" />
                    Disable two-factor authentication?
                  </>
                ) : (
                  <>
                    <KeyRound className="size-5 text-primary" />
                    Regenerate recovery codes?
                  </>
                )}
              </DialogTitle>
              <DialogDescription>
                {mode === 'disable' ? (
                  <span>
                    Your account will no longer require a verification code when signing in. This reduces the security of your Maevelle administrator access.
                  </span>
                ) : (
                  <span>
                    Generating new recovery codes will immediately invalidate all existing recovery codes. Any previous codes you saved will no longer work.
                  </span>
                )}
              </DialogDescription>
            </DialogHeader>

            {/* If required by organization policy */}
            {isPolicyRestricted && (
              <div
                role="alert"
                className="rounded-lg border border-warning/30 bg-warning/10 p-3.5 text-xs text-foreground flex items-start gap-2.5"
              >
                <ShieldAlert className="size-4 text-warning shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <span className="font-semibold text-warning">
                    Required by organization policy
                  </span>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    Two-factor authentication cannot be disabled because organization security policy requires authenticator protection for your role.
                  </p>
                </div>
              </div>
            )}

            {/* Error Message */}
            {error && (
              <div
                role="alert"
                className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive flex items-center gap-2"
              >
                <AlertCircle className="size-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {!isPolicyRestricted && (
              <div className="space-y-3.5 py-1">
                <div className="space-y-1">
                  <Label htmlFor="mgt-password" className="text-xs font-medium">
                    Current account password
                  </Label>
                  <div className="relative">
                    <Input
                      id="mgt-password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter your current password"
                      className="pr-10 text-xs h-9"
                    />
                    <button
                      type="button"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                      onClick={() => setShowPassword((prev) => !prev)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="mgt-totp" className="text-xs font-medium block text-center">
                    Current 6-digit authenticator code
                  </Label>
                  <TotpCodeInput
                    id="mgt-totp"
                    value={totpCode}
                    onChange={setTotpCode}
                    disabled={loading}
                    autoFocus={false}
                  />
                  <p className="text-[11px] text-muted-foreground text-center">
                    Enter the code currently displayed in your authenticator app to authorize this change.
                  </p>
                </div>
              </div>
            )}

            <DialogFooter className="gap-2 sm:gap-0 pt-2">
              <Button type="button" variant="outline" size="sm" onClick={handleClose}>
                Cancel
              </Button>

              {!isPolicyRestricted && (
                <Button
                  type="submit"
                  variant={mode === 'disable' ? 'destructive' : 'default'}
                  size="sm"
                  disabled={loading || !password || totpCode.length !== 6}
                  className="gap-1.5"
                >
                  {loading ? (
                    <>
                      <RefreshCw className="size-3.5 animate-spin" /> Verifying…
                    </>
                  ) : mode === 'disable' ? (
                    'Disable two-factor'
                  ) : (
                    'Regenerate codes'
                  )}
                </Button>
              )}
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
