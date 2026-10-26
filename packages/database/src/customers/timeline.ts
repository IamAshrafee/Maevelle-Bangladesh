import { sql, type Kysely } from 'kysely';

import type { DatabaseSchema } from '../index.js';
import type { CustomerTimelineEvent, CustomerTimelineEventType } from './types.js';

export async function getCustomerTimeline(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  customerId: string,
  options?: {
    limit?: number;
    offset?: number;
    cursor?: string;
    eventTypes?: readonly CustomerTimelineEventType[];
    channel?: 'FACEBOOK' | 'INSTAGRAM' | 'WEBSITE' | 'EMAIL' | 'SMS';
    from?: Date;
    to?: Date;
    search?: string;
  },
): Promise<{
  items: readonly CustomerTimelineEvent[];
  totalCount: number;
  nextCursor: string | null;
}> {
  const limit = Math.min(100, Math.max(1, options?.limit ?? 30));
  const offset = Math.max(0, options?.offset ?? 0);
  const decodedCursor = options?.cursor ? decodeTimelineCursor(options.cursor) : undefined;
  const eventTypes = options?.eventTypes?.length ? options.eventTypes : undefined;
  const search = options?.search?.trim() ? `%${options.search.trim()}%` : undefined;

  // We query all relevant events across domains using a UNION ALL query,
  // resolving through both canonical customer ID and historical merged aliases.
  const result = await sql<{
    id: string;
    event_type: CustomerTimelineEventType;
    title: string;
    description: string | null;
    occurred_at: Date;
    actor_type: string | null;
    actor_id: string | null;
    reference_type: string | null;
    reference_id: string | null;
    metadata: Record<string, unknown> | null;
    total_count: string;
  }>`
    with customer_scope as (
      select ${customerId}::uuid as id
      union
      select alias_customer_id as id from customers.customer_aliases
      where organization_id = ${organizationId} and canonical_customer_id = ${customerId}
    ),
    events as (
      -- Customer Creation
      select
        c.id::text as id,
        'CUSTOMER_CREATED'::text as event_type,
        'Customer record created'::text as title,
        ('Source: ' || c.first_source)::text as description,
        c.created_at as occurred_at,
        'SYSTEM'::text as actor_type,
        null::text as actor_id,
        'customers.customer'::text as reference_type,
        c.id::text as reference_id,
        jsonb_build_object('customerNumber', c.customer_number, 'source', c.first_source) as metadata
      from customers.customers c
      where c.organization_id = ${organizationId} and c.id in (select id from customer_scope)

      union all

      -- Orders
      select
        o.id::text as id,
        case
          when o.order_status = 'CANCELLED' then 'ORDER_CANCELLED'
          when o.order_status = 'COMPLETED' then 'ORDER_DELIVERED'
          when o.order_status = 'CONFIRMED' then 'ORDER_CONFIRMED'
          else 'ORDER_PLACED'
        end as event_type,
        ('Order #' || o.order_number || ' placed') as title,
        ('Total: ' || o.total_amount || ' ' || o.currency_code || ' • Status: ' || o.order_status) as description,
        o.created_at as occurred_at,
        'USER' as actor_type,
        null as actor_id,
        'orders.order' as reference_type,
        o.id::text as reference_id,
        jsonb_build_object('orderNumber', o.order_number, 'total', o.total_amount, 'status', o.order_status) as metadata
      from orders.orders o
      where o.organization_id = ${organizationId} and o.customer_id in (select id from customer_scope)

      union all

      -- Returns
      select
        r.id::text as id,
        case when r.case_status = 'RESOLVED' then 'RETURN_COMPLETED' else 'RETURN_REQUESTED' end as event_type,
        ('Return ' || r.return_number) as title,
        ('Status: ' || r.case_status || ' • Reason: ' || r.reason_code) as description,
        r.created_at as occurred_at,
        'CUSTOMER' as actor_type,
        null as actor_id,
        'returns.return_case' as reference_type,
        r.id::text as reference_id,
        jsonb_build_object('orderId', r.order_id, 'caseStatus', r.case_status, 'returnNumber', r.return_number) as metadata
      from returns.return_cases r
      where r.organization_id = ${organizationId} and r.customer_id in (select id from customer_scope)

      union all

      -- Refunds
      select
        ref.id::text as id,
        'REFUND_COMPLETED' as event_type,
        ('Refund completed: ' || ref.amount || ' ' || ref.currency_code) as title,
        ('Reason: ' || coalesce(ref.reason_text, ref.reason_code, 'Not specified')) as description,
        ref.created_at as occurred_at,
        'USER' as actor_type,
        coalesce(ref.completed_by_actor_id, ref.requested_by_actor_id)::text as actor_id,
        'payments.refund' as reference_type,
        ref.id::text as reference_id,
        jsonb_build_object('amount', ref.amount, 'orderId', ref.order_id, 'reasonCode', ref.reason_code) as metadata
      from payments.refunds ref
      where ref.organization_id = ${organizationId}
        and ref.status = 'COMPLETED'
        and ref.order_id in (
          select id from orders.orders where organization_id = ${organizationId} and customer_id in (select id from customer_scope)
        )

      union all

      -- Confirmed payments allocated to this customer's orders.
      select
        payment.id::text,
        'PAYMENT_CONFIRMED',
        ('Payment confirmed: ' || payment.payment_number),
        (payment.amount || ' ' || payment.currency_code),
        payment.confirmed_at,
        'USER',payment.confirmed_by_actor_id::text,
        'payments.payment',payment.id::text,
        jsonb_build_object('amount',payment.amount,'currencyCode',payment.currency_code,'paymentNumber',payment.payment_number)
      from payments.payments payment
      where payment.organization_id=${organizationId} and payment.status='CONFIRMED'
        and exists(select 1 from payments.payment_allocations allocation join orders.orders linked_order
          on linked_order.organization_id=allocation.organization_id and linked_order.id=allocation.order_id
          where allocation.organization_id=payment.organization_id and allocation.payment_id=payment.id
            and linked_order.customer_id in (select id from customer_scope))

      union all

      select fulfillment.id::text,'FULFILLMENT_UPDATED',('Fulfillment ' || fulfillment.fulfillment_number || ': ' || fulfillment.status),
        null,coalesce(fulfillment.dispatched_at,fulfillment.packed_at,fulfillment.picking_started_at,fulfillment.ready_at,fulfillment.created_at),
        'SYSTEM',fulfillment.created_by_actor_id::text,'fulfillment.fulfillment',fulfillment.id::text,
        jsonb_build_object('status',fulfillment.status,'orderId',fulfillment.order_id)
      from fulfillment.fulfillments fulfillment join orders.orders linked_order
        on linked_order.organization_id=fulfillment.organization_id and linked_order.id=fulfillment.order_id
      where fulfillment.organization_id=${organizationId} and linked_order.customer_id in (select id from customer_scope)

      union all

      select event.id::text,'DELIVERY_UPDATED',('Delivery update: ' || coalesce(event.normalized_status,event.event_type)),
        event.provider_status_raw,event.occurred_at,case when event.source='MANUAL' then 'USER' else 'SYSTEM' end,null,
        'delivery.delivery',delivery.id::text,
        jsonb_build_object('status',event.normalized_status,'eventType',event.event_type,'deliveryNumber',delivery.delivery_number,'orderId',delivery.order_id)
      from delivery.delivery_events event join delivery.deliveries delivery
        on delivery.organization_id=event.organization_id and delivery.id=event.delivery_id
      join orders.orders linked_order on linked_order.organization_id=delivery.organization_id and linked_order.id=delivery.order_id
      where event.organization_id=${organizationId} and linked_order.customer_id in (select id from customer_scope)

      union all

      select attempt.id::text,'DELIVERY_UPDATED',('Delivery attempt ' || attempt.attempt_number || ': ' || attempt.outcome),
        coalesce(attempt.notes,attempt.reason_code),attempt.attempted_at,'SYSTEM',null,'delivery.delivery',delivery.id::text,
        jsonb_build_object('outcome',attempt.outcome,'attemptNumber',attempt.attempt_number,'deliveryNumber',delivery.delivery_number,'orderId',delivery.order_id)
      from delivery.delivery_attempts attempt join delivery.deliveries delivery
        on delivery.organization_id=attempt.organization_id and delivery.id=attempt.delivery_id
      join orders.orders linked_order on linked_order.organization_id=delivery.organization_id and linked_order.id=delivery.order_id
      where attempt.organization_id=${organizationId} and linked_order.customer_id in (select id from customer_scope)

      union all

      select review.id::text,'REVIEW_SUBMITTED','Product review submitted',
        ('Visibility: ' || review.visibility_status || ' • Status: ' || review.lifecycle_status),review.created_at,
        'CUSTOMER',null,'reviews.review',review.id::text,
        jsonb_build_object('productId',review.product_id,'visibility',review.visibility_status,'status',review.lifecycle_status)
      from reviews.reviews review
      where review.organization_id=${organizationId} and review.customer_id in (select id from customer_scope)

      union all

      -- Restrictions Applied
      select
        cr.id::text as id,
        'RESTRICTION_APPLIED' as event_type,
        ('Restriction applied: ' || cr.restriction_type) as title,
        ('Reason: ' || cr.reason) as description,
        cr.created_at as occurred_at,
        'USER' as actor_type,
        cr.created_by::text as actor_id,
        'customers.restriction' as reference_type,
        cr.id::text as reference_id,
        jsonb_build_object('restrictionType', cr.restriction_type, 'reason', cr.reason) as metadata
      from customers.customer_restrictions cr
      where cr.organization_id = ${organizationId} and cr.customer_id in (select id from customer_scope)

      union all

      -- Restrictions Lifted
      select
        cr.id::text || '-lifted' as id,
        'RESTRICTION_LIFTED' as event_type,
        ('Restriction lifted: ' || cr.restriction_type) as title,
        ('Lift reason: ' || coalesce(cr.lift_reason, 'Not specified')) as description,
        cr.lifted_at as occurred_at,
        'USER' as actor_type,
        cr.lifted_by::text as actor_id,
        'customers.restriction' as reference_type,
        cr.id::text as reference_id,
        jsonb_build_object('restrictionType', cr.restriction_type, 'liftReason', cr.lift_reason) as metadata
      from customers.customer_restrictions cr
      where cr.organization_id = ${organizationId}
        and cr.customer_id in (select id from customer_scope)
        and cr.status = 'LIFTED' and cr.lifted_at is not null

      union all

      -- Notes
      select
        cn.id::text as id,
        'NOTE_ADDED' as event_type,
        'Internal note added' as title,
        cn.body as description,
        cn.created_at as occurred_at,
        'USER' as actor_type,
        cn.author_actor_id::text as actor_id,
        'customers.note' as reference_type,
        cn.id::text as reference_id,
        null::jsonb as metadata
      from customers.customer_notes cn
      where cn.organization_id = ${organizationId} and cn.customer_id in (select id from customer_scope)

      union all

      -- Tag Assignments
      select
        cta.tag_id::text || '-' || cta.customer_id::text as id,
        'TAG_ASSIGNED' as event_type,
        ('Tag assigned: ' || ct.label) as title,
        null as description,
        cta.created_at as occurred_at,
        'SYSTEM' as actor_type,
        null as actor_id,
        'customers.tag' as reference_type,
        cta.tag_id::text as reference_id,
        jsonb_build_object('label', ct.label, 'color', ct.color) as metadata
      from customers.customer_tag_assignments cta
      join customers.customer_tags ct on ct.id = cta.tag_id
      where cta.organization_id = ${organizationId} and cta.customer_id in (select id from customer_scope)

      union all

      -- Merges
      select
        cm.id::text as id,
        'CUSTOMER_MERGED' as event_type,
        'Customer records merged' as title,
        ('Reason: ' || coalesce(cm.reason, 'Operator merge')) as description,
        cm.created_at as occurred_at,
        'USER' as actor_type,
        cm.created_by::text as actor_id,
        'customers.merge' as reference_type,
        cm.id::text as reference_id,
        jsonb_build_object('sourceCustomerId', cm.source_customer_id, 'targetCustomerId', cm.target_customer_id) as metadata
      from customers.customer_merges cm
      where cm.organization_id = ${organizationId}
        and (cm.source_customer_id in (select id from customer_scope) or cm.target_customer_id in (select id from customer_scope))

      union all

      -- Account Linking
      select
        ca.id::text as id,
        'ACCOUNT_LINKED' as event_type,
        'Customer account linked' as title,
        ('Link type: ' || ca.link_type) as description,
        ca.created_at as occurred_at,
        'SYSTEM' as actor_type,
        ca.user_id::text as actor_id,
        'customers.account' as reference_type,
        ca.id::text as reference_id,
        jsonb_build_object('userId', ca.user_id, 'linkType', ca.link_type) as metadata
      from customers.customer_accounts ca
      where ca.organization_id = ${organizationId} and ca.customer_id in (select id from customer_scope)

      union all

      -- Account Unlinking
      select
        ca.id::text || '-unlinked' as id,
        'ACCOUNT_UNLINKED' as event_type,
        'Customer account unlinked' as title,
        ('Reason: ' || coalesce(ca.unlink_reason, 'Not specified')) as description,
        ca.unlinked_at as occurred_at,
        'USER' as actor_type,
        ca.unlinked_by::text as actor_id,
        'customers.account' as reference_type,
        ca.id::text as reference_id,
        jsonb_build_object('userId', ca.user_id, 'reason', ca.unlink_reason) as metadata
      from customers.customer_accounts ca
      where ca.organization_id = ${organizationId}
        and ca.customer_id in (select id from customer_scope)
        and ca.status = 'UNLINKED' and ca.unlinked_at is not null

      union all

      -- Communications Sent
      select
        n.id::text as id,
        'COMMUNICATION_SENT' as event_type,
        (n.channel || ' sent: ' || coalesce(n.rendered_subject, n.notification_type)) as title,
        ('Status: ' || n.status || ' • To: ' || coalesce(n.effective_recipient, n.intended_recipient, 'Recipient')) as description,
        n.created_at as occurred_at,
        'SYSTEM' as actor_type,
        null as actor_id,
        'notifications.notification' as reference_type,
        n.id::text as reference_id,
        jsonb_build_object('channel', n.channel, 'status', n.status, 'notificationType', n.notification_type) as metadata
      from notifications.notifications n
      where n.organization_id = ${organizationId} and n.customer_id in (select id from customer_scope)

      union all

      -- Unified identity history (no provider payloads are copied into CRM).
      select
        e.id::text as id,
        case when e.action='REVOKED' then 'IDENTITY_REVOKED' else 'IDENTITY_LINKED' end as event_type,
        case when e.action='REVOKED' then 'Channel identity unlinked' else 'Channel identity linked' end as title,
        ('Assurance: ' || e.assurance || ' • Evidence: ' || e.evidence_method) as description,
        e.created_at as occurred_at,
        e.actor_type,
        e.actor_id::text,
        'customers.identity_link' as reference_type,
        e.identity_link_id::text as reference_id,
        jsonb_build_object('action',e.action,'assurance',e.assurance,'evidenceMethod',e.evidence_method,'provider',identity_link.provider) as metadata
      from customers.customer_identity_link_events e
      join customers.customer_identity_links identity_link
        on identity_link.organization_id=e.organization_id and identity_link.id=e.identity_link_id
      where e.organization_id=${organizationId} and e.customer_id in (select id from customer_scope)
        and e.action in ('LINKED','REVOKED')

      union all

      select h.id::text,'LIFECYCLE_CHANGED','Customer lifecycle changed',
        (coalesce(h.previous_stage,'Unclassified') || ' → ' || h.new_stage || ' • ' || h.reason),
        h.occurred_at,case when h.actor_id is null then 'SYSTEM' else 'USER' end,h.actor_id::text,
        'customers.lifecycle_history',h.id::text,
        jsonb_build_object('previousStage',h.previous_stage,'newStage',h.new_stage,'source',h.transition_source)
      from customers.customer_lifecycle_history h
      where h.organization_id=${organizationId} and h.customer_id in (select id from customer_scope)

      union all

      select h.id::text,'OWNER_CHANGED','Relationship ownership changed',h.reason,h.changed_at,'USER',h.changed_by_actor_id::text,
        'customers.ownership_history',h.id::text,
        jsonb_build_object('previousOwnerMembershipId',h.previous_owner_membership_id,'newOwnerMembershipId',h.new_owner_membership_id,'status',h.new_relationship_status)
      from customers.customer_ownership_history h
      where h.organization_id=${organizationId} and h.customer_id in (select id from customer_scope)

      union all

      select f.id::text,'FOLLOW_UP_CREATED',('Follow-up created: ' || f.title),f.details,f.created_at,'USER',f.created_by_actor_id::text,
        'customers.follow_up',f.id::text,jsonb_build_object('dueAt',f.due_at,'assignedMembershipId',f.assigned_membership_id)
      from customers.customer_follow_ups f
      where f.organization_id=${organizationId} and f.customer_id in (select id from customer_scope)

      union all

      select f.id::text || '-completed','FOLLOW_UP_COMPLETED',('Follow-up completed: ' || f.title),f.details,f.completed_at,'USER',f.completed_by_actor_id::text,
        'customers.follow_up',f.id::text,jsonb_build_object('dueAt',f.due_at)
      from customers.customer_follow_ups f
      where f.organization_id=${organizationId} and f.customer_id in (select id from customer_scope) and f.completed_at is not null

      union all

      select conversation.id::text,'CONVERSATION_STARTED',
        (case conversation.channel_kind when 'FACEBOOK' then 'Facebook Messenger' when 'INSTAGRAM' then 'Instagram Direct' else 'Website chat' end || ' conversation started'),
        conversation.subject,conversation.created_at,'CUSTOMER',null,
        'messaging.conversation',conversation.id::text,
        jsonb_build_object('channel',conversation.channel_kind,'status',conversation.status)
      from messaging.conversations conversation
      join messaging.contacts contact on contact.organization_id=conversation.organization_id and contact.id=conversation.contact_id
      where conversation.organization_id=${organizationId} and contact.customer_id in (select id from customer_scope)
    ),
    filtered_events as (
      select * from events
      where (${eventTypes ? sql`event_type in (${sql.join(eventTypes.map((type) => sql`${type}`))})` : sql`true`})
        and (${options?.channel ? sql`upper(coalesce(metadata->>'channel', metadata->>'provider', '')) = ${options.channel}` : sql`true`})
        and (${options?.from ? sql`occurred_at >= ${options.from}` : sql`true`})
        and (${options?.to ? sql`occurred_at <= ${options.to}` : sql`true`})
        and (${search ? sql`(title ilike ${search} or coalesce(description, '') ilike ${search})` : sql`true`})
    )
    select *, (select count(*) from filtered_events)::text as total_count
    from filtered_events
    where (${decodedCursor ? sql`(occurred_at, id, event_type) < (${decodedCursor.occurredAt}, ${decodedCursor.id}, ${decodedCursor.eventType})` : sql`true`})
    order by occurred_at desc, id desc, event_type desc
    limit ${limit + 1} offset ${decodedCursor ? 0 : offset}
  `.execute(db);

  const totalCount = Number(result.rows[0]?.total_count ?? 0);
  const pageRows = result.rows.slice(0, limit);

  const items = pageRows.map((row) => ({
    id: row.id,
    eventType: row.event_type,
    title: row.title,
    description: row.description,
    occurredAt: row.occurred_at.toISOString(),
    actorType: row.actor_type,
    actorId: row.actor_id,
    referenceType: row.reference_type,
    referenceId: row.reference_id,
    ...(row.metadata ? { metadata: row.metadata } : {}),
  }));

  const last = pageRows.at(-1);
  const nextCursor =
    result.rows.length > limit && last
      ? encodeTimelineCursor({
          occurredAt: last.occurred_at.toISOString(),
          id: last.id,
          eventType: last.event_type,
        })
      : null;

  return { items, totalCount, nextCursor };
}

interface TimelineCursor {
  readonly occurredAt: string;
  readonly id: string;
  readonly eventType: CustomerTimelineEventType;
}

function encodeTimelineCursor(cursor: TimelineCursor): string {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
}

function decodeTimelineCursor(cursor: string): TimelineCursor {
  try {
    const value = JSON.parse(
      Buffer.from(cursor, 'base64url').toString('utf8'),
    ) as Partial<TimelineCursor>;
    if (
      typeof value.occurredAt !== 'string' ||
      Number.isNaN(Date.parse(value.occurredAt)) ||
      typeof value.id !== 'string' ||
      typeof value.eventType !== 'string'
    ) {
      throw new Error('Invalid cursor fields');
    }
    return value as TimelineCursor;
  } catch {
    throw new Error('INVALID_TIMELINE_CURSOR');
  }
}
