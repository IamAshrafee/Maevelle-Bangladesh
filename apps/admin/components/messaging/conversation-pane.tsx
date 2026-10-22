'use client';

import {
  ArrowLeft,
  Check,
  ChevronDown,
  Clock3,
  ImagePlus,
  Loader2,
  PanelRightOpen,
  Send,
  Star,
  UserRoundCheck,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import type {
  AgentAvailabilityView,
  ConversationPriority,
  ConversationStatus,
  SavedReplyView,
} from '@maevelle/contracts/messaging';

import { StatusBadge } from '@/components/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/page-shell';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import * as api from './api';
import { formatDateTime } from './format';
import { useMessaging } from './messaging-provider';

const statuses: readonly ConversationStatus[] = ['NEW', 'OPEN', 'PENDING', 'RESOLVED', 'CLOSED'];
const priorities: readonly ConversationPriority[] = ['LOW', 'NORMAL', 'HIGH', 'URGENT'];

export function ConversationPane({ onOpenContext }: { onOpenContext: () => void }) {
  const messaging = useMessaging();
  const conversation = messaging.conversation;
  const [agents, setAgents] = useState<readonly AgentAvailabilityView[]>([]);
  const [savedReplies, setSavedReplies] = useState<readonly SavedReplyView[]>([]);
  const canAssign = messaging.capabilities.includes('messaging.assign');
  const canReply = messaging.capabilities.includes('messaging.reply');
  const canManageStatus = messaging.capabilities.includes('messaging.status.manage');
  const canManagePriority = messaging.capabilities.includes('messaging.priority.manage');

  useEffect(() => {
    if (!conversation) return;
    const controller = new AbortController();
    void Promise.all([
      messaging.capabilities.includes('messaging.availability.view')
        ? api.listEligibleAgents(controller.signal)
        : Promise.resolve([]),
      messaging.capabilities.includes('messaging.saved_replies.use')
        ? api.listSavedReplies(undefined, false, controller.signal)
        : Promise.resolve([]),
    ])
      .then(([nextAgents, replies]) => {
        setAgents(nextAgents);
        setSavedReplies(replies);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [conversation?.id, messaging.capabilities]);

  if (!messaging.selectedConversationId)
    return (
      <section
        className="hidden h-full min-h-0 place-items-center bg-background lg:grid"
        aria-label="Conversation"
      >
        <EmptyState
          title="Choose a conversation"
          description="Select a customer conversation from the inbox to view its history and respond."
          className="border-0"
        />
      </section>
    );
  if (messaging.conversationState === 'loading' && !conversation)
    return <LoadingState message="Loading conversation…" className="h-full" />;
  if (messaging.conversationState === 'error' && !conversation)
    return (
      <ErrorState
        title="Conversation unavailable"
        message={messaging.conversationError}
        onRetry={() => void messaging.refreshConversation()}
        className="m-4"
      />
    );
  if (!conversation) return null;

  return (
    <section
      className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-x-hidden bg-background"
      aria-label="Active conversation"
    >
      <header className="flex min-h-16 shrink-0 flex-wrap items-center gap-2 border-b border-border bg-card px-3 py-2 sm:flex-nowrap">
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          onClick={() => messaging.selectConversation(null)}
          aria-label="Back to inbox"
        >
          <ArrowLeft className="size-4" />
        </Button>
        <div className="min-w-0 flex-1 basis-[calc(100%-3rem)] sm:basis-auto">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-sm font-semibold">
              {conversation.contact.displayName ?? 'Website visitor'}
            </h2>
            <Badge variant="secondary" className="shrink-0 text-[10px]">
              {conversation.channel.kind.toLowerCase()}
            </Badge>
          </div>
          <p className="truncate text-xs text-muted-foreground">
            {conversation.subject ?? conversation.channel.name} ·{' '}
            {conversation.assignee?.displayName ?? 'Unassigned'}
          </p>
        </div>
        {!conversation.assignee && messaging.capabilities.includes('messaging.claim') ? (
          <Button variant="outline" size="sm" onClick={() => void messaging.claim()}>
            <UserRoundCheck className="size-4" /> Claim
          </Button>
        ) : null}
        {canManageStatus ? (
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>
              <StatusBadge status={conversation.status} />
              <ChevronDown className="size-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Conversation status</DropdownMenuLabel>
              {statuses.map((status) => (
                <DropdownMenuItem key={status} onClick={() => void messaging.setStatus(status)}>
                  {status === conversation.status ? (
                    <Check className="size-4" />
                  ) : (
                    <span className="size-4" />
                  )}
                  {status.toLowerCase()}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <StatusBadge status={conversation.status} />
        )}
        {canManagePriority ? (
          <Button
            variant={conversation.isStarred ? 'secondary' : 'ghost'}
            size="icon"
            aria-label={conversation.isStarred ? 'Remove star' : 'Star conversation'}
            onClick={() =>
              void messaging.setPriority(conversation.priority, !conversation.isStarred)
            }
          >
            <Star className={cn('size-4', conversation.isStarred && 'fill-warning text-warning')} />
          </Button>
        ) : null}
        <Button
          variant="ghost"
          size="icon"
          onClick={onOpenContext}
          aria-label="Open customer context"
        >
          <PanelRightOpen className="size-4" />
        </Button>
      </header>

      <div className="flex shrink-0 items-center gap-2 overflow-x-auto border-b border-border bg-card px-3 py-2">
        {canManagePriority ? (
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="sm" />}>
              Priority: {conversation.priority.toLowerCase()} <ChevronDown className="size-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {priorities.map((priority) => (
                <DropdownMenuItem
                  key={priority}
                  onClick={() => void messaging.setPriority(priority)}
                >
                  {priority.toLowerCase()}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
        {canAssign ? (
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="sm" />}>
              {conversation.assignee?.displayName ?? 'Assign'} <ChevronDown className="size-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem
                onClick={() => void messaging.assign(null, 'Released from workspace')}
              >
                Unassigned
              </DropdownMenuItem>
              {agents.map((agent) => (
                <DropdownMenuItem
                  key={agent.membershipId}
                  onClick={() =>
                    void messaging.assign(agent.membershipId, 'Assigned from workspace')
                  }
                >
                  <span
                    className={cn(
                      'size-2 rounded-full',
                      agent.effectiveStatus === 'ONLINE' ? 'bg-success' : 'bg-muted-foreground',
                    )}
                  />
                  {agent.displayName}
                  <span className="ml-auto text-xs text-muted-foreground">
                    {agent.effectiveStatus.toLowerCase()}
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
        {conversation.followUp ? (
          <Badge
            variant="outline"
            className={cn(conversation.followUp.isOverdue && 'border-destructive text-destructive')}
          >
            <Clock3 className="size-3" /> Follow-up {formatDateTime(conversation.followUp.dueAt)}
          </Badge>
        ) : null}
      </div>

      <MessageTranscript />
      <Composer
        canReply={canReply && conversation.capabilities.replies}
        savedReplies={savedReplies}
      />
    </section>
  );
}

function MessageTranscript() {
  const messaging = useMessaging();
  const bottomRef = useRef<HTMLDivElement>(null);
  const previousCount = useRef(0);

  useEffect(() => {
    if (messaging.messages.length >= previousCount.current)
      bottomRef.current?.scrollIntoView({ block: 'end' });
    previousCount.current = messaging.messages.length;
  }, [messaging.messages.length, messaging.pendingMessages.length]);

  return (
    <div
      className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 sm:p-4"
      aria-live="polite"
    >
      <div className="mx-auto flex max-w-3xl flex-col gap-3">
        {messaging.hasOlderMessages ? (
          <Button
            variant="ghost"
            size="sm"
            className="self-center"
            onClick={() => void messaging.loadOlderMessages()}
          >
            Load older messages
          </Button>
        ) : null}
        {messaging.messages.map((message) => {
          const outbound = message.direction === 'OUTBOUND';
          const system = message.type === 'SYSTEM_EVENT';
          return (
            <article
              key={message.id}
              className={cn(
                'max-w-[86%] rounded-2xl border px-3 py-2 text-sm shadow-2xs',
                outbound ? 'ml-auto border-primary/20 bg-primary-subtle' : 'mr-auto bg-card',
                system &&
                  'mx-auto max-w-full border-dashed bg-muted text-center text-muted-foreground',
              )}
            >
              <div className="mb-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                <span>{message.sender.name ?? (outbound ? 'Maevelle team' : 'Customer')}</span>
                <time className="tabular-nums font-mono">{formatDateTime(message.createdAt)}</time>
              </div>
              {message.text ? (
                <p className="whitespace-pre-wrap break-words">{message.text}</p>
              ) : null}
              {message.attachments.map((attachment) => (
                <a
                  key={attachment.id}
                  href={
                    attachment.downloadPath ?? `/api/admin/messaging/attachments/${attachment.id}`
                  }
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 block rounded-lg border border-border bg-card p-2 text-xs underline-offset-4 hover:underline"
                >
                  {attachment.fileName ?? 'Attachment'} · {attachment.securityStatus.toLowerCase()}
                </a>
              ))}
              <p className="mt-1 text-right text-[10px] text-muted-foreground">
                {message.delivery.state.toLowerCase().replace('_', ' ')}
              </p>
            </article>
          );
        })}
        {messaging.pendingMessages.map((message) => (
          <article
            key={message.key}
            className="ml-auto max-w-[86%] rounded-2xl border border-primary/20 bg-primary-subtle px-3 py-2 text-sm opacity-80"
          >
            {message.text ? (
              <p className="whitespace-pre-wrap">{message.text}</p>
            ) : (
              <p>Image attachment</p>
            )}
            <div className="mt-1 flex items-center justify-end gap-2 text-[10px] text-muted-foreground">
              {message.state === 'SENDING' ? <Loader2 className="size-3 animate-spin" /> : null}
              <span>
                {message.state === 'SENDING'
                  ? 'Sending'
                  : (message.error ?? 'Send result uncertain')}
              </span>
              {message.state !== 'SENDING' ? (
                <>
                  <button
                    className="font-medium text-foreground"
                    onClick={() => void messaging.retryPending(message.key)}
                  >
                    Retry
                  </button>
                  <button
                    aria-label="Remove failed message"
                    onClick={() => messaging.removePending(message.key)}
                  >
                    <X className="size-3" />
                  </button>
                </>
              ) : null}
            </div>
          </article>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

function Composer({
  canReply,
  savedReplies,
}: {
  canReply: boolean;
  savedReplies: readonly SavedReplyView[];
}) {
  const messaging = useMessaging();
  const [text, setText] = useState('');
  const [attachmentIds, setAttachmentIds] = useState<readonly string[]>([]);
  const [uploading, setUploading] = useState(false);
  const conversation = messaging.conversation;

  async function submit() {
    const sent = await messaging.send(text, attachmentIds);
    if (sent) {
      setText('');
      setAttachmentIds([]);
    }
  }

  async function attach(file: File) {
    if (!conversation) return;
    setUploading(true);
    try {
      const assetId = await api.uploadStaffAttachment(conversation.id, file);
      setAttachmentIds((current) => [...current, assetId]);
      toast.add({ title: 'Image ready to send', type: 'success' });
    } catch (error) {
      toast.add({
        title: 'Image upload failed',
        description: error instanceof Error ? error.message : 'Try again.',
        type: 'error',
      });
    } finally {
      setUploading(false);
    }
  }

  if (!canReply)
    return (
      <div className="shrink-0 border-t border-border bg-card p-3 text-center text-sm text-muted-foreground">
        Replies are unavailable for this conversation or your current access.
      </div>
    );

  return (
    <div className="shrink-0 border-t border-border bg-card p-3 pb-[max(.75rem,env(safe-area-inset-bottom))]">
      <div className="mx-auto max-w-3xl rounded-xl border border-border bg-background p-2 focus-within:ring-2 focus-within:ring-ring/40">
        <Textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              void submit();
            }
          }}
          placeholder="Reply to the customer…"
          aria-label="Customer reply"
          maxLength={conversation?.capabilities.maximumTextLength ?? 10000}
          className="min-h-20 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0"
        />
        {attachmentIds.length ? (
          <div className="mb-2 flex flex-wrap gap-1">
            <Badge variant="secondary">
              {attachmentIds.length} image{attachmentIds.length === 1 ? '' : 's'} ready
            </Badge>
          </div>
        ) : null}
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1">
            {conversation?.capabilities.attachments ? (
              <Button
                variant="ghost"
                size="icon"
                disabled={uploading}
                render={<label />}
                aria-label="Attach image"
              >
                {uploading ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <ImagePlus className="size-4" />
                )}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="sr-only"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void attach(file);
                    event.currentTarget.value = '';
                  }}
                />
              </Button>
            ) : null}
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="ghost" size="sm" />}>
                Saved reply <ChevronDown className="size-3" />
              </DropdownMenuTrigger>
              <DropdownMenuContent className="max-h-72 w-72">
                {savedReplies.length ? (
                  savedReplies.map((reply) => (
                    <DropdownMenuItem
                      key={reply.id}
                      onClick={() =>
                        setText((current) => `${current}${current ? '\n' : ''}${reply.body}`)
                      }
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium">{reply.title}</p>
                        <p className="line-clamp-2 text-xs text-muted-foreground">{reply.body}</p>
                      </div>
                    </DropdownMenuItem>
                  ))
                ) : (
                  <DropdownMenuLabel>No saved replies yet</DropdownMenuLabel>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <Button
            disabled={(!text.trim() && !attachmentIds.length) || uploading}
            onClick={() => void submit()}
          >
            <Send className="size-4" /> Send
          </Button>
        </div>
      </div>
      <p className="mt-1 text-center text-[10px] text-muted-foreground">
        Enter to send · Shift+Enter for a new line
      </p>
    </div>
  );
}
