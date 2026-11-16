'use client';

import { AdminPage, EmptyState, PageHeader, PageSkeleton } from '@/components/ui/page-shell';
import { WorkspaceTabs, type WorkspaceTabItem } from '@/components/ui/workspace-tabs';
import { useUnsavedChangesGuard } from '@/hooks/use-unsaved-changes-guard';
import { MemberCapabilitiesTab } from './member-detail/member-capabilities-tab';
import {
  MemberLifecycleDialogs,
  type LifecycleActionType,
} from './member-detail/member-lifecycle-dialogs';
import { MemberOverviewTab } from './member-detail/member-overview-tab';
import { MemberSecurityTab } from './member-detail/member-security-tab';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  AlertCircle,
  Calendar,
  Check,
  Copy,
  KeyRound,
  Laptop,
  Mail,
  MapPin,
  MoreHorizontal,
  Save,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Undo2,
  UserCheck,
  UserRoundX,
  UserX,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { RefreshButton } from '@/components/ui/refresh-button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import { OperationalFeedback } from '../operational-worklist';
import { StatusBadge } from '../status-badge';
import { TeamAuditTimeline } from './team-audit-timeline';
import { TeamProvider, useTeam } from './team-context';
import { type PermissionsEditorValue } from './team-permissions-editor';
import {
  formatIamErrorMessage,
  getRoleSummary,
  type AuthSessionDto,
  type TeamMemberDetailDto,
} from './team-types';

function TeamMemberDetailContent({ memberId }: { readonly memberId: string }) {
  const {
    activeActor,
    canManagePermissions,
    canManageLifecycle,
    canRevokeSessions,
    canResetTwoFactor,
    isReadOnly,
    request,
    presets,
    groupedDomains,
  } = useTeam();

  const [member, setMember] = useState<TeamMemberDetailDto | null>(null);
  const [sessions, setSessions] = useState<readonly AuthSessionDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{
    message: string;
    tone: 'success' | 'warning' | 'danger';
  } | null>(null);
  const [copiedEmail, setCopiedEmail] = useState(false);
  const [activeTab, setActiveTab] = useState<string>('overview');

  // Permissions edit state
  const [permissions, setPermissions] = useState<PermissionsEditorValue>({
    capabilityCodes: [],
    scopes: [],
  });
  const [changeReason, setChangeReason] = useState('');

  // Confirmation dialog states
  const [lifecycleAction, setLifecycleAction] = useState<'SUSPEND' | 'RESTORE' | 'REMOVE' | null>(
    null,
  );
  const [lifecycleReason, setLifecycleReason] = useState('');
  const [confirmRevokeSessions, setConfirmRevokeSessions] = useState(false);
  const [confirmResetTwoFactor, setConfirmResetTwoFactor] = useState(false);
  const [resetTwoFactorReason, setResetTwoFactorReason] = useState('');
  const [resetTwoFactorCode, setResetTwoFactorCode] = useState('');

  // Load member and sessions
  const loadMemberData = useCallback(async () => {
    setLoading(true);
    try {
      const [memberRes, sessionsRes] = await Promise.all([
        request<{ data: TeamMemberDetailDto }>(`/admin/team/${memberId}`),
        request<{ data: readonly AuthSessionDto[] }>(`/admin/team/${memberId}/sessions`).catch(
          () => ({ data: [] as readonly AuthSessionDto[] }),
        ),
      ]);

      setMember(memberRes.data);
      setPermissions({
        capabilityCodes: [...memberRes.data.capabilities],
        scopes: [...memberRes.data.scopes],
      });
      setSessions(sessionsRes.data);
    } catch (err) {
      setFeedback({
        message: formatIamErrorMessage(err),
        tone: 'danger',
      });
    } finally {
      setLoading(false);
    }
  }, [memberId, request]);

  useEffect(() => {
    void loadMemberData();
  }, [loadMemberData]);

  // Check if permissions have dirty unsaved changes
  const isPermissionsDirty = useMemo(() => {
    if (!member) return false;
    const currentCodes = [...member.capabilities].sort().join(',');
    const draftCodes = [...permissions.capabilityCodes].sort().join(',');
    if (currentCodes !== draftCodes) return true;

    const currentScopesStr = JSON.stringify(
      [...member.scopes].sort((a, b) => a.capabilityCode.localeCompare(b.capabilityCode)),
    );
    const draftScopesStr = JSON.stringify(
      [...permissions.scopes].sort((a, b) => a.capabilityCode.localeCompare(b.capabilityCode)),
    );
    return currentScopesStr !== draftScopesStr;
  }, [member, permissions]);

  const isSelf = member ? activeActor.membershipId === member.id : false;
  const isTargetOwner = member ? member.membership_type === 'OWNER' : false;
  const canEditTargetPermissions =
    canManagePermissions && !isSelf && !isTargetOwner && member?.status !== 'REMOVED';
  const canEditTargetLifecycle = canManageLifecycle && !isSelf && !isTargetOwner;

  const roleSummary = member
    ? getRoleSummary(member.capabilities, presets, member.membership_type)
    : '';

  // Calculate accessible domains breakdown for Overview tab
  const accessibleDomains = useMemo(() => {
    if (!member) return [];
    return groupedDomains
      .map((group) => {
        const assignedInDomain = group.capabilities.filter((c) =>
          member.capabilities.includes(c.capability_code),
        );
        return {
          domain: group.domain,
          total: group.capabilities.length,
          assigned: assignedInDomain.length,
        };
      })
      .filter((item) => item.assigned > 0);
  }, [groupedDomains, member]);

  const copyEmail = async () => {
    if (!member?.email) return;
    try {
      await navigator.clipboard.writeText(member.email);
      setCopiedEmail(true);
      setTimeout(() => setCopiedEmail(false), 2000);
    } catch {
      // Ignore
    }
  };

  const handleResetPermissions = () => {
    if (!member) return;
    setPermissions({
      capabilityCodes: [...member.capabilities],
      scopes: [...member.scopes],
    });
    setChangeReason('');
    setFeedback({
      message: 'Capability changes have been reset to current values.',
      tone: 'warning',
    });
  };

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
          reason: changeReason.trim() || 'Updated in Team & Access console',
        }),
      });

      setFeedback({
        message: `Capabilities updated successfully for ${member.name}.`,
        tone: 'success',
      });
      setChangeReason('');

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

      // Reload member data
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

  async function handleResetTwoFactor() {
    if (!member) return;
    setBusy(true);
    setFeedback(null);
    try {
      await request(`/admin/team/${member.id}/two-factor/reset`, {
        method: 'POST',
        body: JSON.stringify({
          code: resetTwoFactorCode.trim(),
          reason: resetTwoFactorReason.trim(),
        }),
      });
      setConfirmResetTwoFactor(false);
      setResetTwoFactorReason('');
      setResetTwoFactorCode('');
      setFeedback({
        message: `Two-factor authentication reset for ${member.name}. Their active sessions were revoked.`,
        tone: 'success',
      });
      await loadMemberData();
    } catch (err) {
      setFeedback({
        message: formatIamErrorMessage(err),
        tone: 'danger',
      });
    } finally {
      setBusy(false);
    }
  }

  const { guardDialog } = useUnsavedChangesGuard({
    when: canEditTargetPermissions && isPermissionsDirty && !busy,
    message: 'You have unsaved capability changes for this team member. Discard them and leave?',
  });

  if (loading && !member) {
    return <PageSkeleton variant="detail" widthVariant="standard" />;
  }

  if (!member) {
    return (
      <AdminPage variant="standard">
        <PageHeader
          breadcrumbs={[
            { label: 'Team', href: '/team' },
            { label: 'Member', current: true },
          ]}
          eyebrow="Team & Access"
          title="Member Not Found"
          description="The requested team member membership could not be loaded or may have been deleted."
        />
        <EmptyState
          icon={UserX}
          title="Member Not Found"
          description="Verify the member link or return to the team directory."
          action={
            <Button render={<Link href="/team" />} variant="outline" size="sm">
              Return to Team Directory
            </Button>
          }
        />
      </AdminPage>
    );
  }

  type TeamTabKey = 'overview' | 'capabilities' | 'security' | 'audit';
  const detailTabs: readonly WorkspaceTabItem<TeamTabKey>[] = [
    { value: 'overview', label: 'Overview' },
    {
      value: 'capabilities',
      label: 'Capabilities & Scopes',
      count: permissions.capabilityCodes.length,
    },
    {
      value: 'security',
      label: 'Security & Sessions',
      ...(sessions.length > 0 ? { count: sessions.length } : {}),
    },
    { value: 'audit', label: 'Audit Trail' },
  ];

  const normalizedTab: TeamTabKey =
    activeTab === 'capabilities' || activeTab === 'security' || activeTab === 'audit'
      ? activeTab
      : 'overview';

  return (
    <AdminPage variant="standard">
      {guardDialog}

      <PageHeader
        breadcrumbs={[
          { label: 'Team', href: '/team' },
          { label: member.name, current: true },
        ]}
        eyebrow="Team & Access"
        title={member.name}
        badge={
          <div className="flex flex-wrap items-center gap-2">
            {isSelf ? (
              <Badge
                variant="secondary"
                className="text-[11px] font-medium bg-primary/15 text-primary border-primary/25"
              >
                You
              </Badge>
            ) : null}
            {isTargetOwner ? (
              <Badge className="text-[11px] font-medium bg-warning/15 text-warning border-warning/30">
                Owner
              </Badge>
            ) : null}
            <StatusBadge status={member.status} />
          </div>
        }
        actions={
          <div className="flex items-center gap-2">
            <RefreshButton
              size="icon-sm"
              loading={loading}
              onRefresh={() => void loadMemberData()}
              tooltip="Refresh team member"
            />

            {canEditTargetLifecycle ? (
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button variant="outline" size="sm" className="text-xs gap-1.5">
                      <MoreHorizontal className="size-3.5" aria-hidden="true" />
                      Actions
                    </Button>
                  }
                />
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuLabel className="text-xs">Lifecycle Management</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {member.status === 'ACTIVE' ? (
                    <DropdownMenuItem
                      className="text-warning focus:text-warning text-xs cursor-pointer"
                      onClick={() => {
                        setLifecycleAction('SUSPEND');
                        setLifecycleReason('Temporary suspension of access');
                      }}
                    >
                      <UserRoundX className="size-3.5 mr-2" aria-hidden="true" />
                      Suspend Access
                    </DropdownMenuItem>
                  ) : member.status === 'DISABLED' ? (
                    <DropdownMenuItem
                      className="text-success focus:text-success text-xs cursor-pointer"
                      onClick={() => {
                        setLifecycleAction('RESTORE');
                        setLifecycleReason('Access restored by administrator');
                      }}
                    >
                      <UserCheck className="size-3.5 mr-2" aria-hidden="true" />
                      Reactivate Member
                    </DropdownMenuItem>
                  ) : null}
                  {member.status !== 'REMOVED' ? (
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive text-xs cursor-pointer"
                      onClick={() => {
                        setLifecycleAction('REMOVE');
                        setLifecycleReason('Removed from organization');
                      }}
                    >
                      <UserX className="size-3.5 mr-2" aria-hidden="true" />
                      Remove from Team
                    </DropdownMenuItem>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </div>
        }
      >
        <div className="flex flex-wrap items-center gap-3 pt-1 text-xs text-muted-foreground">
          <button
            type="button"
            onClick={copyEmail}
            className="inline-flex min-h-9 items-center gap-1.5 hover:text-foreground transition-colors font-mono cursor-pointer pointer-coarse:min-h-11"
            title="Click to copy email address"
          >
            <Mail className="size-3.5 text-muted-foreground/80" aria-hidden="true" />
            <span>{member.email}</span>
            {copiedEmail ? (
              <Check className="size-3 text-success" aria-hidden="true" />
            ) : (
              <Copy className="size-3 opacity-40 hover:opacity-100" aria-hidden="true" />
            )}
          </button>

          <span className="text-border">·</span>

          <span className="inline-flex items-center gap-1 font-mono tabular-nums">
            <Calendar className="size-3.5 text-muted-foreground/80" aria-hidden="true" />
            Joined {new Date(member.created_at).toLocaleDateString()}
          </span>

          {member.scopes.length > 0 ? (
            <>
              <span className="text-border">·</span>
              <span className="inline-flex items-center gap-1 text-primary">
                <MapPin className="size-3.5" aria-hidden="true" />
                {member.scopes.length} location scope{member.scopes.length > 1 ? 's' : ''}
              </span>
            </>
          ) : null}
        </div>
      </PageHeader>

      <div className="rounded-xl border border-border/60 bg-card p-5 shadow-2xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-5">
        <div className="flex items-center gap-4">
          <div className="relative size-12 rounded-full bg-primary/10 text-primary font-bold text-lg flex items-center justify-center ring-1 ring-primary/20 shrink-0">
            {member.name.charAt(0).toUpperCase()}
            <span
              className={`absolute bottom-0 right-0 size-3.5 rounded-full ring-2 ring-card ${
                member.status === 'ACTIVE'
                  ? 'bg-success'
                  : member.status === 'DISABLED'
                    ? 'bg-warning'
                    : 'bg-muted-foreground'
              }`}
              title={`Status: ${member.status}`}
            />
          </div>
          <div className="space-y-0.5 text-xs">
            <span className="text-muted-foreground">Role summary</span>
            <p className="font-semibold text-foreground">{roleSummary}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-border/40">
          <div className="rounded-lg border border-border/60 bg-background/50 px-3 py-2 text-xs space-y-0.5 min-w-[110px]">
            <span className="text-[10px] uppercase font-semibold text-muted-foreground/70 block">
              Two-Factor MFA
            </span>
            <span className="font-medium flex items-center gap-1.5">
              {member.two_factor_enabled ? (
                <>
                  <ShieldCheck className="size-3.5 text-success" aria-hidden="true" />
                  <span className="text-success">Enabled</span>
                </>
              ) : (
                <>
                  <ShieldAlert className="size-3.5 text-warning" aria-hidden="true" />
                  <span className="text-warning">Disabled</span>
                </>
              )}
            </span>
          </div>

          <div className="rounded-lg border border-border/60 bg-background/50 px-3 py-2 text-xs space-y-0.5 min-w-[100px]">
            <span className="text-[10px] uppercase font-semibold text-muted-foreground/70 block">
              Active Sessions
            </span>
            <span className="font-mono tabular-nums font-medium text-foreground flex items-center gap-1.5">
              <Laptop className="size-3.5 text-muted-foreground" aria-hidden="true" />
              {sessions.length} active
            </span>
          </div>
        </div>
      </div>

      {isTargetOwner ? (
        <div className="rounded-lg border border-warning/30 bg-warning/10 p-3.5 flex items-start gap-3 text-xs text-warning">
          <Shield className="size-4 shrink-0 mt-0.5" aria-hidden="true" />
          <div>
            <strong>Owner access is protected.</strong>
            <p className="mt-0.5 text-muted-foreground">
              The organization Owner holds structural, non-delegated authority. To transfer the
              Owner role, use the dedicated Ownership Transfer workflow on the main Team page.
            </p>
          </div>
        </div>
      ) : null}

      {isSelf ? (
        <div className="rounded-lg border border-border/80 bg-muted/20 p-3.5 flex items-start gap-3 text-xs text-muted-foreground">
          <KeyRound className="size-4 shrink-0 mt-0.5 text-primary" aria-hidden="true" />
          <div>
            <strong>Self-modification is protected.</strong>
            <p className="mt-0.5">
              You cannot alter your own organizational capabilities or status. Another administrator
              with permission management rights or the Owner must grant or revoke access for your
              account.
            </p>
          </div>
        </div>
      ) : null}

      {member.status === 'REMOVED' ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3.5 flex items-start gap-3 text-xs text-destructive">
          <UserX className="size-4 shrink-0 mt-0.5" aria-hidden="true" />
          <div>
            <strong>Removed member account.</strong>
            <p className="mt-0.5 text-muted-foreground">
              This member has been removed from the organization. To grant them access again, issue
              a new invitation from the main Team console.
            </p>
          </div>
        </div>
      ) : null}

      {isReadOnly ? (
        <div className="rounded-lg border border-border/80 bg-muted/20 p-3.5 flex items-start gap-3 text-xs text-muted-foreground">
          <Shield className="size-4 shrink-0 mt-0.5 text-primary" aria-hidden="true" />
          <span>
            <strong>Read-only access:</strong> You have viewing permissions for organization
            members. Modifying capabilities or member lifecycle requires administrative privileges.
          </span>
        </div>
      ) : null}

      {feedback ? (
        <OperationalFeedback tone={feedback.tone}>{feedback.message}</OperationalFeedback>
      ) : null}

      {canEditTargetPermissions && isPermissionsDirty ? (
        <div className="rounded-lg border border-primary/40 bg-primary/10 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-primary font-medium">
            <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
            <span>You have unsaved capability changes for {member.name}.</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              className="text-xs gap-1"
              onClick={handleResetPermissions}
              disabled={busy}
            >
              <Undo2 className="size-3.5" aria-hidden="true" /> Reset
            </Button>
            <Button
              size="sm"
              className="text-xs gap-1 font-semibold"
              onClick={handleSavePermissions}
              disabled={busy}
            >
              <Save className="size-3.5" aria-hidden="true" /> {busy ? 'Saving…' : 'Save Changes'}
            </Button>
          </div>
        </div>
      ) : null}

      <div className="-mt-2 border-b border-border/70 pb-3">
        <WorkspaceTabs
          items={detailTabs}
          value={normalizedTab}
          onValueChange={(value) => setActiveTab(value)}
          variant="underline"
          maxVisible={4}
          ariaLabel="Team member detail sections"
        />
      </div>

      {normalizedTab === 'overview' ? (
        <MemberOverviewTab
          member={member}
          roleSummary={roleSummary}
          accessibleDomains={accessibleDomains}
          sessions={sessions}
          isSelf={isSelf}
          isTargetOwner={isTargetOwner}
          canRevokeSessions={canRevokeSessions}
          canResetTwoFactor={canResetTwoFactor}
          canEditTargetLifecycle={canEditTargetLifecycle}
          busy={busy}
          onManagePermissions={() => setActiveTab('capabilities')}
          onRequestRevokeSessions={() => setConfirmRevokeSessions(true)}
          onRequestResetTwoFactor={() => setConfirmResetTwoFactor(true)}
          onRequestLifecycleAction={(action: LifecycleActionType, defaultReason: string) => {
            setLifecycleAction(action);
            setLifecycleReason(defaultReason);
          }}
        />
      ) : null}

      {normalizedTab === 'capabilities' ? (
        <MemberCapabilitiesTab
          memberName={member.name}
          permissions={permissions}
          onPermissionsChange={setPermissions}
          canEdit={canEditTargetPermissions}
          isDirty={isPermissionsDirty}
          changeReason={changeReason}
          onChangeReasonChange={setChangeReason}
          busy={busy}
          onSave={handleSavePermissions}
          onReset={handleResetPermissions}
        />
      ) : null}

      {normalizedTab === 'security' ? (
        <MemberSecurityTab
          member={member}
          sessions={sessions}
          isSelf={isSelf}
          canRevokeSessions={canRevokeSessions}
          busy={busy}
          onRequestRevokeSessions={() => setConfirmRevokeSessions(true)}
        />
      ) : null}

      {normalizedTab === 'audit' ? (
        <div className="rounded-xl border border-border/60 bg-card p-6 space-y-4">
          <div>
            <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
              <Activity className="size-4 text-primary" aria-hidden="true" />
              Access &amp; Security Audit Trail
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Filtered audit events for {member.name} ({member.email}). Shows capability grants,
              lifecycle transitions, and session activity.
            </p>
          </div>
          <TeamAuditTimeline initialSearch={member.email} />
        </div>
      ) : null}

      <MemberLifecycleDialogs
        memberName={member.name}
        busy={busy}
        lifecycleAction={lifecycleAction}
        lifecycleReason={lifecycleReason}
        onLifecycleReasonChange={setLifecycleReason}
        onCloseLifecycle={() => setLifecycleAction(null)}
        onConfirmLifecycle={handleLifecycleChange}
        confirmRevokeSessions={confirmRevokeSessions}
        onCloseRevokeSessions={() => setConfirmRevokeSessions(false)}
        onConfirmRevokeSessions={handleRevokeSessions}
        confirmResetTwoFactor={confirmResetTwoFactor}
        resetTwoFactorCode={resetTwoFactorCode}
        resetTwoFactorReason={resetTwoFactorReason}
        onResetTwoFactorCodeChange={setResetTwoFactorCode}
        onResetTwoFactorReasonChange={setResetTwoFactorReason}
        onCloseResetTwoFactor={() => setConfirmResetTwoFactor(false)}
        onConfirmResetTwoFactor={handleResetTwoFactor}
      />
    </AdminPage>
  );
}

export function TeamMemberDetailConsole({ memberId }: { readonly memberId: string }) {
  return (
    <TeamProvider>
      <TeamMemberDetailContent memberId={memberId} />
    </TeamProvider>
  );
}
