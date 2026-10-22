'use client';

import * as React from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Button } from '../../components/ui/button';
import { cx } from '../../components/ui/classnames';
import { ChevronDownIcon } from '../../components/ui/icons';
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
} from '../../components/ui/message-scroller';

import { ImageLightbox } from './image-lightbox';
import { findFirstUnreadStaffIndex } from './model';
import { PrivateChatImage } from './private-image';
import type { ChatMessageItem, PendingMessage } from './types';

const URL_REGEX = /(https?:\/\/[^\s<]+[^<.,:;"')\]\s])/g;
const BANGLA_REGEX = /[\u0980-\u09FF]/;

export function formatTime(value: string): string {
  return new Intl.DateTimeFormat('en-BD', { hour: 'numeric', minute: '2-digit' }).format(
    new Date(value),
  );
}

export function formatDay(value: string): string {
  const date = new Date(value);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return 'Today';
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return new Intl.DateTimeFormat('en-BD', { day: 'numeric', month: 'short' }).format(date);
}

export function deliveryLabel(item: ChatMessageItem): string | null {
  if (item.pending) {
    if (item.pending.state === 'sending') return 'Sending…';
    if (item.pending.state === 'uncertain') return 'Not confirmed';
    return 'Not sent';
  }
  const state = item.canonical?.delivery.state;
  if (state === 'READ') return 'Seen';
  if (state === 'FAILED_PERMANENT' || state === 'FAILED_TRANSIENT') return 'Delivery failed';
  return item.canonical?.direction === 'INBOUND' ? 'Sent' : null;
}

export function renderFormattedMessage(text: string) {
  const hasBangla = BANGLA_REGEX.test(text);
  const parts = text.split(URL_REGEX);

  return (
    <p
      className={cx(
        'whitespace-pre-wrap break-words leading-relaxed',
        hasBangla && 'font-bangla',
      )}
      lang={hasBangla ? 'bn' : undefined}
    >
      {parts.map((part, index) => {
        if (/^https?:\/\//i.test(part)) {
          return (
            <a
              className="break-all font-medium underline underline-offset-2 hover:opacity-85"
              href={part}
              key={index}
              rel="noopener noreferrer"
              target="_blank"
            >
              {part}
            </a>
          );
        }
        return part;
      })}
    </p>
  );
}

export function MessageBubble({
  isGrouped,
  item,
  onOpenImage,
  onRemove,
  onRetry,
}: {
  readonly isGrouped: boolean;
  readonly item: ChatMessageItem;
  readonly onOpenImage: (props: {
    imageSrc: string;
    altText: string;
    fileName?: string | null;
    downloadPath?: string | null;
  }) => void;
  readonly onRemove: (id: string) => void;
  readonly onRetry: (message: PendingMessage) => void;
}) {
  const message = item.canonical;
  const pending = item.pending;
  const fromCustomer = pending !== null || message?.direction === 'INBOUND';
  const createdAt = pending?.createdAt ?? message?.createdAt ?? new Date().toISOString();
  const text = pending?.text ?? message?.text;
  const previewUrls = pending?.previewUrls ?? [];
  const attachments = message?.attachments ?? [];
  const status = deliveryLabel(item);

  return (
    <article
      className={cx(
        'flex flex-col gap-1',
        fromCustomer ? 'items-end pl-10' : 'items-start pr-10',
        isGrouped ? 'mt-1' : 'mt-3.5',
      )}
    >
      {!fromCustomer && message?.sender.name && !isGrouped ? (
        <span className="px-1 text-label-sm font-semibold text-on-surface-variant">
          {message.sender.name}
        </span>
      ) : null}
      <div
        className={cx(
          'max-w-full overflow-hidden rounded-2xl px-3.5 py-2.5 text-body-md shadow-xs',
          fromCustomer
            ? cx(
                'bg-primary text-on-primary',
                isGrouped ? 'rounded-tr-md rounded-br-md' : 'rounded-br-xs',
              )
            : cx(
                'border border-border-subtle bg-surface-container-lowest text-on-surface',
                isGrouped ? 'rounded-tl-md rounded-bl-md' : 'rounded-bl-xs',
              ),
          pending?.state !== 'sending' && pending ? 'ring-1 ring-warning' : '',
        )}
      >
        {previewUrls.length ? (
          <div className={cx('mb-2 grid gap-1.5', previewUrls.length > 1 && 'grid-cols-2')}>
            {previewUrls.map((url, index) => (
              <button
                className="group relative aspect-square min-w-24 overflow-hidden rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                key={url}
                onClick={() =>
                  onOpenImage({
                    imageSrc: url,
                    altText: `Preview image ${index + 1}`,
                  })
                }
                type="button"
              >
                <img
                  alt={`Selected image ${index + 1}`}
                  className="size-full object-cover transition-transform duration-150 group-hover:scale-105"
                  src={url}
                />
              </button>
            ))}
          </div>
        ) : null}
        {attachments.length ? (
          <div className={cx('mb-2 grid gap-1.5', attachments.length > 1 && 'grid-cols-2')}>
            {attachments.map((attachment, index) =>
              attachment.downloadPath ? (
                <button
                  className="group relative aspect-square min-w-24 overflow-hidden rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                  key={attachment.id}
                  onClick={() =>
                    onOpenImage({
                      imageSrc: attachment.downloadPath!,
                      altText: attachment.fileName ?? `Chat image ${index + 1}`,
                      fileName: attachment.fileName,
                      downloadPath: attachment.downloadPath,
                    })
                  }
                  type="button"
                >
                  <PrivateChatImage
                    alt={attachment.fileName ?? `Chat image ${index + 1}`}
                    className="size-full transition-transform duration-150 group-hover:scale-105"
                    path={attachment.downloadPath}
                  />
                </button>
              ) : (
                <div
                  className="grid aspect-square min-w-24 place-items-center rounded-xl bg-surface-container text-body-sm text-on-surface-variant"
                  key={attachment.id}
                >
                  Processing image…
                </div>
              ),
            )}
          </div>
        ) : null}
        {text ? renderFormattedMessage(text) : null}
      </div>
      <div className="flex items-center gap-2 px-1 text-label-sm text-on-surface-variant font-mono tabular-nums">
        <time dateTime={createdAt}>{formatTime(createdAt)}</time>
        {status ? <span>· {status}</span> : null}
      </div>
      {pending && pending.state !== 'sending' ? (
        <div className="flex items-center gap-1.5 pt-0.5">
          <button
            className="flex min-h-9 items-center rounded-lg px-2.5 text-label-md font-semibold text-primary transition-colors duration-150 hover:bg-primary-subtle active:scale-98"
            onClick={() => onRetry(pending)}
            type="button"
          >
            Retry
          </button>
          <button
            className="flex min-h-9 items-center rounded-lg px-2.5 text-label-md text-on-surface-variant transition-colors duration-150 hover:bg-surface-container active:scale-98"
            onClick={() => onRemove(pending.clientMessageId)}
            type="button"
          >
            Remove
          </button>
        </div>
      ) : null}
    </article>
  );
}

export interface MessageListProps {
  readonly conversationId?: string | undefined;
  readonly lastReadSequence?: string | null | undefined;
  readonly hasMore: boolean;
  readonly items: readonly ChatMessageItem[];
  readonly loadingOlder: boolean;
  readonly onLoadOlder: () => void;
  readonly onMarkAsRead?: ((sequence: string) => Promise<void>) | undefined;
  readonly onRemove: (id: string) => void;
  readonly onRetry: (message: PendingMessage) => void;
  readonly open?: boolean | undefined;
}

function MessageListInner({
  hasMore,
  items,
  lastReadSequence,
  loadingOlder,
  onLoadOlder,
  onMarkAsRead,
  onRemove,
  onRetry,
  open = true,
}: MessageListProps) {
  const scroller = useMessageScroller();
  const scrollable = useMessageScrollerScrollable();
  const { visibleMessageIds } = useMessageScrollerVisibility();

  const [offscreenUnreadCount, setOffscreenUnreadCount] = useState(0);
  const [lightbox, setLightbox] = useState<{
    isOpen: boolean;
    imageSrc: string;
    altText: string;
    fileName?: string | null;
    downloadPath?: string | null;
  } | null>(null);

  const previousCountRef = useRef(items.length);
  const previousPendingCountRef = useRef(items.filter((i) => i.pending !== null).length);
  const isAtEndRef = useRef(!scrollable.end);
  const currentReadingIdRef = useRef<string | null>(null);
  const wasOpenRef = useRef(open);

  // Maintain reading position anchor based on visible messages
  useEffect(() => {
    if (visibleMessageIds.length > 0) {
      const candidate = visibleMessageIds.find((id) => id.startsWith('msg-'));
      if (candidate) {
        currentReadingIdRef.current = candidate;
      }
    }
  }, [visibleMessageIds]);

  // Keep track of live edge state; reset offscreen unread counter when at bottom
  useEffect(() => {
    isAtEndRef.current = !scrollable.end;
    if (!scrollable.end) {
      setOffscreenUnreadCount(0);
    }
  }, [scrollable.end]);

  // When new messages arrive while away from the edge, increment offscreen unread counter
  useEffect(() => {
    if (items.length > previousCountRef.current) {
      const addedItems = items.slice(previousCountRef.current);
      if (scrollable.end) {
        const newStaffCount = addedItems.filter(
          (item) => item.canonical?.direction === 'OUTBOUND',
        ).length;
        if (newStaffCount > 0) {
          setOffscreenUnreadCount((count) => count + newStaffCount);
        }
      }
    }
    previousCountRef.current = items.length;
  }, [items, scrollable.end]);

  // When customer sends an outgoing message (pending message added), follow to the live edge
  const currentPendingCount = useMemo(
    () => items.filter((i) => i.pending !== null).length,
    [items],
  );
  useEffect(() => {
    if (currentPendingCount > previousPendingCountRef.current) {
      scroller.scrollToEnd({ behavior: 'smooth' });
      setOffscreenUnreadCount(0);
    }
    previousPendingCountRef.current = currentPendingCount;
  }, [currentPendingCount, scroller]);

  // Restore position when chat transitions from minimized to reopened
  useEffect(() => {
    if (!wasOpenRef.current && open) {
      if (isAtEndRef.current) {
        scroller.scrollToEnd({ behavior: 'instant' });
      } else if (currentReadingIdRef.current) {
        scroller.scrollToMessage(currentReadingIdRef.current, {
          behavior: 'instant',
          align: 'start',
        });
      }
    }
    wasOpenRef.current = open;
  }, [open, scroller]);

  // Viewport visibility-driven read receipts: only mark staff messages read when visible
  useEffect(() => {
    if (
      !open ||
      !onMarkAsRead ||
      !visibleMessageIds.length ||
      typeof document === 'undefined' ||
      document.visibilityState !== 'visible'
    ) {
      return;
    }

    let highestVisibleStaffSeq: bigint | null = null;

    for (const visibleId of visibleMessageIds) {
      if (!visibleId.startsWith('msg-')) continue;
      const key = visibleId.slice(4);
      const item = items.find((i) => i.key === key);
      if (item?.canonical && item.canonical.direction === 'OUTBOUND') {
        try {
          const seq = BigInt(item.canonical.sequence);
          if (highestVisibleStaffSeq === null || seq > highestVisibleStaffSeq) {
            highestVisibleStaffSeq = seq;
          }
        } catch {
          // ignore parsing error
        }
      }
    }

    if (highestVisibleStaffSeq !== null) {
      void onMarkAsRead(highestVisibleStaffSeq.toString());
    }
  }, [visibleMessageIds, items, onMarkAsRead, open]);

  const handleScrollToEnd = useCallback(() => {
    scroller.scrollToEnd({ behavior: 'smooth' });
    setOffscreenUnreadCount(0);
  }, [scroller]);

  // Identify first unread outbound staff message for unread marker
  const firstUnreadIndex = useMemo(() => {
    return findFirstUnreadStaffIndex(items, lastReadSequence);
  }, [items, lastReadSequence]);

  let lastDay = '';

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <MessageScroller className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        <MessageScrollerViewport
          aria-label="Customer conversation messages"
          className="size-full min-h-0 overflow-y-auto overscroll-contain px-4 py-4"
          preserveScrollOnPrepend={true}
          role="log"
        >
          <MessageScrollerContent className="mx-auto flex w-full flex-col gap-2">
            {/* History loader / start marker */}
            {hasMore ? (
              <MessageScrollerItem
                messageId="history-loader"
                className="my-2 flex justify-center [contain-intrinsic-size:auto_2.5rem]"
              >
                <Button
                  disabled={loadingOlder}
                  loading={loadingOlder}
                  onClick={onLoadOlder}
                  size="sm"
                  variant="ghost"
                >
                  {loadingOlder ? 'Loading older messages…' : 'Load older messages'}
                </Button>
              </MessageScrollerItem>
            ) : items.length > 0 ? (
              <MessageScrollerItem
                messageId="history-start"
                className="my-2 flex justify-center [contain-intrinsic-size:auto_2rem]"
              >
                <span className="font-mono text-label-sm text-on-surface-variant/60 select-none">
                  Beginning of conversation history
                </span>
              </MessageScrollerItem>
            ) : null}

            {/* Message transcript items */}
            {items.map((item, index) => {
              const createdAt =
                item.pending?.createdAt ?? item.canonical?.createdAt ?? '';
              const currentDay = formatDay(createdAt);
              const separator = currentDay !== lastDay;
              lastDay = currentDay;

              const prevItem = index > 0 ? items[index - 1] : null;
              const prevCreatedAt =
                prevItem?.pending?.createdAt ?? prevItem?.canonical?.createdAt ?? '';
              const isCustomer =
                item.pending !== null || item.canonical?.direction === 'INBOUND';
              const prevIsCustomer =
                prevItem?.pending !== null || prevItem?.canonical?.direction === 'INBOUND';

              const timeDiff =
                createdAt && prevCreatedAt
                  ? Math.abs(new Date(createdAt).getTime() - new Date(prevCreatedAt).getTime())
                  : Infinity;

              const isGrouped =
                !separator &&
                prevItem !== null &&
                isCustomer === prevIsCustomer &&
                timeDiff < 2 * 60_000;

              const isFirstUnread = index === firstUnreadIndex;

              return (
                <React.Fragment key={item.key}>
                  {/* Calendar day divider */}
                  {separator ? (
                    <MessageScrollerItem
                      messageId={`date-${item.key}`}
                      scrollAnchor={false}
                      className="my-3 flex justify-center [contain-intrinsic-size:auto_2rem]"
                    >
                      <span className="rounded-full bg-surface-container px-3 py-1 text-label-sm font-medium text-on-surface-variant select-none">
                        {currentDay}
                      </span>
                    </MessageScrollerItem>
                  ) : null}

                  {/* Unread marker divider */}
                  {isFirstUnread ? (
                    <MessageScrollerItem
                      messageId="unread-marker"
                      scrollAnchor={true}
                      className="my-3 flex items-center gap-3 [contain-intrinsic-size:auto_2rem]"
                    >
                      <div className="h-px flex-1 bg-primary/25" />
                      <span className="flex items-center gap-1 rounded-full bg-primary-subtle px-3 py-0.5 text-label-sm font-semibold text-primary shadow-xs select-none">
                        New messages
                      </span>
                      <div className="h-px flex-1 bg-primary/25" />
                    </MessageScrollerItem>
                  ) : null}

                  {/* Standard message bubble */}
                  <MessageScrollerItem
                    messageId={`msg-${item.key}`}
                    scrollAnchor={false}
                    className="min-w-0"
                  >
                    <MessageBubble
                      isGrouped={isGrouped}
                      item={item}
                      onOpenImage={(props) => setLightbox({ isOpen: true, ...props })}
                      onRemove={onRemove}
                      onRetry={onRetry}
                    />
                  </MessageScrollerItem>
                </React.Fragment>
              );
            })}
          </MessageScrollerContent>
        </MessageScrollerViewport>

        {/* Floating scroll to end button with unread counter */}
        {offscreenUnreadCount > 0 ? (
          <MessageScrollerButton
            direction="end"
            className="bottom-3 right-4 z-10"
            onClick={handleScrollToEnd}
          >
            <span className="flex min-h-9 items-center gap-1.5 rounded-full bg-primary px-3.5 text-label-sm font-semibold text-on-primary shadow-floating transition-transform duration-150 hover:bg-primary-hover active:scale-98">
              <ChevronDownIcon size={16} />
              <span>
                {offscreenUnreadCount} new message
                {offscreenUnreadCount > 1 ? 's' : ''}
              </span>
            </span>
          </MessageScrollerButton>
        ) : (
          <MessageScrollerButton
            direction="end"
            className="bottom-3 right-4 z-10"
            onClick={handleScrollToEnd}
          />
        )}
      </MessageScroller>

      {lightbox?.isOpen ? (
        <ImageLightbox
          altText={lightbox.altText}
          downloadPath={lightbox.downloadPath}
          fileName={lightbox.fileName}
          imageSrc={lightbox.imageSrc}
          isOpen={lightbox.isOpen}
          onClose={() => setLightbox(null)}
        />
      ) : null}
    </div>
  );
}

export function MessageList(props: MessageListProps) {
  const { conversationId, items, lastReadSequence } = props;

  // Determine if this conversation opens with unread staff messages
  const hasInitialUnread = useMemo(() => {
    return findFirstUnreadStaffIndex(items, lastReadSequence) !== -1;
  }, [items, lastReadSequence]);

  return (
    <MessageScrollerProvider
      key={conversationId ?? 'storefront-chat'}
      defaultScrollPosition={hasInitialUnread ? 'last-anchor' : 'end'}
      scrollPreviousItemPeek={48}
      scrollEdgeThreshold={48}
      autoScroll={true}
    >
      <MessageListInner {...props} />
    </MessageScrollerProvider>
  );
}
