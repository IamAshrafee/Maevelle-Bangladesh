import { sql, type Kysely } from 'kysely';

import type {
  AgentAvailabilityView,
  ConversationActivityView,
  ConversationDetail,
  FollowUpView,
  InboxCounts,
  InternalNoteView,
  MessagingTag,
  SavedReplyView,
} from '@maevelle/contracts/messaging';
import type { DatabaseSchema } from '../index.js';
import { appendAuditEvent } from '../platform.js';
import {
  appendRealtimeEvent,
  getConversation,
  MessagingDomainError,
  transitionConversation,
  type ConversationAccess,
  type MessagingActorContext,
} from './index.js';

type Db = Kysely<DatabaseSchema>;

function hasCapability(actor: MessagingActorContext, capability: string): boolean {
  return actor.capabilities.includes(capability);
}

async function ensureConversationAccess(
  db: Db,
  actor: MessagingActorContext,
  access: ConversationAccess,
  conversationId: string,
): Promise<ConversationDetail> {
  return getConversation(db, {
    organizationId: actor.organizationId,
    membershipId: actor.membershipId,
    access,
    conversationId,
  });
}

async function ensureEligibleMembership(db: Db, organizationId: string, membershipId: string) {
  const result = await sql<{ id: string }>`select membership.id
    from iam.organization_memberships membership
    where membership.organization_id=${organizationId} and membership.id=${membershipId}::uuid
      and membership.status='ACTIVE' and (
        membership.membership_type='OWNER' or exists(
          select 1 from iam.membership_capability_grants grant_record
          where grant_record.membership_id=membership.id
            and grant_record.capability_code in ('messaging.inbox.view_assigned','messaging.inbox.view_all','messaging.reply')
        )
      )`.execute(db);
  if (!result.rows[0])
    throw new MessagingDomainError(
      'VALIDATION_FAILED',
      'The selected assignee is not an eligible messaging agent.',
    );
}

async function recordConversationEvent(
  db: Db,
  input: {
    actor: MessagingActorContext;
    conversationId: string;
    eventType: string;
    realtimeType: string;
    version: string;
    fromValue?: unknown;
    toValue?: unknown;
    reason?: string;
    payload: Readonly<Record<string, unknown>>;
  },
) {
  await sql`insert into messaging.conversation_events(
      organization_id,conversation_id,event_type,actor_membership_id,from_value,to_value,reason
    ) values(
      ${input.actor.organizationId},${input.conversationId},${input.eventType},${input.actor.membershipId},
      ${input.fromValue === undefined ? null : JSON.stringify(input.fromValue)}::jsonb,
      ${input.toValue === undefined ? null : JSON.stringify(input.toValue)}::jsonb,${input.reason ?? null}
    )`.execute(db);
  await appendRealtimeEvent(db, {
    organizationId: input.actor.organizationId,
    audienceType: 'ORGANIZATION',
    conversationId: input.conversationId,
    eventType: input.realtimeType,
    aggregateId: input.conversationId,
    aggregateVersion: input.version,
    payload: input.payload,
  });
  await sql`insert into platform.outbox_events(
      organization_id,event_type,event_version,aggregate_type,aggregate_id,aggregate_version,payload,occurred_at
    ) values(
      ${input.actor.organizationId},${input.realtimeType},1,'messaging.conversation',${input.conversationId},
      ${input.version}::bigint,${JSON.stringify(input.payload)}::jsonb,now()
    )`.execute(db);
}

export async function assignConversation(
  db: Db,
  input: {
    actor: MessagingActorContext;
    access: ConversationAccess;
    conversationId: string;
    assigneeMembershipId: string | null;
    expectedVersion: string;
    reason?: string;
    source?: 'CLAIM' | 'MANUAL' | 'RULE';
  },
): Promise<ConversationDetail> {
  if (input.assigneeMembershipId)
    await ensureEligibleMembership(db, input.actor.organizationId, input.assigneeMembershipId);
  return db.transaction().execute(async (tx) => {
    const before = await ensureConversationAccess(
      tx as Db,
      input.actor,
      input.access,
      input.conversationId,
    );
    if (before.version !== input.expectedVersion)
      throw new MessagingDomainError('STALE_VERSION', 'Conversation changed before this request.', {
        currentVersion: before.version,
      });
    const updated = await sql<{ version: string }>`update messaging.conversations set
      assignee_membership_id=${input.assigneeMembershipId}::uuid,
      assigned_at=case when ${input.assigneeMembershipId}::uuid is null then null else now() end,
      assigned_by_membership_id=case when ${input.assigneeMembershipId}::uuid is null then null else ${input.actor.membershipId}::uuid end,
      updated_at=now(),version=version+1
      where organization_id=${input.actor.organizationId} and id=${input.conversationId} and version=${input.expectedVersion}::bigint
      returning version::text`.execute(tx);
    if (!updated.rows[0])
      throw new MessagingDomainError('STALE_VERSION', 'Conversation changed before this request.');
    const version = updated.rows[0].version;
    await sql`insert into messaging.conversation_assignment_events(
      organization_id,conversation_id,previous_assignee_membership_id,new_assignee_membership_id,actor_membership_id,assignment_source,reason,conversation_version
    ) values(${input.actor.organizationId},${input.conversationId},${before.assignee?.membershipId ?? null},${input.assigneeMembershipId},${input.actor.membershipId},${input.source ?? 'MANUAL'},${input.reason ?? null},${version}::bigint)`.execute(
      tx,
    );
    await recordConversationEvent(tx as Db, {
      actor: input.actor,
      conversationId: input.conversationId,
      eventType: 'ASSIGNMENT_CHANGED',
      realtimeType: input.assigneeMembershipId
        ? 'messaging.conversation.assigned.v1'
        : 'messaging.conversation.unassigned.v1',
      version,
      fromValue: { assigneeMembershipId: before.assignee?.membershipId ?? null },
      toValue: { assigneeMembershipId: input.assigneeMembershipId },
      ...(input.reason ? { reason: input.reason } : {}),
      payload: {
        conversationId: input.conversationId,
        previousAssigneeMembershipId: before.assignee?.membershipId ?? null,
        assigneeMembershipId: input.assigneeMembershipId,
        recipientMembershipId: input.assigneeMembershipId,
        version,
      },
    });
    if (
      before.assignee?.membershipId &&
      before.assignee.membershipId !== input.assigneeMembershipId
    )
      await appendRealtimeEvent(tx as Db, {
        organizationId: input.actor.organizationId,
        audienceType: 'MEMBERSHIP',
        audienceId: before.assignee.membershipId,
        conversationId: input.conversationId,
        eventType: 'messaging.inbox.invalidated.v1',
        aggregateId: input.conversationId,
        aggregateVersion: version,
        payload: { conversationId: input.conversationId, reason: 'ASSIGNMENT_CHANGED' },
      });
    await appendAuditEvent(tx, {
      organizationId: input.actor.organizationId,
      actorType: 'USER',
      actorId: input.actor.actorId,
      membershipId: input.actor.membershipId,
      action: 'messaging.conversation.assignment_changed',
      targetType: 'messaging.conversation',
      targetId: input.conversationId,
      ...(input.reason ? { reason: input.reason } : {}),
      beforeDiff: { assigneeMembershipId: before.assignee?.membershipId ?? null },
      afterDiff: { assigneeMembershipId: input.assigneeMembershipId },
    });
    return getConversation(tx as Db, {
      organizationId: input.actor.organizationId,
      membershipId: input.actor.membershipId,
      access: 'ALL',
      conversationId: input.conversationId,
    });
  });
}

export async function setConversationPriority(
  db: Db,
  input: {
    actor: MessagingActorContext;
    access: ConversationAccess;
    conversationId: string;
    priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';
    isStarred?: boolean;
    expectedVersion: string;
    reason?: string;
  },
): Promise<ConversationDetail> {
  return db.transaction().execute(async (tx) => {
    const before = await ensureConversationAccess(
      tx as Db,
      input.actor,
      input.access,
      input.conversationId,
    );
    const current = await sql<{
      is_starred: boolean;
    }>`select is_starred from messaging.conversations where organization_id=${input.actor.organizationId} and id=${input.conversationId}`.execute(
      tx,
    );
    if (before.version !== input.expectedVersion)
      throw new MessagingDomainError('STALE_VERSION', 'Conversation changed before this request.', {
        currentVersion: before.version,
      });
    const updated = await sql<{
      version: string;
    }>`update messaging.conversations set priority=${input.priority},
      is_starred=coalesce(${input.isStarred ?? null}::boolean,is_starred),updated_at=now(),version=version+1
      where organization_id=${input.actor.organizationId} and id=${input.conversationId} and version=${input.expectedVersion}::bigint returning version::text`.execute(
      tx,
    );
    if (!updated.rows[0])
      throw new MessagingDomainError('STALE_VERSION', 'Conversation changed before this request.');
    const version = updated.rows[0].version;
    await recordConversationEvent(tx as Db, {
      actor: input.actor,
      conversationId: input.conversationId,
      eventType: 'PRIORITY_CHANGED',
      realtimeType: 'messaging.conversation.priority_changed.v1',
      version,
      fromValue: { priority: before.priority, isStarred: current.rows[0]?.is_starred ?? false },
      toValue: {
        priority: input.priority,
        isStarred: input.isStarred ?? current.rows[0]?.is_starred ?? false,
      },
      ...(input.reason ? { reason: input.reason } : {}),
      payload: {
        conversationId: input.conversationId,
        priority: input.priority,
        isStarred: input.isStarred ?? current.rows[0]?.is_starred ?? false,
        version,
      },
    });
    await appendAuditEvent(tx, {
      organizationId: input.actor.organizationId,
      actorType: 'USER',
      actorId: input.actor.actorId,
      membershipId: input.actor.membershipId,
      action: 'messaging.conversation.priority_changed',
      targetType: 'messaging.conversation',
      targetId: input.conversationId,
      beforeDiff: { priority: before.priority },
      afterDiff: { priority: input.priority },
      ...(input.reason ? { reason: input.reason } : {}),
    });
    return getConversation(tx as Db, {
      organizationId: input.actor.organizationId,
      membershipId: input.actor.membershipId,
      access: input.access,
      conversationId: input.conversationId,
    });
  });
}

export async function listEligibleAgents(
  db: Db,
  organizationId: string,
): Promise<readonly AgentAvailabilityView[]> {
  const result = await sql<{
    membership_id: string;
    display_name: string | null;
    status: AgentAvailabilityView['status'] | null;
    capacity: number | null;
    last_heartbeat_at: Date | null;
    version: string | null;
  }>`select membership.id membership_id,membership.display_name,
    availability.status,availability.capacity,availability.last_heartbeat_at,availability.version::text
    from iam.organization_memberships membership
    left join messaging.agent_availability availability on availability.organization_id=membership.organization_id and availability.membership_id=membership.id
    where membership.organization_id=${organizationId} and membership.status='ACTIVE' and (membership.membership_type='OWNER' or exists(
      select 1 from iam.membership_capability_grants grant_record where grant_record.membership_id=membership.id and grant_record.capability_code in ('messaging.inbox.view_assigned','messaging.inbox.view_all','messaging.reply')
    )) order by membership.display_name nulls last,membership.id`.execute(db);
  const staleBefore = Date.now() - 2 * 60_000;
  return result.rows.map((row) => {
    const status = row.status ?? 'OFFLINE';
    const effectiveStatus =
      !row.last_heartbeat_at || row.last_heartbeat_at.getTime() < staleBefore ? 'OFFLINE' : status;
    return {
      membershipId: row.membership_id,
      displayName: row.display_name ?? 'Team member',
      status,
      capacity: row.capacity ?? 100,
      lastHeartbeatAt: row.last_heartbeat_at?.toISOString() ?? null,
      effectiveStatus,
      version: row.version ?? '0',
    };
  });
}

export async function setAgentAvailability(
  db: Db,
  input: {
    actor: MessagingActorContext;
    status: 'ONLINE' | 'BUSY' | 'AWAY' | 'OFFLINE';
    capacity: number;
  },
): Promise<AgentAvailabilityView> {
  if (!Number.isInteger(input.capacity) || input.capacity < 0 || input.capacity > 100)
    throw new MessagingDomainError(
      'VALIDATION_FAILED',
      'Capacity must be an integer from 0 to 100.',
    );
  await sql`insert into messaging.agent_availability(organization_id,membership_id,status,capacity,last_heartbeat_at)
    values(${input.actor.organizationId},${input.actor.membershipId},${input.status},${input.capacity},now())
    on conflict(organization_id,membership_id) do update set status=excluded.status,capacity=excluded.capacity,last_heartbeat_at=now(),updated_at=now(),version=messaging.agent_availability.version+1`.execute(
    db,
  );
  const agents = await listEligibleAgents(db, input.actor.organizationId);
  const own = agents.find((agent) => agent.membershipId === input.actor.membershipId);
  if (!own)
    throw new MessagingDomainError(
      'VALIDATION_FAILED',
      'Membership is not eligible for messaging availability.',
    );
  return own;
}

export async function heartbeatAgentAvailability(
  db: Db,
  actor: MessagingActorContext,
): Promise<void> {
  await sql`update messaging.agent_availability set last_heartbeat_at=now(),updated_at=now(),version=version+1
    where organization_id=${actor.organizationId} and membership_id=${actor.membershipId}`.execute(
    db,
  );
}

function mapNote(row: {
  id: string;
  conversation_id: string;
  author_membership_id: string;
  display_name: string | null;
  body: string;
  revision: number;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}): InternalNoteView {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    author: {
      membershipId: row.author_membership_id,
      displayName: row.display_name ?? 'Team member',
    },
    body: row.body,
    revision: row.revision,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    deletedAt: row.deleted_at?.toISOString() ?? null,
  };
}

export async function listInternalNotes(
  db: Db,
  input: { actor: MessagingActorContext; access: ConversationAccess; conversationId: string },
): Promise<readonly InternalNoteView[]> {
  await ensureConversationAccess(db, input.actor, input.access, input.conversationId);
  const result = await sql<{
    id: string;
    conversation_id: string;
    author_membership_id: string;
    display_name: string | null;
    body: string;
    revision: number;
    created_at: Date;
    updated_at: Date;
    deleted_at: Date | null;
  }>`select note.id,note.conversation_id,note.author_membership_id,membership.display_name,note.body,note.revision,note.created_at,note.updated_at,note.deleted_at
    from messaging.internal_notes note join iam.organization_memberships membership on membership.organization_id=note.organization_id and membership.id=note.author_membership_id
    where note.organization_id=${input.actor.organizationId} and note.conversation_id=${input.conversationId}
      and note.superseded_by_note_id is null order by note.created_at,note.id`.execute(db);
  return result.rows.map(mapNote);
}

export async function createInternalNote(
  db: Db,
  input: {
    actor: MessagingActorContext;
    access: ConversationAccess;
    conversationId: string;
    body: string;
  },
): Promise<InternalNoteView> {
  const body = input.body.trim();
  if (!body || body.length > 10_000)
    throw new MessagingDomainError(
      'VALIDATION_FAILED',
      'Note body must contain 1 to 10,000 characters.',
    );
  return db.transaction().execute(async (tx) => {
    const conversation = await ensureConversationAccess(
      tx as Db,
      input.actor,
      input.access,
      input.conversationId,
    );
    const created = await sql<{
      id: string;
    }>`insert into messaging.internal_notes(organization_id,conversation_id,author_membership_id,body) values(${input.actor.organizationId},${input.conversationId},${input.actor.membershipId},${body}) returning id`.execute(
      tx,
    );
    const noteId = created.rows[0]!.id;
    await recordConversationEvent(tx as Db, {
      actor: input.actor,
      conversationId: input.conversationId,
      eventType: 'NOTE_CREATED',
      realtimeType: 'messaging.note.created.v1',
      version: conversation.version,
      toValue: { noteId },
      payload: { conversationId: input.conversationId, noteId },
    });
    await appendAuditEvent(tx, {
      organizationId: input.actor.organizationId,
      actorType: 'USER',
      actorId: input.actor.actorId,
      membershipId: input.actor.membershipId,
      action: 'messaging.note.created',
      targetType: 'messaging.internal_note',
      targetId: noteId,
      metadata: { conversationId: input.conversationId },
    });
    const result = await sql<{
      id: string;
      conversation_id: string;
      author_membership_id: string;
      display_name: string | null;
      body: string;
      revision: number;
      created_at: Date;
      updated_at: Date;
      deleted_at: Date | null;
    }>`select note.id,note.conversation_id,note.author_membership_id,membership.display_name,note.body,note.revision,note.created_at,note.updated_at,note.deleted_at from messaging.internal_notes note join iam.organization_memberships membership on membership.organization_id=note.organization_id and membership.id=note.author_membership_id where note.organization_id=${input.actor.organizationId} and note.id=${noteId}`.execute(
      tx,
    );
    return mapNote(result.rows[0]!);
  });
}

export async function updateInternalNote(
  db: Db,
  input: { actor: MessagingActorContext; noteId: string; body: string; expectedRevision: number },
): Promise<InternalNoteView> {
  const body = input.body.trim();
  if (!body || body.length > 10_000)
    throw new MessagingDomainError(
      'VALIDATION_FAILED',
      'Note body must contain 1 to 10,000 characters.',
    );
  const canManageAll = hasCapability(input.actor, 'messaging.notes.manage_all');
  return db.transaction().execute(async (tx) => {
    const current = await sql<{
      id: string;
      conversation_id: string;
      author_membership_id: string;
      revision: number;
    }>`select note.id,note.conversation_id,note.author_membership_id,note.revision
    from messaging.internal_notes note
    where note.organization_id=${input.actor.organizationId} and note.id=${input.noteId}
      and note.deleted_at is null and note.superseded_by_note_id is null
      and note.revision=${input.expectedRevision} and (${canManageAll} or note.author_membership_id=${input.actor.membershipId})
    for update`.execute(tx);
    const previous = current.rows[0];
    if (!previous)
      throw new MessagingDomainError('STALE_VERSION', 'The note changed or is not editable.');
    const created = await sql<{ id: string }>`insert into messaging.internal_notes(
      organization_id,conversation_id,author_membership_id,body,revision
    ) values(
      ${input.actor.organizationId},${previous.conversation_id},${previous.author_membership_id},${body},${previous.revision + 1}
    ) returning id`.execute(tx);
    const noteId = created.rows[0]!.id;
    await sql`update messaging.internal_notes set superseded_by_note_id=${noteId},updated_at=now()
      where organization_id=${input.actor.organizationId} and id=${previous.id}`.execute(tx);
    const result = await sql<{
      id: string;
      conversation_id: string;
      author_membership_id: string;
      display_name: string | null;
      body: string;
      revision: number;
      created_at: Date;
      updated_at: Date;
      deleted_at: Date | null;
    }>`select note.id,note.conversation_id,note.author_membership_id,membership.display_name,note.body,note.revision,note.created_at,note.updated_at,note.deleted_at
      from messaging.internal_notes note
      join iam.organization_memberships membership on membership.organization_id=note.organization_id and membership.id=note.author_membership_id
      where note.organization_id=${input.actor.organizationId} and note.id=${noteId}`.execute(tx);
    const row = result.rows[0]!;
    await appendRealtimeEvent(tx as Db, {
      organizationId: input.actor.organizationId,
      audienceType: 'ORGANIZATION',
      conversationId: row.conversation_id,
      eventType: 'messaging.note.updated.v1',
      aggregateId: row.id,
      aggregateVersion: String(row.revision),
      payload: { conversationId: row.conversation_id, noteId: row.id, revision: row.revision },
    });
    await appendAuditEvent(tx, {
      organizationId: input.actor.organizationId,
      actorType: 'USER',
      actorId: input.actor.actorId,
      membershipId: input.actor.membershipId,
      action: 'messaging.note.updated',
      targetType: 'messaging.internal_note',
      targetId: row.id,
      metadata: {
        conversationId: row.conversation_id,
        revision: row.revision,
        supersedesNoteId: previous.id,
      },
    });
    return mapNote(row);
  });
}

export async function deleteInternalNote(
  db: Db,
  input: { actor: MessagingActorContext; noteId: string; reason: string },
): Promise<void> {
  const canManageAll = hasCapability(input.actor, 'messaging.notes.manage_all');
  await db.transaction().execute(async (tx) => {
    const deleted = await sql<{
      conversation_id: string;
    }>`update messaging.internal_notes set deleted_at=now(),deleted_by_membership_id=${input.actor.membershipId},deletion_reason=${input.reason.trim()},updated_at=now()
    where organization_id=${input.actor.organizationId} and id=${input.noteId} and deleted_at is null and superseded_by_note_id is null
      and (${canManageAll} or author_membership_id=${input.actor.membershipId}) returning conversation_id`.execute(
      tx,
    );
    if (!deleted.rows[0])
      throw new MessagingDomainError(
        'CONVERSATION_NOT_FOUND',
        'Note was not found or is not editable.',
      );
    await appendRealtimeEvent(tx as Db, {
      organizationId: input.actor.organizationId,
      audienceType: 'ORGANIZATION',
      conversationId: deleted.rows[0].conversation_id,
      eventType: 'messaging.note.deleted.v1',
      aggregateId: input.noteId,
      aggregateVersion: '1',
      payload: { conversationId: deleted.rows[0].conversation_id, noteId: input.noteId },
    });
    await appendAuditEvent(tx, {
      organizationId: input.actor.organizationId,
      actorType: 'USER',
      actorId: input.actor.actorId,
      membershipId: input.actor.membershipId,
      action: 'messaging.note.deleted',
      targetType: 'messaging.internal_note',
      targetId: input.noteId,
      reason: input.reason,
      metadata: { conversationId: deleted.rows[0].conversation_id },
    });
  });
}

function mapTag(row: {
  id: string;
  label: string;
  color_token: string | null;
  status: 'ACTIVE' | 'ARCHIVED';
  version: string;
}): MessagingTag {
  return {
    id: row.id,
    label: row.label,
    colorToken: row.color_token,
    status: row.status,
    version: row.version,
  };
}

export async function listMessagingTags(
  db: Db,
  organizationId: string,
  includeArchived = false,
): Promise<readonly MessagingTag[]> {
  const result = await sql<{
    id: string;
    label: string;
    color_token: string | null;
    status: 'ACTIVE' | 'ARCHIVED';
    version: string;
  }>`select id,label,color_token,status,version::text from messaging.tags where organization_id=${organizationId} and (${includeArchived} or status='ACTIVE') order by status,label,id`.execute(
    db,
  );
  return result.rows.map(mapTag);
}

export async function createMessagingTag(
  db: Db,
  input: { actor: MessagingActorContext; label: string; colorToken?: string },
): Promise<MessagingTag> {
  try {
    const result = await sql<{
      id: string;
      label: string;
      color_token: string | null;
      status: 'ACTIVE' | 'ARCHIVED';
      version: string;
    }>`insert into messaging.tags(organization_id,label,color_token,created_by_membership_id) values(${input.actor.organizationId},${input.label.trim()},${input.colorToken ?? null},${input.actor.membershipId}) returning id,label,color_token,status,version::text`.execute(
      db,
    );
    return mapTag(result.rows[0]!);
  } catch (error) {
    if ((error as { code?: string }).code === '23505')
      throw new MessagingDomainError('VALIDATION_FAILED', 'A tag with this label already exists.');
    throw error;
  }
}

export async function updateMessagingTag(
  db: Db,
  input: {
    actor: MessagingActorContext;
    tagId: string;
    label?: string;
    colorToken?: string | null;
    status?: 'ACTIVE' | 'ARCHIVED';
    expectedVersion: string;
  },
): Promise<MessagingTag> {
  const result = await sql<{
    id: string;
    label: string;
    color_token: string | null;
    status: 'ACTIVE' | 'ARCHIVED';
    version: string;
  }>`update messaging.tags set
    label=coalesce(${input.label?.trim() ?? null},label), color_token=case when ${input.colorToken === undefined} then color_token else ${input.colorToken ?? null} end,
    status=coalesce(${input.status ?? null},status),updated_at=now(),version=version+1
    where organization_id=${input.actor.organizationId} and id=${input.tagId} and version=${input.expectedVersion}::bigint
    returning id,label,color_token,status,version::text`.execute(db);
  if (!result.rows[0])
    throw new MessagingDomainError('STALE_VERSION', 'Tag changed before this request.');
  return mapTag(result.rows[0]);
}

export async function setConversationTag(
  db: Db,
  input: {
    actor: MessagingActorContext;
    access: ConversationAccess;
    conversationId: string;
    tagId: string;
    assigned: boolean;
  },
): Promise<void> {
  await db.transaction().execute(async (tx) => {
    const conversation = await ensureConversationAccess(
      tx as Db,
      input.actor,
      input.access,
      input.conversationId,
    );
    if (input.assigned) {
      const inserted =
        await sql`insert into messaging.conversation_tag_assignments(organization_id,conversation_id,tag_id,assigned_by_membership_id)
      select ${input.actor.organizationId},${input.conversationId},tag.id,${input.actor.membershipId} from messaging.tags tag
      where tag.organization_id=${input.actor.organizationId} and tag.id=${input.tagId} and tag.status='ACTIVE' on conflict do nothing`.execute(
          tx,
        );
      if (Number(inserted.numAffectedRows) === 0) {
        const exists =
          await sql`select 1 from messaging.conversation_tag_assignments where organization_id=${input.actor.organizationId} and conversation_id=${input.conversationId} and tag_id=${input.tagId}`.execute(
            tx,
          );
        if (!exists.rows[0])
          throw new MessagingDomainError(
            'VALIDATION_FAILED',
            'Tag is not active in this organization.',
          );
      }
    } else {
      await sql`delete from messaging.conversation_tag_assignments where organization_id=${input.actor.organizationId} and conversation_id=${input.conversationId} and tag_id=${input.tagId}`.execute(
        tx,
      );
    }
    await recordConversationEvent(tx as Db, {
      actor: input.actor,
      conversationId: input.conversationId,
      eventType: input.assigned ? 'TAG_ASSIGNED' : 'TAG_REMOVED',
      realtimeType: 'messaging.conversation.tags_changed.v1',
      version: conversation.version,
      toValue: { tagId: input.tagId, assigned: input.assigned },
      payload: {
        conversationId: input.conversationId,
        tagId: input.tagId,
        assigned: input.assigned,
      },
    });
    await appendAuditEvent(tx, {
      organizationId: input.actor.organizationId,
      actorType: 'USER',
      actorId: input.actor.actorId,
      membershipId: input.actor.membershipId,
      action: input.assigned ? 'messaging.tag.assigned' : 'messaging.tag.removed',
      targetType: 'messaging.conversation',
      targetId: input.conversationId,
      metadata: { tagId: input.tagId },
    });
  });
}

function mapSavedReply(row: {
  id: string;
  title: string;
  body: string;
  shortcut: string | null;
  category: string | null;
  status: 'ACTIVE' | 'ARCHIVED';
  version: string;
  created_at: Date;
  updated_at: Date;
}): SavedReplyView {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    shortcut: row.shortcut,
    category: row.category,
    status: row.status,
    version: row.version,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export async function listSavedReplies(
  db: Db,
  input: { organizationId: string; query?: string; includeArchived?: boolean; limit?: number },
): Promise<readonly SavedReplyView[]> {
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 100);
  const query = input.query?.trim() ?? null;
  const result = await sql<{
    id: string;
    title: string;
    body: string;
    shortcut: string | null;
    category: string | null;
    status: 'ACTIVE' | 'ARCHIVED';
    version: string;
    created_at: Date;
    updated_at: Date;
  }>`select id,title,body,shortcut,category,status,version::text,created_at,updated_at from messaging.saved_replies
    where organization_id=${input.organizationId} and (${input.includeArchived ?? false} or status='ACTIVE')
      and (${query}::text is null or title ilike ${query ? `%${query}%` : ''} or coalesce(shortcut,'') ilike ${query ? `${query}%` : ''} or coalesce(category,'') ilike ${query ? `%${query}%` : ''})
    order by status,lower(title),id limit ${limit}`.execute(db);
  return result.rows.map(mapSavedReply);
}

export async function createSavedReply(
  db: Db,
  input: {
    actor: MessagingActorContext;
    title: string;
    body: string;
    shortcut?: string;
    category?: string;
  },
): Promise<SavedReplyView> {
  return db.transaction().execute(async (tx) => {
    const result = await sql<{
      id: string;
      title: string;
      body: string;
      shortcut: string | null;
      category: string | null;
      status: 'ACTIVE' | 'ARCHIVED';
      version: string;
      created_at: Date;
      updated_at: Date;
    }>`insert into messaging.saved_replies(organization_id,title,body,shortcut,category,created_by_membership_id,updated_by_membership_id)
    values(${input.actor.organizationId},${input.title.trim()},${input.body.trim()},${input.shortcut?.trim().toLowerCase() ?? null},${input.category?.trim() ?? null},${input.actor.membershipId},${input.actor.membershipId}) returning id,title,body,shortcut,category,status,version::text,created_at,updated_at`.execute(
      tx,
    );
    const row = result.rows[0]!;
    await appendAuditEvent(tx, {
      organizationId: input.actor.organizationId,
      actorType: 'USER',
      actorId: input.actor.actorId,
      membershipId: input.actor.membershipId,
      action: 'messaging.saved_reply.created',
      targetType: 'messaging.saved_reply',
      targetId: row.id,
      metadata: { category: row.category },
    });
    await appendRealtimeEvent(tx as Db, {
      organizationId: input.actor.organizationId,
      audienceType: 'ORGANIZATION',
      eventType: 'messaging.saved_reply.changed.v1',
      aggregateId: row.id,
      aggregateVersion: row.version,
      payload: { savedReplyId: row.id, status: row.status },
    });
    return mapSavedReply(row);
  });
}

export async function updateSavedReply(
  db: Db,
  input: {
    actor: MessagingActorContext;
    savedReplyId: string;
    title?: string;
    body?: string;
    shortcut?: string | null;
    category?: string | null;
    status?: 'ACTIVE' | 'ARCHIVED';
    expectedVersion: string;
  },
): Promise<SavedReplyView> {
  return db.transaction().execute(async (tx) => {
    const result = await sql<{
      id: string;
      title: string;
      body: string;
      shortcut: string | null;
      category: string | null;
      status: 'ACTIVE' | 'ARCHIVED';
      version: string;
      created_at: Date;
      updated_at: Date;
    }>`update messaging.saved_replies set title=coalesce(${input.title?.trim() ?? null},title),body=coalesce(${input.body?.trim() ?? null},body),
    shortcut=case when ${input.shortcut === undefined} then shortcut else ${input.shortcut?.trim().toLowerCase() ?? null} end,
    category=case when ${input.category === undefined} then category else ${input.category?.trim() ?? null} end,
    status=coalesce(${input.status ?? null},status),updated_by_membership_id=${input.actor.membershipId},updated_at=now(),version=version+1
    where organization_id=${input.actor.organizationId} and id=${input.savedReplyId} and version=${input.expectedVersion}::bigint
    returning id,title,body,shortcut,category,status,version::text,created_at,updated_at`.execute(
      tx,
    );
    if (!result.rows[0])
      throw new MessagingDomainError('STALE_VERSION', 'Saved reply changed before this request.');
    const row = result.rows[0];
    await appendAuditEvent(tx, {
      organizationId: input.actor.organizationId,
      actorType: 'USER',
      actorId: input.actor.actorId,
      membershipId: input.actor.membershipId,
      action: 'messaging.saved_reply.updated',
      targetType: 'messaging.saved_reply',
      targetId: row.id,
      metadata: { status: row.status, category: row.category },
    });
    await appendRealtimeEvent(tx as Db, {
      organizationId: input.actor.organizationId,
      audienceType: 'ORGANIZATION',
      eventType: 'messaging.saved_reply.changed.v1',
      aggregateId: row.id,
      aggregateVersion: row.version,
      payload: { savedReplyId: row.id, status: row.status },
    });
    return mapSavedReply(row);
  });
}

function mapFollowUp(row: {
  id: string;
  conversation_id: string;
  responsible_membership_id: string;
  created_by_membership_id: string;
  due_at: Date;
  note: string | null;
  status: 'PENDING' | 'COMPLETED' | 'CANCELLED';
  completed_at: Date | null;
  cancelled_at: Date | null;
  reminder_sent_at: Date | null;
  version: string;
  created_at: Date;
  updated_at: Date;
}): FollowUpView {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    responsibleMembershipId: row.responsible_membership_id,
    createdByMembershipId: row.created_by_membership_id,
    dueAt: row.due_at.toISOString(),
    note: row.note,
    status: row.status,
    isOverdue: row.status === 'PENDING' && row.due_at.getTime() < Date.now(),
    completedAt: row.completed_at?.toISOString() ?? null,
    cancelledAt: row.cancelled_at?.toISOString() ?? null,
    reminderSentAt: row.reminder_sent_at?.toISOString() ?? null,
    version: row.version,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export async function listFollowUps(
  db: Db,
  input: {
    actor: MessagingActorContext;
    access: ConversationAccess;
    conversationId?: string;
    status?: 'PENDING' | 'COMPLETED' | 'CANCELLED';
    mine?: boolean;
    limit?: number;
  },
): Promise<readonly FollowUpView[]> {
  if (input.conversationId)
    await ensureConversationAccess(db, input.actor, input.access, input.conversationId);
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 100);
  const accessFilter =
    input.access === 'ALL'
      ? sql`true`
      : sql`(conversation.assignee_membership_id is null or conversation.assignee_membership_id=${input.actor.membershipId})`;
  const result = await sql<{
    id: string;
    conversation_id: string;
    responsible_membership_id: string;
    created_by_membership_id: string;
    due_at: Date;
    note: string | null;
    status: 'PENDING' | 'COMPLETED' | 'CANCELLED';
    completed_at: Date | null;
    cancelled_at: Date | null;
    reminder_sent_at: Date | null;
    version: string;
    created_at: Date;
    updated_at: Date;
  }>`select follow_up.id,follow_up.conversation_id,follow_up.responsible_membership_id,follow_up.created_by_membership_id,follow_up.due_at,follow_up.note,follow_up.status,follow_up.completed_at,follow_up.cancelled_at,follow_up.reminder_sent_at,follow_up.version::text,follow_up.created_at,follow_up.updated_at
    from messaging.conversation_follow_ups follow_up join messaging.conversations conversation on conversation.organization_id=follow_up.organization_id and conversation.id=follow_up.conversation_id
    where follow_up.organization_id=${input.actor.organizationId} and ${accessFilter} and (${input.conversationId ?? null}::uuid is null or follow_up.conversation_id=${input.conversationId ?? null}::uuid)
      and (${input.status ?? null}::text is null or follow_up.status=${input.status ?? null}) and (${input.mine ?? false}=false or follow_up.responsible_membership_id=${input.actor.membershipId})
    order by case when follow_up.status='PENDING' then 0 else 1 end,follow_up.due_at,follow_up.id limit ${limit}`.execute(
    db,
  );
  return result.rows.map(mapFollowUp);
}

export async function createFollowUp(
  db: Db,
  input: {
    actor: MessagingActorContext;
    access: ConversationAccess;
    conversationId: string;
    responsibleMembershipId: string;
    dueAt: string;
    note?: string;
  },
): Promise<FollowUpView> {
  const dueAt = new Date(input.dueAt);
  if (Number.isNaN(dueAt.getTime()))
    throw new MessagingDomainError('VALIDATION_FAILED', 'Follow-up due time is invalid.');
  return db.transaction().execute(async (tx) => {
    await ensureConversationAccess(tx as Db, input.actor, input.access, input.conversationId);
    await ensureEligibleMembership(
      tx as Db,
      input.actor.organizationId,
      input.responsibleMembershipId,
    );
    const result = await sql<{
      id: string;
      conversation_id: string;
      responsible_membership_id: string;
      created_by_membership_id: string;
      due_at: Date;
      note: string | null;
      status: 'PENDING' | 'COMPLETED' | 'CANCELLED';
      completed_at: Date | null;
      cancelled_at: Date | null;
      reminder_sent_at: Date | null;
      version: string;
      created_at: Date;
      updated_at: Date;
    }>`insert into messaging.conversation_follow_ups(organization_id,conversation_id,responsible_membership_id,created_by_membership_id,due_at,note)
    values(${input.actor.organizationId},${input.conversationId},${input.responsibleMembershipId},${input.actor.membershipId},${dueAt},${input.note?.trim() ?? null})
    returning id,conversation_id,responsible_membership_id,created_by_membership_id,due_at,note,status,completed_at,cancelled_at,reminder_sent_at,version::text,created_at,updated_at`.execute(
      tx,
    );
    const row = result.rows[0]!;
    await recordConversationEvent(tx as Db, {
      actor: input.actor,
      conversationId: row.conversation_id,
      eventType: 'FOLLOW_UP_CREATED',
      realtimeType: 'messaging.follow_up.created.v1',
      version: row.version,
      toValue: {
        followUpId: row.id,
        dueAt: row.due_at.toISOString(),
        responsibleMembershipId: row.responsible_membership_id,
      },
      payload: { conversationId: row.conversation_id, followUpId: row.id },
    });
    await appendAuditEvent(tx, {
      organizationId: input.actor.organizationId,
      actorType: 'USER',
      actorId: input.actor.actorId,
      membershipId: input.actor.membershipId,
      action: 'messaging.follow_up.created',
      targetType: 'messaging.follow_up',
      targetId: row.id,
      metadata: { conversationId: row.conversation_id },
    });
    return mapFollowUp(row);
  });
}

export async function transitionFollowUp(
  db: Db,
  input: {
    actor: MessagingActorContext;
    followUpId: string;
    status: 'COMPLETED' | 'CANCELLED';
    expectedVersion: string;
  },
): Promise<FollowUpView> {
  return db.transaction().execute(async (tx) => {
    const result = await sql<{
      id: string;
      conversation_id: string;
      responsible_membership_id: string;
      created_by_membership_id: string;
      due_at: Date;
      note: string | null;
      status: 'PENDING' | 'COMPLETED' | 'CANCELLED';
      completed_at: Date | null;
      cancelled_at: Date | null;
      reminder_sent_at: Date | null;
      version: string;
      created_at: Date;
      updated_at: Date;
    }>`update messaging.conversation_follow_ups set status=${input.status},
    completed_at=case when ${input.status}='COMPLETED' then now() else null end,completed_by_membership_id=case when ${input.status}='COMPLETED' then ${input.actor.membershipId}::uuid else null end,
    cancelled_at=case when ${input.status}='CANCELLED' then now() else null end,cancelled_by_membership_id=case when ${input.status}='CANCELLED' then ${input.actor.membershipId}::uuid else null end,
    updated_at=now(),version=version+1 where organization_id=${input.actor.organizationId} and id=${input.followUpId} and status='PENDING' and version=${input.expectedVersion}::bigint
    returning id,conversation_id,responsible_membership_id,created_by_membership_id,due_at,note,status,completed_at,cancelled_at,reminder_sent_at,version::text,created_at,updated_at`.execute(
      tx,
    );
    if (!result.rows[0])
      throw new MessagingDomainError('STALE_VERSION', 'Follow-up changed before this request.');
    const row = result.rows[0];
    await recordConversationEvent(tx as Db, {
      actor: input.actor,
      conversationId: row.conversation_id,
      eventType: 'FOLLOW_UP_STATUS_CHANGED',
      realtimeType: 'messaging.follow_up.status_changed.v1',
      version: row.version,
      fromValue: 'PENDING',
      toValue: input.status,
      payload: {
        conversationId: row.conversation_id,
        followUpId: row.id,
        status: input.status,
      },
    });
    await appendAuditEvent(tx, {
      organizationId: input.actor.organizationId,
      actorType: 'USER',
      actorId: input.actor.actorId,
      membershipId: input.actor.membershipId,
      action: `messaging.follow_up.${input.status.toLowerCase()}`,
      targetType: 'messaging.follow_up',
      targetId: row.id,
      metadata: { conversationId: row.conversation_id },
    });
    return mapFollowUp(row);
  });
}

export async function updateFollowUp(
  db: Db,
  input: {
    actor: MessagingActorContext;
    followUpId: string;
    responsibleMembershipId: string;
    dueAt: string;
    note?: string | null;
    expectedVersion: string;
  },
): Promise<FollowUpView> {
  const dueAt = new Date(input.dueAt);
  if (Number.isNaN(dueAt.getTime()))
    throw new MessagingDomainError('VALIDATION_FAILED', 'Follow-up due time is invalid.');
  return db.transaction().execute(async (tx) => {
    await ensureEligibleMembership(
      tx as Db,
      input.actor.organizationId,
      input.responsibleMembershipId,
    );
    const result = await sql<{
      id: string;
      conversation_id: string;
      responsible_membership_id: string;
      created_by_membership_id: string;
      due_at: Date;
      note: string | null;
      status: 'PENDING' | 'COMPLETED' | 'CANCELLED';
      completed_at: Date | null;
      cancelled_at: Date | null;
      reminder_sent_at: Date | null;
      version: string;
      created_at: Date;
      updated_at: Date;
    }>`update messaging.conversation_follow_ups set responsible_membership_id=${input.responsibleMembershipId},due_at=${dueAt},
    note=${input.note?.trim() ?? null},reminder_sent_at=null,updated_at=now(),version=version+1
    where organization_id=${input.actor.organizationId} and id=${input.followUpId} and status='PENDING' and version=${input.expectedVersion}::bigint
    returning id,conversation_id,responsible_membership_id,created_by_membership_id,due_at,note,status,completed_at,cancelled_at,reminder_sent_at,version::text,created_at,updated_at`.execute(
      tx,
    );
    if (!result.rows[0])
      throw new MessagingDomainError('STALE_VERSION', 'Follow-up changed before this request.');
    const row = result.rows[0];
    await recordConversationEvent(tx as Db, {
      actor: input.actor,
      conversationId: row.conversation_id,
      eventType: 'FOLLOW_UP_UPDATED',
      realtimeType: 'messaging.follow_up.updated.v1',
      version: row.version,
      toValue: {
        followUpId: row.id,
        dueAt: row.due_at.toISOString(),
        responsibleMembershipId: row.responsible_membership_id,
      },
      payload: { conversationId: row.conversation_id, followUpId: row.id },
    });
    await appendAuditEvent(tx, {
      organizationId: input.actor.organizationId,
      actorType: 'USER',
      actorId: input.actor.actorId,
      membershipId: input.actor.membershipId,
      action: 'messaging.follow_up.updated',
      targetType: 'messaging.follow_up',
      targetId: row.id,
      metadata: { conversationId: row.conversation_id },
    });
    return mapFollowUp(row);
  });
}

export async function bulkUpdateConversations(
  db: Db,
  input: {
    actor: MessagingActorContext;
    access: ConversationAccess;
    items: readonly { conversationId: string; version: string }[];
    action:
      | { type: 'ASSIGN'; assigneeMembershipId: string | null; reason?: string }
      | { type: 'PRIORITY'; priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT'; isStarred?: boolean }
      | {
          type: 'STATUS';
          status: 'NEW' | 'OPEN' | 'PENDING' | 'RESOLVED' | 'CLOSED';
          reason?: string;
        }
      | { type: 'TAG'; tagId: string; assigned: boolean };
  },
): Promise<readonly { conversationId: string; ok: boolean; code?: string; version?: string }[]> {
  if (
    input.items.length < 1 ||
    input.items.length > 100 ||
    new Set(input.items.map((item) => item.conversationId)).size !== input.items.length
  )
    throw new MessagingDomainError(
      'VALIDATION_FAILED',
      'Bulk operations require 1 to 100 unique conversations.',
    );
  const outcomes: { conversationId: string; ok: boolean; code?: string; version?: string }[] = [];
  for (const item of input.items) {
    try {
      let updated: ConversationDetail | undefined;
      if (input.action.type === 'ASSIGN')
        updated = await assignConversation(db, {
          actor: input.actor,
          access: input.access,
          conversationId: item.conversationId,
          assigneeMembershipId: input.action.assigneeMembershipId,
          expectedVersion: item.version,
          ...(input.action.reason ? { reason: input.action.reason } : {}),
        });
      if (input.action.type === 'PRIORITY')
        updated = await setConversationPriority(db, {
          actor: input.actor,
          access: input.access,
          conversationId: item.conversationId,
          priority: input.action.priority,
          expectedVersion: item.version,
          ...(input.action.isStarred === undefined ? {} : { isStarred: input.action.isStarred }),
        });
      if (input.action.type === 'STATUS') {
        updated = await transitionConversation(db, {
          actor: input.actor,
          access: input.access,
          conversationId: item.conversationId,
          status: input.action.status,
          expectedVersion: item.version,
          ...(input.action.reason ? { reason: input.action.reason } : {}),
        });
      }
      if (input.action.type === 'TAG') {
        await setConversationTag(db, {
          actor: input.actor,
          access: input.access,
          conversationId: item.conversationId,
          tagId: input.action.tagId,
          assigned: input.action.assigned,
        });
        updated = await ensureConversationAccess(
          db,
          input.actor,
          input.access,
          item.conversationId,
        );
      }
      outcomes.push({
        conversationId: item.conversationId,
        ok: true,
        ...(updated ? { version: updated.version } : {}),
      });
    } catch (error) {
      outcomes.push({
        conversationId: item.conversationId,
        ok: false,
        code: error instanceof MessagingDomainError ? error.code : 'INTERNAL_ERROR',
      });
    }
  }
  return outcomes;
}

export async function processDueMessagingFollowUps(db: Db, limit = 50): Promise<number> {
  return db.transaction().execute(async (tx) => {
    const due = await sql<{
      id: string;
      organization_id: string;
      conversation_id: string;
      responsible_membership_id: string;
    }>`select follow_up.id,follow_up.organization_id,follow_up.conversation_id,follow_up.responsible_membership_id
      from messaging.conversation_follow_ups follow_up join iam.organization_memberships membership on membership.organization_id=follow_up.organization_id and membership.id=follow_up.responsible_membership_id
      where follow_up.status='PENDING' and follow_up.reminder_sent_at is null and follow_up.due_at<=now() and membership.status='ACTIVE'
      order by follow_up.due_at,follow_up.id for update of follow_up skip locked limit ${Math.min(Math.max(limit, 1), 100)}`.execute(
      tx,
    );
    for (const item of due.rows) {
      await sql`update messaging.conversation_follow_ups set reminder_sent_at=now(),updated_at=now(),version=version+1 where id=${item.id}`.execute(
        tx,
      );
      await sql`insert into platform.outbox_events(organization_id,event_type,event_version,aggregate_type,aggregate_id,payload,occurred_at)
        values(${item.organization_id},'messaging.follow_up.due.v1',1,'messaging.follow_up',${item.id},${JSON.stringify({ followUpId: item.id, conversationId: item.conversation_id, recipientMembershipId: item.responsible_membership_id })}::jsonb,now())`.execute(
        tx,
      );
      await appendRealtimeEvent(tx as Db, {
        organizationId: item.organization_id,
        audienceType: 'MEMBERSHIP',
        audienceId: item.responsible_membership_id,
        conversationId: item.conversation_id,
        eventType: 'messaging.follow_up.due.v1',
        aggregateId: item.id,
        aggregateVersion: '1',
        payload: { followUpId: item.id, conversationId: item.conversation_id },
      });
    }
    return due.rows.length;
  });
}

export async function getInboxCounts(
  db: Db,
  input: { organizationId: string; membershipId: string; access: ConversationAccess },
): Promise<InboxCounts> {
  const allowed =
    input.access === 'ALL'
      ? sql`true`
      : sql`(conversation.assignee_membership_id is null or conversation.assignee_membership_id=${input.membershipId})`;
  const result = await sql<Record<string, string>>`select
    count(*)::text all_count,count(*) filter(where conversation.assignee_membership_id=${input.membershipId})::text mine,
    count(*) filter(where conversation.assignee_membership_id is null and conversation.status in ('NEW','OPEN','PENDING'))::text unassigned,
    count(*) filter(where exists(select 1 from messaging.messages message where message.organization_id=conversation.organization_id and message.conversation_id=conversation.id and message.direction='INBOUND' and message.sequence>coalesce(cursor.last_read_sequence,0)))::text unread,
    count(*) filter(where conversation.status='NEW')::text new_count,count(*) filter(where conversation.status='OPEN')::text open_count,
    count(*) filter(where conversation.status='PENDING')::text pending,count(*) filter(where conversation.status='RESOLVED')::text resolved,count(*) filter(where conversation.status='CLOSED')::text closed,
    count(*) filter(where conversation.status in ('NEW','OPEN') and conversation.last_inbound_at is not null and (conversation.last_outbound_at is null or conversation.last_inbound_at>conversation.last_outbound_at))::text needing_reply,
    count(*) filter(where exists(select 1 from messaging.conversation_follow_ups follow_up where follow_up.organization_id=conversation.organization_id and follow_up.conversation_id=conversation.id and follow_up.status='PENDING'))::text pending_follow_ups,
    count(*) filter(where exists(select 1 from messaging.conversation_follow_ups follow_up where follow_up.organization_id=conversation.organization_id and follow_up.conversation_id=conversation.id and follow_up.status='PENDING' and follow_up.due_at<now()))::text overdue_follow_ups
    from messaging.conversations conversation left join messaging.conversation_read_cursors cursor on cursor.organization_id=conversation.organization_id and cursor.conversation_id=conversation.id and cursor.reader_type='MEMBERSHIP' and cursor.reader_id=${input.membershipId}
    where conversation.organization_id=${input.organizationId} and ${allowed}`.execute(db);
  const row = result.rows[0] ?? {};
  const n = (key: string) => Number(row[key] ?? 0);
  return {
    all: n('all_count'),
    mine: n('mine'),
    unassigned: n('unassigned'),
    unread: n('unread'),
    new: n('new_count'),
    open: n('open_count'),
    pending: n('pending'),
    resolved: n('resolved'),
    closed: n('closed'),
    needingReply: n('needing_reply'),
    pendingFollowUps: n('pending_follow_ups'),
    overdueFollowUps: n('overdue_follow_ups'),
  };
}

export async function listConversationActivity(
  db: Db,
  input: {
    actor: MessagingActorContext;
    access: ConversationAccess;
    conversationId: string;
    limit?: number;
  },
): Promise<readonly ConversationActivityView[]> {
  await ensureConversationAccess(db, input.actor, input.access, input.conversationId);
  const limit = Math.min(Math.max(input.limit ?? 100, 1), 200);
  const result = await sql<{
    id: string;
    event_type: string;
    actor_membership_id: string | null;
    display_name: string | null;
    from_value: unknown;
    to_value: unknown;
    reason: string | null;
    created_at: Date;
  }>`select event.id::text,event.event_type,event.actor_membership_id,membership.display_name,event.from_value,event.to_value,event.reason,event.created_at
    from messaging.conversation_events event left join iam.organization_memberships membership on membership.organization_id=event.organization_id and membership.id=event.actor_membership_id
    where event.organization_id=${input.actor.organizationId} and event.conversation_id=${input.conversationId} order by event.created_at desc,event.id desc limit ${limit}`.execute(
    db,
  );
  return result.rows.map((row) => ({
    id: row.id,
    type: row.event_type,
    actorMembershipId: row.actor_membership_id,
    actorDisplayName: row.display_name,
    fromValue: row.from_value,
    toValue: row.to_value,
    reason: row.reason,
    createdAt: row.created_at.toISOString(),
  }));
}

export async function listAssignmentHistory(
  db: Db,
  input: { actor: MessagingActorContext; access: ConversationAccess; conversationId: string },
): Promise<readonly Record<string, unknown>[]> {
  await ensureConversationAccess(db, input.actor, input.access, input.conversationId);
  const result = await sql<{
    id: string;
    previous_assignee_membership_id: string | null;
    new_assignee_membership_id: string | null;
    actor_membership_id: string;
    assignment_source: string;
    reason: string | null;
    conversation_version: string;
    created_at: Date;
  }>`select id::text,previous_assignee_membership_id,new_assignee_membership_id,actor_membership_id,assignment_source,reason,conversation_version::text,created_at from messaging.conversation_assignment_events where organization_id=${input.actor.organizationId} and conversation_id=${input.conversationId} order by created_at desc,id desc`.execute(
    db,
  );
  return result.rows.map((row) => ({
    id: row.id,
    previousAssigneeMembershipId: row.previous_assignee_membership_id,
    newAssigneeMembershipId: row.new_assignee_membership_id,
    actorMembershipId: row.actor_membership_id,
    source: row.assignment_source,
    reason: row.reason,
    conversationVersion: row.conversation_version,
    createdAt: row.created_at.toISOString(),
  }));
}
