'use client';

import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  Instagram,
  Loader2,
  Search,
  ShieldCheck,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import type {
  InstagramConnectionView,
  InstagramIntegrationAvailability,
  InstagramOAuthStatusView,
} from '@maevelle/contracts/messaging';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
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
import { toast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import * as api from './instagram-api';

type WizardStep = 'intro' | 'authorizing' | 'select' | 'confirm' | 'success';

interface InstagramConnectionWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialAttemptId: string | null;
  onConnected: (connection: InstagramConnectionView) => void;
}

export function InstagramConnectionWizard({
  open,
  onOpenChange,
  initialAttemptId,
  onConnected,
}: InstagramConnectionWizardProps) {
  const [step, setStep] = useState<WizardStep>('intro');
  const [availability, setAvailability] = useState<InstagramIntegrationAvailability | null>(null);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [authorizationUrl, setAuthorizationUrl] = useState<string | null>(null);
  const [oauth, setOauth] = useState<InstagramOAuthStatusView | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  }, []);

  const poll = useCallback(
    (id: string) => {
      stopPolling();
      const check = async () => {
        try {
          const status = await api.getInstagramOAuthStatus(id);
          setOauth(status);
          if (status.status === 'AUTHORIZED') {
            stopPolling();
            setStep('select');
            const eligible = status.accounts.filter((account) => account.isEligible);
            setSelectedId(eligible.length === 1 ? eligible[0]!.instagramAccountId : null);
          } else if (['FAILED', 'EXPIRED', 'CONSUMED'].includes(status.status)) {
            stopPolling();
            setStep('intro');
            setError(
              status.status === 'EXPIRED'
                ? 'This authorization session expired. Start a new connection attempt.'
                : status.errorCode === 'META_AUTHORIZATION_DENIED'
                  ? 'Meta authorization was cancelled or denied.'
                  : 'This authorization attempt can no longer be used. Start again.',
            );
          }
        } catch {
          // A transient poll failure is retried while the short-lived attempt remains active.
        }
      };
      void check();
      timer.current = setInterval(check, 2500);
    },
    [stopPolling],
  );

  useEffect(() => () => stopPolling(), [stopPolling]);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setBusy(true);
    setError(null);
    void api
      .getInstagramAvailability(controller.signal)
      .then(setAvailability)
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === 'AbortError') return;
        setError(
          cause instanceof Error
            ? cause.message
            : 'Instagram setup availability could not be checked.',
        );
      })
      .finally(() => setBusy(false));
    return () => controller.abort();
  }, [open]);

  useEffect(() => {
    if (!open || !initialAttemptId) return;
    setAttemptId(initialAttemptId);
    setStep('authorizing');
    poll(initialAttemptId);
  }, [initialAttemptId, open, poll]);

  function resetAndClose() {
    stopPolling();
    setStep('intro');
    setAttemptId(null);
    setAuthorizationUrl(null);
    setOauth(null);
    setSelectedId(null);
    setQuery('');
    setError(null);
    onOpenChange(false);
  }

  async function startAuthorization() {
    setBusy(true);
    setError(null);
    try {
      const start = await api.startInstagramOAuth();
      setAttemptId(start.attemptId);
      setAuthorizationUrl(start.authorizationUrl);
      setStep('authorizing');
      const width = 640;
      const height = 720;
      const popup = window.open(
        start.authorizationUrl,
        'instagram_meta_oauth',
        `width=${width},height=${height},left=${window.screenX + (window.outerWidth - width) / 2},top=${window.screenY + (window.outerHeight - height) / 2},scrollbars=yes,status=no`,
      );
      poll(start.attemptId);
      if (!popup) {
        toast.add({
          title: 'Authorization Window Blocked',
          description: 'Use “Open Meta Authorization” to continue in a new window.',
          type: 'warning',
        });
      }
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Instagram authorization could not be started.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function connect() {
    if (!attemptId || !selectedId) return;
    setBusy(true);
    setError(null);
    try {
      const connection = await api.connectInstagramAccount({
        attemptId,
        instagramAccountId: selectedId,
      });
      onConnected(connection);
      setStep('success');
      toast.add({
        title: 'Instagram Professional Account Connected',
        description: `${connection.username ? `@${connection.username}` : connection.displayName} is ready for health checks.`,
        type: 'success',
      });
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'The selected account could not be connected.',
      );
    } finally {
      setBusy(false);
    }
  }

  const accounts = (oauth?.accounts ?? []).filter((account) => {
    const needle = query.trim().toLowerCase();
    if (!needle) return true;
    return [account.displayName, account.username, account.pageName, account.instagramAccountId]
      .filter(Boolean)
      .some((value) => value!.toLowerCase().includes(needle));
  });
  const selectedAccount = oauth?.accounts.find(
    (account) => account.instagramAccountId === selectedId,
  );

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : resetAndClose())}>
      <DialogContent className="max-h-[100dvh] w-full overflow-y-auto overscroll-contain sm:max-h-[90dvh] sm:max-w-2xl">
        <DialogHeader>
          <div className="flex items-start gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary-subtle text-primary">
              <Instagram className="size-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="text-pretty">Connect Instagram Direct</DialogTitle>
              <DialogDescription>
                Connect a Business or Creator professional account through official Meta
                authorization.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div aria-live="polite">
          {error ? (
            <Alert variant="destructive">
              <AlertCircle className="size-4" aria-hidden="true" />
              <AlertTitle>Connection Needs Attention</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
        </div>

        {step === 'intro' ? (
          <div className="space-y-4">
            <section className="space-y-3 rounded-xl border border-border bg-card p-4">
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <ShieldCheck className="size-4 text-primary" aria-hidden="true" />
                What Maevelle Will Access
              </h3>
              <ul className="list-disc space-y-2 pl-5 text-xs leading-relaxed text-muted-foreground">
                <li>The selected professional account’s customer Direct Messages.</li>
                <li>The linked Facebook Page identity required by this authorization model.</li>
                <li>
                  Only the permissions listed below—never an Instagram password or personal inbox.
                </li>
                <li>
                  Existing Instagram history is preserved; Facebook, WhatsApp, ads, and asset
                  ownership are not changed.
                </li>
              </ul>
            </section>

            {busy && !availability ? (
              <p className="flex items-center justify-center gap-2 py-5 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Checking
                configuration…
              </p>
            ) : availability ? (
              <section className="space-y-3 rounded-xl border border-border bg-muted/30 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="font-medium">Facebook Login via Meta</span>
                  <Badge variant="outline" className="font-mono tabular-nums">
                    Graph {availability.graphApiVersion ?? 'not configured'}
                  </Badge>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {availability.requiredScopes.map((scope) => (
                    <Badge key={scope} variant="secondary" className="font-mono text-[10px]">
                      {scope}
                    </Badge>
                  ))}
                </div>
                {!availability.configured ? (
                  <Alert className="border-warning/40 bg-warning/10">
                    <AlertCircle className="size-4 text-warning" aria-hidden="true" />
                    <AlertTitle>Server Configuration Required</AlertTitle>
                    <AlertDescription>
                      Configure the Instagram Meta app credentials, callback, webhook token, and
                      Graph version before authorizing an account.
                    </AlertDescription>
                  </Alert>
                ) : null}
              </section>
            ) : null}

            <DialogFooter>
              <Button variant="ghost" onClick={resetAndClose}>
                Cancel
              </Button>
              <Button
                onClick={() => void startAuthorization()}
                disabled={busy || !availability?.configured}
              >
                Continue to Meta <ArrowRight className="size-4" aria-hidden="true" />
              </Button>
            </DialogFooter>
          </div>
        ) : null}

        {step === 'authorizing' ? (
          <div className="space-y-5 py-5 text-center">
            <Loader2 className="mx-auto size-9 animate-spin text-primary" aria-hidden="true" />
            <div>
              <h3 className="font-semibold">Complete Authorization With Meta</h3>
              <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
                Choose the Facebook account that administers the linked Page. This screen updates
                when Meta returns the eligible Instagram accounts.
              </p>
            </div>
            {authorizationUrl ? (
              <Button
                variant="outline"
                render={<a href={authorizationUrl} target="_blank" rel="noopener noreferrer" />}
              >
                <ExternalLink className="size-4" aria-hidden="true" /> Open Meta Authorization
              </Button>
            ) : null}
            <Button variant="ghost" onClick={resetAndClose}>
              Cancel Attempt
            </Button>
          </div>
        ) : null}

        {step === 'select' ? (
          <div className="space-y-4">
            <div>
              <h3 className="font-semibold">Select the Instagram Professional Account</h3>
              <p className="text-xs text-muted-foreground">
                Confirm the Instagram identity and its linked Facebook Page before connecting.
              </p>
            </div>
            {(oauth?.accounts.length ?? 0) > 2 ? (
              <label className="relative block">
                <span className="sr-only">Filter eligible accounts</span>
                <Search
                  className="absolute top-2.5 left-3 size-4 text-muted-foreground"
                  aria-hidden="true"
                />
                <Input
                  name="instagram-account-filter"
                  autoComplete="off"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Filter by account, Page, or ID…"
                  className="pl-9"
                />
              </label>
            ) : null}
            <div className="max-h-80 space-y-2 overflow-y-auto overscroll-contain pr-1">
              {accounts.map((account) => (
                <label
                  key={account.instagramAccountId}
                  className={cn(
                    'flex min-h-20 cursor-pointer items-start gap-3 rounded-xl border border-border p-3 transition-colors duration-150 hover:bg-muted/50',
                    selectedId === account.instagramAccountId &&
                      'border-primary bg-primary-subtle ring-1 ring-primary',
                    !account.isEligible && 'cursor-not-allowed opacity-60',
                  )}
                >
                  <input
                    type="radio"
                    name="instagram-account"
                    className="mt-1 accent-primary"
                    checked={selectedId === account.instagramAccountId}
                    disabled={!account.isEligible}
                    onChange={() => setSelectedId(account.instagramAccountId)}
                  />
                  {account.profilePictureUrl ? (
                    <img
                      src={account.profilePictureUrl}
                      alt=""
                      width={40}
                      height={40}
                      loading="lazy"
                      className="size-10 rounded-full border border-border object-cover"
                    />
                  ) : (
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-subtle text-primary">
                      <Instagram className="size-5" aria-hidden="true" />
                    </div>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-semibold">{account.displayName}</span>
                      {account.accountType ? (
                        <Badge variant="outline">{account.accountType}</Badge>
                      ) : null}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {account.username ? `@${account.username} · ` : ''}Linked Page:{' '}
                      {account.pageName}
                    </span>
                    <span className="block font-mono text-[10px] tabular-nums text-muted-foreground">
                      Instagram ID {account.instagramAccountId} · Page ID {account.pageId}
                    </span>
                    {!account.isEligible ? (
                      <span className="mt-1 block text-xs text-destructive">
                        {account.ineligibilityReasons.join(' · ')}
                      </span>
                    ) : null}
                  </span>
                </label>
              ))}
              {!accounts.length ? (
                <Alert className="border-warning/40 bg-warning/10">
                  <AlertCircle className="size-4 text-warning" aria-hidden="true" />
                  <AlertTitle>No Matching Professional Account</AlertTitle>
                  <AlertDescription>
                    Confirm that the Instagram Business or Creator account is linked to an
                    authorized Facebook Page and that all requested permissions were granted.
                  </AlertDescription>
                </Alert>
              ) : null}
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={resetAndClose}>
                Cancel
              </Button>
              <Button onClick={() => setStep('confirm')} disabled={!selectedId}>
                Review Connection <ArrowRight className="size-4" aria-hidden="true" />
              </Button>
            </DialogFooter>
          </div>
        ) : null}

        {step === 'confirm' && selectedAccount ? (
          <div className="space-y-4">
            <div>
              <h3 className="font-semibold">Confirm the Business Assets</h3>
              <p className="text-xs text-muted-foreground">
                Maevelle will connect this exact professional account and linked Page for customer
                Direct Messages.
              </p>
            </div>
            <dl className="grid gap-3 rounded-xl border border-border bg-card p-4 text-xs sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">Instagram Account</dt>
                <dd className="mt-1 font-semibold">
                  {selectedAccount.username
                    ? `@${selectedAccount.username}`
                    : selectedAccount.displayName}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Account Type</dt>
                <dd className="mt-1 font-semibold">
                  {selectedAccount.accountType ?? 'Professional account'}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Linked Facebook Page</dt>
                <dd className="mt-1 font-semibold">{selectedAccount.pageName}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Page Messaging Task</dt>
                <dd className="mt-1 font-semibold">
                  {selectedAccount.pageTasks.includes('MESSAGING') ? 'Granted' : 'Missing'}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-muted-foreground">Provider IDs</dt>
                <dd className="mt-1 break-words font-mono tabular-nums">
                  Instagram {selectedAccount.instagramAccountId} · Page {selectedAccount.pageId}
                </dd>
              </div>
            </dl>
            <Alert className="border-info/40 bg-info/10">
              <ShieldCheck className="size-4 text-info" aria-hidden="true" />
              <AlertTitle>Connection Scope</AlertTitle>
              <AlertDescription>
                Maevelle stores the selected Page credential encrypted, subscribes the Instagram
                account to supported messaging webhooks, and preserves native Instagram history.
                This does not disconnect Facebook Messenger or modify WhatsApp, ads, or business
                ownership.
              </AlertDescription>
            </Alert>
            <div className="flex flex-wrap gap-1.5">
              {selectedAccount.grantedScopes.map((scope) => (
                <Badge key={scope} variant="secondary" className="font-mono text-[10px]">
                  {scope}
                </Badge>
              ))}
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setStep('select')} disabled={busy}>
                Back
              </Button>
              <Button onClick={() => void connect()} disabled={busy}>
                {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
                Confirm & Connect
              </Button>
            </DialogFooter>
          </div>
        ) : null}

        {step === 'success' ? (
          <div className="space-y-4 py-5 text-center">
            <CheckCircle2 className="mx-auto size-11 text-success" aria-hidden="true" />
            <div>
              <h3 className="font-semibold">Instagram Account Connected</h3>
              <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
                Run diagnostics, confirm Meta permission approval, then use a controlled customer
                message to verify inbound and outbound delivery.
              </p>
            </div>
            <Button onClick={resetAndClose}>View Connection Health</Button>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
