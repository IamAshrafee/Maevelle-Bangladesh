'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ChevronLeft,
  ChevronRight,
  MapPin,
  Search,
  ShieldAlert,
  ShieldCheck,
  Users,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

import { StatusBadge } from '../status-badge';
import { useTeam } from './team-context';
import {
  getRoleSummary,
  type TeamMemberListItemDto,
} from './team-types';

export function TeamMembersList({
  members,
  loading,
  pagination,
  searchQuery,
  onSearchChange,
  statusFilter,
  onStatusChange,
  onPageChange,
}: {
  readonly members: readonly TeamMemberListItemDto[];
  readonly loading: boolean;
  readonly pagination: {
    readonly page: number;
    readonly pageSize: number;
    readonly totalItems: number;
    readonly totalPages: number;
  };
  readonly searchQuery: string;
  readonly onSearchChange: (query: string) => void;
  readonly statusFilter: string;
  readonly onStatusChange: (status: string) => void;
  readonly onPageChange: (page: number) => void;
  readonly onRefresh: () => Promise<void>;
}) {
  const router = useRouter();
  const { activeActor, presets } = useTeam();
  const [twoFactorFilter, setTwoFactorFilter] = useState<'ALL' | 'ENABLED' | 'REQUIRED' | 'DISABLED'>('ALL');

  const filteredMembers = members.filter((member) => {
    if (twoFactorFilter === 'ENABLED') return member.two_factor_enabled;
    if (twoFactorFilter === 'REQUIRED') return !member.two_factor_enabled && member.two_factor_required;
    if (twoFactorFilter === 'DISABLED') return !member.two_factor_enabled && !member.two_factor_required;
    return true;
  });

  return (
    <div className="space-y-4">
      {/* Search and Filters */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" aria-hidden="true" />
          <Input
            placeholder="Search by name or email…"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Status:</span>
            {[
              { id: 'ALL', label: 'All' },
              { id: 'ACTIVE', label: 'Active' },
              { id: 'DISABLED', label: 'Suspended' },
            ].map(({ id, label }) => (
              <Button
                key={id}
                type="button"
                variant={statusFilter === id ? 'default' : 'outline'}
                size="sm"
                className="h-8 text-xs px-2.5"
                onClick={() => onStatusChange(id)}
              >
                {label}
              </Button>
            ))}
          </div>

          <div className="flex items-center gap-1.5 border-l border-border/60 pl-3">
            <span className="text-xs text-muted-foreground">2FA:</span>
            {[
              { id: 'ALL', label: 'All' },
              { id: 'ENABLED', label: 'Enabled' },
              { id: 'REQUIRED', label: 'Required' },
              { id: 'DISABLED', label: 'Not enabled' },
            ].map(({ id, label }) => (
              <Button
                key={id}
                type="button"
                variant={twoFactorFilter === id ? 'secondary' : 'ghost'}
                size="sm"
                className={`h-8 text-xs px-2.5 ${
                  twoFactorFilter === id
                    ? 'bg-primary/10 text-primary font-semibold border border-primary/20'
                    : 'text-muted-foreground'
                }`}
                onClick={() => setTwoFactorFilter(id as typeof twoFactorFilter)}
              >
                {label}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {/* Table Container */}
      <div className="panel data-table-shell overflow-hidden rounded-lg border border-border">
        {loading ? (
          <div className="p-12 text-center space-y-3">
            <div className="size-6 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-xs text-muted-foreground">Loading organization members…</p>
          </div>
        ) : filteredMembers.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <Users className="size-8 text-muted-foreground mx-auto opacity-50" />
            <p className="text-sm font-medium text-foreground">No team members match your criteria</p>
            <p className="text-xs text-muted-foreground">
              {searchQuery || statusFilter !== 'ALL' || twoFactorFilter !== 'ALL'
                ? 'Try clearing the search query or changing the filter options.'
                : 'No members currently found in this organization.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left text-xs font-semibold text-muted-foreground">
                  <th className="py-3 px-4">Member</th>
                  <th className="py-3 px-4">Role Profile</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">2FA Posture</th>
                  <th className="py-3 px-4">Location Scope</th>
                  <th className="py-3 px-4">Joined</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {filteredMembers.map((member) => {
                  const isSelf = activeActor.membershipId === member.id;
                  const isOwner = member.membership_type === 'OWNER';
                  const roleName = getRoleSummary(member.capabilities, presets, member.membership_type);

                  return (
                    <tr
                      key={member.id}
                      onClick={() => router.push(`/team/${member.id}`)}
                      className="hover:bg-muted/40 transition-colors cursor-pointer group"
                    >
                      {/* Name & Email */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div className="size-9 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center text-xs shrink-0 border border-primary/20">
                            {member.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="flex items-center gap-1.5 font-medium text-foreground group-hover:text-primary transition-colors">
                              <span>{member.name}</span>
                              {isSelf ? (
                                <Badge
                                  variant="secondary"
                                  className="text-[10px] py-0 px-1 bg-primary/15 text-primary border-primary/30"
                                >
                                  You
                                </Badge>
                              ) : null}
                              {isOwner ? (
                                <Badge className="text-[10px] py-0 px-1 bg-amber-500/15 text-amber-500 border-amber-500/30">
                                  Owner
                                </Badge>
                              ) : null}
                            </div>
                            <div className="text-xs text-muted-foreground">{member.email}</div>
                          </div>
                        </div>
                      </td>

                      {/* Role Profile */}
                      <td className="py-3 px-4">
                        <span className="text-xs font-medium text-foreground">{roleName}</span>
                        <div className="text-[11px] text-muted-foreground">
                          {member.capabilities.length} capabilities
                        </div>
                      </td>

                      {/* Status */}
                      <td className="py-3 px-4">
                        <StatusBadge status={member.status} />
                      </td>

                      {/* 2FA Posture */}
                      <td className="py-3 px-4 text-xs">
                        <StatusBadge
                          status={
                            member.two_factor_enabled
                              ? 'Enabled'
                              : member.two_factor_required
                                ? 'Required'
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
                      </td>

                      {/* Location Scope */}
                      <td className="py-3 px-4 text-xs">
                        {member.scopes.length > 0 ? (
                          <Badge variant="outline" className="text-[11px] py-0 gap-1 font-normal">
                            <MapPin className="size-3 text-primary" />
                            {member.scopes.length} location{member.scopes.length === 1 ? '' : 's'}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground">All locations</span>
                        )}
                      </td>

                      {/* Joined Date */}
                      <td className="py-3 px-4 text-xs text-muted-foreground">
                        {new Date(member.created_at).toLocaleDateString()}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <Button
                          render={<Link href={`/team/${member.id}`} />}
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2 text-xs"
                        >
                          View & manage
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        {pagination.totalPages > 1 ? (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-muted/20 text-xs text-muted-foreground">
            <div>
              Showing page <strong>{pagination.page}</strong> of{' '}
              <strong>{pagination.totalPages}</strong> ({pagination.totalItems} total members)
            </div>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => onPageChange(pagination.page - 1)}
                disabled={pagination.page <= 1 || loading}
              >
                <ChevronLeft className="size-3.5 mr-0.5" /> Previous
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => onPageChange(pagination.page + 1)}
                disabled={pagination.page >= pagination.totalPages || loading}
              >
                Next <ChevronRight className="size-3.5 ml-0.5" />
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
