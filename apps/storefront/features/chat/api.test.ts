import type { MessagingEvent } from '@maevelle/contracts';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { streamChatEvents } from './api';

const event: MessagingEvent = {
  eventId: 'event-1',
  cursor: '41',
  type: 'message.accepted',
  conversationId: 'conversation-1',
  aggregateId: 'message-1',
  aggregateVersion: '1',
  payload: { messageId: 'message-1' },
  createdAt: '2026-10-22T00:00:00.000Z',
};

afterEach(() => vi.unstubAllGlobals());

describe('chat event stream', () => {
  it('parses chunked SSE records with standard CRLF boundaries', async () => {
    const encoded = new TextEncoder().encode(`id: 41\r\ndata: ${JSON.stringify(event)}\r\n\r\n`);
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoded.slice(0, 17));
        controller.enqueue(encoded.slice(17));
        controller.close();
      },
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body, { status: 200 })));
    const received: MessagingEvent[] = [];

    await streamChatEvents({
      cursor: '40',
      signal: new AbortController().signal,
      onEvent: (next) => received.push(next),
    });

    expect(fetch).toHaveBeenCalledWith(
      '/api/storefront/v1/chat/events?cursor=40',
      expect.objectContaining({ credentials: 'include' }),
    );
    expect(received).toEqual([event]);
  });

  it('preserves backend cursor-expiry errors for canonical resync', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          Response.json(
            { error: { code: 'EVENT_CURSOR_EXPIRED', message: 'Replay window elapsed.' } },
            { status: 410 },
          ),
        ),
    );

    await expect(
      streamChatEvents({
        cursor: '1',
        signal: new AbortController().signal,
        onEvent: () => undefined,
      }),
    ).rejects.toMatchObject({
      status: 410,
      code: 'EVENT_CURSOR_EXPIRED',
    });
  });

  it('safely ignores keepalive comments and malformed JSON frames', async () => {
    const raw = ': keepalive\r\n\r\nid: 41\r\ndata: {invalid-json\r\n\r\nid: 42\r\ndata: ' + JSON.stringify(event) + '\r\n\r\n';
    const encoded = new TextEncoder().encode(raw);
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoded);
        controller.close();
      },
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body, { status: 200 })));
    const received: MessagingEvent[] = [];

    await streamChatEvents({
      cursor: '40',
      signal: new AbortController().signal,
      onEvent: (next) => received.push(next),
    });

    expect(received).toEqual([event]);
  });
});
