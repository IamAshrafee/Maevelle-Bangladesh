import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { MessageView } from '@maevelle/contracts/messaging';

import {
  formatDateSeparator,
  formatFileSize,
  isSameDay,
} from '../components/messaging/format';
import { findFirstUnreadIndex } from '../components/messaging/message-transcript';
import {
  HighlightedText,
  TranscriptMessageItem,
} from '../components/messaging/transcript-message-item';

function createMockMessage(overrides: Partial<MessageView> = {}): MessageView {
  return {
    id: 'msg-1',
    conversationId: 'conv-1',
    sequence: '100',
    direction: 'INBOUND',
    sender: {
      type: 'CONTACT',
      id: 'contact-1',
      name: 'Rahim Ahmed',
    },
    type: 'TEXT',
    clientMessageId: null,
    text: 'Hello, I have an inquiry about my order #1234.',
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

describe('Message Scroller Transcript', () => {
  describe('findFirstUnreadIndex', () => {
    it('returns -1 when unread count is 0 and no lastReadSequence', () => {
      const messages = [
        createMockMessage({ id: 'm1', sequence: '1' }),
        createMockMessage({ id: 'm2', sequence: '2' }),
      ];
      expect(findFirstUnreadIndex(messages, 0, null)).toBe(-1);
    });

    it('identifies unread message using lastReadSequence', () => {
      const messages = [
        createMockMessage({ id: 'm1', sequence: '10', direction: 'INBOUND' }),
        createMockMessage({ id: 'm2', sequence: '20', direction: 'OUTBOUND' }),
        createMockMessage({ id: 'm3', sequence: '30', direction: 'INBOUND' }),
      ];
      // When last read sequence is '15', m3 (sequence 30) is the first unread
      expect(findFirstUnreadIndex(messages, 1, '15')).toBe(2);
    });

    it('identifies first unread based on unreadCount when lastReadSequence is not present', () => {
      const messages = [
        createMockMessage({ id: 'm1', sequence: '1', direction: 'INBOUND' }),
        createMockMessage({ id: 'm2', sequence: '2', direction: 'OUTBOUND' }),
        createMockMessage({ id: 'm3', sequence: '3', direction: 'INBOUND' }),
        createMockMessage({ id: 'm4', sequence: '4', direction: 'INBOUND' }),
      ];
      // 3 inbound messages: m1, m3, m4. If unreadCount is 2, unread are m3 and m4. First is m3 (index 2).
      expect(findFirstUnreadIndex(messages, 2, null)).toBe(2);
    });

    it('returns -1 if there are no inbound messages', () => {
      const messages = [
        createMockMessage({ id: 'm1', sequence: '1', direction: 'OUTBOUND' }),
      ];
      expect(findFirstUnreadIndex(messages, 1, null)).toBe(-1);
    });
  });

  describe('HighlightedText', () => {
    it('renders plain text when query is empty', () => {
      const html = renderToStaticMarkup(<HighlightedText text="Hello world" query="" />);
      expect(html).toBe('Hello world');
      expect(html).not.toContain('<mark');
    });

    it('wraps matches in <mark> elements with case-insensitive matching', () => {
      const html = renderToStaticMarkup(
        <HighlightedText text="Tracking order #1234 with courier" query="ORDER" />,
      );
      expect(html).toContain('<mark class="rounded-xs bg-warning/35 px-0.5 font-medium text-foreground">order</mark>');
    });

    it('correctly escapes regex special characters in search queries', () => {
      const html = renderToStaticMarkup(
        <HighlightedText text="Total is $100 [USD] special" query="$100 [USD]" />,
      );
      expect(html).toContain('<mark class="rounded-xs bg-warning/35 px-0.5 font-medium text-foreground">$100 [USD]</mark>');
    });
  });

  describe('format helpers', () => {
    it('formats file sizes accurately', () => {
      expect(formatFileSize('512')).toBe('512 B');
      expect(formatFileSize('2048')).toBe('2.0 KB');
      expect(formatFileSize(String(5 * 1024 * 1024))).toBe('5.0 MB');
      expect(formatFileSize(null)).toBe('');
    });

    it('detects calendar days and formats date separators', () => {
      const now = new Date();
      expect(formatDateSeparator(now)).toBe('Today');

      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      expect(formatDateSeparator(yesterday)).toBe('Yesterday');

      const older = new Date('2025-01-15T12:00:00Z');
      expect(formatDateSeparator(older)).toContain('2025');

      expect(isSameDay(now, now)).toBe(true);
      expect(isSameDay(now, yesterday)).toBe(false);
    });
  });

  describe('TranscriptMessageItem rendering', () => {
    it('renders customer inbound message with avatar initials and tabular-nums time', () => {
      const msg = createMockMessage({
        sender: { type: 'CONTACT', id: 'c1', name: 'Tanvir Hasan' },
        text: 'When will my package arrive?',
      });
      const html = renderToStaticMarkup(<TranscriptMessageItem message={msg} />);
      expect(html).toContain('TH');
      expect(html).toContain('Tanvir Hasan');
      expect(html).toContain('tabular-nums');
      expect(html).toContain('font-mono');
    });

    it('renders staff outbound message with delivery status indicator', () => {
      const msg = createMockMessage({
        direction: 'OUTBOUND',
        sender: { type: 'STAFF', id: 's1', name: 'Sadia Staff' },
        text: 'Your package is out for delivery today.',
        delivery: { state: 'READ', canRetry: false },
      });
      const html = renderToStaticMarkup(<TranscriptMessageItem message={msg} />);
      expect(html).toContain('Sadia Staff');
      expect(html).toContain('Your package is out for delivery today.');
      expect(html).toContain('Read');
    });

    it('renders system event messages with dashed border badge', () => {
      const msg = createMockMessage({
        type: 'SYSTEM_EVENT',
        sender: { type: 'SYSTEM', id: null, name: 'System' },
        text: 'Conversation reassigned to Ashrafee',
      });
      const html = renderToStaticMarkup(<TranscriptMessageItem message={msg} />);
      expect(html).toContain('border-dashed');
      expect(html).toContain('Conversation reassigned to Ashrafee');
    });

    it('renders image attachments with secure preview links', () => {
      const msg = createMockMessage({
        attachments: [
          {
            id: 'att-1',
            kind: 'IMAGE',
            fileName: 'receipt.png',
            mimeType: 'image/png',
            byteSize: '1048576',
            width: 800,
            height: 600,
            securityStatus: 'AVAILABLE',
            downloadPath: '/api/admin/messaging/attachments/att-1',
          },
        ],
      });
      const html = renderToStaticMarkup(<TranscriptMessageItem message={msg} />);
      expect(html).toContain('receipt.png');
      expect(html).toContain('1.0 MB');
      expect(html).toContain('src="/api/admin/messaging/attachments/att-1"');
    });
  });
});
