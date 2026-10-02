'use client';

import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Clock,
  Globe,
  KeyRound,
  Laptop,
  LogOut,
  MapPin,
  RefreshCw,
  Save,
  Shield,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  UserRoundX,
  UserX,
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';

import { StatusBadge } from '../status-badge';
import { useTeam } from './team-context';
import { TeamPermissionsEditor, type PermissionsEditorValue } from './team-permissions-editor';
import {
  formatIamErrorMessage,
  getRoleSummary,
  type AuthSessionDto,
  type TeamMemberDetailDto,
  type TeamMemberListItemDto,
} from './team-types';

export function TeamMemberDetailSheet({
  memberId,
  open,
  onOpenChange,
  onUpdated,
}: {
  readonly memberId: string | null;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly onUpdated: (message?: string) => Promise<void>;
}) {
  const {
    activeActor,
    canManagePermissions,
    canManageLifecycle,
    canRevokeSessions,
    request,
    presets,
  } = useTeam();

  const [member, setMember] = useState<TeamMemberDetailDto | null>(null);
  const [sessions, setSessions] = useState<readonly AuthSessionDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; tone: 'success' | 'danger' } | null>(
    null,
  );

  // Permissions edit state
  const [permissions, setPermissions] = useState<PermissionsEditorValue>({
    capabilityCodes: [],
    scopes: [],
  });
  const [changeReason, setChangeReason] = useState('');

  // Confirmation dialogs
  const [lifecycleAction, setLifecycleAction] = useState<'SUSPEND' | 'RESTORE' | 'REMOVE' | null>(
    null,
  );
  const [lifecycleReason, setLifecycleReason] = useState('');
  const [confirmRevokeSessions, setConfirmRevokeSessions] = useState(false);

  // Load member details
  useEffect(() => {
    if (!open || !memberId) {
      setMember(null);
      setFeedback(null);
      return;
    }

    let isCurrent = true;
    setLoading(true);
    setFeedback(null);

    Promise.all([
      request<{ data: TeamMemberDetailDto }>(`/admin/team/${memberId}`),
      request<{ data: readonly AuthSessionDto[] }>(`/admin/team/${memberId}/sessions`).catch(
        () => ({ data: [] }),
      ),
    ])
      .then(([memberRes, sessionsRes]) => {
        if (!isCurrent) return;
        setMember(memberRes.data);
        setPermissions({
          capabilityCodes: [...memberRes.data.capabilities],
          scopes: [...memberRes.data.scopes],
        });
        setSessions(sessionsRes.data);
      })
      .catch((err) => {
        if (!isCurrent) return;
        setFeedback({
          message: formatIamErrorMessage(err),
          tone: 'danger',
        });
      })
      .finally(() => {
        if (isCurrent) setLoading(false);
      });

    return () => {
      isCurrent = false;
    };
  }, [memberId, open, request]);

  if (!memberId) return null;

  const isSelf = activeActor.membershipId === member?.id;
  const isTargetOwner = member?.membership_type === 'OWNER';
  const canEditTargetPermissions =
    canManagePermissions && !isSelf && !isTargetOwner && member?.status !== 'REMOVED';
  const canEditTargetLifecycle =
    canManageLifecycle && !isSelf && !isTargetOwner;

  const roleSummary = member
    ? getRoleSummary(member.capabilities, presets, member.membership_type)
    : '';

  async function handleSavePermissions() {
    if (!member) return;
    setBusy(true);
    setFeedback(null);
    try {
      await request(`/admin/team/${member.id}/permissions`, {
        method: 'PUT',
        body: JSON.stringify({
          expectedVersion: Number(member.version),
          capabilityCodes: permissions.capabilityCodes,
          scopes: permissions.scopes,
          reason: changeReason.trim() || 'Updated in Team & access console',
        }),
      });
      setFeedback({
        message: `Capabilities updated successfully for ${member.name}.`,
        tone: 'success',
      });
      setChangeReason('');
      await onUpdated(`Updated capabilities for ${member.name}.`);
      // Reload fresh data
      const refreshed = await request<{ data: TeamMemberDetailDto }>(`/admin/team/${member.id}`);
      setMember(refreshed.data);
      setPermissions({
        capabilityCodes: [...refreshed.data.capabilities],
        scopes: [...refreshed.data.scopes],
      });
    } catch (err) {
      setFeedback({
        message: formatIamErrorMessage(err),
        tone: 'danger',
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleLifecycleChange() {
    if (!member || !lifecycleAction) return;
    setBusy(true);
    setFeedback(null);
    const actionLower =
      lifecycleAction === 'SUSPEND'
        ? 'suspend'
        : lifecycleAction === 'RESTORE'
          ? 'restore'
          : 'remove';
    try {
      await request(`/admin/team/${member.id}/${actionLower}`, {
        method: 'POST',
        body: JSON.stringify({
          expectedVersion: Number(member.version),
          reason: lifecycleReason.trim() || `Administrator ${actionLower} action`,
        }),
      });
      setLifecycleAction(null);
      setLifecycleReason('');
      const actionPast =
        lifecycleAction === 'SUSPEND'
          ? 'suspended'
          : lifecycleAction === 'RESTORE'
            ? 'restored'
            : 'removed';
      const msg = `${member.name} has been ${actionPast}.`;
      setFeedback({ message: msg, tone: 'success' });
      await onUpdated(msg);
      // Reload
      const refreshed = await request<{ data: TeamMemberDetailDto }>(`/admin/team/${member.id}`);
      setMember(refreshed.data);
    } catch (err) {
      setFeedback({
        message: formatIamErrorMessage(err),
        tone: 'danger',
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleRevokeSessions() {
    if (!member) return;
    setBusy(true);
    setFeedback(null);
    try {
      await request(`/admin/team/${member.id}/sessions/revoke`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      setConfirmRevokeSessions(false);
      setFeedback({
        message: `All active sessions revoked for ${member.name}.`,
        tone: 'success',
      });
      setSessions([]);
    } catch (err) {
      setFeedback({
        message: formatIamErrorMessage(err),
        tone: 'danger',
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="sm:max-w-2xl w-full p-0 flex flex-col h-full bg-background overflow-hidden">
          {/* Header */}
          <SheetHeader className="p-6 border-b border-border bg-card/50">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="size-12 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center text-lg border border-primary/20">
                  {member ? member.name.charAt(0).toUpperCase() : '?'}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <SheetTitle className="text-xl font-bold text-foreground">
                      {member?.name ?? 'Loading member…'}
                    </SheetTitle>
                    {isSelf ? (
                      <Badge variant="secondary" className="text-xs bg-primary/15 text-primary border-primary/30">
                        You
                      </Badge>
                    ) : null}
                    {isTargetOwner ? (
                      <Badge className="text-xs bg-amber-500/15 text-amber-500 border-amber-500/30">
                        Owner
                      </Badge>
                    ) : null}
                  </div>
                  <SheetDescription className="text-xs text-muted-foreground">
                    {member?.email}
                  </SheetDescription>
                </div>
              </div>
              {member ? <StatusBadge status={member.status} /> : null}
            </div>

            {/* Quick summary strip */}
            {member ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-4 text-xs">
                <div className="rounded border border-border/60 bg-background p-2">
                  <span className="text-muted-foreground block text-[10px] uppercase font-semibold">
                    Role Profile
                  </span>
                  <span className="font-medium text-foreground truncate block">{roleSummary}</span>
                </div>
                <div className="rounded border border-border/60 bg-background p-2">
                  <span className="text-muted-foreground block text-[10px] uppercase font-semibold">
                    Two-Factor MFA
                  </span>
                  <span className="font-medium flex items-center gap-1 text-foreground">
                    {member.two_factor_enabled ? (
                      <>
                        <ShieldCheck className="size-3.5 text-emerald-500" />
                        Enabled
                      </>
                    ) : (
                      <>
                        <ShieldAlert className="size-3.5 text-amber-500" />
                        Not enabled
                      </>
                    )}
                  </span>
                </div>
                <div className="rounded border border-border/60 bg-background p-2">
                  <span className="text-muted-foreground block text-[10px] uppercase font-semibold">
                    Capabilities
                  </span>
                  <span className="font-medium text-foreground">
                    {member.capabilities.length} assigned
                  </span>
                </div>
                <div className="rounded border border-border/60 bg-background p-2">
                  <span className="text-muted-foreground block text-[10px] uppercase font-semibold">
                    Active Sessions
                  </span>
                  <span className="font-medium text-foreground">{sessions.length} sessions</span>
                </div>
              </div>
            ) : null}
          </SheetHeader>

          {/* Body Content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {feedback ? (
              <div
                className={`rounded-md p-3 text-sm flex items-center gap-2 border ${
                  feedback.tone === 'success'
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500'
                    : 'bg-destructive/15 border-destructive/30 text-destructive'
                }`}
                role={feedback.tone === 'danger' ? 'alert' : 'status'}
              >
                {feedback.tone === 'success' ? (
                  <CheckCircle2 className="size-4 shrink-0" />
                ) : (
                  <AlertTriangle className="size-4 shrink-0" />
                )}
                <span>{feedback.message}</span>
              </div>
            ) : null}

            {loading ? (
              <div className="space-y-4 py-8 text-center text-sm text-muted-foreground">
                <RefreshCw className="size-6 animate-spin mx-auto text-primary" />
                <p>Loading member access details…</p>
              </div>
            ) : member ? (
              <Tabs defaultValue="permissions" className="space-y-4">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="permissions">Capabilities</TabsTrigger>
                  <TabsTrigger value="security">Security & Sessions</TabsTrigger>
                  <TabsTrigger value="lifecycle">Lifecycle & Provenance</TabsTrigger>
                </TabsList>

                {/* TAB 1: Capabilities */}
                <TabsContent value="permissions" className="space-y-4">
                  {isTargetOwner ? (
                    <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3.5 flex items-start gap-3 text-xs text-amber-500">
                      <Shield className="size-4 shrink-0 mt-0.5" />
                      <div>
                        <strong>Owner access is protected.</strong>
                        <p className="mt-0.5">
                          The organization Owner holds structural, non-delegated superuser authority.
                          To transfer the Owner role, use the dedicated Ownership Transfer workflow.
                        </p>
                      </div>
                    </div>
                  ) : isSelf ? (
                    <div className="rounded-lg border border-border/80 bg-muted/30 p-3.5 flex items-start gap-3 text-xs text-muted-foreground">
                      <KeyRound className="size-4 shrink-0 mt-0.5 text-primary" />
                      <div>
                        <strong>Self-modification is protected.</strong>
                        <p className="mt-0.5">
                          You cannot alter your own organizational capabilities. Another administrator with
                          permission management rights or the Owner must grant or revoke access for you.
                        </p>
                      </div>
                    </div>
                  ) : member.status === 'REMOVED' ? (
                    <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3.5 flex items-start gap-3 text-xs text-destructive">
                      <UserX className="size-4 shrink-0 mt-0.5" />
                      <div>
                        <strong>Removed member.</strong>
                        <p className="mt-0.5">
                          This member has been removed from the organization. To grant them access again,
                          send a new invitation to their email address.
                        </p>
                      </div>
                    </div>
                  ) : null}

                  <TeamPermissionsEditor
                    value={permissions}
                    onChange={setPermissions}
                    readOnly={!canEditTargetPermissions}
                    showPresetSelector={canEditTargetPermissions}
                  />

                  {canEditTargetPermissions ? (
                    <div className="space-y-3 pt-3 border-t border-border">
                      <div className="space-y-1">
                        <Label htmlFor="perm-reason" className="text-xs">
                          Reason for modification (logged in IAM audit trail)
                        </Label>
                        <Input
                          id="perm-reason"
                          placeholder="e.g. Promoted to Fulfillment Lead, adjusted warehouse scope"
                          value={changeReason}
                          onChange={(e) => setChangeReason(e.target.value)}
                          className="h-8 text-xs"
                        />
                      </div>
                      <div className="flex justify-end">
                        <Button
                          type="button"
                          onClick={handleSavePermissions}
                          disabled={busy}
                          className="button primary h-9"
                        >
                          <Save className="size-4" />
                          {busy ? 'Saving changes…' : 'Save capabilities'}
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </TabsContent>

                {/* TAB 2: Security & Sessions */}
                <TabsContent value="security" className="space-y-4">
                  {/* MFA Info Card */}
                  <div className="rounded-lg border border-border bg-card p-4 space-y-2">
                    <h4 className="text-sm font-semibold flex items-center gap-2">
                      <Shield className="size-4 text-primary" />
                      Two-Factor Authentication (MFA) Posture
                    </h4>
                    <p className="text-xs text-muted-foreground">
                      {member.two_factor_enabled
                        ? 'This account has MFA enabled, securing administrative sessions against credential compromise.'
                        : 'MFA is currently NOT enabled on this account. High-privilege operations like Ownership Transfer require MFA.'}
                    </p>
                  </div>

                  {/* Active Sessions List */}
                  <div className="rounded-lg border border-border bg-card p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-sm font-semibold flex items-center gap-2">
                          <Laptop className="size-4 text-primary" />
                          Active Administrator Sessions ({sessions.length})
                        </h4>
                        <p className="text-xs text-muted-foreground">
                          Auth sessions indexed in server storage for immediate access revocation.
                        </p>
                      </div>
                      {canRevokeSessions && !isSelf && sessions.length > 0 ? (
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          className="h-8 text-xs"
                          onClick={() => setConfirmRevokeSessions(true)}
                          disabled={busy}
                        >
                          <LogOut className="size-3.5 mr-1" /> Revoke all sessions
                        </Button>
                      ) : null}
                    </div>

                    {sessions.length === 0 ? (
                      <div className="py-6 text-center text-xs text-muted-foreground border border-dashed border-border rounded-md">
                        No active authenticated sessions found.
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-56 overflow-y-auto">
                        {sessions.map((session, idx) => (
                          <div
                            key={session.id ?? idx}
                            className="rounded-md border border-border/70 bg-muted/20 p-2.5 text-xs flex items-center justify-between"
                          >
                            <div className="space-y-0.5">
                              <div className="font-mono text-foreground font-medium flex items-center gap-1.5">
                                <Globe className="size-3 text-muted-foreground" />
                                {session.ipAddress || 'Unknown IP'}
                              </div>
                              <div className="text-[11px] text-muted-foreground truncate max-w-sm">
                                {session.userAgent || 'Web browser'}
                              </div>
                            </div>
                            <div className="text-right text-[11px] text-muted-foreground">
                              {session.createdAt ? (
                                <div>Created {new Date(session.createdAt).toLocaleDateString()}</div>
                              ) : null}
                              {session.expiresAt ? (
                                <div>Expires {new Date(session.expiresAt).toLocaleDateString()}</div>
                              ) : null}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </TabsContent>

                {/* TAB 3: Lifecycle & Provenance */}
                <TabsContent value="lifecycle" className="space-y-4">
                  {/* Provenance Facts */}
                  <div className="rounded-lg border border-border bg-card p-4 space-y-3">
                    <h4 className="text-sm font-semibold flex items-center gap-2">
                      <Calendar className="size-4 text-primary" />
                      Membership Lifecycle History
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <div>
                        <span className="text-muted-foreground block">Joined date</span>
                        <strong>{new Date(member.created_at).toLocaleString()}</strong>
                      </div>
                      <div>
                        <span className="text-muted-foreground block">Last activated</span>
                        <strong>
                          {member.activated_at
                            ? new Date(member.activated_at).toLocaleString()
                            : 'N/A'}
                        </strong>
                      </div>
                      {member.disabled_at ? (
                        <div>
                          <span className="text-muted-foreground block">Suspended at</span>
                          <strong className="text-destructive">
                            {new Date(member.disabled_at).toLocaleString()}
                          </strong>
                        </div>
                      ) : null}
                      {member.removed_at ? (
                        <div>
                          <span className="text-muted-foreground block">Removed at</span>
                          <strong className="text-destructive">
                            {new Date(member.removed_at).toLocaleString()}
                          </strong>
                        </div>
                      ) : null}
                      {member.lifecycle_reason ? (
                        <div className="sm:col-span-2">
                          <span className="text-muted-foreground block">Last lifecycle reason</span>
                          <p className="italic text-foreground">{member.lifecycle_reason}</p>
                        </div>
                      ) : null}
                    </div>
                  </div>

                  {/* Lifecycle Management Actions */}
                  {canEditTargetLifecycle ? (
                    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
                      <h4 className="text-sm font-semibold text-foreground">Management Operations</h4>
                      <p className="text-xs text-muted-foreground">
                        Actions take effect immediately across all system APIs. All historical orders,
                        audit trails, and business records created by this member are preserved.
                      </p>

                      <div className="flex flex-wrap gap-2 pt-2">
                        {member.status === 'ACTIVE' ? (
                          <Button
                            type="button"
                            variant="outline"
                            className="text-amber-500 border-amber-500/30 hover:bg-amber-500/10 text-xs"
                            onClick={() => {
                              setLifecycleAction('SUSPEND');
                              setLifecycleReason('Temporary suspension of access');
                            }}
                            disabled={busy}
                          >
                            <UserRoundX className="size-3.5 mr-1" />
                            Suspend member
                          </Button>
                        ) : member.status === 'DISABLED' ? (
                          <Button
                            type="button"
                            variant="outline"
                            className="text-emerald-500 border-emerald-500/30 hover:bg-emerald-500/10 text-xs"
                            onClick={() => {
                              setLifecycleAction('RESTORE');
                              setLifecycleReason('Access restored by administrator');
                            }}
                            disabled={busy}
                          >
                            <UserCheck className="size-3.5 mr-1" />
                            Reactivate member
                          </Button>
                        ) : null}

                        {member.status !== 'REMOVED' ? (
                          <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            className="text-xs"
                            onClick={() => {
                              setLifecycleAction('REMOVE');
                              setLifecycleReason('Removed from organization');
                            }}
                            disabled={busy}
                          >
                            <UserX className="size-3.5 mr-1" />
                            Remove from organization
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </TabsContent>
              </Tabs>
            ) : null}
          </div>
        </SheetContent>
      </Sheet>

      {/* Lifecycle Confirmation Dialog */}
      {lifecycleAction ? (
        <Dialog open={true} onOpenChange={(open) => !open && setLifecycleAction(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {lifecycleAction === 'SUSPEND' ? (
                  <>
                    <UserRoundX className="size-5 text-amber-500" />
                    Suspend member access
                  </>
                ) : lifecycleAction === 'RESTORE' ? (
                  <>
                    <UserCheck className="size-5 text-emerald-500" />
                    Reactivate member access
                  </>
                ) : (
                  <>
                    <UserX className="size-5 text-destructive" />
                    Remove member from organization
                  </>
                )}
              </DialogTitle>
              <DialogDescription>
                {lifecycleAction === 'SUSPEND' ? (
                  <span>
                    <strong>{member?.name}</strong> will temporarily lose access to all organization
                    features. Active administrator sessions will be revoked immediately.
                  </span>
                ) : lifecycleAction === 'RESTORE' ? (
                  <span>
                    <strong>{member?.name}</strong> will regain access to their assigned capabilities.
                  </span>
                ) : (
                  <span>
                    <strong>{member?.name}</strong> will be permanently removed from this
                    organization. Their capabilities and active sessions will be terminated. Historical
                    records created by them will remain attributed in audit logs.
                  </span>
                )}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-2">
              <div className="space-y-1.5">
                <Label htmlFor="lc-reason">Reason for {lifecycleAction.toLowerCase()}</Label>
                <Textarea
                  id="lc-reason"
                  rows={2}
                  maxLength={500}
                  value={lifecycleReason}
                  onChange={(e) => setLifecycleReason(e.target.value)}
                  placeholder="Reason recorded in organizational audit trail"
                />
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button type="button" variant="outline" onClick={() => setLifecycleAction(null)}>
                Cancel
              </Button>
              <Button
                type="button"
                variant={lifecycleAction === 'RESTORE' ? 'default' : 'destructive'}
                onClick={handleLifecycleChange}
                disabled={busy || !lifecycleReason.trim()}
              >
                {busy
                  ? 'Processing…'
                  : `Confirm ${lifecycleAction === 'RESTORE' ? 'reactivation' : lifecycleAction.toLowerCase()}`}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}

      {/* Revoke Sessions Confirmation Dialog */}
      {confirmRevokeSessions ? (
        <Dialog open={true} onOpenChange={(open) => !open && setConfirmRevokeSessions(false)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-destructive">
                <LogOut className="size-5" />
                Revoke all active sessions
              </DialogTitle>
              <DialogDescription>
                Are you sure you want to end all authenticated sessions for{' '}
                <strong>{member?.name}</strong>? They will be immediately signed out of all devices and
                required to authenticate again.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => setConfirmRevokeSessions(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={handleRevokeSessions}
                disabled={busy}
              >
                {busy ? 'Revoking…' : 'Revoke all sessions'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  );
}
