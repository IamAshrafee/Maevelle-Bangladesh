'use client';

import * as React from 'react';
import {
  Clock,
  KeyRound,
  Laptop,
  Mail,
  RefreshCw,
  Shield,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
} from 'lucide-react';
import type { AccountSecurityActivityItemDto } from '@maevelle/contracts';
import { PagePanel, PageSection } from '@/components/ui/page-shell';
import { formatDateTime, formatRelativeTime } from './account-utils';

interface SecurityActivityTabProps {
  readonly activities: readonly AccountSecurityActivityItemDto[];
  readonly loading: boolean;
}

function getActivityIcon(action: string): React.ElementType {
  const normalized = action.toLowerCase();
  if (normalized.includes('password')) return KeyRound;
  if (normalized.includes('2fa') || normalized.includes('two_factor') || normalized.includes('totp'))
    return ShieldCheck;
  if (normalized.includes('session') || normalized.includes('device')) return Laptop;
  if (normalized.includes('email') || normalized.includes('verify')) return Mail;
  if (normalized.includes('profile') || normalized.includes('name') || normalized.includes('avatar'))
    return UserCheck;
  return Shield;
}

export function SecurityActivityTab({ activities, loading }: SecurityActivityTabProps) {
  return (
    <div className="space-y-6">
      <PageSection
        title="Recent Security Activity"
        description="A log of recent security-sensitive events associated with your personal Maevelle account."
      >
        <PagePanel>
          {loading && activities.length === 0 ? (
            <div className="py-10 text-center space-y-2">
              <RefreshCw className="size-5 text-primary animate-spin mx-auto" />
              <p className="text-xs text-muted-foreground">Loading recent activity…</p>
            </div>
          ) : activities.length === 0 ? (
            <div className="py-10 text-center space-y-2">
              <Clock className="size-8 text-muted-foreground/60 mx-auto" aria-hidden="true" />
              <p className="text-sm font-medium text-foreground">No recent security events</p>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                Actions like password changes, 2FA configuration, and session revocations will appear here.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border/60">
              {activities.map((act) => {
                const ActionIcon = getActivityIcon(act.action);

                return (
                  <div key={act.id} className="py-3.5 flex items-start gap-3.5">
                    <div className="p-2 rounded-lg bg-primary/10 text-primary shrink-0 mt-0.5 border border-primary/20">
                      <ActionIcon className="size-4" aria-hidden="true" />
                    </div>

                    <div className="flex-1 space-y-1 min-w-0">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                        <strong className="text-xs font-semibold text-foreground capitalize">
                          {act.title || act.action.replace(/_/g, ' ')}
                        </strong>
                        <span className="text-[11px] text-muted-foreground tabular-nums font-mono">
                          {formatRelativeTime(act.occurredAt)} · {formatDateTime(act.occurredAt)}
                        </span>
                      </div>

                      <p className="text-xs text-muted-foreground leading-relaxed">
                        {act.description}
                      </p>

                      {act.ipAddress ? (
                        <span className="text-[10px] text-muted-foreground font-mono tabular-nums block">
                          Source IP: {act.ipAddress}
                        </span>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </PagePanel>
      </PageSection>
    </div>
  );
}
