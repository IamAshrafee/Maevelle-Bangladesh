'use client';

import { KeyRound, LogOut, UserCheck, UserRoundX, UserX } from 'lucide-react';

import { TotpCodeInput } from '@/components/security/totp-code-input';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

export type LifecycleActionType = 'SUSPEND' | 'RESTORE' | 'REMOVE';

export interface MemberLifecycleDialogsProps {
  readonly memberName: string;
  readonly busy: boolean;
  readonly lifecycleAction: LifecycleActionType | null;
  readonly lifecycleReason: string;
  readonly onLifecycleReasonChange: (reason: string) => void;
  readonly onCloseLifecycle: () => void;
  readonly onConfirmLifecycle: () => Promise<void>;
  readonly confirmRevokeSessions: boolean;
  readonly onCloseRevokeSessions: () => void;
  readonly onConfirmRevokeSessions: () => Promise<void>;
  readonly confirmResetTwoFactor: boolean;
  readonly resetTwoFactorCode: string;
  readonly resetTwoFactorReason: string;
  readonly onResetTwoFactorCodeChange: (code: string) => void;
  readonly onResetTwoFactorReasonChange: (reason: string) => void;
  readonly onCloseResetTwoFactor: () => void;
  readonly onConfirmResetTwoFactor: () => Promise<void>;
}

/**
 * Centered confirmation gates (Plan Section 4.1B) for destructive member lifecycle,
 * session revocation, and 2FA reset operations.
 */
export function MemberLifecycleDialogs({
  memberName,
  busy,
  lifecycleAction,
  lifecycleReason,
  onLifecycleReasonChange,
  onCloseLifecycle,
  onConfirmLifecycle,
  confirmRevokeSessions,
  onCloseRevokeSessions,
  onConfirmRevokeSessions,
  confirmResetTwoFactor,
  resetTwoFactorCode,
  resetTwoFactorReason,
  onResetTwoFactorCodeChange,
  onResetTwoFactorReasonChange,
  onCloseResetTwoFactor,
  onConfirmResetTwoFactor,
}: MemberLifecycleDialogsProps) {
  return (
    <>
      {lifecycleAction ? (
        <Dialog open={true} onOpenChange={(open) => !open && onCloseLifecycle()}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {lifecycleAction === 'SUSPEND' ? (
                  <>
                    <UserRoundX className="size-5 text-warning" aria-hidden="true" />
                    Suspend member access
                  </>
                ) : lifecycleAction === 'RESTORE' ? (
                  <>
                    <UserCheck className="size-5 text-success" aria-hidden="true" />
                    Reactivate member access
                  </>
                ) : (
                  <>
                    <UserX className="size-5 text-destructive" aria-hidden="true" />
                    Remove member from organization
                  </>
                )}
              </DialogTitle>
              <DialogDescription>
                {lifecycleAction === 'SUSPEND' ? (
                  <span>
                    <strong>{memberName}</strong> will temporarily lose access to all organization
                    features. Active administrator sessions will be revoked immediately.
                  </span>
                ) : lifecycleAction === 'RESTORE' ? (
                  <span>
                    <strong>{memberName}</strong> will regain access to their assigned capabilities.
                  </span>
                ) : (
                  <span>
                    <strong>{memberName}</strong> will be permanently removed from this
                    organization. Their capabilities and active sessions will be terminated.
                    Historical records created by them will remain attributed in audit logs.
                  </span>
                )}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-2">
              <div className="space-y-1.5">
                <Label htmlFor="lc-reason" className="text-xs font-medium">
                  Reason for {lifecycleAction.toLowerCase()} (required)
                </Label>
                <Textarea
                  id="lc-reason"
                  rows={3}
                  maxLength={500}
                  value={lifecycleReason}
                  onChange={(e) => onLifecycleReasonChange(e.target.value)}
                  placeholder="Reason recorded in organizational audit trail"
                  className="text-xs"
                />
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={onCloseLifecycle}>
                Cancel
              </Button>
              <Button
                type="button"
                variant={lifecycleAction === 'RESTORE' ? 'default' : 'destructive'}
                onClick={() => void onConfirmLifecycle()}
                disabled={busy || !lifecycleReason.trim()}
              >
                {busy
                  ? 'Processing…'
                  : `Confirm ${lifecycleAction === 'RESTORE' ? 'reactivation' : lifecycleAction.toLowerCase()}`}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}

      {confirmRevokeSessions ? (
        <Dialog open={true} onOpenChange={(open) => !open && onCloseRevokeSessions()}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-destructive">
                <LogOut className="size-5" aria-hidden="true" />
                Revoke all active sessions
              </DialogTitle>
              <DialogDescription>
                Are you sure you want to terminate all authenticated sessions for{' '}
                <strong>{memberName}</strong>? They will be immediately signed out of all devices
                and required to re-authenticate.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={onCloseRevokeSessions}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={() => void onConfirmRevokeSessions()}
                disabled={busy}
              >
                {busy ? 'Revoking…' : 'Revoke all sessions'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}

      {confirmResetTwoFactor ? (
        <Dialog open={true} onOpenChange={(open) => !open && onCloseResetTwoFactor()}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-destructive">
                <KeyRound className="size-5" aria-hidden="true" />
                Reset two-factor authentication?
              </DialogTitle>
              <DialogDescription>
                This will remove <strong>{memberName}</strong>&apos;s authenticator setup,
                invalidate all their recovery codes, and revoke every active session. If
                organization policy requires 2FA, they will be prompted to set up a new
                authenticator upon their next login.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label
                  htmlFor="two-factor-reset-code"
                  className="text-xs font-medium block text-center"
                >
                  Your current authenticator code
                </Label>
                <TotpCodeInput
                  id="two-factor-reset-code"
                  value={resetTwoFactorCode}
                  onChange={onResetTwoFactorCodeChange}
                  disabled={busy}
                />
                <p className="text-[11px] text-muted-foreground text-center">
                  Enter your own 6-digit authenticator code to confirm this security action.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="two-factor-reset-reason" className="text-xs font-medium">
                  Audit reason (required)
                </Label>
                <Textarea
                  id="two-factor-reset-reason"
                  rows={3}
                  maxLength={500}
                  value={resetTwoFactorReason}
                  onChange={(event) => onResetTwoFactorReasonChange(event.target.value)}
                  placeholder="Why this member can no longer access their enrolled factor"
                  className="text-xs"
                />
              </div>
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={onCloseResetTwoFactor}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={() => void onConfirmResetTwoFactor()}
                disabled={
                  busy || resetTwoFactorCode.length !== 6 || resetTwoFactorReason.trim().length < 3
                }
              >
                {busy ? 'Resetting…' : 'Reset 2FA and revoke sessions'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  );
}
