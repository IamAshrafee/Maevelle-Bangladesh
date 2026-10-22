'use client';

import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowUpRight,
  Check,
  Facebook,
  History,
  Lock,
  Pause,
  Play,
  RotateCw,
  Server,
  Trash2,
  Wifi,
} from 'lucide-react';
import { useState } from 'react';

import type { FacebookConnectionView } from '@maevelle/contracts/messaging';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import * as api from './facebook-api';
import { formatBlockerMessage, getFacebookStatusInfo } from './facebook-types';

export interface FacebookConnectionOverviewProps {
  connection: FacebookConnectionView;
  onRefresh: () => Promise<void>;
  onReauthorize: () => void;
  onOpenRouting: () => void;
  onOpenSync: () => void;
  onRequestDisconnect: () => void;
  canManage: boolean;
}

export function FacebookConnectionOverview({
  connection,
  onRefresh,
  onReauthorize,
  onOpenRouting,
  onOpenSync,
  onRequestDisconnect,
  canManage,
}: FacebookConnectionOverviewProps) {
  const [suspending, setSuspending] = useState(false);
  const [diagnosing, setDiagnosing] = useState(false);

  const statusInfo = getFacebookStatusInfo(connection.status);
  const isSuspended = connection.status === 'SUSPENDED';
  const needsReauth = connection.status === 'NEEDS_REAUTHORIZATION';
  const isOperational = connection.readiness.isOperational;
  const blockers = connection.readiness.blockers;

  async function handleToggleSuspend() {
    if (!canManage) return;
    setSuspending(true);
    try {
      await api.setFacebookConnectionSuspended(
        connection.id,
        connection.version,
        !isSuspended,
      );
      toast.add({
        title: isSuspended ? 'Facebook messaging resumed' : 'Facebook messaging suspended',
        type: 'success',
      });
      await onRefresh();
    } catch (err) {
      toast.add({
        title: 'Action failed',
        description: err instanceof Error ? err.message : 'Could not change suspension state.',
        type: 'error',
      });
    } finally {
      setSuspending(false);
    }
  }

  async function handleRunDiagnostics() {
    if (!canManage) return;
    setDiagnosing(true);
    try {
      await api.triggerFacebookDiagnostics(connection.id);
      toast.add({
        title: 'Connection diagnostics completed',
        description: 'Page access token and webhook subscription verified.',
        type: 'success',
      });
      await onRefresh();
    } catch (err) {
      toast.add({
        title: 'Diagnostics reported issues',
        description: err instanceof Error ? err.message : 'Diagnostics check failed.',
        type: 'error',
      });
    } finally {
      setDiagnosing(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Top Header Card */}
      <div className="rounded-2xl border border-border bg-card p-5 shadow-2xs">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3.5">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[#1877f2]/10 text-[#1877f2]">
              <Facebook className="size-6" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-lg font-bold tracking-tight text-foreground truncate">
                  {connection.pageName}
                </h3>
                <Badge
                  variant={
                    statusInfo.variant === 'success'
                      ? 'default'
                      : statusInfo.variant === 'destructive'
                        ? 'destructive'
                        : 'outline'
                  }
                  className={cn(
                    'text-xs font-medium',
                    statusInfo.variant === 'success' && 'bg-success text-success-foreground',
                    statusInfo.variant === 'warning' && 'bg-warning text-warning-foreground border-warning/40',
                  )}
                >
                  {statusInfo.label}
                </Badge>
                {isOperational ? (
                  <Badge variant="outline" className="border-success/40 bg-success/10 text-success text-[10px]">
                    <Check className="size-3 mr-0.5" /> Operational
                  </Badge>
                ) : (
                  <Badge variant="outline" className="border-warning/40 bg-warning/10 text-warning text-[10px]">
                    <AlertTriangle className="size-3 mr-0.5" /> Setup Pending
                  </Badge>
                )}
              </div>
              <p className="mt-1 font-mono text-xs text-muted-foreground tabular-nums">
                Page ID: {connection.pageId} · Meta Graph API: {connection.graphApiVersion}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{statusInfo.description}</p>
            </div>
          </div>

          {/* Action Toolbar */}
          <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
            {needsReauth ? (
              <Button
                variant="destructive"
                size="sm"
                onClick={onReauthorize}
                disabled={!canManage}
                className="gap-1.5"
              >
                <RotateCw className="size-3.5" />
                Reauthorize Page
              </Button>
            ) : null}

            <Button
              variant="outline"
              size="sm"
              disabled={diagnosing || !canManage}
              onClick={() => void handleRunDiagnostics()}
              className="gap-1.5 text-xs"
              title="Verify token and webhook subscription live against Meta Graph API"
            >
              <Activity className={cn('size-3.5', diagnosing && 'animate-spin text-primary')} />
              Run Diagnostics
            </Button>

            <Button
              variant={isSuspended ? 'default' : 'outline'}
              size="sm"
              disabled={suspending || !canManage}
              onClick={() => void handleToggleSuspend()}
              className="gap-1.5 text-xs"
            >
              {isSuspended ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
              {isSuspended ? 'Resume' : 'Suspend'}
            </Button>

            <Button
              variant="ghost"
              size="icon-sm"
              disabled={!canManage}
              onClick={onRequestDisconnect}
              className="text-muted-foreground hover:text-destructive"
              title="Safely disconnect Facebook Page"
              aria-label="Disconnect Facebook Page"
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        </div>

        {/* Blockers alert if not operational */}
        {blockers.length ? (
          <div className="mt-4 rounded-xl border border-warning/30 bg-warning/10 p-3.5 text-xs text-foreground">
            <div className="flex items-center gap-2 font-semibold text-warning">
              <AlertTriangle className="size-4 shrink-0" />
              <span>Activation Items Requiring Attention ({blockers.length})</span>
            </div>
            <ul className="mt-2 space-y-1 pl-5 list-disc text-muted-foreground">
              {blockers.map((blocker) => (
                <li key={blocker}>
                  <span className="text-foreground font-medium">{formatBlockerMessage(blocker)}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      {/* Readiness Matrix Grid */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {/* Card 1: Meta Authorization */}
        <div className="rounded-xl border border-border bg-card p-3.5 space-y-1 shadow-2xs">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="font-medium flex items-center gap-1.5">
              <Lock className="size-3.5" /> Authorization
            </span>
            <Badge
              variant="outline"
              className={cn(
                'text-[10px] font-mono',
                connection.readiness.authorization === 'READY'
                  ? 'border-success/40 bg-success/10 text-success'
                  : 'border-destructive/40 bg-destructive/10 text-destructive',
              )}
            >
              {connection.readiness.authorization}
            </Badge>
          </div>
          <p className="text-sm font-semibold pt-1">
            {connection.readiness.authorization === 'READY' ? 'Token Active & Encrypted' : 'Requires Reauthorization'}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {connection.grantedScopes.length} granted, {connection.missingScopes.length} missing scopes
          </p>
        </div>

        {/* Card 2: Webhooks Subscription */}
        <div className="rounded-xl border border-border bg-card p-3.5 space-y-1 shadow-2xs">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="font-medium flex items-center gap-1.5">
              <Wifi className="size-3.5" /> Webhooks
            </span>
            <Badge
              variant="outline"
              className={cn(
                'text-[10px] font-mono',
                connection.readiness.webhook === 'READY'
                  ? 'border-success/40 bg-success/10 text-success'
                  : 'border-warning/40 bg-warning/10 text-warning',
              )}
            >
              {connection.readiness.webhook}
            </Badge>
          </div>
          <p className="text-sm font-semibold pt-1">
            {connection.webhookSubscriptionHealthy ? 'Subscribed to Events' : 'Subscription Incomplete'}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {connection.subscribedFields.length ? `${connection.subscribedFields.length} fields subscribed` : 'No fields subscribed'}
          </p>
        </div>

        {/* Card 3: Conversation Routing */}
        <div className="rounded-xl border border-border bg-card p-3.5 space-y-1 shadow-2xs">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="font-medium flex items-center gap-1.5">
              <Server className="size-3.5" /> Routing
            </span>
            <Badge
              variant="outline"
              className={cn(
                'text-[10px] font-mono',
                connection.readiness.routing === 'OWNER_CONFIRMED'
                  ? 'border-success/40 bg-success/10 text-success'
                  : 'border-warning/40 bg-warning/10 text-warning',
              )}
            >
              {connection.readiness.routing}
            </Badge>
          </div>
          <p className="text-sm font-semibold pt-1">
            {connection.readiness.routing === 'OWNER_CONFIRMED' ? 'Coexistence Confirmed' : 'Review Required'}
          </p>
          <button
            type="button"
            onClick={onOpenRouting}
            className="text-[11px] text-primary hover:underline flex items-center gap-1"
          >
            Review Business Suite <ArrowUpRight className="size-2.5" />
          </button>
        </div>

        {/* Card 4: Historical Sync */}
        <div className="rounded-xl border border-border bg-card p-3.5 space-y-1 shadow-2xs">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="font-medium flex items-center gap-1.5">
              <History className="size-3.5" /> History Sync
            </span>
            <Badge variant="outline" className="text-[10px] font-mono">
              {connection.readiness.history}
            </Badge>
          </div>
          <p className="text-sm font-semibold pt-1">
            {connection.readiness.history === 'PROVIDER_EXHAUSTED'
              ? 'Complete'
              : connection.readiness.history === 'IN_PROGRESS'
                ? 'Syncing Chats'
                : 'Not Started'}
          </p>
          <button
            type="button"
            onClick={onOpenSync}
            className="text-[11px] text-primary hover:underline flex items-center gap-1"
          >
            Manage Synchronization <ArrowUpRight className="size-2.5" />
          </button>
        </div>
      </div>

      {/* Activity Timestamps & Diagnostics Bar */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Recent Activity & Telemetry
        </h4>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-xs">
          <div>
            <span className="text-muted-foreground block">Last Webhook Intake:</span>
            <span className="font-mono tabular-nums font-medium text-foreground">
              {connection.lastWebhookAt ? new Date(connection.lastWebhookAt).toLocaleString() : 'None observed'}
            </span>
          </div>
          <div>
            <span className="text-muted-foreground block">Last Inbound Message:</span>
            <span className="font-mono tabular-nums font-medium text-foreground">
              {connection.lastInboundAt ? new Date(connection.lastInboundAt).toLocaleString() : 'None observed'}
            </span>
          </div>
          <div>
            <span className="text-muted-foreground block">Last Outbound Reply:</span>
            <span className="font-mono tabular-nums font-medium text-foreground">
              {connection.lastOutboundAt ? new Date(connection.lastOutboundAt).toLocaleString() : 'None observed'}
            </span>
          </div>
          <div>
            <span className="text-muted-foreground block">Last Graph Verification:</span>
            <span className="font-mono tabular-nums font-medium text-foreground">
              {connection.lastVerifiedAt ? new Date(connection.lastVerifiedAt).toLocaleString() : 'None recorded'}
            </span>
          </div>
        </div>
        {connection.lastErrorCode ? (
          <div className="mt-2 rounded-lg bg-destructive/10 p-2 text-xs text-destructive flex items-center gap-2">
            <AlertCircle className="size-3.5 shrink-0" />
            <span>Latest provider error: <strong>{connection.lastErrorCode}</strong></span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
