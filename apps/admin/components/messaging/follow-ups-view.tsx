'use client';

import {
  CalendarClock,
  Check,
  Edit2,
  MessageCircle,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';

import type { AgentAvailabilityView, FollowUpView } from '@maevelle/contracts/messaging';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/page-shell';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import * as api from './api';
import { formatDateTime } from './format';
import { useMessaging } from './messaging-provider';

type FollowUpStatusFilter = 'PENDING' | 'COMPLETED' | 'CANCELLED';

export function FollowUpsView({ onOpenConversation }: { onOpenConversation: () => void }) {
  const messaging = useMessaging();
  const [items, setItems] = useState<readonly FollowUpView[]>([]);
  const [statusFilter, setStatusFilter] = useState<FollowUpStatusFilter>('PENDING');
  const [mineOnly, setMineOnly] = useState(true);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [editingItem, setEditingItem] = useState<FollowUpView | null>(null);
  const [agents, setAgents] = useState<readonly AgentAvailabilityView[]>([]);

  async function load() {
    setState('loading');
    try {
      const [nextItems, eligibleAgents] = await Promise.all([
        api.listFollowUps({
          status: statusFilter,
          mine: mineOnly,
          limit: 200,
        }),
        messaging.capabilities.includes('messaging.availability.view')
          ? api.listEligibleAgents().catch(() => [])
          : Promise.resolve([]),
      ]);
      setItems(nextItems);
      setAgents(eligibleAgents);
      setState('ready');
    } catch {
      setState('error');
    }
  }

  useEffect(() => {
    void load();
  }, [statusFilter, mineOnly]);

  async function transition(item: FollowUpView, status: 'COMPLETED' | 'CANCELLED') {
    try {
      await api.transitionFollowUp(item.id, item.version, status);
      toast.add({
        title: status === 'COMPLETED' ? 'Follow-up completed' : 'Follow-up cancelled',
        type: 'success',
      });
      await load();
      await messaging.refreshInbox();
    } catch (error) {
      toast.add({
        title: 'Follow-up was not updated',
        description: error instanceof Error ? error.message : 'Try again.',
        type: 'error',
      });
    }
  }

  return (
    <div className="h-full overflow-y-auto p-4 sm:p-6">
      <div className="mx-auto max-w-4xl space-y-4">
        {/* Filter bar */}
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-1.5" aria-label="Status filter">
            <Button
              variant={statusFilter === 'PENDING' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setStatusFilter('PENDING')}
            >
              Pending
            </Button>
            <Button
              variant={statusFilter === 'COMPLETED' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setStatusFilter('COMPLETED')}
            >
              Completed
            </Button>
            <Button
              variant={statusFilter === 'CANCELLED' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setStatusFilter('CANCELLED')}
            >
              Cancelled
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant={mineOnly ? 'secondary' : 'outline'}
              size="sm"
              onClick={() => setMineOnly(true)}
            >
              My follow-ups
            </Button>
            <Button
              variant={!mineOnly ? 'secondary' : 'outline'}
              size="sm"
              onClick={() => setMineOnly(false)}
            >
              All team
            </Button>
          </div>
        </div>

        {state === 'loading' ? (
          <LoadingState message="Loading follow-ups…" className="h-64" />
        ) : null}
        {state === 'error' ? (
          <ErrorState
            title="Follow-ups unavailable"
            message="The follow-up queue could not be loaded."
            onRetry={() => void load()}
            className="m-4"
          />
        ) : null}
        {state === 'ready' && !items.length ? (
          <EmptyState
            icon={CalendarClock}
            title={
              statusFilter === 'PENDING'
                ? mineOnly
                  ? 'You are all caught up'
                  : 'No pending team follow-ups'
                : `No ${statusFilter.toLowerCase()} follow-ups`
            }
            description={
              statusFilter === 'PENDING'
                ? 'Follow-up reminders scheduled from customer conversations will appear here.'
                : 'Items with this status will show here once processed.'
            }
            className="m-4 border-0"
          />
        ) : null}

        {state === 'ready' && items.length ? (
          <div className="space-y-3" role="list" aria-label="Follow-up queue">
            {items.map((item) => (
              <article
                key={item.id}
                role="listitem"
                className={cn(
                  'rounded-xl border border-border bg-card p-4 transition-colors',
                  item.isOverdue && item.status === 'PENDING' && 'border-destructive/50 bg-destructive/5',
                )}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-sm font-semibold">Conversation reminder</h3>
                      {item.status === 'PENDING' ? (
                        item.isOverdue ? (
                          <Badge variant="destructive" className="text-xs">
                            Overdue
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs">
                            Pending
                          </Badge>
                        )
                      ) : (
                        <Badge variant="secondary" className="text-xs capitalize">
                          {item.status.toLowerCase()}
                        </Badge>
                      )}
                    </div>
                    <p className="mt-1 font-mono text-xs tabular-nums text-muted-foreground">
                      Due {formatDateTime(item.dueAt)}
                    </p>
                    {item.note ? (
                      <p className="mt-2 text-sm text-foreground whitespace-pre-wrap">{item.note}</p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        messaging.selectConversation(item.conversationId);
                        onOpenConversation();
                      }}
                    >
                      <MessageCircle className="size-4" /> Open
                    </Button>
                    {item.status === 'PENDING' ? (
                      <>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setEditingItem(item)}
                          aria-label="Edit or reschedule follow-up"
                        >
                          <Edit2 className="size-4" />
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => void transition(item, 'COMPLETED')}
                        >
                          <Check className="size-4" /> Complete
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => void transition(item, 'CANCELLED')}
                          aria-label="Cancel follow-up"
                        >
                          <X className="size-4" />
                        </Button>
                      </>
                    ) : null}
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : null}

        {/* Edit / Reschedule dialog */}
        {editingItem ? (
          <RescheduleDialog
            item={editingItem}
            agents={agents}
            open={Boolean(editingItem)}
            onOpenChange={(open) => {
              if (!open) setEditingItem(null);
            }}
            onSaved={async () => {
              setEditingItem(null);
              await load();
              await messaging.refreshInbox();
            }}
          />
        ) : null}
      </div>
    </div>
  );
}

function RescheduleDialog({
  item,
  agents,
  open,
  onOpenChange,
  onSaved,
}: {
  item: FollowUpView;
  agents: readonly AgentAvailabilityView[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => Promise<void>;
}) {
  const [responsibleId, setResponsibleId] = useState(item.responsibleMembershipId);
  const [dueAt, setDueAt] = useState(
    item.dueAt ? formatLocalDateTime(new Date(item.dueAt)) : '',
  );
  const [note, setNote] = useState(item.note ?? '');
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      await api.updateFollowUp(item.id, item.version, {
        responsibleMembershipId: responsibleId,
        dueAt: new Date(dueAt).toISOString(),
        note: note.trim() || null,
      });
      toast.add({ title: 'Follow-up updated', type: 'success' });
      await onSaved();
    } catch (error) {
      toast.add({
        title: 'Could not update follow-up',
        description: error instanceof Error ? error.message : 'Try again.',
        type: 'error',
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit & Reschedule follow-up</DialogTitle>
          <DialogDescription>
            Update responsible agent, due timestamp or operational notes.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {agents.length ? (
            <label className="space-y-1 block text-sm font-medium">
              Responsible agent
              <NativeSelect
                value={responsibleId}
                onChange={(event) => setResponsibleId(event.target.value)}
              >
                {agents.map((agent) => (
                  <NativeSelectOption key={agent.membershipId} value={agent.membershipId}>
                    {agent.displayName}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </label>
          ) : null}
          <label className="space-y-1 block text-sm font-medium">
            Due date and time
            <Input
              type="datetime-local"
              value={dueAt}
              onChange={(event) => setDueAt(event.target.value)}
            />
          </label>
          <label className="space-y-1 block text-sm font-medium">
            Note
            <Textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Operational reminder note…"
            />
          </label>
        </div>
        <DialogFooter showCloseButton>
          <Button disabled={!dueAt || busy} onClick={() => void submit()}>
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function formatLocalDateTime(date: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

