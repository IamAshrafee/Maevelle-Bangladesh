'use client';

import * as React from 'react';
import { Building2, Laptop, ShieldCheck, User } from 'lucide-react';
import type { UserAccountOverviewDto } from '@maevelle/contracts';
import { StatusBadge } from '@/components/status-badge';
import { getInitials } from './account-utils';

interface AccountIdentityHeaderProps {
  readonly overview: UserAccountOverviewDto;
  readonly sessionsCount: number;
}

export function AccountIdentityHeader({ overview, sessionsCount }: AccountIdentityHeaderProps) {
  const { profile, membership, security } = overview;
  const initials = getInitials(profile.name);

  // Friendly role display
  const roleLabel =
    membership?.membershipType === 'OWNER'
      ? 'Owner & Administrator'
      : membership?.membershipType === 'STANDARD'
        ? 'Team Member'
        : 'Authorized Operator';

  const orgName = membership?.organizationName || 'Maevelle Bangladesh';

  return (
    <div className="relative overflow-hidden rounded-xl border border-border bg-card p-6 shadow-2xs">
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5">
        {/* User Avatar */}
        <div className="relative shrink-0">
          {profile.image ? (
            <img
              src={profile.image}
              alt={profile.name || 'User avatar'}
              className="size-18 sm:size-20 rounded-full object-cover border-2 border-border shadow-xs"
            />
          ) : (
            <div
              className="size-18 sm:size-20 rounded-full bg-primary/10 text-primary font-bold text-2xl flex items-center justify-center border-2 border-primary/25 shadow-xs select-none"
              aria-hidden="true"
            >
              {initials ? initials : <User className="size-8" />}
            </div>
          )}
        </div>

        {/* Identity Details */}
        <div className="space-y-1.5 min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground truncate max-w-md">
              {profile.name || 'Maevelle Operator'}
            </h1>
            <StatusBadge
              status={profile.emailVerified ? 'VERIFIED' : 'UNVERIFIED'}
              tone={profile.emailVerified ? 'success' : 'warning'}
            />
          </div>

          <p className="text-sm text-muted-foreground truncate max-w-md font-mono">
            {profile.email}
          </p>

          <div className="flex flex-wrap items-center gap-3 pt-1 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5 text-foreground/80 font-medium">
              <Building2 className="size-3.5 text-primary shrink-0" aria-hidden="true" />
              <span>
                {roleLabel} · <span className="text-foreground">{orgName}</span>
              </span>
            </div>
          </div>
        </div>

        {/* Badges / Security Posture Overview */}
        <div className="flex flex-wrap sm:flex-col items-start sm:items-end gap-2 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-border/60 w-full sm:w-auto">
          <StatusBadge
            status={
              security.twoFactorEnabled
                ? '2FA ENABLED'
                : security.twoFactorRequired
                  ? '2FA REQUIRED'
                  : '2FA OPTIONAL'
            }
            tone={security.twoFactorEnabled ? 'success' : 'warning'}
          />

          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-muted/50 border border-border/60 text-xs text-muted-foreground tabular-nums font-mono">
            <Laptop className="size-3 text-muted-foreground" aria-hidden="true" />
            <span>
              {sessionsCount} active {sessionsCount === 1 ? 'session' : 'sessions'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
