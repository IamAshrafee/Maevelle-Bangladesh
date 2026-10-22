'use client';

import { useEffect, useRef, useState } from 'react';

import type { MessagingEvent } from '@maevelle/contracts/messaging';

const eventTypes = [
  'messaging.conversation.assigned.v1',
  'messaging.conversation.created.v1',
  'messaging.conversation.priority_changed.v1',
  'messaging.conversation.status_changed.v1',
  'messaging.conversation.tags_changed.v1',
  'messaging.conversation.unassigned.v1',
  'messaging.follow_up.created.v1',
  'messaging.follow_up.due.v1',
  'messaging.follow_up.status_changed.v1',
  'messaging.follow_up.updated.v1',
  'messaging.inbox.invalidated.v1',
  'messaging.message.created.v1',
  'messaging.message.delivery_changed.v1',
  'messaging.note.created.v1',
  'messaging.note.deleted.v1',
  'messaging.note.updated.v1',
  'messaging.read_cursor.advanced.v1',
  'messaging.saved_reply.changed.v1',
  'messaging.channel.settings_changed.v1',
] as const;

type ConnectionState = 'connecting' | 'connected' | 'reconnecting' | 'offline';

export function useMessagingRealtime(
  organizationId: string,
  onEvent: (event: MessagingEvent) => void,
  onReplayReset: () => void,
) {
  const [state, setState] = useState<ConnectionState>('connecting');
  const callbackRef = useRef(onEvent);
  const replayResetRef = useRef(onReplayReset);
  callbackRef.current = onEvent;
  replayResetRef.current = onReplayReset;

  useEffect(() => {
    if (!organizationId) return;
    const tabId = crypto.randomUUID();
    const cursorKey = `maevelle:messaging:cursor:${organizationId}`;
    const leaseKey = `maevelle:messaging:leader:${organizationId}`;
    const channel = new BroadcastChannel(`maevelle:messaging:${organizationId}`);
    let source: EventSource | undefined;
    let leaseTimer: ReturnType<typeof setInterval> | undefined;
    let consecutiveErrors = 0;

    const dispatch = (event: MessagingEvent, broadcast: boolean) => {
      localStorage.setItem(cursorKey, event.cursor);
      callbackRef.current(event);
      if (broadcast) channel.postMessage({ type: 'event', event });
    };

    const closeSource = () => {
      source?.close();
      source = undefined;
      if (leaseTimer) clearInterval(leaseTimer);
      leaseTimer = undefined;
    };

    const writeLease = () => {
      localStorage.setItem(leaseKey, JSON.stringify({ tabId, expiresAt: Date.now() + 18_000 }));
    };

    const openSource = () => {
      if (source || document.visibilityState === 'hidden') return;
      writeLease();
      leaseTimer = setInterval(writeLease, 6_000);
      const cursor = localStorage.getItem(cursorKey);
      source = new EventSource(
        `/api/admin/messaging/events${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`,
        { withCredentials: true },
      );
      setState('connecting');
      source.onopen = () => {
        consecutiveErrors = 0;
        setState('connected');
        channel.postMessage({ type: 'state', state: 'connected' });
      };
      source.onerror = () => {
        consecutiveErrors += 1;
        setState(navigator.onLine ? 'reconnecting' : 'offline');
        channel.postMessage({
          type: 'state',
          state: navigator.onLine ? 'reconnecting' : 'offline',
        });
        if (consecutiveErrors >= 3 && localStorage.getItem(cursorKey)) {
          localStorage.removeItem(cursorKey);
          closeSource();
          replayResetRef.current();
          window.setTimeout(openSource, 500);
        }
      };
      for (const type of eventTypes) {
        source.addEventListener(type, (raw) => {
          try {
            dispatch(JSON.parse((raw as MessageEvent<string>).data) as MessagingEvent, true);
          } catch {
            // A malformed event is ignored; the next canonical refresh remains authoritative.
          }
        });
      }
    };

    const elect = () => {
      let current: { tabId: string; expiresAt: number } | undefined;
      try {
        current = JSON.parse(localStorage.getItem(leaseKey) ?? '') as typeof current;
      } catch {
        current = undefined;
      }
      if (!current || current.expiresAt < Date.now() || current.tabId === tabId) openSource();
      else {
        closeSource();
        setState(navigator.onLine ? 'connected' : 'offline');
      }
    };

    channel.onmessage = (message: MessageEvent) => {
      const value = message.data as
        { type: 'event'; event: MessagingEvent } | { type: 'state'; state: ConnectionState };
      if (value.type === 'event') dispatch(value.event, false);
      if (value.type === 'state' && !source) setState(value.state);
    };
    const online = () => {
      setState('reconnecting');
      elect();
    };
    const offline = () => setState('offline');
    const visibility = () => {
      if (document.visibilityState === 'hidden') closeSource();
      else elect();
    };
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    document.addEventListener('visibilitychange', visibility);
    elect();
    const electionTimer = setInterval(elect, 7_000);

    return () => {
      closeSource();
      clearInterval(electionTimer);
      try {
        const current = JSON.parse(localStorage.getItem(leaseKey) ?? '') as { tabId?: string };
        if (current.tabId === tabId) localStorage.removeItem(leaseKey);
      } catch {
        localStorage.removeItem(leaseKey);
      }
      channel.close();
      window.removeEventListener('online', online);
      window.removeEventListener('offline', offline);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [organizationId]);

  return state;
}
