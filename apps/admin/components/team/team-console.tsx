'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  AlertCircle,
  ArrowRightLeft,
  KeyRound,
  Layers,
  Mail,
  RefreshCw,
  Shield,
  ShieldCheck,
  UserCheck,
  UserPlus,
  Users,
  UserX,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Stats,
  StatsCard,
  StatsDescription,
  StatsTitle,
  StatsValue,
} from '@/components/ui/stats';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import {
  OperationalFeedback,
  OperationalPageHeader,
} from '../operational-worklist';
import { TeamAuditTimeline } from './team-audit-timeline';
import { TeamProvider, useTeam } from './team-context';
import { TeamInvitationsList } from './team-invitations-list';
import { TeamInviteDialog } from './team-invite-dialog';
import { TeamMembersList } from './team-members-list';
import { TeamOwnerTransferDialog } from './team-owner-transfer-dialog';
import { TeamRolesPresets } from './team-roles-presets';
import type {
  MembershipInvitationDto,
  TeamMemberListItemDto,
} from './team-types';

function TeamConsoleContent() {
  const {
    activeActor,
    canInvite,
    isReadOnly,
    request,
    reloadMetadata,
  } = useTeam();

  const [activeTab, setActiveTab] = useState<string>('members');
  const [members, setMembers] = useState<readonly TeamMemberListItemDto[]>([]);
  const [invitations, setInvitations] = useState<readonly MembershipInvitationDto[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [tone, setTone] = useState<'success' | 'warning' | 'danger'>('success');

  // Search & Pagination state for members
  const [memberSearch, setMemberSearch] = useState('');
  const [memberStatus, setMemberStatus] = useState('ALL');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 25,
    totalItems: 0,
    totalPages: 1,
  });

  const loadMembers = useCallback(async () => {
    setLoadingMembers(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: '25',
      });
      if (memberSearch.trim()) params.set('search', memberSearch.trim());
      if (memberStatus !== 'ALL') params.set('status', memberStatus);

      const res = await request<{
        data: {
          items: readonly TeamMemberListItemDto[];
          pagination: { page: number; pageSize: number; totalItems: number; totalPages: number };
        };
      }>(`/admin/team?${params.toString()}`);

      setMembers(res.data.items);
      setPagination(res.data.pagination);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Unable to load team members.');
      setTone('danger');
    } finally {
      setLoadingMembers(false);
    }
  }, [memberSearch, memberStatus, page, request]);

  const loadInvitations = useCallback(async () => {
    try {
      const res = await request<{ data: readonly MembershipInvitationDto[] }>(
        '/admin/team/invitations',
      );
      setInvitations(res.data);
    } catch {
      // Handled silently
    }
  }, [request]);

  const reloadAll = useCallback(async () => {
    await Promise.all([loadMembers(), loadInvitations(), reloadMetadata()]);
  }, [loadMembers, loadInvitations, reloadMetadata]);

  useEffect(() => {
    void loadMembers();
  }, [loadMembers]);

  useEffect(() => {
    void loadInvitations();
  }, [loadInvitations]);

  // Overall Stats
  const activeMembersCount = members.filter((m) => m.status === 'ACTIVE').length;
  const suspendedMembersCount = members.filter((m) => m.status === 'DISABLED').length;
  const mfaEnabledCount = members.filter((m) => m.two_factor_enabled).length;
  const pendingInvitationsCount = invitations.filter((i) => i.status === 'PENDING').length;
  const ownersCount = members.filter((m) => m.membership_type === 'OWNER').length;
  const mfaPercentage =
    members.length > 0 ? Math.round((mfaEnabledCount / members.length) * 100) : 0;

  return (
    <main>
      <section className="shell admin-page space-y-6">
        {/* Header */}
        <OperationalPageHeader
          eyebrow="Settings / Identity & Access"
          title="Team & Access Governance"
          description="Manage organization membership, role presets, single-use invitations, two-factor posture, and access audit history."
          actions={
            <div className="flex items-center gap-2">
              <TeamInviteDialog
                onInvited={async (msg) => {
                  setMessage(msg);
                  setTone('success');
                  await reloadAll();
                }}
              />
              <TeamOwnerTransferDialog
                members={members}
                onTransferred={async (msg) => {
                  setMessage(msg);
                  setTone('success');
                  await reloadAll();
                }}
              />
              <Button
                variant="outline"
                size="sm"
                className="h-9 px-3 text-xs"
                onClick={() => void reloadAll()}
              >
                <RefreshCw className="size-3.5 mr-1" /> Refresh
              </Button>
            </div>
          }
        />

        {/* Read-Only Notice */}
        {isReadOnly ? (
          <div className="rounded-md border border-border/80 bg-muted/30 p-3 flex items-start gap-2.5 text-xs text-muted-foreground">
            <Shield className="size-4 text-primary shrink-0 mt-0.5" />
            <span>
              <strong>Read-only access:</strong> You have viewing permissions for organization members
              and security posture. Modifying capabilities, managing invitations, or changing member
              lifecycle requires administrative capabilities.
            </span>
          </div>
        ) : null}

        {/* Transient Feedback Alert */}
        {message ? (
          <OperationalFeedback tone={tone}>
            {message}
          </OperationalFeedback>
        ) : null}

        {/* Summary Statistics Cards */}
        <Stats>
          <StatsCard>
            <StatsTitle>Active Members</StatsTitle>
            <StatsValue>{pagination.totalItems > 0 ? pagination.totalItems : members.length}</StatsValue>
            <StatsDescription>
              {activeMembersCount} active · {suspendedMembersCount} suspended
            </StatsDescription>
          </StatsCard>
          <StatsCard>
            <StatsTitle>Pending Invitations</StatsTitle>
            <StatsValue>{pendingInvitationsCount}</StatsValue>
            <StatsDescription>
              {invitations.length} total invitations issued
            </StatsDescription>
          </StatsCard>
          <StatsCard>
            <StatsTitle>2FA Adoption</StatsTitle>
            <StatsValue>{mfaPercentage}%</StatsValue>
            <StatsDescription>
              {mfaEnabledCount} of {members.length} members protected
            </StatsDescription>
          </StatsCard>
          <StatsCard>
            <StatsTitle>Organization Authority</StatsTitle>
            <StatsValue>{ownersCount}</StatsValue>
            <StatsDescription>
              {activeActor.isOwner ? 'You are the Owner' : 'Protected Owner relationship'}
            </StatsDescription>
          </StatsCard>
        </Stats>

        {/* Main Tabs Workspace */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="inline-flex h-10 items-center justify-start rounded-lg border border-border bg-card p-1 text-muted-foreground w-full sm:w-auto">
            <TabsTrigger value="members" className="gap-2 text-xs sm:text-sm px-4">
              <Users className="size-4" />
              <span>Members</span>
              <Badge variant="secondary" className="text-[10px] py-0 px-1 ml-0.5">
                {pagination.totalItems > 0 ? pagination.totalItems : members.length}
              </Badge>
            </TabsTrigger>

            <TabsTrigger value="invitations" className="gap-2 text-xs sm:text-sm px-4">
              <Mail className="size-4" />
              <span>Invitations</span>
              {pendingInvitationsCount > 0 ? (
                <Badge className="text-[10px] py-0 px-1 ml-0.5 bg-primary/20 text-primary border-primary/30">
                  {pendingInvitationsCount}
                </Badge>
              ) : null}
            </TabsTrigger>

            <TabsTrigger value="roles" className="gap-2 text-xs sm:text-sm px-4">
              <Layers className="size-4" />
              <span>Roles & Presets</span>
            </TabsTrigger>

            <TabsTrigger value="audit" className="gap-2 text-xs sm:text-sm px-4">
              <Activity className="size-4" />
              <span>Access Audit</span>
            </TabsTrigger>
          </TabsList>

          {/* TAB 1: MEMBERS */}
          <TabsContent value="members" className="outline-none space-y-4">
            <TeamMembersList
              members={members}
              loading={loadingMembers}
              pagination={pagination}
              searchQuery={memberSearch}
              onSearchChange={(q) => {
                setMemberSearch(q);
                setPage(1);
              }}
              statusFilter={memberStatus}
              onStatusChange={(s) => {
                setMemberStatus(s);
                setPage(1);
              }}
              onPageChange={setPage}
              onRefresh={async () => {
                await loadMembers();
              }}
            />
          </TabsContent>

          {/* TAB 2: INVITATIONS */}
          <TabsContent value="invitations" className="outline-none space-y-4">
            <TeamInvitationsList
              invitations={invitations}
              onRefresh={async () => {
                await loadInvitations();
              }}
            />
          </TabsContent>

          {/* TAB 3: ROLES & PRESETS */}
          <TabsContent value="roles" className="outline-none space-y-4">
            <TeamRolesPresets
              onRefresh={async () => {
                await reloadMetadata();
              }}
            />
          </TabsContent>

          {/* TAB 4: ACCESS AUDIT */}
          <TabsContent value="audit" className="outline-none space-y-4">
            <TeamAuditTimeline />
          </TabsContent>
        </Tabs>
      </section>
    </main>
  );
}

export function TeamConsole() {
  return (
    <TeamProvider>
      <TeamConsoleContent />
    </TeamProvider>
  );
}
