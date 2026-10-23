'use client';

import { AlertTriangle, CheckCircle2, Database, History, Loader2, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';

import type { InstagramConnectionView, InstagramSyncView } from '@maevelle/contracts/messaging';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toast';
import * as api from './instagram-api';

const activeStatuses = new Set<InstagramSyncView['status']>(['PENDING', 'PROCESSING']);

interface InstagramSyncCardProps {
  connection: InstagramConnectionView;
  canManage: boolean;
  onRefreshConnection: () => Promise<void>;
}

export function InstagramSyncCard({
  connection,
  canManage,
  onRefreshConnection,
}: InstagramSyncCardProps) {
  const [sync, setSync] = useState<InstagramSyncView | null>(null);
  const [loading, setLoading] = useState(Boolean(connection.latestSyncId));
  const [starting, setStarting] = useState(false);
  const syncId = sync?.id;
  const syncStatus = sync?.status;

  useEffect(() => {
    if (!connection.latestSyncId) {
      setSync(null);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    void api
      .getInstagramSyncJob(connection.latestSyncId, controller.signal)
      .then(setSync)
      .catch(() => undefined)
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [connection.latestSyncId]);

  useEffect(() => {
    if (!syncId || !syncStatus || !activeStatuses.has(syncStatus)) return;
    const timer = setInterval(() => {
      void api
        .getInstagramSyncJob(syncId)
        .then((next) => {
          setSync(next);
          if (!activeStatuses.has(next.status)) void onRefreshConnection();
        })
        .catch(() => undefined);
    }, 3000);
    return () => clearInterval(timer);
  }, [onRefreshConnection, syncId, syncStatus]);

  async function startSync() {
    setStarting(true);
    try {
      const next = await api.createInstagramSyncJob(connection.id);
      setSync(next);
      toast.add({
        title: 'Instagram History Sync Started',
        description:
          'Messages are imported in the background without duplicating canonical history.',
        type: 'success',
      });
      await onRefreshConnection();
    } catch (cause) {
      toast.add({
        title: 'History Sync Could Not Start',
        description:
          cause instanceof Error ? cause.message : 'Review connection health and try again.',
        type: 'error',
      });
    } finally {
      setStarting(false);
    }
  }

  return (
    <section className="space-y-4 rounded-xl border border-border bg-card p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="flex items-center gap-2 font-semibold">
            <History className="size-4 text-primary" aria-hidden="true" /> Instagram Conversation
            History
          </h3>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted-foreground">
            Import conversations available through Meta’s Conversations API. Existing Maevelle
            messages are deduplicated, and imported history does not create false live-message
            alerts.
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => void startSync()}
          disabled={!canManage || starting || Boolean(sync && activeStatuses.has(sync.status))}
        >
          {starting || (sync && activeStatuses.has(sync.status)) ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <RefreshCw className="size-4" aria-hidden="true" />
          )}
          {sync && activeStatuses.has(sync.status)
            ? 'Syncing…'
            : sync
              ? 'Sync Again'
              : 'Start History Sync'}
        </Button>
      </div>

      <Alert className="border-info/40 bg-info/10">
        <AlertTriangle className="size-4 text-info" aria-hidden="true" />
        <AlertTitle>Provider Coverage Is Limited</AlertTitle>
        <AlertDescription>
          Meta may omit Requests inactive for more than 30 days and any history outside the
          account’s available API coverage. “Provider exhausted” means the API returned no more
          accessible pages—not that every native Instagram message was imported.
        </AlertDescription>
      </Alert>

      {loading ? (
        <p className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Loading synchronization
          status…
        </p>
      ) : sync ? (
        <div aria-live="polite" className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="font-mono">
              {sync.status}
            </Badge>
            <Badge variant="outline" className="font-mono">
              Coverage: {sync.coverageStatus}
            </Badge>
            {sync.status === 'COMPLETED' ? (
              <CheckCircle2 className="size-4 text-success" aria-label="Completed" />
            ) : null}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Metric label="Conversations" value={sync.importedConversations} />
            <Metric label="Messages Imported" value={sync.importedMessages} />
            <Metric label="Duplicates Skipped" value={sync.duplicateMessages} />
            <Metric label="Attachment Failures" value={sync.attachmentFailures} />
          </div>
          {sync.lastErrorCode ? (
            <p className="break-words rounded-lg bg-destructive/10 p-2 font-mono text-xs text-destructive">
              Latest sync error: {sync.lastErrorCode} · {sync.errorCount} recorded{' '}
              {sync.errorCount === 1 ? 'error' : 'errors'}
            </p>
          ) : null}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border p-6 text-center">
          <Database className="mx-auto size-7 text-muted-foreground" aria-hidden="true" />
          <p className="mt-2 text-sm font-medium">No Instagram History Sync Yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Live messages work independently of historical import.
          </p>
        </div>
      )}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-muted/20 p-3">
      <p className="font-mono text-lg font-semibold tabular-nums">{value}</p>
      <p className="text-[11px] text-muted-foreground">{label}</p>
    </div>
  );
}
