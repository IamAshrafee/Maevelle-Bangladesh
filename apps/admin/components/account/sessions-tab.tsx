'use client';

import * as React from 'react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  Globe,
  Info,
  Laptop,
  LogOut,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react';
import type { AccountSessionItemDto } from '@maevelle/contracts';
import { apiRequest } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { PagePanel, PageSection } from '@/components/ui/page-shell';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  formatDateTime,
  formatRelativeTime,
  getAccountErrorMessage,
  getDeviceCategoryIcon,
} from './account-utils';

interface SessionsTabProps {
  readonly sessions: readonly AccountSessionItemDto[];
  readonly loading: boolean;
  readonly onReload: () => Promise<void>;
}

export function SessionsTab({ sessions, loading, onReload }: SessionsTabProps) {
  const router = useRouter();

  // Revocation state
  const [revokingSessionId, setRevokingSessionId] = useState<string | null>(null);
  const [sessionToRevoke, setSessionToRevoke] = useState<AccountSessionItemDto | null>(null);
  const [revokeOthersDialogOpen, setRevokeOthersDialogOpen] = useState(false);
  const [revokingOthers, setRevokingOthers] = useState(false);
  const [signOutEverywhereDialogOpen, setSignOutEverywhereDialogOpen] = useState(false);
  const [signingOutEverywhere, setSigningOutEverywhere] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Single session revocation
  const handleConfirmRevokeSession = async () => {
    if (!sessionToRevoke) return;
    const targetId = sessionToRevoke.id;
    const targetLabel = sessionToRevoke.deviceLabel;
    setSessionToRevoke(null);
    setRevokingSessionId(targetId);
    setFeedback(null);

    try {
      await apiRequest(`/admin/account/sessions/${targetId}/revoke`, { method: 'POST' });
      setFeedback({ type: 'success', text: `Signed out session on ${targetLabel}.` });
      await onReload();
    } catch (err) {
      setFeedback({
        type: 'error',
        text: getAccountErrorMessage(err, 'Failed to sign out this session.'),
      });
      await onReload();
    } finally {
      setRevokingSessionId(null);
    }
  };

  // Sign out other sessions
  const handleConfirmRevokeOthers = async () => {
    setRevokeOthersDialogOpen(false);
    setRevokingOthers(true);
    setFeedback(null);

    try {
      await apiRequest('/admin/account/sessions/revoke-others', { method: 'POST' });
      setFeedback({
        type: 'success',
        text: 'All other active sessions and devices have been signed out.',
      });
      await onReload();
    } catch (err) {
      setFeedback({
        type: 'error',
        text: getAccountErrorMessage(err, 'Failed to sign out other sessions.'),
      });
    } finally {
      setRevokingOthers(false);
    }
  };

  // Sign out everywhere
  const handleConfirmSignOutEverywhere = async () => {
    setSignOutEverywhereDialogOpen(false);
    setSigningOutEverywhere(true);
    setFeedback(null);

    try {
      await apiRequest('/admin/account/sessions/revoke-all', { method: 'POST' });
      router.replace('/login');
    } catch (err) {
      setFeedback({
        type: 'error',
        text: getAccountErrorMessage(err, 'Failed to sign out everywhere. Please try again.'),
      });
      setSigningOutEverywhere(false);
    }
  };

  const otherSessionsCount = sessions.filter((s) => !s.isCurrent).length;

  return (
    <div className="space-y-6">
      <PageSection
        title="Active Login Sessions"
        description="Inspect browsers and devices currently signed in to your Maevelle account. Sign out unrecognized devices."
      >
        <PagePanel>
          {/* Action Header / Summary */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-5 border-b border-border">
            <div className="space-y-0.5">
              <span className="text-xs text-muted-foreground">
                Total active sessions:{' '}
                <strong className="text-foreground tabular-nums font-mono font-semibold">
                  {sessions.length}
                </strong>
              </span>
              <p className="text-[11px] text-muted-foreground">
                If you do not recognize a session, sign it out and consider changing your password.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={revokingOthers || otherSessionsCount === 0 || loading}
                onClick={() => setRevokeOthersDialogOpen(true)}
              >
                {revokingOthers ? (
                  <>
                    <RefreshCw className="size-3.5 mr-1.5 animate-spin" />
                    Signing out…
                  </>
                ) : (
                  'Sign out other devices'
                )}
              </Button>

              <Button
                type="button"
                variant="destructive"
                size="sm"
                disabled={signingOutEverywhere || loading}
                onClick={() => setSignOutEverywhereDialogOpen(true)}
              >
                {signingOutEverywhere ? (
                  <>
                    <RefreshCw className="size-3.5 mr-1.5 animate-spin" />
                    Signing out…
                  </>
                ) : (
                  'Sign out everywhere'
                )}
              </Button>
            </div>
          </div>

          {/* Feedback banner */}
          {feedback ? (
            <div
              role="status"
              className={`p-3 rounded-lg text-xs border my-4 ${
                feedback.type === 'success'
                  ? 'bg-success/10 border-success/30 text-success'
                  : 'bg-destructive/10 border-destructive/30 text-destructive'
              }`}
            >
              {feedback.text}
            </div>
          ) : null}

          {/* Sessions List */}
          {loading && sessions.length === 0 ? (
            <div className="py-10 text-center space-y-2">
              <RefreshCw className="size-5 text-primary animate-spin mx-auto" />
              <p className="text-xs text-muted-foreground">Loading active sessions…</p>
            </div>
          ) : sessions.length === 0 ? (
            <div className="py-8 text-center text-xs text-muted-foreground">
              No active sessions found.
            </div>
          ) : (
            <div className="divide-y divide-border/60">
              {sessions.map((session) => {
                const DeviceIcon = getDeviceCategoryIcon(
                  (session as unknown as { deviceCategory?: string }).deviceCategory,
                );
                const isRevoking = revokingSessionId === session.id;

                return (
                  <div
                    key={session.id}
                    className={`py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-colors ${
                      session.isCurrent ? 'bg-primary-subtle/30 -mx-4 px-4 rounded-lg' : ''
                    }`}
                  >
                    <div className="flex items-start gap-3.5 min-w-0">
                      <div
                        className={`p-2.5 rounded-xl shrink-0 mt-0.5 border ${
                          session.isCurrent
                            ? 'bg-primary/10 border-primary/25 text-primary'
                            : 'bg-muted border-border/70 text-muted-foreground'
                        }`}
                      >
                        <DeviceIcon className="size-5" aria-hidden="true" />
                      </div>

                      <div className="space-y-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <strong className="text-xs font-semibold text-foreground truncate max-w-xs">
                            {session.deviceLabel}
                          </strong>
                          {session.isCurrent ? (
                            <span className="text-[10px] font-semibold bg-primary/15 text-primary border border-primary/30 px-2 py-0.5 rounded-full">
                              This device
                            </span>
                          ) : null}
                        </div>

                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                          {session.ipAddress ? (
                            <span className="font-mono tabular-nums">
                              IP: {session.ipAddress}
                            </span>
                          ) : null}
                          <span className="tabular-nums">
                            Last active: {formatRelativeTime(session.lastActivityAt || session.createdAt)}
                          </span>
                          {session.createdAt ? (
                            <span className="tabular-nums hidden md:inline">
                              Signed in: {formatDateTime(session.createdAt)}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    {/* Action button */}
                    <div className="shrink-0 self-start sm:self-center pl-12 sm:pl-0">
                      {session.isCurrent ? (
                        <span className="text-[11px] text-muted-foreground italic select-none">
                          Current session
                        </span>
                      ) : (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={isRevoking || loading}
                          onClick={() => setSessionToRevoke(session)}
                          className="text-destructive hover:bg-destructive/10"
                        >
                          {isRevoking ? (
                            <>
                              <RefreshCw className="size-3 mr-1 animate-spin" />
                              Signing out…
                            </>
                          ) : (
                            'Sign out'
                          )}
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Guidance note */}
          <div className="mt-6 pt-4 border-t border-border/60 flex items-start gap-2.5 text-xs text-muted-foreground">
            <Info className="size-4 text-primary shrink-0 mt-0.5" aria-hidden="true" />
            <p>
              Session tokens are cryptographically signed and stored in HTTP-only cookies. Signing out a device immediately invalidates its token in secondary storage.
            </p>
          </div>
        </PagePanel>
      </PageSection>

      {/* Single Session Sign-Out Confirmation Dialog */}
      <AlertDialog
        open={Boolean(sessionToRevoke)}
        onOpenChange={(open) => {
          if (!open) setSessionToRevoke(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sign out this session?</AlertDialogTitle>
            <AlertDialogDescription>
              {sessionToRevoke?.deviceLabel} will be signed out and will need to authenticate again to access Maevelle.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void handleConfirmRevokeSession()}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
            >
              Sign out device
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Sign Out Other Sessions Confirmation Dialog */}
      <AlertDialog
        open={revokeOthersDialogOpen}
        onOpenChange={setRevokeOthersDialogOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sign out all other sessions?</AlertDialogTitle>
            <AlertDialogDescription>
              All other browsers and devices ({otherSessionsCount} {otherSessionsCount === 1 ? 'session' : 'sessions'}) will be signed out immediately. Your current browser will remain signed in.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleConfirmRevokeOthers()}>
              Sign out other devices
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Sign Out Everywhere Confirmation Dialog */}
      <AlertDialog
        open={signOutEverywhereDialogOpen}
        onOpenChange={setSignOutEverywhereDialogOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive flex items-center gap-2">
              <AlertTriangle className="size-5 shrink-0" />
              Sign out everywhere?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will sign out every active session across all devices, <strong>including this current browser</strong>. You will be redirected to the sign-in screen immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void handleConfirmSignOutEverywhere()}
              className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
            >
              Sign out everywhere
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
