'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ChevronLeft,
  ChevronRight,
  MapPin,
  MoreHorizontal,
  Search,
  Shield,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  UserRound,
  Users,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
  onRefresh,
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

  return (
    <div className="space-y-4">
      {/* Search and Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" aria-hidden="true" />
          <Input
            placeholder="Search by name or email…"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Status:</span>
          {[
            { id: 'ALL', label: 'All Members' },
            { id: 'ACTIVE', label: 'Active' },
            { id: 'DISABLED', label: 'Suspended' },
            { id: 'REMOVED', label: 'Removed' },
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
      </div>

      {/* Table Container */}
      <div className="panel data-table-shell overflow-hidden rounded-lg border border-border">
        {loading ? (
          <div className="p-12 text-center space-y-3">
            <div className="size-6 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-xs text-muted-foreground">Loading organization members…</p>
          </div>
        ) : members.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <Users className="size-8 text-muted-foreground mx-auto opacity-50" />
            <p className="text-sm font-medium text-foreground">No team members match your criteria</p>
            <p className="text-xs text-muted-foreground">
              {searchQuery || statusFilter !== 'ALL'
                ? 'Try clearing the search query or changing the status filter.'
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
                {members.map((member) => {
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
                        {member.two_factor_enabled ? (
                          <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                            <ShieldCheck className="size-3.5" />
                            Enabled
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-muted-foreground">
                            <ShieldAlert className="size-3.5 text-amber-500" />
                            Disabled
                          </span>
                        )}
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
