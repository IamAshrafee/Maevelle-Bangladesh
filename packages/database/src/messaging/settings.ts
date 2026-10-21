import { sql, type Kysely } from 'kysely';

import type { BusinessHoursView } from '@maevelle/contracts/messaging';
import type { DatabaseSchema } from '../index.js';
import { appendAuditEvent } from '../platform.js';
import { appendRealtimeEvent, MessagingDomainError, type MessagingActorContext } from './index.js';

type Db = Kysely<DatabaseSchema>;
type Interval = { start: string; end: string };
type WeeklySchedule = Record<string, readonly Interval[]>;

const weekdays = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

export async function getChannelSettings(
  db: Db,
  input: { organizationId: string; connectionId: string },
) {
  const result = await sql<{
    id: string;
    channel_kind: 'WEBSITE' | 'FACEBOOK' | 'INSTAGRAM';
    display_name: string;
    status: string;
    configuration: Record<string, unknown>;
    version: string;
  }>`select id,channel_kind,display_name,status,configuration,version::text from messaging.channel_connections where organization_id=${input.organizationId} and id=${input.connectionId}`.execute(
    db,
  );
  const row = result.rows[0];
  if (!row)
    throw new MessagingDomainError('CONVERSATION_NOT_FOUND', 'Messaging connection was not found.');
  return {
    id: row.id,
    channelKind: row.channel_kind,
    displayName: row.display_name,
    status: row.status,
    enabled: row.status !== 'DISABLED',
    acceptsOfflineMessages: row.configuration.acceptsOfflineMessages !== false,
    greeting:
      typeof row.configuration.greeting === 'string'
        ? row.configuration.greeting
        : 'How can we help?',
    offlineMessage:
      typeof row.configuration.offlineMessage === 'string'
        ? row.configuration.offlineMessage
        : 'Send us a message and our team will reply as soon as possible.',
    version: row.version,
  };
}

export async function updateChannelSettings(
  db: Db,
  input: {
    actor: MessagingActorContext;
    connectionId: string;
    enabled: boolean;
    acceptsOfflineMessages: boolean;
    greeting: string;
    offlineMessage: string;
    expectedVersion: string;
  },
) {
  if (
    !input.greeting.trim() ||
    input.greeting.trim().length > 240 ||
    !input.offlineMessage.trim() ||
    input.offlineMessage.trim().length > 500
  )
    throw new MessagingDomainError(
      'VALIDATION_FAILED',
      'Greeting and offline message lengths are invalid.',
    );
  await db.transaction().execute(async (tx) => {
    const result = await sql<{
      id: string;
    }>`update messaging.channel_connections set status=case when ${input.enabled} then case when status='DISABLED' then 'ACTIVE' else status end else 'DISABLED' end,configuration=configuration||${JSON.stringify({ acceptsOfflineMessages: input.acceptsOfflineMessages, greeting: input.greeting.trim(), offlineMessage: input.offlineMessage.trim() })}::jsonb,updated_at=now(),version=version+1 where organization_id=${input.actor.organizationId} and id=${input.connectionId} and version=${input.expectedVersion}::bigint returning id`.execute(
      tx,
    );
    if (!result.rows[0])
      throw new MessagingDomainError(
        'STALE_VERSION',
        'Messaging connection changed before this request.',
      );
    await appendAuditEvent(tx, {
      organizationId: input.actor.organizationId,
      actorType: 'USER',
      actorId: input.actor.actorId,
      membershipId: input.actor.membershipId,
      action: 'messaging.channel.settings_updated',
      targetType: 'messaging.channel_connection',
      targetId: input.connectionId,
      metadata: {
        enabled: input.enabled,
        acceptsOfflineMessages: input.acceptsOfflineMessages,
      },
    });
    await appendRealtimeEvent(tx as Db, {
      organizationId: input.actor.organizationId,
      audienceType: 'ORGANIZATION',
      eventType: 'messaging.channel.settings_changed.v1',
      aggregateId: input.connectionId,
      aggregateVersion: String(Number(input.expectedVersion) + 1),
      payload: { connectionId: input.connectionId },
    });
  });
  return getChannelSettings(db, {
    organizationId: input.actor.organizationId,
    connectionId: input.connectionId,
  });
}

function validTime(value: string): boolean {
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function validateTimezone(value: string): void {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format(new Date());
  } catch {
    throw new MessagingDomainError('VALIDATION_FAILED', 'Timezone must be a valid IANA timezone.');
  }
}

function validateSchedule(value: unknown): WeeklySchedule {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new MessagingDomainError('VALIDATION_FAILED', 'Weekly schedule must be an object.');
  const schedule = value as Record<string, unknown>;
  for (const [day, intervals] of Object.entries(schedule)) {
    if (
      !weekdays.includes(day as (typeof weekdays)[number]) ||
      !Array.isArray(intervals) ||
      intervals.length > 4
    )
      throw new MessagingDomainError(
        'VALIDATION_FAILED',
        'Weekly schedule contains an invalid day or interval list.',
      );
    for (const interval of intervals) {
      if (!interval || typeof interval !== 'object')
        throw new MessagingDomainError('VALIDATION_FAILED', 'Business hour intervals are invalid.');
      const candidate = interval as Record<string, unknown>;
      if (
        typeof candidate.start !== 'string' ||
        typeof candidate.end !== 'string' ||
        !validTime(candidate.start) ||
        !validTime(candidate.end) ||
        candidate.start === candidate.end
      )
        throw new MessagingDomainError(
          'VALIDATION_FAILED',
          'Business hour intervals require distinct HH:mm start and end values.',
        );
    }
  }
  return Object.fromEntries(
    weekdays.map((day) => [day, (schedule[day] as Interval[] | undefined) ?? []]),
  );
}

function mapHours(row: {
  id: string;
  connection_id: string | null;
  timezone: string;
  weekly_schedule: WeeklySchedule;
  offline_accepts_messages: boolean;
  manual_closure_until: Date | null;
  version: string;
  exceptions: unknown;
}): BusinessHoursView {
  const exceptions = Array.isArray(row.exceptions)
    ? (row.exceptions as {
        id: string;
        localDate: string;
        intervals: Interval[];
        isClosed: boolean;
        label: string | null;
      }[])
    : [];
  return {
    id: row.id,
    connectionId: row.connection_id,
    timezone: row.timezone,
    weeklySchedule: row.weekly_schedule,
    exceptions,
    offlineAcceptsMessages: row.offline_accepts_messages,
    manualClosureUntil: row.manual_closure_until?.toISOString() ?? null,
    version: row.version,
  };
}

export async function getBusinessHours(
  db: Db,
  input: { organizationId: string; connectionId?: string | null },
): Promise<BusinessHoursView | null> {
  const result = await sql<{
    id: string;
    connection_id: string | null;
    timezone: string;
    weekly_schedule: WeeklySchedule;
    offline_accepts_messages: boolean;
    manual_closure_until: Date | null;
    version: string;
    exceptions: unknown;
  }>`select hours.id,hours.connection_id,hours.timezone,hours.weekly_schedule,hours.offline_accepts_messages,hours.manual_closure_until,hours.version::text,
    coalesce((select jsonb_agg(jsonb_build_object('id',exception.id,'localDate',exception.local_date::text,'intervals',exception.intervals,'isClosed',exception.is_closed,'label',exception.label) order by exception.local_date) from messaging.business_hour_exceptions exception where exception.organization_id=hours.organization_id and exception.business_hours_id=hours.id),'[]'::jsonb) exceptions
    from messaging.business_hours hours where hours.organization_id=${input.organizationId} and hours.connection_id is not distinct from ${input.connectionId ?? null}::uuid`.execute(
    db,
  );
  return result.rows[0] ? mapHours(result.rows[0]) : null;
}

export async function upsertBusinessHours(
  db: Db,
  input: {
    actor: MessagingActorContext;
    connectionId?: string | null;
    timezone: string;
    weeklySchedule: unknown;
    offlineAcceptsMessages: boolean;
    manualClosureUntil?: string | null;
    expectedVersion?: string;
    exceptions?: readonly {
      localDate: string;
      intervals: readonly Interval[];
      isClosed: boolean;
      label?: string | null;
    }[];
  },
): Promise<BusinessHoursView> {
  validateTimezone(input.timezone);
  const schedule = validateSchedule(input.weeklySchedule);
  const manualClosure = input.manualClosureUntil ? new Date(input.manualClosureUntil) : null;
  if (manualClosure && Number.isNaN(manualClosure.getTime()))
    throw new MessagingDomainError('VALIDATION_FAILED', 'Manual closure time is invalid.');
  for (const exception of input.exceptions ?? []) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(exception.localDate))
      throw new MessagingDomainError('VALIDATION_FAILED', 'Exception date is invalid.');
    validateSchedule({ mon: exception.intervals });
  }
  return db.transaction().execute(async (tx) => {
    const existing = await sql<{
      id: string;
      version: string;
    }>`select id,version::text from messaging.business_hours where organization_id=${input.actor.organizationId} and connection_id is not distinct from ${input.connectionId ?? null}::uuid for update`.execute(
      tx,
    );
    if (
      existing.rows[0] &&
      input.expectedVersion &&
      existing.rows[0].version !== input.expectedVersion
    )
      throw new MessagingDomainError(
        'STALE_VERSION',
        'Business hours changed before this request.',
        { currentVersion: existing.rows[0].version },
      );
    let id: string;
    if (existing.rows[0]) {
      id = existing.rows[0].id;
      await sql`update messaging.business_hours set timezone=${input.timezone},weekly_schedule=${JSON.stringify(schedule)}::jsonb,offline_accepts_messages=${input.offlineAcceptsMessages},manual_closure_until=${manualClosure},updated_by_membership_id=${input.actor.membershipId},updated_at=now(),version=version+1 where organization_id=${input.actor.organizationId} and id=${id}`.execute(
        tx,
      );
      await sql`delete from messaging.business_hour_exceptions where organization_id=${input.actor.organizationId} and business_hours_id=${id}`.execute(
        tx,
      );
    } else {
      const created = await sql<{
        id: string;
      }>`insert into messaging.business_hours(organization_id,connection_id,timezone,weekly_schedule,offline_accepts_messages,manual_closure_until,created_by_membership_id,updated_by_membership_id) values(${input.actor.organizationId},${input.connectionId ?? null},${input.timezone},${JSON.stringify(schedule)}::jsonb,${input.offlineAcceptsMessages},${manualClosure},${input.actor.membershipId},${input.actor.membershipId}) returning id`.execute(
        tx,
      );
      id = created.rows[0]!.id;
    }
    for (const exception of input.exceptions ?? []) {
      await sql`insert into messaging.business_hour_exceptions(organization_id,business_hours_id,local_date,intervals,is_closed,label) values(${input.actor.organizationId},${id},${exception.localDate}::date,${JSON.stringify(exception.intervals)}::jsonb,${exception.isClosed},${exception.label ?? null})`.execute(
        tx,
      );
    }
    await appendAuditEvent(tx, {
      organizationId: input.actor.organizationId,
      actorType: 'USER',
      actorId: input.actor.actorId,
      membershipId: input.actor.membershipId,
      action: 'messaging.business_hours.updated',
      targetType: 'messaging.business_hours',
      targetId: id,
      afterDiff: {
        connectionId: input.connectionId ?? null,
        timezone: input.timezone,
        offlineAcceptsMessages: input.offlineAcceptsMessages,
      },
    });
    return (await getBusinessHours(tx as Db, {
      organizationId: input.actor.organizationId,
      connectionId: input.connectionId ?? null,
    }))!;
  });
}

function localParts(
  at: Date,
  timeZone: string,
): { date: string; weekday: string; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(at);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    weekday: get('weekday').slice(0, 3).toLowerCase(),
    minutes: Number(get('hour')) * 60 + Number(get('minute')),
  };
}

function timeMinutes(value: string): number {
  const [hour, minute] = value.split(':').map(Number);
  return hour! * 60 + minute!;
}

export async function evaluateBusinessHours(
  db: Db,
  input: { organizationId: string; connectionId: string; at?: Date },
): Promise<{
  isOpen: boolean;
  acceptsMessages: boolean;
  timezone: string;
  reason: 'OPEN' | 'OUTSIDE_HOURS' | 'MANUAL_CLOSURE' | 'UNCONFIGURED';
}> {
  const configured =
    (await getBusinessHours(db, {
      organizationId: input.organizationId,
      connectionId: input.connectionId,
    })) ??
    (await getBusinessHours(db, { organizationId: input.organizationId, connectionId: null }));
  if (!configured)
    return { isOpen: true, acceptsMessages: true, timezone: 'Asia/Dhaka', reason: 'UNCONFIGURED' };
  const at = input.at ?? new Date();
  if (configured.manualClosureUntil && new Date(configured.manualClosureUntil) > at)
    return {
      isOpen: false,
      acceptsMessages: configured.offlineAcceptsMessages,
      timezone: configured.timezone,
      reason: 'MANUAL_CLOSURE',
    };
  const local = localParts(at, configured.timezone);
  const exception = configured.exceptions.find((item) => item.localDate === local.date);
  const intervals = exception
    ? exception.isClosed
      ? []
      : exception.intervals
    : (configured.weeklySchedule[local.weekday] ?? []);
  let isOpen = intervals.some((interval) => {
    const start = timeMinutes(interval.start),
      end = timeMinutes(interval.end);
    return end > start ? local.minutes >= start && local.minutes < end : local.minutes >= start;
  });
  if (!isOpen && !exception) {
    const currentIndex = weekdays.indexOf(local.weekday as (typeof weekdays)[number]);
    const previousDay = weekdays[(currentIndex + 6) % 7]!;
    isOpen = (configured.weeklySchedule[previousDay] ?? []).some((interval) => {
      const start = timeMinutes(interval.start),
        end = timeMinutes(interval.end);
      return end < start && local.minutes < end;
    });
  }
  return {
    isOpen,
    acceptsMessages: isOpen || configured.offlineAcceptsMessages,
    timezone: configured.timezone,
    reason: isOpen ? 'OPEN' : 'OUTSIDE_HOURS',
  };
}

export async function listAssignmentRules(db: Db, organizationId: string) {
  const result = await sql<{
    id: string;
    name: string;
    position: number;
    is_enabled: boolean;
    conditions: Record<string, unknown>;
    actions: Record<string, unknown>;
    version: string;
  }>`select id,name,position,is_enabled,conditions,actions,version::text from messaging.assignment_rules where organization_id=${organizationId} order by position,id`.execute(
    db,
  );
  return result.rows.map((row) => ({
    id: row.id,
    name: row.name,
    position: row.position,
    isEnabled: row.is_enabled,
    conditions: row.conditions,
    actions: row.actions,
    version: row.version,
  }));
}

export async function createAssignmentRule(
  db: Db,
  input: {
    actor: MessagingActorContext;
    name: string;
    position: number;
    isEnabled?: boolean;
    conditions: Record<string, unknown>;
    actions: Record<string, unknown>;
  },
) {
  if (!Number.isInteger(input.position) || input.position < 0)
    throw new MessagingDomainError(
      'VALIDATION_FAILED',
      'Rule position must be a non-negative integer.',
    );
  validateAssignmentRule(input.conditions, input.actions);
  const result = await sql<{
    id: string;
    version: string;
  }>`insert into messaging.assignment_rules(organization_id,name,position,is_enabled,conditions,actions,created_by_membership_id,updated_by_membership_id) values(${input.actor.organizationId},${input.name.trim()},${input.position},${input.isEnabled ?? true},${JSON.stringify(input.conditions)}::jsonb,${JSON.stringify(input.actions)}::jsonb,${input.actor.membershipId},${input.actor.membershipId}) returning id,version::text`.execute(
    db,
  );
  return { id: result.rows[0]!.id, version: result.rows[0]!.version };
}

function validateAssignmentRule(
  conditions: Record<string, unknown>,
  actions: Record<string, unknown>,
): void {
  const conditionKeys = Object.keys(conditions);
  const actionKeys = Object.keys(actions);
  if (
    conditionKeys.some((key) => !['channelKind', 'priority'].includes(key)) ||
    actionKeys.some((key) => !['assign', 'membershipId', 'priority'].includes(key))
  )
    throw new MessagingDomainError(
      'VALIDATION_FAILED',
      'Assignment rule contains unsupported fields.',
    );
  if (
    conditions.channelKind !== undefined &&
    !['WEBSITE', 'FACEBOOK', 'INSTAGRAM'].includes(String(conditions.channelKind))
  )
    throw new MessagingDomainError('VALIDATION_FAILED', 'Assignment rule channel is invalid.');
  if (
    conditions.priority !== undefined &&
    !['LOW', 'NORMAL', 'HIGH', 'URGENT'].includes(String(conditions.priority))
  )
    throw new MessagingDomainError(
      'VALIDATION_FAILED',
      'Assignment rule priority condition is invalid.',
    );
  if (!['UNASSIGNED', 'DEFAULT', 'AVAILABLE'].includes(String(actions.assign ?? '')))
    throw new MessagingDomainError(
      'VALIDATION_FAILED',
      'Assignment rule action must select UNASSIGNED, DEFAULT, or AVAILABLE.',
    );
  if (actions.assign === 'DEFAULT' && typeof actions.membershipId !== 'string')
    throw new MessagingDomainError(
      'VALIDATION_FAILED',
      'Default assignment requires a membershipId.',
    );
  if (
    actions.priority !== undefined &&
    !['LOW', 'NORMAL', 'HIGH', 'URGENT'].includes(String(actions.priority))
  )
    throw new MessagingDomainError(
      'VALIDATION_FAILED',
      'Assignment rule priority action is invalid.',
    );
}

export async function updateAssignmentRule(
  db: Db,
  input: {
    actor: MessagingActorContext;
    ruleId: string;
    name?: string;
    position?: number;
    isEnabled?: boolean;
    conditions?: Record<string, unknown>;
    actions?: Record<string, unknown>;
    expectedVersion: string;
  },
) {
  if (input.conditions || input.actions) {
    const current = await sql<{
      conditions: Record<string, unknown>;
      actions: Record<string, unknown>;
    }>`select conditions,actions from messaging.assignment_rules where organization_id=${input.actor.organizationId} and id=${input.ruleId}`.execute(
      db,
    );
    if (!current.rows[0])
      throw new MessagingDomainError('CONVERSATION_NOT_FOUND', 'Assignment rule was not found.');
    validateAssignmentRule(
      input.conditions ?? current.rows[0].conditions,
      input.actions ?? current.rows[0].actions,
    );
  }
  const result = await sql<{
    id: string;
    version: string;
  }>`update messaging.assignment_rules set name=coalesce(${input.name?.trim() ?? null},name),position=coalesce(${input.position ?? null},position),is_enabled=coalesce(${input.isEnabled ?? null},is_enabled),conditions=coalesce(${input.conditions ? JSON.stringify(input.conditions) : null}::jsonb,conditions),actions=coalesce(${input.actions ? JSON.stringify(input.actions) : null}::jsonb,actions),updated_by_membership_id=${input.actor.membershipId},updated_at=now(),version=version+1 where organization_id=${input.actor.organizationId} and id=${input.ruleId} and version=${input.expectedVersion}::bigint returning id,version::text`.execute(
    db,
  );
  if (!result.rows[0])
    throw new MessagingDomainError('STALE_VERSION', 'Assignment rule changed before this request.');
  return result.rows[0];
}

export async function processMessagingAssignmentRules(db: Db, limit = 25): Promise<number> {
  const candidates = await sql<{
    organization_id: string;
    conversation_id: string;
    channel_kind: string;
    priority: string;
  }>`select conversation.organization_id,conversation.id conversation_id,conversation.channel_kind,conversation.priority from messaging.conversations conversation where conversation.assignee_membership_id is null and conversation.status in ('NEW','OPEN') and exists(select 1 from messaging.assignment_rules rule where rule.organization_id=conversation.organization_id and rule.is_enabled) order by conversation.created_at,conversation.id limit ${Math.min(Math.max(limit, 1), 100)}`.execute(
    db,
  );
  let applied = 0;
  for (const candidate of candidates.rows) {
    const rules = await sql<{
      id: string;
      conditions: Record<string, unknown>;
      actions: Record<string, unknown>;
      updated_by_membership_id: string;
    }>`select id,conditions,actions,updated_by_membership_id from messaging.assignment_rules where organization_id=${candidate.organization_id} and is_enabled order by position,id`.execute(
      db,
    );
    const rule = rules.rows.find(
      (item) =>
        (item.conditions.channelKind === undefined ||
          item.conditions.channelKind === candidate.channel_kind) &&
        (item.conditions.priority === undefined || item.conditions.priority === candidate.priority),
    );
    if (!rule) continue;
    let assignee: string | null = null;
    if (rule.actions.assign === 'DEFAULT' && typeof rule.actions.membershipId === 'string')
      assignee = rule.actions.membershipId;
    if (rule.actions.assign === 'AVAILABLE') {
      const selected = await sql<{
        membership_id: string;
      }>`select availability.membership_id from messaging.agent_availability availability join iam.organization_memberships membership on membership.organization_id=availability.organization_id and membership.id=availability.membership_id where availability.organization_id=${candidate.organization_id} and availability.status='ONLINE' and availability.last_heartbeat_at>now()-interval '2 minutes' and availability.capacity>0 and membership.status='ACTIVE' order by (select count(*) from messaging.conversations work where work.organization_id=availability.organization_id and work.assignee_membership_id=availability.membership_id and work.status in ('NEW','OPEN','PENDING')),availability.updated_at,availability.membership_id limit 1`.execute(
        db,
      );
      assignee = selected.rows[0]?.membership_id ?? null;
    }
    const priority =
      typeof rule.actions.priority === 'string' ? rule.actions.priority : candidate.priority;
    const result = await db.transaction().execute(async (tx) => {
      const updated = await sql<{
        version: string;
      }>`update messaging.conversations set assignee_membership_id=${assignee}::uuid,assigned_at=case when ${assignee}::uuid is null then null else now() end,assigned_by_membership_id=case when ${assignee}::uuid is null then null else ${rule.updated_by_membership_id}::uuid end,priority=${priority},updated_at=now(),version=version+1 where organization_id=${candidate.organization_id} and id=${candidate.conversation_id} and assignee_membership_id is null returning version::text`.execute(
        tx,
      );
      if (!updated.rows[0]) return false;
      await sql`insert into messaging.conversation_assignment_events(organization_id,conversation_id,new_assignee_membership_id,actor_membership_id,assignment_source,reason,conversation_version) values(${candidate.organization_id},${candidate.conversation_id},${assignee},${rule.updated_by_membership_id},'RULE',${`Rule ${rule.id}`},${updated.rows[0].version}::bigint)`.execute(
        tx,
      );
      await sql`insert into messaging.conversation_events(organization_id,conversation_id,event_type,actor_membership_id,to_value,reason) values(${candidate.organization_id},${candidate.conversation_id},'ASSIGNMENT_CHANGED',${rule.updated_by_membership_id},${JSON.stringify({ assigneeMembershipId: assignee, priority })}::jsonb,${`Rule ${rule.id}`})`.execute(
        tx,
      );
      const payload = {
        conversationId: candidate.conversation_id,
        assigneeMembershipId: assignee,
        recipientMembershipId: assignee,
        priority,
        version: updated.rows[0].version,
        ruleId: rule.id,
      };
      await appendRealtimeEvent(tx as Db, {
        organizationId: candidate.organization_id,
        audienceType: 'ORGANIZATION',
        conversationId: candidate.conversation_id,
        eventType: 'messaging.conversation.assigned.v1',
        aggregateId: candidate.conversation_id,
        aggregateVersion: updated.rows[0].version,
        payload,
      });
      await sql`insert into platform.outbox_events(organization_id,event_type,event_version,aggregate_type,aggregate_id,aggregate_version,payload,occurred_at) values(${candidate.organization_id},'messaging.conversation.assigned.v1',1,'messaging.conversation',${candidate.conversation_id},${updated.rows[0].version}::bigint,${JSON.stringify(payload)}::jsonb,now())`.execute(
        tx,
      );
      return true;
    });
    if (result) applied += 1;
  }
  return applied;
}
