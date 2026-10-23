'use client';

import {
  AlertTriangle,
  ArrowLeft,
  Check,
  ChevronDown,
  Clock3,
  Facebook,
  ImagePlus,
  Instagram,
  Loader2,
  PanelRightOpen,
  Search,
  Send,
  Star,
  UserRoundCheck,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { formatDistanceToNowStrict } from 'date-fns';

import type {
  AgentAvailabilityView,
  ConversationPriority,
  ConversationStatus,
  FacebookReplyEligibility,
  InstagramReplyEligibility,
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
import { isSendKeyboardShortcut } from './client-state';
import * as instagramApi from './instagram/instagram-api';
import { instagramReplyCopy, instagramReplyDraftIssue } from './instagram/instagram-types';
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
              {conversation.contact.displayName ??
                (conversation.channel.kind === 'FACEBOOK'
                  ? 'Facebook user'
                  : conversation.channel.kind === 'INSTAGRAM'
                    ? 'Instagram user'
                    : 'Website visitor')}
            </h2>
            {conversation.channel.kind === 'FACEBOOK' ? (
              <Badge
                variant="secondary"
                className="shrink-0 text-[10px] bg-[#1877f2]/10 text-[#1877f2] border-[#1877f2]/20 gap-1 font-medium"
              >
                <Facebook className="size-2.5" /> Messenger
              </Badge>
            ) : conversation.channel.kind === 'INSTAGRAM' ? (
              <Badge
                variant="secondary"
                className="shrink-0 gap-1 border-primary/20 bg-primary-subtle text-[10px] font-medium text-primary"
              >
                <Instagram className="size-2.5" aria-hidden="true" /> Instagram
              </Badge>
            ) : (
              <Badge variant="secondary" className="shrink-0 text-[10px]">
                {conversation.channel.kind.toLowerCase()}
              </Badge>
            )}
          </div>
          <p className="truncate text-xs text-muted-foreground">
            {conversation.channel.kind === 'INSTAGRAM' && conversation.contact.username
              ? `@${conversation.contact.username} · `
              : ''}
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

      {conversation.channel.kind === 'INSTAGRAM' ? (
        <InstagramConversationContext context={conversation.providerContext} />
      ) : null}

      <MessageTranscript isSearchOpen={isSearchOpen} onCloseSearch={() => setIsSearchOpen(false)} />
      <Composer
        canReply={canReply && conversation.capabilities.replies}
        savedReplies={savedReplies}
      />
    </section>
  );
}

function record(value: unknown): Readonly<Record<string, unknown>> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : null;
}

function InstagramConversationContext({ context }: { context: Readonly<Record<string, unknown>> }) {
  const instagram = record(context.instagram);
  if (!instagram) return null;
  const folder = typeof instagram.folder === 'string' ? instagram.folder : 'UNKNOWN';
  const referral = record(instagram.referral);
  const reaction = record(instagram.reaction);
  const replyTo = record(instagram.replyTo);
  const details = [
    folder !== 'UNKNOWN' ? `Native folder: ${folder}` : null,
    referral ? 'Referral context received' : null,
    reaction
      ? `Reaction: ${typeof reaction.emoji === 'string' ? reaction.emoji : 'updated'}`
      : null,
    replyTo ? 'Reply or story context received' : null,
    typeof instagram.quickReplyPayload === 'string' ? 'Quick reply received' : null,
    typeof instagram.postbackPayload === 'string' ? 'Postback received' : null,
  ].filter((item): item is string => Boolean(item));
  if (!details.length) return null;
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-border bg-primary-subtle px-3 py-2 text-[11px] text-muted-foreground">
      <Instagram className="size-3.5 text-primary" aria-hidden="true" />
      {details.map((detail) => (
        <Badge key={detail} variant="outline" className="bg-card text-[10px]">
          {detail}
        </Badge>
      ))}
      <span className="ml-auto">
        Instagram folders remain separate from Maevelle workflow status.
      </span>
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
  const [sending, setSending] = useState(false);
  const [replyQuery, setReplyQuery] = useState('');
  const [eligibility, setEligibility] = useState<
    FacebookReplyEligibility | InstagramReplyEligibility | null
  >(null);
  const [eligibilityState, setEligibilityState] = useState<'idle' | 'loading' | 'ready' | 'error'>(
    'idle',
  );
  const conversation = messaging.conversation;
  const isFacebook = conversation?.channel.kind === 'FACEBOOK';
  const isInstagram = conversation?.channel.kind === 'INSTAGRAM';
  const isMeta = isFacebook || isInstagram;
  const operationGenerationRef = useRef(0);
  const sendingRef = useRef(false);

  useEffect(() => {
    operationGenerationRef.current += 1;
    sendingRef.current = false;
    setText('');
    setAttachmentIds([]);
    setUploading(false);
    setSending(false);
    setReplyQuery('');
  }, [conversation?.id]);

  const refreshEligibility = useCallback(
    async (signal?: AbortSignal) => {
      if (!conversation?.id || !isMeta) {
        setEligibility(null);
        setEligibilityState('idle');
        return;
      }
      setEligibilityState('loading');
      try {
        const next = isInstagram
          ? await instagramApi.getInstagramReplyEligibility(conversation.id, signal)
          : await api.getFacebookReplyEligibility(conversation.id, signal);
        setEligibility(next);
        setEligibilityState('ready');
      } catch (cause) {
        if (cause instanceof DOMException && cause.name === 'AbortError') return;
        setEligibility(null);
        setEligibilityState('error');
      }
    },
    [conversation?.id, isInstagram, isMeta],
  );

  useEffect(() => {
    const controller = new AbortController();
    void refreshEligibility(controller.signal);
    return () => controller.abort();
  }, [messaging.messages.length, refreshEligibility]);

  useEffect(() => {
    if (!isMeta || !eligibility?.allowed || !eligibility.eligibleUntil) return;
    const remaining = new Date(eligibility.eligibleUntil).getTime() - Date.now();
    if (remaining <= 0) {
      void refreshEligibility();
      return;
    }
    const timer = setTimeout(
      () => void refreshEligibility(),
      Math.min(remaining + 250, 2_147_000_000),
    );
    return () => clearTimeout(timer);
  }, [eligibility?.allowed, eligibility?.eligibleUntil, isMeta, refreshEligibility]);

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
    if (sendingRef.current || !conversation || (!text.trim() && !attachmentIds.length)) return;
    const instagramDraftIssue = isInstagram
      ? instagramReplyDraftIssue(text, attachmentIds.length)
      : null;
    if (instagramDraftIssue) {
      toast.add({
        title: 'Choose Text or 1 Image',
        description: instagramDraftIssue,
        type: 'warning',
      });
      return;
    }
    const generation = operationGenerationRef.current;
    sendingRef.current = true;
    setSending(true);
    try {
      if (isMeta) {
        try {
          const latest = isInstagram
            ? await instagramApi.getInstagramReplyEligibility(conversation.id)
            : await api.getFacebookReplyEligibility(conversation.id);
          if (generation !== operationGenerationRef.current) return;
          setEligibility(latest);
          setEligibilityState('ready');
          if (!latest.allowed) {
            toast.add({
              title: isInstagram
                ? instagramReplyCopy(latest.reason).title
                : 'Messenger Reply Restricted',
              description: isInstagram
                ? instagramReplyCopy(latest.reason).description
                : 'The current Meta reply window or connection state does not allow this send.',
              type: 'warning',
            });
            return;
          }
        } catch {
          if (generation !== operationGenerationRef.current) return;
          setEligibilityState('error');
          toast.add({
            title: 'Reply Eligibility Could Not Be Verified',
            description: 'The message was not sent. Check the connection and try again.',
            type: 'error',
          });
          return;
        }
      }
      await messaging.send(text, attachmentIds);
      if (generation === operationGenerationRef.current) {
        // The pending message now owns this immutable draft, including uncertain outcomes.
        setText('');
        setAttachmentIds([]);
      }
      if (isMeta) void refreshEligibility();
    } finally {
      if (generation === operationGenerationRef.current) {
        sendingRef.current = false;
        setSending(false);
      }
    }
  }

  async function attach(file: File) {
    if (!conversation) return;
    const generation = operationGenerationRef.current;
    const conversationId = conversation.id;
    if (isMeta && attachmentIds.length >= 1) {
      toast.add({
        title: 'Single image limit',
        description: `${isInstagram ? 'Instagram' : 'Facebook Messenger'} allows at most 1 image attachment per outgoing message.`,
        type: 'warning',
      });
      return;
    }
    if (isInstagram && text.trim()) {
      toast.add({
        title: 'Choose Text or 1 Image',
        description: 'Clear the text before attaching an Instagram image reply.',
        type: 'warning',
      });
      return;
    }
    setUploading(true);
    try {
      const assetId = await api.uploadStaffAttachment(conversationId, file);
      if (generation !== operationGenerationRef.current) return;
      setAttachmentIds((current) => [...current, assetId]);
      toast.add({ title: 'Image ready to send', type: 'success' });
    } catch (error) {
      if (generation !== operationGenerationRef.current) return;
      toast.add({
        title: 'Image upload failed',
        description: error instanceof Error ? error.message : 'Try again.',
        type: 'error',
      });
    } finally {
      if (generation === operationGenerationRef.current) setUploading(false);
    }
  }

  const isMetaBlocked = isMeta && (eligibilityState !== 'ready' || !eligibility?.allowed);
  const instagramMixedPayload = isInstagram && Boolean(text.trim() && attachmentIds.length);

  if (!canReply)
    return (
      <div className="shrink-0 border-t border-border bg-card p-3 text-center text-sm text-muted-foreground">
        Replies are unavailable for this conversation or your current access.
      </div>
    );

  return (
    <div className="shrink-0 border-t border-border bg-card p-3 pb-[max(.75rem,env(safe-area-inset-bottom))]">
      {isMeta && eligibilityState === 'loading' ? (
        <div
          className="mx-auto mb-2.5 flex max-w-3xl items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground"
          aria-live="polite"
        >
          <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> Checking provider reply
          eligibility…
        </div>
      ) : null}
      {isMeta && eligibilityState === 'error' ? (
        <div
          className="mx-auto mb-2.5 flex max-w-3xl flex-wrap items-center justify-between gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs"
          aria-live="polite"
        >
          <span className="flex items-center gap-2">
            <AlertTriangle className="size-4 text-warning" aria-hidden="true" /> Reply eligibility
            could not be verified. Sending remains disabled.
          </span>
          <Button variant="outline" size="xs" onClick={() => void refreshEligibility()}>
            Retry Check
          </Button>
        </div>
      ) : null}
      {isMeta && eligibilityState === 'ready' && eligibility ? (
        <div className="mx-auto max-w-3xl mb-2.5">
          {eligibility.allowed ? (
            <div className="flex items-center justify-between rounded-lg border border-primary/20 bg-primary-subtle px-3 py-1.5 text-xs text-foreground">
              <span className="flex items-center gap-1.5 font-medium">
                {isInstagram ? (
                  <Instagram className="size-3.5 text-primary" aria-hidden="true" />
                ) : (
                  <Facebook className="size-3.5 text-[#1877f2]" aria-hidden="true" />
                )}
                {isInstagram ? 'Instagram' : 'Messenger'} 24-hour reply window active
              </span>
              {eligibility.eligibleUntil ? (
                <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                  Expires{' '}
                  {formatDistanceToNowStrict(new Date(eligibility.eligibleUntil), {
                    addSuffix: true,
                  })}
                </span>
              ) : null}
            </div>
          ) : (
            <div className="rounded-xl border border-warning/40 bg-warning/10 p-3 text-xs text-foreground space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 font-semibold text-warning">
                  <AlertTriangle className="size-4 shrink-0" />
                  <span>
                    {isInstagram
                      ? instagramReplyCopy(eligibility.reason).title
                      : eligibility.reason === 'WINDOW_CLOSED'
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
                <Badge
                  variant="outline"
                  className="text-[10px] font-mono border-warning/40 bg-card text-foreground"
                >
                  {eligibility.nextAction}
                </Badge>
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                {isInstagram
                  ? instagramReplyCopy(eligibility.reason).description
                  : eligibility.reason === 'WINDOW_CLOSED'
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

      <div
        className={cn(
          'mx-auto max-w-3xl rounded-xl border border-border bg-background p-2 focus-within:ring-2 focus-within:ring-ring/40 transition-opacity',
          isMetaBlocked && 'cursor-not-allowed bg-muted/30 opacity-60',
        )}
      >
        <Textarea
          value={text}
          name="customer-reply"
          autoComplete="off"
          disabled={sending || isMetaBlocked || (isInstagram && attachmentIds.length > 0)}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (
              isSendKeyboardShortcut({
                key: event.key,
                shiftKey: event.shiftKey,
                isComposing: event.nativeEvent.isComposing,
              }) &&
              !isMetaBlocked
            ) {
              event.preventDefault();
              void submit();
            }
          }}
          placeholder={
            isMetaBlocked
              ? 'Replies restricted by provider policy…'
              : isInstagram && attachmentIds.length
                ? 'Remove the image to send text…'
                : 'Reply to the customer…'
          }
          aria-label="Customer reply"
          maxLength={conversation?.capabilities.maximumTextLength ?? (isMeta ? 1000 : 10000)}
          className="min-h-20 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0 disabled:cursor-not-allowed"
        />
        {attachmentIds.length ? (
          <div className="mb-2 flex flex-wrap gap-1">
            <Badge variant="secondary" className="gap-1">
              {attachmentIds.length} image{attachmentIds.length === 1 ? '' : 's'} ready
              <button
                type="button"
                onClick={() => setAttachmentIds([])}
                className="rounded-sm hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="Remove attached image"
              >
                <X className="size-3" aria-hidden="true" />
              </button>
            </Badge>
          </div>
        ) : null}
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1">
            {conversation?.capabilities.attachments ? (
              <Button
                variant="ghost"
                size="icon"
                disabled={
                  uploading ||
                  sending ||
                  isMetaBlocked ||
                  (isMeta && attachmentIds.length >= 1) ||
                  (isInstagram && Boolean(text.trim()))
                }
                render={<label />}
                aria-label="Attach image"
                title={
                  isMeta && attachmentIds.length >= 1
                    ? `Only 1 image is allowed per ${isInstagram ? 'Instagram' : 'Facebook'} reply`
                    : isInstagram && text.trim()
                      ? 'Clear text before attaching an Instagram image'
                      : 'Attach image'
                }
              >
                {uploading ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <ImagePlus className="size-4" />
                )}
                <input
                  type="file"
                  accept={
                    isMeta
                      ? eligibility?.supportedAttachmentMimeTypes.join(',') ||
                        'image/jpeg,image/png,image/webp'
                      : 'image/jpeg,image/png,image/webp'
                  }
                  disabled={
                    uploading ||
                    sending ||
                    isMetaBlocked ||
                    (isMeta && attachmentIds.length >= 1) ||
                    (isInstagram && Boolean(text.trim()))
                  }
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
                            <p className="line-clamp-2 text-xs text-muted-foreground">
                              {reply.body}
                            </p>
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
            disabled={
              (!text.trim() && !attachmentIds.length) ||
              uploading ||
              sending ||
              isMetaBlocked ||
              instagramMixedPayload
            }
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
