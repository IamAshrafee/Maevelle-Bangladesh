'use client';

import { Globe, Laptop, LogOut, Shield } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { AuthSessionDto, TeamMemberDetailDto } from '../team-types';

export interface MemberSecurityTabProps {
  readonly member: TeamMemberDetailDto;
  readonly sessions: readonly AuthSessionDto[];
  readonly isSelf: boolean;
  readonly canRevokeSessions: boolean;
  readonly busy: boolean;
  readonly onRequestRevokeSessions: () => void;
}

/**
 * Multi-factor authentication posture and active device session inspection tab.
 */
export function MemberSecurityTab({
  member,
  sessions,
  isSelf,
  canRevokeSessions,
  busy,
  onRequestRevokeSessions,
}: MemberSecurityTabProps) {
  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border/60 bg-card p-5 flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Shield className="size-4 text-primary" aria-hidden="true" />
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
              ? 'bg-success/15 text-success border-success/30 text-xs shrink-0'
              : 'bg-warning/15 text-warning border-warning/30 text-xs shrink-0'
          }
        >
          {member.two_factor_enabled ? 'MFA Protected' : 'MFA Not Active'}
        </Badge>
      </div>

      <div className="rounded-xl border border-border/60 bg-card p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/40 pb-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              <Laptop className="size-4 text-primary" aria-hidden="true" />
              Active Administrator Sessions (
              <span className="font-mono tabular-nums">{sessions.length}</span>)
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
              className="text-xs shrink-0"
              onClick={onRequestRevokeSessions}
              disabled={busy}
            >
              <LogOut className="size-3.5 mr-1.5" aria-hidden="true" /> Revoke all sessions
            </Button>
          ) : null}
        </div>

        {sessions.length === 0 ? (
          <div className="py-12 text-center space-y-2 border border-dashed border-border/60 rounded-lg">
            <Laptop
              className="size-8 text-muted-foreground mx-auto opacity-30"
              aria-hidden="true"
            />
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
                    <Globe className="size-3.5 text-primary" aria-hidden="true" />
                    {session.ipAddress || 'IP Not Recorded'}
                  </span>
                  <Badge variant="outline" className="text-[10px] text-success border-success/30">
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
                    <span className="font-mono tabular-nums">
                      {session.createdAt
                        ? new Date(session.createdAt).toLocaleDateString()
                        : 'Unknown'}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[10px] uppercase font-semibold text-muted-foreground/70">
                      Expires
                    </span>
                    <span className="font-mono tabular-nums">
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
    </div>
  );
}
