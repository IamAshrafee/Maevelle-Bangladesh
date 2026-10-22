'use client';

import {
  AlertCircle,
  Check,
  Loader2,
  Server,
  ShieldCheck,
  Wifi,
} from 'lucide-react';
import { useState } from 'react';

import type { FacebookConnectionView } from '@maevelle/contracts/messaging';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { toast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import * as api from './facebook-api';

export interface FacebookRoutingAssuranceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  connection: FacebookConnectionView;
  onUpdated: () => Promise<void>;
  canManage: boolean;
}

export function FacebookRoutingAssuranceDialog({
  open,
  onOpenChange,
  connection,
  onUpdated,
  canManage,
}: FacebookRoutingAssuranceDialogProps) {
  const [routingStatus, setRoutingStatus] = useState<FacebookConnectionView['readiness']['routing']>(
    connection.readiness.routing,
  );
  const [permissionReviewStatus, setPermissionReviewStatus] = useState<
    FacebookConnectionView['permissionReviewStatus']
  >(connection.permissionReviewStatus);
  const [operationalStatus, setOperationalStatus] = useState<
    FacebookConnectionView['readiness']['operational']
  >(connection.readiness.operational);

  const [businessSuiteReviewed, setBusinessSuiteReviewed] = useState(
    connection.readiness.routing === 'OWNER_CONFIRMED',
  );
  const [routingImpactReviewed, setRoutingImpactReviewed] = useState(
    connection.readiness.routing === 'OWNER_CONFIRMED',
  );

  const [savingAssurance, setSavingAssurance] = useState(false);
  const [savingSubscription, setSavingSubscription] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  async function handleSaveAssurance() {
    if (!canManage) return;
    setSavingAssurance(true);
    setErrorMsg(null);
    try {
      await api.updateFacebookAssurance(connection.id, connection.version, {
        routingStatus,
        permissionReviewStatus,
        operationalStatus,
      });
      toast.add({
        title: 'Assurance settings updated',
        type: 'success',
      });
      await onUpdated();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to update assurance settings.');
    } finally {
      setSavingAssurance(false);
    }
  }

  async function handleUpdateSubscription(enable: boolean) {
    if (!canManage) return;
    if (enable && (!businessSuiteReviewed || !routingImpactReviewed)) {
      toast.add({
        title: 'Review checklist required',
        description: 'Please review and confirm both Business Suite coexistence and Routing impact before subscribing.',
        type: 'warning',
      });
      return;
    }
    if (enable && routingStatus !== 'OWNER_CONFIRMED') {
      toast.add({
        title: 'Routing confirmation required',
        description: 'Conversation Routing must be owner-confirmed before activating live subscriptions.',
        type: 'warning',
      });
      return;
    }

    setSavingSubscription(true);
    setErrorMsg(null);
    try {
      await api.updateFacebookSubscription(connection.id, connection.version, {
        subscribed: enable,
        businessSuiteCoexistenceReviewed: businessSuiteReviewed,
        routingImpactReviewed: routingImpactReviewed,
      });
      toast.add({
        title: enable ? 'Page webhook subscription enabled' : 'Page webhook subscription disabled',
        description: enable
          ? 'Maevelle is now actively receiving real-time Messenger webhooks for this Page.'
          : 'Webhook events are now unsubscribed.',
        type: 'success',
      });
      await onUpdated();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to update webhook subscription.');
    } finally {
      setSavingSubscription(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] w-full max-w-xl overflow-y-auto sm:max-h-[85dvh]">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Server className="size-4" />
            </div>
            <div>
              <DialogTitle>Conversation Routing & Business Suite Coexistence</DialogTitle>
              <DialogDescription>
                Phase 06.5 safety assurance controls for Meta Page coexistence and live webhooks.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {errorMsg ? (
          <Alert variant="destructive" className="my-2">
            <AlertCircle className="size-4" />
            <AlertTitle>Action Notice</AlertTitle>
            <AlertDescription className="text-xs">{errorMsg}</AlertDescription>
          </Alert>
        ) : null}

        <div className="space-y-4 py-2">
          {/* Explanation Section */}
          <div className="rounded-xl border border-border bg-card p-4 space-y-2 text-xs leading-relaxed text-muted-foreground">
            <h4 className="font-semibold text-foreground flex items-center gap-1.5">
              <ShieldCheck className="size-4 text-primary" />
              Why Conversation Routing & Coexistence Matters
            </h4>
            <p>
              Meta allows multiple apps and native interfaces (such as <strong>Meta Business Suite</strong> on web and mobile) to interact with your Facebook Page Messenger inbox simultaneously.
            </p>
            <ul className="list-disc pl-4 space-y-1 mt-1">
              <li>
                <strong>No Silent Takeover:</strong> Maevelle never silently hijacks your Page routing or deletes customer messages.
              </li>
              <li>
                <strong>Coexistence with Business Suite:</strong> If your team replies to a customer via the Meta Business Suite mobile app, Maevelle receives an echo event and registers it as sent by the Page, preventing duplicate responses without falsely attributing it to Maevelle staff.
              </li>
              <li>
                <strong>Third-Party Bots:</strong> If your Page previously used another chatbot or CRM, confirm in Meta Business settings that Maevelle receives message webhooks without conflicts.
              </li>
            </ul>
          </div>

          {/* Section 1: Administrative Statuses */}
          <div className="rounded-xl border border-border bg-muted/20 p-4 space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Administrative Readiness Review
            </h4>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="space-y-1 text-xs">
                <span className="font-medium text-foreground">Conversation Routing Status:</span>
                <NativeSelect
                  value={routingStatus}
                  disabled={!canManage || savingAssurance}
                  onChange={(e) =>
                    setRoutingStatus(e.target.value as FacebookConnectionView['readiness']['routing'])
                  }
                  className="text-xs"
                >
                  <NativeSelectOption value="UNVERIFIED">UNVERIFIED (Review Pending)</NativeSelectOption>
                  <NativeSelectOption value="OWNER_CONFIRMED">OWNER_CONFIRMED (Verified Safe)</NativeSelectOption>
                  <NativeSelectOption value="CONFLICT">CONFLICT (Conflict Detected)</NativeSelectOption>
                </NativeSelect>
              </label>

              <label className="space-y-1 text-xs">
                <span className="font-medium text-foreground">Meta App Review Level:</span>
                <NativeSelect
                  value={permissionReviewStatus}
                  disabled={!canManage || savingAssurance}
                  onChange={(e) =>
                    setPermissionReviewStatus(
                      e.target.value as FacebookConnectionView['permissionReviewStatus'],
                    )
                  }
                  className="text-xs"
                >
                  <NativeSelectOption value="DEVELOPMENT_ONLY">DEVELOPMENT_ONLY (Testers only)</NativeSelectOption>
                  <NativeSelectOption value="APP_REVIEW_PENDING">APP_REVIEW_PENDING (Submitted)</NativeSelectOption>
                  <NativeSelectOption value="ADVANCED_ACCESS_CONFIRMED">ADVANCED_ACCESS_CONFIRMED (Public)</NativeSelectOption>
                  <NativeSelectOption value="UNKNOWN">UNKNOWN</NativeSelectOption>
                </NativeSelect>
              </label>
            </div>

            <div className="flex items-center justify-between pt-1">
              <label className="space-y-1 text-xs flex-1 max-w-xs">
                <span className="font-medium text-foreground">Operational Smoke Test:</span>
                <NativeSelect
                  value={operationalStatus}
                  disabled={!canManage || savingAssurance}
                  onChange={(e) =>
                    setOperationalStatus(
                      e.target.value as FacebookConnectionView['readiness']['operational'],
                    )
                  }
                  className="text-xs"
                >
                  <NativeSelectOption value="NOT_RUN">NOT_RUN (Pending Smoke Test)</NativeSelectOption>
                  <NativeSelectOption value="PASSED">PASSED (Verified Live Traffic)</NativeSelectOption>
                  <NativeSelectOption value="FAILED">FAILED (Issues Observed)</NativeSelectOption>
                </NativeSelect>
              </label>

              {canManage ? (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={savingAssurance}
                  onClick={() => void handleSaveAssurance()}
                  className="mt-4 gap-1.5 text-xs"
                >
                  {savingAssurance ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                  Save Statuses
                </Button>
              ) : null}
            </div>
          </div>

          {/* Section 2: Webhook Subscription Activation */}
          <div className="rounded-xl border border-border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Live Webhook Subscription
                </h4>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Subscribes this Page to receive customer messages and delivery watermarks.
                </p>
              </div>
              <Badge
                variant="outline"
                className={cn(
                  'text-[10px] font-mono',
                  connection.webhookSubscriptionHealthy
                    ? 'border-success/40 bg-success/10 text-success'
                    : 'border-warning/40 bg-warning/10 text-warning',
                )}
              >
                {connection.webhookSubscriptionHealthy ? 'Subscribed' : 'Not Subscribed'}
              </Badge>
            </div>

            <div className="space-y-2.5 rounded-lg border border-border bg-muted/30 p-3 text-xs">
              <p className="font-medium text-foreground">Owner Safety Checklist (Required before enabling):</p>
              <label className="flex items-start gap-2 cursor-pointer">
                <Checkbox
                  checked={businessSuiteReviewed}
                  onCheckedChange={(checked) => setBusinessSuiteReviewed(Boolean(checked))}
                  className="mt-0.5"
                />
                <span className="text-muted-foreground">
                  <strong className="text-foreground">Meta Business Suite Coexistence:</strong> I understand staff may also use Meta Business Suite, and echoes will reconcile smoothly without duplicate alerts.
                </span>
              </label>
              <label className="flex items-start gap-2 cursor-pointer">
                <Checkbox
                  checked={routingImpactReviewed}
                  onCheckedChange={(checked) => setRoutingImpactReviewed(Boolean(checked))}
                  className="mt-0.5"
                />
                <span className="text-muted-foreground">
                  <strong className="text-foreground">Conversation Routing Impact:</strong> I verified that no competing external bot will intercept or drop customer Messenger events.
                </span>
              </label>
            </div>

            {canManage ? (
              <div className="pt-1 flex items-center justify-end gap-2">
                {connection.webhookSubscriptionHealthy ? (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={savingSubscription}
                    onClick={() => void handleUpdateSubscription(false)}
                    className="text-xs gap-1.5 text-destructive hover:bg-destructive/10"
                  >
                    {savingSubscription ? <Loader2 className="size-3.5 animate-spin" /> : null}
                    Disable Webhook Subscription
                  </Button>
                ) : (
                  <Button
                    variant="default"
                    size="sm"
                    disabled={
                      savingSubscription ||
                      !businessSuiteReviewed ||
                      !routingImpactReviewed ||
                      routingStatus !== 'OWNER_CONFIRMED'
                    }
                    onClick={() => void handleUpdateSubscription(true)}
                    className="text-xs gap-1.5"
                  >
                    {savingSubscription ? <Loader2 className="size-3.5 animate-spin" /> : <Wifi className="size-3.5" />}
                    Enable Live Webhook Subscription
                  </Button>
                )}
              </div>
            ) : null}
          </div>
        </div>

        <DialogFooter className="mt-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
