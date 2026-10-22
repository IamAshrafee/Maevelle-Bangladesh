'use client';

import {
  AlertTriangle,
  ArrowLeft,
  Check,
  ChevronDown,
  Clock3,
  Facebook,
  ImagePlus,
  Loader2,
  PanelRightOpen,
  Search,
  Send,
  Star,
  UserRoundCheck,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { formatDistanceToNowStrict } from 'date-fns';

import type {
  AgentAvailabilityView,
  ConversationPriority,
  ConversationStatus,
  FacebookReplyEligibility,
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
import { MessageTranscript } from './message-transcript';
import { useMessaging } from './messaging-provider';

const statuses: readonly ConversationStatus[] = ['NEW', 'OPEN', 'PENDING', 'RESOLVED', 'CLOSED'];
const priorities: readonly ConversationPriority[] = ['LOW', 'NORMAL', 'HIGH', 'URGENT'];

export function ConversationPane({ onOpenContext }: { onOpenContext: () => void }) {
  const messaging = useMessaging();
  const conversation = messaging.conversation;
  const [agents, setAgents] = useState<readonly AgentAvailabilityView[]>([]);
  const [savedReplies, setSavedReplies] = useState<readonly SavedReplyView[]>([]);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
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
              {conversation.contact.displayName ?? (conversation.channel.kind === 'FACEBOOK' ? 'Facebook user' : 'Website visitor')}
            </h2>
            {conversation.channel.kind === 'FACEBOOK' ? (
              <Badge
                variant="secondary"
                className="shrink-0 text-[10px] bg-[#1877f2]/10 text-[#1877f2] border-[#1877f2]/20 gap-1 font-medium"
              >
                <Facebook className="size-2.5" /> Messenger
              </Badge>
            ) : (
              <Badge variant="secondary" className="shrink-0 text-[10px]">
                {conversation.channel.kind.toLowerCase()}
              </Badge>
            )}
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
          variant={isSearchOpen ? 'secondary' : 'ghost'}
          size="icon"
          aria-label={isSearchOpen ? 'Close search' : 'Search in conversation'}
          title="Search in conversation"
          onClick={() => setIsSearchOpen((open) => !open)}
        >
          <Search className="size-4" />
        </Button>
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
            <DropdownMenuContent className="max-h-60 overflow-y-auto">
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

      <MessageTranscript
        isSearchOpen={isSearchOpen}
        onCloseSearch={() => setIsSearchOpen(false)}
      />
      <Composer
        canReply={canReply && conversation.capabilities.replies}
        savedReplies={savedReplies}
      />
    </section>
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
  const [replyQuery, setReplyQuery] = useState('');
  const [eligibility, setEligibility] = useState<FacebookReplyEligibility | null>(null);
  const conversation = messaging.conversation;
  const isFacebook = conversation?.channel.kind === 'FACEBOOK';

  useEffect(() => {
    if (!isFacebook || !conversation?.id) {
      setEligibility(null);
      return;
    }
    const controller = new AbortController();
    api
      .getFacebookReplyEligibility(conversation.id, controller.signal)
      .then((data) => setEligibility(data))
      .catch(() => undefined);
    return () => controller.abort();
  }, [conversation?.id, isFacebook, messaging.messages.length]);

  const filteredReplies = savedReplies.filter((reply) => {
    if (!replyQuery.trim()) return true;
    const q = replyQuery.toLowerCase();
    return (
      reply.title.toLowerCase().includes(q) ||
      reply.body.toLowerCase().includes(q) ||
      (reply.shortcut && reply.shortcut.toLowerCase().includes(q))
    );
  });

  async function submit() {
    const sent = await messaging.send(text, attachmentIds);
    if (sent) {
      setText('');
      setAttachmentIds([]);
      if (isFacebook && conversation) {
        void api.getFacebookReplyEligibility(conversation.id).then(setEligibility).catch(() => undefined);
      }
    } else if (isFacebook && conversation) {
      void api.getFacebookReplyEligibility(conversation.id).then(setEligibility).catch(() => undefined);
    }
  }

  async function attach(file: File) {
    if (!conversation) return;
    if (isFacebook && attachmentIds.length >= 1) {
      toast.add({
        title: 'Single image limit',
        description: 'Facebook Messenger Send API policy allows at most one image attachment per outgoing message.',
        type: 'warning',
      });
      return;
    }
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

  // Check if Facebook reply policy prohibits sending
  const isFacebookBlocked = isFacebook && eligibility !== null && !eligibility.allowed;

  if (!canReply)
    return (
      <div className="shrink-0 border-t border-border bg-card p-3 text-center text-sm text-muted-foreground">
        Replies are unavailable for this conversation or your current access.
      </div>
    );

  return (
    <div className="shrink-0 border-t border-border bg-card p-3 pb-[max(.75rem,env(safe-area-inset-bottom))]">
      {/* Facebook Policy / Reply Window Banner */}
      {isFacebook && eligibility ? (
        <div className="mx-auto max-w-3xl mb-2.5">
          {eligibility.allowed ? (
            <div className="flex items-center justify-between rounded-lg border border-primary/20 bg-primary-subtle px-3 py-1.5 text-xs text-foreground">
              <span className="flex items-center gap-1.5 font-medium">
                <Facebook className="size-3.5 text-[#1877f2]" />
                Messenger 24-hour reply window active
              </span>
              {eligibility.eligibleUntil ? (
                <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                  Expires {formatDistanceToNowStrict(new Date(eligibility.eligibleUntil), { addSuffix: true })}
                </span>
              ) : null}
            </div>
          ) : (
            <div className="rounded-xl border border-warning/40 bg-warning/10 p-3 text-xs text-foreground space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 font-semibold text-warning">
                  <AlertTriangle className="size-4 shrink-0" />
                  <span>
                    {eligibility.reason === 'WINDOW_CLOSED'
                      ? 'Messenger 24-Hour Reply Window Closed'
                      : eligibility.reason === 'NO_CUSTOMER_MESSAGE'
                        ? 'Awaiting Customer Message'
                        : eligibility.reason === 'PERMISSION_MISSING'
                          ? 'Facebook Permission Missing'
                          : eligibility.reason === 'ACTIVATION_INCOMPLETE'
                            ? 'Channel Activation Pending'
                            : 'Replies Unavailable'}
                  </span>
                </div>
                <Badge variant="outline" className="text-[10px] font-mono border-warning/40 bg-card text-foreground">
                  {eligibility.nextAction}
                </Badge>
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                {eligibility.reason === 'WINDOW_CLOSED'
                  ? 'Meta platform policy permits standard replies within 24 hours of the customer’s latest message. A new message from the customer is required to send standard replies.'
                  : eligibility.reason === 'NO_CUSTOMER_MESSAGE'
                    ? 'A customer must send an initial message to this Facebook Page to open the 24-hour reply window.'
                    : eligibility.reason === 'PERMISSION_MISSING'
                      ? 'Page messaging permissions are missing or the token expired. Please reauthorize in Channel Settings.'
                      : eligibility.reason === 'ACTIVATION_INCOMPLETE'
                        ? 'Facebook webhook subscription or Conversation Routing review is required in Channel Settings.'
                        : 'Messenger sending is restricted under current connection status.'}
              </p>
            </div>
          )}
        </div>
      ) : null}

      <div className={cn(
        'mx-auto max-w-3xl rounded-xl border border-border bg-background p-2 focus-within:ring-2 focus-within:ring-ring/40 transition-opacity',
        isFacebookBlocked && 'opacity-60 bg-muted/30 cursor-not-allowed',
      )}>
        <Textarea
          value={text}
          disabled={isFacebookBlocked}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && !isFacebookBlocked) {
              event.preventDefault();
              void submit();
            }
          }}
          placeholder={isFacebookBlocked ? 'Replies restricted by Messenger policy…' : 'Reply to the customer…'}
          aria-label="Customer reply"
          maxLength={conversation?.capabilities.maximumTextLength ?? (isFacebook ? 2000 : 10000)}
          className="min-h-20 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0 disabled:cursor-not-allowed"
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
                disabled={uploading || isFacebookBlocked || (isFacebook && attachmentIds.length >= 1)}
                render={<label />}
                aria-label="Attach image"
                title={isFacebook && attachmentIds.length >= 1 ? 'Only 1 image allowed per Facebook message' : 'Attach image'}
              >
                {uploading ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <ImagePlus className="size-4" />
                )}
                <input
                  type="file"
                  accept={isFacebook ? (eligibility?.supportedAttachmentMimeTypes.join(',') || 'image/jpeg,image/png,image/webp') : 'image/jpeg,image/png,image/webp'}
                  disabled={uploading || isFacebookBlocked || (isFacebook && attachmentIds.length >= 1)}
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
              <DropdownMenuContent className="max-h-80 w-80 p-2">
                {savedReplies.length ? (
                  <>
                    <input
                      type="text"
                      value={replyQuery}
                      onChange={(e) => setReplyQuery(e.target.value)}
                      placeholder="Search saved replies…"
                      className="mb-2 w-full rounded border border-border bg-muted/30 px-2 py-1 text-xs outline-none focus:border-primary"
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                    />
                    <div className="max-h-60 overflow-y-auto">
                      {filteredReplies.map((reply) => (
                        <DropdownMenuItem
                          key={reply.id}
                          onClick={() =>
                            setText((current) => `${current}${current ? '\n' : ''}${reply.body}`)
                          }
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <p className="truncate font-medium">{reply.title}</p>
                              {reply.shortcut ? (
                                <Badge variant="outline" className="font-mono text-[9px] px-1 py-0">
                                  {reply.shortcut}
                                </Badge>
                              ) : null}
                            </div>
                            <p className="line-clamp-2 text-xs text-muted-foreground">{reply.body}</p>
                          </div>
                        </DropdownMenuItem>
                      ))}
                      {!filteredReplies.length ? (
                        <p className="py-2 text-center text-xs text-muted-foreground">
                          No matching replies
                        </p>
                      ) : null}
                    </div>
                  </>
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

