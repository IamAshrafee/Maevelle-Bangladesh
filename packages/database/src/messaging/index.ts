import { createHash } from 'node:crypto';
import { sql, type Kysely } from 'kysely';

import type {
  ChannelCapabilities,
  ChannelKind,
  ConversationDetail,
  ConversationStatus,
  ConversationSummary,
  CursorPage,
  DeliveryOutcome,
  MessageView,
  MessagingEvent,
} from '@maevelle/contracts/messaging';
import type { DatabaseSchema } from '../index.js';
import { appendAuditEvent, claimIdempotencyRecord } from '../platform.js';

type Db = Kysely<DatabaseSchema>;

export type MessagingErrorCode =
  | 'CONVERSATION_NOT_FOUND'
  | 'CONVERSATION_CLOSED'
  | 'CHANNEL_CAPABILITY_UNSUPPORTED'
  | 'CONNECTION_UNAVAILABLE'
  | 'IDEMPOTENCY_IN_PROGRESS'
  | 'IDEMPOTENCY_KEY_REUSED'
  | 'STALE_VERSION'
  | 'ASSIGNMENT_CONFLICT'
  | 'EVENT_CURSOR_EXPIRED'
  | 'VALIDATION_FAILED';

export class MessagingDomainError extends Error {
  public constructor(
    public readonly code: MessagingErrorCode,
    message: string,
    public readonly details?: Readonly<Record<string, unknown>>,
  ) {
    super(message);
    this.name = 'MessagingDomainError';
  }
}

export interface MessagingActorContext {
  readonly organizationId: string;
  readonly actorId: string;
  readonly membershipId: string;
  readonly capabilities: readonly string[];
}

export type ConversationAccess = 'ALL' | 'ASSIGNED';

const defaultCapabilities: ChannelCapabilities = {
  text: true,
  attachments: false,
  replies: true,
  readReceipts: false,
  maximumTextLength: 10_000,
};

function encodeCursor(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function decodeCursor<T>(value: string | undefined): T | undefined {
  if (!value) return undefined;
  try {
    return JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as T;
  } catch {
    throw new MessagingDomainError('VALIDATION_FAILED', 'The cursor is invalid.');
  }
}

function fingerprint(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function iso(value: Date | string | null): string | null {
  return value === null ? null : new Date(value).toISOString();
}

interface ConversationRow {
  id: string;
  channel_kind: ChannelKind;
  channel_connection_id: string;
  channel_name: string;
  capability_snapshot: Record<string, unknown>;
  contact_id: string;
  contact_name: string | null;
  customer_id: string | null;
  status: ConversationStatus;
  priority: ConversationSummary['priority'];
  assignee_membership_id: string | null;
  assignee_name: string | null;
  last_message_sequence: string;
  last_message_text: string | null;
  last_message_direction: ConversationSummary['lastMessage'] extends infer T
    ? T extends { direction: infer D }
      ? D
      : never
    : never;
  last_message_created_at: Date | null;
  unread_count: string;
  version: string;
  subject: string | null;
  created_at: Date;
  updated_at: Date;
  reply_eligible_until: Date | null;
}

function capabilities(snapshot: Record<string, unknown>): ChannelCapabilities {
  return {
    text: snapshot.text !== false,
    attachments: snapshot.attachments === true,
    replies: snapshot.replies !== false,
    readReceipts: snapshot.readReceipts === true,
    maximumTextLength:
      typeof snapshot.maximumTextLength === 'number' ? snapshot.maximumTextLength : 10_000,
  };
}

function mapConversation(row: ConversationRow): ConversationDetail {
  return {
    id: row.id,
    channel: {
      kind: row.channel_kind,
      connectionId: row.channel_connection_id,
      name: row.channel_name,
    },
    contact: { id: row.contact_id, displayName: row.contact_name, customerId: row.customer_id },
    status: row.status,
    priority: row.priority,
    assignee: row.assignee_membership_id
      ? {
          membershipId: row.assignee_membership_id,
          displayName: row.assignee_name ?? 'Team member',
        }
      : null,
    lastMessage:
      Number(row.last_message_sequence) > 0 &&
      row.last_message_created_at &&
      row.last_message_direction
        ? {
            sequence: row.last_message_sequence,
            preview: row.last_message_text?.slice(0, 160) ?? '',
            direction: row.last_message_direction,
            createdAt: row.last_message_created_at.toISOString(),
          }
        : null,
    unreadCount: Number(row.unread_count),
    capabilities: capabilities(row.capability_snapshot),
    version: row.version,
    subject: row.subject,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    replyEligibleUntil: iso(row.reply_eligible_until),
  };
}

const conversationSelect = sql.raw(`
  select c.id, cc.channel_kind, c.channel_connection_id, cc.display_name channel_name,
    cc.capability_snapshot, c.contact_id, ct.display_name contact_name, ct.customer_id,
    c.status, c.priority, c.assignee_membership_id, am.display_name assignee_name,
    c.last_message_sequence::text, lm.text_body last_message_text,
    lm.direction last_message_direction, lm.created_at last_message_created_at,
    (select count(*)::text from messaging.messages unread where unread.organization_id=c.organization_id and unread.conversation_id=c.id and unread.direction='INBOUND' and unread.sequence>coalesce(rc.last_read_sequence,0)) unread_count,
    c.version::text, c.subject, c.created_at, c.updated_at, c.reply_eligible_until
  from messaging.conversations c
  join messaging.channel_connections cc on cc.organization_id=c.organization_id and cc.id=c.channel_connection_id
  join messaging.contacts ct on ct.organization_id=c.organization_id and ct.id=c.contact_id
  left join iam.organization_memberships am on am.organization_id=c.organization_id and am.id=c.assignee_membership_id
  left join messaging.messages lm on lm.organization_id=c.organization_id and lm.id=c.last_message_id
  left join messaging.conversation_read_cursors rc on rc.organization_id=c.organization_id and rc.conversation_id=c.id
    and rc.reader_type='MEMBERSHIP' and rc.reader_id=`);

export async function createChannelConnection(
  db: Db,
  input: {
    organizationId: string;
    channelKind: ChannelKind;
    displayName: string;
    status?: 'DRAFT' | 'ACTIVE' | 'DEGRADED' | 'DISCONNECTED' | 'DISABLED';
    capabilities?: Partial<ChannelCapabilities>;
  },
): Promise<string> {
  const result = await sql<{
    id: string;
  }>`insert into messaging.channel_connections(organization_id,channel_kind,display_name,status,capability_snapshot)
    values(${input.organizationId},${input.channelKind},${input.displayName},${input.status ?? 'DRAFT'},${JSON.stringify({ ...defaultCapabilities, ...input.capabilities })}::jsonb) returning id`.execute(
    db,
  );
  return result.rows[0]!.id;
}

export async function createContactIdentity(
  db: Db,
  input: {
    organizationId: string;
    channelConnectionId: string;
    channelKind: ChannelKind;
    externalSubjectId: string;
    displayName?: string;
  },
): Promise<{ contactId: string; identityId: string }> {
  return db.transaction().execute(async (tx) => {
    const contact = await sql<{
      id: string;
    }>`insert into messaging.contacts(organization_id,display_name) values(${input.organizationId},${input.displayName ?? null}) returning id`.execute(
      tx,
    );
    const contactId = contact.rows[0]!.id;
    const identity = await sql<{
      id: string;
    }>`insert into messaging.contact_identities(organization_id,contact_id,channel_kind,channel_connection_id,external_subject_id,display_name,verification_status)
      values(${input.organizationId},${contactId},${input.channelKind},${input.channelConnectionId},${input.externalSubjectId},${input.displayName ?? null},'CHANNEL_ASSERTED') returning id`.execute(
      tx,
    );
    return { contactId, identityId: identity.rows[0]!.id };
  });
}

export async function createConversation(
  db: Db,
  input: {
    organizationId: string;
    channelConnectionId: string;
    contactId: string;
    contactIdentityId: string;
    subject?: string;
  },
): Promise<string> {
  return db.transaction().execute(async (tx) => {
    const created = await sql<{
      id: string;
      version: string;
    }>`insert into messaging.conversations(organization_id,channel_connection_id,contact_id,contact_identity_id,subject)
      values(${input.organizationId},${input.channelConnectionId},${input.contactId},${input.contactIdentityId},${input.subject ?? null}) returning id,version::text`.execute(
      tx,
    );
    const row = created.rows[0]!;
    await appendRealtimeEvent(tx as Db, {
      organizationId: input.organizationId,
      audienceType: 'ORGANIZATION',
      conversationId: row.id,
      eventType: 'messaging.conversation.created.v1',
      aggregateId: row.id,
      aggregateVersion: row.version,
      payload: { conversationId: row.id, version: row.version },
    });
    await sql`insert into platform.outbox_events(organization_id,event_type,event_version,aggregate_type,aggregate_id,aggregate_version,payload,occurred_at) values(${input.organizationId},'messaging.conversation.created.v1',1,'messaging.conversation',${row.id},${row.version}::bigint,${JSON.stringify({ conversationId: row.id, version: row.version })}::jsonb,now())`.execute(
      tx,
    );
    return row.id;
  });
}

function accessSql(access: ConversationAccess, membershipId: string) {
  return access === 'ALL'
    ? sql`true`
    : sql`(c.assignee_membership_id is null or c.assignee_membership_id=${membershipId}::uuid)`;
}

async function selectConversation(
  db: Db,
  organizationId: string,
  conversationId: string,
  membershipId: string,
  access: ConversationAccess,
): Promise<ConversationDetail | undefined> {
  const allowed = accessSql(access, membershipId);
  const result = await sql<ConversationRow>`${conversationSelect}${membershipId}::uuid
    where c.organization_id=${organizationId}::uuid and c.id=${conversationId}::uuid and ${allowed}`.execute(
    db,
  );
  return result.rows[0] ? mapConversation(result.rows[0]) : undefined;
}

export async function getConversation(
  db: Db,
  input: {
    organizationId: string;
    conversationId: string;
    membershipId: string;
    access: ConversationAccess;
  },
): Promise<ConversationDetail> {
  const result = await selectConversation(
    db,
    input.organizationId,
    input.conversationId,
    input.membershipId,
    input.access,
  );
  if (!result)
    throw new MessagingDomainError('CONVERSATION_NOT_FOUND', 'Conversation was not found.');
  return result;
}

export async function listConversations(
  db: Db,
  input: {
    organizationId: string;
    membershipId: string;
    access: ConversationAccess;
    scope?: 'mine' | 'unassigned' | 'all';
    status?: ConversationStatus;
    channelKind?: ChannelKind;
    search?: string;
    sort?: 'newest' | 'oldest';
    cursor?: string;
    limit?: number;
  },
): Promise<CursorPage<ConversationSummary>> {
  const limit = Math.min(Math.max(input.limit ?? 30, 1), 100);
  const cursor = decodeCursor<{ at: string; id: string; sort?: 'newest' | 'oldest' }>(input.cursor);
  const allowed = accessSql(input.access, input.membershipId);
  const scope = input.scope ?? 'all';
  const sort = input.sort ?? 'newest';
  if (cursor?.sort && cursor.sort !== sort)
    throw new MessagingDomainError(
      'VALIDATION_FAILED',
      'The cursor does not match the sort order.',
    );
  const result = await sql<ConversationRow>`${conversationSelect}${input.membershipId}::uuid
    where c.organization_id=${input.organizationId}::uuid and ${allowed}
      and (${input.status ?? null}::text is null or c.status=${input.status ?? null})
      and (${input.channelKind ?? null}::text is null or cc.channel_kind=${input.channelKind ?? null})
      and (${input.search ?? null}::text is null or position(lower(${input.search ?? null}) in lower(coalesce(ct.display_name,'')))>0 or c.id::text=${input.search ?? null})
      and (${scope}='all' or (${scope}='mine' and c.assignee_membership_id=${input.membershipId}::uuid) or (${scope}='unassigned' and c.assignee_membership_id is null))
      and (${cursor?.at ?? null}::timestamptz is null or (${sort}='newest' and (coalesce(c.last_message_at,c.created_at),c.id)<(${cursor?.at ?? null}::timestamptz,${cursor?.id ?? null}::uuid)) or (${sort}='oldest' and (coalesce(c.last_message_at,c.created_at),c.id)>(${cursor?.at ?? null}::timestamptz,${cursor?.id ?? null}::uuid)))
    order by case when ${sort}='newest' then coalesce(c.last_message_at,c.created_at) end desc,case when ${sort}='newest' then c.id end desc,case when ${sort}='oldest' then coalesce(c.last_message_at,c.created_at) end asc,case when ${sort}='oldest' then c.id end asc limit ${limit + 1}`.execute(
    db,
  );
  const hasMore = result.rows.length > limit;
  const rows = result.rows.slice(0, limit);
  const last = rows.at(-1);
  const lastAt = last?.last_message_created_at ?? last?.created_at;
  return {
    data: rows.map(mapConversation),
    pagination: {
      hasMore,
      nextCursor:
        hasMore && last && lastAt
          ? encodeCursor({ at: lastAt.toISOString(), id: last.id, sort })
          : null,
    },
  };
}

interface MessageRow {
  id: string;
  conversation_id: string;
  sequence: string;
  direction: MessageView['direction'];
  sender_type: MessageView['sender']['type'];
  sender_id: string | null;
  sender_name: string | null;
  message_type: MessageView['type'];
  text_body: string | null;
  delivery_state: MessageView['delivery']['state'];
  failure_code: string | null;
  created_at: Date;
  edited_at: Date | null;
  retracted_at: Date | null;
}

function mapMessage(row: MessageRow): MessageView {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    sequence: row.sequence,
    direction: row.direction,
    sender: { type: row.sender_type, id: row.sender_id, name: row.sender_name },
    type: row.message_type,
    text: row.text_body,
    attachments: [],
    delivery: {
      state: row.delivery_state,
      ...(row.failure_code ? { failureCode: row.failure_code } : {}),
      canRetry: row.delivery_state === 'FAILED_TRANSIENT',
    },
    createdAt: row.created_at.toISOString(),
    editedAt: iso(row.edited_at),
    retractedAt: iso(row.retracted_at),
  };
}

async function loadMessage(
  db: Db,
  organizationId: string,
  messageId: string,
): Promise<MessageView> {
  const result =
    await sql<MessageRow>`select m.id,m.conversation_id,m.sequence::text,m.direction,m.sender_type,
    coalesce(m.sender_membership_id,m.sender_contact_identity_id)::text sender_id,coalesce(mem.display_name,ci.display_name) sender_name,
    m.message_type,m.text_body,m.delivery_state,m.failure_code,m.created_at,m.edited_at,m.retracted_at
    from messaging.messages m left join iam.organization_memberships mem on mem.id=m.sender_membership_id
    left join messaging.contact_identities ci on ci.id=m.sender_contact_identity_id
    where m.organization_id=${organizationId}::uuid and m.id=${messageId}::uuid`.execute(db);
  if (!result.rows[0])
    throw new MessagingDomainError('CONVERSATION_NOT_FOUND', 'Message was not found.');
  return mapMessage(result.rows[0]);
}

export async function listMessages(
  db: Db,
  input: {
    organizationId: string;
    conversationId: string;
    membershipId: string;
    access: ConversationAccess;
    before?: string;
    limit?: number;
  },
): Promise<CursorPage<MessageView>> {
  await getConversation(db, input);
  const limit = Math.min(Math.max(input.limit ?? 30, 1), 100);
  const before = decodeCursor<{ sequence: string }>(input.before);
  const result =
    await sql<MessageRow>`select m.id,m.conversation_id,m.sequence::text,m.direction,m.sender_type,coalesce(m.sender_membership_id,m.sender_contact_identity_id)::text sender_id,
    coalesce(mem.display_name,ci.display_name) sender_name,m.message_type,m.text_body,m.delivery_state,m.failure_code,m.created_at,m.edited_at,m.retracted_at
    from messaging.messages m left join iam.organization_memberships mem on mem.id=m.sender_membership_id left join messaging.contact_identities ci on ci.id=m.sender_contact_identity_id
    where m.organization_id=${input.organizationId}::uuid and m.conversation_id=${input.conversationId}::uuid and (${before?.sequence ?? null}::bigint is null or m.sequence<${before?.sequence ?? null}::bigint)
    order by m.sequence desc limit ${limit + 1}`.execute(db);
  const hasMore = result.rows.length > limit;
  const rows = result.rows.slice(0, limit);
  const oldest = rows.at(-1);
  return {
    data: rows.reverse().map(mapMessage),
    pagination: {
      hasMore,
      nextCursor: hasMore && oldest ? encodeCursor({ sequence: oldest.sequence }) : null,
    },
  };
}

export async function appendRealtimeEvent(
  db: Db,
  input: {
    organizationId: string;
    audienceType: 'CONVERSATION' | 'MEMBERSHIP' | 'ORGANIZATION' | 'VISITOR';
    audienceId?: string;
    conversationId?: string;
    eventType: string;
    aggregateId: string;
    aggregateVersion: string | number;
    payload: Record<string, unknown>;
  },
): Promise<MessagingEvent> {
  await sql`insert into messaging.realtime_streams(organization_id) values(${input.organizationId}) on conflict do nothing`.execute(
    db,
  );
  const event = await sql<{ event_id: string; stream_sequence: string; created_at: Date }>`
    with allocated as (
      update messaging.realtime_streams set next_sequence=next_sequence+1,updated_at=now()
      where organization_id=${input.organizationId}
      returning organization_id,(next_sequence-1) stream_sequence
    )
    insert into messaging.realtime_events(organization_id,stream_sequence,audience_type,audience_id,conversation_id,event_type,aggregate_id,aggregate_version,payload)
    select organization_id,stream_sequence,${input.audienceType},${input.audienceId ?? null},${input.conversationId ?? null},${input.eventType},${input.aggregateId},${input.aggregateVersion}::bigint,${JSON.stringify(input.payload)}::jsonb from allocated
    returning event_id,stream_sequence::text,created_at`.execute(db);
  const row = event.rows[0]!;
  return {
    eventId: row.event_id,
    cursor: row.stream_sequence,
    type: input.eventType,
    conversationId: input.conversationId ?? null,
    aggregateId: input.aggregateId,
    aggregateVersion: String(input.aggregateVersion),
    payload: input.payload,
    createdAt: row.created_at.toISOString(),
  };
}

export async function prepareOutboundMessage(
  db: Db,
  input: {
    actor: MessagingActorContext;
    access: ConversationAccess;
    conversationId: string;
    idempotencyKey: string;
    clientMessageId: string;
    text: string;
    replyToMessageId?: string;
    requestId?: string;
  },
): Promise<{ message: MessageView; replayed: boolean }> {
  const text = input.text.trim();
  if (!text || text.length > 10_000)
    throw new MessagingDomainError(
      'VALIDATION_FAILED',
      'Message text must contain 1 to 10,000 characters.',
    );
  try {
    return await db.transaction().execute(async (tx) => {
      const conversation = await getConversation(tx as Db, {
        organizationId: input.actor.organizationId,
        conversationId: input.conversationId,
        membershipId: input.actor.membershipId,
        access: input.access,
      });
      if (conversation.status === 'CLOSED')
        throw new MessagingDomainError(
          'CONVERSATION_CLOSED',
          'Closed conversations cannot receive replies.',
        );
      if (!conversation.capabilities.replies || !conversation.capabilities.text)
        throw new MessagingDomainError(
          'CHANNEL_CAPABILITY_UNSUPPORTED',
          'This channel does not support text replies.',
        );
      const record = await claimIdempotencyRecord(tx, {
        organizationId: input.actor.organizationId,
        principalType: 'USER',
        principalId: input.actor.actorId,
        operationType: 'messaging.message.outbound',
        idempotencyKey: input.idempotencyKey,
        requestFingerprint: fingerprint({
          conversationId: input.conversationId,
          clientMessageId: input.clientMessageId,
          text,
          replyToMessageId: input.replyToMessageId ?? null,
        }),
      });
      if (!record.created) {
        if (record.status === 'IN_PROGRESS')
          throw new MessagingDomainError(
            'IDEMPOTENCY_IN_PROGRESS',
            'The original request is still in progress.',
          );
        const prior = await sql<{
          result_entity_id: string;
        }>`select result_entity_id from platform.idempotency_records where id=${record.id}::uuid`.execute(
          tx,
        );
        return {
          message: await loadMessage(
            tx as Db,
            input.actor.organizationId,
            prior.rows[0]!.result_entity_id,
          ),
          replayed: true,
        };
      }
      if (input.replyToMessageId) {
        const reply =
          await sql`select 1 from messaging.messages where organization_id=${input.actor.organizationId} and conversation_id=${input.conversationId} and id=${input.replyToMessageId}`.execute(
            tx,
          );
        if (!reply.rows[0])
          throw new MessagingDomainError(
            'VALIDATION_FAILED',
            'Reply target does not belong to this conversation.',
          );
      }
      const allocated = await sql<{
        sequence: string;
        version: string;
        connection_id: string;
      }>`update messaging.conversations c set next_message_sequence=next_message_sequence+1,last_message_sequence=next_message_sequence,updated_at=now(),version=version+1,status=case when status in ('NEW','RESOLVED') then 'OPEN' else status end,resolved_at=null
        where organization_id=${input.actor.organizationId}::uuid and id=${input.conversationId}::uuid and status<>'CLOSED' and exists(select 1 from messaging.channel_connections cc where cc.organization_id=c.organization_id and cc.id=c.channel_connection_id and cc.status in('ACTIVE','DEGRADED')) returning (next_message_sequence-1)::text sequence,version::text,channel_connection_id connection_id`.execute(
        tx,
      );
      const allocation = allocated.rows[0];
      if (!allocation) {
        const state = await sql<{
          status: string;
          connection_status: string;
        }>`select c.status,cc.status connection_status from messaging.conversations c join messaging.channel_connections cc on cc.organization_id=c.organization_id and cc.id=c.channel_connection_id where c.organization_id=${input.actor.organizationId} and c.id=${input.conversationId}`.execute(
          tx,
        );
        if (state.rows[0]?.status === 'CLOSED')
          throw new MessagingDomainError(
            'CONVERSATION_CLOSED',
            'Closed conversations cannot receive replies.',
          );
        throw new MessagingDomainError(
          'CONNECTION_UNAVAILABLE',
          'The channel connection is unavailable.',
        );
      }
      const inserted = await sql<{
        id: string;
      }>`insert into messaging.messages(organization_id,conversation_id,sequence,direction,sender_type,sender_membership_id,message_type,text_body,client_message_id,reply_to_message_id,delivery_state)
        values(${input.actor.organizationId},${input.conversationId},${allocation.sequence}::bigint,'OUTBOUND','STAFF',${input.actor.membershipId},'TEXT',${text},${input.clientMessageId},${input.replyToMessageId ?? null},'QUEUED') returning id`.execute(
        tx,
      );
      const messageId = inserted.rows[0]!.id;
      await sql`update messaging.conversations set last_message_id=${messageId},last_message_at=now(),last_outbound_at=now() where organization_id=${input.actor.organizationId} and id=${input.conversationId}`.execute(
        tx,
      );
      await sql`insert into messaging.message_external_references(organization_id,message_id,channel_connection_id,reference_type,external_id) values(${input.actor.organizationId},${messageId},${allocation.connection_id},'CLIENT_MESSAGE',${input.clientMessageId})`.execute(
        tx,
      );
      await sql`insert into messaging.delivery_intents(organization_id,message_id,channel_connection_id,provider_request_key) values(${input.actor.organizationId},${messageId},${allocation.connection_id},${`message:${messageId}`})`.execute(
        tx,
      );
      await appendRealtimeEvent(tx as Db, {
        organizationId: input.actor.organizationId,
        audienceType: 'ORGANIZATION',
        conversationId: input.conversationId,
        eventType: 'messaging.message.created.v1',
        aggregateId: messageId,
        aggregateVersion: allocation.sequence,
        payload: {
          conversationId: input.conversationId,
          messageId,
          sequence: allocation.sequence,
          direction: 'OUTBOUND',
        },
      });
      await sql`insert into platform.outbox_events(organization_id,event_type,event_version,aggregate_type,aggregate_id,aggregate_version,payload,occurred_at) values(${input.actor.organizationId},'messaging.message.created.v1',1,'messaging.message',${messageId},${allocation.sequence}::bigint,${JSON.stringify({ conversationId: input.conversationId, messageId, sequence: allocation.sequence, direction: 'OUTBOUND' })}::jsonb,now())`.execute(
        tx,
      );
      await appendAuditEvent(tx, {
        organizationId: input.actor.organizationId,
        actorType: 'USER',
        actorId: input.actor.actorId,
        membershipId: input.actor.membershipId,
        action: 'messaging.message.accepted',
        targetType: 'messaging.message',
        targetId: messageId,
        ...(input.requestId ? { requestId: input.requestId } : {}),
        metadata: { conversationId: input.conversationId, sequence: allocation.sequence },
      });
      await sql`update platform.idempotency_records set status='SUCCEEDED',result_entity_id=${messageId},safe_response=${JSON.stringify({ messageId })}::jsonb,completed_at=now() where id=${record.id}::uuid`.execute(
        tx,
      );
      return {
        message: await loadMessage(tx as Db, input.actor.organizationId, messageId),
        replayed: false,
      };
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'IdempotencyKeyReuseError')
      throw new MessagingDomainError(
        'IDEMPOTENCY_KEY_REUSED',
        'The idempotency key was already used for different input.',
      );
    throw error;
  }
}

/** Trusted adapter entry point. Provider payload parsing and signature checks happen before this boundary. */
export async function acceptInboundMessage(
  db: Db,
  input: {
    organizationId: string;
    conversationId: string;
    contactIdentityId: string;
    idempotencyKey: string;
    externalMessageId: string;
    text: string;
    providerCreatedAt?: Date;
  },
): Promise<{ message: MessageView; replayed: boolean }> {
  const text = input.text.trim();
  if (!text || text.length > 10_000)
    throw new MessagingDomainError(
      'VALIDATION_FAILED',
      'Message text must contain 1 to 10,000 characters.',
    );
  try {
    return await db.transaction().execute(async (tx) => {
      const conversation = await sql<{
        channel_connection_id: string;
        contact_identity_id: string;
      }>`select channel_connection_id,contact_identity_id from messaging.conversations where organization_id=${input.organizationId} and id=${input.conversationId} for update`.execute(
        tx,
      );
      const row = conversation.rows[0];
      if (!row || row.contact_identity_id !== input.contactIdentityId)
        throw new MessagingDomainError('CONVERSATION_NOT_FOUND', 'Conversation was not found.');
      const record = await claimIdempotencyRecord(tx, {
        organizationId: input.organizationId,
        principalType: 'CONTACT_IDENTITY',
        principalId: input.contactIdentityId,
        operationType: 'messaging.message.inbound',
        idempotencyKey: input.idempotencyKey,
        requestFingerprint: fingerprint({
          conversationId: input.conversationId,
          externalMessageId: input.externalMessageId,
          text,
          providerCreatedAt: input.providerCreatedAt?.toISOString() ?? null,
        }),
      });
      if (!record.created) {
        if (record.status === 'IN_PROGRESS')
          throw new MessagingDomainError(
            'IDEMPOTENCY_IN_PROGRESS',
            'The original request is still in progress.',
          );
        const prior = await sql<{
          result_entity_id: string;
        }>`select result_entity_id from platform.idempotency_records where id=${record.id}`.execute(
          tx,
        );
        return {
          message: await loadMessage(
            tx as Db,
            input.organizationId,
            prior.rows[0]!.result_entity_id,
          ),
          replayed: true,
        };
      }
      const allocated = await sql<{
        sequence: string;
        version: string;
      }>`update messaging.conversations set next_message_sequence=next_message_sequence+1,last_message_sequence=next_message_sequence,status=case when status in('RESOLVED','CLOSED') then 'OPEN' else status end,resolved_at=null,closed_at=null,last_inbound_at=coalesce(${input.providerCreatedAt ?? new Date()},now()),updated_at=now(),version=version+1 where organization_id=${input.organizationId} and id=${input.conversationId} returning (next_message_sequence-1)::text sequence,version::text`.execute(
        tx,
      );
      const allocation = allocated.rows[0]!;
      const inserted = await sql<{
        id: string;
      }>`insert into messaging.messages(organization_id,conversation_id,sequence,direction,sender_type,sender_contact_identity_id,message_type,text_body,provider_message_id,delivery_state,provider_created_at) values(${input.organizationId},${input.conversationId},${allocation.sequence}::bigint,'INBOUND','CONTACT',${input.contactIdentityId},'TEXT',${text},${input.externalMessageId},'RECEIVED',${input.providerCreatedAt ?? null}) returning id`.execute(
        tx,
      );
      const messageId = inserted.rows[0]!.id;
      await sql`update messaging.conversations set last_message_id=${messageId},last_message_at=now() where organization_id=${input.organizationId} and id=${input.conversationId}`.execute(
        tx,
      );
      await sql`insert into messaging.message_external_references(organization_id,message_id,channel_connection_id,reference_type,external_id) values(${input.organizationId},${messageId},${row.channel_connection_id},'PROVIDER_MESSAGE',${input.externalMessageId})`.execute(
        tx,
      );
      await appendRealtimeEvent(tx as Db, {
        organizationId: input.organizationId,
        audienceType: 'ORGANIZATION',
        conversationId: input.conversationId,
        eventType: 'messaging.message.created.v1',
        aggregateId: messageId,
        aggregateVersion: allocation.sequence,
        payload: {
          conversationId: input.conversationId,
          messageId,
          sequence: allocation.sequence,
          direction: 'INBOUND',
        },
      });
      await sql`insert into platform.outbox_events(organization_id,event_type,event_version,aggregate_type,aggregate_id,aggregate_version,payload,occurred_at) values(${input.organizationId},'messaging.inbound_message.created.v1',1,'messaging.message',${messageId},${allocation.sequence}::bigint,${JSON.stringify({ conversationId: input.conversationId, messageId, sequence: allocation.sequence, direction: 'INBOUND' })}::jsonb,now())`.execute(
        tx,
      );
      await sql`update platform.idempotency_records set status='SUCCEEDED',result_entity_type='messaging.message',result_entity_id=${messageId},safe_response=${JSON.stringify({ messageId })}::jsonb,completed_at=now() where id=${record.id}`.execute(
        tx,
      );
      return {
        message: await loadMessage(tx as Db, input.organizationId, messageId),
        replayed: false,
      };
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'IdempotencyKeyReuseError')
      throw new MessagingDomainError(
        'IDEMPOTENCY_KEY_REUSED',
        'The idempotency key was already used for different input.',
      );
    throw error;
  }
}

export async function markConversationRead(
  db: Db,
  input: {
    organizationId: string;
    conversationId: string;
    membershipId: string;
    access: ConversationAccess;
    lastReadSequence: string;
  },
): Promise<{ lastReadSequence: string }> {
  await getConversation(db, input);
  if (!/^\d+$/.test(input.lastReadSequence))
    throw new MessagingDomainError(
      'VALIDATION_FAILED',
      'Read sequence must be a non-negative integer.',
    );
  return db.transaction().execute(async (tx) => {
    const current = await sql<{
      last_message_sequence: string;
      version: string;
    }>`select last_message_sequence::text,version::text from messaging.conversations where organization_id=${input.organizationId} and id=${input.conversationId} for update`.execute(
      tx,
    );
    const bounded = String(
      Math.min(Number(input.lastReadSequence), Number(current.rows[0]!.last_message_sequence)),
    );
    await sql`insert into messaging.conversation_read_cursors(organization_id,conversation_id,reader_type,reader_id,last_read_sequence) values(${input.organizationId},${input.conversationId},'MEMBERSHIP',${input.membershipId},${bounded}::bigint) on conflict(organization_id,conversation_id,reader_type,reader_id) do update set last_read_sequence=greatest(messaging.conversation_read_cursors.last_read_sequence,excluded.last_read_sequence),updated_at=now()`.execute(
      tx,
    );
    await appendRealtimeEvent(tx as Db, {
      organizationId: input.organizationId,
      audienceType: 'MEMBERSHIP',
      audienceId: input.membershipId,
      conversationId: input.conversationId,
      eventType: 'messaging.read_cursor.advanced.v1',
      aggregateId: input.conversationId,
      aggregateVersion: current.rows[0]!.version,
      payload: {
        conversationId: input.conversationId,
        readerScope: 'MEMBERSHIP',
        sequence: bounded,
      },
    });
    return { lastReadSequence: bounded };
  });
}

const transitions: Record<ConversationStatus, readonly ConversationStatus[]> = {
  NEW: ['OPEN', 'RESOLVED', 'CLOSED'],
  OPEN: ['PENDING', 'RESOLVED', 'CLOSED'],
  PENDING: ['OPEN', 'RESOLVED', 'CLOSED'],
  RESOLVED: ['OPEN', 'CLOSED'],
  CLOSED: [],
};
export async function transitionConversation(
  db: Db,
  input: {
    actor: MessagingActorContext;
    access: ConversationAccess;
    conversationId: string;
    status: ConversationStatus;
    expectedVersion: string;
    reason?: string;
  },
): Promise<ConversationDetail> {
  return db.transaction().execute(async (tx) => {
    const before = await getConversation(tx as Db, {
      organizationId: input.actor.organizationId,
      conversationId: input.conversationId,
      membershipId: input.actor.membershipId,
      access: input.access,
    });
    if (before.version !== input.expectedVersion)
      throw new MessagingDomainError('STALE_VERSION', 'Conversation changed before this request.', {
        currentVersion: before.version,
      });
    if (!transitions[before.status]!.includes(input.status) && before.status !== input.status)
      throw new MessagingDomainError(
        'VALIDATION_FAILED',
        `Cannot transition ${before.status} to ${input.status}.`,
      );
    const updated = await sql<{
      version: string;
    }>`update messaging.conversations set status=${input.status},resolved_at=case when ${input.status}='RESOLVED' then now() else null end,closed_at=case when ${input.status}='CLOSED' then now() else null end,updated_at=now(),version=version+1 where organization_id=${input.actor.organizationId} and id=${input.conversationId} and version=${input.expectedVersion}::bigint returning version::text`.execute(
      tx,
    );
    if (!updated.rows[0])
      throw new MessagingDomainError('STALE_VERSION', 'Conversation changed before this request.');
    await appendRealtimeEvent(tx as Db, {
      organizationId: input.actor.organizationId,
      audienceType: 'ORGANIZATION',
      conversationId: input.conversationId,
      eventType: 'messaging.conversation.status_changed.v1',
      aggregateId: input.conversationId,
      aggregateVersion: updated.rows[0].version,
      payload: {
        conversationId: input.conversationId,
        from: before.status,
        to: input.status,
        version: updated.rows[0].version,
      },
    });
    await sql`insert into platform.outbox_events(organization_id,event_type,event_version,aggregate_type,aggregate_id,aggregate_version,payload,occurred_at) values(${input.actor.organizationId},'messaging.conversation.status_changed.v1',1,'messaging.conversation',${input.conversationId},${updated.rows[0].version}::bigint,${JSON.stringify({ conversationId: input.conversationId, from: before.status, to: input.status, version: updated.rows[0].version })}::jsonb,now())`.execute(
      tx,
    );
    await appendAuditEvent(tx, {
      organizationId: input.actor.organizationId,
      actorType: 'USER',
      actorId: input.actor.actorId,
      membershipId: input.actor.membershipId,
      action: 'messaging.conversation.status_changed',
      targetType: 'messaging.conversation',
      targetId: input.conversationId,
      ...(input.reason ? { reason: input.reason } : {}),
      beforeDiff: { status: before.status },
      afterDiff: { status: input.status },
    });
    return getConversation(tx as Db, {
      organizationId: input.actor.organizationId,
      conversationId: input.conversationId,
      membershipId: input.actor.membershipId,
      access: input.access,
    });
  });
}

export async function claimConversation(
  db: Db,
  input: {
    actor: MessagingActorContext;
    access: ConversationAccess;
    conversationId: string;
    expectedVersion: string;
  },
): Promise<ConversationDetail> {
  return db.transaction().execute(async (tx) => {
    const updated = await sql<{
      version: string;
    }>`update messaging.conversations set assignee_membership_id=${input.actor.membershipId},assigned_at=now(),assigned_by_membership_id=${input.actor.membershipId},updated_at=now(),version=version+1 where organization_id=${input.actor.organizationId} and id=${input.conversationId} and version=${input.expectedVersion}::bigint and assignee_membership_id is null returning version::text`.execute(
      tx,
    );
    if (!updated.rows[0]) {
      const current = await selectConversation(
        tx as Db,
        input.actor.organizationId,
        input.conversationId,
        input.actor.membershipId,
        'ALL',
      );
      if (!current)
        throw new MessagingDomainError('CONVERSATION_NOT_FOUND', 'Conversation was not found.');
      throw new MessagingDomainError(
        current.version !== input.expectedVersion ? 'STALE_VERSION' : 'ASSIGNMENT_CONFLICT',
        'Conversation cannot be claimed.',
        {
          currentVersion: current.version,
          assigneeMembershipId: current.assignee?.membershipId ?? null,
        },
      );
    }
    await appendRealtimeEvent(tx as Db, {
      organizationId: input.actor.organizationId,
      audienceType: 'ORGANIZATION',
      conversationId: input.conversationId,
      eventType: 'messaging.conversation.assigned.v1',
      aggregateId: input.conversationId,
      aggregateVersion: updated.rows[0].version,
      payload: {
        conversationId: input.conversationId,
        assigneeMembershipId: input.actor.membershipId,
        version: updated.rows[0].version,
      },
    });
    await sql`insert into platform.outbox_events(organization_id,event_type,event_version,aggregate_type,aggregate_id,aggregate_version,payload,occurred_at) values(${input.actor.organizationId},'messaging.conversation.assigned.v1',1,'messaging.conversation',${input.conversationId},${updated.rows[0].version}::bigint,${JSON.stringify({ conversationId: input.conversationId, assigneeMembershipId: input.actor.membershipId, version: updated.rows[0].version })}::jsonb,now())`.execute(
      tx,
    );
    await appendAuditEvent(tx, {
      organizationId: input.actor.organizationId,
      actorType: 'USER',
      actorId: input.actor.actorId,
      membershipId: input.actor.membershipId,
      action: 'messaging.conversation.claimed',
      targetType: 'messaging.conversation',
      targetId: input.conversationId,
    });
    return getConversation(tx as Db, {
      organizationId: input.actor.organizationId,
      conversationId: input.conversationId,
      membershipId: input.actor.membershipId,
      access: input.access,
    });
  });
}

export async function listRealtimeEvents(
  db: Db,
  input: {
    organizationId: string;
    membershipId: string;
    access: ConversationAccess;
    after?: string;
    limit?: number;
  },
): Promise<readonly MessagingEvent[]> {
  const after = input.after ?? '0';
  if (!/^\d+$/.test(after))
    throw new MessagingDomainError('VALIDATION_FAILED', 'Event cursor is invalid.');
  const window = await sql<{
    retained_from_sequence: string;
  }>`select retained_from_sequence::text from messaging.realtime_streams where organization_id=${input.organizationId}`.execute(
    db,
  );
  const retained = window.rows[0]?.retained_from_sequence ?? '1';
  if (BigInt(after) > 0n && BigInt(after) < BigInt(retained) - 1n)
    throw new MessagingDomainError(
      'EVENT_CURSOR_EXPIRED',
      'Event cursor is outside the retention window.',
      { retainedFrom: retained },
    );
  const result = await sql<{
    event_id: string;
    stream_sequence: string;
    event_type: string;
    conversation_id: string | null;
    aggregate_id: string;
    aggregate_version: string;
    payload: Record<string, unknown>;
    created_at: Date;
  }>`select e.event_id,e.stream_sequence::text,e.event_type,e.conversation_id,e.aggregate_id,e.aggregate_version::text,e.payload,e.created_at from messaging.realtime_events e left join messaging.conversations c on c.organization_id=e.organization_id and c.id=e.conversation_id where e.organization_id=${input.organizationId} and e.stream_sequence>${after}::bigint and e.expires_at>now() and ((e.audience_type='ORGANIZATION' and (e.conversation_id is null or ${input.access === 'ALL'} or c.assignee_membership_id is null or c.assignee_membership_id=${input.membershipId})) or (e.audience_type='MEMBERSHIP' and e.audience_id=${input.membershipId}) or (e.audience_type='CONVERSATION' and (${input.access === 'ALL'} or c.assignee_membership_id is null or c.assignee_membership_id=${input.membershipId}))) order by e.stream_sequence limit ${Math.min(input.limit ?? 100, 200)}`.execute(
    db,
  );
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

export async function purgeExpiredRealtimeEvents(db: Db): Promise<number> {
  return db.transaction().execute(async (tx) => {
    const deleted = await sql<{
      organization_id: string;
    }>`delete from messaging.realtime_events where expires_at<=now() returning organization_id`.execute(
      tx,
    );
    const organizations = [...new Set(deleted.rows.map((r) => r.organization_id))];
    for (const organizationId of organizations)
      await sql`update messaging.realtime_streams s set retained_from_sequence=coalesce((select min(stream_sequence) from messaging.realtime_events e where e.organization_id=s.organization_id),s.next_sequence),updated_at=now() where organization_id=${organizationId}`.execute(
        tx,
      );
    return deleted.rows.length;
  });
}

export interface DeliveryCommand {
  readonly intentId: string;
  readonly organizationId: string;
  readonly messageId: string;
  readonly connectionId: string;
  readonly providerRequestKey: string;
  readonly text: string | null;
}
export interface ChannelAdapter {
  readonly kind: ChannelKind;
  deliver(command: DeliveryCommand): Promise<DeliveryOutcome>;
}
export class ChannelAdapterRegistry {
  private readonly adapters = new Map<ChannelKind, ChannelAdapter>();
  register(adapter: ChannelAdapter) {
    if (this.adapters.has(adapter.kind))
      throw new Error(`Adapter already registered for ${adapter.kind}.`);
    this.adapters.set(adapter.kind, adapter);
  }
  get(kind: ChannelKind) {
    return this.adapters.get(kind);
  }
  kinds() {
    return [...this.adapters.keys()];
  }
}

export async function processMessagingDeliveries(
  db: Db,
  registry: ChannelAdapterRegistry,
  workerId: string,
  limit = 10,
): Promise<number> {
  let processed = 0;
  for (let index = 0; index < limit; index++) {
    let claimed:
      | {
          id: string;
          organization_id: string;
          message_id: string;
          conversation_id: string;
          channel_connection_id: string;
          provider_request_key: string;
          attempt_count: number;
          max_attempts: number;
          channel_kind: ChannelKind;
          text_body: string | null;
        }
      | undefined;
    for (const kind of registry.kinds()) {
      const result = await sql<
        typeof claimed & {}
      >`with candidate as(select di.id from messaging.delivery_intents di join messaging.channel_connections cc on cc.id=di.channel_connection_id where cc.channel_kind=${kind} and cc.status in('ACTIVE','DEGRADED') and di.status in('PENDING','RETRY_WAIT') and di.attempt_count<di.max_attempts and di.available_at<=now() order by di.available_at,di.id for update of di skip locked limit 1), claimed as(update messaging.delivery_intents di set status='PROCESSING',lease_owner=${workerId},lease_expires_at=now()+interval '60 seconds',attempt_count=attempt_count+1,updated_at=now() from candidate where di.id=candidate.id returning di.*) update messaging.messages m set delivery_state='SENDING',updated_at=now() from claimed,messaging.channel_connections cc where m.id=claimed.message_id and cc.id=claimed.channel_connection_id returning claimed.id,claimed.organization_id,claimed.message_id,m.conversation_id,claimed.channel_connection_id,claimed.provider_request_key,claimed.attempt_count,claimed.max_attempts,cc.channel_kind,m.text_body`.execute(
        db,
      );
      claimed = result.rows[0];
      if (claimed) break;
    }
    if (!claimed) break;
    const adapter = registry.get(claimed.channel_kind)!;
    const started = Date.now();
    let outcome: DeliveryOutcome;
    try {
      outcome = await adapter.deliver({
        intentId: claimed.id,
        organizationId: claimed.organization_id,
        messageId: claimed.message_id,
        connectionId: claimed.channel_connection_id,
        providerRequestKey: claimed.provider_request_key,
        text: claimed.text_body,
      });
    } catch {
      outcome = { type: 'TRANSIENT_FAILURE', code: 'ADAPTER_EXCEPTION' };
    }
    await completeDelivery(db, claimed, outcome, started);
    processed++;
  }
  return processed;
}

async function completeDelivery(
  db: Db,
  claim: {
    id: string;
    organization_id: string;
    message_id: string;
    conversation_id: string;
    channel_connection_id: string;
    attempt_count: number;
    max_attempts: number;
  },
  outcome: DeliveryOutcome,
  started: number,
): Promise<void> {
  await db.transaction().execute(async (tx) => {
    const exhausted =
      outcome.type === 'TRANSIENT_FAILURE' && claim.attempt_count >= claim.max_attempts;
    const intentStatus =
      outcome.type === 'ACCEPTED'
        ? 'SUCCEEDED'
        : outcome.type === 'TRANSIENT_FAILURE' && !exhausted
          ? 'RETRY_WAIT'
          : outcome.type === 'UNKNOWN'
            ? 'RECONCILIATION_REQUIRED'
            : 'FAILED_FINAL';
    const messageState =
      outcome.type === 'ACCEPTED'
        ? 'SENT'
        : outcome.type === 'TRANSIENT_FAILURE' && !exhausted
          ? 'FAILED_TRANSIENT'
          : outcome.type === 'UNKNOWN'
            ? 'UNKNOWN'
            : 'FAILED_PERMANENT';
    const retryAt =
      outcome.type === 'TRANSIENT_FAILURE' && outcome.retryAfter
        ? new Date(outcome.retryAfter)
        : new Date(Date.now() + Math.min(300_000, 1000 * 2 ** claim.attempt_count));
    const code = outcome.type === 'ACCEPTED' ? null : outcome.code;
    await sql`update messaging.delivery_intents set status=${intentStatus},available_at=${retryAt},lease_owner=null,lease_expires_at=null,last_error_code=${code},completed_at=case when ${intentStatus} in('SUCCEEDED','FAILED_FINAL','RECONCILIATION_REQUIRED') then now() else null end,updated_at=now() where id=${claim.id} and status='PROCESSING'`.execute(
      tx,
    );
    await sql`update messaging.messages set delivery_state=${messageState},provider_message_id=case when ${outcome.type}='ACCEPTED' then ${(outcome as { providerMessageId?: string }).providerMessageId ?? null} else provider_message_id end,sent_at=case when ${messageState}='SENT' then now() else sent_at end,failed_at=case when ${messageState} in('FAILED_TRANSIENT','FAILED_PERMANENT','UNKNOWN') then now() else failed_at end,failure_code=${code},updated_at=now() where organization_id=${claim.organization_id} and id=${claim.message_id}`.execute(
      tx,
    );
    if (outcome.type === 'ACCEPTED')
      await sql`insert into messaging.message_external_references(organization_id,message_id,channel_connection_id,reference_type,external_id) values(${claim.organization_id},${claim.message_id},${claim.channel_connection_id},'PROVIDER_MESSAGE',${outcome.providerMessageId}) on conflict do nothing`.execute(
        tx,
      );
    await sql`insert into messaging.delivery_attempts(organization_id,intent_id,message_id,attempt_number,outcome,provider_code,provider_request_id,started_at,completed_at,latency_ms) values(${claim.organization_id},${claim.id},${claim.message_id},${claim.attempt_count},${outcome.type},${code},${outcome.type === 'ACCEPTED' ? (outcome.providerRequestId ?? null) : null},${new Date(started)},now(),${Math.max(0, Date.now() - started)})`.execute(
      tx,
    );
    await appendRealtimeEvent(tx as Db, {
      organizationId: claim.organization_id,
      audienceType: 'ORGANIZATION',
      conversationId: claim.conversation_id,
      eventType: 'messaging.message.delivery_changed.v1',
      aggregateId: claim.message_id,
      aggregateVersion: claim.attempt_count,
      payload: {
        conversationId: claim.conversation_id,
        messageId: claim.message_id,
        state: messageState,
        ...(code ? { failureCode: code } : {}),
      },
    });
    await sql`insert into platform.outbox_events(organization_id,event_type,event_version,aggregate_type,aggregate_id,aggregate_version,payload,occurred_at) values(${claim.organization_id},'messaging.message.delivery_changed.v1',1,'messaging.message',${claim.message_id},${claim.attempt_count},${JSON.stringify({ conversationId: claim.conversation_id, messageId: claim.message_id, state: messageState, ...(code ? { failureCode: code } : {}) })}::jsonb,now())`.execute(
      tx,
    );
  });
}

export async function reclaimExpiredMessagingDeliveries(db: Db): Promise<number> {
  const result = await sql<{
    id: string;
  }>`with reclaimed as(update messaging.delivery_intents set status=case when attempt_count>=max_attempts then 'FAILED_FINAL' else 'RETRY_WAIT' end,available_at=now(),lease_owner=null,lease_expires_at=null,last_error_code='LEASE_EXPIRED',completed_at=case when attempt_count>=max_attempts then now() else null end,updated_at=now() where status='PROCESSING' and lease_expires_at<=now() returning organization_id,message_id,status) update messaging.messages m set delivery_state=case when reclaimed.status='FAILED_FINAL' then 'FAILED_PERMANENT' else 'FAILED_TRANSIENT' end,failed_at=now(),failure_code='LEASE_EXPIRED',updated_at=now() from reclaimed where m.organization_id=reclaimed.organization_id and m.id=reclaimed.message_id returning m.id`.execute(
    db,
  );
  return result.rows.length;
}
