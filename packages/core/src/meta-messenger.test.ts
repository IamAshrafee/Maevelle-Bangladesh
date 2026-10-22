import { describe, expect, it, vi } from 'vitest';

import { MetaMessengerClient } from './meta-messenger.js';

const config = {
  appId: 'app-1',
  appSecret: 'secret-secret-secret',
  graphApiVersion: 'v26.0',
  oauthCallbackUrl: 'https://admin.example.test/integrations/messaging/facebook/oauth/callback',
  requestTimeoutMs: 1_000,
};

describe('MetaMessengerClient', () => {
  it('builds versioned OAuth URLs without exposing the app secret', () => {
    const url = new URL(
      new MetaMessengerClient(config).authorizationUrl('state-token', ['pages_messaging']),
    );
    expect(url.pathname).toBe('/v26.0/dialog/oauth');
    expect(url.searchParams.get('state')).toBe('state-token');
    expect(url.searchParams.get('scope')).toBe('pages_messaging');
    expect(url.toString()).not.toContain(config.appSecret);
  });

  it('sends a response message with bearer authorization and validates the provider response', async () => {
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect((init?.headers as Record<string, string>).authorization).toBe('Bearer page-token');
      expect(JSON.parse(String(init?.body))).toMatchObject({
        messaging_type: 'RESPONSE',
        recipient: { id: 'psid-1' },
      });
      return new Response(JSON.stringify({ recipient_id: 'psid-1', message_id: 'mid.1' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;
    await expect(
      new MetaMessengerClient(config, fetcher).sendText(
        'page-1',
        'psid-1',
        'হ্যালো 👋',
        'page-token',
      ),
    ).resolves.toEqual({ recipientId: 'psid-1', messageId: 'mid.1' });
  });

  it('classifies structured Meta authentication errors', async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            error: { code: 190, error_subcode: 463, message: 'Expired token', fbtrace_id: 'trace' },
          }),
          { status: 400, headers: { 'content-type': 'application/json' } },
        ),
    ) as typeof fetch;
    await expect(
      new MetaMessengerClient(config, fetcher).verifyPage('page-1', 'expired'),
    ).rejects.toMatchObject({
      category: 'AUTHENTICATION',
      code: 'META_190_463',
      requestId: 'trace',
    });
  });

  it('inspects the current app subscription without mutating the Page', async () => {
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(init?.method ?? 'GET').toBe('GET');
      return new Response(
        JSON.stringify({
          data: [
            {
              id: config.appId,
              subscribed_fields: ['messages', 'message_reads'],
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }) as typeof fetch;

    await expect(
      new MetaMessengerClient(config, fetcher).inspectPageSubscription('page-1', 'page-token'),
    ).resolves.toEqual({ subscribed: true, fields: ['messages', 'message_reads'] });
  });

  it('treats an unstructured provider outage as retryable', async () => {
    const fetcher = vi.fn(
      async () => new Response('upstream unavailable', { status: 503 }),
    ) as typeof fetch;
    await expect(
      new MetaMessengerClient(config, fetcher).verifyPage('page-1', 'page-token'),
    ).rejects.toMatchObject({ category: 'TEMPORARY', code: 'META_HTTP_503' });
  });
});
