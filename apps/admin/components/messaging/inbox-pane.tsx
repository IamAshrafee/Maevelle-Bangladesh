'use client';

import { CheckSquare2, ChevronsUp, Facebook, Filter, MessageCircle, Search, Star, X } from 'lucide-react';
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { formatDistanceToNowStrict } from 'date-fns';

import type { ConversationPriority, ConversationStatus } from '@maevelle/contracts/messaging';

import { StatusBadge } from '@/components/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/page-shell';
import { SearchInput } from '@/components/ui/search-input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { toast } from '@/components/ui/toast';
import * as api from './api';
import { useMessaging } from './messaging-provider';
import type { ConversationScope, InboxFilters, InboxSort } from './types';
import type { InboxCounts } from '@maevelle/contracts/messaging';

const scopeOptions: readonly {
  value: ConversationScope;
  label: string;
  countKey: keyof InboxCounts;
}[] = [
  { value: 'mine', label: 'Mine', countKey: 'mine' },
  { value: 'unassigned', label: 'Unassigned', countKey: 'unassigned' },
  { value: 'all', label: 'All', countKey: 'all' },
];

const statuses: readonly ConversationStatus[] = ['NEW', 'OPEN', 'PENDING', 'RESOLVED', 'CLOSED'];
const priorities: readonly ConversationPriority[] = ['LOW', 'NORMAL', 'HIGH', 'URGENT'];

export function InboxPane() {
  const messaging = useMessaging();
  const [query, setQuery] = useState(messaging.filters.search ?? '');
  const deferredQuery = useDeferredValue(query.trim());
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [draft, setDraft] = useState<InboxFilters>(messaging.filters);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const canViewAll = messaging.capabilities.includes('messaging.inbox.view_all');
  const canBulkStatus = messaging.capabilities.includes('messaging.status.manage');
  const canBulkPriority = messaging.capabilities.includes('messaging.priority.manage');

  useEffect(() => {
    const next = { ...messaging.filters };
    if (deferredQuery) next.search = deferredQuery;
    else delete next.search;
    messaging.setFilters(next);
  }, [deferredQuery]);

  const activeFilterCount = useMemo(
    () =>
      [
        messaging.filters.status,
        messaging.filters.channelKind,
        messaging.filters.priority,
        messaging.filters.unread,
        messaging.filters.starred,
        messaging.filters.needsReply,
        messaging.filters.followUp,
        messaging.filters.tagId,
      ].filter(Boolean).length,
    [messaging.filters],
  );

  function setScope(scope: ConversationScope) {
    messaging.setFilters({ ...messaging.filters, scope });
    setSelected(new Set());
  }

  function toggleSelection(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function bulk(action: Readonly<Record<string, unknown>>) {
    const items = messaging.conversations
      .filter((conversation) => selected.has(conversation.id))
      .map((conversation) => ({
        conversationId: conversation.id,
        version: conversation.version,
      }));
    if (!items.length) return;
    setBulkBusy(true);
    try {
      const outcomes = await api.bulkUpdateConversations(items, action);
      const failed = outcomes.filter((outcome) => !outcome.ok);
      toast.add({
        title: failed.length ? 'Bulk action partially completed' : 'Bulk action completed',
        description: failed.length
          ? `${outcomes.length - failed.length} updated; ${failed.length} need review.`
          : `${outcomes.length} conversations updated.`,
        type: failed.length ? 'warning' : 'success',
      });
      setSelected(new Set());
      await messaging.refreshInbox();
    } catch (error) {
      toast.add({
        title: 'Bulk action failed',
        description: error instanceof Error ? error.message : 'Try again.',
        type: 'error',
      });
    } finally {
      setBulkBusy(false);
    }
  }

  return (
    <section
      className="flex h-full min-h-0 flex-col border-r border-border bg-card"
      aria-label="Conversation inbox"
    >
      <div className="shrink-0 space-y-3 border-b border-border p-3">
        <div className="flex items-center gap-2">
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder="Search conversations"
            aria-label="Search conversations"
            className="flex-1"
          />
          <Button
            variant="outline"
            size="icon"
            onClick={() => {
              setDraft(messaging.filters);
              setFiltersOpen(true);
            }}
            aria-label="Open inbox filters"
            className="relative shrink-0"
          >
            <Filter className="size-4" />
            {activeFilterCount ? (
              <span className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground">
                {activeFilterCount}
              </span>
            ) : null}
          </Button>
        </div>

        <div className="flex gap-1 overflow-x-auto pb-1" aria-label="Inbox scope">
          {scopeOptions.map((option) => {
            if (option.value === 'all' && !canViewAll) return null;
            const count = messaging.counts?.[option.countKey];
            return (
              <Button
                key={option.value}
                variant={messaging.filters.scope === option.value ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setScope(option.value)}
                className="min-h-9 shrink-0"
              >
                {option.label}
                {typeof count === 'number' ? (
                  <Badge variant="outline" className="ml-1 tabular-nums font-mono">
                    {count}
                  </Badge>
                ) : null}
              </Button>
            );
          })}
        </div>

        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span
              className={cn(
                'size-2 rounded-full',
                messaging.realtimeState === 'connected' ? 'bg-success' : 'bg-warning',
              )}
            />
            {messaging.realtimeState === 'connected'
              ? 'Live updates'
              : messaging.realtimeState === 'offline'
                ? 'Offline'
                : 'Reconnecting'}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              setSelected(
                selected.size === messaging.conversations.length
                  ? new Set()
                  : new Set(messaging.conversations.map((item) => item.id)),
              )
            }
          >
            <CheckSquare2 className="size-4" />
            Select
          </Button>
        </div>
      </div>

      {selected.size ? (
        <div className="flex shrink-0 items-center gap-2 overflow-x-auto border-b border-border bg-primary-subtle p-2">
          <span className="px-1 text-xs font-medium tabular-nums">{selected.size} selected</span>
          {canBulkStatus ? (
            <Button
              size="sm"
              variant="outline"
              disabled={bulkBusy}
              onClick={() => void bulk({ type: 'STATUS', status: 'RESOLVED' })}
            >
              Resolve
            </Button>
          ) : null}
          {canBulkPriority ? (
            <Button
              size="sm"
              variant="outline"
              disabled={bulkBusy}
              onClick={() => void bulk({ type: 'PRIORITY', priority: 'HIGH' })}
            >
              High priority
            </Button>
          ) : null}
          <Button variant="ghost" size="icon-sm" onClick={() => setSelected(new Set())}>
            <X className="size-4" />
            <span className="sr-only">Clear selection</span>
          </Button>
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {messaging.inboxState === 'loading' && !messaging.conversations.length ? (
          <LoadingState message="Loading conversations…" className="h-full" />
        ) : null}
        {messaging.inboxState === 'error' && !messaging.conversations.length ? (
          <ErrorState
            title="Inbox unavailable"
            message={messaging.inboxError}
            onRetry={() => void messaging.refreshInbox()}
            className="m-3"
          />
        ) : null}
        {messaging.inboxState === 'ready' && !messaging.conversations.length ? (
          <EmptyState
            icon={Search}
            title={query ? 'No matching conversations' : 'No conversations here'}
            description={
              query
                ? 'Clear the search or adjust the active filters.'
                : 'New customer conversations will appear here automatically.'
            }
            className="m-3 border-0"
          />
        ) : null}
        <div role="list" aria-label="Conversations">
          {messaging.conversations.map((item) => {
            const active = item.id === messaging.selectedConversationId;
            const isSelected = selected.has(item.id);
            return (
              <div
                key={item.id}
                className={cn(
                  'group relative flex border-b border-border transition-colors duration-150',
                  active ? 'bg-primary-subtle' : 'hover:bg-muted/60',
                )}
                role="listitem"
              >
                {selected.size ? (
                  <div className="flex items-center pl-3">
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => toggleSelection(item.id)}
                      aria-label={`Select ${item.contact.displayName ?? 'conversation'}`}
                    />
                  </div>
                ) : null}
                <button
                  type="button"
                  onClick={() => messaging.selectConversation(item.id)}
                  className="min-w-0 flex-1 p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  aria-current={active ? 'true' : undefined}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        {item.unreadCount ? (
                          <span
                            className="size-2 shrink-0 rounded-full bg-primary"
                            aria-hidden="true"
                          />
                        ) : null}
                        <span
                          className={cn('truncate text-sm', item.unreadCount && 'font-semibold')}
                        >
                          {item.contact.displayName ?? (item.channel.kind === 'FACEBOOK' ? 'Facebook user' : 'Website visitor')}
                        </span>
                        {item.isStarred ? (
                          <Star className="size-3.5 shrink-0 fill-warning text-warning" />
                        ) : null}
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                        {item.lastMessage?.preview || 'Conversation started'}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <time className="text-[11px] tabular-nums font-mono text-muted-foreground">
                        {item.lastMessage
                          ? formatDistanceToNowStrict(new Date(item.lastMessage.createdAt), {
                              addSuffix: true,
                            })
                          : ''}
                      </time>
                      {item.unreadCount ? (
                        <span className="mt-1 ml-auto flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground tabular-nums">
                          {item.unreadCount}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <StatusBadge status={item.status} />
                    {item.priority !== 'NORMAL' ? (
                      <Badge variant="outline" className="text-[10px]">
                        <ChevronsUp className="size-3" /> {item.priority.toLowerCase()}
                      </Badge>
                    ) : null}
                    {item.channel.kind === 'FACEBOOK' ? (
                      <Badge
                        variant="secondary"
                        className="text-[10px] bg-[#1877f2]/10 text-[#1877f2] border-[#1877f2]/20 gap-1 font-medium"
                      >
                        <Facebook className="size-2.5" /> Messenger
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="text-[10px]">
                        <MessageCircle className="size-3" /> {item.channel.kind.toLowerCase()}
                      </Badge>
                    )}
                    {item.followUp ? (
                      <Badge
                        variant="outline"
                        className={cn(
                          'text-[10px]',
                          item.followUp.isOverdue && 'border-destructive text-destructive',
                        )}
                      >
                        Follow-up
                      </Badge>
                    ) : null}
                    {item.tags?.slice(0, 2).map((tag) => (
                      <Badge
                        key={tag.id}
                        variant="outline"
                        className="max-w-24 truncate text-[10px]"
                      >
                        {tag.label}
                      </Badge>
                    ))}
                  </div>
                  <p className="mt-1.5 truncate text-[11px] text-muted-foreground">
                    {item.assignee?.displayName ?? 'Unassigned'}
                    {item.needsReply ? ' · Needs reply' : ''}
                  </p>
                </button>
              </div>
            );
          })}
        </div>
        {messaging.hasMoreConversations ? (
          <div className="p-3">
            <Button
              variant="outline"
              className="w-full"
              onClick={() => void messaging.loadMoreConversations()}
            >
              Load more conversations
            </Button>
          </div>
        ) : null}
      </div>

      <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
        <SheetContent
          side="bottom"
          className="max-h-[92dvh] rounded-t-2xl sm:inset-y-0 sm:left-auto sm:right-0 sm:h-full sm:max-h-none sm:w-96 sm:rounded-none sm:border-l"
        >
          <SheetHeader>
            <SheetTitle>Filter conversations</SheetTitle>
            <SheetDescription>
              Filters are applied to the authoritative inbox query.
            </SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-4">
            <FilterSelect
              label="Status"
              value={draft.status ?? ''}
              onChange={(value) =>
                setDraft(
                  optionalFilter(
                    draft,
                    'status',
                    (value || undefined) as ConversationStatus | undefined,
                  ),
                )
              }
              options={statuses.map((value) => ({ value, label: value.toLowerCase() }))}
            />
            <FilterSelect
              label="Priority"
              value={draft.priority ?? ''}
              onChange={(value) =>
                setDraft(
                  optionalFilter(
                    draft,
                    'priority',
                    (value || undefined) as ConversationPriority | undefined,
                  ),
                )
              }
              options={priorities.map((value) => ({ value, label: value.toLowerCase() }))}
            />
            <FilterSelect
              label="Channel"
              value={draft.channelKind ?? ''}
              onChange={(value) =>
                setDraft(
                  optionalFilter(
                    draft,
                    'channelKind',
                    (value || undefined) as InboxFilters['channelKind'],
                  ),
                )
              }
              options={[
                { value: 'WEBSITE', label: 'Website' },
                { value: 'FACEBOOK', label: 'Facebook Messenger' },
              ]}
            />
            <FilterSelect
              label="Follow-up"
              value={draft.followUp ?? ''}
              onChange={(value) =>
                setDraft(
                  optionalFilter(
                    draft,
                    'followUp',
                    (value || undefined) as InboxFilters['followUp'],
                  ),
                )
              }
              options={[
                { value: 'pending', label: 'Pending' },
                { value: 'overdue', label: 'Overdue' },
                { value: 'none', label: 'None' },
              ]}
            />
            <FilterSelect
              label="Sort"
              value={draft.sort}
              onChange={(value) => setDraft({ ...draft, sort: value as InboxSort })}
              options={[
                { value: 'newest', label: 'Latest activity' },
                { value: 'oldest', label: 'Oldest waiting' },
                { value: 'priority', label: 'Priority' },
                { value: 'follow_up', label: 'Follow-up due' },
                { value: 'created_newest', label: 'Newest created' },
                { value: 'created_oldest', label: 'Oldest created' },
              ]}
              includeAny={false}
            />
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  ['unread', 'Unread'],
                  ['starred', 'Starred'],
                  ['needsReply', 'Needs reply'],
                ] as const
              ).map(([key, label]) => (
                <Button
                  key={key}
                  variant={draft[key as keyof InboxFilters] ? 'secondary' : 'outline'}
                  onClick={() =>
                    setDraft(optionalFilter(draft, key, draft[key] ? undefined : true))
                  }
                >
                  {label}
                </Button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 border-t border-border p-4">
            <Button
              variant="outline"
              onClick={() => setDraft({ scope: draft.scope, sort: 'newest' })}
            >
              Reset
            </Button>
            <Button
              onClick={() => {
                const next = { ...draft };
                if (deferredQuery) next.search = deferredQuery;
                else delete next.search;
                messaging.setFilters(next);
                setFiltersOpen(false);
              }}
            >
              Apply filters
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </section>
  );
}

function optionalFilter<K extends keyof InboxFilters>(
  filters: InboxFilters,
  key: K,
  value: InboxFilters[K] | undefined,
): InboxFilters {
  const next = { ...filters };
  if (value === undefined) delete next[key];
  else next[key] = value;
  return next;
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
  includeAny = true,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly { value: string; label: string }[];
  includeAny?: boolean;
}) {
  return (
    <label className="space-y-1.5 text-sm font-medium">
      <span>{label}</span>
      <NativeSelect value={value} onChange={(event) => onChange(event.target.value)}>
        {includeAny ? <NativeSelectOption value="">Any</NativeSelectOption> : null}
        {options.map((option) => (
          <NativeSelectOption key={option.value} value={option.value}>
            {option.label}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </label>
  );
}
