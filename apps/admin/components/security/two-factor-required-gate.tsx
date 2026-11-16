'use client';

import * as React from 'react';
import { useState } from 'react';
import { ArrowRight, LogOut, ShieldAlert, ShieldCheck } from 'lucide-react';

import type { AdminContextDto } from '@maevelle/contracts';
import { AuthBrandMark, AuthGateCard } from '@/components/auth/auth-split-shell';
import { Button } from '@/components/ui/button';
import { toBrowserUrl } from '@/lib/navigation/route-registry';
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
      window.location.assign(toBrowserUrl('/login'));
    } catch {
      window.location.assign(toBrowserUrl('/login'));
    }
  };

  const deadlineFormatted = context.twoFactor.enrollmentDeadline
    ? new Date(context.twoFactor.enrollmentDeadline).toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
    : null;

  return (
    <AuthGateCard
      {...(enrolling ? {} : { className: 'space-y-6' })}
      headerSlot={
        <div className="flex items-center justify-between pb-2 border-b border-border/60">
          <AuthBrandMark subtitle="Security Verification" />

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleSignOut}
            disabled={signingOut}
            className="text-xs gap-1.5 text-muted-foreground hover:text-foreground"
          >
            <LogOut className="size-3.5" aria-hidden="true" />
            <span>{signingOut ? 'Signing out…' : 'Sign out'}</span>
          </Button>
        </div>
      }
    >
      {enrolling ? (
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
      ) : (
        <>
          <div className="flex items-center gap-3">
            <div className="size-11 rounded-xl bg-warning/15 text-warning flex items-center justify-center border border-warning/20 shrink-0">
              <ShieldAlert className="size-6" aria-hidden="true" />
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
              To protect business operations, financial transactions, and customer data,
              organization policy requires two-factor authentication for your access level.
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
              className="w-full h-11 md:h-10 text-sm font-semibold gap-2"
            >
              <ShieldCheck className="size-4" aria-hidden="true" />
              <span>Set up authenticator now</span>
              <ArrowRight className="size-4" aria-hidden="true" />
            </Button>

            <Button
              type="button"
              variant="outline"
              onClick={handleSignOut}
              disabled={signingOut}
              className="w-full h-10 md:h-9 text-xs"
            >
              Sign out of Maevelle
            </Button>
          </div>

          <p className="text-[11px] text-center text-muted-foreground">
            Need assistance? Contact an authorized Maevelle administrator.
          </p>
        </>
      )}
    </AuthGateCard>
  );
}
