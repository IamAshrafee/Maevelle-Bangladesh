import { afterEach, describe, expect, it, vi } from 'vitest';

import { MetaMessengerClient } from '@maevelle/core';
import type { DatabaseClient } from '@maevelle/database';
import * as messaging from '@maevelle/database/messaging';
import type { ObjectStoragePort } from '@maevelle/media';

import { createFacebookMessagingAdapter } from './facebook-messaging-adapter.js';
import { createInstagramMessagingAdapter } from './instagram-messaging-adapter.js';

const facebook = messaging;
const instagram = messaging;
const database = { db: {} } as DatabaseClient;

const encryptionKey = { id: 'test-key', value: new Uint8Array(32) };
const storage = {
  provider: 'test',
  privateBucket: 'private',
  publicBucket: 'public',
} as ObjectStoragePort;
const config = {
  appId: 'app-1',
  appSecret: 'secret-secret-secret',
  graphApiVersion: 'v26.0',
  oauthCallbackUrl: 'https://example.test/callback',
  requestTimeoutMs: 1_000,
};
const command = {
  intentId: crypto.randomUUID(),
  organizationId: crypto.randomUUID(),
  messageId: crypto.randomUUID(),
  connectionId: crypto.randomUUID(),
  providerRequestKey: `message:${crypto.randomUUID()}`,
  text: 'Hello',
};

afterEach(() => vi.restoreAllMocks());

describe('Meta messaging delivery ambiguity', () => {
  it('does not retry Facebook after provider acceptance when success bookkeeping fails', async () => {
    vi.spyOn(facebook, 'loadFacebookCredential').mockResolvedValue({
      organizationId: command.organizationId,
      pageId: 'page-1',
      pageName: 'Page',
      pageAccessToken: 'page-token',
      graphApiVersion: 'v26.0',
      status: 'CONNECTED',
      grantedScopes: ['pages_messaging'],
      pageTasks: ['MESSAGING'],
      webhookSubscriptionHealthy: true,
      routingStatus: 'OWNER_CONFIRMED',
      lastInboundAt: new Date(),
    });
    vi.spyOn(facebook, 'loadFacebookDeliveryContext').mockResolvedValue({
      recipientId: 'psid-1',
      eligibleUntil: new Date(Date.now() + 60_000),
      text: 'Hello',
      attachment: null,
    });
    vi.spyOn(MetaMessengerClient.prototype, 'sendText').mockResolvedValue({
      recipientId: 'psid-1',
      messageId: 'mid.accepted',
    });
    vi.spyOn(facebook, 'recordFacebookSendSuccess').mockRejectedValue(
      new Error('database unavailable'),
    );

    await expect(
      createFacebookMessagingAdapter({ database, encryptionKey, storage, config }).deliver(command),
    ).resolves.toEqual({
      type: 'UNKNOWN',
      code: 'POST_SEND_BOOKKEEPING_FAILED',
      reconciliationKey: 'mid.accepted',
    });
  });

  it('does not retry Instagram after provider acceptance when success bookkeeping fails', async () => {
    vi.spyOn(instagram, 'loadInstagramCredential').mockResolvedValue({
      organizationId: command.organizationId,
      instagramAccountId: 'ig-1',
      pageId: 'page-1',
      displayName: 'Instagram',
      graphApiVersion: 'v26.0',
      status: 'CONNECTED',
      grantedScopes: ['instagram_manage_messages'],
      pageTasks: ['MESSAGING'],
      webhookSubscriptionHealthy: true,
      pageAccessToken: 'page-token',
    });
    vi.spyOn(instagram, 'loadInstagramDeliveryContext').mockResolvedValue({
      recipientId: 'igsid-1',
      eligibleUntil: new Date(Date.now() + 60_000),
      text: 'Hello',
      attachment: null,
    });
    vi.spyOn(MetaMessengerClient.prototype, 'sendInstagramText').mockResolvedValue({
      recipientId: 'igsid-1',
      messageId: 'ig-mid.accepted',
    });
    vi.spyOn(instagram, 'recordInstagramSendSuccess').mockRejectedValue(
      new Error('database unavailable'),
    );

    await expect(
      createInstagramMessagingAdapter({ database, encryptionKey, storage, config }).deliver(command),
    ).resolves.toEqual({
      type: 'UNKNOWN',
      code: 'POST_SEND_BOOKKEEPING_FAILED',
      reconciliationKey: 'ig-mid.accepted',
    });
  });
});
