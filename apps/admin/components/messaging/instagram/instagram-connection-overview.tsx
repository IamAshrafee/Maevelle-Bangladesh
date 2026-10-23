'use client';

import {
  Activity,
  AlertTriangle,
  Check,
  History,
  Instagram,
  Lock,
  Pause,
  Play,
  RotateCw,
  Trash2,
  Wifi,
} from 'lucide-react';
import { useState } from 'react';

import type { InstagramConnectionView } from '@maevelle/contracts/messaging';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import * as api from './instagram-api';
import { formatInstagramBlocker, getInstagramStatusInfo } from './instagram-types';

interface InstagramConnectionOverviewProps {
  connection: InstagramConnectionView;
  canManage: boolean;
  onRefresh: () => Promise<void>;
  onReauthorize: () => void;
  onOpenSync: () => void;
  onRequestDisconnect: () => void;
}

export function InstagramConnectionOverview({
  connection,
  canManage,
  onRefresh,
  onReauthorize,
  onOpenSync,
  onRequestDisconnect,
}: InstagramConnectionOverviewProps) {
  const [busyAction, setBusyAction] = useState<'suspend' | 'diagnostics' | null>(null);
  const status = getInstagramStatusInfo(connection.status);
  const suspended = connection.status === 'SUSPENDED';

  async function toggleSuspension() {
    setBusyAction('suspend');
    try {
      await api.updateInstagramConnection(connection.id, connection.version, {
        suspended: !suspended,
      });
      toast.add({
        title: suspended ? 'Instagram Messaging Restored' : 'Instagram Messaging Suspended',
        description: suspended
          ? 'Eligible Instagram conversations may be processed again.'
          : 'Provider credentials and conversation history remain preserved.',
        type: 'success',
      });
      await onRefresh();
    } catch (cause) {
      toast.add({
        title: 'Connection State Was Not Changed',
        description:
          cause instanceof Error
            ? cause.message
            : 'Reload the latest connection state and try again.',
        type: 'error',
      });
      await onRefresh();
    } finally {
      setBusyAction(null);
    }
  }

  async function runDiagnostics() {
    setBusyAction('diagnostics');
    try {
      await api.triggerInstagramDiagnostics(connection.id);
      toast.add({
        title: 'Instagram Diagnostics Completed',
        description: 'Meta account identity and webhook subscription were checked.',
        type: 'success',
      });
    } catch (cause) {
      toast.add({
        title: 'Instagram Diagnostics Found a Problem',
        description:
          cause instanceof Error
            ? cause.message
            : 'Review the connection details and reauthorize if needed.',
        type: 'error',
      });
    } finally {
      await onRefresh();
      setBusyAction(null);
    }
  }

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-border bg-card p-4 shadow-2xs sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary-subtle text-primary">
              <Instagram className="size-6" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="truncate text-lg font-bold tracking-tight">
                  {connection.username ? `@${connection.username}` : connection.displayName}
                </h3>
                <Badge
                  variant={status.tone === 'destructive' ? 'destructive' : 'outline'}
                  className={cn(
                    status.tone === 'success' && 'border-success/40 bg-success/10 text-success',
                    status.tone === 'warning' && 'border-warning/40 bg-warning/10 text-warning',
                  )}
                >
                  {status.label}
                </Badge>
                <Badge
                  variant="outline"
                  className={cn(
                    connection.readiness.isOperational
                      ? 'border-success/40 bg-success/10 text-success'
                      : 'border-warning/40 bg-warning/10 text-warning',
                  )}
                >
                  {connection.readiness.isOperational ? (
                    <Check className="size-3" />
                  ) : (
                    <AlertTriangle className="size-3" />
                  )}
                  {connection.readiness.isOperational ? 'Operational' : 'Setup Pending'}
                </Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {connection.displayName} · {connection.accountType ?? 'Professional account'}
              </p>
              <p className="font-mono text-[11px] tabular-nums text-muted-foreground">
                Instagram {connection.instagramAccountId} · Linked Page {connection.pageName} (
                {connection.pageId}) · Graph {connection.graphApiVersion}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{status.description}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {connection.status === 'NEEDS_REAUTHORIZATION' ? (
              <Button variant="destructive" size="sm" onClick={onReauthorize} disabled={!canManage}>
                <RotateCw className="size-4" aria-hidden="true" /> Reauthorize
              </Button>
            ) : null}
            <Button
              variant="outline"
              size="sm"
              disabled={!canManage || busyAction !== null}
              onClick={() => void runDiagnostics()}
            >
              <Activity
                className={cn('size-4', busyAction === 'diagnostics' && 'animate-spin')}
                aria-hidden="true"
              />
              Run Diagnostics
            </Button>
            <Button
              variant={suspended ? 'default' : 'outline'}
              size="sm"
              disabled={!canManage || busyAction !== null}
              onClick={() => void toggleSuspension()}
            >
              {suspended ? (
                <Play className="size-4" aria-hidden="true" />
              ) : (
                <Pause className="size-4" aria-hidden="true" />
              )}
              {suspended ? 'Restore' : 'Suspend'}
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={!canManage}
              onClick={onRequestDisconnect}
              className="text-muted-foreground hover:text-destructive"
              aria-label="Disconnect Instagram account"
              title="Disconnect Instagram account"
            >
              <Trash2 className="size-4" aria-hidden="true" />
            </Button>
          </div>
        </div>

        {connection.readiness.blockers.length ? (
          <div className="mt-4 rounded-xl border border-warning/40 bg-warning/10 p-3">
            <p className="flex items-center gap-2 text-xs font-semibold text-warning">
              <AlertTriangle className="size-4" aria-hidden="true" />
              {connection.readiness.blockers.length} Activation{' '}
              {connection.readiness.blockers.length === 1 ? 'Item' : 'Items'} Need Attention
            </p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-muted-foreground">
              {connection.readiness.blockers.map((blocker) => (
                <li key={blocker}>{formatInstagramBlocker(blocker)}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <ReadinessCard
          icon={Lock}
          label="Authorization"
          state={connection.readiness.authorization}
          ready={connection.readiness.authorization === 'READY'}
          detail={`${connection.grantedScopes.length} granted · ${connection.missingScopes.length} missing`}
        />
        <ReadinessCard
          icon={Wifi}
          label="Webhooks"
          state={connection.readiness.webhook}
          ready={connection.readiness.webhook === 'READY'}
          detail={
            connection.subscribedFields.length
              ? `${connection.subscribedFields.length} fields subscribed`
              : 'No subscription evidence'
          }
        />
        <ReadinessCard
          icon={Activity}
          label="Messaging"
          state={`${connection.readiness.inbound} / ${connection.readiness.outbound}`}
          ready={
            connection.readiness.inbound === 'OBSERVED' &&
            connection.readiness.outbound === 'OBSERVED'
          }
          detail="Inbound / outbound live evidence"
        />
        <button
          type="button"
          onClick={onOpenSync}
          className="rounded-xl border border-border bg-card p-3.5 text-left shadow-2xs transition-colors duration-150 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5 font-medium">
              <History className="size-3.5" aria-hidden="true" /> History
            </span>
            <Badge variant="outline" className="font-mono text-[10px]">
              {connection.readiness.history}
            </Badge>
          </span>
          <span className="mt-2 block text-sm font-semibold">Manage Historical Sync</span>
          <span className="text-[11px] text-muted-foreground">
            Coverage follows Meta’s available history.
          </span>
        </button>
      </div>
    </div>
  );
}

function ReadinessCard({
  icon: Icon,
  label,
  state,
  ready,
  detail,
}: {
  icon: typeof Lock;
  label: string;
  state: string;
  ready: boolean;
  detail: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-3.5 shadow-2xs">
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5 font-medium">
          <Icon className="size-3.5" aria-hidden="true" /> {label}
        </span>
        <Badge
          variant="outline"
          className={cn(
            'font-mono text-[10px]',
            ready
              ? 'border-success/40 bg-success/10 text-success'
              : 'border-warning/40 bg-warning/10 text-warning',
          )}
        >
          {state}
        </Badge>
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">{detail}</p>
    </div>
  );
}
