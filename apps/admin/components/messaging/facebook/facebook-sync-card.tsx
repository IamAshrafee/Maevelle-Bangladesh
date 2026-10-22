'use client';

import {
  AlertCircle,
  History,
  Loader2,
  Play,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import type { FacebookConnectionView, FacebookSyncView } from '@maevelle/contracts/messaging';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import * as api from './facebook-api';

export interface FacebookSyncCardProps {
  connection: FacebookConnectionView;
  onRefreshConnection: () => Promise<void>;
  canManage: boolean;
}

export function FacebookSyncCard({
  connection,
  onRefreshConnection,
  canManage,
}: FacebookSyncCardProps) {
  const [activeSync, setActiveSync] = useState<FacebookSyncView | null>(null);
  const [starting, setStarting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function stopPolling() {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }

  function pollSyncJob(syncId: string) {
    stopPolling();
    const fetchStatus = async () => {
      try {
        const job = await api.getFacebookSyncJob(syncId);
        setActiveSync(job);
        if (job.status === 'COMPLETED' || job.status === 'FAILED') {
          stopPolling();
          void onRefreshConnection();
        }
      } catch {
        // Continue polling until terminal
      }
    };
    void fetchStatus();
    pollTimerRef.current = setInterval(fetchStatus, 3000);
  }

  useEffect(() => {
    return () => stopPolling();
  }, []);

  async function handleStartSync() {
    if (!canManage) return;
    setStarting(true);
    setErrorMsg(null);
    try {
      const job = await api.createFacebookSyncJob(connection.id);
      setActiveSync(job);
      toast.add({
        title: 'Historical synchronization initiated',
        description: 'Background worker has queued historical conversation import.',
        type: 'success',
      });
      pollSyncJob(job.id);
      await onRefreshConnection();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to start historical synchronization.');
    } finally {
      setStarting(false);
    }
  }

  const isSyncActive = activeSync?.status === 'PENDING' || activeSync?.status === 'PROCESSING';

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <CardTitle className="text-base flex items-center gap-2">
              <History className="size-4 text-primary" />
              Historical Conversation Synchronization
            </CardTitle>
            <CardDescription className="text-xs">
              Import past Messenger customer threads from Meta into Maevelle&apos;s unified inbox.
            </CardDescription>
          </div>
          {canManage ? (
            <Button
              variant="outline"
              size="sm"
              disabled={starting || isSyncActive || connection.status === 'SUSPENDED' || connection.status === 'NEEDS_REAUTHORIZATION'}
              onClick={() => void handleStartSync()}
              className="gap-1.5 text-xs self-start sm:self-auto"
            >
              {starting ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : isSyncActive ? (
                <RefreshCw className="size-3.5 animate-spin text-primary" />
              ) : (
                <Play className="size-3.5" />
              )}
              {isSyncActive ? 'Sync in Progress…' : 'Start Historical Sync'}
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {errorMsg ? (
          <Alert variant="destructive">
            <AlertCircle className="size-4" />
            <AlertTitle>Synchronization Error</AlertTitle>
            <AlertDescription className="text-xs">{errorMsg}</AlertDescription>
          </Alert>
        ) : null}

        {/* Informational Guidance */}
        <div className="rounded-xl border border-border bg-card p-3.5 text-xs text-muted-foreground space-y-2">
          <div className="flex items-center gap-2 font-semibold text-foreground">
            <ShieldCheck className="size-4 text-primary shrink-0" />
            <span>Safe & Non-Destructive Data Preservation</span>
          </div>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <strong>Non-Destructive:</strong> Importing past conversations will <span className="font-semibold text-foreground">never delete or modify</span> messages on Facebook or Meta Business Suite.
            </li>
            <li>
              <strong>Original Provider Timestamps:</strong> Past messages retain their genuine historical timestamps, so a 1-year-old message will not appear as recent activity.
            </li>
            <li>
              <strong>No False Staff Notifications:</strong> Historical imports are processed with an archival flag, avoiding accidental alerts or staff assignment triggers.
            </li>
            <li>
              <strong>Meta Coverage Boundaries:</strong> Meta Graph API may limit historical depth, private attachments, or unsupported rich message formats. Coverage status reflects all data returned to Maevelle by Meta.
            </li>
          </ul>
        </div>

        {/* Sync Progress / Status Dashboard */}
        {activeSync ? (
          <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Sync Job Status
                </span>
                <Badge
                  variant="outline"
                  className={cn(
                    'text-[10px] font-mono',
                    activeSync.status === 'COMPLETED'
                      ? 'border-success/40 bg-success/10 text-success'
                      : activeSync.status === 'PROCESSING'
                        ? 'border-primary/40 bg-primary/10 text-primary'
                        : activeSync.status === 'FAILED'
                          ? 'border-destructive/40 bg-destructive/10 text-destructive'
                          : 'border-border bg-card',
                  )}
                >
                  {activeSync.status}
                </Badge>
                {activeSync.coverageStatus ? (
                  <Badge variant="secondary" className="text-[10px] font-mono">
                    Coverage: {activeSync.coverageStatus}
                  </Badge>
                ) : null}
              </div>

              {isSyncActive ? (
                <span className="flex items-center gap-1.5 text-xs text-primary font-medium">
                  <Loader2 className="size-3.5 animate-spin" />
                  Streaming historical pages…
                </span>
              ) : null}
            </div>

            {/* Metrics Counters */}
            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4 pt-1">
              <div className="rounded-lg border border-border bg-card p-2.5">
                <span className="text-[11px] text-muted-foreground block">Conversations Imported</span>
                <span className="text-lg font-bold font-mono tabular-nums text-foreground">
                  {activeSync.importedConversations}
                </span>
              </div>
              <div className="rounded-lg border border-border bg-card p-2.5">
                <span className="text-[11px] text-muted-foreground block">Messages Imported</span>
                <span className="text-lg font-bold font-mono tabular-nums text-foreground">
                  {activeSync.importedMessages}
                </span>
              </div>
              <div className="rounded-lg border border-border bg-card p-2.5">
                <span className="text-[11px] text-muted-foreground block">Duplicates Skipped</span>
                <span className="text-lg font-bold font-mono tabular-nums text-muted-foreground">
                  {activeSync.duplicateMessages}
                </span>
              </div>
              <div className="rounded-lg border border-border bg-card p-2.5">
                <span className="text-[11px] text-muted-foreground block">Attachment Failures</span>
                <span
                  className={cn(
                    'text-lg font-bold font-mono tabular-nums',
                    activeSync.attachmentFailures > 0 ? 'text-warning' : 'text-muted-foreground',
                  )}
                >
                  {activeSync.attachmentFailures}
                </span>
              </div>
            </div>

            {/* Timestamps */}
            <div className="flex flex-wrap items-center gap-4 text-[11px] text-muted-foreground font-mono tabular-nums pt-1">
              {activeSync.startedAt ? (
                <span>Started: {new Date(activeSync.startedAt).toLocaleTimeString()}</span>
              ) : null}
              {activeSync.lastSuccessfulAt ? (
                <span>Last Progress: {new Date(activeSync.lastSuccessfulAt).toLocaleTimeString()}</span>
              ) : null}
              {activeSync.completedAt ? (
                <span className="text-success font-medium">
                  Completed: {new Date(activeSync.completedAt).toLocaleTimeString()}
                </span>
              ) : null}
            </div>

            {activeSync.lastErrorCode ? (
              <div className="rounded-lg bg-destructive/10 p-2 text-xs text-destructive flex items-center gap-1.5">
                <AlertCircle className="size-3.5 shrink-0" />
                <span>Sync issue: {activeSync.lastErrorCode}</span>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-border bg-muted/10 p-6 text-center text-xs text-muted-foreground space-y-1">
            <History className="size-6 text-muted-foreground mx-auto mb-2 opacity-50" />
            <p className="font-medium text-foreground">No sync job running</p>
            <p>
              Click &quot;Start Historical Sync&quot; above to import existing customer conversations from Meta into your Maevelle inbox.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
