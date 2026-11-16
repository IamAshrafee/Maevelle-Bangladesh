'use client';

import Link from 'next/link';
import {
  ArrowRight,
  Layers,
  LogOut,
  Shield,
  User,
  UserCheck,
  UserRoundX,
  UserX,
  KeyRound,
} from 'lucide-react';

import { StatusBadge } from '@/components/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { AuthSessionDto, DomainMeta, TeamMemberDetailDto } from '../team-types';
import type { LifecycleActionType } from './member-lifecycle-dialogs';

interface AccessibleDomainSummary {
  readonly domain: DomainMeta;
  readonly total: number;
  readonly assigned: number;
}

export interface MemberOverviewTabProps {
  readonly member: TeamMemberDetailDto;
  readonly roleSummary: string;
  readonly accessibleDomains: readonly AccessibleDomainSummary[];
  readonly sessions: readonly AuthSessionDto[];
  readonly isSelf: boolean;
  readonly isTargetOwner: boolean;
  readonly canRevokeSessions: boolean;
  readonly canResetTwoFactor: boolean;
  readonly canEditTargetLifecycle: boolean;
  readonly busy: boolean;
  readonly onManagePermissions: () => void;
  readonly onRequestRevokeSessions: () => void;
  readonly onRequestResetTwoFactor: () => void;
  readonly onRequestLifecycleAction: (action: LifecycleActionType, defaultReason: string) => void;
}

/**
 * Identity provenance, domain capability breakdown, security posture, and lifecycle panel.
 */
export function MemberOverviewTab({
  member,
  roleSummary,
  accessibleDomains,
  sessions,
  isSelf,
  isTargetOwner,
  canRevokeSessions,
  canResetTwoFactor,
  canEditTargetLifecycle,
  busy,
  onManagePermissions,
  onRequestRevokeSessions,
  onRequestResetTwoFactor,
  onRequestLifecycleAction,
}: MemberOverviewTabProps) {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-start">
      <div className="space-y-6 lg:col-span-8">
        <div className="rounded-xl border border-border/60 bg-card p-5 space-y-4">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <User className="size-4 text-primary" aria-hidden="true" />
            Account Identity &amp; Provenance
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
              <span className="text-muted-foreground text-[11px] block">
                Organization Membership
              </span>
              <span className="font-medium text-foreground capitalize">
                {member.membership_type.toLowerCase()}
              </span>
            </div>

            <div className="space-y-0.5">
              <span className="text-muted-foreground text-[11px] block">Member Since</span>
              <span className="font-mono tabular-nums text-foreground">
                {new Date(member.created_at).toLocaleString()}
              </span>
            </div>

            <div className="space-y-0.5">
              <span className="text-muted-foreground text-[11px] block">Last Activated</span>
              <span className="font-mono tabular-nums text-foreground">
                {member.activated_at
                  ? new Date(member.activated_at).toLocaleString()
                  : 'Initial Activation'}
              </span>
            </div>

            {member.disabled_at ? (
              <div className="space-y-0.5">
                <span className="text-muted-foreground text-[11px] block">Suspended At</span>
                <span className="font-mono tabular-nums text-warning font-medium">
                  {new Date(member.disabled_at).toLocaleString()}
                </span>
              </div>
            ) : null}

            {member.removed_at ? (
              <div className="space-y-0.5">
                <span className="text-muted-foreground text-[11px] block">Removed At</span>
                <span className="font-mono tabular-nums text-destructive font-medium">
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

        <div className="rounded-xl border border-border/60 bg-card p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Layers className="size-4 text-primary" aria-hidden="true" />
                Domain Capabilities Snapshot
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                <span className="font-mono tabular-nums">{member.capabilities.length}</span>{' '}
                granular capabilities assigned across{' '}
                <span className="font-mono tabular-nums">{accessibleDomains.length}</span>{' '}
                functional areas.
              </p>
            </div>

            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs"
              onClick={onManagePermissions}
            >
              Manage permissions <ArrowRight className="size-3.5" aria-hidden="true" />
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
                      <DomainIcon className="size-4 text-primary shrink-0" aria-hidden="true" />
                      <span className="font-medium text-foreground truncate">{domain.label}</span>
                    </div>
                    <Badge
                      variant="secondary"
                      className="text-[10px] shrink-0 font-mono tabular-nums font-normal"
                    >
                      {assigned} / {total}
                    </Badge>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <aside className="space-y-6 lg:col-span-4">
        <div className="rounded-xl border border-border/60 bg-card p-5 space-y-4">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Shield className="size-4 text-primary" aria-hidden="true" />
            Security &amp; Session Posture
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
              <span className="font-mono tabular-nums font-medium text-foreground">
                {sessions.length} devices
              </span>
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
                className="w-full text-xs text-destructive border-destructive/30 hover:bg-destructive/10 mt-2"
                onClick={onRequestRevokeSessions}
                disabled={busy}
              >
                <LogOut className="size-3.5 mr-1.5" aria-hidden="true" />
                Revoke {sessions.length} Active Session{sessions.length > 1 ? 's' : ''}
              </Button>
            ) : null}

            {isTargetOwner ? (
              <div className="rounded-lg border border-border/60 bg-muted/30 p-2.5 text-[11px] text-muted-foreground flex items-center gap-2 mt-2">
                <Shield className="size-3.5 text-primary shrink-0" aria-hidden="true" />
                <span>
                  Owner security credentials are protected and cannot be reset by other
                  administrators.
                </span>
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
                  className="mt-2 w-full border-destructive/30 text-xs text-destructive hover:bg-destructive/10"
                  onClick={onRequestResetTwoFactor}
                  disabled={busy}
                >
                  <KeyRound className="mr-1.5 size-3.5" aria-hidden="true" />
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

        {canEditTargetLifecycle ? (
          <div className="rounded-xl border border-border/60 bg-card p-5 space-y-3">
            <h3 className="text-sm font-semibold text-foreground">Lifecycle Governance</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Administrative lifecycle transitions take effect immediately across all system APIs
              and active sessions.
            </p>

            <div className="flex flex-col gap-2 pt-2">
              {member.status === 'ACTIVE' ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full text-warning border-warning/30 hover:bg-warning/10 text-xs justify-start"
                  onClick={() =>
                    onRequestLifecycleAction('SUSPEND', 'Temporary suspension of access')
                  }
                  disabled={busy}
                >
                  <UserRoundX className="size-3.5 mr-2" aria-hidden="true" />
                  Suspend member access
                </Button>
              ) : member.status === 'DISABLED' ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full text-success border-success/30 hover:bg-success/10 text-xs justify-start"
                  onClick={() =>
                    onRequestLifecycleAction('RESTORE', 'Access restored by administrator')
                  }
                  disabled={busy}
                >
                  <UserCheck className="size-3.5 mr-2" aria-hidden="true" />
                  Reactivate member access
                </Button>
              ) : null}

              {member.status !== 'REMOVED' ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full text-destructive border-destructive/30 hover:bg-destructive/10 text-xs justify-start"
                  onClick={() => onRequestLifecycleAction('REMOVE', 'Removed from organization')}
                  disabled={busy}
                >
                  <UserX className="size-3.5 mr-2" aria-hidden="true" />
                  Remove from organization
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}
      </aside>
    </div>
  );
}
