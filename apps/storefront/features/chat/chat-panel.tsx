'use client';

import { useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { cx } from '@/components/ui/classnames';
import { CloseIcon, RefreshCwIcon, SupportAgentIcon } from '@/components/ui/icons';
import { Spinner } from '@/components/ui/spinner';

import { Composer } from './composer';
import { ContactForm } from './contact-form';
import { MessageList } from './message-list';
import type { ChatPageContext } from './types';
import { useChat } from './use-chat';

export function ChatPanel({
  context,
  onClose,
  onUnreadChange,
  open,
}: {
  readonly context: ChatPageContext;
  readonly onClose: () => void;
  readonly onUnreadChange: (count: number) => void;
  readonly open: boolean;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const chat = useChat({ active: true, context, onUnreadChange, open });
  const [viewportStyle, setViewportStyle] = useState<React.CSSProperties>({});

  // Mobile virtual keyboard & visual viewport positioning
  useEffect(() => {
    if (!open) return;

    const updateViewport = () => {
      if (
        typeof window !== 'undefined' &&
        window.visualViewport &&
        window.matchMedia('(max-width: 767px)').matches
      ) {
        const vv = window.visualViewport;
        setViewportStyle({
          height: `${vv.height}px`,
          top: `${vv.offsetTop}px`,
        });
      } else {
        setViewportStyle({});
      }
    };

    updateViewport();
    window.visualViewport?.addEventListener('resize', updateViewport);
    window.visualViewport?.addEventListener('scroll', updateViewport);
    return () => {
      window.visualViewport?.removeEventListener('resize', updateViewport);
      window.visualViewport?.removeEventListener('scroll', updateViewport);
    };
  }, [open]);

  // Focus trap, body lock, Escape key handling
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const siblings = [...document.body.children]
      .filter((element): element is HTMLElement => element instanceof HTMLElement)
      .filter((element) => !element.contains(panel.current));
    const previousInert = siblings.map((element) => element.inert);
    for (const element of siblings) element.inert = true;
    const mobile = window.matchMedia('(max-width: 767px)').matches;
    const previousOverflow = document.body.style.overflow;
    if (mobile) document.body.style.overflow = 'hidden';

    // Focus panel on open
    panel.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key !== 'Tab' || !panel.current) return;
      const focusable = [
        ...panel.current.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), a[href]',
        ),
      ];
      if (!focusable.length) return;
      const first = focusable[0]!;
      const last = focusable.at(-1)!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      }
      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      siblings.forEach((element, index) => {
        element.inert = previousInert[index] ?? false;
      });
      previous?.focus();
    };
  }, [onClose, open]);

  const availability = chat.config?.availability;
  const acceptsMessages = chat.config?.acceptsMessages === true;
  const status = chat.conversation?.status;
  const composerAvailable = acceptsMessages && status !== 'CLOSED' && chat.phase === 'ready';

  return (
    <div
      aria-hidden={!open}
      aria-label="Maevelle customer support chat"
      aria-modal={open ? 'true' : undefined}
      className={cx(
        'fixed inset-0 z-50 flex h-dvh flex-col overflow-hidden bg-surface-container-lowest shadow-modal md:inset-auto md:bottom-6 md:right-6 md:h-[min(44rem,calc(100dvh-3rem))] md:w-full md:max-w-md md:rounded-3xl md:border md:border-border-subtle',
        !open && 'hidden pointer-events-none',
      )}
      ref={panel}
      role="dialog"
      style={viewportStyle}
      tabIndex={-1}
    >
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border-subtle bg-primary px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top,0px))] text-on-primary md:rounded-t-3xl md:pt-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="relative grid size-11 shrink-0 place-items-center rounded-full bg-white/15">
            <SupportAgentIcon size={22} />
            {availability === 'AVAILABLE' ? (
              <span
                aria-label="Staff online"
                className="absolute bottom-0.5 right-0.5 size-3 rounded-full border-2 border-primary bg-success"
              />
            ) : null}
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-headline-sm font-semibold">Maevelle Support</h2>
            <p className="truncate text-label-sm text-white/80">
              {availability === 'OFFLINE'
                ? 'Leave us a message'
                : availability === 'DISABLED'
                  ? 'Currently unavailable'
                  : 'Here to help with your order'}
            </p>
          </div>
        </div>
        <button
          aria-label="Close chat"
          className="grid size-12 shrink-0 place-items-center rounded-xl text-on-primary transition-colors duration-150 hover:bg-white/15 active:scale-98"
          onClick={onClose}
          type="button"
        >
          <CloseIcon size={22} />
        </button>
      </header>

      {/* Product context pill if active and on a product page */}
      {context.productTitle && chat.items.length > 0 ? (
        <div className="flex items-center justify-between gap-2 border-b border-border-subtle bg-surface-container-low px-4 py-2 text-label-sm text-on-surface-variant">
          <span className="truncate">
            Product: <strong className="font-semibold text-on-surface">{context.productTitle}</strong>
          </span>
        </div>
      ) : null}

      {/* Offline or Reconnecting banner */}
      {chat.connection === 'offline' || chat.connection === 'reconnecting' ? (
        <div
          className="flex items-center justify-between gap-3 bg-warning-subtle px-4 py-2 text-body-sm text-warning-foreground"
          role="status"
        >
          <span>
            {chat.connection === 'offline'
              ? 'You are offline. Messages remain visible.'
              : 'Reconnecting to live updates…'}
          </span>
          <button
            className="flex min-h-9 shrink-0 items-center font-semibold underline active:opacity-75"
            onClick={() => void chat.refresh()}
            type="button"
          >
            Retry
          </button>
        </div>
      ) : null}

      {/* Loading state */}
      {chat.phase === 'initializing' || chat.phase === 'idle' ? (
        <div className="grid min-h-0 flex-1 place-items-center p-6 text-center">
          <div>
            <Spinner label="Opening chat" />
            <p className="mt-3 text-body-sm text-on-surface-variant">
              Opening your secure conversation…
            </p>
          </div>
        </div>
      ) : null}

      {/* Error or Expired state */}
      {['error', 'expired', 'unavailable'].includes(chat.phase) ? (
        <div className="grid min-h-0 flex-1 place-items-center p-6 text-center">
          <div className="max-w-xs">
            <span className="mx-auto grid size-14 place-items-center rounded-full bg-primary-subtle text-primary">
              <SupportAgentIcon size={26} />
            </span>
            <h3 className="mt-4 text-headline-md font-semibold text-on-surface">
              {chat.phase === 'expired'
                ? 'Session expired'
                : chat.phase === 'unavailable'
                  ? 'Chat is unavailable'
                  : 'We could not open chat'}
            </h3>
            <p className="mt-2 text-body-md text-on-surface-variant">
              {chat.phase === 'expired'
                ? 'Your guest session expired. Start a fresh chat to continue.'
                : (chat.error ?? 'Please try again shortly.')}
            </p>
            {chat.phase !== 'unavailable' ? (
              <Button className="mt-5" onClick={() => void chat.initialize()}>
                <RefreshCwIcon />
                {chat.phase === 'expired' ? 'Start new chat' : 'Try again'}
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Ready state: Messages + Composer */}
      {chat.phase === 'ready' ? (
        <>
          <div className="flex min-h-0 flex-1 flex-col bg-background">
            {chat.items.length === 0 ? (
              <div className="overflow-y-auto px-5 py-6">
                <div className="rounded-3xl border border-border-subtle bg-surface-container-lowest p-5 shadow-raised">
                  <p className="text-label-sm font-semibold uppercase tracking-wider text-primary">
                    Customer care
                  </p>
                  <h3 className="mt-2 font-serif text-headline-lg text-on-surface">
                    {chat.config?.greeting ?? 'How can we help?'}
                  </h3>
                  <p className="mt-2 text-body-md text-on-surface-variant">
                    {availability === 'OFFLINE'
                      ? chat.config?.offlineMessage
                      : 'Ask us about a product, sizing, delivery, or an existing order.'}
                  </p>
                  {context.productTitle ? (
                    <div className="mt-4 rounded-xl bg-primary-subtle px-3 py-2 text-body-sm text-on-primary-fixed-variant">
                      Asking about <strong>{context.productTitle}</strong>
                    </div>
                  ) : null}
                </div>
                <div className="mt-4">
                  <ContactForm onSave={chat.saveContact} saved={chat.contactSaved} />
                </div>
              </div>
            ) : (
              <MessageList
                conversationId={chat.conversation?.id}
                hasMore={chat.hasMore}
                items={chat.items}
                lastReadSequence={chat.conversation?.lastReadSequence}
                loadingOlder={chat.loadingOlder}
                onLoadOlder={() => void chat.loadOlder()}
                onMarkAsRead={chat.markAsRead}
                onRemove={chat.removePending}
                onRetry={(message) => void chat.retry(message)}
                open={open}
              />
            )}
          </div>

          {chat.error ? (
            <div
              className="border-t border-danger/20 bg-danger-subtle px-4 py-2 text-body-sm text-danger-foreground"
              role="alert"
            >
              {chat.error}
            </div>
          ) : null}

          {status === 'RESOLVED' ? (
            <div className="border-t border-border-subtle bg-surface-container-lowest p-4 text-center">
              <p className="mb-3 text-body-sm text-on-surface-variant">
                This conversation was resolved.
              </p>
              <Button onClick={() => void chat.reopen()} size="sm">
                Reopen conversation
              </Button>
            </div>
          ) : status === 'CLOSED' ? (
            <div className="border-t border-border-subtle bg-surface-container-lowest p-4 text-center">
              <p className="mb-3 text-body-sm text-on-surface-variant">
                This conversation is closed and remains read-only.
              </p>
              <Button onClick={() => void chat.startNew()} size="sm">
                Start a new conversation
              </Button>
            </div>
          ) : (
            <Composer
              acceptsAttachments={chat.config?.capabilities.attachments === true}
              disabled={!composerAvailable}
              maximumBytes={chat.config?.attachmentPolicy.maximumBytes ?? 5 * 1_048_576}
              maximumCount={chat.config?.attachmentPolicy.maximumCount ?? 5}
              maximumTextLength={chat.config?.capabilities.maximumTextLength ?? 10_000}
              onSend={chat.send}
            />
          )}
        </>
      ) : null}

      <span aria-live="polite" className="sr-only">
        {chat.connection === 'connected'
          ? 'Live chat connected'
          : chat.connection === 'reconnecting'
            ? 'Live chat reconnecting'
            : ''}
      </span>
    </div>
  );
}
