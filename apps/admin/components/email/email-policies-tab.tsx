'use client';

import { useState } from 'react';
import {
  Sliders,
  CheckCircle2,
  AlertTriangle,
  Info,
  ShieldCheck,
  ArrowDown,
  Mail,
  RotateCw,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  type EmailPolicyDto,
  type EmailDiagnosticsDto,
  eventDisplayLabels,
  fetchEmailApi,
} from './email-types';

interface EmailPoliciesTabProps {
  readonly policies: readonly EmailPolicyDto[];
  readonly diagnostic: EmailDiagnosticsDto | undefined;
  readonly onRefresh: () => void;
}

const policyExplanations: Record<string, string> = {
  ORDER_PLACED: 'Triggered when a customer places a new checkout or COD order. Acknowledges receipt.',
  ORDER_CONFIRMED: 'Triggered when staff verifies customer contact and confirms the order for fulfillment.',
  PAYMENT_VERIFIED: 'Triggered when digital payment (bKash, Nagad, card) is reconciled and verified.',
  ORDER_DISPATCHED: 'Triggered when a fulfillment parcel is handed over to Pathao or courier partner.',
  DELIVERY_COMPLETED: 'Triggered when courier confirms successful customer delivery and handoff.',
  ORDER_CANCELLED: 'Triggered when an order is cancelled by customer or operator prior to completion.',
  REFUND_COMPLETED: 'Triggered when a customer financial refund has been fully processed and settled.',
};

export function EmailPoliciesTab({ policies, diagnostic, onRefresh }: EmailPoliciesTabProps) {
  const [pendingChange, setPendingChange] = useState<{
    policy: EmailPolicyDto;
    field: 'enabled' | 'automatic_enabled' | 'manual_allowed';
    newValue: boolean;
  } | null>(null);
  const [changeReason, setChangeReason] = useState('Standard operational policy update');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const executePolicyChange = async () => {
    if (!pendingChange) return;
    setSubmitting(true);
    setError('');
    setMessage('');
    try {
      await fetchEmailApi(`/admin/email/policies/${pendingChange.policy.notification_type}`, {
        method: 'PATCH',
        body: JSON.stringify({
          enabled: pendingChange.field === 'enabled' ? pendingChange.newValue : pendingChange.policy.enabled,
          automaticEnabled:
            pendingChange.field === 'automatic_enabled'
              ? pendingChange.newValue
              : pendingChange.policy.automatic_enabled,
          manualAllowed:
            pendingChange.field === 'manual_allowed'
              ? pendingChange.newValue
              : pendingChange.policy.manual_allowed,
          reason: changeReason.trim(),
        }),
      });
      setMessage(`${eventDisplayLabels[pendingChange.policy.notification_type] || pendingChange.policy.notification_type} policy updated successfully.`);
      setPendingChange(null);
      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update policy.');
    } finally {
      setSubmitting(false);
    }
  };

  const isGlobalDisabled = diagnostic && !diagnostic.enabled;

  return (
    <div className="space-y-6">
      {/* Global Sending Warning */}
      {isGlobalDisabled ? (
        <div className="flex items-start gap-3 rounded-xl border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          <AlertTriangle className="size-5 shrink-0 mt-0.5" />
          <div>
            <h3 className="font-semibold">Global Email Sending is Inactive</h3>
            <p className="mt-1 text-xs opacity-90">
              The platform environment variable <code>EMAIL_ENABLED=false</code> currently suppresses all automated outbound customer communications regardless of the individual per-event toggles below.
            </p>
          </div>
        </div>
      ) : null}

      {message ? (
        <div className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-xs text-emerald-900 dark:text-emerald-200">
          {message}
        </div>
      ) : null}

      {error ? (
        <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
          {error}
        </div>
      ) : null}

      {/* Decision Hierarchy Diagram */}
      <Card className="bg-muted/20 border-dashed">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <ShieldCheck className="size-4 text-primary" /> Delivery Eligibility & Precedence Rules
          </CardTitle>
          <CardDescription className="text-xs">
            How Maevelle evaluates whether a customer email should be dispatched
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-2 text-xs font-mono text-muted-foreground pt-1">
            <span className="rounded bg-background border px-2 py-1 text-foreground font-semibold">
              Global Email: {diagnostic?.enabled ? 'Active ✓' : 'Disabled ✕'}
            </span>
            <ArrowDown className="size-3.5 rotate-270 text-muted-foreground hidden sm:inline" />
            <span className="rounded bg-background border px-2 py-1 text-foreground font-semibold">
              Event Policy: Enabled
            </span>
            <ArrowDown className="size-3.5 rotate-270 text-muted-foreground hidden sm:inline" />
            <span className="rounded bg-background border px-2 py-1 text-foreground font-semibold">
              Customer Has Email
            </span>
            <ArrowDown className="size-3.5 rotate-270 text-muted-foreground hidden sm:inline" />
            <span className="rounded bg-background border px-2 py-1 text-foreground font-semibold">
              Recipient Not Suppressed
            </span>
            <ArrowDown className="size-3.5 rotate-270 text-muted-foreground hidden sm:inline" />
            <span className="rounded bg-emerald-500/10 border border-emerald-500/30 px-2 py-1 text-emerald-700 dark:text-emerald-400 font-bold">
              Dispatch Queued ✓
            </span>
          </div>
          <p className="mt-3 text-[11px] text-muted-foreground">
            Disabling automatic delivery never blocks or delays the underlying business transaction (such as order confirmation, dispatch, or refund).
          </p>
        </CardContent>
      </Card>

      {/* Per-Event Policy Matrix */}
      <div className="grid gap-4 sm:grid-cols-2">
        {policies.map((p) => {
          const friendlyName = eventDisplayLabels[p.notification_type] || p.notification_type;
          const explanation = policyExplanations[p.notification_type] || 'Transactional email policy.';

          return (
            <Card key={p.notification_type} className="flex flex-col justify-between">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-base font-semibold">{friendlyName}</CardTitle>
                    <p className="font-mono text-[11px] text-muted-foreground mt-0.5">
                      {p.notification_type} · {p.template_key ?? 'code-backed'}
                    </p>
                  </div>
                  <Badge variant={p.enabled ? 'default' : 'secondary'} className="text-[10px]">
                    {p.enabled ? 'Enabled' : 'Disabled'}
                  </Badge>
                </div>
                <CardDescription className="text-xs mt-2">
                  {explanation}
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-3 pt-0 border-t bg-muted/10 p-4">
                <div className="grid gap-2 text-xs">
                  {/* Enabled Toggle */}
                  <div className="flex items-center justify-between py-1">
                    <div>
                      <span className="font-medium text-foreground">Email Capability Enabled</span>
                      <p className="text-[10px] text-muted-foreground">Allow this notification to exist in the platform</p>
                    </div>
                    <Switch
                      checked={p.enabled}
                      onCheckedChange={(checked) =>
                        setPendingChange({ policy: p, field: 'enabled', newValue: checked })
                      }
                      aria-label={`Toggle capability for ${friendlyName}`}
                    />
                  </div>

                  {/* Automatic Send Toggle */}
                  <div className="flex items-center justify-between py-1 border-t">
                    <div>
                      <span className="font-medium text-foreground">Automatic Triggering</span>
                      <p className="text-[10px] text-muted-foreground">Automatically send when the order changes state</p>
                    </div>
                    <Switch
                      checked={p.automatic_enabled}
                      disabled={!p.enabled}
                      onCheckedChange={(checked) =>
                        setPendingChange({ policy: p, field: 'automatic_enabled', newValue: checked })
                      }
                      aria-label={`Toggle automatic sending for ${friendlyName}`}
                    />
                  </div>

                  {/* Manual Allowed Toggle */}
                  <div className="flex items-center justify-between py-1 border-t">
                    <div>
                      <span className="font-medium text-foreground">Manual Send Permitted</span>
                      <p className="text-[10px] text-muted-foreground">Allow administrators to send manually from Order detail</p>
                    </div>
                    <Switch
                      checked={p.manual_allowed}
                      disabled={!p.enabled}
                      onCheckedChange={(checked) =>
                        setPendingChange({ policy: p, field: 'manual_allowed', newValue: checked })
                      }
                      aria-label={`Toggle manual sending for ${friendlyName}`}
                    />
                  </div>
                </div>

                {p.updated_at ? (
                  <p className="text-[10px] text-muted-foreground pt-1">
                    Last modified: {p.updated_at ? new Date(p.updated_at).toLocaleString() : 'Baseline'}
                  </p>
                ) : null}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Confirmation Dialog for Policy Modification */}
      <Dialog open={Boolean(pendingChange)} onOpenChange={(open) => !open && setPendingChange(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm Email Policy Modification</DialogTitle>
            <DialogDescription>
              Policy modifications take effect immediately for future business events. Existing queued or sent messages are unaffected.
            </DialogDescription>
          </DialogHeader>
          {pendingChange ? (
            <div className="space-y-4 py-2 text-sm">
              <div className="rounded-md bg-muted p-3 text-xs space-y-1">
                <p>
                  <strong>Event:</strong>{' '}
                  {eventDisplayLabels[pendingChange.policy.notification_type] ||
                    pendingChange.policy.notification_type}
                </p>
                <p>
                  <strong>Setting:</strong>{' '}
                  {pendingChange.field === 'enabled'
                    ? 'Capability Enabled'
                    : pendingChange.field === 'automatic_enabled'
                    ? 'Automatic Sending'
                    : 'Manual Sending'}
                </p>
                <p>
                  <strong>New Value:</strong>{' '}
                  <span className="font-bold">{pendingChange.newValue ? 'ENABLED' : 'DISABLED'}</span>
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="policy-change-reason">Audited Reason for Change</Label>
                <Input
                  id="policy-change-reason"
                  value={changeReason}
                  onChange={(e) => setChangeReason(e.target.value)}
                  placeholder="Why is this policy being updated?"
                  className="text-xs"
                />
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingChange(null)} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={executePolicyChange} disabled={submitting || !changeReason.trim()}>
              {submitting ? 'Updating…' : 'Confirm Policy Update'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
