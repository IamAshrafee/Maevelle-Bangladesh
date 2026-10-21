'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { cx } from '@/components/ui/classnames';

import { PrivateChatImage } from './private-image';
import type { ChatMessageItem, PendingMessage } from './types';

function time(value: string) {
  return new Intl.DateTimeFormat('en-BD', { hour: 'numeric', minute: '2-digit' }).format(
    new Date(value),
  );
}

function day(value: string) {
  const date = new Date(value);
  const today = new Date();
  if (date.toDateString() === today.toDateString()) return 'Today';
  return new Intl.DateTimeFormat('en-BD', { day: 'numeric', month: 'short' }).format(date);
}

function deliveryLabel(item: ChatMessageItem) {
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

function MessageBubble({
  item,
  onRemove,
  onRetry,
}: {
  readonly item: ChatMessageItem;
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
      className={cx('flex flex-col gap-1', fromCustomer ? 'items-end pl-10' : 'items-start pr-10')}
    >
      {!fromCustomer && message?.sender.name ? (
        <span className="px-1 text-label-sm font-semibold text-on-surface-variant">
          {message.sender.name}
        </span>
      ) : null}
      <div
        className={cx(
          'max-w-full overflow-hidden rounded-2xl px-3.5 py-2.5 text-body-md shadow-xs',
          fromCustomer
            ? 'rounded-br-sm bg-primary text-on-primary'
            : 'rounded-bl-sm border border-border-subtle bg-surface-container-lowest text-on-surface',
          pending?.state !== 'sending' && pending ? 'ring-1 ring-warning' : '',
        )}
      >
        {previewUrls.length ? (
          <div className={cx('mb-2 grid gap-1.5', previewUrls.length > 1 && 'grid-cols-2')}>
            {previewUrls.map((url, index) => (
              <img
                alt={`Selected image ${index + 1}`}
                className="aspect-square min-w-24 rounded-xl object-cover"
                key={url}
                src={url}
              />
            ))}
          </div>
        ) : null}
        {attachments.length ? (
          <div className={cx('mb-2 grid gap-1.5', attachments.length > 1 && 'grid-cols-2')}>
            {attachments.map((attachment, index) =>
              attachment.downloadPath ? (
                <a
                  href={attachment.downloadPath}
                  key={attachment.id}
                  rel="noreferrer"
                  target="_blank"
                >
                  <PrivateChatImage
                    alt={attachment.fileName ?? `Chat image ${index + 1}`}
                    className="min-w-24"
                    path={attachment.downloadPath}
                  />
                </a>
              ) : (
                <div
                  className="grid aspect-square min-w-24 place-items-center rounded-xl bg-surface-container text-body-sm"
                  key={attachment.id}
                >
                  Image processing
                </div>
              ),
            )}
          </div>
        ) : null}
        {text ? <p className="whitespace-pre-wrap break-words">{text}</p> : null}
      </div>
      <div className="flex items-center gap-2 px-1 text-label-sm text-on-surface-variant">
        <time dateTime={createdAt}>{time(createdAt)}</time>
        {status ? <span>{status}</span> : null}
      </div>
      {pending && pending.state !== 'sending' ? (
        <div className="flex items-center gap-1">
          <button
            className="min-h-9 rounded-lg px-2 text-label-md font-semibold text-primary hover:bg-primary-subtle"
            onClick={() => onRetry(pending)}
            type="button"
          >
            Retry
          </button>
          <button
            className="min-h-9 rounded-lg px-2 text-label-md text-on-surface-variant hover:bg-surface-container"
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

export function MessageList({
  hasMore,
  items,
  loadingOlder,
  onLoadOlder,
  onRemove,
  onRetry,
}: {
  readonly hasMore: boolean;
  readonly items: readonly ChatMessageItem[];
  readonly loadingOlder: boolean;
  readonly onLoadOlder: () => void;
  readonly onRemove: (id: string) => void;
  readonly onRetry: (message: PendingMessage) => void;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const previousHeight = useRef(0);
  const previousCount = useRef(0);
  const [awayFromBottom, setAwayFromBottom] = useState(false);
  const [newWhileAway, setNewWhileAway] = useState(false);

  useLayoutEffect(() => {
    const node = viewport.current;
    if (!node) return;
    if (previousHeight.current && items.length > previousCount.current) {
      node.scrollTop += node.scrollHeight - previousHeight.current;
      previousHeight.current = 0;
    } else if (!awayFromBottom) {
      node.scrollTop = node.scrollHeight;
    } else if (items.length > previousCount.current) {
      setNewWhileAway(true);
    }
    previousCount.current = items.length;
  }, [awayFromBottom, items.length]);

  useEffect(() => {
    const node = viewport.current;
    if (node && items.length) node.scrollTop = node.scrollHeight;
  }, []);

  let lastDay = '';
  return (
    <div className="relative min-h-0 flex-1">
      <div
        aria-label="Conversation messages"
        className="h-full overflow-y-auto overscroll-contain px-4 py-4"
        onScroll={(event) => {
          const node = event.currentTarget;
          const away = node.scrollHeight - node.scrollTop - node.clientHeight > 96;
          setAwayFromBottom(away);
          if (!away) setNewWhileAway(false);
        }}
        ref={viewport}
        role="log"
      >
        {hasMore ? (
          <div className="mb-4 flex justify-center">
            <Button
              loading={loadingOlder}
              onClick={() => {
                if (viewport.current) previousHeight.current = viewport.current.scrollHeight;
                onLoadOlder();
              }}
              size="sm"
              variant="ghost"
            >
              Load older messages
            </Button>
          </div>
        ) : null}
        <div className="space-y-4">
          {items.map((item) => {
            const createdAt = item.pending?.createdAt ?? item.canonical?.createdAt ?? '';
            const currentDay = day(createdAt);
            const separator = currentDay !== lastDay;
            lastDay = currentDay;
            return (
              <div key={item.key}>
                {separator ? (
                  <div className="mb-4 text-center text-label-sm font-medium text-on-surface-variant">
                    {currentDay}
                  </div>
                ) : null}
                <MessageBubble item={item} onRemove={onRemove} onRetry={onRetry} />
              </div>
            );
          })}
        </div>
      </div>
      {newWhileAway ? (
        <button
          className="absolute bottom-3 left-1/2 min-h-10 -translate-x-1/2 rounded-full bg-inverse-surface px-4 text-label-md font-semibold text-inverse-on-surface shadow-floating"
          onClick={() => {
            if (viewport.current) viewport.current.scrollTop = viewport.current.scrollHeight;
            setNewWhileAway(false);
          }}
          type="button"
        >
          New messages
        </button>
      ) : null}
    </div>
  );
}
