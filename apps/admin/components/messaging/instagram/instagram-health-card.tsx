'use client';

import { AlertCircle, CheckCircle2, Clock3, KeyRound, ShieldCheck, Wifi } from 'lucide-react';
import { useState } from 'react';

import type { InstagramConnectionView } from '@maevelle/contracts/messaging';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';
import { toast } from '@/components/ui/toast';
import * as api from './instagram-api';

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
});

const permissionDescriptions: Readonly<Record<string, string>> = {
  pages_show_list: 'Discover the Facebook Pages this administrator may connect.',
  pages_manage_metadata: 'Manage the selected account’s app and webhook subscription.',
  instagram_basic: 'Verify the linked Instagram professional account identity.',
  instagram_manage_messages: 'Receive and reply to customer Instagram Direct Messages.',
};

function date(value: string | null) {
  return value ? dateFormatter.format(new Date(value)) : 'No evidence yet';
}

interface InstagramHealthCardProps {
  connection: InstagramConnectionView;
  canManage: boolean;
  onRefresh: () => Promise<void>;
}

export function InstagramHealthCard({
  connection,
  canManage,
  onRefresh,
}: InstagramHealthCardProps) {
  const [reviewStatus, setReviewStatus] = useState(connection.permissionReviewStatus);
  const [saving, setSaving] = useState(false);

  async function saveReviewStatus() {
    setSaving(true);
    try {
      await api.updateInstagramConnection(connection.id, connection.version, {
        permissionReviewStatus: reviewStatus,
      });
      toast.add({
        title: 'Meta Review Status Updated',
        description: 'This is administrative evidence, not a substitute for Meta approval.',
        type: 'success',
      });
      await onRefresh();
    } catch (cause) {
      toast.add({
        title: 'Review Status Was Not Updated',
        description:
          cause instanceof Error ? cause.message : 'Reload the connection and try again.',
        type: 'error',
      });
      await onRefresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(18rem,.8fr)]">
      <section className="space-y-4 rounded-xl border border-border bg-card p-4">
        <div>
          <h3 className="flex items-center gap-2 font-semibold">
            <ShieldCheck className="size-4 text-primary" aria-hidden="true" /> Permissions &
            Subscription
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Server-reported grants and webhook evidence for this Instagram account.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <HealthItem
            icon={KeyRound}
            title="Encrypted Credential"
            healthy={connection.credentialHealthy}
            detail={
              connection.credentialHealthy
                ? 'The stored Page token passed the latest check.'
                : 'Reauthorization may be required.'
            }
          />
          <HealthItem
            icon={Wifi}
            title="Webhook Subscription"
            healthy={connection.webhookSubscriptionHealthy}
            detail={
              connection.subscribedFields.length
                ? connection.subscribedFields.join(', ')
                : 'No subscribed fields reported.'
            }
          />
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium">Required Meta Permissions</p>
          {connection.requiredScopes.map((scope) => {
            const granted = connection.grantedScopes.includes(scope);
            return (
              <div
                key={scope}
                className="flex items-start gap-2 rounded-lg border border-border p-2.5"
              >
                {granted ? (
                  <CheckCircle2
                    className="mt-0.5 size-4 shrink-0 text-success"
                    aria-label="Granted"
                  />
                ) : (
                  <AlertCircle
                    className="mt-0.5 size-4 shrink-0 text-destructive"
                    aria-label="Missing"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <p className="break-words font-mono text-[11px]">{scope}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {permissionDescriptions[scope] ??
                      'Required by the selected Meta authorization model.'}
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className={
                    granted
                      ? 'border-success/40 text-success'
                      : 'border-destructive/40 text-destructive'
                  }
                >
                  {granted ? 'Granted' : 'Missing'}
                </Badge>
              </div>
            );
          })}
          <div className="flex items-start gap-2 rounded-lg border border-border p-2.5">
            {connection.pageTasks.includes('MESSAGING') ? (
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-label="Granted" />
            ) : (
              <AlertCircle
                className="mt-0.5 size-4 shrink-0 text-destructive"
                aria-label="Missing"
              />
            )}
            <div className="min-w-0 flex-1">
              <p className="font-mono text-[11px]">Page task: MESSAGING</p>
              <p className="text-[11px] text-muted-foreground">
                Required on {connection.pageName} for Instagram messaging access.
              </p>
            </div>
            <Badge
              variant="outline"
              className={
                connection.pageTasks.includes('MESSAGING')
                  ? 'border-success/40 text-success'
                  : 'border-destructive/40 text-destructive'
              }
            >
              {connection.pageTasks.includes('MESSAGING') ? 'Granted' : 'Missing'}
            </Badge>
          </div>
        </div>
        {connection.missingScopes.length ? (
          <Alert className="border-warning/40 bg-warning/10">
            <AlertCircle className="size-4 text-warning" aria-hidden="true" />
            <AlertTitle>Missing Required Permissions</AlertTitle>
            <AlertDescription className="font-mono text-xs">
              {connection.missingScopes.join(', ')}
            </AlertDescription>
          </Alert>
        ) : null}
      </section>

      <section className="space-y-4 rounded-xl border border-border bg-card p-4">
        <div>
          <h3 className="font-semibold">Activation Evidence</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Record the current Meta App Review stage without implying live approval.
          </p>
        </div>
        <label className="block space-y-1.5 text-xs font-medium">
          Permission Review Status
          <NativeSelect
            value={reviewStatus}
            onChange={(event) =>
              setReviewStatus(
                event.target.value as InstagramConnectionView['permissionReviewStatus'],
              )
            }
            disabled={!canManage}
            aria-label="Instagram permission review status"
          >
            <option value="UNKNOWN">Unknown</option>
            <option value="DEVELOPMENT_ONLY">Development Only</option>
            <option value="APP_REVIEW_PENDING">App Review Pending</option>
            <option value="ADVANCED_ACCESS_CONFIRMED">Advanced Access Confirmed</option>
          </NativeSelect>
        </label>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void saveReviewStatus()}
          disabled={!canManage || saving || reviewStatus === connection.permissionReviewStatus}
        >
          Save Review Status
        </Button>
        <div className="space-y-2 border-t border-border pt-3 text-xs">
          <Timestamp label="Last Graph Verification" value={connection.lastVerifiedAt} />
          <Timestamp label="Last Webhook" value={connection.lastWebhookAt} />
          <Timestamp label="Last Inbound DM" value={connection.lastInboundAt} />
          <Timestamp label="Last Outbound Reply" value={connection.lastOutboundAt} />
        </div>
        {connection.lastErrorCode ? (
          <p className="break-words rounded-lg bg-destructive/10 p-2 font-mono text-[11px] text-destructive">
            Latest provider error: {connection.lastErrorCode}
          </p>
        ) : null}
      </section>
    </div>
  );
}

function HealthItem({
  icon: Icon,
  title,
  healthy,
  detail,
}: {
  icon: typeof KeyRound;
  title: string;
  healthy: boolean;
  detail: string;
}) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="flex items-center gap-2 text-xs font-semibold">
        <Icon className="size-4 text-muted-foreground" aria-hidden="true" /> {title}
        {healthy ? (
          <CheckCircle2 className="ml-auto size-4 text-success" aria-label="Healthy" />
        ) : (
          <AlertCircle className="ml-auto size-4 text-warning" aria-label="Needs attention" />
        )}
      </p>
      <p className="mt-1 break-words text-[11px] text-muted-foreground">{detail}</p>
    </div>
  );
}

function Timestamp({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="flex items-center gap-1 text-muted-foreground">
        <Clock3 className="size-3" aria-hidden="true" /> {label}
      </span>
      <span className="text-right font-mono text-[11px] tabular-nums">{date(value)}</span>
    </div>
  );
}
