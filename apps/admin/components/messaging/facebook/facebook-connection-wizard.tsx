'use client';

import {
  AlertCircle,
  ArrowRight,
  Check,
  CheckCircle2,
  ExternalLink,
  Facebook,
  Loader2,
  Search,
  ShieldCheck,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import type {
  FacebookConnectionView,
  FacebookIntegrationAvailability,
  FacebookOAuthStatusView,
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
import * as api from './facebook-api';

type WizardStep = 'intro' | 'oauth_pending' | 'select_page' | 'connecting' | 'success';

export interface FacebookConnectionWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialAttemptId?: string | null;
  onConnected: (connection: FacebookConnectionView) => void;
}

export function FacebookConnectionWizard({
  open,
  onOpenChange,
  initialAttemptId,
  onConnected,
}: FacebookConnectionWizardProps) {
  const [step, setStep] = useState<WizardStep>(initialAttemptId ? 'select_page' : 'intro');
  const [availability, setAvailability] = useState<FacebookIntegrationAvailability | null>(null);
  const [loadingAvailability, setLoadingAvailability] = useState(false);
  const [attemptId, setAttemptId] = useState<string | null>(initialAttemptId ?? null);
  const [authUrl, setAuthUrl] = useState<string | null>(null);
  const [oauthStatus, setOauthStatus] = useState<FacebookOAuthStatusView | null>(null);
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);
  const [pageSearch, setPageSearch] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [connectedView, setConnectedView] = useState<FacebookConnectionView | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load availability on open
  useEffect(() => {
    if (!open) {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      return;
    }
    setLoadingAvailability(true);
    setErrorMsg(null);
    api
      .getFacebookAvailability()
      .then((data) => {
        setAvailability(data);
      })
      .catch((err) => {
        setErrorMsg(err instanceof Error ? err.message : 'Failed to check Facebook integration readiness.');
      })
      .finally(() => {
        setLoadingAvailability(false);
      });
  }, [open]);

  // Handle initial attempt ID from redirect
  useEffect(() => {
    if (initialAttemptId && open) {
      setAttemptId(initialAttemptId);
      setStep('select_page');
      pollAttempt(initialAttemptId);
    }
  }, [initialAttemptId, open]);

  function stopPolling() {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }

  function pollAttempt(id: string) {
    stopPolling();
    const check = async () => {
      try {
        const status = await api.getFacebookOAuthStatus(id);
        setOauthStatus(status);
        if (status.status === 'AUTHORIZED') {
          stopPolling();
          setStep('select_page');
          const firstEligible = status.pages.find((p) => p.isEligible);
          if (firstEligible) setSelectedPageId(firstEligible.pageId);
        } else if (status.status === 'FAILED' || status.status === 'EXPIRED') {
          stopPolling();
          setErrorMsg(
            status.errorCode === 'META_AUTHORIZATION_DENIED'
              ? 'Facebook authorization was cancelled or denied.'
              : status.status === 'EXPIRED'
                ? 'The authorization session expired. Please start over.'
                : 'Facebook authorization could not be completed.',
          );
          setStep('intro');
        }
      } catch {
        // Continue polling unless explicit terminal error
      }
    };
    void check();
    pollTimerRef.current = setInterval(check, 2500);
  }

  useEffect(() => {
    return () => stopPolling();
  }, []);

  async function handleStartOAuth() {
    setErrorMsg(null);
    try {
      const start = await api.startFacebookOAuth();
      setAttemptId(start.attemptId);
      setAuthUrl(start.authorizationUrl);
      setStep('oauth_pending');

      // Attempt to open popup
      const width = 640;
      const height = 720;
      const left = window.screenX + (window.outerWidth - width) / 2;
      const top = window.screenY + (window.outerHeight - height) / 2;
      const popup = window.open(
        start.authorizationUrl,
        'meta_oauth_window',
        `width=${width},height=${height},left=${left},top=${top},scrollbars=yes,status=no`,
      );

      // Start polling status
      pollAttempt(start.attemptId);

      if (!popup || popup.closed || typeof popup.closed === 'undefined') {
        toast.add({
          title: 'Popup blocked by browser',
          description: 'Please click "Open Meta Authorization" below to continue in a new window.',
          type: 'warning',
        });
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not initiate Facebook authorization.');
    }
  }

  async function handleFinalizeConnection() {
    if (!attemptId || !selectedPageId) return;
    setConnecting(true);
    setErrorMsg(null);
    try {
      const result = await api.connectFacebookPage({
        attemptId,
        pageId: selectedPageId,
      });
      setConnectedView(result);
      setStep('success');
      onConnected(result);
      toast.add({
        title: 'Facebook Page connected successfully',
        description: `Connected "${result.pageName}".`,
        type: 'success',
      });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to finalize Facebook Page connection.');
    } finally {
      setConnecting(false);
    }
  }

  function handleClose() {
    stopPolling();
    setStep('intro');
    setAttemptId(null);
    setOauthStatus(null);
    setSelectedPageId(null);
    setErrorMsg(null);
    onOpenChange(false);
  }

  const eligiblePages = oauthStatus?.pages ?? [];
  const filteredPages = eligiblePages.filter((p) => {
    if (!pageSearch.trim()) return true;
    const q = pageSearch.toLowerCase();
    return p.name.toLowerCase().includes(q) || p.pageId.includes(q);
  });

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-h-[92dvh] w-full max-w-xl overflow-y-auto sm:max-h-[85dvh]">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-lg bg-[#1877f2]/10 text-[#1877f2]">
              <Facebook className="size-5" />
            </div>
            <div>
              <DialogTitle>Connect Facebook Messenger</DialogTitle>
              <DialogDescription>
                Integrate your official business Facebook Page inbox with Maevelle.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {errorMsg ? (
          <Alert variant="destructive" className="my-2">
            <AlertCircle className="size-4" />
            <AlertTitle>Connection Notice</AlertTitle>
            <AlertDescription className="text-xs">{errorMsg}</AlertDescription>
          </Alert>
        ) : null}

        {/* STEP 1: INTRO & SCOPE */}
        {step === 'intro' ? (
          <div className="space-y-4 py-2">
            <div className="rounded-xl border border-border bg-card p-4 space-y-3">
              <h4 className="text-sm font-semibold flex items-center gap-2 text-foreground">
                <ShieldCheck className="size-4 text-primary" />
                Business Asset & Privacy Protection
              </h4>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Maevelle integrates directly with Meta&apos;s official Graph API for business Pages. Connecting will grant permission to manage customer Messenger conversations sent to your Page.
              </p>
              <ul className="text-xs text-muted-foreground space-y-1.5 pl-4 list-disc">
                <li>
                  <strong className="text-foreground">Business Page Only:</strong> Your personal Facebook profile, private messages, and personal feed will <span className="font-semibold text-foreground">never</span> be accessed or imported.
                </li>
                <li>
                  <strong className="text-foreground">Portfolio Safety:</strong> Existing Instagram accounts, WhatsApp Business numbers, and Meta Ad accounts are strictly protected and remain unaffected.
                </li>
                <li>
                  <strong className="text-foreground">Official Security:</strong> OAuth credentials and Page access tokens are encrypted securely on the server with AES-256-GCM.
                </li>
              </ul>
            </div>

            {loadingAvailability ? (
              <div className="flex items-center justify-center py-6 gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin text-primary" />
                Checking Meta integration readiness…
              </div>
            ) : availability && !availability.configured ? (
              <Alert className="border-warning/40 bg-warning/10 text-foreground">
                <AlertCircle className="size-4 text-warning" />
                <AlertTitle>Meta Configuration Incomplete</AlertTitle>
                <AlertDescription className="text-xs space-y-1">
                  <p>
                    The backend Meta App credentials or webhook verify token are not configured yet on this server.
                  </p>
                  <p className="font-mono text-[11px] text-muted-foreground">
                    Required environment variables: META_APP_ID, META_APP_SECRET, META_GRAPH_API_VERSION, META_WEBHOOK_VERIFY_TOKEN, META_OAUTH_CALLBACK_URL.
                  </p>
                </AlertDescription>
              </Alert>
            ) : availability?.configured ? (
              <div className="rounded-xl border border-border bg-muted/30 p-3 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-muted-foreground">Meta Graph API Version:</span>
                  <Badge variant="outline" className="font-mono tabular-nums text-[11px]">
                    {availability.graphApiVersion ?? 'Latest'}
                  </Badge>
                </div>
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  <span className="font-medium text-muted-foreground mr-1">Required Scopes:</span>
                  {availability.requiredScopes.map((scope) => (
                    <Badge key={scope} variant="secondary" className="font-mono text-[10px]">
                      {scope}
                    </Badge>
                  ))}
                </div>
              </div>
            ) : null}

            <DialogFooter className="mt-4 gap-2 sm:gap-0">
              <Button variant="ghost" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                disabled={loadingAvailability || (availability !== null && !availability.configured)}
                onClick={() => void handleStartOAuth()}
                className="gap-2"
              >
                <Facebook className="size-4" />
                Continue to Facebook Login
                <ArrowRight className="size-3.5" />
              </Button>
            </DialogFooter>
          </div>
        ) : null}

        {/* STEP 2: OAUTH PENDING */}
        {step === 'oauth_pending' ? (
          <div className="space-y-4 py-6 text-center">
            <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Loader2 className="size-6 animate-spin" />
            </div>
            <div>
              <h4 className="text-base font-semibold">Authorizing with Facebook</h4>
              <p className="mt-1 text-xs text-muted-foreground max-w-sm mx-auto">
                Please complete the login and Page selection in the Meta popup window. This dialog will update automatically once authorized.
              </p>
            </div>

            {authUrl ? (
              <div className="pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  render={<a href={authUrl} target="_blank" rel="noopener noreferrer" />}
                  className="gap-1.5 text-xs"
                >
                  <ExternalLink className="size-3.5" />
                  Open Meta Authorization Window
                </Button>
              </div>
            ) : null}

            <div className="rounded-xl border border-border bg-card p-3 text-left text-xs text-muted-foreground">
              <p className="font-medium text-foreground mb-1">In the Meta dialog:</p>
              <ol className="list-decimal pl-4 space-y-1">
                <li>Log in to the Facebook account managing your business Page.</li>
                <li>Select the business Facebook Page you wish to connect.</li>
                <li>Ensure all requested permissions (Show list of Pages, Manage metadata, Send messages) are granted.</li>
              </ol>
            </div>

            <DialogFooter className="mt-4">
              <Button variant="ghost" onClick={handleClose}>
                Cancel Attempt
              </Button>
            </DialogFooter>
          </div>
        ) : null}

        {/* STEP 3: PAGE DISCOVERY & SELECTION */}
        {step === 'select_page' ? (
          <div className="space-y-4 py-2">
            <div>
              <h4 className="text-sm font-semibold">Select a Facebook Page to Connect</h4>
              <p className="text-xs text-muted-foreground">
                Choose the business Page whose Messenger customer chats will be managed in Maevelle.
              </p>
            </div>

            {eligiblePages.length > 2 ? (
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
                <Input
                  value={pageSearch}
                  onChange={(e) => setPageSearch(e.target.value)}
                  placeholder="Filter pages by name or ID…"
                  className="pl-8 text-xs"
                />
              </div>
            ) : null}

            <div className="max-h-64 space-y-2.5 overflow-y-auto pr-1">
              {filteredPages.map((page) => {
                const isSelected = selectedPageId === page.pageId;
                const canSelect = page.isEligible;

                return (
                  <div
                    key={page.pageId}
                    onClick={() => {
                      if (canSelect) setSelectedPageId(page.pageId);
                    }}
                    className={cn(
                      'relative flex flex-col gap-2 rounded-xl border p-3 text-left transition-colors duration-150',
                      !canSelect && 'opacity-60 cursor-not-allowed bg-muted/20 border-border',
                      canSelect && isSelected
                        ? 'border-primary bg-primary-subtle ring-1 ring-primary'
                        : canSelect && 'cursor-pointer border-border hover:bg-muted/40',
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm truncate text-foreground">
                            {page.name}
                          </span>
                          {page.category ? (
                            <Badge variant="outline" className="text-[10px]">
                              {page.category}
                            </Badge>
                          ) : null}
                        </div>
                        <p className="font-mono text-[11px] tabular-nums text-muted-foreground mt-0.5">
                          Page ID: {page.pageId}
                        </p>
                      </div>
                      <div>
                        {canSelect ? (
                          <div
                            className={cn(
                              'flex size-5 items-center justify-center rounded-full border',
                              isSelected
                                ? 'border-primary bg-primary text-primary-foreground'
                                : 'border-border bg-card',
                            )}
                          >
                            {isSelected ? <Check className="size-3" /> : null}
                          </div>
                        ) : (
                          <Badge variant="destructive" className="text-[10px]">
                            Ineligible
                          </Badge>
                        )}
                      </div>
                    </div>

                    {/* Ineligibility reasons */}
                    {!canSelect && page.ineligibilityReasons?.length ? (
                      <div className="rounded-lg bg-destructive/10 p-2 text-[11px] text-destructive">
                        <p className="font-medium">Why is this Page ineligible?</p>
                        <ul className="list-disc pl-4 mt-0.5 space-y-0.5">
                          {page.ineligibilityReasons.map((r, i) => (
                            <li key={i}>{r}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}

                    {/* Page tasks */}
                    {page.tasks?.length ? (
                      <div className="flex flex-wrap gap-1 items-center text-[10px] text-muted-foreground">
                        <span>Tasks:</span>
                        {page.tasks.map((task) => (
                          <Badge key={task} variant="secondary" className="px-1 py-0 text-[9px] font-mono">
                            {task}
                          </Badge>
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              })}

              {!filteredPages.length ? (
                <div className="rounded-xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
                  No eligible Facebook Pages found matching your criteria.
                </div>
              ) : null}
            </div>

            <DialogFooter className="mt-4 gap-2 sm:gap-0">
              <Button variant="ghost" onClick={handleClose}>
                Cancel
              </Button>
              <Button
                disabled={!selectedPageId || connecting}
                onClick={() => void handleFinalizeConnection()}
                className="gap-2"
              >
                {connecting ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                Confirm and Connect Page
              </Button>
            </DialogFooter>
          </div>
        ) : null}

        {/* STEP 4: SUCCESS */}
        {step === 'success' && connectedView ? (
          <div className="space-y-4 py-4 text-center">
            <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-success/10 text-success">
              <CheckCircle2 className="size-7" />
            </div>
            <div>
              <h4 className="text-base font-semibold">Facebook Page Connected</h4>
              <p className="mt-1 text-xs text-muted-foreground max-w-sm mx-auto">
                <strong className="text-foreground">{connectedView.pageName}</strong> (ID: {connectedView.pageId}) is now connected.
              </p>
            </div>

            <div className="rounded-xl border border-border bg-card p-3 text-left space-y-2 text-xs">
              <p className="font-medium text-foreground">Recommended Next Steps:</p>
              <ul className="list-disc pl-4 space-y-1.5 text-muted-foreground">
                <li>
                  <strong className="text-foreground">Review Conversation Routing:</strong> Inspect Meta Business Suite coexistence to ensure webhooks route to Maevelle without conflicting with third-party bots.
                </li>
                <li>
                  <strong className="text-foreground">Verify Inbound Messages:</strong> Send a test message from a personal Facebook account to verify live receipt in Maevelle inbox.
                </li>
                <li>
                  <strong className="text-foreground">Historical Sync:</strong> Optionally import recent historical Messenger conversations into the unified inbox.
                </li>
              </ul>
            </div>

            <DialogFooter className="mt-4">
              <Button onClick={handleClose} className="w-full">
                Done & View Connection
              </Button>
            </DialogFooter>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
