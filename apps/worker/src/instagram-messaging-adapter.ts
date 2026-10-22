import { MetaGraphError, MetaMessengerClient } from '@maevelle/core';
import type { DatabaseClient } from '@maevelle/database';
import * as instagram from '@maevelle/database/messaging';
import type { ObjectStoragePort } from '@maevelle/media';
import type { EncryptionKey } from '@maevelle/security';

import type { ChannelAdapter } from '@maevelle/database/messaging';
import { importMetaProviderImage } from './facebook-messaging-adapter.js';

export interface InstagramWorkerConfig {
  readonly appId: string;
  readonly appSecret: string;
  readonly graphApiVersion: string;
  readonly oauthCallbackUrl: string;
  readonly requestTimeoutMs: number;
}

function outcome(error: unknown) {
  if (!(error instanceof MetaGraphError))
    return { type: 'TRANSIENT_FAILURE' as const, code: 'INSTAGRAM_ADAPTER_EXCEPTION' };
  if (error.category === 'UNKNOWN_OUTCOME') return { type: 'UNKNOWN' as const, code: error.code };
  if (error.category === 'RATE_LIMIT' || error.category === 'TEMPORARY')
    return {
      type: 'TRANSIENT_FAILURE' as const,
      code: error.code,
      ...(error.retryAfter ? { retryAfter: error.retryAfter } : {}),
    };
  return {
    type: 'PERMANENT_FAILURE' as const,
    code: error.code,
    safeMessage:
      error.category === 'AUTHENTICATION' || error.category === 'PERMISSION'
        ? 'Instagram authorization must be renewed.'
        : 'Instagram rejected this message.',
  };
}

export function createInstagramMessagingAdapter(input: {
  database: DatabaseClient;
  encryptionKey: EncryptionKey;
  storage: ObjectStoragePort;
  config: InstagramWorkerConfig;
  fetcher?: typeof fetch;
}): ChannelAdapter {
  const client = new MetaMessengerClient(input.config, input.fetcher);
  return {
    kind: 'INSTAGRAM',
    async deliver(command) {
      let credential: Awaited<ReturnType<typeof instagram.loadInstagramCredential>> | undefined;
      try {
        credential = await instagram.loadInstagramCredential(input.database.db, {
          connectionId: command.connectionId,
          encryptionKey: input.encryptionKey,
        });
        if (!['CONNECTED', 'LIMITED_PERMISSIONS'].includes(credential.status))
          return {
            type: 'PERMANENT_FAILURE',
            code: 'INSTAGRAM_CONNECTION_UNAVAILABLE',
            safeMessage: 'Instagram connection is unavailable.',
          };
        if (
          !credential.grantedScopes.includes('instagram_manage_messages') ||
          !credential.pageTasks.includes('MESSAGING')
        )
          return {
            type: 'PERMANENT_FAILURE',
            code: 'INSTAGRAM_MESSAGING_PERMISSION_MISSING',
            safeMessage: 'Instagram messaging permission must be renewed.',
          };
        if (!credential.webhookSubscriptionHealthy)
          return {
            type: 'PERMANENT_FAILURE',
            code: 'INSTAGRAM_ACTIVATION_INCOMPLETE',
            safeMessage: 'Instagram webhook subscription is incomplete.',
          };
        const context = await instagram.loadInstagramDeliveryContext(input.database.db, {
          organizationId: command.organizationId,
          connectionId: command.connectionId,
          messageId: command.messageId,
        });
        if (!context.eligibleUntil || context.eligibleUntil <= new Date())
          return {
            type: 'PERMANENT_FAILURE',
            code: 'REPLY_WINDOW_CLOSED',
            safeMessage: 'The Instagram customer-service reply window is closed.',
          };
        let sent: { messageId: string };
        if (context.attachment) {
          if (!['image/jpeg', 'image/png', 'image/webp'].includes(context.attachment.mimeType))
            return {
              type: 'PERMANENT_FAILURE',
              code: 'UNSUPPORTED_MEDIA_TYPE',
              safeMessage: 'Instagram supports JPEG, PNG, or WebP images for this reply.',
            };
          const imageUrl = await input.storage.createSignedRead(context.attachment, {
            expiresInSeconds: 300,
          });
          if (!imageUrl)
            return {
              type: 'PERMANENT_FAILURE',
              code: 'ATTACHMENT_PUBLIC_FETCH_UNAVAILABLE',
              safeMessage: 'Instagram image delivery requires short-lived signed object access.',
            };
          sent = await client.sendInstagramImage(
            credential.instagramAccountId,
            context.recipientId,
            imageUrl,
            credential.pageAccessToken,
          );
        } else if (context.text) {
          sent = await client.sendInstagramText(
            credential.instagramAccountId,
            context.recipientId,
            context.text,
            credential.pageAccessToken,
          );
        } else {
          return {
            type: 'PERMANENT_FAILURE',
            code: 'MESSAGE_CONTENT_UNAVAILABLE',
            safeMessage: 'Message content is unavailable.',
          };
        }
        await instagram.recordInstagramSendSuccess(input.database.db, {
          organizationId: command.organizationId,
          connectionId: command.connectionId,
        });
        return { type: 'ACCEPTED', providerMessageId: sent.messageId };
      } catch (error) {
        if (credential && error instanceof MetaGraphError)
          await instagram.recordInstagramProviderFailure(input.database.db, {
            organizationId: command.organizationId,
            connectionId: command.connectionId,
            category: error.category,
            code: error.code,
          });
        return outcome(error);
      }
    },
  };
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
function identifier(value: unknown): string | undefined {
  const item = record(value);
  return typeof item?.id === 'string' ? item.id : undefined;
}

function providerContext(payload: Record<string, unknown>, message?: Record<string, unknown>) {
  const replyTo = record(message?.reply_to);
  const referral = record(payload.referral);
  const quickReply = record(message?.quick_reply);
  return {
    instagram: {
      ...(replyTo ? { replyTo } : {}),
      ...(referral ? { referral } : {}),
      ...(quickReply && typeof quickReply.payload === 'string'
        ? { quickReplyPayload: quickReply.payload }
        : {}),
    },
  };
}

export async function processInstagramProviderEvents(
  database: DatabaseClient,
  workerId: string,
  limit = 20,
  media?: { storage: ObjectStoragePort; fetcher?: typeof fetch },
): Promise<number> {
  let processed = 0;
  for (let index = 0; index < limit; index++) {
    const event = await instagram.claimInstagramProviderEvent(database.db, workerId);
    if (!event) break;
    try {
      const payload = event.payload;
      const senderId = identifier(payload.sender);
      const recipientId = identifier(payload.recipient);
      const timestamp =
        typeof payload.timestamp === 'number' ? new Date(payload.timestamp) : new Date();
      if (event.eventType === 'MESSAGE') {
        const message = record(payload.message);
        const mid = typeof message?.mid === 'string' ? message.mid : undefined;
        if (!message || !mid || !senderId || !recipientId) {
          await instagram.completeInstagramProviderEvent(database.db, {
            id: event.id,
            outcome: 'FAILED_FINAL',
            errorCode: 'MALFORMED_MESSAGE',
          });
          processed++;
          continue;
        }
        if (message.is_echo === true) {
          const matched = await instagram.reconcileInstagramEcho(database.db, {
            organizationId: event.organizationId,
            connectionId: event.connectionId,
            providerMessageId: mid,
          });
          await instagram.completeInstagramProviderEvent(database.db, {
            id: event.id,
            outcome: matched ? 'PROCESSED' : event.attemptCount < 3 ? 'RETRY' : 'IGNORED',
            ...(!matched ? { errorCode: 'UNMATCHED_ECHO' } : {}),
          });
          processed++;
          continue;
        }
        const attachments = Array.isArray(message.attachments)
          ? await Promise.all(
              message.attachments.map(async (item) => {
                const attachment = record(item);
                const providerPayload = record(attachment?.payload);
                const type = attachment?.type;
                const kind =
                  type === 'image'
                    ? 'IMAGE'
                    : type === 'audio'
                      ? 'AUDIO'
                      : type === 'video'
                        ? 'VIDEO'
                        : type === 'file'
                          ? 'FILE'
                          : type === 'story_mention' || type === 'share'
                            ? 'PROVIDER_SHARE'
                            : 'PROVIDER_SHARE';
                const sourceUrl =
                  typeof providerPayload?.url === 'string' ? providerPayload.url : undefined;
                const base = {
                  kind: kind as 'IMAGE' | 'VIDEO' | 'AUDIO' | 'FILE' | 'PROVIDER_SHARE',
                  ...(sourceUrl ? { sourceUrl } : {}),
                  ...(typeof providerPayload?.id === 'string'
                    ? { externalId: providerPayload.id }
                    : {}),
                };
                if (kind === 'IMAGE' && sourceUrl && media)
                  try {
                    return {
                      ...base,
                      ...(await importMetaProviderImage({
                        database,
                        storage: media.storage,
                        organizationId: event.organizationId,
                        url: sourceUrl,
                        fetcher: media.fetcher ?? fetch,
                        fileName: 'instagram-image',
                      })),
                    };
                  } catch {
                    return base;
                  }
                return base;
              }),
            )
          : [];
        await instagram.ingestInstagramMessage(database.db, {
          organizationId: event.organizationId,
          connectionId: event.connectionId,
          senderId,
          messageId: mid,
          text: typeof message.text === 'string' ? message.text : null,
          providerCreatedAt: timestamp,
          attachments,
          structuredPayload: providerContext(payload, message),
        });
        await instagram.completeInstagramProviderEvent(database.db, {
          id: event.id,
          outcome: 'PROCESSED',
        });
      } else if (event.eventType === 'POSTBACK' && senderId) {
        const postback = record(payload.postback);
        await instagram.ingestInstagramMessage(database.db, {
          organizationId: event.organizationId,
          connectionId: event.connectionId,
          senderId,
          messageId: typeof postback?.mid === 'string' ? postback.mid : `postback:${event.id}`,
          text: typeof postback?.title === 'string' ? postback.title : null,
          providerCreatedAt: timestamp,
          structuredPayload: {
            instagram: {
              postbackPayload: typeof postback?.payload === 'string' ? postback.payload : null,
            },
          },
        });
        await instagram.completeInstagramProviderEvent(database.db, {
          id: event.id,
          outcome: 'PROCESSED',
        });
      } else if (event.eventType === 'REACTION' && senderId) {
        const reaction = record(payload.reaction);
        await instagram.ingestInstagramMessage(database.db, {
          organizationId: event.organizationId,
          connectionId: event.connectionId,
          senderId,
          messageId: `reaction:${event.id}`,
          text:
            reaction?.action === 'unreact'
              ? '[Instagram reaction removed]'
              : `[Instagram reaction: ${typeof reaction?.emoji === 'string' ? reaction.emoji : 'received'}]`,
          providerCreatedAt: timestamp,
          structuredPayload: { instagram: { reaction } },
        });
        await instagram.completeInstagramProviderEvent(database.db, {
          id: event.id,
          outcome: 'PROCESSED',
        });
      } else if (event.eventType === 'READ' && senderId) {
        await instagram.applyInstagramReadWatermark(database.db, {
          organizationId: event.organizationId,
          connectionId: event.connectionId,
          recipientId: senderId,
          occurredAt: timestamp,
        });
        await instagram.completeInstagramProviderEvent(database.db, {
          id: event.id,
          outcome: 'PROCESSED',
        });
      } else {
        await instagram.completeInstagramProviderEvent(database.db, {
          id: event.id,
          outcome: 'IGNORED',
        });
      }
    } catch (error) {
      await instagram.completeInstagramProviderEvent(database.db, {
        id: event.id,
        outcome: event.attemptCount >= event.maxAttempts ? 'FAILED_FINAL' : 'RETRY',
        errorCode: error instanceof Error ? error.name : 'PROCESSING_FAILED',
      });
    }
    processed++;
  }
  return processed;
}

export async function processInstagramHistoricalSyncs(input: {
  database: DatabaseClient;
  workerId: string;
  encryptionKey: EncryptionKey;
  config: InstagramWorkerConfig;
}): Promise<number> {
  const job = await instagram.claimInstagramSyncJob(input.database.db, input.workerId);
  if (!job) return 0;
  const client = new MetaMessengerClient(input.config);
  try {
    const credential = await instagram.loadInstagramCredential(input.database.db, {
      organizationId: job.organizationId,
      connectionId: job.connectionId,
      encryptionKey: input.encryptionKey,
    });
    if (!credential.grantedScopes.includes('instagram_manage_messages')) {
      await instagram.failInstagramSyncJob(
        input.database.db,
        job.id,
        'INSTAGRAM_MESSAGING_PERMISSION_MISSING',
        false,
        true,
      );
      return 1;
    }
    const cursor = job.cursor ?? {};
    if (!cursor.conversationId) {
      const page = await client.listInstagramConversations(
        credential.instagramAccountId,
        credential.pageAccessToken,
        cursor.conversationAfter,
      );
      const conversation = page.conversations[0];
      if (!conversation) {
        await instagram.advanceInstagramSyncJob(input.database.db, {
          id: job.id,
          cursor: null,
          complete: true,
        });
        return 1;
      }
      const participant = conversation.participants.find(
        (candidate) => candidate.id !== credential.instagramAccountId,
      );
      if (!participant) {
        await instagram.advanceInstagramSyncJob(input.database.db, {
          id: job.id,
          cursor: page.nextCursor ? { conversationAfter: page.nextCursor } : null,
          complete: !page.nextCursor,
        });
        return 1;
      }
      await instagram.advanceInstagramSyncJob(input.database.db, {
        id: job.id,
        cursor: {
          ...(page.nextCursor ? { conversationAfter: page.nextCursor } : {}),
          conversationId: conversation.id,
          participantId: participant.id,
          endAfterCurrent: !page.nextCursor,
        },
        importedConversations: 1,
      });
      return 1;
    }
    const messages = await client.listConversationMessages(
      cursor.conversationId,
      credential.pageAccessToken,
      cursor.messageAfter,
    );
    let imported = 0,
      duplicates = 0;
    for (const message of messages.messages) {
      if (!cursor.participantId) continue;
      const inserted = await instagram.ingestHistoricalInstagramMessage(input.database.db, {
        organizationId: job.organizationId,
        connectionId: job.connectionId,
        senderId: cursor.participantId,
        fromAccount: message.fromId === credential.instagramAccountId,
        messageId: message.id,
        text: message.text,
        providerCreatedAt: new Date(message.createdAt),
        providerConversationId: cursor.conversationId,
        attachments: message.attachments.map((attachment) => ({
          kind: attachment.mimeType?.startsWith('image/')
            ? ('IMAGE' as const)
            : ('PROVIDER_SHARE' as const),
          ...(attachment.id ? { externalId: attachment.id } : {}),
          ...(attachment.mimeType ? { mimeType: attachment.mimeType } : {}),
        })),
      });
      if (inserted) imported++;
      else duplicates++;
    }
    if (messages.nextCursor)
      await instagram.advanceInstagramSyncJob(input.database.db, {
        id: job.id,
        cursor: { ...cursor, messageAfter: messages.nextCursor },
        importedMessages: imported,
        duplicateMessages: duplicates,
      });
    else if (cursor.endAfterCurrent)
      await instagram.advanceInstagramSyncJob(input.database.db, {
        id: job.id,
        cursor: null,
        importedMessages: imported,
        duplicateMessages: duplicates,
        complete: true,
      });
    else
      await instagram.advanceInstagramSyncJob(input.database.db, {
        id: job.id,
        cursor: cursor.conversationAfter ? { conversationAfter: cursor.conversationAfter } : null,
        importedMessages: imported,
        duplicateMessages: duplicates,
        complete: !cursor.conversationAfter,
      });
  } catch (error) {
    const retry =
      error instanceof MetaGraphError && ['RATE_LIMIT', 'TEMPORARY'].includes(error.category);
    await instagram.failInstagramSyncJob(
      input.database.db,
      job.id,
      graphErrorCode(error),
      retry,
      error instanceof MetaGraphError && ['PERMISSION', 'AUTHENTICATION'].includes(error.category),
    );
  }
  return 1;
}

function graphErrorCode(error: unknown): string {
  return error instanceof MetaGraphError ? error.code : 'INSTAGRAM_SYNC_FAILED';
}
