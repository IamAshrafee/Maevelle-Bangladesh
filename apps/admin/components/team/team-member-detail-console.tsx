'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Calendar,
  Check,
  Copy,
  Globe,
  KeyRound,
  Laptop,
  Layers,
  LogOut,
  Mail,
  MapPin,
  MoreHorizontal,
  RefreshCw,
  Save,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Undo2,
  User,
  UserCheck,
  UserRoundX,
  UserX,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';

import { OperationalFeedback } from '../operational-worklist';
import { StatusBadge } from '../status-badge';
import { TotpCodeInput } from '../security/totp-code-input';
import { TeamAuditTimeline } from './team-audit-timeline';
import { TeamProvider, useTeam } from './team-context';
import {
  TeamPermissionsEditor,
  type PermissionsEditorValue,
} from './team-permissions-editor';
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
  const [lifecycleAction, setLifecycleAction] = useState<
    'SUSPEND' | 'RESTORE' | 'REMOVE' | null
  >(null);
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
        request<{ data: readonly AuthSessionDto[] }>(
          `/admin/team/${memberId}/sessions`,
        ).catch(() => ({ data: [] as readonly AuthSessionDto[] })),
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
      const refreshed = await request<{ data: TeamMemberDetailDto }>(
        `/admin/team/${member.id}`,
      );
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
      const refreshed = await request<{ data: TeamMemberDetailDto }>(
        `/admin/team/${member.id}`,
      );
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

  if (loading && !member) {
    return (
      <div className="min-w-0 max-w-6xl mx-auto px-4 py-8 sm:px-6 lg:px-8 space-y-6">
        <div className="flex items-center gap-2">
          <Button
            render={<Link href="/team" />}
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" /> Back to Team
          </Button>
        </div>
        <div className="rounded-xl border border-border/60 bg-card/50 p-16 text-center space-y-3">
          <RefreshCw className="size-6 animate-spin mx-auto text-primary" />
          <p className="text-sm font-medium text-foreground">Loading member profile…</p>
          <p className="text-xs text-muted-foreground">
            Retrieving organization identity, capabilities, and session posture.
          </p>
        </div>
      </div>
    );
  }

  if (!member) {
    return (
      <div className="min-w-0 max-w-6xl mx-auto px-4 py-8 sm:px-6 lg:px-8 space-y-6">
        <div className="flex items-center gap-2">
          <Button
            render={<Link href="/team" />}
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" /> Back to Team
          </Button>
        </div>
        <div className="rounded-xl border border-border/60 bg-card/50 p-16 text-center space-y-3">
          <UserX className="size-10 text-muted-foreground mx-auto opacity-30" />
          <h2 className="text-base font-semibold text-foreground">Member Not Found</h2>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            The requested team member membership could not be loaded or may have been deleted.
          </p>
          <Button render={<Link href="/team" />} variant="outline" size="sm" className="mt-2 text-xs">
            Return to Team Directory
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-w-0 max-w-6xl mx-auto px-4 py-6 sm:px-6 lg:px-8 space-y-6">
      {/* Top Navigation Bar: Breadcrumb + Action Controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-border/60 pb-4">
        <div className="flex items-center gap-2 sm:gap-3">
          <Button
            render={<Link href="/team" />}
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" /> Team
          </Button>
          <span className="text-border">/</span>
          <Breadcrumb
            items={[
              { label: 'Team', href: '/team' },
              { label: member.name, current: true },
            ]}
          />
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-8 px-2.5 text-xs gap-1.5"
            onClick={() => void loadMemberData()}
            disabled={loading}
          >
            <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>

          {canEditTargetLifecycle ? (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button variant="outline" size="sm" className="h-8 px-2.5 text-xs gap-1.5">
                    <MoreHorizontal className="size-3.5" />
                    Actions
                  </Button>
                }
              />
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuLabel className="text-xs">Lifecycle Management</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {member.status === 'ACTIVE' ? (
                  <DropdownMenuItem
                    className="text-amber-500 focus:text-amber-500 text-xs cursor-pointer"
                    onClick={() => {
                      setLifecycleAction('SUSPEND');
                      setLifecycleReason('Temporary suspension of access');
                    }}
                  >
                    <UserRoundX className="size-3.5 mr-2" />
                    Suspend Access
                  </DropdownMenuItem>
                ) : member.status === 'DISABLED' ? (
                  <DropdownMenuItem
                    className="text-emerald-500 focus:text-emerald-500 text-xs cursor-pointer"
                    onClick={() => {
                      setLifecycleAction('RESTORE');
                      setLifecycleReason('Access restored by administrator');
                    }}
                  >
                    <UserCheck className="size-3.5 mr-2" />
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
                    <UserX className="size-3.5 mr-2" />
                    Remove from Team
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      </div>

      {/* Modern Profile Header */}
      <div className="rounded-xl border border-border/60 bg-card/60 backdrop-blur-xs p-5 sm:p-6 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-5">
          <div className="flex items-center gap-4">
            {/* Avatar with Status Dot */}
            <div className="relative size-14 rounded-full bg-primary/10 text-primary font-bold text-xl flex items-center justify-center ring-1 ring-primary/20 shrink-0">
              {member.name.charAt(0).toUpperCase()}
              <span
                className={`absolute bottom-0 right-0 size-3.5 rounded-full ring-2 ring-card ${
                  member.status === 'ACTIVE'
                    ? 'bg-emerald-500'
                    : member.status === 'DISABLED'
                      ? 'bg-amber-500'
                      : 'bg-muted-foreground'
                }`}
                title={`Status: ${member.status}`}
              />
            </div>

            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                  {member.name}
                </h1>
                {isSelf ? (
                  <Badge
                    variant="secondary"
                    className="text-[11px] font-medium bg-primary/15 text-primary border-primary/25"
                  >
                    You
                  </Badge>
                ) : null}
                {isTargetOwner ? (
                  <Badge className="text-[11px] font-medium bg-amber-500/15 text-amber-500 border-amber-500/30">
                    Owner
                  </Badge>
                ) : null}
                <StatusBadge status={member.status} />
              </div>

              <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                <button
                  type="button"
                  onClick={copyEmail}
                  className="inline-flex items-center gap-1.5 hover:text-foreground transition-colors font-mono cursor-pointer"
                  title="Click to copy email address"
                >
                  <Mail className="size-3.5 text-muted-foreground/80" />
                  <span>{member.email}</span>
                  {copiedEmail ? (
                    <Check className="size-3 text-emerald-500" />
                  ) : (
                    <Copy className="size-3 opacity-40 hover:opacity-100" />
                  )}
                </button>

                <span className="text-border">·</span>

                <span className="inline-flex items-center gap-1">
                  <Calendar className="size-3.5 text-muted-foreground/80" />
                  Joined {new Date(member.created_at).toLocaleDateString()}
                </span>

                {member.scopes.length > 0 ? (
                  <>
                    <span className="text-border">·</span>
                    <span className="inline-flex items-center gap-1 text-primary">
                      <MapPin className="size-3.5" />
                      {member.scopes.length} location scope{member.scopes.length > 1 ? 's' : ''}
                    </span>
                  </>
                ) : null}
              </div>
            </div>
          </div>

          {/* Quick Metrics Strip */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-border/40">
            <div className="rounded-lg border border-border/60 bg-background/50 px-3 py-2 text-xs space-y-0.5 min-w-[110px]">
              <span className="text-[10px] uppercase font-semibold text-muted-foreground/70 block">
                Role Profile
              </span>
              <span className="font-medium text-foreground truncate block max-w-[140px]" title={roleSummary}>
                {roleSummary}
              </span>
            </div>

            <div className="rounded-lg border border-border/60 bg-background/50 px-3 py-2 text-xs space-y-0.5 min-w-[110px]">
              <span className="text-[10px] uppercase font-semibold text-muted-foreground/70 block">
                Two-Factor MFA
              </span>
              <span className="font-medium flex items-center gap-1.5">
                {member.two_factor_enabled ? (
                  <>
                    <ShieldCheck className="size-3.5 text-emerald-500" />
                    <span className="text-emerald-500">Enabled</span>
                  </>
                ) : (
                  <>
                    <ShieldAlert className="size-3.5 text-amber-500" />
                    <span className="text-amber-500">Disabled</span>
                  </>
                )}
              </span>
            </div>

            <div className="rounded-lg border border-border/60 bg-background/50 px-3 py-2 text-xs space-y-0.5 min-w-[100px]">
              <span className="text-[10px] uppercase font-semibold text-muted-foreground/70 block">
                Active Sessions
              </span>
              <span className="font-medium text-foreground flex items-center gap-1.5">
                <Laptop className="size-3.5 text-muted-foreground" />
                {sessions.length} active
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Protection / Status Banners */}
      {isTargetOwner ? (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3.5 flex items-start gap-3 text-xs text-amber-500">
          <Shield className="size-4 shrink-0 mt-0.5" />
          <div>
            <strong>Owner access is protected.</strong>
            <p className="mt-0.5 text-muted-foreground">
              The organization Owner holds structural, non-delegated authority. To transfer the Owner role, use the dedicated Ownership Transfer workflow on the main Team page.
            </p>
          </div>
        </div>
      ) : null}

      {isSelf ? (
        <div className="rounded-lg border border-border/80 bg-muted/20 p-3.5 flex items-start gap-3 text-xs text-muted-foreground">
          <KeyRound className="size-4 shrink-0 mt-0.5 text-primary" />
          <div>
            <strong>Self-modification is protected.</strong>
            <p className="mt-0.5">
              You cannot alter your own organizational capabilities or status. Another administrator with permission management rights or the Owner must grant or revoke access for your account.
            </p>
          </div>
        </div>
      ) : null}

      {member.status === 'REMOVED' ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3.5 flex items-start gap-3 text-xs text-destructive">
          <UserX className="size-4 shrink-0 mt-0.5" />
          <div>
            <strong>Removed member account.</strong>
            <p className="mt-0.5 text-muted-foreground">
              This member has been removed from the organization. To grant them access again, issue a new invitation from the main Team console.
            </p>
          </div>
        </div>
      ) : null}

      {isReadOnly ? (
        <div className="rounded-lg border border-border/80 bg-muted/20 p-3.5 flex items-start gap-3 text-xs text-muted-foreground">
          <Shield className="size-4 shrink-0 mt-0.5 text-primary" />
          <span>
            <strong>Read-only access:</strong> You have viewing permissions for organization members. Modifying capabilities or member lifecycle requires administrative privileges.
          </span>
        </div>
      ) : null}

      {/* Feedback Alert */}
      {feedback ? (
        <OperationalFeedback tone={feedback.tone}>
          {feedback.message}
        </OperationalFeedback>
      ) : null}

      {/* Unsaved Changes Banner */}
      {canEditTargetPermissions && isPermissionsDirty ? (
        <div className="rounded-lg border border-primary/40 bg-primary/10 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-primary font-medium">
            <AlertCircle className="size-4 shrink-0" />
            <span>You have unsaved capability changes for {member.name}.</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-2.5 text-xs gap-1"
              onClick={handleResetPermissions}
              disabled={busy}
            >
              <Undo2 className="size-3.5" /> Reset
            </Button>
            <Button
              size="sm"
              className="h-8 px-3 text-xs gap-1 bg-primary text-primary-foreground font-semibold"
              onClick={handleSavePermissions}
              disabled={busy}
            >
              <Save className="size-3.5" /> {busy ? 'Saving…' : 'Save Changes'}
            </Button>
          </div>
        </div>
      ) : null}

      {/* Main Clean Tabbed Navigation */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList variant="line" className="w-full justify-start border-b border-border/60 gap-8 h-10 px-0 bg-transparent">
          <TabsTrigger value="overview" className="gap-2 text-xs sm:text-sm font-medium pb-2.5">
            Overview
          </TabsTrigger>
          <TabsTrigger value="capabilities" className="gap-2 text-xs sm:text-sm font-medium pb-2.5">
            Capabilities & Scopes
            <Badge variant="secondary" className="text-[10px] py-0 px-1 ml-0.5">
              {permissions.capabilityCodes.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="security" className="gap-2 text-xs sm:text-sm font-medium pb-2.5">
            Security & Sessions
            {sessions.length > 0 ? (
              <Badge variant="outline" className="text-[10px] py-0 px-1 ml-0.5">
                {sessions.length}
              </Badge>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="audit" className="gap-2 text-xs sm:text-sm font-medium pb-2.5">
            Audit Trail
          </TabsTrigger>
        </TabsList>

        {/* TAB 1: OVERVIEW */}
        <TabsContent value="overview" className="space-y-6 outline-none">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left 2 Columns: Identity & Domain Access Breakdown */}
            <div className="lg:col-span-2 space-y-6">
              {/* Account Details Card */}
              <div className="rounded-xl border border-border/60 bg-card p-5 space-y-4">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <User className="size-4 text-primary" />
                  Account Identity & Provenance
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div className="space-y-0.5">
                    <span className="text-muted-foreground text-[11px] block">Full Name</span>
                    <span className="font-medium text-foreground">{member.name}</span>
                  </div>

                  <div className="space-y-0.5">
                    <span className="text-muted-foreground text-[11px] block">Email Address</span>
                    <span className="font-mono text-foreground">{member.email}</span>
                  </div>

                  <div className="space-y-0.5">
                    <span className="text-muted-foreground text-[11px] block">Role Profile</span>
                    <span className="font-medium text-foreground">{roleSummary}</span>
                  </div>

                  <div className="space-y-0.5">
                    <span className="text-muted-foreground text-[11px] block">Organization Membership</span>
                    <span className="font-medium text-foreground capitalize">
                      {member.membership_type.toLowerCase()}
                    </span>
                  </div>

                  <div className="space-y-0.5">
                    <span className="text-muted-foreground text-[11px] block">Member Since</span>
                    <span className="text-foreground">
                      {new Date(member.created_at).toLocaleString()}
                    </span>
                  </div>

                  <div className="space-y-0.5">
                    <span className="text-muted-foreground text-[11px] block">Last Activated</span>
                    <span className="text-foreground">
                      {member.activated_at
                        ? new Date(member.activated_at).toLocaleString()
                        : 'Initial Activation'}
                    </span>
                  </div>

                  {member.disabled_at ? (
                    <div className="space-y-0.5">
                      <span className="text-muted-foreground text-[11px] block">Suspended At</span>
                      <span className="text-amber-500 font-medium">
                        {new Date(member.disabled_at).toLocaleString()}
                      </span>
                    </div>
                  ) : null}

                  {member.removed_at ? (
                    <div className="space-y-0.5">
                      <span className="text-muted-foreground text-[11px] block">Removed At</span>
                      <span className="text-destructive font-medium">
                        {new Date(member.removed_at).toLocaleString()}
                      </span>
                    </div>
                  ) : null}
                </div>

                {member.lifecycle_reason ? (
                  <div className="pt-3 border-t border-border/40 text-xs">
                    <span className="text-[11px] text-muted-foreground block mb-0.5">
                      Last Recorded Lifecycle Reason
                    </span>
                    <p className="italic text-foreground">{member.lifecycle_reason}</p>
                  </div>
                ) : null}
              </div>

              {/* Functional Domain Access Snapshot */}
              <div className="rounded-xl border border-border/60 bg-card p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                      <Layers className="size-4 text-primary" />
                      Domain Capabilities Snapshot
                    </h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {member.capabilities.length} granular capabilities assigned across{' '}
                      {accessibleDomains.length} functional areas.
                    </p>
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs gap-1"
                    onClick={() => setActiveTab('capabilities')}
                  >
                    Manage permissions <ArrowRight className="size-3" />
                  </Button>
                </div>

                {accessibleDomains.length === 0 ? (
                  <div className="py-8 text-center text-xs text-muted-foreground border border-dashed border-border/60 rounded-lg">
                    No capabilities assigned.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {accessibleDomains.map(({ domain, assigned, total }) => {
                      const DomainIcon = domain.icon;
                      return (
                        <div
                          key={domain.id}
                          className="rounded-lg border border-border/50 bg-background/50 p-3 flex items-center justify-between text-xs"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <DomainIcon className="size-4 text-primary shrink-0" />
                            <span className="font-medium text-foreground truncate">
                              {domain.label}
                            </span>
                          </div>
                          <Badge variant="secondary" className="text-[10px] shrink-0 font-normal">
                            {assigned} / {total}
                          </Badge>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Right Column: Security Posture & Lifecycle Operations */}
            <div className="space-y-6">
              {/* Security Posture Card */}
              <div className="rounded-xl border border-border/60 bg-card p-5 space-y-4">
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Shield className="size-4 text-primary" />
                  Security & Session Posture
                </h3>

                <div className="space-y-3 text-xs">
                  <div className="flex items-center justify-between py-2 border-b border-border/40">
                    <span className="text-muted-foreground">Two-Factor Authentication</span>
                    <StatusBadge
                      status={
                        member.two_factor_enabled
                          ? 'Enabled'
                          : member.two_factor_required
                            ? 'Required — pending'
                            : 'Not enabled'
                      }
                      tone={
                        member.two_factor_enabled
                          ? 'success'
                          : member.two_factor_required
                            ? 'warning'
                            : 'neutral'
                      }
                    />
                  </div>

                  <div className="flex items-center justify-between py-2 border-b border-border/40">
                    <span className="text-muted-foreground">Active Signed-in Devices</span>
                    <span className="font-medium text-foreground">{sessions.length} devices</span>
                  </div>

                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    {member.two_factor_enabled
                      ? 'Administrative sessions are secured with an Authenticator App.'
                      : member.two_factor_required
                        ? `Enrollment is required${member.two_factor_enrollment_deadline ? ` before ${new Date(member.two_factor_enrollment_deadline).toLocaleString()}` : ''}.`
                        : 'MFA is recommended for all accounts with operational capabilities.'}
                  </p>

                  {canRevokeSessions && !isSelf && sessions.length > 0 ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full text-xs text-destructive border-destructive/30 hover:bg-destructive/10 h-8 mt-2"
                      onClick={() => setConfirmRevokeSessions(true)}
                      disabled={busy}
                    >
                      <LogOut className="size-3.5 mr-1.5" />
                      Revoke {sessions.length} Active Session{sessions.length > 1 ? 's' : ''}
                    </Button>
                  ) : null}

                  {isTargetOwner ? (
                    <div className="rounded-lg border border-border/60 bg-muted/30 p-2.5 text-[11px] text-muted-foreground flex items-center gap-2 mt-2">
                      <Shield className="size-3.5 text-primary shrink-0" />
                      <span>Owner security credentials are protected and cannot be reset by other administrators.</span>
                    </div>
                  ) : isSelf ? (
                    <div className="rounded-lg border border-border/60 bg-muted/30 p-2.5 text-[11px] text-muted-foreground mt-2">
                      Manage your own authenticator in{' '}
                      <Link href="/account/security" className="text-primary hover:underline font-medium">
                        Account Security
                      </Link>
                      .
                    </div>
                  ) : canResetTwoFactor ? (
                    member.two_factor_enabled ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="mt-2 h-8 w-full border-destructive/30 text-xs text-destructive hover:bg-destructive/10"
                        onClick={() => setConfirmResetTwoFactor(true)}
                        disabled={busy}
                      >
                        <KeyRound className="mr-1.5 size-3.5" />
                        Reset two-factor authentication
                      </Button>
                    ) : (
                      <p className="text-[11px] text-muted-foreground italic pt-1 text-center">
                        Member does not have an active authenticator enrollment.
                      </p>
                    )
                  ) : null}
                </div>
              </div>

              {/* Lifecycle Operations Card */}
              {canEditTargetLifecycle ? (
                <div className="rounded-xl border border-border/60 bg-card p-5 space-y-3">
                  <h3 className="text-sm font-semibold text-foreground">
                    Lifecycle Governance
                  </h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Administrative lifecycle transitions take effect immediately across all system APIs and active sessions.
                  </p>

                  <div className="flex flex-col gap-2 pt-2">
                    {member.status === 'ACTIVE' ? (
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full text-amber-500 border-amber-500/30 hover:bg-amber-500/10 text-xs h-8 justify-start"
                        onClick={() => {
                          setLifecycleAction('SUSPEND');
                          setLifecycleReason('Temporary suspension of access');
                        }}
                        disabled={busy}
                      >
                        <UserRoundX className="size-3.5 mr-2" />
                        Suspend member access
                      </Button>
                    ) : member.status === 'DISABLED' ? (
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full text-emerald-500 border-emerald-500/30 hover:bg-emerald-500/10 text-xs h-8 justify-start"
                        onClick={() => {
                          setLifecycleAction('RESTORE');
                          setLifecycleReason('Access restored by administrator');
                        }}
                        disabled={busy}
                      >
                        <UserCheck className="size-3.5 mr-2" />
                        Reactivate member access
                      </Button>
                    ) : null}

                    {member.status !== 'REMOVED' ? (
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full text-destructive border-destructive/30 hover:bg-destructive/10 text-xs h-8 justify-start"
                        onClick={() => {
                          setLifecycleAction('REMOVE');
                          setLifecycleReason('Removed from organization');
                        }}
                        disabled={busy}
                      >
                        <UserX className="size-3.5 mr-2" />
                        Remove from organization
                      </Button>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </TabsContent>

        {/* TAB 2: CAPABILITIES & SCOPES */}
        <TabsContent value="capabilities" className="space-y-6 outline-none">
          <div className="rounded-xl border border-border/60 bg-card p-6 space-y-6">
            <div>
              <h3 className="text-base font-semibold text-foreground">
                Access Capabilities & Location Scopes
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Configure specific administrative capabilities and location scopes granted to {member.name}.
              </p>
            </div>

            <TeamPermissionsEditor
              value={permissions}
              onChange={setPermissions}
              readOnly={!canEditTargetPermissions}
              showPresetSelector={canEditTargetPermissions}
              maxHeightClassName="max-h-none"
            />

            {canEditTargetPermissions ? (
              <div className="space-y-4 pt-4 border-t border-border/60">
                <div className="space-y-1.5 max-w-xl">
                  <Label htmlFor="change-reason" className="text-xs font-medium">
                    Audit Reason for Modification
                  </Label>
                  <Input
                    id="change-reason"
                    placeholder="e.g. Promoted to Inventory Supervisor, assigned warehouse scope"
                    value={changeReason}
                    onChange={(e) => setChangeReason(e.target.value)}
                    className="text-xs h-9"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    This explanation will be permanently recorded in the organizational access audit trail.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    onClick={handleSavePermissions}
                    disabled={busy || !isPermissionsDirty}
                    className="button primary h-9 text-xs"
                  >
                    <Save className="size-3.5 mr-1.5" />
                    {busy ? 'Saving changes…' : 'Save capabilities'}
                  </Button>

                  {isPermissionsDirty ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleResetPermissions}
                      disabled={busy}
                      className="h-9 text-xs"
                    >
                      Reset changes
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>
        </TabsContent>

        {/* TAB 3: SECURITY & SESSIONS */}
        <TabsContent value="security" className="space-y-6 outline-none">
          {/* MFA Posture Banner */}
          <div className="rounded-xl border border-border/60 bg-card p-5 flex items-start justify-between gap-4">
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Shield className="size-4 text-primary" />
                Two-Factor Authentication (2FA) Posture
              </h3>
              <p className="text-xs text-muted-foreground">
                {member.two_factor_enabled
                  ? 'This account has TOTP Two-Factor Authentication enabled. High-privilege administrative operations are protected.'
                  : 'Two-Factor Authentication is currently not enabled on this account. Enabling MFA is strongly recommended.'}
              </p>
            </div>

            <Badge
              variant="outline"
              className={
                member.two_factor_enabled
                  ? 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30 text-xs shrink-0'
                  : 'bg-amber-500/15 text-amber-500 border-amber-500/30 text-xs shrink-0'
              }
            >
              {member.two_factor_enabled ? 'MFA Protected' : 'MFA Not Active'}
            </Badge>
          </div>

          {/* Active Sessions List */}
          <div className="rounded-xl border border-border/60 bg-card p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-border/40 pb-3">
              <div>
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Laptop className="size-4 text-primary" />
                  Active Administrator Sessions ({sessions.length})
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Device sessions indexed in server storage for immediate token revocation.
                </p>
              </div>

              {canRevokeSessions && !isSelf && sessions.length > 0 ? (
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  className="h-8 text-xs shrink-0"
                  onClick={() => setConfirmRevokeSessions(true)}
                  disabled={busy}
                >
                  <LogOut className="size-3.5 mr-1.5" /> Revoke all sessions
                </Button>
              ) : null}
            </div>

            {sessions.length === 0 ? (
              <div className="py-12 text-center space-y-2 border border-dashed border-border/60 rounded-lg">
                <Laptop className="size-8 text-muted-foreground mx-auto opacity-30" />
                <p className="text-sm font-medium text-foreground">No active sessions found</p>
                <p className="text-xs text-muted-foreground">
                  This member currently has no active authenticated device sessions.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {sessions.map((session, idx) => (
                  <div
                    key={session.id ?? idx}
                    className="rounded-lg border border-border/60 bg-background/50 p-4 text-xs space-y-2.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-foreground font-semibold flex items-center gap-1.5">
                        <Globe className="size-3.5 text-primary" />
                        {session.ipAddress || 'IP Not Recorded'}
                      </span>
                      <Badge variant="outline" className="text-[10px] text-emerald-500 border-emerald-500/30">
                        Active
                      </Badge>
                    </div>

                    <div className="text-muted-foreground text-[11px] bg-muted/30 p-2 rounded border border-border/40 font-mono break-all">
                      {session.userAgent || 'Web browser client'}
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[11px] text-muted-foreground pt-1 border-t border-border/40">
                      <div>
                        <span className="block text-[10px] uppercase font-semibold text-muted-foreground/70">
                          Created
                        </span>
                        <span>
                          {session.createdAt
                            ? new Date(session.createdAt).toLocaleDateString()
                            : 'Unknown'}
                        </span>
                      </div>
                      <div>
                        <span className="block text-[10px] uppercase font-semibold text-muted-foreground/70">
                          Expires
                        </span>
                        <span>
                          {session.expiresAt
                            ? new Date(session.expiresAt).toLocaleDateString()
                            : 'Session token'}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </TabsContent>

        {/* TAB 4: AUDIT TRAIL */}
        <TabsContent value="audit" className="space-y-6 outline-none">
          <div className="rounded-xl border border-border/60 bg-card p-6 space-y-4">
            <div>
              <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
                <Activity className="size-4 text-primary" />
                Access & Security Audit Trail
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Filtered audit events for {member.name} ({member.email}). Shows capability grants, lifecycle transitions, and session activity.
              </p>
            </div>

            <TeamAuditTimeline initialSearch={member.email} />
          </div>
        </TabsContent>
      </Tabs>

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
                    <strong>{member.name}</strong> will temporarily lose access to all organization features. Active administrator sessions will be revoked immediately.
                  </span>
                ) : lifecycleAction === 'RESTORE' ? (
                  <span>
                    <strong>{member.name}</strong> will regain access to their assigned capabilities.
                  </span>
                ) : (
                  <span>
                    <strong>{member.name}</strong> will be permanently removed from this organization. Their capabilities and active sessions will be terminated. Historical records created by them will remain attributed in audit logs.
                  </span>
                )}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-2">
              <div className="space-y-1.5">
                <Label htmlFor="lc-reason" className="text-xs font-medium">
                  Reason for {lifecycleAction.toLowerCase()} (required)
                </Label>
                <Textarea
                  id="lc-reason"
                  rows={3}
                  maxLength={500}
                  value={lifecycleReason}
                  onChange={(e) => setLifecycleReason(e.target.value)}
                  placeholder="Reason recorded in organizational audit trail"
                  className="text-xs"
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
                Are you sure you want to terminate all authenticated sessions for{' '}
                <strong>{member.name}</strong>? They will be immediately signed out of all devices and required to re-authenticate.
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

      {confirmResetTwoFactor ? (
        <Dialog open={true} onOpenChange={(open) => !open && setConfirmResetTwoFactor(false)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-destructive">
                <KeyRound className="size-5" />
                Reset two-factor authentication?
              </DialogTitle>
              <DialogDescription>
                This will remove <strong>{member.name}</strong>&apos;s authenticator setup, invalidate all their recovery codes, and revoke every active session. If organization policy requires 2FA, they will be prompted to set up a new authenticator upon their next login.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="two-factor-reset-code" className="text-xs font-medium block text-center">
                  Your current authenticator code
                </Label>
                <TotpCodeInput
                  id="two-factor-reset-code"
                  value={resetTwoFactorCode}
                  onChange={setResetTwoFactorCode}
                  disabled={busy}
                  autoFocus
                />
                <p className="text-[11px] text-muted-foreground text-center">
                  Enter your own 6-digit authenticator code to confirm this security action.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="two-factor-reset-reason" className="text-xs font-medium">
                  Audit reason (required)
                </Label>
                <Textarea
                  id="two-factor-reset-reason"
                  rows={3}
                  maxLength={500}
                  value={resetTwoFactorReason}
                  onChange={(event) => setResetTwoFactorReason(event.target.value)}
                  placeholder="Why this member can no longer access their enrolled factor"
                  className="text-xs"
                />
              </div>
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => setConfirmResetTwoFactor(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={handleResetTwoFactor}
                disabled={
                  busy || resetTwoFactorCode.length !== 6 || resetTwoFactorReason.trim().length < 3
                }
              >
                {busy ? 'Resetting…' : 'Reset 2FA and revoke sessions'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}

export function TeamMemberDetailConsole({ memberId }: { readonly memberId: string }) {
  return (
    <TeamProvider>
      <TeamMemberDetailContent memberId={memberId} />
    </TeamProvider>
  );
}
