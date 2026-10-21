import type { MessageView } from '@maevelle/contracts';

import type { ChatMessageItem, PendingMessage } from './types';

function sequence(message: MessageView): bigint {
  return BigInt(message.sequence);
}

export function mergeCanonicalMessages(
  previous: readonly MessageView[],
  incoming: readonly MessageView[],
): readonly MessageView[] {
  const byId = new Map(previous.map((message) => [message.id, message]));
  for (const message of incoming) byId.set(message.id, message);
  return [...byId.values()].sort((left, right) =>
    sequence(left) < sequence(right) ? -1 : sequence(left) > sequence(right) ? 1 : 0,
  );
}

export function reconcilePending(
  pending: readonly PendingMessage[],
  canonical: readonly MessageView[],
): readonly PendingMessage[] {
  const accepted = new Set(
    canonical.flatMap((message) => (message.clientMessageId ? [message.clientMessageId] : [])),
  );
  return pending.filter((message) => !accepted.has(message.clientMessageId));
}

export function messageItems(
  canonical: readonly MessageView[],
  pending: readonly PendingMessage[],
): readonly ChatMessageItem[] {
  return [
    ...canonical.map((message) => ({ key: message.id, canonical: message, pending: null })),
    ...reconcilePending(pending, canonical).map((message) => ({
      key: message.clientMessageId,
      canonical: null,
      pending: message,
    })),
  ];
}

export function latestStaffSequence(messages: readonly MessageView[]): string | null {
  return messages.filter((message) => message.direction === 'OUTBOUND').at(-1)?.sequence ?? null;
}
