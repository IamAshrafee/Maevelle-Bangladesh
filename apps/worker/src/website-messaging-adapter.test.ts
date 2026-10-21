import { describe, expect, it } from 'vitest';

import { websiteMessagingAdapter } from './website-messaging-adapter.js';

describe('website messaging adapter', () => {
  it('returns a deterministic acceptance reference without claiming browser receipt', async () => {
    const command = {
      intentId: crypto.randomUUID(),
      organizationId: crypto.randomUUID(),
      connectionId: crypto.randomUUID(),
      conversationId: crypto.randomUUID(),
      messageId: crypto.randomUUID(),
      providerRequestKey: crypto.randomUUID(),
      text: 'Support reply',
      attachmentIds: [],
    };
    await expect(websiteMessagingAdapter.deliver(command)).resolves.toEqual({
      type: 'ACCEPTED',
      providerMessageId: `website:${command.messageId}`,
      providerRequestId: command.providerRequestKey,
    });
  });
});
