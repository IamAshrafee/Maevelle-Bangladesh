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
  MessagingTag,
  ConversationFollowUpSummary,
} from '@maevelle/contracts/messaging';
import type { DatabaseSchema } from '../index.js';
import { appendAuditEvent, claimIdempotencyRecord } from '../platform.js';

type Db = Kysely<DatabaseSchema>;

export type MessagingErrorCode =
  | 'CONVERSATION_NOT_FOUND'
  | 'CONVERSATION_CLOSED'
  | 'CHANNEL_CAPABILITY_UNSUPPORTED'
  | 'REPLY_WINDOW_CLOSED'
  | 'CONNECTION_UNAVAILABLE'
  | 'IDEMPOTENCY_IN_PROGRESS'
  | 'IDEMPOTENCY_KEY_REUSED'
  | 'STALE_VERSION'
  | 'ASSIGNMENT_CONFLICT'
  | 'EVENT_CURSOR_EXPIRED'
  | 'UNAUTHENTICATED'
  | 'SESSION_EXPIRED'
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
  channel_status: string;
  facebook_status: string | null;
  facebook_granted_scopes: string[] | null;
  facebook_page_tasks: string[] | null;
  instagram_status: string | null;
  instagram_granted_scopes: string[] | null;
  instagram_page_tasks: string[] | null;
  capability_snapshot: Record<string, unknown>;
  contact_id: string;
  contact_name: string | null;
  contact_username: string | null;
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
  context: Record<string, unknown>;
  created_at: Date;
  updated_at: Date;
  reply_eligible_until: Date | null;
  is_starred: boolean;
  tags: unknown;
  follow_up: unknown;
  needs_reply: boolean;
  activity_at: Date;
  priority_rank: number;
  follow_up_due_at: Date | null;
}

function capabilities(
  snapshot: Record<string, unknown>,
  repliesAllowed = true,
): ChannelCapabilities {
  return {
    text: snapshot.text !== false,
    attachments: snapshot.attachments === true,
    replies: snapshot.replies !== false && repliesAllowed,
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
    contact: {
      id: row.contact_id,
      displayName: row.contact_name,
      username: row.contact_username,
      customerId: row.customer_id,
    },
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
    isStarred: row.is_starred,
    tags: Array.isArray(row.tags) ? (row.tags as readonly MessagingTag[]) : [],
    followUp:
      row.follow_up && typeof row.follow_up === 'object'
        ? (row.follow_up as ConversationFollowUpSummary)
        : null,
    needsReply: row.needs_reply,
    capabilities: capabilities(
      row.capability_snapshot,
      ['ACTIVE', 'DEGRADED'].includes(row.channel_status) &&
        (row.channel_kind !== 'FACEBOOK' ||
          (['CONNECTED', 'LIMITED_PERMISSIONS'].includes(row.facebook_status ?? '') &&
            (row.facebook_granted_scopes ?? []).includes('pages_messaging') &&
            (row.facebook_page_tasks ?? []).includes('MESSAGING'))) &&
        (row.channel_kind !== 'INSTAGRAM' ||
          (['CONNECTED', 'LIMITED_PERMISSIONS'].includes(row.instagram_status ?? '') &&
            (row.instagram_granted_scopes ?? []).includes('instagram_manage_messages') &&
            (row.instagram_page_tasks ?? []).includes('MESSAGING'))) &&
        (row.channel_kind === 'WEBSITE' ||
          (row.reply_eligible_until !== null && row.reply_eligible_until > new Date())),
    ),
    version: row.version,
    subject: row.subject,
    providerContext: row.context,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    replyEligibleUntil: iso(row.reply_eligible_until),
  };
}

const conversationSelect = sql.raw(`
  select c.id, cc.channel_kind, c.channel_connection_id, cc.display_name channel_name,cc.status channel_status,
    facebook.status facebook_status,facebook.granted_scopes facebook_granted_scopes,facebook.page_tasks facebook_page_tasks,
    instagram.status instagram_status,instagram.granted_scopes instagram_granted_scopes,instagram.page_tasks instagram_page_tasks,
    cc.capability_snapshot, c.contact_id, ct.display_name contact_name, ci.username contact_username, ct.customer_id,
    c.status, c.priority, c.assignee_membership_id, am.display_name assignee_name,
    c.last_message_sequence::text, lm.text_body last_message_text,
    lm.direction last_message_direction, lm.created_at last_message_created_at,
    (select count(*)::text from messaging.messages unread where unread.organization_id=c.organization_id and unread.conversation_id=c.id and unread.direction='INBOUND' and unread.sequence>coalesce(rc.last_read_sequence,0)) unread_count,
    c.version::text, c.subject, c.context, c.created_at, c.updated_at, c.reply_eligible_until,c.is_starred,
    coalesce((select jsonb_agg(jsonb_build_object('id',tag.id,'label',tag.label,'colorToken',tag.color_token,'status',tag.status,'version',tag.version::text) order by tag.label,tag.id) from messaging.conversation_tag_assignments assignment join messaging.tags tag on tag.organization_id=assignment.organization_id and tag.id=assignment.tag_id where assignment.organization_id=c.organization_id and assignment.conversation_id=c.id),'[]'::jsonb) tags,
    case when follow_up.id is null then null else jsonb_build_object('id',follow_up.id,'dueAt',follow_up.due_at,'status',follow_up.status,'responsibleMembershipId',follow_up.responsible_membership_id,'isOverdue',follow_up.due_at<now()) end follow_up,
    (c.status in ('NEW','OPEN') and c.last_inbound_at is not null and (c.last_outbound_at is null or c.last_inbound_at>c.last_outbound_at)) needs_reply,
    coalesce(c.last_message_at,c.created_at) activity_at,
    case c.priority when 'URGENT' then 4 when 'HIGH' then 3 when 'NORMAL' then 2 else 1 end priority_rank,
    follow_up.due_at follow_up_due_at
  from messaging.conversations c
  join messaging.channel_connections cc on cc.organization_id=c.organization_id and cc.id=c.channel_connection_id
  left join messaging.facebook_connection_state facebook on facebook.organization_id=cc.organization_id and facebook.channel_connection_id=cc.id
  left join messaging.instagram_connection_state instagram on instagram.organization_id=cc.organization_id and instagram.channel_connection_id=cc.id
  join messaging.contacts ct on ct.organization_id=c.organization_id and ct.id=c.contact_id
  join messaging.contact_identities ci on ci.organization_id=c.organization_id and ci.id=c.contact_identity_id
  left join iam.organization_memberships am on am.organization_id=c.organization_id and am.id=c.assignee_membership_id
  left join messaging.messages lm on lm.organization_id=c.organization_id and lm.id=c.last_message_id
  left join lateral(select follow_up.id,follow_up.due_at,follow_up.status,follow_up.responsible_membership_id from messaging.conversation_follow_ups follow_up where follow_up.organization_id=c.organization_id and follow_up.conversation_id=c.id and follow_up.status='PENDING' order by follow_up.due_at,follow_up.id limit 1) follow_up on true
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
    }>`insert into messaging.conversations(organization_id,channel_connection_id,channel_kind,contact_id,contact_identity_id,subject)
      select ${input.organizationId},cc.id,cc.channel_kind,${input.contactId},${input.contactIdentityId},${input.subject ?? null}
      from messaging.channel_connections cc where cc.organization_id=${input.organizationId} and cc.id=${input.channelConnectionId}
      returning id,version::text`.execute(tx);
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
    priority?: ConversationSummary['priority'];
    assignedMembershipId?: string;
    tagId?: string;
    unread?: boolean;
    starred?: boolean;
    needsReply?: boolean;
    followUp?: 'pending' | 'overdue' | 'none';
    createdFrom?: string;
    createdTo?: string;
    activityFrom?: string;
    activityTo?: string;
    search?: string;
    sort?: 'newest' | 'oldest' | 'created_newest' | 'created_oldest' | 'priority' | 'follow_up';
    cursor?: string;
    limit?: number;
  },
): Promise<CursorPage<ConversationSummary>> {
  const limit = Math.min(Math.max(input.limit ?? 30, 1), 100);
  const cursor = decodeCursor<{
    key: string;
    id: string;
    sort: NonNullable<typeof input.sort>;
    filter: string;
  }>(input.cursor);
  const allowed = accessSql(input.access, input.membershipId);
  const scope = input.scope ?? 'all';
  const sort = input.sort ?? 'newest';
  const filter = fingerprint({
    scope,
    status: input.status ?? null,
    channelKind: input.channelKind ?? null,
    priority: input.priority ?? null,
    assignedMembershipId: input.assignedMembershipId ?? null,
    tagId: input.tagId ?? null,
    unread: input.unread ?? null,
    starred: input.starred ?? null,
    needsReply: input.needsReply ?? null,
    followUp: input.followUp ?? null,
    createdFrom: input.createdFrom ?? null,
    createdTo: input.createdTo ?? null,
    activityFrom: input.activityFrom ?? null,
    activityTo: input.activityTo ?? null,
    search: input.search ?? null,
  });
  if (cursor && (cursor.sort !== sort || cursor.filter !== filter))
    throw new MessagingDomainError(
      'VALIDATION_FAILED',
      'The cursor does not match the sort order.',
    );
  const result = await sql<ConversationRow>`${conversationSelect}${input.membershipId}::uuid
    where c.organization_id=${input.organizationId}::uuid and ${allowed}
      and (${input.status ?? null}::text is null or c.status=${input.status ?? null})
      and (${input.channelKind ?? null}::text is null or cc.channel_kind=${input.channelKind ?? null})
      and (${input.priority ?? null}::text is null or c.priority=${input.priority ?? null})
      and (${input.assignedMembershipId ?? null}::uuid is null or c.assignee_membership_id=${input.assignedMembershipId ?? null}::uuid)
      and (${input.tagId ?? null}::uuid is null or exists(select 1 from messaging.conversation_tag_assignments filter_tag where filter_tag.organization_id=c.organization_id and filter_tag.conversation_id=c.id and filter_tag.tag_id=${input.tagId ?? null}::uuid))
      and (${input.unread ?? null}::boolean is null or ${input.unread ?? null}=exists(select 1 from messaging.messages unread_filter where unread_filter.organization_id=c.organization_id and unread_filter.conversation_id=c.id and unread_filter.direction='INBOUND' and unread_filter.sequence>coalesce(rc.last_read_sequence,0)))
      and (${input.starred ?? null}::boolean is null or c.is_starred=${input.starred ?? null})
      and (${input.needsReply ?? null}::boolean is null or ${input.needsReply ?? null}=(c.status in ('NEW','OPEN') and c.last_inbound_at is not null and (c.last_outbound_at is null or c.last_inbound_at>c.last_outbound_at)))
      and (${input.followUp ?? null}::text is null or (${input.followUp ?? null}='pending' and follow_up.id is not null) or (${input.followUp ?? null}='overdue' and follow_up.due_at<now()) or (${input.followUp ?? null}='none' and follow_up.id is null))
      and (${input.createdFrom ?? null}::timestamptz is null or c.created_at>=${input.createdFrom ?? null}::timestamptz)
      and (${input.createdTo ?? null}::timestamptz is null or c.created_at<${input.createdTo ?? null}::timestamptz)
      and (${input.activityFrom ?? null}::timestamptz is null or coalesce(c.last_message_at,c.created_at)>=${input.activityFrom ?? null}::timestamptz)
      and (${input.activityTo ?? null}::timestamptz is null or coalesce(c.last_message_at,c.created_at)<${input.activityTo ?? null}::timestamptz)
      and (${input.search ?? null}::text is null or c.id::text=${input.search ?? null} or ct.display_name ilike ${input.search ? `%${input.search}%` : ''} or exists(select 1 from messaging.contact_identities identity where identity.organization_id=c.organization_id and identity.id=c.contact_identity_id and (identity.display_name ilike ${input.search ? `%${input.search}%` : ''} or identity.username ilike ${input.search ? `%${input.search}%` : ''})) or exists(select 1 from messaging.messages searched_message where searched_message.organization_id=c.organization_id and searched_message.conversation_id=c.id and searched_message.direction<>'INTERNAL' and searched_message.text_body ilike ${input.search ? `%${input.search}%` : ''} limit 1) or exists(select 1 from orders.orders searched_order where searched_order.organization_id=c.organization_id and searched_order.customer_id=ct.customer_id and searched_order.order_number ilike ${input.search ? `${input.search}%` : ''}))
      and (${scope}='all' or (${scope}='mine' and c.assignee_membership_id=${input.membershipId}::uuid) or (${scope}='unassigned' and c.assignee_membership_id is null))
      and (${cursor?.key ?? null}::text is null
        or (${sort}='newest' and (coalesce(c.last_message_at,c.created_at),c.id)<(${cursor?.key ?? null}::timestamptz,${cursor?.id ?? null}::uuid))
        or (${sort}='oldest' and (coalesce(c.last_message_at,c.created_at),c.id)>(${cursor?.key ?? null}::timestamptz,${cursor?.id ?? null}::uuid))
        or (${sort}='created_newest' and (c.created_at,c.id)<(${cursor?.key ?? null}::timestamptz,${cursor?.id ?? null}::uuid))
        or (${sort}='created_oldest' and (c.created_at,c.id)>(${cursor?.key ?? null}::timestamptz,${cursor?.id ?? null}::uuid))
        or (${sort}='priority' and ((case c.priority when 'URGENT' then 4 when 'HIGH' then 3 when 'NORMAL' then 2 else 1 end),c.id)<(${cursor?.key ?? null}::int,${cursor?.id ?? null}::uuid))
        or (${sort}='follow_up' and (coalesce(follow_up.due_at,'infinity'::timestamptz),c.id)>(${cursor?.key ?? null}::timestamptz,${cursor?.id ?? null}::uuid)))
    order by case when ${sort}='newest' then coalesce(c.last_message_at,c.created_at) end desc,case when ${sort}='newest' then c.id end desc,
      case when ${sort}='oldest' then coalesce(c.last_message_at,c.created_at) end asc,case when ${sort}='oldest' then c.id end asc,
      case when ${sort}='created_newest' then c.created_at end desc,case when ${sort}='created_newest' then c.id end desc,
      case when ${sort}='created_oldest' then c.created_at end asc,case when ${sort}='created_oldest' then c.id end asc,
      case when ${sort}='priority' then case c.priority when 'URGENT' then 4 when 'HIGH' then 3 when 'NORMAL' then 2 else 1 end end desc,case when ${sort}='priority' then c.id end desc,
      case when ${sort}='follow_up' then coalesce(follow_up.due_at,'infinity'::timestamptz) end asc,case when ${sort}='follow_up' then c.id end asc limit ${limit + 1}`.execute(
    db,
  );
  const hasMore = result.rows.length > limit;
  const rows = result.rows.slice(0, limit);
  const last = rows.at(-1);
  const key = last
    ? sort === 'priority'
      ? String(last.priority_rank)
      : sort === 'created_newest' || sort === 'created_oldest'
        ? last.created_at.toISOString()
        : sort === 'follow_up'
          ? (last.follow_up_due_at?.toISOString() ?? 'infinity')
          : last.activity_at.toISOString()
    : null;
  return {
    data: rows.map(mapConversation),
    pagination: {
      hasMore,
      nextCursor: hasMore && last && key ? encodeCursor({ key, id: last.id, sort, filter }) : null,
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
  client_message_id: string | null;
  text_body: string | null;
  delivery_state: MessageView['delivery']['state'];
  failure_code: string | null;
  created_at: Date;
  edited_at: Date | null;
  retracted_at: Date | null;
}

function mapMessage(row: MessageRow, attachments: MessageView['attachments'] = []): MessageView {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    sequence: row.sequence,
    direction: row.direction,
    sender: { type: row.sender_type, id: row.sender_id, name: row.sender_name },
    type: row.message_type,
    clientMessageId: row.client_message_id,
    text: row.text_body,
    attachments,
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

async function loadAttachments(
  db: Db,
  organizationId: string,
  messageIds: readonly string[],
): Promise<Map<string, MessageView['attachments']>> {
  if (!messageIds.length) return new Map();
  const result = await sql<{
    message_id: string;
    id: string;
    kind: MessageView['attachments'][number]['kind'];
    filename: string | null;
    mime_type: string | null;
    byte_size: string | null;
    width_px: number | null;
    height_px: number | null;
    security_status: MessageView['attachments'][number]['securityStatus'];
  }>`select id,message_id,kind,filename,mime_type,byte_size::text,width_px,height_px,security_status
      from messaging.message_attachments where organization_id=${organizationId}
        and message_id in (${sql.join(messageIds.map((id) => sql`${id}::uuid`))}) order by message_id,position`.execute(
    db,
  );
  const grouped = new Map<string, MessageView['attachments']>();
  for (const row of result.rows) {
    const items = grouped.get(row.message_id) ?? [];
    grouped.set(row.message_id, [
      ...items,
      {
        id: row.id,
        kind: row.kind,
        fileName: row.filename,
        mimeType: row.mime_type,
        byteSize: row.byte_size,
        width: row.width_px,
        height: row.height_px,
        securityStatus: row.security_status,
        downloadPath:
          row.security_status === 'AVAILABLE' ? `/api/admin/messaging/attachments/${row.id}` : null,
      },
    ]);
  }
  return grouped;
}

async function loadMessage(
  db: Db,
  organizationId: string,
  messageId: string,
): Promise<MessageView> {
  const result =
    await sql<MessageRow>`select m.id,m.conversation_id,m.sequence::text,m.direction,m.sender_type,
    coalesce(m.sender_membership_id,m.sender_contact_identity_id)::text sender_id,coalesce(mem.display_name,ci.display_name) sender_name,
    m.message_type,m.client_message_id,m.text_body,m.delivery_state,m.failure_code,m.created_at,m.edited_at,m.retracted_at
    from messaging.messages m left join iam.organization_memberships mem on mem.id=m.sender_membership_id
    left join messaging.contact_identities ci on ci.id=m.sender_contact_identity_id
    where m.organization_id=${organizationId}::uuid and m.id=${messageId}::uuid`.execute(db);
  if (!result.rows[0])
    throw new MessagingDomainError('CONVERSATION_NOT_FOUND', 'Message was not found.');
  const attachments = await loadAttachments(db, organizationId, [result.rows[0].id]);
  return mapMessage(result.rows[0], attachments.get(result.rows[0].id));
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
    coalesce(mem.display_name,ci.display_name) sender_name,m.message_type,m.client_message_id,m.text_body,m.delivery_state,m.failure_code,m.created_at,m.edited_at,m.retracted_at
    from messaging.messages m left join iam.organization_memberships mem on mem.id=m.sender_membership_id left join messaging.contact_identities ci on ci.id=m.sender_contact_identity_id
    where m.organization_id=${input.organizationId}::uuid and m.conversation_id=${input.conversationId}::uuid and (${before?.sequence ?? null}::bigint is null or m.sequence<${before?.sequence ?? null}::bigint)
    order by m.sequence desc limit ${limit + 1}`.execute(db);
  const hasMore = result.rows.length > limit;
  const rows = result.rows.slice(0, limit);
  const oldest = rows.at(-1);
  const attachments = await loadAttachments(
    db,
    input.organizationId,
    rows.map((row) => row.id),
  );
  return {
    data: rows.reverse().map((row) => mapMessage(row, attachments.get(row.id))),
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
    text?: string;
    attachmentIds?: readonly string[];
    replyToMessageId?: string;
    requestId?: string;
  },
): Promise<{ message: MessageView; replayed: boolean }> {
  const text = input.text?.trim() ?? '';
  const attachmentIds = [...new Set(input.attachmentIds ?? [])];
  if ((!text && !attachmentIds.length) || text.length > 10_000 || attachmentIds.length > 5)
    throw new MessagingDomainError(
      'VALIDATION_FAILED',
      'A message requires text or up to five attachments; text cannot exceed 10,000 characters.',
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
      if (
        (conversation.channel.kind === 'FACEBOOK' || conversation.channel.kind === 'INSTAGRAM') &&
        (!conversation.replyEligibleUntil ||
          new Date(conversation.replyEligibleUntil) <= new Date())
      )
        throw new MessagingDomainError(
          'REPLY_WINDOW_CLOSED',
          `The ${conversation.channel.kind === 'FACEBOOK' ? 'Facebook' : 'Instagram'} customer-service reply window is closed.`,
          {
            eligibleUntil: conversation.replyEligibleUntil,
            channelKind: conversation.channel.kind,
          },
        );
      if (
        (conversation.channel.kind === 'FACEBOOK' || conversation.channel.kind === 'INSTAGRAM') &&
        (attachmentIds.length > 1 || (text && attachmentIds.length))
      )
        throw new MessagingDomainError(
          'CHANNEL_CAPABILITY_UNSUPPORTED',
          `${conversation.channel.kind === 'FACEBOOK' ? 'Facebook' : 'Instagram'} replies support either one image or one text message per canonical message.`,
        );
      if (
        !conversation.capabilities.replies ||
        (text && !conversation.capabilities.text) ||
        (attachmentIds.length && !conversation.capabilities.attachments)
      )
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
          attachmentIds,
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
      const priorClient = await sql<{
        id: string;
        text_body: string | null;
        reply_to_message_id: string | null;
        attachment_ids: string[];
      }>`select m.id,m.text_body,m.reply_to_message_id,
          coalesce(array_agg(a.media_asset_id::text order by a.position) filter(where a.id is not null),'{}') attachment_ids
        from messaging.messages m left join messaging.message_attachments a
          on a.organization_id=m.organization_id and a.message_id=m.id
        where m.organization_id=${input.actor.organizationId} and m.conversation_id=${input.conversationId}
          and m.client_message_id=${input.clientMessageId} and m.direction='OUTBOUND'
        group by m.id`.execute(tx);
      if (priorClient.rows[0]) {
        const prior = priorClient.rows[0];
        if (
          (prior.text_body ?? '') !== text ||
          (prior.reply_to_message_id ?? null) !== (input.replyToMessageId ?? null) ||
          prior.attachment_ids.length !== attachmentIds.length ||
          prior.attachment_ids.some((id, index) => id !== attachmentIds[index])
        )
          throw new MessagingDomainError(
            'IDEMPOTENCY_KEY_REUSED',
            'The client message identifier was already used for different input.',
          );
        await sql`update platform.idempotency_records set status='SUCCEEDED',result_entity_id=${prior.id},
          safe_response=${JSON.stringify({ messageId: prior.id })}::jsonb,completed_at=now()
          where id=${record.id}::uuid`.execute(tx);
        return {
          message: await loadMessage(tx as Db, input.actor.organizationId, prior.id),
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
      const attachmentAssets = attachmentIds.length
        ? await sql<{
            id: string;
            original_filename: string;
            mime_type: string;
            byte_size: string;
            width_px: number | null;
            height_px: number | null;
          }>`select a.id,a.original_filename,o.mime_type,o.byte_size::text,o.width_px,o.height_px
              from media.media_assets a join media.media_objects o on o.organization_id=a.organization_id and o.id=a.current_object_id
              where a.organization_id=${input.actor.organizationId} and a.id in (${sql.join(attachmentIds.map((id) => sql`${id}::uuid`))})
                and a.visibility_class='PRIVATE' and a.status='READY' and a.asset_type='IMAGE'`.execute(
            tx,
          )
        : { rows: [] };
      if (attachmentAssets.rows.length !== attachmentIds.length)
        throw new MessagingDomainError(
          'VALIDATION_FAILED',
          'One or more attachments are unavailable.',
        );
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
        values(${input.actor.organizationId},${input.conversationId},${allocation.sequence}::bigint,'OUTBOUND','STAFF',${input.actor.membershipId},${attachmentIds.length ? (text ? 'MIXED' : 'ATTACHMENT') : 'TEXT'},${text || null},${input.clientMessageId},${input.replyToMessageId ?? null},'QUEUED') returning id`.execute(
        tx,
      );
      const messageId = inserted.rows[0]!.id;
      for (const [position, assetId] of attachmentIds.entries()) {
        const asset = attachmentAssets.rows.find((candidate) => candidate.id === assetId)!;
        await sql`insert into messaging.message_attachments(organization_id,message_id,media_asset_id,position,kind,filename,mime_type,byte_size,width_px,height_px,security_status)
          values(${input.actor.organizationId},${messageId},${assetId},${position},'IMAGE',${asset.original_filename},${asset.mime_type},${asset.byte_size}::bigint,${asset.width_px},${asset.height_px},'AVAILABLE')`.execute(
          tx,
        );
      }
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
    text?: string;
    attachmentIds?: readonly string[];
    providerAttachments?: readonly {
      kind: 'IMAGE' | 'VIDEO' | 'AUDIO' | 'FILE' | 'STICKER' | 'PROVIDER_SHARE';
      externalId?: string;
      sourceUrl?: string;
      mimeType?: string;
      mediaAssetId?: string;
      fileName?: string;
      byteSize?: number;
    }[];
    providerCreatedAt?: Date;
    historical?: boolean;
  },
): Promise<{ message: MessageView; replayed: boolean }> {
  const text = input.text?.trim() ?? '';
  const occurredAt = input.providerCreatedAt ?? new Date();
  const attachmentIds = [...new Set(input.attachmentIds ?? [])];
  const providerAttachments = input.providerAttachments ?? [];
  if (
    (!text && !attachmentIds.length && !providerAttachments.length) ||
    text.length > 10_000 ||
    attachmentIds.length + providerAttachments.length > 5
  )
    throw new MessagingDomainError(
      'VALIDATION_FAILED',
      'A message requires text or up to five attachments; text cannot exceed 10,000 characters.',
    );
  try {
    return await db.transaction().execute(async (tx) => {
      const conversation = await sql<{
        channel_connection_id: string;
        channel_kind: ChannelKind;
        contact_identity_id: string;
        status: ConversationStatus;
      }>`select channel_connection_id,channel_kind,contact_identity_id,status from messaging.conversations where organization_id=${input.organizationId} and id=${input.conversationId} for update`.execute(
        tx,
      );
      const row = conversation.rows[0];
      if (!row || row.contact_identity_id !== input.contactIdentityId)
        throw new MessagingDomainError('CONVERSATION_NOT_FOUND', 'Conversation was not found.');
      if (row.status === 'CLOSED' && !input.historical)
        throw new MessagingDomainError(
          'CONVERSATION_CLOSED',
          'Closed conversations cannot receive messages.',
        );
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
          attachmentIds,
          providerAttachments,
          providerCreatedAt: input.providerCreatedAt?.toISOString() ?? null,
          historical: input.historical ?? false,
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
      const priorExternal = await sql<{
        message_id: string;
        conversation_id: string;
        text_body: string | null;
        attachment_ids: string[];
      }>`select r.message_id,m.conversation_id,m.text_body,
          coalesce(array_agg(u.id::text order by a.position) filter(where u.id is not null),'{}') attachment_ids
        from messaging.message_external_references r
        join messaging.messages m on m.organization_id=r.organization_id and m.id=r.message_id
        left join messaging.message_attachments a on a.organization_id=m.organization_id and a.message_id=m.id
        left join messaging.website_attachment_uploads u on u.organization_id=a.organization_id
          and u.media_asset_id=a.media_asset_id and u.attached_message_id=m.id
        where r.organization_id=${input.organizationId} and r.channel_connection_id=${row.channel_connection_id}
          and r.reference_type='PROVIDER_MESSAGE' and r.external_id=${input.externalMessageId}
        group by r.message_id,m.conversation_id,m.text_body`.execute(tx);
      if (priorExternal.rows[0]) {
        const prior = priorExternal.rows[0];
        if (
          prior.conversation_id !== input.conversationId ||
          (row.channel_kind === 'WEBSITE' &&
            ((prior.text_body ?? '') !== text ||
              prior.attachment_ids.length !== attachmentIds.length ||
              prior.attachment_ids.some((id, index) => id !== attachmentIds[index])))
        )
          throw new MessagingDomainError(
            'IDEMPOTENCY_KEY_REUSED',
            'The client message identifier was already used for different input.',
          );
        await sql`update platform.idempotency_records set status='SUCCEEDED',result_entity_type='messaging.message',
          result_entity_id=${prior.message_id},safe_response=${JSON.stringify({ messageId: prior.message_id })}::jsonb,
          completed_at=now() where id=${record.id}`.execute(tx);
        return {
          message: await loadMessage(tx as Db, input.organizationId, prior.message_id),
          replayed: true,
        };
      }
      const attachmentUploads = attachmentIds.length
        ? await sql<{
            id: string;
            media_asset_id: string;
            file_name: string;
            mime_type: string;
            byte_size: string;
            width_px: number | null;
            height_px: number | null;
          }>`select u.id,u.media_asset_id,u.file_name,u.mime_type,u.byte_size::text,o.width_px,o.height_px
              from messaging.website_attachment_uploads u
              join media.media_assets a on a.organization_id=u.organization_id and a.id=u.media_asset_id
              join media.media_objects o on o.organization_id=a.organization_id and o.id=a.current_object_id
              where u.organization_id=${input.organizationId} and u.conversation_id=${input.conversationId}
                and u.contact_identity_id=${input.contactIdentityId} and u.id in (${sql.join(attachmentIds.map((id) => sql`${id}::uuid`))})
                and u.status='AVAILABLE' and u.expires_at>now() and a.status='READY'`.execute(tx)
        : { rows: [] };
      if (attachmentUploads.rows.length !== attachmentIds.length)
        throw new MessagingDomainError(
          'VALIDATION_FAILED',
          'One or more attachments are unavailable.',
        );
      const allocated = await sql<{
        sequence: string;
        version: string;
      }>`update messaging.conversations set next_message_sequence=next_message_sequence+1,last_message_sequence=next_message_sequence,status=case when not ${input.historical ?? false} and status='RESOLVED' then 'OPEN' else status end,resolved_at=case when not ${input.historical ?? false} then null else resolved_at end,last_inbound_at=greatest(coalesce(last_inbound_at,'-infinity'::timestamptz),${occurredAt}),updated_at=now(),version=version+1 where organization_id=${input.organizationId} and id=${input.conversationId} and (status<>'CLOSED' or ${input.historical ?? false}) returning (next_message_sequence-1)::text sequence,version::text`.execute(
        tx,
      );
      const allocation = allocated.rows[0]!;
      if (row.status === 'RESOLVED' && !input.historical)
        await sql`insert into messaging.conversation_events(organization_id,conversation_id,event_type,from_value,to_value,reason)
          values(${input.organizationId},${input.conversationId},'STATUS_CHANGED',${JSON.stringify('RESOLVED')}::jsonb,${JSON.stringify('OPEN')}::jsonb,'Inbound customer message reopened the conversation.')`.execute(
          tx,
        );
      const inserted = await sql<{
        id: string;
      }>`insert into messaging.messages(organization_id,conversation_id,sequence,direction,sender_type,sender_contact_identity_id,message_type,text_body,provider_message_id,client_message_id,delivery_state,provider_created_at,created_at) values(${input.organizationId},${input.conversationId},${allocation.sequence}::bigint,'INBOUND','CONTACT',${input.contactIdentityId},${attachmentIds.length || providerAttachments.length ? (text ? 'MIXED' : 'ATTACHMENT') : 'TEXT'},${text || null},${input.externalMessageId},${input.externalMessageId},'RECEIVED',${input.providerCreatedAt ?? null},${input.historical ? occurredAt : new Date()}) returning id`.execute(
        tx,
      );
      const messageId = inserted.rows[0]!.id;
      for (const [position, uploadId] of attachmentIds.entries()) {
        const upload = attachmentUploads.rows.find((candidate) => candidate.id === uploadId)!;
        await sql`insert into messaging.message_attachments(organization_id,message_id,media_asset_id,position,kind,filename,mime_type,byte_size,width_px,height_px,security_status)
          values(${input.organizationId},${messageId},${upload.media_asset_id},${position},'IMAGE',${upload.file_name},${upload.mime_type},${upload.byte_size}::bigint,${upload.width_px},${upload.height_px},'AVAILABLE')`.execute(
          tx,
        );
        await sql`update messaging.website_attachment_uploads set status='ATTACHED',attached_message_id=${messageId},updated_at=now()
          where organization_id=${input.organizationId} and id=${uploadId} and status='AVAILABLE'`.execute(
          tx,
        );
      }
      for (const [offset, attachment] of providerAttachments.entries()) {
        await sql`insert into messaging.message_attachments(organization_id,message_id,media_asset_id,position,kind,filename,mime_type,byte_size,security_status,provider_metadata,expires_at)
          values(${input.organizationId},${messageId},${attachment.mediaAssetId ?? null},${attachmentIds.length + offset},${attachment.kind},${attachment.fileName ?? null},${attachment.mimeType ?? null},${attachment.byteSize ?? null},${attachment.mediaAssetId ? 'QUARANTINED' : 'REMOTE_ONLY'},${JSON.stringify({ externalId: attachment.externalId ?? null, sourceUrl: attachment.sourceUrl ?? null })}::jsonb,now()+interval '7 days')`.execute(
          tx,
        );
      }
      await sql`update messaging.conversations set last_message_id=case when last_message_at is null or last_message_at<=${occurredAt} then ${messageId} else last_message_id end,last_message_at=greatest(coalesce(last_message_at,'-infinity'::timestamptz),${occurredAt}) where organization_id=${input.organizationId} and id=${input.conversationId}`.execute(
        tx,
      );
      await sql`insert into messaging.message_external_references(organization_id,message_id,channel_connection_id,reference_type,external_id) values(${input.organizationId},${messageId},${row.channel_connection_id},'PROVIDER_MESSAGE',${input.externalMessageId})`.execute(
        tx,
      );
      if (!input.historical)
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
      await sql`insert into platform.outbox_events(organization_id,event_type,event_version,aggregate_type,aggregate_id,aggregate_version,payload,occurred_at) values(${input.organizationId},${input.historical ? 'messaging.historical_message.imported.v1' : 'messaging.inbound_message.created.v1'},1,'messaging.message',${messageId},${allocation.sequence}::bigint,${JSON.stringify({ conversationId: input.conversationId, messageId, sequence: allocation.sequence, direction: 'INBOUND', historical: input.historical ?? false })}::jsonb,now())`.execute(
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
    await sql`insert into messaging.conversation_events(organization_id,conversation_id,event_type,actor_membership_id,from_value,to_value,reason)
      values(${input.actor.organizationId},${input.conversationId},'STATUS_CHANGED',${input.actor.membershipId},${JSON.stringify(before.status)}::jsonb,${JSON.stringify(input.status)}::jsonb,${input.reason ?? null})`.execute(
      tx,
    );
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
    await sql`insert into messaging.conversation_assignment_events(organization_id,conversation_id,new_assignee_membership_id,actor_membership_id,assignment_source,conversation_version)
      values(${input.actor.organizationId},${input.conversationId},${input.actor.membershipId},${input.actor.membershipId},'CLAIM',${updated.rows[0].version}::bigint)`.execute(
      tx,
    );
    await sql`insert into messaging.conversation_events(organization_id,conversation_id,event_type,actor_membership_id,to_value)
      values(${input.actor.organizationId},${input.conversationId},'ASSIGNMENT_CHANGED',${input.actor.membershipId},${JSON.stringify({ assigneeMembershipId: input.actor.membershipId })}::jsonb)`.execute(
      tx,
    );
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
        recipientMembershipId: input.actor.membershipId,
        version: updated.rows[0].version,
      },
    });
    await sql`insert into platform.outbox_events(organization_id,event_type,event_version,aggregate_type,aggregate_id,aggregate_version,payload,occurred_at) values(${input.actor.organizationId},'messaging.conversation.assigned.v1',1,'messaging.conversation',${input.conversationId},${updated.rows[0].version}::bigint,${JSON.stringify({ conversationId: input.conversationId, assigneeMembershipId: input.actor.membershipId, recipientMembershipId: input.actor.membershipId, version: updated.rows[0].version })}::jsonb,now())`.execute(
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
  has(kind: ChannelKind) {
    return this.adapters.has(kind);
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
      // An exception can occur after a provider accepted the request.
      outcome = { type: 'UNKNOWN', code: 'ADAPTER_EXCEPTION' };
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
    const completed = await sql<{
      id: string;
    }>`update messaging.delivery_intents set status=${intentStatus},available_at=${retryAt},lease_owner=null,lease_expires_at=null,last_error_code=${code},completed_at=case when ${intentStatus} in('SUCCEEDED','FAILED_FINAL','RECONCILIATION_REQUIRED') then now() else null end,updated_at=now() where id=${claim.id} and status='PROCESSING' and attempt_count=${claim.attempt_count} returning id`.execute(
      tx,
    );
    if (!completed.rows.length) return;
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
  }>`with reclaimed as(update messaging.delivery_intents set status='RECONCILIATION_REQUIRED',lease_owner=null,lease_expires_at=null,last_error_code='LEASE_EXPIRED',completed_at=now(),updated_at=now() where status='PROCESSING' and lease_expires_at<=now() returning organization_id,message_id) update messaging.messages m set delivery_state='UNKNOWN',failed_at=now(),failure_code='LEASE_EXPIRED',updated_at=now() from reclaimed where m.organization_id=reclaimed.organization_id and m.id=reclaimed.message_id returning m.id`.execute(
    db,
  );
  return result.rows.length;
}

export * from './storefront.js';
export * from './operations.js';
export * from './settings.js';
export * from './customer-context.js';
export * from './reporting.js';
export * from './facebook.js';
export * from './instagram.js';
