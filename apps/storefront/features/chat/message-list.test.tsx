import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import type { MessageView } from '@maevelle/contracts';

import {
  deliveryLabel,
  formatDay,
  formatTime,
  MessageBubble,
  MessageList,
  renderFormattedMessage,
} from './message-list';
import { countUnreadStaffMessages, findFirstUnreadStaffIndex } from './model';
import type { ChatMessageItem, PendingMessage } from './types';

function createMockCanonical(overrides: Partial<MessageView> = {}): MessageView {
  return {
    id: 'msg-1',
    conversationId: 'conv-1',
    sequence: '10',
    direction: 'OUTBOUND',
    sender: {
      type: 'STAFF',
      id: 'staff-1',
      name: 'Sadia Staff',
    },
    type: 'TEXT',
    clientMessageId: null,
    text: 'Hello! How can we assist you today?',
    attachments: [],
    delivery: {
      state: 'DELIVERED',
      canRetry: false,
    },
    createdAt: '2026-10-22T10:00:00.000Z',
    editedAt: null,
    retractedAt: null,
    ...overrides,
  };
}

function createMockItem(
  overrides: {
    key?: string;
    canonical?: MessageView | null;
    pending?: PendingMessage | null;
  } = {},
): ChatMessageItem {
  return {
    key: overrides.key ?? (overrides.canonical?.id || overrides.pending?.clientMessageId || 'item-1'),
    canonical: overrides.canonical !== undefined ? overrides.canonical : createMockCanonical(),
    pending: overrides.pending ?? null,
  };
}

describe('Storefront Message Scroller & List', () => {
  describe('findFirstUnreadStaffIndex', () => {
    it('returns -1 when items array is empty', () => {
      expect(findFirstUnreadStaffIndex([], '0')).toBe(-1);
    });

    it('returns -1 when there are only inbound customer messages', () => {
      const items = [
        createMockItem({
          key: 'c1',
          canonical: createMockCanonical({ id: 'c1', sequence: '1', direction: 'INBOUND' }),
        }),
      ];
      expect(findFirstUnreadStaffIndex(items, '0')).toBe(-1);
    });

    it('returns -1 when all staff messages have sequence <= lastReadSequence', () => {
      const items = [
        createMockItem({
          key: 's1',
          canonical: createMockCanonical({ id: 's1', sequence: '5', direction: 'OUTBOUND' }),
        }),
        createMockItem({
          key: 's2',
          canonical: createMockCanonical({ id: 's2', sequence: '10', direction: 'OUTBOUND' }),
        }),
      ];
      expect(findFirstUnreadStaffIndex(items, '10')).toBe(-1);
    });

    it('identifies first unread staff message index when sequence > lastReadSequence', () => {
      const items = [
        createMockItem({
          key: 's1',
          canonical: createMockCanonical({ id: 's1', sequence: '5', direction: 'OUTBOUND' }),
        }),
        createMockItem({
          key: 'c1',
          canonical: createMockCanonical({ id: 'c1', sequence: '6', direction: 'INBOUND' }),
        }),
        createMockItem({
          key: 's2',
          canonical: createMockCanonical({ id: 's2', sequence: '12', direction: 'OUTBOUND' }),
        }),
        createMockItem({
          key: 's3',
          canonical: createMockCanonical({ id: 's3', sequence: '15', direction: 'OUTBOUND' }),
        }),
      ];
      // s2 (sequence 12) is the first staff message > 5, at index 2
      expect(findFirstUnreadStaffIndex(items, '5')).toBe(2);
    });

    it('treats missing lastReadSequence as 0 and anchors on first staff message', () => {
      const items = [
        createMockItem({
          key: 's1',
          canonical: createMockCanonical({ id: 's1', sequence: '3', direction: 'OUTBOUND' }),
        }),
      ];
      expect(findFirstUnreadStaffIndex(items, null)).toBe(0);
    });
  });

  describe('countUnreadStaffMessages', () => {
    it('accurately counts unread outbound staff messages', () => {
      const items = [
        createMockItem({
          key: 's1',
          canonical: createMockCanonical({ id: 's1', sequence: '5', direction: 'OUTBOUND' }),
        }),
        createMockItem({
          key: 's2',
          canonical: createMockCanonical({ id: 's2', sequence: '10', direction: 'OUTBOUND' }),
        }),
        createMockItem({
          key: 's3',
          canonical: createMockCanonical({ id: 's3', sequence: '15', direction: 'OUTBOUND' }),
        }),
      ];
      expect(countUnreadStaffMessages(items, '5')).toBe(2);
      expect(countUnreadStaffMessages(items, '15')).toBe(0);
    });
  });

  describe('formatting helpers', () => {
    it('formats today and yesterday correctly', () => {
      const now = new Date();
      expect(formatDay(now.toISOString())).toBe('Today');

      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      expect(formatDay(yesterday.toISOString())).toBe('Yesterday');

      const older = new Date('2025-06-15T10:00:00Z');
      expect(formatDay(older.toISOString())).toContain('Jun');
    });

    it('formats timestamps with BDT time format', () => {
      const formatted = formatTime('2026-10-22T10:30:00.000Z');
      expect(formatted).toMatch(/\d{1,2}:\d{2}/);
    });

    it('computes delivery labels for pending and canonical messages', () => {
      const pendingSending = createMockItem({
        key: 'p1',
        canonical: null,
        pending: {
          clientMessageId: 'p1',
          idempotencyKey: 'k1',
          text: 'test',
          previewUrls: [],
          attachmentIds: [],
          createdAt: new Date().toISOString(),
          state: 'sending',
          error: null,
        },
      });
      expect(deliveryLabel(pendingSending)).toBe('Sending…');

      const pendingFailed = createMockItem({
        key: 'p2',
        canonical: null,
        pending: {
          clientMessageId: 'p2',
          idempotencyKey: 'k2',
          text: 'test',
          previewUrls: [],
          attachmentIds: [],
          createdAt: new Date().toISOString(),
          state: 'uncertain',
          error: 'network error',
        },
      });
      expect(deliveryLabel(pendingFailed)).toBe('Not confirmed');

      const canonicalRead = createMockItem({
        canonical: createMockCanonical({
          direction: 'INBOUND',
          delivery: { state: 'READ', canRetry: false },
        }),
      });
      expect(deliveryLabel(canonicalRead)).toBe('Seen');

      const canonicalSent = createMockItem({
        canonical: createMockCanonical({
          direction: 'INBOUND',
          delivery: { state: 'DELIVERED', canRetry: false },
        }),
      });
      expect(deliveryLabel(canonicalSent)).toBe('Sent');
    });
  });

  describe('renderFormattedMessage', () => {
    it('renders plain text without markup', () => {
      const html = renderToStaticMarkup(renderFormattedMessage('Hello Maevelle Support'));
      expect(html).toContain('Hello Maevelle Support');
      expect(html).not.toContain('<a');
    });

    it('converts URLs into secure clickable links', () => {
      const html = renderToStaticMarkup(
        renderFormattedMessage('Check out https://maevelle.com/products/panjabi for details'),
      );
      expect(html).toContain(
        '<a class="break-all font-medium underline underline-offset-2 hover:opacity-85" href="https://maevelle.com/products/panjabi" rel="noopener noreferrer" target="_blank">https://maevelle.com/products/panjabi</a>',
      );
    });

    it('activates Bangla font when Bengali script is present', () => {
      const html = renderToStaticMarkup(renderFormattedMessage('আমাদের ডেলিভারি চার্জ কত?'));
      expect(html).toContain('font-bangla');
      expect(html).toContain('lang="bn"');
    });
  });

  describe('MessageBubble', () => {
    it('renders customer message with primary background and right alignment', () => {
      const item = createMockItem({
        canonical: createMockCanonical({
          direction: 'INBOUND',
          text: 'Is this available in size L?',
        }),
      });
      const html = renderToStaticMarkup(
        <MessageBubble
          isGrouped={false}
          item={item}
          onOpenImage={vi.fn()}
          onRemove={vi.fn()}
          onRetry={vi.fn()}
        />,
      );
      expect(html).toContain('bg-primary');
      expect(html).toContain('text-on-primary');
      expect(html).toContain('items-end');
      expect(html).toContain('Is this available in size L?');
    });

    it('renders support agent message with staff sender name', () => {
      const item = createMockItem({
        canonical: createMockCanonical({
          direction: 'OUTBOUND',
          sender: { type: 'STAFF', id: 's1', name: 'Zarin Support' },
          text: 'Yes, size L is currently in stock!',
        }),
      });
      const html = renderToStaticMarkup(
        <MessageBubble
          isGrouped={false}
          item={item}
          onOpenImage={vi.fn()}
          onRemove={vi.fn()}
          onRetry={vi.fn()}
        />,
      );
      expect(html).toContain('Zarin Support');
      expect(html).toContain('items-start');
      expect(html).toContain('Yes, size L is currently in stock!');
    });

    it('renders retry and remove buttons when pending message failed', () => {
      const item = createMockItem({
        key: 'p-fail',
        canonical: null,
        pending: {
          clientMessageId: 'p-fail',
          idempotencyKey: 'k-fail',
          text: 'Could not send this',
          previewUrls: [],
          attachmentIds: [],
          createdAt: new Date().toISOString(),
          state: 'uncertain',
          error: 'Connection lost',
        },
      });
      const html = renderToStaticMarkup(
        <MessageBubble
          isGrouped={false}
          item={item}
          onOpenImage={vi.fn()}
          onRemove={vi.fn()}
          onRetry={vi.fn()}
        />,
      );
      expect(html).toContain('Retry');
      expect(html).toContain('Remove');
      expect(html).toContain('Not confirmed');
    });
  });

  describe('MessageList static structure', () => {
    it('renders MessageScroller viewport with preserveScrollOnPrepend and role="log"', () => {
      const items = [
        createMockItem({
          key: 'msg-1',
          canonical: createMockCanonical({ id: 'msg-1', text: 'Welcome to Maevelle' }),
        }),
      ];
      const html = renderToStaticMarkup(
        <MessageList
          conversationId="conv-test"
          hasMore={false}
          items={items}
          lastReadSequence="10"
          loadingOlder={false}
          onLoadOlder={vi.fn()}
          onRemove={vi.fn()}
          onRetry={vi.fn()}
          open={true}
        />,
      );
      expect(html).toContain('data-slot="message-scroller"');
      expect(html).toContain('data-slot="message-scroller-viewport"');
      expect(html).toContain('role="log"');
      expect(html).toContain('aria-label="Customer conversation messages"');
      expect(html).toContain('Beginning of conversation history');
      expect(html).toContain('Welcome to Maevelle');
    });

    it('renders unread marker divider when unread staff message is present', () => {
      const items = [
        createMockItem({
          key: 'c1',
          canonical: createMockCanonical({ id: 'c1', sequence: '1', direction: 'INBOUND' }),
        }),
        createMockItem({
          key: 's1',
          canonical: createMockCanonical({
            id: 's1',
            sequence: '5',
            direction: 'OUTBOUND',
            text: 'Here is your update',
          }),
        }),
      ];
      const html = renderToStaticMarkup(
        <MessageList
          conversationId="conv-unread"
          hasMore={false}
          items={items}
          lastReadSequence="1"
          loadingOlder={false}
          onLoadOlder={vi.fn()}
          onRemove={vi.fn()}
          onRetry={vi.fn()}
          open={true}
        />,
      );
      expect(html).toContain('New messages');
      expect(html).toContain('data-message-id="unread-marker"');
      expect(html).toContain('data-scroll-anchor="true"');
    });

    it('renders load older button when hasMore is true', () => {
      const items = [
        createMockItem({
          key: 'msg-1',
          canonical: createMockCanonical({ id: 'msg-1', text: 'Recent message' }),
        }),
      ];
      const html = renderToStaticMarkup(
        <MessageList
          conversationId="conv-more"
          hasMore={true}
          items={items}
          lastReadSequence="10"
          loadingOlder={false}
          onLoadOlder={vi.fn()}
          onRemove={vi.fn()}
          onRetry={vi.fn()}
          open={true}
        />,
      );
      expect(html).toContain('Load older messages');
      expect(html).toContain('data-message-id="history-loader"');
    });
  });
});
