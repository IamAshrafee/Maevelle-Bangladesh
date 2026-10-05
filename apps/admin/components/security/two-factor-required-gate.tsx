'use client';

import * as React from 'react';
import { useState } from 'react';
import { ArrowRight, LockKeyhole, LogOut, ShieldAlert, ShieldCheck } from 'lucide-react';

import type { AdminContextDto } from '@maevelle/contracts';
import { Button } from '@/components/ui/button';
import { AuthenticatorSetupWizard } from './authenticator-setup-wizard';

export interface TwoFactorRequiredGateProps {
  readonly context: AdminContextDto;
  readonly onEnrolled?: (() => void) | undefined;
}

export function TwoFactorRequiredGate({ context, onEnrolled }: TwoFactorRequiredGateProps) {
  const [enrolling, setEnrolling] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await fetch('/api/auth/sign-out', { method: 'POST', credentials: 'include' });
      window.location.assign('/admin/login');
    } catch {
      window.location.assign('/admin/login');
    }
  };

  const deadlineFormatted = context.twoFactor.enrollmentDeadline
    ? new Date(context.twoFactor.enrollmentDeadline).toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
    : null;

  return (
    <div className="min-h-screen bg-background flex flex-col justify-center items-center p-4 sm:p-6 lg:p-8">
      <div className="w-full max-w-xl space-y-6">
        {/* Header / Brand */}
        <div className="flex items-center justify-between pb-2 border-b border-border/60">
          <div className="flex items-center gap-3">
            <div className="size-9 rounded-xl bg-primary text-primary-foreground font-bold flex items-center justify-center text-base shadow-xs">
              M
            </div>
            <div className="flex flex-col leading-tight">
              <strong className="text-base font-bold text-foreground">Maevelle</strong>
              <span className="text-xs text-muted-foreground">Security Verification</span>
            </div>
          </div>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleSignOut}
            disabled={signingOut}
            className="text-xs gap-1.5 text-muted-foreground hover:text-foreground"
          >
            <LogOut className="size-3.5" />
            <span>{signingOut ? 'Signing out…' : 'Sign out'}</span>
          </Button>
        </div>

        {enrolling ? (
          <div className="rounded-2xl border border-border bg-card p-6 sm:p-8 shadow-sm">
            <AuthenticatorSetupWizard
              isMandatory={true}
              onCancel={() => setEnrolling(false)}
              onComplete={() => {
                if (onEnrolled) {
                  onEnrolled();
                } else {
                  window.location.reload();
                }
              }}
            />
          </div>
        ) : (
          <div className="rounded-2xl border border-border bg-card p-6 sm:p-8 shadow-sm space-y-6">
            <div className="flex items-center gap-3">
              <div className="size-11 rounded-xl bg-warning/15 text-warning flex items-center justify-center border border-warning/20">
                <ShieldAlert className="size-6" />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight text-foreground">
                  Two-factor authentication is required
                </h1>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Your account must configure an Authenticator App to access Maevelle.
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-border/80 bg-muted/30 p-4 space-y-2 text-xs leading-relaxed text-muted-foreground">
              <p>
                To protect business operations, financial transactions, and customer data, organization policy requires two-factor authentication for your access level.
              </p>
              {deadlineFormatted && (
                <p className="text-foreground font-medium">
                  Enrollment deadline: {deadlineFormatted}
                </p>
              )}
            </div>

            <div className="space-y-3">
              <Button
                type="button"
                onClick={() => setEnrolling(true)}
                className="w-full h-10 text-sm font-semibold gap-2"
              >
                <ShieldCheck className="size-4" />
                <span>Set up authenticator now</span>
                <ArrowRight className="size-4" />
              </Button>

              <Button
                type="button"
                variant="outline"
                onClick={handleSignOut}
                disabled={signingOut}
                className="w-full h-9 text-xs"
              >
                Sign out of Maevelle
              </Button>
            </div>

            <p className="text-[11px] text-center text-muted-foreground">
              Need assistance? Contact an authorized Maevelle administrator.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
