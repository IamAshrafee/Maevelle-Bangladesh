'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Clock,
  Filter,
  RefreshCw,
  Search,
  Shield,
  User,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

import { useTeam } from './team-context';
import {
  formatAuditAction,
  type TeamAuditItemDto,
} from './team-types';

export function TeamAuditTimeline({
  initialSearch = '',
}: {
  readonly initialSearch?: string;
} = {}) {
  const { request } = useTeam();
  const [events, setEvents] = useState<readonly TeamAuditItemDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(initialSearch);
  const [selectedAction, setSelectedAction] = useState('ALL');
  const [page, setPage] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [expandedDiffs, setExpandedDiffs] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (initialSearch) {
      setSearch(initialSearch);
      setPage(1);
    }
  }, [initialSearch]);

  const toggleDiff = (id: string) => {
    setExpandedDiffs((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const loadEvents = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: '25',
      });
      if (search.trim()) params.set('search', search.trim());
      if (selectedAction !== 'ALL') params.set('action', selectedAction);

      const res = await request<{
        data: {
          items: readonly TeamAuditItemDto[];
          pagination: { page: number; pageSize: number; totalItems: number; totalPages: number };
        };
      }>(`/admin/team/audit?${params.toString()}`);

      setEvents(res.data.items);
      setTotalItems(res.data.pagination.totalItems);
      setTotalPages(res.data.pagination.totalPages);
    } catch {
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [page, request, search, selectedAction]);

  useEffect(() => {
    void loadEvents();
  }, [loadEvents]);

  const actionFilterOptions = [
    { value: 'ALL', label: 'All Access Events' },
    { value: 'iam.invitation.created', label: 'Invitations Created' },
    { value: 'iam.invitation.accepted', label: 'Invitations Accepted' },
    { value: 'iam.invitation.revoked', label: 'Invitations Revoked' },
    { value: 'iam.membership.permissions_replaced', label: 'Permissions Changed' },
    { value: 'iam.membership.suspended', label: 'Members Suspended' },
    { value: 'iam.membership.restored', label: 'Members Reactivated' },
    { value: 'iam.membership.removed', label: 'Members Removed' },
    { value: 'iam.organization.owner_transferred', label: 'Ownership Transferred' },
    { value: 'iam.membership.sessions_revocation_requested', label: 'Sessions Revoked' },
    { value: 'iam.preset.created', label: 'Role Presets' },
  ];

  return (
    <div className="space-y-4">
      {/* Search and Action Filter */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" aria-hidden="true" />
          <Input
            placeholder="Search by actor, target, or email…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="pl-9 text-xs"
          />
        </div>

        <div className="flex items-center gap-2">
          <select
            className="h-9 rounded-md border border-input bg-background px-3 py-1 text-xs shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            value={selectedAction}
            onChange={(e) => {
              setSelectedAction(e.target.value);
              setPage(1);
            }}
          >
            {actionFilterOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 px-2 text-xs"
            onClick={() => void loadEvents()}
          >
            <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Events Timeline Container */}
      <div className="panel overflow-hidden rounded-lg border border-border bg-card">
        {loading ? (
          <div className="p-12 text-center space-y-3">
            <div className="size-6 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-xs text-muted-foreground">Loading access audit trail…</p>
          </div>
        ) : events.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <Activity className="size-8 text-muted-foreground mx-auto opacity-50" />
            <p className="text-sm font-medium text-foreground">No access events recorded</p>
            <p className="text-xs text-muted-foreground">
              {search || selectedAction !== 'ALL'
                ? 'Try clearing the search query or event filter.'
                : 'Team operations and permission changes will appear here in chronological order.'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {events.map((event) => {
              const meta = formatAuditAction(event.action);
              const isExpanded = expandedDiffs[event.id] ?? false;

              // Parse diff details
              const before = (event.beforeDiff ?? event.before_diff ?? {}) as Record<string, any>;
              const after = (event.afterDiff ?? event.after_diff ?? {}) as Record<string, any>;

              // Calculate capability diffs if present
              const beforeCaps: string[] = before.capabilities ?? [];
              const afterCaps: string[] = after.capabilities ?? [];
              const addedCaps = afterCaps.filter((c) => !beforeCaps.includes(c));
              const removedCaps = beforeCaps.filter((c) => !afterCaps.includes(c));
              const hasCapDiff = addedCaps.length > 0 || removedCaps.length > 0;

              const actorDisplay = event.actorName ?? event.actor_name ?? event.actorEmail ?? event.actor_email ?? 'System';
              const targetDisplay = event.targetName ?? event.target_name ?? event.targetEmail ?? event.target_email;
              const targetEmail = event.targetEmail ?? event.target_email;
              const timestamp = event.occurredAt ?? event.created_at ?? '';

              return (
                <div key={event.id} className="p-4 hover:bg-muted/20 transition-colors space-y-2">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2">
                      <Badge
                        variant="outline"
                        className={`text-[10px] font-semibold ${
                          meta.tone === 'success'
                            ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30'
                            : meta.tone === 'danger'
                              ? 'bg-destructive/10 text-destructive border-destructive/30'
                              : meta.tone === 'warning'
                                ? 'bg-amber-500/10 text-amber-500 border-amber-500/30'
                                : 'bg-muted text-muted-foreground border-border'
                        }`}
                      >
                        {meta.title}
                      </Badge>
                      <span className="font-mono text-muted-foreground text-[11px]">
                        {event.action}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 text-muted-foreground text-[11px]">
                      <Clock className="size-3" />
                      <span>{timestamp ? new Date(timestamp).toLocaleString() : 'N/A'}</span>
                    </div>
                  </div>

                  {/* Actor and Target Details */}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-foreground">
                    <span className="flex items-center gap-1.5">
                      <User className="size-3.5 text-primary" />
                      <span>By:</span>
                      <strong>{actorDisplay}</strong>
                    </span>

                    {targetDisplay ? (
                      <span className="flex items-center gap-1.5 text-muted-foreground">
                        <ArrowRight className="size-3" />
                        <span>Target:</span>
                        <strong className="text-foreground">{targetDisplay}</strong>
                        {targetEmail && targetEmail !== targetDisplay ? (
                          <span className="text-[11px]">({targetEmail})</span>
                        ) : null}
                      </span>
                    ) : null}
                  </div>

                  {/* Reason if provided */}
                  {event.reason ? (
                    <div className="text-xs text-muted-foreground italic bg-muted/30 p-2 rounded border border-border/40">
                      Reason: "{event.reason}"
                    </div>
                  ) : null}

                  {/* Capability diff preview */}
                  {hasCapDiff ? (
                    <div className="pt-1 space-y-1 text-xs">
                      {addedCaps.length > 0 ? (
                        <div className="flex flex-wrap items-center gap-1">
                          <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                            Granted:
                          </span>
                          {addedCaps.map((c) => (
                            <span
                              key={c}
                              className="rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 px-1.5 py-0.2 font-mono text-[10px]"
                            >
                              +{c}
                            </span>
                          ))}
                        </div>
                      ) : null}

                      {removedCaps.length > 0 ? (
                        <div className="flex flex-wrap items-center gap-1">
                          <span className="text-[11px] font-semibold text-destructive">
                            Revoked:
                          </span>
                          {removedCaps.map((c) => (
                            <span
                              key={c}
                              className="rounded bg-destructive/10 text-destructive border border-destructive/20 px-1.5 py-0.2 font-mono text-[10px]"
                            >
                              -{c}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  {/* Status transition diff */}
                  {before.status && after.status ? (
                    <div className="flex items-center gap-1.5 text-xs pt-1">
                      <span className="text-muted-foreground">Status transition:</span>
                      <Badge variant="outline" className="text-[10px]">
                        {before.status}
                      </Badge>
                      <ArrowRight className="size-3 text-muted-foreground" />
                      <Badge variant="secondary" className="text-[10px]">
                        {after.status}
                      </Badge>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}

        {/* Pagination Footer */}
        {totalPages > 1 ? (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-muted/20 text-xs text-muted-foreground">
            <div>
              Showing page <strong>{page}</strong> of <strong>{totalPages}</strong> ({totalItems} total events)
            </div>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1 || loading}
              >
                <ChevronLeft className="size-3.5 mr-0.5" /> Previous
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages || loading}
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
