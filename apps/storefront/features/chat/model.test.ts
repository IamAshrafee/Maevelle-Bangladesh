import type { MessageView } from '@maevelle/contracts';
import { describe, expect, it } from 'vitest';

import { latestStaffSequence, mergeCanonicalMessages, reconcilePending } from './model';
import type { PendingMessage } from './types';

function message(input: Partial<MessageView> & Pick<MessageView, 'id' | 'sequence'>): MessageView {
  return {
    conversationId: 'conversation',
    direction: 'INBOUND',
    sender: { type: 'CONTACT', id: null, name: null },
    type: 'TEXT',
    clientMessageId: null,
    text: 'Hello',
    attachments: [],
    delivery: { state: 'RECEIVED', canRetry: false },
    createdAt: '2026-10-21T00:00:00.000Z',
    editedAt: null,
    retractedAt: null,
    ...input,
    id: input.id,
    sequence: input.sequence,
  };
}

const pending: PendingMessage = {
  clientMessageId: 'client-1',
  idempotencyKey: 'idem-1',
  text: 'Hello',
  previewUrls: [],
  attachmentIds: [],
  createdAt: '2026-10-21T00:00:00.000Z',
  state: 'sending',
  error: null,
};

describe('chat message reconciliation', () => {
  it('deduplicates canonical messages and keeps sequence order', () => {
    const result = mergeCanonicalMessages(
      [message({ id: 'two', sequence: '2', text: 'old' })],
      [message({ id: 'one', sequence: '1' }), message({ id: 'two', sequence: '2', text: 'new' })],
    );

    expect(result.map((item) => item.id)).toEqual(['one', 'two']);
    expect(result[1]?.text).toBe('new');
  });

  it('removes an optimistic item when its canonical client id arrives', () => {
    expect(
      reconcilePending(
        [pending],
        [message({ id: 'canonical', sequence: '3', clientMessageId: 'client-1' })],
      ),
    ).toEqual([]);
  });

  it('finds the highest visible staff sequence for read acknowledgement', () => {
    expect(
      latestStaffSequence([
        message({ id: 'one', sequence: '1' }),
        message({ id: 'two', sequence: '2', direction: 'OUTBOUND' }),
        message({ id: 'three', sequence: '3', direction: 'OUTBOUND' }),
      ]),
    ).toBe('3');
  });
});
