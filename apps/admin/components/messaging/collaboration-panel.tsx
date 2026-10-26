'use client';

import Link from 'next/link';
import {
  CalendarClock,
  Check,
  CircleUserRound,
  ExternalLink,
  Link2,
  Loader2,
  NotebookPen,
  Plus,
  Tag,
  Trash2,
  Unlink,
} from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';

import type {
  AgentAvailabilityView,
  ConversationActivityView,
  FollowUpView,
  InternalNoteView,
  MessagingTag,
} from '@maevelle/contracts/messaging';
import type { CustomerSummaryDto } from '@maevelle/contracts';

import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
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
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/toast';
import { StatusBadge } from '@/components/status-badge';
import { cn } from '@/lib/utils';
import * as api from './api';
import { formatDateTime, formatMoney } from './format';
import { useMessaging } from './messaging-provider';
import type { AssignmentHistoryView, MessagingCustomerContextView } from './types';

type PanelTab = 'context' | 'notes' | 'activity';

function ConfirmAction({
  triggerLabel,
  title,
  description,
  confirmLabel,
  onConfirm,
  icon,
  iconOnly = false,
  triggerClassName,
}: {
  triggerLabel: string;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => Promise<void>;
  icon?: ReactNode;
  iconOnly?: boolean;
  triggerClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function confirm() {
    setBusy(true);
    try {
      await onConfirm();
      setOpen(false);
    } catch (error) {
      toast.add({
        title: 'Action could not be completed',
        description: error instanceof Error ? error.message : 'Try again.',
        type: 'error',
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger
        render={
          <Button
            variant="ghost"
            size={iconOnly ? 'icon-sm' : 'sm'}
            className={triggerClassName}
            aria-label={iconOnly ? triggerLabel : undefined}
          />
        }
      >
        {icon}
        {iconOnly ? null : triggerLabel}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Keep current state</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={busy}
            onClick={(event) => {
              event.preventDefault();
              void confirm();
            }}
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function CollaborationPanel() {
  const messaging = useMessaging();
  const [tab, setTab] = useState<PanelTab>('context');
  const [customerContext, setCustomerContext] = useState<MessagingCustomerContextView | null>(null);
  const [notes, setNotes] = useState<readonly InternalNoteView[]>([]);
  const [timeline, setTimeline] = useState<readonly ConversationActivityView[]>([]);
  const [history, setHistory] = useState<readonly AssignmentHistoryView[]>([]);
  const [tags, setTags] = useState<readonly MessagingTag[]>([]);
  const [followUps, setFollowUps] = useState<readonly FollowUpView[]>([]);
  const [agents, setAgents] = useState<readonly AgentAvailabilityView[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const conversation = messaging.conversation;

  async function refresh() {
    if (!conversation) return;
    setState('loading');
    const canContext = messaging.capabilities.includes('messaging.customer_context.view');
    const canFollowUp = messaging.capabilities.includes('messaging.follow_ups.manage');
    const canViewAvailability = messaging.capabilities.includes('messaging.availability.view');
    try {
      const [context, nextNotes, nextTimeline, nextHistory, nextTags, nextFollowUps, nextAgents] =
        await Promise.all([
          canContext ? api.getCustomerContext(conversation.id) : Promise.resolve(null),
          api.listNotes(conversation.id),
          api.listTimeline(conversation.id),
          api.listAssignmentHistory(conversation.id),
          api.listTags(),
          canFollowUp
            ? api.listFollowUps({ conversationId: conversation.id })
            : Promise.resolve([]),
          canViewAvailability ? api.listEligibleAgents() : Promise.resolve([]),
        ]);
      setCustomerContext(context);
      setNotes(nextNotes);
      setTimeline(nextTimeline);
      setHistory(nextHistory);
      setTags(nextTags);
      setFollowUps(nextFollowUps);
      setAgents(nextAgents);
      setState('ready');
    } catch {
      setState('error');
    }
  }

  useEffect(() => {
    void refresh();
  }, [conversation?.id]);

  if (!conversation) return null;

  return (
    <aside
      className="flex h-full min-h-0 flex-col bg-card"
      aria-label="Customer and collaboration context"
    >
      <div className="grid shrink-0 grid-cols-3 border-b border-border p-1">
        {(['context', 'notes', 'activity'] as const).map((value) => (
          <Button
            key={value}
            variant={tab === value ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setTab(value)}
          >
            {value === 'context' ? 'Customer' : value[0]!.toUpperCase() + value.slice(1)}
          </Button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
        {state === 'loading' ? (
          <div className="grid h-40 place-items-center">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : null}
        {state === 'error' ? (
          <div className="space-y-2 text-center text-sm text-muted-foreground">
            <p>Context could not be loaded.</p>
            <Button variant="outline" size="sm" onClick={() => void refresh()}>
              Retry
            </Button>
          </div>
        ) : null}
        {state === 'ready' && tab === 'context' ? (
          <CustomerContext
            context={customerContext}
            tags={tags}
            followUps={followUps}
            agents={agents}
            onRefresh={refresh}
          />
        ) : null}
        {state === 'ready' && tab === 'notes' ? <Notes notes={notes} onRefresh={refresh} /> : null}
        {state === 'ready' && tab === 'activity' ? (
          <Activity timeline={timeline} history={history} />
        ) : null}
      </div>
    </aside>
  );
}

function CustomerContext({
  context,
  tags,
  followUps,
  agents,
  onRefresh,
}: {
  context: MessagingCustomerContextView | null;
  tags: readonly MessagingTag[];
  followUps: readonly FollowUpView[];
  agents: readonly AgentAvailabilityView[];
  onRefresh: () => Promise<void>;
}) {
  const messaging = useMessaging();
  const conversation = messaging.conversation!;
  const [linkOpen, setLinkOpen] = useState(false);
  const [followOpen, setFollowOpen] = useState(false);
  const canTags = messaging.capabilities.includes('messaging.tags.manage');
  const canFollowUp = messaging.capabilities.includes('messaging.follow_ups.manage');

  return (
    <div className="space-y-5">
      <section className="space-y-3">
        <div className="flex items-start gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-full bg-primary-subtle text-primary">
            <CircleUserRound className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="truncate font-semibold">
              {context?.customer?.displayName ??
                conversation.contact.displayName ??
                'Website visitor'}
            </h3>
            <p className="text-xs text-muted-foreground">
              {context?.customer ? context.customer.customerNumber : 'Unlinked messaging contact'}
            </p>
          </div>
        </div>
        {context?.customer ? (
          <div className="space-y-1 text-xs text-muted-foreground">
            {context.customer.primaryPhone ? (
              <p className="font-mono tabular-nums">{context.customer.primaryPhone}</p>
            ) : null}
            {context.customer.primaryEmail ? (
              <p className="break-all">{context.customer.primaryEmail}</p>
            ) : null}
            <div className="flex gap-2 pt-1">
              <Button
                variant="outline"
                size="sm"
                render={<Link href={`/customers/${context.customer.id}`} />}
              >
                <ExternalLink className="size-3.5" /> View customer
              </Button>
              {messaging.capabilities.includes('messaging.customer_link.manage') ? (
                <ConfirmAction
                  triggerLabel="Unlink"
                  title="Unlink messaging contact?"
                  description="The customer and conversation histories remain intact, but future messages will no longer resolve to this customer until the contact is linked again."
                  confirmLabel="Unlink contact"
                  onConfirm={async () => {
                    await api.unlinkCustomer(
                      conversation.contact.id,
                      'Correcting messaging customer association',
                    );
                    await onRefresh();
                  }}
                  icon={<Unlink className="size-3.5" />}
                />
              ) : null}
            </div>
          </div>
        ) : messaging.capabilities.includes('messaging.customer_link.manage') ? (
          <Button variant="outline" size="sm" className="w-full" onClick={() => setLinkOpen(true)}>
            <Link2 className="size-4" /> Link verified customer
          </Button>
        ) : null}
      </section>

      {context?.customer ? (
        <section>
          <SectionTitle>Commerce snapshot</SectionTitle>
          <div className="grid grid-cols-2 gap-2">
            <Metric label="Orders" value={String(context.customer.commerceMetrics.totalOrders)} />
            <Metric
              label="Lifetime value"
              value={formatMoney(context.customer.commerceMetrics.lifetimeOrderValue)}
            />
            <Metric
              label="Outstanding"
              value={formatMoney(context.customer.commerceMetrics.outstandingAmount)}
            />
            <Metric
              label="Returns"
              value={String(
                context.customer.commerceMetrics.returnedOrders ?? context.returns.length,
              )}
            />
          </div>
        </section>
      ) : null}

      {context?.crmProfile ? (
        <section>
          <SectionTitle>CRM relationship</SectionTitle>
          <div className="space-y-2 rounded-lg border border-border p-3 text-xs">
            <div className="flex flex-wrap gap-2">
              <StatusBadge status={context.crmProfile.lifecycleStage} tone="info" />
              <StatusBadge status={context.crmProfile.relationshipStatus} />
            </div>
            <p className="text-muted-foreground">
              Owner: {context.crmProfile.relationshipOwnerName ?? 'Unassigned'}
            </p>
            {context.linkedIdentities.length ? (
              <div className="flex flex-wrap gap-1">
                {context.linkedIdentities.map((identity) => (
                  <StatusBadge
                    key={identity.id}
                    status={`${identity.provider} · ${identity.assurance}`}
                    tone={
                      identity.assurance === 'HIGH'
                        ? 'success'
                        : identity.assurance === 'MEDIUM'
                          ? 'info'
                          : 'warning'
                    }
                  />
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground">No linked channel identity.</p>
            )}
            {context.crmProfile.preferences.slice(0, 3).map((preference) => (
              <div key={preference.id} className="flex items-start justify-between gap-2">
                <span>{preference.key.replaceAll('_', ' ')}</span>
                <span className="max-w-36 truncate text-muted-foreground">
                  {typeof preference.value === 'string'
                    ? preference.value
                    : JSON.stringify(preference.value)}
                </span>
              </div>
            ))}
            {context.crmProfile.followUps.some((followUp) => followUp.status === 'OPEN') ? (
              <p className="font-medium text-warning">
                {
                  context.crmProfile.followUps.filter((followUp) => followUp.status === 'OPEN')
                    .length
                }{' '}
                open CRM follow-up(s)
              </p>
            ) : null}
          </div>
        </section>
      ) : null}

      <section>
        <div className="flex items-center justify-between">
          <SectionTitle>Tags</SectionTitle>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {tags.map((tag) => {
            const assigned = conversation.tags?.some((item) => item.id === tag.id) ?? false;
            return (
              <button
                key={tag.id}
                disabled={!canTags}
                onClick={async () => {
                  await api.setConversationTag(conversation.id, tag.id, !assigned);
                  await messaging.refreshConversation();
                }}
                className={cn(
                  'rounded-full border px-2 py-1 text-xs transition-colors duration-150',
                  assigned
                    ? 'border-primary bg-primary-subtle text-primary'
                    : 'border-border text-muted-foreground hover:bg-muted',
                )}
              >
                {assigned ? (
                  <Check className="mr-1 inline size-3" />
                ) : (
                  <Tag className="mr-1 inline size-3" />
                )}
                {tag.label}
              </button>
            );
          })}
          {!tags.length ? <p className="text-xs text-muted-foreground">No active tags.</p> : null}
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between">
          <SectionTitle>Follow-up</SectionTitle>
          {canFollowUp ? (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setFollowOpen(true)}
              aria-label="Schedule follow-up"
            >
              <Plus className="size-4" />
            </Button>
          ) : null}
        </div>
        {followUps
          .filter((item) => item.status === 'PENDING')
          .map((followUp) => (
            <div
              key={followUp.id}
              className={cn(
                'rounded-lg border p-3 text-xs',
                followUp.isOverdue && 'border-destructive/50 bg-destructive/5',
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium tabular-nums font-mono">
                  {formatDateTime(followUp.dueAt)}
                </p>
                {followUp.isOverdue ? (
                  <span className="text-[10px] text-destructive font-semibold">Overdue</span>
                ) : null}
              </div>
              {followUp.note ? <p className="mt-1 text-muted-foreground">{followUp.note}</p> : null}
              {canFollowUp ? (
                <div className="mt-2 flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={async () => {
                      await api.transitionFollowUp(followUp.id, followUp.version, 'COMPLETED');
                      await onRefresh();
                      await messaging.refreshInbox();
                    }}
                  >
                    <Check className="size-3.5" /> Complete
                  </Button>
                  <ConfirmAction
                    triggerLabel="Cancel"
                    title="Cancel scheduled follow-up?"
                    description="The follow-up remains in the activity history as cancelled and will no longer appear as pending."
                    confirmLabel="Cancel follow-up"
                    triggerClassName="h-7 text-xs text-muted-foreground hover:text-destructive"
                    onConfirm={async () => {
                      await api.transitionFollowUp(followUp.id, followUp.version, 'CANCELLED');
                      await onRefresh();
                      await messaging.refreshInbox();
                    }}
                  />
                </div>
              ) : null}
            </div>
          ))}
        {!followUps.some((item) => item.status === 'PENDING') ? (
          <p className="text-xs text-muted-foreground">No pending follow-up.</p>
        ) : null}
      </section>

      {context?.commerceOrders.data.length ? (
        <section>
          <SectionTitle>Recent orders</SectionTitle>
          <div className="space-y-2">
            {context.commerceOrders.data.slice(0, 5).map((order) => (
              <Link
                key={order.id}
                href={`/orders/${order.id}`}
                className="block rounded-lg border border-border p-2 transition-colors duration-150 hover:bg-muted"
              >
                <div className="flex justify-between gap-2">
                  <span className="font-mono text-xs font-medium tabular-nums">
                    {order.orderNumber}
                  </span>
                  <span className="font-mono text-xs tabular-nums">
                    {formatMoney(order.total, order.currency)}
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {order.status.toLowerCase()} · {order.paymentStatus.toLowerCase()} ·{' '}
                  {order.fulfillmentStatus.toLowerCase()} · {order.deliveryStatus.toLowerCase()}
                </p>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {context?.productContext.length ? (
        <section>
          <SectionTitle>Browsing context</SectionTitle>
          {context.productContext.slice(0, 3).map((item) => (
            <div
              key={`${item.path}-${item.capturedAt}`}
              className="mb-2 rounded-lg bg-muted p-2 text-xs"
            >
              <p className="font-medium">{item.productTitle ?? item.pageType}</p>
              <p className="truncate text-muted-foreground">{item.path}</p>
            </div>
          ))}
        </section>
      ) : null}

      <CustomerLinkDialog open={linkOpen} onOpenChange={setLinkOpen} onLinked={onRefresh} />
      <FollowUpDialog
        open={followOpen}
        onOpenChange={setFollowOpen}
        agents={agents}
        onCreated={onRefresh}
      />
    </div>
  );
}

function Notes({
  notes,
  onRefresh,
}: {
  notes: readonly InternalNoteView[];
  onRefresh: () => Promise<void>;
}) {
  const messaging = useMessaging();
  const [body, setBody] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingBody, setEditingBody] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const canCreate = messaging.capabilities.includes('messaging.notes.create');

  async function add() {
    if (!body.trim() || !messaging.conversation) return;
    await api.createNote(messaging.conversation.id, body.trim());
    setBody('');
    await onRefresh();
  }

  async function saveRevision(note: InternalNoteView) {
    if (!editingBody.trim()) return;
    setSavingEdit(true);
    try {
      await api.updateNote(note.id, note.revision, editingBody.trim());
      setEditingId(null);
      setEditingBody('');
      toast.add({ title: 'Note updated', type: 'success' });
      await onRefresh();
    } catch (error) {
      toast.add({
        title: 'Could not update note',
        description: error instanceof Error ? error.message : 'Try again.',
        type: 'error',
      });
    } finally {
      setSavingEdit(false);
    }
  }

  return (
    <div className="space-y-3">
      {canCreate ? (
        <div className="rounded-xl border border-warning/30 bg-warning/5 p-3">
          <div className="mb-2 flex items-center gap-2 text-xs font-medium text-warning">
            <NotebookPen className="size-4" /> Internal note — never sent to customer
          </div>
          <Textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="Add private operational context…"
            className="min-h-24"
          />
          <Button size="sm" className="mt-2" disabled={!body.trim()} onClick={() => void add()}>
            Add note
          </Button>
        </div>
      ) : null}
      {notes.map((note) => (
        <article key={note.id} className="rounded-xl border border-border p-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-xs font-medium">
                {note.author.displayName}
                {note.revision > 1 ? (
                  <span className="ml-1 text-[10px] text-muted-foreground font-mono">
                    (rev. {note.revision})
                  </span>
                ) : null}
              </p>
              <time className="text-[10px] text-muted-foreground tabular-nums font-mono">
                {formatDateTime(note.createdAt)}
              </time>
            </div>
            {canCreate ? (
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Edit note"
                  onClick={() => {
                    if (editingId === note.id) {
                      setEditingId(null);
                    } else {
                      setEditingId(note.id);
                      setEditingBody(note.body);
                    }
                  }}
                >
                  <NotebookPen className="size-3.5" />
                </Button>
                <ConfirmAction
                  iconOnly
                  triggerLabel="Delete note"
                  title="Delete internal note?"
                  description="The note will be removed from the collaboration panel. The recorded audit evidence remains available to authorized operators."
                  confirmLabel="Delete note"
                  onConfirm={async () => {
                    await api.deleteNote(note.id, 'Removed from collaboration panel');
                    await onRefresh();
                  }}
                  icon={<Trash2 className="size-3.5" />}
                />
              </div>
            ) : null}
          </div>
          {editingId === note.id ? (
            <div className="mt-2 space-y-2">
              <Textarea
                value={editingBody}
                onChange={(event) => setEditingBody(event.target.value)}
                className="min-h-20 text-sm"
              />
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  disabled={!editingBody.trim() || savingEdit}
                  onClick={() => void saveRevision(note)}
                >
                  Save revision
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setEditingId(null);
                    setEditingBody('');
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <p className="mt-2 whitespace-pre-wrap text-sm">{note.body}</p>
          )}
        </article>
      ))}
      {!notes.length ? (
        <p className="py-8 text-center text-sm text-muted-foreground">No internal notes yet.</p>
      ) : null}
    </div>
  );
}

function Activity({
  timeline,
  history,
}: {
  timeline: readonly ConversationActivityView[];
  history: readonly AssignmentHistoryView[];
}) {
  const items = useMemo(
    () =>
      [
        ...timeline.map((item) => ({
          id: item.id,
          at: item.createdAt,
          title: item.type.toLowerCase().replaceAll('_', ' '),
          actor: item.actorDisplayName,
          reason: item.reason,
        })),
        ...history.map((item) => ({
          id: `assignment-${item.id}`,
          at: item.createdAt,
          title: 'assignment changed',
          actor: null,
          reason: item.reason,
        })),
      ].sort((a, b) => b.at.localeCompare(a.at)),
    [timeline, history],
  );
  return (
    <ol className="space-y-0">
      {items.map((item) => (
        <li
          key={item.id}
          className="relative border-l border-border pb-5 pl-4 before:absolute before:-left-1 before:top-1 before:size-2 before:rounded-full before:bg-primary"
        >
          <p className="text-sm font-medium capitalize">{item.title}</p>
          <p className="text-xs text-muted-foreground">
            {item.actor ? `${item.actor} · ` : ''}
            <time className="font-mono tabular-nums">{formatDateTime(item.at)}</time>
          </p>
          {item.reason ? <p className="mt-1 text-xs">{item.reason}</p> : null}
        </li>
      ))}
    </ol>
  );
}

function CustomerLinkDialog({
  open,
  onOpenChange,
  onLinked,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLinked: () => Promise<void>;
}) {
  const messaging = useMessaging();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<readonly CustomerSummaryDto[]>([]);
  const [selected, setSelected] = useState<CustomerSummaryDto | null>(null);
  const [reason, setReason] = useState('Verified customer identity during support conversation');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(
      () =>
        void api
          .searchCustomers(query.trim(), controller.signal)
          .then((page) => setResults(page.items))
          .catch(() => undefined),
      250,
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Link verified customer</DialogTitle>
          <DialogDescription>
            Search the customer directory and record a reviewed association. This changes the
            commerce context visible to agents.
          </DialogDescription>
        </DialogHeader>
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Name, phone, email, or customer number"
          autoComplete="off"
          name="customer-search"
        />
        <div className="max-h-64 space-y-1 overflow-y-auto">
          {results.map((customer) => (
            <button
              key={customer.id}
              onClick={() => setSelected(customer)}
              className={cn(
                'w-full rounded-lg border p-3 text-left text-sm transition-colors duration-150',
                selected?.id === customer.id
                  ? 'border-primary bg-primary-subtle'
                  : 'border-border hover:bg-muted',
              )}
            >
              <p className="font-medium">{customer.displayName}</p>
              <p className="text-xs text-muted-foreground">
                {customer.customerNumber} ·{' '}
                {customer.primaryPhone ?? customer.primaryEmail ?? 'No primary contact'}
              </p>
            </button>
          ))}
        </div>
        <Textarea
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          aria-label="Link reason"
        />
        <DialogFooter showCloseButton>
          <Button
            disabled={!selected || !reason.trim() || busy}
            onClick={async () => {
              if (!selected || !messaging.conversation) return;
              setBusy(true);
              try {
                await api.linkCustomer(messaging.conversation.contact.id, {
                  customerId: selected.id,
                  method: 'STAFF_REVIEW',
                  reason,
                });
                toast.add({ title: 'Customer linked', type: 'success' });
                onOpenChange(false);
                await messaging.refreshConversation();
                await onLinked();
              } finally {
                setBusy(false);
              }
            }}
          >
            <Link2 className="size-4" /> Link customer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FollowUpDialog({
  open,
  onOpenChange,
  agents,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agents: readonly AgentAvailabilityView[];
  onCreated: () => Promise<void>;
}) {
  const messaging = useMessaging();
  const [agentId, setAgentId] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [note, setNote] = useState('');
  useEffect(() => {
    if (open && !agentId)
      setAgentId(messaging.conversation?.assignee?.membershipId ?? agents[0]?.membershipId ?? '');
  }, [open, agents, messaging.conversation?.assignee?.membershipId]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Schedule follow-up</DialogTitle>
          <DialogDescription>Assign a dated reminder with clear ownership.</DialogDescription>
        </DialogHeader>
        <label className="space-y-1 text-sm font-medium">
          Responsible agent
          <NativeSelect value={agentId} onChange={(event) => setAgentId(event.target.value)}>
            {agents.map((agent) => (
              <NativeSelectOption key={agent.membershipId} value={agent.membershipId}>
                {agent.displayName}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </label>
        <label className="space-y-1 text-sm font-medium">
          Due date and time
          <Input
            type="datetime-local"
            value={dueAt}
            onChange={(event) => setDueAt(event.target.value)}
          />
        </label>
        <label className="space-y-1 text-sm font-medium">
          Note
          <Textarea value={note} onChange={(event) => setNote(event.target.value)} />
        </label>
        <DialogFooter showCloseButton>
          <Button
            disabled={!agentId || !dueAt}
            onClick={async () => {
              if (!messaging.conversation) return;
              await api.createFollowUp(messaging.conversation.id, {
                responsibleMembershipId: agentId,
                dueAt: new Date(dueAt).toISOString(),
                ...(note.trim() ? { note: note.trim() } : {}),
              });
              onOpenChange(false);
              await messaging.refreshConversation();
              await onCreated();
            }}
          >
            <CalendarClock className="size-4" /> Schedule
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      {children}
    </h4>
  );
}
function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border p-2">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className="mt-1 truncate font-mono text-xs font-semibold tabular-nums">{value}</p>
    </div>
  );
}
