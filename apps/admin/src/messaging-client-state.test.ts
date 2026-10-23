import { describe, expect, it } from 'vitest';

import {
  isConversationOperationCurrent,
  isSendKeyboardShortcut,
  latestReadSequence,
} from '../components/messaging/client-state';

describe('messaging client state guards', () => {
  it('rejects a late result after the selected conversation changes', () => {
    expect(
      isConversationOperationCurrent(
        { conversationId: 'conversation-a', generation: 4 },
        'conversation-b',
        5,
      ),
    ).toBe(false);
  });

  it('rejects an old generation even when the conversation id matches again', () => {
    expect(
      isConversationOperationCurrent(
        { conversationId: 'conversation-a', generation: 4 },
        'conversation-a',
        6,
      ),
    ).toBe(false);
  });

  it('only treats an unmodified, non-composing Enter press as send', () => {
    expect(isSendKeyboardShortcut({ key: 'Enter', shiftKey: false, isComposing: false })).toBe(true);
    expect(isSendKeyboardShortcut({ key: 'Enter', shiftKey: true, isComposing: false })).toBe(false);
    expect(isSendKeyboardShortcut({ key: 'Enter', shiftKey: false, isComposing: true })).toBe(false);
  });

  it('advances a read sequence only after a successful response', () => {
    expect(latestReadSequence(null, '12')).toBe('12');
    expect(latestReadSequence('12', '9')).toBe('12');
    expect(latestReadSequence('12', '18')).toBe('18');
  });
});
