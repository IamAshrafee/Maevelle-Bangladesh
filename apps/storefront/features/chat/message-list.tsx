'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { cx } from '@/components/ui/classnames';

import { ImageLightbox } from './image-lightbox';
import { PrivateChatImage } from './private-image';
import type { ChatMessageItem, PendingMessage } from './types';

const URL_REGEX = /(https?:\/\/[^\s<]+[^<.,:;"')\]\s])/g;
const BANGLA_REGEX = /[\u0980-\u09FF]/;

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

function renderFormattedMessage(text: string) {
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

function MessageBubble({
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
      <div className="flex items-center gap-2 px-1 text-label-sm text-on-surface-variant tabular-nums">
        <time dateTime={createdAt}>{time(createdAt)}</time>
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
  const [lightbox, setLightbox] = useState<{
    isOpen: boolean;
    imageSrc: string;
    altText: string;
    fileName?: string | null;
    downloadPath?: string | null;
  } | null>(null);

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
        <div>
          {items.map((item, index) => {
            const createdAt = item.pending?.createdAt ?? item.canonical?.createdAt ?? '';
            const currentDay = day(createdAt);
            const separator = currentDay !== lastDay;
            lastDay = currentDay;

            // Grouping logic: check previous item
            const prevItem = index > 0 ? items[index - 1] : null;
            const prevCreatedAt =
              prevItem?.pending?.createdAt ?? prevItem?.canonical?.createdAt ?? '';
            const isCustomer = item.pending !== null || item.canonical?.direction === 'INBOUND';
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

            return (
              <div key={item.key}>
                {separator ? (
                  <div className="my-4 flex items-center justify-center">
                    <span className="rounded-full bg-surface-container px-3 py-1 text-label-sm font-medium text-on-surface-variant">
                      {currentDay}
                    </span>
                  </div>
                ) : null}
                <MessageBubble
                  isGrouped={isGrouped}
                  item={item}
                  onOpenImage={(props) => setLightbox({ isOpen: true, ...props })}
                  onRemove={onRemove}
                  onRetry={onRetry}
                />
              </div>
            );
          })}
        </div>
      </div>

      {newWhileAway ? (
        <button
          aria-label="Scroll to new messages"
          className="absolute bottom-3 left-1/2 flex min-h-11 -translate-x-1/2 items-center gap-1.5 rounded-full bg-inverse-surface px-4 text-label-md font-semibold text-inverse-on-surface shadow-floating transition-transform duration-150 hover:scale-105 active:scale-98"
          onClick={() => {
            if (viewport.current) viewport.current.scrollTop = viewport.current.scrollHeight;
            setNewWhileAway(false);
          }}
          type="button"
        >
          <span>New messages</span>
          <span aria-hidden="true">↓</span>
        </button>
      ) : null}

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
