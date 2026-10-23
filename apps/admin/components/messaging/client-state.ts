export interface ConversationOperationToken {
  readonly conversationId: string;
  readonly generation: number;
}

export function isConversationOperationCurrent(
  operation: ConversationOperationToken,
  selectedConversationId: string | null,
  generation: number,
): boolean {
  return (
    operation.conversationId === selectedConversationId && operation.generation === generation
  );
}

export function isSendKeyboardShortcut(input: {
  readonly key: string;
  readonly shiftKey: boolean;
  readonly isComposing: boolean;
}): boolean {
  return input.key === 'Enter' && !input.shiftKey && !input.isComposing;
}

export function latestReadSequence(current: string | null, candidate: string): string {
  if (!current) return candidate;
  try {
    return BigInt(candidate) > BigInt(current) ? candidate : current;
  } catch {
    return current;
  }
}
