'use client';

import { ArrowDown, Loader2 } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import * as React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { MessageView } from '@maevelle/contracts/messaging';

import { Button } from '@/components/ui/button';
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
  useMessageScroller,
  useMessageScrollerScrollable,
  useMessageScrollerVisibility,
} from '@/components/ui/message-scroller';
import { formatDateSeparator, isSameDay } from './format';
import { useMessaging } from './messaging-provider';
import { TranscriptMessageItem, TranscriptPendingItem } from './transcript-message-item';
import { TranscriptSearchBar } from './transcript-search-bar';

export function findFirstUnreadIndex(
  messages: readonly MessageView[],
  unreadCount: number,
  lastReadSequence?: string | null | undefined,
): number {
  if (unreadCount <= 0 && !lastReadSequence) return -1;
  if (lastReadSequence) {
    try {
      const readSeq = BigInt(lastReadSequence);
      const idx = messages.findIndex(
        (m) => m.direction === 'INBOUND' && BigInt(m.sequence) > readSeq,
      );
      if (idx !== -1) return idx;
    } catch {
      // fallback
    }
  }
  if (unreadCount <= 0) return -1;
  // If no lastReadSequence or no message found above it, pick the first of the last `unreadCount` inbound messages
  const inboundIndices: number[] = [];
  messages.forEach((m, idx) => {
    if (m.direction === 'INBOUND') {
      inboundIndices.push(idx);
    }
  });
  if (inboundIndices.length === 0) return -1;
  const targetIndex = inboundIndices[Math.max(0, inboundIndices.length - unreadCount)];
  return targetIndex !== undefined ? targetIndex : -1;
}

/**
 * Monitors visible messages in the viewport and reconciles unread state.
 * Only marks messages read when they actually enter the viewport,
 * preventing eager mount read false-positives.
 */
function TranscriptVisibilityTracker({
  messages,
  onMarkAsRead,
}: {
  messages: readonly MessageView[];
  onMarkAsRead: (sequence: string) => Promise<void>;
}) {
  const { visibleMessageIds } = useMessageScrollerVisibility();

  useEffect(() => {
    if (
      !visibleMessageIds.length ||
      typeof document === 'undefined' ||
      document.visibilityState !== 'visible'
    ) {
      return;
    }

    let highestVisibleInboundSeq: bigint | null = null;

    for (const visibleId of visibleMessageIds) {
      if (!visibleId.startsWith('msg-')) continue;
      const messageId = visibleId.slice(4);
      const msg = messages.find((m) => m.id === messageId);
      if (msg && msg.direction === 'INBOUND') {
        try {
          const seq = BigInt(msg.sequence);
          if (highestVisibleInboundSeq === null || seq > highestVisibleInboundSeq) {
            highestVisibleInboundSeq = seq;
          }
        } catch {
          // ignore parsing error
        }
      }
    }

    if (highestVisibleInboundSeq !== null) {
      void onMarkAsRead(highestVisibleInboundSeq.toString());
    }
  }, [visibleMessageIds, messages, onMarkAsRead]);

  return null;
}

export interface MessageTranscriptProps {
  isSearchOpen?: boolean | undefined;
  onCloseSearch?: (() => void) | undefined;
}

function MessageTranscriptInner({ isSearchOpen = false, onCloseSearch }: MessageTranscriptProps) {
  const messaging = useMessaging();
  const searchParams = useSearchParams();
  const scroller = useMessageScroller();
  const scrollable = useMessageScrollerScrollable();

  const conversation = messaging.conversation;
  const messages = messaging.messages;
  const pendingMessages = messaging.pendingMessages;

  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const [targetMessageId, setTargetMessageId] = useState<string | null>(null);

  // Track offscreen inbound messages arriving while scrolled away from the edge
  const [offscreenUnreadCount, setOffscreenUnreadCount] = useState(0);
  const previousMessageCountRef = useRef(messages.length);

  // When operator is at the live edge, reset the offscreen counter
  useEffect(() => {
    if (!scrollable.end) {
      setOffscreenUnreadCount(0);
    }
  }, [scrollable.end]);

  // When new messages arrive while the operator is scrolled up, track offscreen unread count
  useEffect(() => {
    if (messages.length > previousMessageCountRef.current) {
      const addedMessages = messages.slice(previousMessageCountRef.current);
      if (scrollable.end) {
        const newInboundCount = addedMessages.filter((m) => m.direction === 'INBOUND').length;
        if (newInboundCount > 0) {
          setOffscreenUnreadCount((c) => c + newInboundCount);
        }
      }
    }
    previousMessageCountRef.current = messages.length;
  }, [messages, scrollable.end]);

  // Filter messages for search matches
  const searchMatchIds = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const query = searchQuery.trim().toLowerCase();
    const matches: string[] = [];
    for (const msg of messages) {
      const textMatch = msg.text?.toLowerCase().includes(query);
      const attachmentMatch = msg.attachments.some((att) =>
        att.fileName?.toLowerCase().includes(query),
      );
      if (textMatch || attachmentMatch) {
        matches.push(msg.id);
      }
    }
    return matches;
  }, [messages, searchQuery]);

  // When matches change, reset index to 0 and jump to first match
  useEffect(() => {
    if (searchMatchIds.length > 0) {
      setCurrentMatchIndex(0);
      const matchId = searchMatchIds[0];
      scroller.scrollToMessage(`msg-${matchId}`, {
        behavior: 'smooth',
        align: 'center',
      });
    }
  }, [searchMatchIds, scroller]);

  const handleNextMatch = useCallback(() => {
    if (!searchMatchIds.length) return;
    const nextIndex = (currentMatchIndex + 1) % searchMatchIds.length;
    setCurrentMatchIndex(nextIndex);
    const matchId = searchMatchIds[nextIndex];
    scroller.scrollToMessage(`msg-${matchId}`, {
      behavior: 'smooth',
      align: 'center',
    });
  }, [searchMatchIds, currentMatchIndex, scroller]);

  const handlePrevMatch = useCallback(() => {
    if (!searchMatchIds.length) return;
    const prevIndex = (currentMatchIndex - 1 + searchMatchIds.length) % searchMatchIds.length;
    setCurrentMatchIndex(prevIndex);
    const matchId = searchMatchIds[prevIndex];
    scroller.scrollToMessage(`msg-${matchId}`, {
      behavior: 'smooth',
      align: 'center',
    });
  }, [searchMatchIds, currentMatchIndex, scroller]);

  // Handle deep-link permalinks (?message=<id> or #msg-<id>)
  useEffect(() => {
    const permalinkId =
      searchParams.get('message') ??
      (typeof window !== 'undefined' && window.location.hash.startsWith('#msg-')
        ? window.location.hash.slice(5)
        : null);

    if (!permalinkId) return;

    let cancelled = false;

    async function navigateToPermalink(id: string) {
      const existing = messages.find((m) => m.id === id);
      if (!existing && messaging.hasOlderMessages) {
        const loaded = await messaging.ensureMessageLoaded(id);
        if (!loaded || cancelled) return;
      }
      if (cancelled) return;

      const scrolled = scroller.scrollToMessage(`msg-${id}`, {
        behavior: 'smooth',
        align: 'center',
      });
      if (scrolled) {
        setTargetMessageId(id);
        setTimeout(() => {
          if (!cancelled) setTargetMessageId(null);
        }, 2000);
      }
    }

    void navigateToPermalink(permalinkId);

    return () => {
      cancelled = true;
    };
  }, [searchParams, messaging, messages, scroller]);

  const handleLoadOlder = useCallback(async () => {
    setIsLoadingOlder(true);
    try {
      await messaging.loadOlderMessages();
    } finally {
      setIsLoadingOlder(false);
    }
  }, [messaging]);

  const handleScrollToEnd = useCallback(() => {
    scroller.scrollToEnd({ behavior: 'smooth' });
    setOffscreenUnreadCount(0);
  }, [scroller]);

  // Identify first unread inbound message for the unread marker
  const lastReadSeq = (conversation as { lastReadSequence?: string | null } | null)
    ?.lastReadSequence;
  const unreadCount = conversation?.unreadCount ?? 0;
  const firstUnreadIndex = useMemo(() => {
    return findFirstUnreadIndex(messages, unreadCount, lastReadSeq);
  }, [messages, unreadCount, lastReadSeq]);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
      {isSearchOpen ? (
        <TranscriptSearchBar
          isOpen={isSearchOpen}
          onClose={() => {
            setSearchQuery('');
            onCloseSearch?.();
          }}
          query={searchQuery}
          onQueryChange={setSearchQuery}
          matchCount={searchMatchIds.length}
          currentMatchIndex={currentMatchIndex}
          onNextMatch={handleNextMatch}
          onPrevMatch={handlePrevMatch}
        />
      ) : null}

      <TranscriptVisibilityTracker messages={messages} onMarkAsRead={messaging.markAsRead} />

      <MessageScroller className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        <MessageScrollerViewport
          preserveScrollOnPrepend={true}
          className="size-full min-h-0 overflow-y-auto overscroll-contain p-3 sm:p-4"
          aria-live="polite"
        >
          <MessageScrollerContent className="mx-auto flex w-full max-w-3xl flex-col gap-3.5">
            {/* History loader / start marker */}
            {messaging.hasOlderMessages ? (
              <MessageScrollerItem
                messageId="history-loader"
                className="my-1 flex justify-center [contain-intrinsic-size:auto_2.5rem]"
              >
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={isLoadingOlder}
                  onClick={() => void handleLoadOlder()}
                  className="h-8 gap-2 text-xs text-muted-foreground hover:text-foreground"
                >
                  {isLoadingOlder ? (
                    <>
                      <Loader2 className="size-3.5 animate-spin" />
                      Loading older messages…
                    </>
                  ) : (
                    'Load older messages'
                  )}
                </Button>
              </MessageScrollerItem>
            ) : messages.length > 0 ? (
              <MessageScrollerItem
                messageId="history-start"
                className="my-2 flex justify-center [contain-intrinsic-size:auto_2rem]"
              >
                <span className="font-mono text-[11px] text-muted-foreground/60 select-none">
                  Beginning of conversation history
                </span>
              </MessageScrollerItem>
            ) : null}

            {/* Message transcript items */}
            {messages.map((message, index) => {
              const prevMessage = index > 0 ? messages[index - 1] : null;
              const isDifferentDay =
                !prevMessage || !isSameDay(message.createdAt, prevMessage.createdAt);
              const isFirstUnread = index === firstUnreadIndex;
              const isMatch = searchMatchIds.includes(message.id);
              const isTarget = targetMessageId === message.id;

              return (
                <React.Fragment key={message.id}>
                  {/* Calendar day divider */}
                  {isDifferentDay ? (
                    <MessageScrollerItem
                      messageId={`date-${message.id}`}
                      className="my-2 flex justify-center [contain-intrinsic-size:auto_2rem]"
                    >
                      <span className="rounded-full border border-border bg-card/90 px-3 py-0.5 font-mono text-[11px] font-medium text-muted-foreground shadow-2xs backdrop-blur-xs select-none">
                        {formatDateSeparator(message.createdAt)}
                      </span>
                    </MessageScrollerItem>
                  ) : null}

                  {/* Unread marker divider */}
                  {isFirstUnread ? (
                    <MessageScrollerItem
                      messageId="unread-marker"
                      scrollAnchor={true}
                      className="my-2 flex items-center gap-3 [contain-intrinsic-size:auto_2rem]"
                    >
                      <div className="h-px flex-1 bg-primary/30" />
                      <span className="flex items-center gap-1 rounded-full border border-primary/30 bg-primary-subtle px-2.5 py-0.5 text-[11px] font-semibold text-primary shadow-2xs select-none">
                        New messages
                      </span>
                      <div className="h-px flex-1 bg-primary/30" />
                    </MessageScrollerItem>
                  ) : null}

                  {/* Standard message item (scrollAnchor is false so inbound arrivals do not yank scroll) */}
                  <MessageScrollerItem
                    messageId={`msg-${message.id}`}
                    scrollAnchor={false}
                    className="min-w-0"
                  >
                    <TranscriptMessageItem
                      message={message}
                      channelKind={conversation?.channel.kind}
                      searchQuery={searchQuery}
                      isSearchMatch={isMatch}
                      isTarget={isTarget}
                    />
                  </MessageScrollerItem>
                </React.Fragment>
              );
            })}

            {/* Optimistic pending outbound messages */}
            {pendingMessages.map((pending) => (
              <MessageScrollerItem
                key={pending.key}
                messageId={`pending-${pending.key}`}
                scrollAnchor={false}
                className="min-w-0"
              >
                <TranscriptPendingItem
                  pending={pending}
                  onRetry={messaging.retryPending}
                  onDismiss={messaging.removePending}
                />
              </MessageScrollerItem>
            ))}

            {messages.length === 0 && pendingMessages.length === 0 ? (
              <div className="flex h-64 items-center justify-center text-center text-sm text-muted-foreground">
                No messages yet in this conversation.
              </div>
            ) : null}
          </MessageScrollerContent>
        </MessageScrollerViewport>

        {/* Floating scroll to end button with unread counter */}
        {offscreenUnreadCount > 0 ? (
          <MessageScrollerButton
            direction="end"
            className="bottom-4 right-4 z-10 border-border bg-card text-foreground shadow-md transition-colors duration-150 hover:bg-muted"
            onClick={handleScrollToEnd}
            render={
              <Button
                variant="secondary"
                size="sm"
                className="h-8 gap-1.5 border border-primary/30 bg-card px-3 text-xs font-semibold text-primary shadow-md hover:bg-primary-subtle"
              >
                <ArrowDown className="size-3.5" />
                <span>
                  {offscreenUnreadCount} new message
                  {offscreenUnreadCount > 1 ? 's' : ''}
                </span>
              </Button>
            }
          />
        ) : (
          <MessageScrollerButton
            direction="end"
            className="bottom-4 right-4 z-10 border-border bg-card text-foreground shadow-md transition-colors duration-150 hover:bg-muted"
            onClick={handleScrollToEnd}
          />
        )}
      </MessageScroller>
    </div>
  );
}

export function MessageTranscript(props: MessageTranscriptProps) {
  const messaging = useMessaging();
  const conversation = messaging.conversation;
  const messages = messaging.messages;

  // Determine if this conversation initially opens with unread messages
  const lastReadSeq = (conversation as { lastReadSequence?: string | null } | null)
    ?.lastReadSequence;
  const unreadCount = conversation?.unreadCount ?? 0;
  const hasInitialUnread = useMemo(() => {
    return findFirstUnreadIndex(messages, unreadCount, lastReadSeq) !== -1;
  }, [messages, unreadCount, lastReadSeq]);

  if (!conversation) return null;

  return (
    <MessageScrollerProvider
      key={conversation.id}
      defaultScrollPosition={hasInitialUnread ? 'last-anchor' : 'end'}
      scrollPreviousItemPeek={64}
      scrollEdgeThreshold={48}
    >
      <MessageTranscriptInner {...props} />
    </MessageScrollerProvider>
  );
}
