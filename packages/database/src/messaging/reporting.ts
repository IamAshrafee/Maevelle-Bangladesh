import { sql, type Kysely } from 'kysely';

import type { ChannelKind, MessagingReportSummary } from '@maevelle/contracts/messaging';
import type { DatabaseSchema } from '../index.js';
import { MessagingDomainError } from './index.js';

type Db = Kysely<DatabaseSchema>;

export async function getMessagingReportSummary(
  db: Db,
  input: {
    organizationId: string;
    from: string;
    to: string;
    channelKind?: ChannelKind;
    assigneeMembershipId?: string;
  },
): Promise<MessagingReportSummary> {
  const from = new Date(input.from),
    to = new Date(input.to);
  if (
    Number.isNaN(from.getTime()) ||
    Number.isNaN(to.getTime()) ||
    from >= to ||
    to.getTime() - from.getTime() > 366 * 24 * 60 * 60 * 1000
  )
    throw new MessagingDomainError(
      'VALIDATION_FAILED',
      'Reporting range must be valid, ordered, and no longer than 366 days.',
    );
  const filters = sql`conversation.organization_id=${input.organizationId} and conversation.created_at>=${from} and conversation.created_at<${to}
    and (${input.channelKind ?? null}::text is null or conversation.channel_kind=${input.channelKind ?? null})
    and (${input.assigneeMembershipId ?? null}::uuid is null or conversation.assignee_membership_id=${input.assigneeMembershipId ?? null}::uuid)`;
  const [totals, channels, agents, response] = await Promise.all([
    sql<
      Record<string, string>
    >`select count(*)::text total,count(*) filter(where conversation.status='NEW')::text new_count,count(*) filter(where conversation.status='OPEN')::text open_count,count(*) filter(where conversation.status='PENDING')::text pending,count(*) filter(where conversation.status='RESOLVED')::text resolved,count(*) filter(where conversation.status='CLOSED')::text closed,count(*) filter(where conversation.last_inbound_at is not null and (conversation.last_outbound_at is null or conversation.last_inbound_at>conversation.last_outbound_at))::text unanswered,
      (select count(*)::text from messaging.messages message join messaging.conversations related on related.organization_id=message.organization_id and related.id=message.conversation_id where message.organization_id=${input.organizationId} and message.created_at>=${from} and message.created_at<${to} and message.direction='INBOUND' and (${input.channelKind ?? null}::text is null or related.channel_kind=${input.channelKind ?? null})) inbound_messages,
      (select count(*)::text from messaging.messages message join messaging.conversations related on related.organization_id=message.organization_id and related.id=message.conversation_id where message.organization_id=${input.organizationId} and message.created_at>=${from} and message.created_at<${to} and message.direction='OUTBOUND' and message.sender_type='STAFF' and (${input.channelKind ?? null}::text is null or related.channel_kind=${input.channelKind ?? null})) outbound_messages,
      (select count(*)::text from messaging.conversation_events event where event.organization_id=${input.organizationId} and event.created_at>=${from} and event.created_at<${to} and event.event_type='STATUS_CHANGED' and event.to_value='"OPEN"'::jsonb and event.from_value='"RESOLVED"'::jsonb) reopened,
      (select count(*)::text from messaging.conversation_follow_ups follow_up where follow_up.organization_id=${input.organizationId} and follow_up.status='PENDING') pending_follow_ups,
      (select count(*)::text from messaging.conversation_follow_ups follow_up where follow_up.organization_id=${input.organizationId} and follow_up.status='PENDING' and follow_up.due_at<now()) overdue_follow_ups
      from messaging.conversations conversation where ${filters}`.execute(db),
    sql<{
      channel_kind: ChannelKind;
      count: string;
    }>`select conversation.channel_kind,count(*)::text count from messaging.conversations conversation where ${filters} group by conversation.channel_kind order by conversation.channel_kind`.execute(
      db,
    ),
    sql<{
      membership_id: string;
      display_name: string | null;
      assigned: string;
      outbound_messages: string;
    }>`select membership.id membership_id,membership.display_name,
      (select count(*)::text from messaging.conversations conversation
        where conversation.organization_id=membership.organization_id and conversation.assignee_membership_id=membership.id
          and conversation.created_at>=${from} and conversation.created_at<${to}
          and (${input.channelKind ?? null}::text is null or conversation.channel_kind=${input.channelKind ?? null})) assigned,
      (select count(*)::text from messaging.messages message
        join messaging.conversations conversation on conversation.organization_id=message.organization_id and conversation.id=message.conversation_id
        where message.organization_id=membership.organization_id and message.sender_membership_id=membership.id
          and message.direction='OUTBOUND' and message.sender_type='STAFF' and message.created_at>=${from} and message.created_at<${to}
          and (${input.channelKind ?? null}::text is null or conversation.channel_kind=${input.channelKind ?? null})) outbound_messages
      from iam.organization_memberships membership
      where membership.organization_id=${input.organizationId} and membership.status='ACTIVE' and (${input.assigneeMembershipId ?? null}::uuid is null or membership.id=${input.assigneeMembershipId ?? null}::uuid)
      order by membership.id`.execute(db),
    sql<{
      first_response_count: string;
      average_first_response_seconds: string | null;
      resolution_count: string;
      average_resolution_seconds: string | null;
    }>`with measurements as (
      select conversation.id,extract(epoch from (first_reply.created_at-conversation.created_at)) first_response_seconds,
        extract(epoch from (conversation.resolved_at-conversation.created_at)) resolution_seconds
      from messaging.conversations conversation left join lateral(select message.created_at from messaging.messages message where message.organization_id=conversation.organization_id and message.conversation_id=conversation.id and message.direction='OUTBOUND' and message.sender_type='STAFF' order by message.sequence limit 1) first_reply on true
      where ${filters})
      select count(first_response_seconds)::text first_response_count,avg(first_response_seconds)::text average_first_response_seconds,count(resolution_seconds)::text resolution_count,avg(resolution_seconds)::text average_resolution_seconds from measurements`.execute(
      db,
    ),
  ]);
  const row = totals.rows[0] ?? {},
    number = (key: string) => Number(row[key] ?? 0),
    responseRow = response.rows[0]!;
  return {
    from: from.toISOString(),
    to: to.toISOString(),
    totals: {
      total: number('total'),
      new: number('new_count'),
      open: number('open_count'),
      pending: number('pending'),
      resolved: number('resolved'),
      closed: number('closed'),
      unanswered: number('unanswered'),
      inboundMessages: number('inbound_messages'),
      outboundMessages: number('outbound_messages'),
      reopened: number('reopened'),
      pendingFollowUps: number('pending_follow_ups'),
      overdueFollowUps: number('overdue_follow_ups'),
    },
    response: {
      firstResponseCount: Number(responseRow.first_response_count),
      averageFirstResponseSeconds:
        responseRow.average_first_response_seconds === null
          ? null
          : Math.round(Number(responseRow.average_first_response_seconds)),
      resolutionCount: Number(responseRow.resolution_count),
      averageResolutionSeconds:
        responseRow.average_resolution_seconds === null
          ? null
          : Math.round(Number(responseRow.average_resolution_seconds)),
    },
    byChannel: channels.rows.map((item) => ({
      channelKind: item.channel_kind,
      count: Number(item.count),
    })),
    byAgent: agents.rows.map((item) => ({
      membershipId: item.membership_id,
      displayName: item.display_name ?? 'Team member',
      assigned: Number(item.assigned),
      outboundMessages: Number(item.outbound_messages),
    })),
  };
}
