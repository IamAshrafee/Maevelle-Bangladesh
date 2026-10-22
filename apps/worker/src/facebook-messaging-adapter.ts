import { MetaGraphError, MetaMessengerClient } from '@maevelle/core';
import type { DatabaseClient } from '@maevelle/database';
import * as facebook from '@maevelle/database/messaging';
import { completeMediaUploadSession, createMediaUploadSession } from '@maevelle/database/media';
import { createMediaObjectKey, sha256, type ObjectStoragePort } from '@maevelle/media';
import type { EncryptionKey } from '@maevelle/security';
import { isIP } from 'node:net';
import { lookup } from 'node:dns/promises';

import type { ChannelAdapter } from '@maevelle/database/messaging';

export interface FacebookWorkerConfig {
  readonly appId: string;
  readonly appSecret: string;
  readonly graphApiVersion: string;
  readonly oauthCallbackUrl: string;
  readonly requestTimeoutMs: number;
}

function outcome(error: unknown) {
  if (!(error instanceof MetaGraphError))
    return { type: 'TRANSIENT_FAILURE' as const, code: 'META_ADAPTER_EXCEPTION' };
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
        ? 'Facebook authorization must be renewed.'
        : 'Facebook rejected this message.',
  };
}

export function createFacebookMessagingAdapter(input: {
  database: DatabaseClient;
  encryptionKey: EncryptionKey;
  storage: ObjectStoragePort;
  config: FacebookWorkerConfig;
  fetcher?: typeof fetch;
}): ChannelAdapter {
  const client = new MetaMessengerClient(input.config, input.fetcher);
  return {
    kind: 'FACEBOOK',
    async deliver(command) {
      let credential: Awaited<ReturnType<typeof facebook.loadFacebookCredential>> | undefined;
      try {
        credential = await facebook.loadFacebookCredential(input.database.db, {
          connectionId: command.connectionId,
          encryptionKey: input.encryptionKey,
        });
        if (!['CONNECTED', 'LIMITED_PERMISSIONS'].includes(credential.status))
          return {
            type: 'PERMANENT_FAILURE',
            code: 'FACEBOOK_CONNECTION_UNAVAILABLE',
            safeMessage: 'Facebook connection is unavailable.',
          };
        const context = await facebook.loadFacebookDeliveryContext(input.database.db, {
          organizationId: command.organizationId,
          connectionId: command.connectionId,
          messageId: command.messageId,
        });
        if (!context.eligibleUntil || context.eligibleUntil <= new Date())
          return {
            type: 'PERMANENT_FAILURE',
            code: 'REPLY_WINDOW_CLOSED',
            safeMessage: 'The Facebook customer-service reply window is closed.',
          };
        let sent: { messageId: string };
        if (context.attachment) {
          const content = await input.storage.get(context.attachment);
          if (!content)
            return {
              type: 'PERMANENT_FAILURE',
              code: 'ATTACHMENT_UNAVAILABLE',
              safeMessage: 'The private image is unavailable.',
            };
          const attachmentId = await client.uploadImage(
            credential.pageId,
            content,
            context.attachment.mimeType,
            credential.pageAccessToken,
          );
          sent = await client.sendAttachment(
            credential.pageId,
            context.recipientId,
            attachmentId,
            credential.pageAccessToken,
          );
        } else if (context.text)
          sent = await client.sendText(
            credential.pageId,
            context.recipientId,
            context.text,
            credential.pageAccessToken,
          );
        else
          return {
            type: 'PERMANENT_FAILURE',
            code: 'MESSAGE_CONTENT_UNAVAILABLE',
            safeMessage: 'Message content is unavailable.',
          };
        await facebook.recordFacebookSendSuccess(input.database.db, {
          organizationId: command.organizationId,
          connectionId: command.connectionId,
        });
        return { type: 'ACCEPTED', providerMessageId: sent.messageId };
      } catch (error) {
        if (credential && error instanceof MetaGraphError)
          await facebook.recordFacebookProviderFailure(input.database.db, {
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

function privateAddress(address: string): boolean {
  if (
    address === '::1' ||
    address === '0:0:0:0:0:0:0:1' ||
    address.startsWith('fc') ||
    address.startsWith('fd') ||
    address.startsWith('fe80:')
  )
    return true;
  if (isIP(address) !== 4) return false;
  const [a, b] = address.split('.').map(Number);
  return (
    a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 169 && b === 254) ||
    (a === 172 && b! >= 16 && b! <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b! >= 64 && b! <= 127) ||
    (a === 198 && (b === 18 || b === 19))
  );
}

async function validateRemoteUrl(value: string): Promise<URL> {
  const url = new URL(value);
  const host = url.hostname.toLowerCase();
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.port ||
    !['.fbcdn.net', '.fbsbx.com', '.facebook.com', '.facebook.net'].some((suffix) =>
      host.endsWith(suffix),
    )
  )
    throw new Error('UNSAFE_MEDIA_URL');
  const addresses = await lookup(url.hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some((entry) => privateAddress(entry.address)))
    throw new Error('UNSAFE_MEDIA_HOST');
  return url;
}

async function fetchProviderImage(
  value: string,
  fetcher: typeof fetch,
  maxBytes = 5 * 1024 * 1024,
): Promise<{ content: Buffer; mimeType: 'image/jpeg' | 'image/png' | 'image/webp' }> {
  let url = await validateRemoteUrl(value);
  for (let redirect = 0; redirect <= 3; redirect++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    let response: Response;
    try {
      response = await fetcher(url, {
        redirect: 'manual',
        signal: controller.signal,
        headers: { accept: 'image/jpeg,image/png,image/webp' },
      });
    } finally {
      clearTimeout(timeout);
    }
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location || redirect === 3) throw new Error('MEDIA_REDIRECT_REJECTED');
      url = await validateRemoteUrl(new URL(location, url).toString());
      continue;
    }
    if (!response.ok || !response.body) throw new Error('MEDIA_DOWNLOAD_FAILED');
    const declared = Number(response.headers.get('content-length') ?? 0);
    if (declared > maxBytes) throw new Error('MEDIA_TOO_LARGE');
    const mime = response.headers.get('content-type')?.split(';', 1)[0]?.trim();
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(mime ?? ''))
      throw new Error('MEDIA_TYPE_UNSUPPORTED');
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const item = await reader.read();
      if (item.done) break;
      size += item.value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new Error('MEDIA_TOO_LARGE');
      }
      chunks.push(item.value);
    }
    return {
      content: Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))),
      mimeType: mime as 'image/jpeg' | 'image/png' | 'image/webp',
    };
  }
  throw new Error('MEDIA_DOWNLOAD_FAILED');
}

async function importProviderImage(input: {
  database: DatabaseClient;
  storage: ObjectStoragePort;
  organizationId: string;
  url: string;
  fetcher: typeof fetch;
}) {
  const downloaded = await fetchProviderImage(input.url, input.fetcher);
  const session = await createMediaUploadSession(input.database.db, {
    organizationId: input.organizationId,
    uploadSource: 'API',
    originalFilename: 'facebook-image',
    declaredMimeType: downloaded.mimeType,
    declaredByteSize: downloaded.content.length,
    visibility: 'PRIVATE',
    storageProvider: input.storage.provider,
    bucket: input.storage.privateBucket,
    objectKey: (assetId, extension) =>
      createMediaObjectKey({
        organizationId: input.organizationId,
        assetId,
        extension,
        purpose: 'original',
      }),
    expiresAt: new Date(Date.now() + 15 * 60_000),
    maximumBytes: 5 * 1024 * 1024,
  });
  const checksum = sha256(downloaded.content);
  await input.storage.put(
    { provider: session.provider, bucket: session.bucket, key: session.objectKey },
    downloaded.content,
    { contentType: downloaded.mimeType, checksumSha256: checksum },
  );
  await completeMediaUploadSession(input.database.db, {
    organizationId: input.organizationId,
    sessionId: session.id,
    actualByteSize: downloaded.content.length,
    actualContentType: downloaded.mimeType,
    checksumSha256: checksum,
  });
  return {
    mediaAssetId: session.assetId,
    mimeType: downloaded.mimeType,
    fileName: 'facebook-image',
    byteSize: downloaded.content.length,
  };
}

export async function processFacebookProviderEvents(
  database: DatabaseClient,
  workerId: string,
  limit = 20,
  media?: { storage: ObjectStoragePort; fetcher?: typeof fetch },
): Promise<number> {
  let processed = 0;
  for (let index = 0; index < limit; index++) {
    const event = await facebook.claimFacebookProviderEvent(database.db, workerId);
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
          await facebook.completeFacebookProviderEvent(database.db, {
            id: event.id,
            outcome: 'FAILED_FINAL',
            errorCode: 'MALFORMED_MESSAGE',
          });
          processed++;
          continue;
        }
        if (message.is_echo === true) {
          const matched = await facebook.reconcileFacebookEcho(database.db, {
            organizationId: event.organizationId,
            connectionId: event.connectionId,
            providerMessageId: mid,
          });
          await facebook.completeFacebookProviderEvent(database.db, {
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
                    ? providerPayload?.sticker_id
                      ? 'STICKER'
                      : 'IMAGE'
                    : type === 'audio'
                      ? 'AUDIO'
                      : type === 'video'
                        ? 'VIDEO'
                        : type === 'file'
                          ? 'FILE'
                          : 'PROVIDER_SHARE';
                const base = {
                  kind: kind as 'IMAGE' | 'VIDEO' | 'AUDIO' | 'FILE' | 'STICKER' | 'PROVIDER_SHARE',
                  ...(typeof providerPayload?.url === 'string'
                    ? { sourceUrl: providerPayload.url }
                    : {}),
                  ...(typeof providerPayload?.sticker_id === 'number'
                    ? { externalId: String(providerPayload.sticker_id) }
                    : {}),
                };
                if (kind === 'IMAGE' && typeof providerPayload?.url === 'string' && media)
                  try {
                    return {
                      ...base,
                      ...(await importProviderImage({
                        database,
                        storage: media.storage,
                        organizationId: event.organizationId,
                        url: providerPayload.url,
                        fetcher: media.fetcher ?? fetch,
                      })),
                    };
                  } catch {
                    return base;
                  }
                return base;
              }),
            )
          : [];
        const quickReply = record(message.quick_reply);
        await facebook.ingestFacebookMessage(database.db, {
          organizationId: event.organizationId,
          connectionId: event.connectionId,
          senderId,
          messageId: mid,
          text: typeof message.text === 'string' ? message.text : null,
          providerCreatedAt: timestamp,
          attachments,
          structuredPayload:
            quickReply && typeof quickReply.payload === 'string'
              ? { facebook: { quickReplyPayload: quickReply.payload } }
              : {},
        });
        await facebook.completeFacebookProviderEvent(database.db, {
          id: event.id,
          outcome: 'PROCESSED',
        });
      } else if (event.eventType === 'POSTBACK') {
        const postback = record(payload.postback);
        const mid = typeof postback?.mid === 'string' ? postback.mid : `postback:${event.id}`;
        if (!senderId || !postback) {
          await facebook.completeFacebookProviderEvent(database.db, {
            id: event.id,
            outcome: 'FAILED_FINAL',
            errorCode: 'MALFORMED_POSTBACK',
          });
        } else {
          await facebook.ingestFacebookMessage(database.db, {
            organizationId: event.organizationId,
            connectionId: event.connectionId,
            senderId,
            messageId: mid,
            text: typeof postback.title === 'string' ? postback.title : null,
            providerCreatedAt: timestamp,
            structuredPayload: {
              facebook: {
                postbackPayload: typeof postback.payload === 'string' ? postback.payload : null,
              },
            },
          });
          await facebook.completeFacebookProviderEvent(database.db, {
            id: event.id,
            outcome: 'PROCESSED',
          });
        }
      } else if (event.eventType === 'DELIVERY') {
        const delivery = record(payload.delivery);
        const mids = Array.isArray(delivery?.mids)
          ? delivery.mids.filter((mid): mid is string => typeof mid === 'string')
          : [];
        await facebook.applyFacebookReceipt(database.db, {
          organizationId: event.organizationId,
          connectionId: event.connectionId,
          providerMessageIds: mids,
          state: 'DELIVERED',
          occurredAt: timestamp,
        });
        await facebook.completeFacebookProviderEvent(database.db, {
          id: event.id,
          outcome: 'PROCESSED',
        });
      } else if (event.eventType === 'READ' && senderId) {
        await facebook.applyFacebookReadWatermark(database.db, {
          organizationId: event.organizationId,
          connectionId: event.connectionId,
          recipientId: senderId,
          occurredAt: timestamp,
        });
        await facebook.completeFacebookProviderEvent(database.db, {
          id: event.id,
          outcome: 'PROCESSED',
        });
      } else
        await facebook.completeFacebookProviderEvent(database.db, {
          id: event.id,
          outcome: 'IGNORED',
        });
    } catch (error) {
      await facebook.completeFacebookProviderEvent(database.db, {
        id: event.id,
        outcome: event.attemptCount >= event.maxAttempts ? 'FAILED_FINAL' : 'RETRY',
        errorCode: error instanceof Error ? error.name : 'PROCESSING_FAILED',
      });
    }
    processed++;
  }
  return processed;
}

export async function processFacebookHistoricalSyncs(input: {
  database: DatabaseClient;
  workerId: string;
  encryptionKey: EncryptionKey;
  config: FacebookWorkerConfig;
  fetcher?: typeof fetch;
}): Promise<number> {
  const job = await facebook.claimFacebookSyncJob(input.database.db, input.workerId);
  if (!job) return 0;
  const client = new MetaMessengerClient(input.config, input.fetcher);
  try {
    const credential = await facebook.loadFacebookCredential(input.database.db, {
      connectionId: job.connectionId,
      encryptionKey: input.encryptionKey,
    });
    let cursor = job.cursor ?? {};
    let conversationId = cursor.conversationId;
    let participantId = cursor.participantId;
    let importedConversations = 0;
    if (!conversationId) {
      const page = await client.listConversations(
        credential.pageId,
        credential.pageAccessToken,
        cursor.conversationAfter,
      );
      const conversation = page.conversations[0];
      if (!conversation) {
        await facebook.advanceFacebookSyncJob(input.database.db, {
          id: job.id,
          cursor: null,
          complete: true,
        });
        return 1;
      }
      const participant = conversation.participants.find(
        (candidate) => candidate.id !== credential.pageId,
      );
      if (!participant) {
        await facebook.advanceFacebookSyncJob(input.database.db, {
          id: job.id,
          cursor: page.nextCursor ? { conversationAfter: page.nextCursor } : null,
          complete: !page.nextCursor,
        });
        return 1;
      }
      conversationId = conversation.id;
      participantId = participant.id;
      importedConversations = 1;
      cursor = {
        ...(page.nextCursor ? { conversationAfter: page.nextCursor } : { endAfterCurrent: true }),
        conversationId,
        participantId,
      };
    }
    const messages = await client.listConversationMessages(
      conversationId!,
      credential.pageAccessToken,
      cursor.messageAfter,
    );
    let importedMessages = 0;
    for (const message of [...messages.messages].sort((left, right) =>
      left.createdAt.localeCompare(right.createdAt),
    )) {
      if (!participantId) continue;
      const attachments = message.attachments.map((attachment) => ({
        kind: (attachment.mimeType?.startsWith('image/')
          ? 'IMAGE'
          : attachment.mimeType?.startsWith('audio/')
            ? 'AUDIO'
            : attachment.mimeType?.startsWith('video/')
              ? 'VIDEO'
              : 'FILE') as 'IMAGE' | 'AUDIO' | 'VIDEO' | 'FILE',
        ...(attachment.id ? { externalId: attachment.id } : {}),
        ...(attachment.mimeType ? { mimeType: attachment.mimeType } : {}),
      }));
      const inserted = await facebook.ingestHistoricalFacebookMessage(input.database.db, {
        organizationId: job.organizationId,
        connectionId: job.connectionId,
        senderId: participantId,
        fromPage: message.fromId === credential.pageId,
        messageId: message.id,
        ...(message.text ? { text: message.text } : {}),
        providerCreatedAt: new Date(message.createdAt),
        providerConversationId: conversationId!,
        ...(attachments.length ? { attachments } : {}),
      });
      if (inserted) importedMessages++;
    }
    if (messages.nextCursor)
      await facebook.advanceFacebookSyncJob(input.database.db, {
        id: job.id,
        cursor: { ...cursor, messageAfter: messages.nextCursor },
        importedConversations,
        importedMessages,
      });
    else if (cursor.endAfterCurrent)
      await facebook.advanceFacebookSyncJob(input.database.db, {
        id: job.id,
        cursor: null,
        importedConversations,
        importedMessages,
        complete: true,
      });
    else
      await facebook.advanceFacebookSyncJob(input.database.db, {
        id: job.id,
        cursor: cursor.conversationAfter ? { conversationAfter: cursor.conversationAfter } : null,
        importedConversations,
        importedMessages,
      });
    return 1;
  } catch (error) {
    const graph = error instanceof MetaGraphError ? error : undefined;
    await facebook.failFacebookSyncJob(
      input.database.db,
      job.id,
      graph?.code ?? 'SYNC_FAILED',
      Boolean(graph && ['RATE_LIMIT', 'TEMPORARY'].includes(graph.category)),
    );
    return 1;
  }
}
