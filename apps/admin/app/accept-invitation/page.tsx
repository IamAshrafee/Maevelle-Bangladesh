'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, type FormEvent, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock, KeyRound, ShieldAlert, UserCheck } from 'lucide-react';
import { AuthBrandMark, AuthGateCard, AuthSplitShell } from '@/components/auth/auth-split-shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type AcceptanceState =
  | { kind: 'form' }
  | { kind: 'accepted' }
  | { kind: 'already_accepted' }
  | { kind: 'expired'; message: string }
  | { kind: 'revoked'; message: string }
  | { kind: 'invalid'; message: string };

const INVITE_BULLETS = [
  'Invite-only administrator membership',
  'Server-enforced capabilities',
  'Audited access changes',
] as const;

function InvitationAcceptanceForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [errorMessage, setErrorMessage] = useState<string>();
  const [state, setState] = useState<AcceptanceState>({ kind: 'form' });
  const [submitting, setSubmitting] = useState(false);

  async function accept(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(undefined);
    if (!token) {
      setState({
        kind: 'invalid',
        message:
          'This invitation link is missing the required security token. Please ask an administrator to resend it.',
      });
      return;
    }
    if (password && password !== confirmation) {
      setErrorMessage('The password confirmation does not match.');
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetch('/api/invitations/accept', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token, ...(password ? { password } : {}) }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        data?: { alreadyAccepted?: boolean; expired?: boolean };
        error?: { code?: string; message?: string };
      };

      if (!response.ok) {
        const code = payload.error?.code;
        const msg = payload.error?.message ?? 'The invitation could not be accepted.';
        if (code === 'INVITATION_EXPIRED') {
          setState({
            kind: 'expired',
            message:
              msg || 'This invitation has passed its validity window and can no longer be used.',
          });
          return;
        }
        if (code === 'INVITATION_REVOKED') {
          setState({
            kind: 'revoked',
            message:
              msg || 'This invitation was revoked by an administrator before it was accepted.',
          });
          return;
        }
        if (code === 'INVITATION_INVALID' || response.status === 404) {
          setState({
            kind: 'invalid',
            message: 'This invitation token is invalid or does not exist.',
          });
          return;
        }
        setErrorMessage(msg);
        return;
      }

      if (payload.data?.expired) {
        setState({
          kind: 'expired',
          message:
            'This invitation has expired. Please ask your administrator to send a new invitation.',
        });
        return;
      }

      if (payload.data?.alreadyAccepted) {
        setState({ kind: 'already_accepted' });
        return;
      }

      setState({ kind: 'accepted' });
    } catch {
      setErrorMessage('Unable to reach Maevelle. Please check your network and try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthSplitShell
      eyebrow="Team invitation"
      heading="Join with protected access."
      summary="Your administrator selected your capabilities and organization access before sending this link."
      bullets={INVITE_BULLETS}
      securityNote="Invitation links are single-use and expire automatically."
    >
      {state.kind === 'accepted' ? (
        <div className="space-y-4">
          <div className="size-11 rounded-xl bg-success/15 text-success flex items-center justify-center border border-success/25">
            <CheckCircle2 className="size-6" aria-hidden="true" />
          </div>
          <div className="space-y-1.5">
            <p className="text-xs font-semibold uppercase tracking-wider text-success">
              Invitation accepted
            </p>
            <h2 className="text-2xl font-bold tracking-tight text-foreground">
              Your membership is active
            </h2>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Sign in with your invited email address to access your organization workspace.
            </p>
          </div>
          <Button
            variant="default"
            render={<Link href="/login" />}
            nativeButton={false}
            className="w-full h-10"
          >
            Continue to sign in
          </Button>
        </div>
      ) : null}

      {state.kind === 'already_accepted' ? (
        <div className="space-y-4">
          <div className="size-11 rounded-xl bg-info/15 text-info flex items-center justify-center border border-info/25">
            <UserCheck className="size-6" aria-hidden="true" />
          </div>
          <div className="space-y-1.5">
            <p className="text-xs font-semibold uppercase tracking-wider text-info">
              Already activated
            </p>
            <h2 className="text-2xl font-bold tracking-tight text-foreground">
              Membership already accepted
            </h2>
            <p className="text-xs text-muted-foreground leading-relaxed">
              This invitation was previously accepted. You can sign in directly to your account.
            </p>
          </div>
          <Button
            variant="default"
            render={<Link href="/login" />}
            nativeButton={false}
            className="w-full h-10"
          >
            Sign in to your account
          </Button>
        </div>
      ) : null}

      {state.kind === 'expired' ? (
        <div className="space-y-4">
          <div className="size-11 rounded-xl bg-warning/15 text-warning flex items-center justify-center border border-warning/25">
            <Clock className="size-6" aria-hidden="true" />
          </div>
          <div className="space-y-1.5">
            <p className="text-xs font-semibold uppercase tracking-wider text-warning">
              Invitation expired
            </p>
            <h2 className="text-2xl font-bold tracking-tight text-foreground">
              Link no longer valid
            </h2>
            <p className="text-xs text-muted-foreground leading-relaxed">{state.message}</p>
          </div>
          <div className="rounded-lg border border-warning/30 bg-warning/10 p-3.5 text-xs text-foreground">
            Please ask your organization administrator or Owner to reissue an invitation to your
            email.
          </div>
          <Button
            variant="outline"
            render={<Link href="/login" />}
            nativeButton={false}
            className="w-full h-10"
          >
            Return to sign in
          </Button>
        </div>
      ) : null}

      {state.kind === 'revoked' ? (
        <div className="space-y-4">
          <div className="size-11 rounded-xl bg-destructive/15 text-destructive flex items-center justify-center border border-destructive/25">
            <ShieldAlert className="size-6" aria-hidden="true" />
          </div>
          <div className="space-y-1.5">
            <p className="text-xs font-semibold uppercase tracking-wider text-destructive">
              Access revoked
            </p>
            <h2 className="text-2xl font-bold tracking-tight text-foreground">
              Invitation was cancelled
            </h2>
            <p className="text-xs text-muted-foreground leading-relaxed">{state.message}</p>
          </div>
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3.5 text-xs text-foreground">
            This invitation was recalled by an administrator. If you believe this is in error,
            contact your team lead.
          </div>
          <Button
            variant="outline"
            render={<Link href="/login" />}
            nativeButton={false}
            className="w-full h-10"
          >
            Return to sign in
          </Button>
        </div>
      ) : null}

      {state.kind === 'invalid' ? (
        <div className="space-y-4">
          <div className="size-11 rounded-xl bg-destructive/15 text-destructive flex items-center justify-center border border-destructive/25">
            <AlertTriangle className="size-6" aria-hidden="true" />
          </div>
          <div className="space-y-1.5">
            <p className="text-xs font-semibold uppercase tracking-wider text-destructive">
              Invalid link
            </p>
            <h2 className="text-2xl font-bold tracking-tight text-foreground">
              Invitation not found
            </h2>
            <p className="text-xs text-muted-foreground leading-relaxed">{state.message}</p>
          </div>
          <Button
            variant="outline"
            render={<Link href="/login" />}
            nativeButton={false}
            className="w-full h-10"
          >
            Return to sign in
          </Button>
        </div>
      ) : null}

      {state.kind === 'form' ? (
        <>
          <div className="space-y-1.5">
            <div className="size-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center mb-3 border border-primary/20">
              <KeyRound className="size-5" aria-hidden="true" />
            </div>
            <p className="text-xs font-semibold uppercase tracking-wider text-primary">
              Accept access
            </p>
            <h2 className="text-2xl font-bold tracking-tight text-foreground">
              Activate your membership
            </h2>
            <p className="text-xs text-muted-foreground leading-relaxed">
              If this is your first Maevelle membership, create a password. Existing Maevelle users
              can leave both password fields blank.
            </p>
          </div>

          <form onSubmit={accept} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="password">New password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                minLength={12}
                maxLength={128}
                value={password}
                placeholder="At least 12 characters (optional if existing user)"
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="confirmation">Confirm new password</Label>
              <Input
                id="confirmation"
                type="password"
                autoComplete="new-password"
                minLength={12}
                maxLength={128}
                value={confirmation}
                placeholder="Re-enter password"
                onChange={(event) => setConfirmation(event.target.value)}
              />
            </div>

            <Button
              type="submit"
              disabled={submitting || !token}
              className="w-full h-10 mt-2 font-medium"
            >
              {submitting ? 'Activating…' : 'Accept invitation securely'}
            </Button>
          </form>

          {errorMessage ? (
            <div
              className="p-3 rounded-lg border border-destructive/30 bg-destructive/10 text-xs text-destructive font-medium"
              role="alert"
            >
              {errorMessage}
            </div>
          ) : null}
        </>
      ) : null}
    </AuthSplitShell>
  );
}

export default function AcceptInvitationPage() {
  return (
    <Suspense
      fallback={
        <AuthGateCard headerSlot={<AuthBrandMark subtitle="Workspace Invitation" />}>
          <p className="text-sm text-muted-foreground text-center py-4">Preparing invitation…</p>
        </AuthGateCard>
      }
    >
      <InvitationAcceptanceForm />
    </Suspense>
  );
}
