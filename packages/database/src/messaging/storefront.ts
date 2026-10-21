import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { sql, type Kysely, type Transaction } from 'kysely';

import type {
  CursorPage,
  MessageView,
  MessagingEvent,
  StorefrontChatConfig,
  StorefrontConversationContext,
  StorefrontConversationView,
  StorefrontVisitorSessionView,
} from '@maevelle/contracts/messaging';
import type { DatabaseSchema } from '../index.js';
import {
  acceptInboundMessage,
  appendRealtimeEvent,
  getConversation,
  listMessages,
  MessagingDomainError,
} from './index.js';

type Db = Kysely<DatabaseSchema>;
type Tx = Transaction<DatabaseSchema>;

const SESSION_IDLE_DAYS = 180;
const SESSION_ABSOLUTE_DAYS = 365;
export const WEBSITE_ATTACHMENT_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;
export const WEBSITE_ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024;
export const WEBSITE_ATTACHMENT_MAX_COUNT = 5;

export interface VisitorCredentialContext {
  readonly sessionId: string;
  readonly organizationId: string;
  readonly connectionId: string;
  readonly contactId: string;
  readonly contactIdentityId: string;
  readonly customerId: string | null;
  readonly expiresAt: Date;
}

export interface StorefrontContextInput {
  readonly pageType: StorefrontConversationContext['pageType'];
  readonly path: string;
  readonly productId?: string;
  readonly variantId?: string;
}

export function visitorMediaOwnerHash(digestKey: Buffer, contactIdentityId: string): string {
  return createHmac('sha256', digestKey)
    .update('maevelle.website-chat.media.v1\0')
    .update(contactIdentityId)
    .digest('hex');
}

function credentialDigest(key: Buffer, sessionId: string, secret: string): Buffer {
  return createHmac('sha256', key)
    .update('maevelle.website-chat.v1\0')
    .update(sessionId)
    .update('\0')
    .update(secret)
    .digest();
}

function parseCredential(value: string | undefined): { sessionId: string; secret: string } | undefined {
  if (!value || value.length > 200) return undefined;
  const [sessionId, secret, extra] = value.split('.');
  if (extra || !sessionId || !secret) return undefined;
  if (!/^[0-9a-f-]{36}$/i.test(sessionId) || !/^[A-Za-z0-9_-]{43}$/.test(secret)) return undefined;
  return { sessionId, secret };
}

function sessionView(input: VisitorCredentialContext): StorefrontVisitorSessionView {
  return {
    id: input.sessionId,
    status: 'ACTIVE',
    expiresAt: input.expiresAt.toISOString(),
    isCustomerLinked: input.customerId !== null,
  };
}

export async function ensureWebsiteChannel(db: Db, organizationId: string): Promise<string> {
  const result = await sql<{ id: string }>`insert into messaging.channel_connections(
      organization_id,channel_kind,display_name,status,capability_snapshot,configuration
    ) values (
      ${organizationId},'WEBSITE','Storefront live chat','ACTIVE',
      ${JSON.stringify({ text: true, attachments: true, replies: true, readReceipts: true, maximumTextLength: 10_000 })}::jsonb,
      ${JSON.stringify({ enabled: true, acceptsOfflineMessages: true, greeting: 'How can we help?', offlineMessage: 'Send us a message and our team will reply as soon as possible.' })}::jsonb
    ) on conflict (organization_id,channel_kind) where channel_kind='WEBSITE'
      do update set updated_at=now()
    returning id`.execute(db);
  return result.rows[0]!.id;
}

export async function getStorefrontChatConfig(
  db: Db,
  organizationId: string,
): Promise<StorefrontChatConfig> {
  const connectionId = await ensureWebsiteChannel(db, organizationId);
  const result = await sql<{
    status: string;
    capability_snapshot: Record<string, unknown>;
    configuration: Record<string, unknown>;
  }>`select status,capability_snapshot,configuration from messaging.channel_connections
      where organization_id=${organizationId} and id=${connectionId}`.execute(db);
  const row = result.rows[0]!;
  const enabled = row.status === 'ACTIVE' || row.status === 'DEGRADED';
  const acceptsMessages = enabled && row.configuration.acceptsOfflineMessages !== false;
  return {
    enabled,
    availability: enabled ? 'AVAILABLE' : 'DISABLED',
    acceptsMessages,
    greeting:
      typeof row.configuration.greeting === 'string'
        ? row.configuration.greeting.slice(0, 240)
        : 'How can we help?',
    offlineMessage:
      typeof row.configuration.offlineMessage === 'string'
        ? row.configuration.offlineMessage.slice(0, 500)
        : 'Send us a message and our team will reply as soon as possible.',
    capabilities: {
      text: row.capability_snapshot.text !== false,
      attachments: row.capability_snapshot.attachments === true,
      replies: row.capability_snapshot.replies !== false,
      readReceipts: row.capability_snapshot.readReceipts === true,
      maximumTextLength:
        typeof row.capability_snapshot.maximumTextLength === 'number'
          ? row.capability_snapshot.maximumTextLength
          : 10_000,
    },
    attachmentPolicy: {
      mimeTypes: WEBSITE_ATTACHMENT_MIME_TYPES,
      maximumBytes: WEBSITE_ATTACHMENT_MAX_BYTES,
      maximumCount: WEBSITE_ATTACHMENT_MAX_COUNT,
    },
  };
}

async function validateContext(
  db: Db,
  organizationId: string,
  context: StorefrontContextInput | undefined,
): Promise<(StorefrontContextInput & { productTitle?: string }) | undefined> {
  if (!context) return undefined;
  if (!context.path.startsWith('/') || context.path.length > 500 || /[\r\n\0]/.test(context.path))
    throw new MessagingDomainError('VALIDATION_FAILED', 'Page context path is invalid.');
  if (!context.productId) {
    if (context.variantId)
      throw new MessagingDomainError('VALIDATION_FAILED', 'A variant requires a product.');
    return context;
  }
  const product = await sql<{ title: string }>`select p.title from catalog.products p
      where p.organization_id=${organizationId} and p.id=${context.productId}::uuid
        and p.status='ACTIVE' and p.publication_status='PUBLISHED'
        and (${context.variantId ?? null}::uuid is null or exists(
          select 1 from catalog.product_variants v where v.organization_id=p.organization_id
            and v.product_id=p.id and v.id=${context.variantId ?? null}::uuid and v.status='ACTIVE'
        ))`.execute(db);
  if (!product.rows[0])
    throw new MessagingDomainError('VALIDATION_FAILED', 'Product context is unavailable.');
  return { ...context, productTitle: product.rows[0].title };
}

async function appendContext(
  tx: Tx,
  input: {
    organizationId: string;
    conversationId: string;
    contactIdentityId: string;
    context?: StorefrontContextInput & { productTitle?: string };
  },
): Promise<void> {
  if (!input.context) return;
  await sql`insert into messaging.conversation_context_events(
      organization_id,conversation_id,contact_identity_id,context_type,url_path,product_id,variant_id,product_title
    ) values (${input.organizationId},${input.conversationId},${input.contactIdentityId},${input.context.pageType},
      ${input.context.path},${input.context.productId ?? null},${input.context.variantId ?? null},${input.context.productTitle ?? null})`.execute(tx);
}

async function createOrResumeConversation(
  tx: Tx,
  input: {
    organizationId: string;
    connectionId: string;
    contactId: string;
    contactIdentityId: string;
    context?: StorefrontContextInput & { productTitle?: string };
  },
): Promise<string> {
  await sql`select id from messaging.contact_identities where organization_id=${input.organizationId}
      and id=${input.contactIdentityId} for update`.execute(tx);
  const existing = await sql<{ id: string }>`select id from messaging.conversations
      where organization_id=${input.organizationId} and channel_connection_id=${input.connectionId}
        and contact_identity_id=${input.contactIdentityId} and channel_kind='WEBSITE'
        and status in ('NEW','OPEN','PENDING','RESOLVED') order by created_at desc limit 1`.execute(tx);
  let conversationId = existing.rows[0]?.id;
  if (!conversationId) {
    const created = await sql<{ id: string; version: string }>`insert into messaging.conversations(
        organization_id,channel_connection_id,channel_kind,contact_id,contact_identity_id,context
      ) values (${input.organizationId},${input.connectionId},'WEBSITE',${input.contactId},${input.contactIdentityId},
        ${JSON.stringify(input.context ? { pageType: input.context.pageType, path: input.context.path, productId: input.context.productId ?? null, variantId: input.context.variantId ?? null } : {})}::jsonb)
      returning id,version::text`.execute(tx);
    conversationId = created.rows[0]!.id;
    await appendRealtimeEvent(tx as unknown as Db, {
      organizationId: input.organizationId,
      audienceType: 'ORGANIZATION',
      conversationId,
      eventType: 'messaging.conversation.created.v1',
      aggregateId: conversationId,
      aggregateVersion: created.rows[0]!.version,
      payload: { conversationId, version: created.rows[0]!.version },
    });
    await sql`insert into platform.outbox_events(organization_id,event_type,event_version,aggregate_type,aggregate_id,aggregate_version,payload,occurred_at)
      values(${input.organizationId},'messaging.conversation.created.v1',1,'messaging.conversation',${conversationId},${created.rows[0]!.version}::bigint,
        ${JSON.stringify({ conversationId, version: created.rows[0]!.version })}::jsonb,now())`.execute(tx);
  }
  await appendContext(tx, { ...input, conversationId });
  return conversationId;
}

export async function authenticateVisitorCredential(
  db: Db,
  input: { organizationId: string; credential?: string; digestKey: Buffer; touch?: boolean },
): Promise<VisitorCredentialContext> {
  const parsed = parseCredential(input.credential);
  if (!parsed) throw new MessagingDomainError('UNAUTHENTICATED', 'Visitor session is invalid.');
  const result = await sql<{
    id: string;
    organization_id: string;
    channel_connection_id: string;
    contact_identity_id: string;
    contact_id: string;
    customer_id: string | null;
    credential_digest: Buffer;
    status: string;
    expires_at: Date;
    absolute_expires_at: Date;
    last_seen_at: Date;
  }>`select s.id,s.organization_id,s.channel_connection_id,s.contact_identity_id,ci.contact_id,c.customer_id,
      s.credential_digest,s.status,s.expires_at,s.absolute_expires_at,s.last_seen_at
      from messaging.visitor_sessions s
      join messaging.contact_identities ci on ci.organization_id=s.organization_id and ci.id=s.contact_identity_id
      join messaging.contacts c on c.organization_id=ci.organization_id and c.id=ci.contact_id
      where s.organization_id=${input.organizationId} and s.id=${parsed.sessionId}::uuid`.execute(db);
  const row = result.rows[0];
  const supplied = credentialDigest(input.digestKey, parsed.sessionId, parsed.secret);
  if (!row || row.credential_digest.length !== supplied.length || !timingSafeEqual(row.credential_digest, supplied))
    throw new MessagingDomainError('UNAUTHENTICATED', 'Visitor session is invalid.');
  if (row.status !== 'ACTIVE' || row.expires_at <= new Date() || row.absolute_expires_at <= new Date()) {
    if (row.status === 'ACTIVE')
      await sql`update messaging.visitor_sessions set status='EXPIRED' where organization_id=${input.organizationId} and id=${row.id}`.execute(db);
    throw new MessagingDomainError('SESSION_EXPIRED', 'Visitor session has expired.');
  }
  let expiresAt = row.expires_at;
  if (input.touch !== false && row.last_seen_at.getTime() < Date.now() - 15 * 60_000) {
    expiresAt = new Date(
      Math.min(row.absolute_expires_at.getTime(), Date.now() + SESSION_IDLE_DAYS * 86_400_000),
    );
    await sql`update messaging.visitor_sessions set last_seen_at=now(),expires_at=${expiresAt}
      where organization_id=${input.organizationId} and id=${row.id} and status='ACTIVE'`.execute(db);
  }
  return {
    sessionId: row.id,
    organizationId: row.organization_id,
    connectionId: row.channel_connection_id,
    contactIdentityId: row.contact_identity_id,
    contactId: row.contact_id,
    customerId: row.customer_id,
    expiresAt,
  };
}

export async function createOrResumeVisitorSession(
  db: Db,
  input: {
    organizationId: string;
    credential?: string;
    digestKey: Buffer;
    context?: StorefrontContextInput;
  },
): Promise<{
  credential: string;
  session: StorefrontVisitorSessionView;
  conversation: StorefrontConversationView;
  created: boolean;
}> {
  const chatConfig = await getStorefrontChatConfig(db, input.organizationId);
  if (!chatConfig.enabled || !chatConfig.acceptsMessages)
    throw new MessagingDomainError('CONNECTION_UNAVAILABLE', 'Storefront chat is unavailable.');
  const context = await validateContext(db, input.organizationId, input.context);
  if (input.credential) {
    try {
      const authenticated = await authenticateVisitorCredential(db, {
        organizationId: input.organizationId,
        credential: input.credential,
        digestKey: input.digestKey,
      });
      const conversationId = await db.transaction().execute((tx) =>
        createOrResumeConversation(tx, {
          ...authenticated,
          ...(context ? { context } : {}),
        }),
      );
      return {
        credential: input.credential,
        session: sessionView(authenticated),
        conversation: await getVisitorConversation(db, authenticated, conversationId),
        created: false,
      };
    } catch (error) {
      if (
        !(error instanceof MessagingDomainError) ||
        !['UNAUTHENTICATED', 'SESSION_EXPIRED'].includes(error.code)
      )
        throw error;
    }
  }
  const connectionId = await ensureWebsiteChannel(db, input.organizationId);
  const secret = randomBytes(32).toString('base64url');
  const issued = await db.transaction().execute(async (tx) => {
    const contact = await sql<{ id: string }>`insert into messaging.contacts(organization_id)
      values(${input.organizationId}) returning id`.execute(tx);
    const identity = await sql<{ id: string }>`insert into messaging.contact_identities(
      organization_id,contact_id,channel_kind,channel_connection_id,external_subject_id,verification_status
    ) values (${input.organizationId},${contact.rows[0]!.id},'WEBSITE',${connectionId},${crypto.randomUUID()},'CHANNEL_ASSERTED') returning id`.execute(tx);
    const sessionId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + SESSION_IDLE_DAYS * 86_400_000);
    const absoluteExpiresAt = new Date(Date.now() + SESSION_ABSOLUTE_DAYS * 86_400_000);
    await sql`insert into messaging.visitor_sessions(
      id,organization_id,channel_connection_id,contact_identity_id,credential_digest,expires_at,absolute_expires_at
    ) values (${sessionId},${input.organizationId},${connectionId},${identity.rows[0]!.id},
      ${credentialDigest(input.digestKey, sessionId, secret)},${expiresAt},${absoluteExpiresAt})`.execute(tx);
    const conversationId = await createOrResumeConversation(tx, {
      organizationId: input.organizationId,
      connectionId,
      contactId: contact.rows[0]!.id,
      contactIdentityId: identity.rows[0]!.id,
      ...(context ? { context } : {}),
    });
    return {
      auth: {
        sessionId,
        organizationId: input.organizationId,
        connectionId,
        contactId: contact.rows[0]!.id,
        contactIdentityId: identity.rows[0]!.id,
        customerId: null,
        expiresAt,
      } satisfies VisitorCredentialContext,
      conversationId,
    };
  });
  return {
    credential: `${issued.auth.sessionId}.${secret}`,
    session: sessionView(issued.auth),
    conversation: await getVisitorConversation(db, issued.auth, issued.conversationId),
    created: true,
  };
}

export async function getVisitorConversation(
  db: Db,
  visitor: VisitorCredentialContext,
  conversationId?: string,
): Promise<StorefrontConversationView> {
  const result = await sql<{
    id: string;
    status: StorefrontConversationView['status'];
    last_message_sequence: string;
    last_read_sequence: string;
    capability_snapshot: Record<string, unknown>;
    created_at: Date;
    updated_at: Date;
    context_type: StorefrontConversationContext['pageType'] | null;
    url_path: string | null;
    product_id: string | null;
    variant_id: string | null;
    product_title: string | null;
    context_created_at: Date | null;
  }>`select c.id,c.status,c.last_message_sequence::text,coalesce(rc.last_read_sequence,0)::text last_read_sequence,
      cc.capability_snapshot,c.created_at,c.updated_at,ctx.context_type,ctx.url_path,ctx.product_id,ctx.variant_id,ctx.product_title,ctx.created_at context_created_at
      from messaging.conversations c
      join messaging.channel_connections cc on cc.organization_id=c.organization_id and cc.id=c.channel_connection_id
      left join messaging.conversation_read_cursors rc on rc.organization_id=c.organization_id and rc.conversation_id=c.id
        and rc.reader_type='CONTACT_IDENTITY' and rc.reader_id=${visitor.contactIdentityId}
      left join lateral (select * from messaging.conversation_context_events e where e.organization_id=c.organization_id and e.conversation_id=c.id order by e.created_at desc,e.id desc limit 1) ctx on true
      where c.organization_id=${visitor.organizationId} and c.channel_connection_id=${visitor.connectionId}
        and c.contact_identity_id=${visitor.contactIdentityId}
        and (${conversationId ?? null}::uuid is null or c.id=${conversationId ?? null}::uuid)
        and (${conversationId ? true : false} or c.status in ('NEW','OPEN','PENDING','RESOLVED'))
      order by c.created_at desc limit 1`.execute(db);
  const row = result.rows[0];
  if (!row) throw new MessagingDomainError('CONVERSATION_NOT_FOUND', 'Conversation was not found.');
  return {
    id: row.id,
    status: row.status,
    lastMessageSequence: row.last_message_sequence,
    lastReadSequence: row.last_read_sequence,
    capabilities: {
      text: row.capability_snapshot.text !== false,
      attachments: row.capability_snapshot.attachments === true,
      replies: row.capability_snapshot.replies !== false,
      readReceipts: row.capability_snapshot.readReceipts === true,
      maximumTextLength:
        typeof row.capability_snapshot.maximumTextLength === 'number'
          ? row.capability_snapshot.maximumTextLength
          : 10_000,
    },
    context:
      row.context_type && row.url_path && row.context_created_at
        ? {
            pageType: row.context_type,
            path: row.url_path,
            productId: row.product_id,
            variantId: row.variant_id,
            productTitle: row.product_title,
            capturedAt: row.context_created_at.toISOString(),
          }
        : null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export async function startVisitorConversation(
  db: Db,
  visitor: VisitorCredentialContext,
  context?: StorefrontContextInput,
): Promise<StorefrontConversationView> {
  const validated = await validateContext(db, visitor.organizationId, context);
  const conversationId = await db.transaction().execute((tx) =>
    createOrResumeConversation(tx, { ...visitor, ...(validated ? { context: validated } : {}) }),
  );
  return getVisitorConversation(db, visitor, conversationId);
}

export async function reopenVisitorConversation(
  db: Db,
  input: { visitor: VisitorCredentialContext; conversationId: string },
): Promise<StorefrontConversationView> {
  const current = await getVisitorConversation(db, input.visitor, input.conversationId);
  if (current.status === 'CLOSED')
    throw new MessagingDomainError(
      'CONVERSATION_CLOSED',
      'Closed conversations cannot be reopened; start a new conversation.',
    );
  if (current.status === 'RESOLVED') {
    await db.transaction().execute(async (tx) => {
      const updated = await sql<{ version: string }>`update messaging.conversations set status='OPEN',resolved_at=null,
        updated_at=now(),version=version+1 where organization_id=${input.visitor.organizationId}
          and id=${input.conversationId} and contact_identity_id=${input.visitor.contactIdentityId}
          and status='RESOLVED' returning version::text`.execute(tx);
      if (updated.rows[0])
        await appendRealtimeEvent(tx as unknown as Db, {
          organizationId: input.visitor.organizationId,
          audienceType: 'ORGANIZATION',
          conversationId: input.conversationId,
          eventType: 'messaging.conversation.status_changed.v1',
          aggregateId: input.conversationId,
          aggregateVersion: updated.rows[0].version,
          payload: {
            conversationId: input.conversationId,
            from: 'RESOLVED',
            to: 'OPEN',
            version: updated.rows[0].version,
          },
        });
    });
  }
  return getVisitorConversation(db, input.visitor, input.conversationId);
}

export async function listVisitorMessages(
  db: Db,
  input: {
    visitor: VisitorCredentialContext;
    conversationId: string;
    before?: string;
    limit?: number;
  },
): Promise<CursorPage<MessageView>> {
  await getVisitorConversation(db, input.visitor, input.conversationId);
  const page = await listMessages(db, {
    organizationId: input.visitor.organizationId,
    conversationId: input.conversationId,
    membershipId: input.visitor.contactIdentityId,
    access: 'ALL',
    ...(input.before ? { before: input.before } : {}),
    ...(input.limit ? { limit: input.limit } : {}),
  });
  return { ...page, data: page.data.map(withStorefrontAttachmentPaths) };
}

function withStorefrontAttachmentPaths(message: MessageView): MessageView {
  return {
    ...message,
    attachments: message.attachments.map((attachment) => ({
      ...attachment,
      downloadPath:
        attachment.securityStatus === 'AVAILABLE'
          ? `/api/storefront/v1/chat/attachments/${attachment.id}`
          : null,
    })),
  };
}

export async function sendVisitorMessage(
  db: Db,
  input: {
    visitor: VisitorCredentialContext;
    conversationId: string;
    idempotencyKey: string;
    clientMessageId: string;
    text?: string;
    attachmentIds?: readonly string[];
    context?: StorefrontContextInput;
  },
): Promise<{ message: MessageView; replayed: boolean }> {
  const conversation = await getVisitorConversation(db, input.visitor, input.conversationId);
  if (conversation.status === 'CLOSED')
    throw new MessagingDomainError('CONVERSATION_CLOSED', 'Closed conversations cannot receive messages.');
  if (input.context) {
    const validated = await validateContext(db, input.visitor.organizationId, input.context);
    await db.transaction().execute((tx) =>
      appendContext(tx, {
        organizationId: input.visitor.organizationId,
        conversationId: input.conversationId,
        contactIdentityId: input.visitor.contactIdentityId,
        ...(validated ? { context: validated } : {}),
      }),
    );
  }
  const accepted = await acceptInboundMessage(db, {
    organizationId: input.visitor.organizationId,
    conversationId: input.conversationId,
    contactIdentityId: input.visitor.contactIdentityId,
    idempotencyKey: input.idempotencyKey,
    externalMessageId: input.clientMessageId,
    ...(input.text !== undefined ? { text: input.text } : {}),
    ...(input.attachmentIds ? { attachmentIds: input.attachmentIds } : {}),
  });
  return { ...accepted, message: withStorefrontAttachmentPaths(accepted.message) };
}

export async function markVisitorConversationRead(
  db: Db,
  input: {
    visitor: VisitorCredentialContext;
    conversationId: string;
    lastReadSequence: string;
  },
): Promise<{ lastReadSequence: string }> {
  if (!/^\d+$/.test(input.lastReadSequence))
    throw new MessagingDomainError('VALIDATION_FAILED', 'Read sequence is invalid.');
  await getVisitorConversation(db, input.visitor, input.conversationId);
  return db.transaction().execute(async (tx) => {
    const current = await sql<{ last_message_sequence: string; version: string }>`select last_message_sequence::text,version::text
      from messaging.conversations where organization_id=${input.visitor.organizationId} and id=${input.conversationId} for update`.execute(tx);
    const bounded = String(
      BigInt(input.lastReadSequence) < BigInt(current.rows[0]!.last_message_sequence)
        ? BigInt(input.lastReadSequence)
        : BigInt(current.rows[0]!.last_message_sequence),
    );
    await sql`insert into messaging.conversation_read_cursors(organization_id,conversation_id,reader_type,reader_id,last_read_sequence)
      values(${input.visitor.organizationId},${input.conversationId},'CONTACT_IDENTITY',${input.visitor.contactIdentityId},${bounded}::bigint)
      on conflict(organization_id,conversation_id,reader_type,reader_id) do update set
        last_read_sequence=greatest(messaging.conversation_read_cursors.last_read_sequence,excluded.last_read_sequence),updated_at=now()`.execute(tx);
    const changed = await sql<{ id: string; sequence: string }>`update messaging.messages set delivery_state='READ',read_at=coalesce(read_at,now()),
      delivered_at=coalesce(delivered_at,now()),updated_at=now()
      where organization_id=${input.visitor.organizationId} and conversation_id=${input.conversationId}
        and direction='OUTBOUND' and sequence<=${bounded}::bigint and delivery_state in ('SENT','DELIVERED')
      returning id,sequence::text`.execute(tx);
    await appendRealtimeEvent(tx as unknown as Db, {
      organizationId: input.visitor.organizationId,
      audienceType: 'ORGANIZATION',
      conversationId: input.conversationId,
      eventType: 'messaging.read_cursor.advanced.v1',
      aggregateId: input.conversationId,
      aggregateVersion: current.rows[0]!.version,
      payload: { conversationId: input.conversationId, readerScope: 'CONTACT_IDENTITY', sequence: bounded },
    });
    for (const message of changed.rows)
      await appendRealtimeEvent(tx as unknown as Db, {
        organizationId: input.visitor.organizationId,
        audienceType: 'ORGANIZATION',
        conversationId: input.conversationId,
        eventType: 'messaging.message.delivery_changed.v1',
        aggregateId: message.id,
        aggregateVersion: message.sequence,
        payload: { conversationId: input.conversationId, messageId: message.id, sequence: message.sequence, state: 'READ' },
      });
    return { lastReadSequence: bounded };
  });
}

const VISITOR_EVENT_TYPES = [
  'messaging.conversation.created.v1',
  'messaging.conversation.status_changed.v1',
  'messaging.message.created.v1',
  'messaging.message.delivery_changed.v1',
  'messaging.read_cursor.advanced.v1',
] as const;

export async function listVisitorRealtimeEvents(
  db: Db,
  input: { visitor: VisitorCredentialContext; after?: string; limit?: number },
): Promise<readonly MessagingEvent[]> {
  const after = input.after ?? '0';
  if (!/^\d+$/.test(after)) throw new MessagingDomainError('VALIDATION_FAILED', 'Event cursor is invalid.');
  const stream = await sql<{ retained_from_sequence: string }>`select retained_from_sequence::text
    from messaging.realtime_streams where organization_id=${input.visitor.organizationId}`.execute(db);
  const retained = stream.rows[0]?.retained_from_sequence ?? '1';
  if (BigInt(after) > 0n && BigInt(after) < BigInt(retained) - 1n)
    throw new MessagingDomainError('EVENT_CURSOR_EXPIRED', 'Event cursor is outside the retention window.');
  const result = await sql<{
    event_id: string;
    stream_sequence: string;
    event_type: string;
    conversation_id: string;
    aggregate_id: string;
    aggregate_version: string;
    payload: Record<string, unknown>;
    created_at: Date;
  }>`select e.event_id,e.stream_sequence::text,e.event_type,e.conversation_id,e.aggregate_id,e.aggregate_version::text,e.payload,e.created_at
      from messaging.realtime_events e join messaging.conversations c on c.organization_id=e.organization_id and c.id=e.conversation_id
      where e.organization_id=${input.visitor.organizationId} and e.stream_sequence>${after}::bigint and e.expires_at>now()
        and c.channel_connection_id=${input.visitor.connectionId} and c.contact_identity_id=${input.visitor.contactIdentityId}
        and (e.audience_type in ('ORGANIZATION','CONVERSATION') or
          (e.audience_type='VISITOR' and e.audience_id in (${input.visitor.contactIdentityId},${input.visitor.sessionId})))
        and e.event_type in (${sql.join(VISITOR_EVENT_TYPES.map((type) => sql`${type}`))})
      order by e.stream_sequence limit ${Math.min(input.limit ?? 100, 200)}`.execute(db);
  return result.rows.map((row) => ({
    eventId: row.event_id,
    cursor: row.stream_sequence,
    type: row.event_type,
    conversationId: row.conversation_id,
    aggregateId: row.aggregate_id,
    aggregateVersion: row.aggregate_version,
    payload: row.payload,
    createdAt: row.created_at.toISOString(),
  }));
}

export async function updateVisitorContact(
  db: Db,
  input: {
    visitor: VisitorCredentialContext;
    name?: string;
    email?: string;
    phone?: string;
    emailConsent?: boolean;
    phoneConsent?: boolean;
  },
): Promise<{ updated: true }> {
  const name = input.name?.trim();
  const email = input.email?.trim().toLowerCase();
  const phone = input.phone?.trim();
  if (name && name.length > 160) throw new MessagingDomainError('VALIDATION_FAILED', 'Name is too long.');
  if (email && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254))
    throw new MessagingDomainError('VALIDATION_FAILED', 'Email address is invalid.');
  if (phone && (!/^\+?[0-9]{7,15}$/.test(phone) || phone.length > 16))
    throw new MessagingDomainError('VALIDATION_FAILED', 'Phone number is invalid.');
  await db.transaction().execute(async (tx) => {
    if (name)
      await sql`update messaging.contacts set display_name=${name},updated_at=now(),version=version+1
        where organization_id=${input.visitor.organizationId} and id=${input.visitor.contactId}`.execute(tx);
    await sql`update messaging.contact_identities set display_name=coalesce(${name ?? null},display_name),
      profile_metadata=profile_metadata || ${JSON.stringify({ ...(email ? { unverifiedEmail: email, emailConsent: input.emailConsent === true } : {}), ...(phone ? { unverifiedPhone: phone, phoneConsent: input.phoneConsent === true } : {}) })}::jsonb,
      updated_at=now(),last_seen_at=now() where organization_id=${input.visitor.organizationId} and id=${input.visitor.contactIdentityId}`.execute(tx);
  });
  return { updated: true };
}

export async function linkVisitorToAuthenticatedUser(
  db: Db,
  input: { visitor: VisitorCredentialContext; userId: string; digestKey: Buffer },
): Promise<{ credential: string; session: StorefrontVisitorSessionView }> {
  const account = await sql<{ customer_id: string }>`select coalesce(a.canonical_customer_id,ca.customer_id) customer_id
    from customers.customer_accounts ca left join customers.customer_aliases a
      on a.organization_id=ca.organization_id and a.alias_customer_id=ca.customer_id
    where ca.organization_id=${input.visitor.organizationId} and ca.user_id=${input.userId} and ca.status='ACTIVE' limit 1`.execute(db);
  if (!account.rows[0]) return { credential: '', session: sessionView(input.visitor) };
  const customerId = account.rows[0].customer_id;
  if (input.visitor.customerId === customerId)
    return { credential: '', session: sessionView(input.visitor) };
  const secret = randomBytes(32).toString('base64url');
  const nextId = crypto.randomUUID();
  const rotated = await db.transaction().execute(async (tx) => {
    const session = await sql<{ status: string }>`select status from messaging.visitor_sessions
      where organization_id=${input.visitor.organizationId} and id=${input.visitor.sessionId}
      for update`.execute(tx);
    if (session.rows[0]?.status !== 'ACTIVE')
      throw new MessagingDomainError('SESSION_EXPIRED', 'Visitor session has expired.');
    const current = await sql<{ customer_id: string | null }>`select customer_id from messaging.contacts
      where organization_id=${input.visitor.organizationId} and id=${input.visitor.contactId} for update`.execute(tx);
    if (current.rows[0]?.customer_id && current.rows[0].customer_id !== customerId) {
      await sql`update messaging.contacts set link_status='DISPUTED',updated_at=now(),version=version+1
        where organization_id=${input.visitor.organizationId} and id=${input.visitor.contactId}`.execute(tx);
    } else if (current.rows[0]?.customer_id !== customerId) {
      await sql`update messaging.contacts set customer_id=${customerId},link_status='LINKED',linked_at=now(),linked_by_actor_id=${input.userId},updated_at=now(),version=version+1
        where organization_id=${input.visitor.organizationId} and id=${input.visitor.contactId}`.execute(tx);
      await sql`insert into messaging.contact_customer_link_events(organization_id,contact_id,customer_id,action,method,actor_type,actor_id)
        values(${input.visitor.organizationId},${input.visitor.contactId},${customerId},'LINKED','AUTHENTICATED_ACCOUNT','USER',${input.userId})`.execute(tx);
    }
    const expiresAt = new Date(Date.now() + SESSION_IDLE_DAYS * 86_400_000);
    const absoluteExpiresAt = new Date(Date.now() + SESSION_ABSOLUTE_DAYS * 86_400_000);
    await sql`insert into messaging.visitor_sessions(id,organization_id,channel_connection_id,contact_identity_id,credential_digest,expires_at,absolute_expires_at)
      values(${nextId},${input.visitor.organizationId},${input.visitor.connectionId},${input.visitor.contactIdentityId},${credentialDigest(input.digestKey, nextId, secret)},${expiresAt},${absoluteExpiresAt})`.execute(tx);
    await sql`update messaging.visitor_sessions set status='ROTATED',rotated_to_session_id=${nextId},revoked_at=now(),revocation_reason='AUTHENTICATED_CUSTOMER_LINK'
      where organization_id=${input.visitor.organizationId} and id=${input.visitor.sessionId} and status='ACTIVE'`.execute(tx);
    return { expiresAt, linked: current.rows[0]?.customer_id === customerId || !current.rows[0]?.customer_id };
  });
  return {
    credential: `${nextId}.${secret}`,
    session: {
      id: nextId,
      status: 'ACTIVE',
      expiresAt: rotated.expiresAt.toISOString(),
      isCustomerLinked: rotated.linked,
    },
  };
}

export async function revokeVisitorSession(
  db: Db,
  visitor: VisitorCredentialContext,
): Promise<void> {
  await sql`update messaging.visitor_sessions set status='REVOKED',revoked_at=now(),revocation_reason='VISITOR_ENDED'
    where organization_id=${visitor.organizationId} and id=${visitor.sessionId} and status='ACTIVE'`.execute(db);
}

export async function refreshWebsiteAttachmentUploadStatus(
  db: Db,
  input: { visitor: VisitorCredentialContext; uploadId: string },
) {
  const result = await sql<{
    id: string;
    media_asset_id: string;
    conversation_id: string;
    status: string;
    asset_status: string;
    file_name: string;
    mime_type: (typeof WEBSITE_ATTACHMENT_MIME_TYPES)[number];
    byte_size: string;
    expires_at: Date;
  }>`select u.id,u.media_asset_id,u.conversation_id,u.status,a.status asset_status,u.file_name,u.mime_type,u.byte_size::text,u.expires_at
      from messaging.website_attachment_uploads u join media.media_assets a on a.organization_id=u.organization_id and a.id=u.media_asset_id
      where u.organization_id=${input.visitor.organizationId} and u.id=${input.uploadId}
        and u.contact_identity_id=${input.visitor.contactIdentityId}`.execute(db);
  const row = result.rows[0];
  if (!row) throw new MessagingDomainError('CONVERSATION_NOT_FOUND', 'Upload was not found.');
  const status =
    row.status === 'ATTACHED' || row.status === 'EXPIRED'
      ? row.status
      : row.asset_status === 'READY'
        ? 'AVAILABLE'
        : ['FAILED', 'QUARANTINED', 'TRASHED', 'PURGING'].includes(row.asset_status)
          ? 'REJECTED'
          : row.status === 'PENDING'
            ? 'PENDING'
            : 'PROCESSING';
  if (status !== row.status)
    await sql`update messaging.website_attachment_uploads set status=${status},updated_at=now()
      where organization_id=${input.visitor.organizationId} and id=${input.uploadId}`.execute(db);
  return {
    id: row.id,
    assetId: row.media_asset_id,
    conversationId: row.conversation_id,
    status,
    fileName: row.file_name,
    mimeType: row.mime_type,
    byteSize: Number(row.byte_size),
    expiresAt: row.expires_at.toISOString(),
  };
}

export async function registerWebsiteAttachmentUpload(
  db: Db,
  input: {
    visitor: VisitorCredentialContext;
    conversationId: string;
    mediaAssetId: string;
    mediaUploadSessionId: string;
    fileName: string;
    mimeType: (typeof WEBSITE_ATTACHMENT_MIME_TYPES)[number];
    byteSize: number;
    sha256: string;
    expiresAt: Date;
  },
): Promise<string> {
  await getVisitorConversation(db, input.visitor, input.conversationId);
  const result = await sql<{ id: string }>`insert into messaging.website_attachment_uploads(
      organization_id,conversation_id,contact_identity_id,media_asset_id,media_upload_session_id,
      file_name,mime_type,byte_size,sha256,expires_at
    ) values (${input.visitor.organizationId},${input.conversationId},${input.visitor.contactIdentityId},
      ${input.mediaAssetId},${input.mediaUploadSessionId},${input.fileName},${input.mimeType},${input.byteSize},${input.sha256},${input.expiresAt})
    returning id`.execute(db);
  return result.rows[0]!.id;
}

export async function getWebsiteAttachmentUploadAuthorization(
  db: Db,
  input: { visitor: VisitorCredentialContext; uploadId: string },
): Promise<{
  id: string;
  mediaUploadSessionId: string;
  expectedSha256: string;
  status: string;
} | undefined> {
  const result = await sql<{
    id: string;
    media_upload_session_id: string;
    sha256: string;
    status: string;
  }>`select id,media_upload_session_id,sha256,status from messaging.website_attachment_uploads
    where organization_id=${input.visitor.organizationId} and id=${input.uploadId}
      and contact_identity_id=${input.visitor.contactIdentityId}`.execute(db);
  const row = result.rows[0];
  return row
    ? {
        id: row.id,
        mediaUploadSessionId: row.media_upload_session_id,
        expectedSha256: row.sha256,
        status: row.status,
      }
    : undefined;
}

export async function markWebsiteAttachmentProcessing(
  db: Db,
  input: { visitor: VisitorCredentialContext; uploadId: string },
): Promise<void> {
  await sql`update messaging.website_attachment_uploads set status='PROCESSING',updated_at=now()
    where organization_id=${input.visitor.organizationId} and id=${input.uploadId}
      and contact_identity_id=${input.visitor.contactIdentityId} and status='PENDING'`.execute(db);
}

export async function authorizeVisitorAttachment(
  db: Db,
  input: { visitor: VisitorCredentialContext; attachmentId: string },
) {
  const result = await sql<{
    asset_id: string;
    original_filename: string;
    provider: string;
    bucket: string;
    object_key: string;
    mime_type: string;
  }>`select a.media_asset_id asset_id,ma.original_filename,r.storage_provider provider,r.bucket_name bucket,
      r.object_key,r.mime_type from messaging.message_attachments a
      join messaging.messages m on m.organization_id=a.organization_id and m.id=a.message_id
      join messaging.conversations c on c.organization_id=m.organization_id and c.id=m.conversation_id
      join media.media_assets ma on ma.organization_id=a.organization_id and ma.id=a.media_asset_id
      join media.media_renditions r on r.organization_id=ma.organization_id and r.asset_id=ma.id and r.rendition_key='zoom'
      where a.organization_id=${input.visitor.organizationId} and a.id=${input.attachmentId}
        and a.security_status='AVAILABLE' and ma.status='READY'
        and c.channel_connection_id=${input.visitor.connectionId} and c.contact_identity_id=${input.visitor.contactIdentityId}
      order by r.created_at desc limit 1`.execute(db);
  const row = result.rows[0];
  if (!row) throw new MessagingDomainError('CONVERSATION_NOT_FOUND', 'Attachment was not found.');
  return {
    assetId: row.asset_id,
    originalFilename: row.original_filename,
    provider: row.provider,
    bucket: row.bucket,
    objectKey: row.object_key,
    mimeType: row.mime_type,
  };
}

export async function authorizeStaffMessagingAttachment(
  db: Db,
  input: {
    organizationId: string;
    membershipId: string;
    access: 'ALL' | 'ASSIGNED';
    attachmentId: string;
  },
) {
  const target = await sql<{ conversation_id: string }>`select m.conversation_id from messaging.message_attachments a
    join messaging.messages m on m.organization_id=a.organization_id and m.id=a.message_id
    where a.organization_id=${input.organizationId} and a.id=${input.attachmentId}`.execute(db);
  if (!target.rows[0])
    throw new MessagingDomainError('CONVERSATION_NOT_FOUND', 'Attachment was not found.');
  await getConversation(db, {
    organizationId: input.organizationId,
    conversationId: target.rows[0]!.conversation_id,
    membershipId: input.membershipId,
    access: input.access,
  });
  const result = await sql<{
    original_filename: string;
    provider: string;
    bucket: string;
    object_key: string;
    mime_type: string;
  }>`select ma.original_filename,r.storage_provider provider,r.bucket_name bucket,r.object_key,r.mime_type
    from messaging.message_attachments a
    join media.media_assets ma on ma.organization_id=a.organization_id and ma.id=a.media_asset_id
    join media.media_renditions r on r.organization_id=ma.organization_id and r.asset_id=ma.id and r.rendition_key='zoom'
    where a.organization_id=${input.organizationId} and a.id=${input.attachmentId}
      and a.security_status='AVAILABLE' and ma.status='READY'
    order by r.created_at desc limit 1`.execute(db);
  const row = result.rows[0];
  if (!row) throw new MessagingDomainError('CONVERSATION_NOT_FOUND', 'Attachment was not found.');
  return {
    originalFilename: row.original_filename,
    provider: row.provider,
    bucket: row.bucket,
    objectKey: row.object_key,
    mimeType: row.mime_type,
  };
}

export async function purgeExpiredWebsiteVisitorResources(db: Db): Promise<number> {
  const result = await sql<{ media_asset_id: string }>`with expired as (
      update messaging.website_attachment_uploads set status='EXPIRED',updated_at=now()
      where status in ('PENDING','PROCESSING','AVAILABLE') and expires_at<=now()
      returning organization_id,media_asset_id
    ), trashed as (
      update media.media_assets a set status='TRASHED',trashed_at=now(),purge_after=now()+interval '1 day',updated_at=now(),version=version+1
      from expired e where a.organization_id=e.organization_id and a.id=e.media_asset_id
        and not exists(select 1 from messaging.message_attachments ma where ma.organization_id=a.organization_id and ma.media_asset_id=a.id)
      returning a.id media_asset_id
    ) select media_asset_id from trashed`.execute(db);
  await sql`update messaging.visitor_sessions set status='EXPIRED'
    where status='ACTIVE' and (expires_at<=now() or absolute_expires_at<=now())`.execute(db);
  return result.rows.length;
}
