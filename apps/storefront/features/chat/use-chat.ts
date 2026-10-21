'use client';

import type {
  MessageView,
  StorefrontChatBootstrap,
  StorefrontChatConfig,
  StorefrontConversationView,
} from '@maevelle/contracts';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { ChatApiError, chatApi, streamChatEvents, uploadChatImage } from './api';
import {
  latestStaffSequence,
  mergeCanonicalMessages,
  messageItems,
  reconcilePending,
} from './model';
import type { AttachmentDraft, ChatPageContext, ContactDetails, PendingMessage } from './types';

type Phase = 'idle' | 'initializing' | 'ready' | 'expired' | 'unavailable' | 'error';
type Connection = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'offline' | 'standby';

const CURSOR_KEY = 'maevelle_chat_event_cursor_v1';
const CHANNEL_NAME = 'maevelle_storefront_chat_v1';

function friendlyError(error: unknown): string {
  if (!navigator.onLine) return 'You are offline. Check your connection and try again.';
  if (error instanceof ChatApiError) {
    if (error.code === 'RATE_LIMITED')
      return 'Chat is busy right now. Please wait a moment and try again.';
    if (error.code === 'CONVERSATION_CLOSED')
      return 'This conversation is closed. Start a new chat to continue.';
    if (error.code === 'VALIDATION_FAILED') return error.message;
    if (error.status >= 500) return 'Chat is temporarily unavailable. Please try again shortly.';
  }
  return 'Something went wrong. Please try again.';
}

export function useChat(input: {
  readonly active: boolean;
  readonly open: boolean;
  readonly context: ChatPageContext;
  readonly onUnreadChange: (count: number) => void;
}) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [connection, setConnection] = useState<Connection>('idle');
  const [bootstrap, setBootstrap] = useState<StorefrontChatBootstrap | null>(null);
  const [config, setConfig] = useState<StorefrontChatConfig | null>(null);
  const [conversation, setConversation] = useState<StorefrontConversationView | null>(null);
  const [messages, setMessages] = useState<readonly MessageView[]>([]);
  const [pending, setPending] = useState<readonly PendingMessage[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [contactSaved, setContactSaved] = useState(false);
  const currentContext = useRef(input.context);
  const refreshTimer = useRef<number | null>(null);
  const readSequence = useRef('0');
  const lastContextSignature = useRef('');
  const activeUploads = useRef(new Set<AbortController>());
  const initializeRunning = useRef(false);
  const mounted = useRef(true);

  currentContext.current = input.context;

  const loadLatest = useCallback(async (target: StorefrontConversationView) => {
    const page = await chatApi.messages(target.id);
    if (!mounted.current) return;
    setMessages((existing) => mergeCanonicalMessages(existing, page.data));
    setPending((existing) => reconcilePending(existing, page.data));
    setNextCursor(page.pagination.nextCursor);
    setHasMore(page.pagination.hasMore);
  }, []);

  const initialize = useCallback(async () => {
    if (initializeRunning.current) return;
    initializeRunning.current = true;
    setPhase('initializing');
    setError(null);
    try {
      const next = await chatApi.bootstrap(currentContext.current);
      if (!mounted.current) return;
      setBootstrap(next);
      setConfig(next.config);
      setConversation(next.conversation);
      readSequence.current = next.conversation.lastReadSequence;
      lastContextSignature.current = JSON.stringify(currentContext.current);
      setMessages([]);
      setPending([]);
      await loadLatest(next.conversation);
      if (!mounted.current) return;
      setPhase(next.config.enabled ? 'ready' : 'unavailable');
    } catch (cause) {
      if (!mounted.current) return;
      if (
        cause instanceof ChatApiError &&
        ['SESSION_EXPIRED', 'UNAUTHENTICATED'].includes(cause.code)
      ) {
        setPhase('expired');
      } else if (cause instanceof ChatApiError && cause.status === 503) {
        setPhase('unavailable');
      } else {
        setPhase('error');
      }
      setError(friendlyError(cause));
    } finally {
      initializeRunning.current = false;
    }
  }, [loadLatest]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      for (const controller of activeUploads.current) controller.abort();
      activeUploads.current.clear();
      if (refreshTimer.current !== null) window.clearTimeout(refreshTimer.current);
    };
  }, []);

  useEffect(() => {
    if (input.open) return;
    for (const controller of activeUploads.current) controller.abort();
    activeUploads.current.clear();
  }, [input.open]);

  useEffect(() => {
    if (input.active && phase === 'idle') void initialize();
  }, [initialize, input.active, phase]);

  const refresh = useCallback(async () => {
    if (!conversation) return;
    try {
      const [nextConversation] = await Promise.all([
        chatApi.currentConversation(),
        loadLatest(conversation),
      ]);
      if (!mounted.current) return;
      setConversation(nextConversation);
      setError(null);
    } catch (cause) {
      if (
        cause instanceof ChatApiError &&
        ['SESSION_EXPIRED', 'UNAUTHENTICATED'].includes(cause.code)
      ) {
        setPhase('expired');
        setMessages([]);
        setPending([]);
      } else {
        setError(friendlyError(cause));
      }
    }
  }, [conversation, loadLatest]);

  const scheduleRefresh = useCallback(() => {
    if (refreshTimer.current !== null) window.clearTimeout(refreshTimer.current);
    refreshTimer.current = window.setTimeout(() => void refresh(), 120);
  }, [refresh]);

  useEffect(() => {
    if (phase !== 'ready' || !conversation) return;
    const controller = new AbortController();
    const channel =
      typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(CHANNEL_NAME);
    channel?.addEventListener('message', scheduleRefresh);

    const connect = async () => {
      let attempt = 0;
      while (!controller.signal.aborted) {
        if (!navigator.onLine) {
          setConnection('offline');
          await new Promise<void>((resolve) => {
            const resume = () => resolve();
            window.addEventListener('online', resume, {
              once: true,
              signal: controller.signal,
            });
            controller.signal.addEventListener('abort', resume, { once: true });
          });
          continue;
        }
        setConnection(attempt === 0 ? 'connecting' : 'reconnecting');
        try {
          await streamChatEvents({
            cursor: window.localStorage.getItem(CURSOR_KEY),
            signal: controller.signal,
            onEvent: (event) => {
              window.localStorage.setItem(CURSOR_KEY, event.cursor);
              channel?.postMessage({ type: 'invalidate', cursor: event.cursor });
              scheduleRefresh();
              setConnection('connected');
            },
          });
          attempt = 0;
        } catch (cause) {
          if (controller.signal.aborted) return;
          if (cause instanceof ChatApiError && cause.code === 'EVENT_CURSOR_EXPIRED') {
            window.localStorage.removeItem(CURSOR_KEY);
            scheduleRefresh();
          }
          if (cause instanceof ChatApiError && cause.status === 401) {
            setPhase('expired');
            return;
          }
          attempt++;
          setConnection(
            cause instanceof ChatApiError && cause.status === 429 ? 'standby' : 'reconnecting',
          );
          await new Promise((resolve) =>
            window.setTimeout(resolve, Math.min(1000 * 2 ** attempt, 15_000)),
          );
        }
      }
    };

    const locks = navigator.locks;
    if (locks) {
      const coordinate = async () => {
        while (!controller.signal.aborted) {
          let acquired = false;
          await locks.request(
            'maevelle-chat-events',
            { ifAvailable: true, signal: controller.signal },
            async (lock) => {
              if (!lock) {
                setConnection('standby');
                return;
              }
              acquired = true;
              await connect();
            },
          );
          if (acquired || controller.signal.aborted) return;
          await new Promise((resolve) => window.setTimeout(resolve, 5000));
        }
      };
      void coordinate().catch(() => undefined);
    }

    let fallbackStarted = false;
    const startFallback = () => {
      if (locks || fallbackStarted || document.visibilityState !== 'visible') return;
      fallbackStarted = true;
      void connect();
    };
    if (!locks && document.visibilityState === 'visible') startFallback();
    else if (!locks) setConnection('standby');

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        startFallback();
        scheduleRefresh();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', scheduleRefresh);
    return () => {
      controller.abort();
      channel?.removeEventListener('message', scheduleRefresh);
      channel?.close();
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', scheduleRefresh);
    };
  }, [conversation?.id, phase, scheduleRefresh]);

  const unreadCount = useMemo(() => {
    if (input.open || !conversation) return 0;
    const read = BigInt(conversation.lastReadSequence);
    return messages.filter(
      (message) => message.direction === 'OUTBOUND' && BigInt(message.sequence) > read,
    ).length;
  }, [conversation, input.open, messages]);

  useEffect(() => input.onUnreadChange(unreadCount), [input.onUnreadChange, unreadCount]);

  useEffect(() => {
    if (!input.open || document.visibilityState !== 'visible' || !conversation) return;
    const latest = latestStaffSequence(messages);
    if (!latest || BigInt(latest) <= BigInt(readSequence.current)) return;
    const timer = window.setTimeout(() => {
      void chatApi
        .read(conversation.id, latest)
        .then(({ lastReadSequence }) => {
          readSequence.current = lastReadSequence;
          setConversation((current) => current && { ...current, lastReadSequence });
        })
        .catch(() => undefined);
    }, 800);
    return () => window.clearTimeout(timer);
  }, [conversation, input.open, messages]);

  const loadOlder = useCallback(async () => {
    if (!conversation || !nextCursor || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const page = await chatApi.messages(conversation.id, nextCursor);
      setMessages((existing) => mergeCanonicalMessages(page.data, existing));
      setNextCursor(page.pagination.nextCursor);
      setHasMore(page.pagination.hasMore);
    } catch (cause) {
      setError(friendlyError(cause));
    } finally {
      setLoadingOlder(false);
    }
  }, [conversation, loadingOlder, nextCursor]);

  const send = useCallback(
    async (
      text: string,
      attachments: readonly AttachmentDraft[],
      updateAttachment: (localId: string, update: Partial<AttachmentDraft>) => void,
    ) => {
      if (!conversation) return false;
      const attachmentIds: string[] = [];
      const controller = new AbortController();
      activeUploads.current.add(controller);
      try {
        for (const attachment of attachments) {
          const uploaded = await uploadChatImage(
            conversation.id,
            attachment.file,
            controller.signal,
            (status) => updateAttachment(attachment.localId, { status }),
          );
          attachmentIds.push(uploaded.id);
          updateAttachment(attachment.localId, { status: 'ready', uploadId: uploaded.id });
        }
      } catch (cause) {
        for (const attachment of attachments)
          updateAttachment(attachment.localId, { status: 'failed', error: friendlyError(cause) });
        setError(friendlyError(cause));
        return false;
      } finally {
        activeUploads.current.delete(controller);
      }

      const clientMessageId = crypto.randomUUID();
      const idempotencyKey = crypto.randomUUID();
      const optimistic: PendingMessage = {
        clientMessageId,
        idempotencyKey,
        text: text.trim() || null,
        previewUrls: attachments.map((attachment) => attachment.previewUrl),
        attachmentIds,
        createdAt: new Date().toISOString(),
        state: 'sending',
        error: null,
      };
      setPending((current) => [...current, optimistic]);
      const contextSignature = JSON.stringify(currentContext.current);
      const changedContext = contextSignature !== lastContextSignature.current;
      const submit = async () => {
        try {
          const accepted = await chatApi.send(conversation.id, {
            clientMessageId,
            idempotencyKey,
            ...(optimistic.text ? { text: optimistic.text } : {}),
            ...(attachmentIds.length ? { attachmentIds } : {}),
            ...(changedContext ? { context: currentContext.current } : {}),
          });
          if (changedContext) lastContextSignature.current = contextSignature;
          setMessages((current) => mergeCanonicalMessages(current, [accepted]));
          setPending((current) =>
            current.filter((message) => message.clientMessageId !== clientMessageId),
          );
          setError(null);
          return true;
        } catch (cause) {
          const uncertain = !(cause instanceof ChatApiError) || cause.status >= 500;
          setPending((current) =>
            current.map((message) =>
              message.clientMessageId === clientMessageId
                ? {
                    ...message,
                    state: uncertain ? 'uncertain' : 'rejected',
                    error: friendlyError(cause),
                  }
                : message,
            ),
          );
          return false;
        }
      };
      return submit();
    },
    [conversation],
  );

  const retry = useCallback(
    async (message: PendingMessage) => {
      if (!conversation) return;
      setPending((current) =>
        current.map((item) =>
          item.clientMessageId === message.clientMessageId
            ? { ...item, state: 'sending', error: null }
            : item,
        ),
      );
      try {
        const contextSignature = JSON.stringify(currentContext.current);
        const changedContext = contextSignature !== lastContextSignature.current;
        const accepted = await chatApi.send(conversation.id, {
          clientMessageId: message.clientMessageId,
          idempotencyKey: message.idempotencyKey,
          ...(message.text ? { text: message.text } : {}),
          ...(message.attachmentIds.length ? { attachmentIds: message.attachmentIds } : {}),
          ...(changedContext ? { context: currentContext.current } : {}),
        });
        if (changedContext) lastContextSignature.current = contextSignature;
        setMessages((current) => mergeCanonicalMessages(current, [accepted]));
        setPending((current) =>
          current.filter((item) => item.clientMessageId !== message.clientMessageId),
        );
      } catch (cause) {
        setPending((current) =>
          current.map((item) =>
            item.clientMessageId === message.clientMessageId
              ? { ...item, state: 'uncertain', error: friendlyError(cause) }
              : item,
          ),
        );
      }
    },
    [conversation],
  );

  const removePending = useCallback((clientMessageId: string) => {
    setPending((current) =>
      current.filter((message) => message.clientMessageId !== clientMessageId),
    );
  }, []);

  const reopen = useCallback(async () => {
    if (!conversation) return;
    setConversation(await chatApi.reopen(conversation.id));
  }, [conversation]);

  const startNew = useCallback(async () => {
    const next = await chatApi.startConversation(currentContext.current);
    setConversation(next);
    setMessages([]);
    setPending([]);
    await loadLatest(next);
  }, [loadLatest]);

  const saveContact = useCallback(async (details: ContactDetails) => {
    await chatApi.updateContact(details);
    setContactSaved(true);
  }, []);

  return {
    phase,
    connection,
    bootstrap,
    config,
    conversation,
    items: messageItems(messages, pending),
    hasMore,
    loadingOlder,
    error,
    contactSaved,
    initialize,
    refresh,
    loadOlder,
    send,
    retry,
    removePending,
    reopen,
    startNew,
    saveContact,
  };
}
