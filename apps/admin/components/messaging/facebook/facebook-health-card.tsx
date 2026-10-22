'use client';

import {
  Check,
  Info,
  Lock,
  RefreshCw,
  ShieldCheck,
  X,
} from 'lucide-react';
import { useState } from 'react';

import type { FacebookConnectionView } from '@maevelle/contracts/messaging';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import * as api from './facebook-api';

export interface FacebookHealthCardProps {
  connection: FacebookConnectionView;
  onRefresh: () => Promise<void>;
  canManage: boolean;
}

const REQUIRED_SCOPES: readonly {
  name: string;
  label: string;
  description: string;
}[] = [
  {
    name: 'pages_messaging',
    label: 'Send & Receive Messages',
    description: 'Enables customer Messenger intake and staff response delivery via Send API.',
  },
  {
    name: 'pages_show_list',
    label: 'List Pages',
    description: 'Enables discovery of business Pages authorized by your Meta account.',
  },
  {
    name: 'pages_manage_metadata',
    label: 'Manage Page Subscriptions',
    description: 'Allows Maevelle to subscribe your Page to real-time Messenger webhook events.',
  },
  {
    name: 'pages_read_engagement',
    label: 'Read Engagement',
    description: 'Required by Meta to read incoming customer conversation metadata and postbacks.',
  },
];

const REQUIRED_WEBHOOK_FIELDS: readonly {
  name: string;
  description: string;
}[] = [
  { name: 'messages', description: 'Inbound customer text, attachments, and quick-replies' },
  { name: 'messaging_postbacks', description: 'Customer button selections and CTA postbacks' },
  { name: 'message_deliveries', description: 'Monotonic delivery receipts from customer devices' },
  { name: 'message_reads', description: 'Monotonic read watermarks when customer reads message' },
  { name: 'message_echoes', description: 'Staff and Meta Business Suite echo deduplication' },
];

export function FacebookHealthCard({ connection, onRefresh, canManage }: FacebookHealthCardProps) {
  const [refreshing, setRefreshing] = useState(false);

  async function handleDiagnostics() {
    setRefreshing(true);
    try {
      await api.triggerFacebookDiagnostics(connection.id);
      toast.add({
        title: 'Health diagnostics updated',
        description: 'Verified Page token and webhook subscription.',
        type: 'success',
      });
      await onRefresh();
    } catch (err) {
      toast.add({
        title: 'Diagnostics check failed',
        description: err instanceof Error ? err.message : 'Meta Graph API returned an error.',
        type: 'error',
      });
    } finally {
      setRefreshing(false);
    }
  }

  const reviewStatus = connection.permissionReviewStatus;
  const isAllScopesGranted = connection.missingScopes.length === 0;

  return (
    <div className="space-y-4">
      {/* Overview Status Banner */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <CardTitle className="text-base flex items-center gap-2">
                <ShieldCheck className="size-4 text-primary" />
                Meta Permission & Webhook Diagnostics
              </CardTitle>
              <CardDescription className="text-xs">
                Detailed verification of Meta scopes, page tasks, token health, and webhook events.
              </CardDescription>
            </div>
            {canManage ? (
              <Button
                variant="outline"
                size="sm"
                disabled={refreshing}
                onClick={() => void handleDiagnostics()}
                className="gap-1.5 text-xs"
              >
                <RefreshCw className={cn('size-3.5', refreshing && 'animate-spin')} />
                Re-check Meta Health
              </Button>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Permission Review / App Review Status */}
          <div className="rounded-xl border border-border bg-muted/30 p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                  <Info className="size-3.5 text-primary" />
                  Meta App Review & Access Level:
                </span>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {reviewStatus === 'ADVANCED_ACCESS_CONFIRMED' ? (
                    'Advanced Access is confirmed. Any customer with a Facebook account can message this Page.'
                  ) : reviewStatus === 'DEVELOPMENT_ONLY' ? (
                    'Development mode: Only users with App Roles (Admin, Developer, Tester) on the Meta App can message.'
                  ) : reviewStatus === 'APP_REVIEW_PENDING' ? (
                    'App Review submitted to Meta and awaiting approval for public customer messaging.'
                  ) : (
                    'App Review status has not been verified yet.'
                  )}
                </p>
              </div>
              <Badge
                variant="outline"
                className={cn(
                  'self-start sm:self-auto font-mono text-[11px]',
                  reviewStatus === 'ADVANCED_ACCESS_CONFIRMED'
                    ? 'border-success/40 bg-success/10 text-success'
                    : reviewStatus === 'APP_REVIEW_PENDING'
                      ? 'border-warning/40 bg-warning/10 text-warning'
                      : 'border-border bg-card text-foreground',
                )}
              >
                {reviewStatus}
              </Badge>
            </div>
          </div>

          {/* Meta Permissions Matrix */}
          <div>
            <div className="mb-2.5 flex items-center justify-between">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Required Meta Graph Permissions
              </h4>
              <Badge
                variant={isAllScopesGranted ? 'outline' : 'destructive'}
                className="text-[10px]"
              >
                {isAllScopesGranted ? 'All Scopes Granted' : `${connection.missingScopes.length} Missing`}
              </Badge>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              {REQUIRED_SCOPES.map((scope) => {
                const isGranted = connection.grantedScopes.includes(scope.name);
                return (
                  <div
                    key={scope.name}
                    className={cn(
                      'flex items-start gap-2.5 rounded-xl border p-3 text-xs transition-colors',
                      isGranted ? 'border-border bg-card' : 'border-destructive/30 bg-destructive/5',
                    )}
                  >
                    <div
                      className={cn(
                        'flex size-5 shrink-0 items-center justify-center rounded-full mt-0.5',
                        isGranted ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive',
                      )}
                    >
                      {isGranted ? <Check className="size-3" /> : <X className="size-3" />}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-foreground">{scope.label}</span>
                        <code className="text-[10px] text-muted-foreground font-mono">
                          ({scope.name})
                        </code>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                        {scope.description}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Webhook Subscription Health */}
          <div>
            <div className="mb-2.5 flex items-center justify-between">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Page Webhook Subscription Fields
              </h4>
              <Badge
                variant="outline"
                className={cn(
                  'text-[10px] font-mono',
                  connection.webhookSubscriptionHealthy
                    ? 'border-success/40 bg-success/10 text-success'
                    : 'border-warning/40 bg-warning/10 text-warning',
                )}
              >
                {connection.webhookSubscriptionHealthy ? 'Subscription Healthy' : 'Subscription Incomplete'}
              </Badge>
            </div>

            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {REQUIRED_WEBHOOK_FIELDS.map((field) => {
                const isSubscribed = connection.subscribedFields.includes(field.name);
                return (
                  <div
                    key={field.name}
                    className="flex items-start gap-2 rounded-xl border border-border bg-card p-2.5 text-xs"
                  >
                    <div
                      className={cn(
                        'flex size-4 shrink-0 items-center justify-center rounded-full mt-0.5',
                        isSubscribed ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground',
                      )}
                    >
                      {isSubscribed ? <Check className="size-2.5" /> : <X className="size-2.5" />}
                    </div>
                    <div className="min-w-0">
                      <code className="font-mono text-xs font-semibold text-foreground">
                        {field.name}
                      </code>
                      <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">
                        {field.description}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Token Security Notice */}
          <div className="rounded-xl border border-border bg-muted/20 p-3 text-xs text-muted-foreground flex items-center gap-2.5">
            <Lock className="size-4 shrink-0 text-primary" />
            <span>
              Page credentials are stored AES-256-GCM encrypted in the database. Tokens are never exposed to browser components, network payloads, or client logs.
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
