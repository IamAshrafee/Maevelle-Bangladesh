'use client';

import { useMemo, useState } from 'react';
import {
  AlertCircle,
  Clock,
  Eye,
  Mail,
  RefreshCw,
  Search,
  ShieldAlert,
  Trash2,
} from 'lucide-react';

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
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

import { StatusBadge } from '../status-badge';
import { useTeam } from './team-context';
import {
  formatIamErrorMessage,
  getRoleSummary,
  type MembershipInvitationDto,
} from './team-types';

export function TeamInvitationsList({
  invitations,
  onRefresh,
}: {
  readonly invitations: readonly MembershipInvitationDto[];
  readonly onRefresh: () => Promise<void>;
}) {
  const { request, canInvite, presets } = useTeam();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Resend Dialog State
  const [resendTarget, setResendTarget] = useState<MembershipInvitationDto | null>(null);
  const [resendHours, setResendHours] = useState(72);

  // Revoke Dialog State
  const [revokeTarget, setRevokeTarget] = useState<MembershipInvitationDto | null>(null);
  const [revokeReason, setRevokeReason] = useState('Revoked by administrator');

  // Detail View Dialog State
  const [detailTarget, setDetailTarget] = useState<MembershipInvitationDto | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return invitations.filter((item) => {
      const matchesSearch =
        !q ||
        item.email.toLowerCase().includes(q) ||
        item.display_name.toLowerCase().includes(q);
      const matchesStatus =
        statusFilter === 'ALL' || item.status.toUpperCase() === statusFilter.toUpperCase();
      return matchesSearch && matchesStatus;
    });
  }, [invitations, search, statusFilter]);

  async function handleResend() {
    if (!resendTarget) return;
    setBusy(true);
    setActionError(null);
    try {
      await request(`/admin/team/invitations/${resendTarget.id}/resend`, {
        method: 'POST',
        body: JSON.stringify({
          expectedVersion: Number(resendTarget.version),
          expiresInHours: resendHours,
        }),
      });
      setResendTarget(null);
      await onRefresh();
    } catch (err) {
      setActionError(formatIamErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleRevoke() {
    if (!revokeTarget) return;
    setBusy(true);
    setActionError(null);
    try {
      await request(`/admin/team/invitations/${revokeTarget.id}/revoke`, {
        method: 'POST',
        body: JSON.stringify({
          expectedVersion: Number(revokeTarget.version),
          reason: revokeReason.trim() || 'Revoked by administrator',
        }),
      });
      setRevokeTarget(null);
      await onRefresh();
    } catch (err) {
      setActionError(formatIamErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {actionError ? (
        <div className="rounded-md bg-destructive/15 border border-destructive/30 p-3 text-sm text-destructive" role="alert">
          {actionError}
        </div>
      ) : null}

      {/* Filter and Search Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" aria-hidden="true" />
          <Input
            placeholder="Search email or name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Status:</span>
          {['ALL', 'PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED'].map((st) => (
            <Button
              key={st}
              type="button"
              variant={statusFilter === st ? 'default' : 'outline'}
              size="sm"
              className="h-8 text-xs px-2.5"
              onClick={() => setStatusFilter(st)}
            >
              {st === 'ALL' ? 'All Invitations' : st.charAt(0) + st.slice(1).toLowerCase()}
              <span className="ml-1.5 opacity-70 text-[10px]">
                {st === 'ALL'
                  ? invitations.length
                  : invitations.filter((i) => i.status.toUpperCase() === st).length}
              </span>
            </Button>
          ))}
        </div>
      </div>

      {/* Invitations Table */}
      <div className="panel data-table-shell overflow-hidden rounded-lg border border-border">
        {filtered.length === 0 ? (
          <div className="p-8 text-center space-y-2">
            <Mail className="size-8 text-muted-foreground mx-auto opacity-50" />
            <p className="text-sm font-medium text-foreground">No matching invitations found</p>
            <p className="text-xs text-muted-foreground">
              {search || statusFilter !== 'ALL'
                ? 'Try clearing the search query or status filter.'
                : 'Send an invitation to grant administrator or staff access to a colleague.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left text-xs font-semibold text-muted-foreground">
                  <th className="py-3 px-4">Recipient</th>
                  <th className="py-3 px-4">Role Profile</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Delivery</th>
                  <th className="py-3 px-4">Expiration</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {filtered.map((inv) => {
                  const isExpired =
                    inv.status === 'EXPIRED' ||
                    (inv.status === 'PENDING' && new Date(inv.expires_at).getTime() <= Date.now());
                  const effectiveStatus = isExpired && inv.status === 'PENDING' ? 'EXPIRED' : inv.status;
                  const roleName = getRoleSummary(inv.capability_codes, presets, 'STANDARD');

                  return (
                    <tr key={inv.id} className="hover:bg-muted/30 transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-medium text-foreground">{inv.display_name}</div>
                        <div className="text-xs text-muted-foreground">{inv.email}</div>
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-xs font-medium text-foreground">{roleName}</span>
                        <div className="text-[11px] text-muted-foreground">
                          {inv.capability_codes.length} capabilities
                          {inv.scopes && inv.scopes.length > 0 ? ` · ${inv.scopes.length} scopes` : ''}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <StatusBadge status={effectiveStatus} />
                      </td>
                      <td className="py-3 px-4 text-xs">
                        {inv.last_sent_at ? (
                          <span className="text-foreground">
                            Sent {new Date(inv.last_sent_at).toLocaleDateString()}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">
                            Queued · {inv.delivery_attempt_count} attempt{inv.delivery_attempt_count === 1 ? '' : 's'}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-xs">
                        <span
                          className={
                            isExpired ? 'text-destructive font-medium' : 'text-muted-foreground'
                          }
                        >
                          {new Date(inv.expires_at).toLocaleString()}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-8 px-2 text-xs"
                            onClick={() => setDetailTarget(inv)}
                            title="View invitation details"
                          >
                            <Eye className="size-3.5 mr-1" /> View
                          </Button>
                          {canInvite && inv.status === 'PENDING' ? (
                            <>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-8 px-2 text-xs"
                                onClick={() => setResendTarget(inv)}
                                disabled={busy}
                                title="Resend invitation email"
                              >
                                <RefreshCw className="size-3.5 mr-1" /> Resend
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-8 px-2 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                                onClick={() => {
                                  setRevokeTarget(inv);
                                  setRevokeReason('Revoked by administrator');
                                }}
                                disabled={busy}
                                title="Revoke this invitation"
                              >
                                <Trash2 className="size-3.5 mr-1" /> Revoke
                              </Button>
                            </>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Resend Dialog */}
      {resendTarget ? (
        <Dialog open={true} onOpenChange={(open) => !open && setResendTarget(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <RefreshCw className="size-5 text-primary" />
                Resend invitation
              </DialogTitle>
              <DialogDescription>
                A new secure single-use token will be generated and queued for delivery to{' '}
                <strong>{resendTarget.email}</strong>.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label htmlFor="resend-expiry">New expiration window</Label>
                <select
                  id="resend-expiry"
                  className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  value={resendHours}
                  onChange={(e) => setResendHours(Number(e.target.value))}
                >
                  <option value={24}>24 hours</option>
                  <option value={72}>72 hours (Recommended)</option>
                  <option value={168}>7 days</option>
                </select>
              </div>

              <p className="text-xs text-muted-foreground">
                Resending invalidates any prior link that may have been delivered to the recipient.
              </p>
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={() => setResendTarget(null)}>
                Cancel
              </Button>
              <Button type="button" onClick={handleResend} disabled={busy}>
                {busy ? 'Resending…' : 'Confirm & resend'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}

      {/* Revoke Dialog */}
      {revokeTarget ? (
        <Dialog open={true} onOpenChange={(open) => !open && setRevokeTarget(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-destructive">
                <ShieldAlert className="size-5" />
                Revoke invitation
              </DialogTitle>
              <DialogDescription>
                Revoking this invitation will immediately disable the link for{' '}
                <strong>{revokeTarget.email}</strong>. They will not be able to activate access.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-2">
              <div className="space-y-1.5">
                <Label htmlFor="revoke-reason">Reason for revocation (recorded in audit log)</Label>
                <Textarea
                  id="revoke-reason"
                  rows={2}
                  maxLength={500}
                  value={revokeReason}
                  onChange={(e) => setRevokeReason(e.target.value)}
                  placeholder="e.g. Onboarding cancelled, role reassigned"
                />
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={() => setRevokeTarget(null)}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={handleRevoke}
                disabled={busy || !revokeReason.trim()}
              >
                {busy ? 'Revoking…' : 'Revoke invitation'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}

      {/* View Detail Dialog */}
      {detailTarget ? (
        <Dialog open={true} onOpenChange={(open) => !open && setDetailTarget(null)}>
          <DialogContent className="sm:max-w-xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Mail className="size-5 text-primary" />
                Invitation Details
              </DialogTitle>
              <DialogDescription>
                Details and granted capabilities for <strong>{detailTarget.display_name}</strong>.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-3 p-3 rounded-lg bg-muted/40 text-xs">
                <div>
                  <span className="text-muted-foreground block">Email</span>
                  <strong className="text-foreground">{detailTarget.email}</strong>
                </div>
                <div>
                  <span className="text-muted-foreground block">Status</span>
                  <StatusBadge status={detailTarget.status} />
                </div>
                <div>
                  <span className="text-muted-foreground block">Expires at</span>
                  <strong className="text-foreground">
                    {new Date(detailTarget.expires_at).toLocaleString()}
                  </strong>
                </div>
                <div>
                  <span className="text-muted-foreground block">Delivery attempts</span>
                  <strong className="text-foreground">
                    {detailTarget.delivery_attempt_count}
                  </strong>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Capabilities ({detailTarget.capability_codes.length})
                </Label>
                <div className="max-h-60 overflow-y-auto rounded-md border border-border p-2 space-y-1 bg-background">
                  {detailTarget.capability_codes.length === 0 ? (
                    <p className="text-xs text-muted-foreground p-2">No capabilities attached.</p>
                  ) : (
                    detailTarget.capability_codes.map((code) => (
                      <div
                        key={code}
                        className="flex items-center justify-between text-xs py-1 px-2 rounded hover:bg-muted/50 font-mono"
                      >
                        <span>{code}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {detailTarget.scopes && detailTarget.scopes.length > 0 ? (
                <div className="space-y-2">
                  <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Location Restrictions ({detailTarget.scopes.length})
                  </Label>
                  <div className="rounded-md border border-border p-2 space-y-1 text-xs">
                    {detailTarget.scopes.map((scope, idx) => (
                      <div key={idx} className="flex items-center justify-between py-0.5">
                        <span className="font-mono text-muted-foreground">
                          {scope.capabilityCode}
                        </span>
                        <Badge variant="outline" className="text-[10px]">
                          Location: {scope.scopeId}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            <DialogFooter>
              <Button type="button" onClick={() => setDetailTarget(null)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}
