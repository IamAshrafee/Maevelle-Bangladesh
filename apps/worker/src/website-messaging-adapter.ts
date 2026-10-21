import type { ChannelAdapter } from '@maevelle/database/messaging';

/**
 * Website delivery means the durable canonical message is available to the
 * authorized visitor history. It does not claim an active browser received or
 * read the message; the visitor read cursor supplies that later evidence.
 */
export const websiteMessagingAdapter: ChannelAdapter = {
  kind: 'WEBSITE',
  async deliver(command) {
    return {
      type: 'ACCEPTED',
      providerMessageId: `website:${command.messageId}`,
      providerRequestId: command.providerRequestKey,
    };
  },
};
