'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import * as React from 'react';
import {
  createContext,
  startTransition,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import type {
  ConversationDetail,
  ConversationPriority,
  ConversationStatus,
  ConversationSummary,
  InboxCounts,
  MessageView,
  MessagingEvent,
} from '@maevelle/contracts/messaging';

import { useAdminContext } from '@/components/admin-capabilities';
import { toast } from '@/components/ui/toast';
import { ApiRequestError } from '@/lib/api';
import * as api from './api';
import type { InboxFilters, PendingMessage } from './types';
import { useMessagingRealtime } from './use-messaging-realtime';

const initialFilters: InboxFilters = { scope: 'mine', sort: 'newest' };

interface MessagingContextValue {
  readonly capabilities: readonly string[];
  readonly filters: InboxFilters;
  readonly setFilters: (filters: InboxFilters) => void;
  readonly counts: InboxCounts | null;
  readonly conversations: readonly ConversationSummary[];
  readonly inboxState: 'loading' | 'ready' | 'error';
  readonly inboxError: string;
  readonly hasMoreConversations: boolean;
  readonly selectedConversationId: string | null;
  readonly conversation: ConversationDetail | null;
  readonly messages: readonly MessageView[];
  readonly pendingMessages: readonly PendingMessage[];
  readonly conversationState: 'idle' | 'loading' | 'ready' | 'error';
  readonly conversationError: string;
  readonly hasOlderMessages: boolean;
  readonly realtimeState: 'connecting' | 'connected' | 'reconnecting' | 'offline';
  readonly selectConversation: (conversationId: string | null) => void;
  readonly loadMoreConversations: () => Promise<void>;
  readonly loadOlderMessages: () => Promise<void>;
  readonly refreshInbox: () => Promise<void>;
  readonly refreshConversation: () => Promise<void>;
  readonly send: (text: string, attachmentIds?: readonly string[]) => Promise<boolean>;
  readonly retryPending: (key: string) => Promise<boolean>;
  readonly removePending: (key: string) => void;
  readonly claim: () => Promise<void>;
  readonly assign: (membershipId: string | null, reason?: string) => Promise<void>;
  readonly setStatus: (status: ConversationStatus, reason?: string) => Promise<void>;
  readonly setPriority: (priority: ConversationPriority, isStarred?: boolean) => Promise<void>;
  readonly replaceConversation: (conversation: ConversationDetail) => void;
  readonly markAsRead: (sequence: string) => Promise<void>;
  readonly ensureMessageLoaded: (messageId: string) => Promise<boolean>;
}

const MessagingContext = createContext<MessagingContextValue | null>(null);

function mergeMessages(
  current: readonly MessageView[],
  incoming: readonly MessageView[],
): readonly MessageView[] {
  const byId = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) byId.set(message.id, message);
  return [...byId.values()].sort((left, right) => {
    const difference = BigInt(left.sequence) - BigInt(right.sequence);
    return difference < 0n ? -1 : difference > 0n ? 1 : 0;
  });
}

function friendlyError(error: unknown, fallback: string) {
  if (error instanceof ApiRequestError) {
    if (error.status === 401) return 'Your session expired. Sign in again to continue.';
    if (error.status === 403) return 'Your messaging permissions changed. Refresh your access.';
    if (['STALE_VERSION', 'ASSIGNMENT_CONFLICT'].includes(error.code))
      return 'Another agent changed this conversation. The latest state has been loaded.';
    if (error.status === 429) return 'Messaging is temporarily rate limited. Try again shortly.';
    return error.message;
  }
  return error instanceof Error ? error.message : fallback;
}

export function MessagingProvider({ children }: { children: ReactNode }) {
  const context = useAdminContext();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [filters, setFiltersState] = useState<InboxFilters>(initialFilters);
  const [counts, setCounts] = useState<InboxCounts | null>(null);
  const [conversations, setConversations] = useState<readonly ConversationSummary[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [inboxState, setInboxState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [inboxError, setInboxError] = useState('');
  const selectedConversationId = searchParams.get('conversation');
  const [conversation, setConversation] = useState<ConversationDetail | null>(null);
  const [messages, setMessages] = useState<readonly MessageView[]>([]);
  const [messageCursor, setMessageCursor] = useState<string | null>(null);
  const [pendingMessages, setPendingMessages] = useState<readonly PendingMessage[]>([]);
  const [conversationState, setConversationState] = useState<
    'idle' | 'loading' | 'ready' | 'error'
  >('idle');
  const [conversationError, setConversationError] = useState('');
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastMarkedSequenceRef = useRef<string | null>(null);

  const setFilters = useCallback((value: InboxFilters) => {
    setFiltersState(value);
    setNextCursor(null);
  }, []);

  const refreshInbox = useCallback(async () => {
    setInboxState('loading');
    try {
      const [page, nextCounts] = await Promise.all([
        api.listConversations(filters),
        api.getInboxCounts(),
      ]);
      setConversations(page.data);
      setNextCursor(page.pagination.nextCursor);
      setCounts(nextCounts);
      setInboxError('');
      setInboxState('ready');
    } catch (error) {
      setInboxError(friendlyError(error, 'The inbox could not be loaded.'));
      setInboxState('error');
    }
  }, [filters]);

  useEffect(() => {
    const controller = new AbortController();
    setInboxState('loading');
    void Promise.all([
      api.listConversations(filters, undefined, controller.signal),
      api.getInboxCounts(controller.signal),
    ])
      .then(([page, nextCounts]) => {
        setConversations(page.data);
        setNextCursor(page.pagination.nextCursor);
        setCounts(nextCounts);
        setInboxError('');
        setInboxState('ready');
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setInboxError(friendlyError(error, 'The inbox could not be loaded.'));
        setInboxState('error');
      });
    return () => controller.abort();
  }, [context.organizationId, filters]);

  const refreshConversation = useCallback(async () => {
    if (!selectedConversationId) return;
    try {
      const [detail, page] = await Promise.all([
        api.getConversation(selectedConversationId),
        api.listMessages(selectedConversationId),
      ]);
      setConversation(detail);
      setMessages((current) => mergeMessages(current, page.data));
      setMessageCursor(page.pagination.nextCursor);
      setPendingMessages((current) =>
        current.filter(
          (pending) =>
            !page.data.some((message) => message.clientMessageId === pending.clientMessageId),
        ),
      );
      setConversationError('');
      setConversationState('ready');
    } catch (error) {
      setConversationError(friendlyError(error, 'The conversation could not be loaded.'));
      setConversationState('error');
      if (error instanceof ApiRequestError && [403, 404].includes(error.status)) {
        setConversation(null);
        setMessages([]);
      }
    }
  }, [selectedConversationId]);

  useEffect(() => {
    setConversation(null);
    setMessages([]);
    setPendingMessages([]);
    setMessageCursor(null);
    lastMarkedSequenceRef.current = null;
    if (!selectedConversationId) {
      setConversationState('idle');
      return;
    }
    const controller = new AbortController();
    setConversationState('loading');
    void Promise.all([
      api.getConversation(selectedConversationId, controller.signal),
      api.listMessages(selectedConversationId, undefined, controller.signal),
    ])
      .then(([detail, page]) => {
        setConversation(detail);
        setMessages(page.data);
        setMessageCursor(page.pagination.nextCursor);
        setConversationError('');
        setConversationState('ready');
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setConversationError(friendlyError(error, 'The conversation could not be loaded.'));
        setConversationState('error');
      });
    return () => controller.abort();
  }, [context.organizationId, selectedConversationId]);

  useEffect(() => {
    setConversations([]);
    setConversation(null);
    setMessages([]);
    setPendingMessages([]);
  }, [context.organizationId]);

  const onRealtimeEvent = useCallback(
    (event: MessagingEvent) => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(() => {
        void refreshInbox();
        if (!event.conversationId || event.conversationId === selectedConversationId)
          void refreshConversation();
      }, 180);
    },
    [refreshConversation, refreshInbox, selectedConversationId],
  );
  const onReplayReset = useCallback(() => {
    void refreshInbox();
    void refreshConversation();
  }, [refreshConversation, refreshInbox]);
  const realtimeState = useMessagingRealtime(
    context.organizationId,
    onRealtimeEvent,
    onReplayReset,
  );

  useEffect(
    () => () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    },
    [],
  );

  const selectConversation = useCallback(
    (conversationId: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (conversationId) params.set('conversation', conversationId);
      else params.delete('conversation');
      startTransition(() => router.replace(`/messaging?${params.toString()}`, { scroll: false }));
    },
    [router, searchParams],
  );

  const loadMoreConversations = useCallback(async () => {
    if (!nextCursor) return;
    try {
      const page = await api.listConversations(filters, nextCursor);
      setConversations((current) => {
        const byId = new Map(current.map((item) => [item.id, item]));
        for (const item of page.data) byId.set(item.id, item);
        return [...byId.values()];
      });
      setNextCursor(page.pagination.nextCursor);
    } catch (error) {
      toast.add({
        title: 'Could not load more conversations',
        description: friendlyError(error, 'Try again.'),
        type: 'error',
      });
    }
  }, [filters, nextCursor]);

  const loadOlderMessages = useCallback(async () => {
    if (!selectedConversationId || !messageCursor) return;
    try {
      const page = await api.listMessages(selectedConversationId, messageCursor);
      setMessages((current) => mergeMessages(page.data, current));
      setMessageCursor(page.pagination.nextCursor);
    } catch (error) {
      toast.add({
        title: 'Could not load older messages',
        description: friendlyError(error, 'Try again.'),
        type: 'error',
      });
    }
  }, [messageCursor, selectedConversationId]);

  const markAsRead = useCallback(
    async (sequence: string) => {
      if (!selectedConversationId) return;
      if (
        lastMarkedSequenceRef.current &&
        BigInt(sequence) <= BigInt(lastMarkedSequenceRef.current)
      ) {
        return;
      }
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
        return;
      }
      lastMarkedSequenceRef.current = sequence;
      try {
        await api.markRead(selectedConversationId, sequence);
      } catch {
        // ignore transient mark-read network failure
      }
    },
    [selectedConversationId],
  );

  const ensureMessageLoaded = useCallback(
    async (targetMessageId: string): Promise<boolean> => {
      if (!selectedConversationId) return false;
      if (messages.some((m) => m.id === targetMessageId)) return true;
      let currentCursor = messageCursor;
      for (let i = 0; i < 3 && currentCursor; i++) {
        try {
          const page = await api.listMessages(selectedConversationId, currentCursor);
          setMessages((current) => mergeMessages(page.data, current));
          setMessageCursor(page.pagination.nextCursor);
          currentCursor = page.pagination.nextCursor;
          if (page.data.some((m) => m.id === targetMessageId)) {
            return true;
          }
        } catch {
          break;
        }
      }
      return false;
    },
    [messageCursor, messages, selectedConversationId],
  );

  const submitPending = useCallback(
    async (pending: PendingMessage) => {
      try {
        const canonical = await api.sendMessage(pending.conversationId, {
          clientMessageId: pending.clientMessageId,
          idempotencyKey: pending.idempotencyKey,
          ...(pending.text ? { text: pending.text } : {}),
          attachmentIds: pending.attachmentIds,
        });
        setMessages((current) => mergeMessages(current, [canonical]));
        setPendingMessages((current) => current.filter((item) => item.key !== pending.key));
        void refreshInbox();
        return true;
      } catch (error) {
        const definite =
          error instanceof ApiRequestError && error.status < 500 && error.status !== 429;
        setPendingMessages((current) =>
          current.map((item) =>
            item.key === pending.key
              ? {
                  ...item,
                  state: definite ? 'REJECTED' : 'UNCERTAIN',
                  error: friendlyError(error, 'The send result is uncertain.'),
                }
              : item,
          ),
        );
        return false;
      }
    },
    [refreshInbox],
  );

  const send = useCallback(
    async (text: string, attachmentIds: readonly string[] = []) => {
      if (!selectedConversationId || (!text.trim() && attachmentIds.length === 0)) return false;
      const pending: PendingMessage = {
        key: crypto.randomUUID(),
        conversationId: selectedConversationId,
        clientMessageId: crypto.randomUUID(),
        idempotencyKey: crypto.randomUUID(),
        text: text.trim(),
        attachmentIds,
        createdAt: new Date().toISOString(),
        state: 'SENDING',
      };
      setPendingMessages((current) => [...current, pending]);
      return submitPending(pending);
    },
    [selectedConversationId, submitPending],
  );

  const retryPending = useCallback(
    async (key: string) => {
      const pending = pendingMessages.find((item) => item.key === key);
      if (!pending) return false;
      const retry: PendingMessage = {
        key: pending.key,
        conversationId: pending.conversationId,
        clientMessageId: pending.clientMessageId,
        idempotencyKey: pending.idempotencyKey,
        text: pending.text,
        attachmentIds: pending.attachmentIds,
        createdAt: pending.createdAt,
        state: 'SENDING',
      };
      setPendingMessages((current) => current.map((item) => (item.key === key ? retry : item)));
      return submitPending(retry);
    },
    [pendingMessages, submitPending],
  );

  const canonicalMutation = useCallback(
    async (operation: () => Promise<ConversationDetail>, success: string) => {
      try {
        const updated = await operation();
        setConversation(updated);
        setConversations((current) =>
          current.map((item) => (item.id === updated.id ? updated : item)),
        );
        toast.add({ title: success, type: 'success' });
      } catch (error) {
        if (error instanceof ApiRequestError && [409, 403, 404].includes(error.status)) {
          await refreshConversation();
          await refreshInbox();
        }
        toast.add({
          title: 'Conversation was not updated',
          description: friendlyError(error, 'Try again.'),
          type: 'error',
        });
      }
    },
    [refreshConversation, refreshInbox],
  );

  const value = useMemo<MessagingContextValue>(
    () => ({
      capabilities: context.capabilities,
      filters,
      setFilters,
      counts,
      conversations,
      inboxState,
      inboxError,
      hasMoreConversations: Boolean(nextCursor),
      selectedConversationId,
      conversation,
      messages,
      pendingMessages,
      conversationState,
      conversationError,
      hasOlderMessages: Boolean(messageCursor),
      realtimeState,
      selectConversation,
      loadMoreConversations,
      loadOlderMessages,
      refreshInbox,
      refreshConversation,
      send,
      retryPending,
      removePending: (key) =>
        setPendingMessages((current) => current.filter((item) => item.key !== key)),
      claim: async () => {
        if (!selectedConversationId) return;
        await canonicalMutation(
          () => api.claimConversation(selectedConversationId),
          'Conversation claimed',
        );
      },
      assign: async (membershipId, reason) => {
        if (!conversation) return;
        await canonicalMutation(
          () => api.assignConversation(conversation.id, conversation.version, membershipId, reason),
          membershipId ? 'Conversation assigned' : 'Conversation released',
        );
      },
      setStatus: async (status, reason) => {
        if (!conversation) return;
        await canonicalMutation(
          () => api.updateConversationStatus(conversation.id, conversation.version, status, reason),
          `Conversation marked ${status.toLowerCase()}`,
        );
      },
      setPriority: async (priority, isStarred) => {
        if (!conversation) return;
        await canonicalMutation(
          () =>
            api.updateConversationPriority(
              conversation.id,
              conversation.version,
              priority,
              isStarred,
            ),
          'Conversation priority updated',
        );
      },
      replaceConversation: setConversation,
      markAsRead,
      ensureMessageLoaded,
    }),
    [
      context.capabilities,
      filters,
      setFilters,
      counts,
      conversations,
      inboxState,
      inboxError,
      nextCursor,
      selectedConversationId,
      conversation,
      messages,
      pendingMessages,
      conversationState,
      conversationError,
      messageCursor,
      realtimeState,
      selectConversation,
      loadMoreConversations,
      loadOlderMessages,
      refreshInbox,
      refreshConversation,
      send,
      retryPending,
      canonicalMutation,
      markAsRead,
      ensureMessageLoaded,
    ],
  );

  return <MessagingContext.Provider value={value}>{children}</MessagingContext.Provider>;
}

export function useMessaging() {
  const value = useContext(MessagingContext);
  if (!value) throw new Error('useMessaging must be used inside MessagingProvider.');
  return value;
}
