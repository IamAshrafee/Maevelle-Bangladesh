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
  },
): Promise<{ items: readonly CustomerTimelineEvent[]; totalCount: number }> {
  const limit = Math.min(100, Math.max(1, options?.limit ?? 30));
  const offset = Math.max(0, options?.offset ?? 0);

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
          when o.order_status = 'DELIVERED' then 'ORDER_DELIVERED'
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
    )
    select *, count(*) over ()::text as total_count
    from events
    order by occurred_at desc
    limit ${limit} offset ${offset}
  `.execute(db);

  const totalCount = Number(result.rows[0]?.total_count ?? 0);

  const items = result.rows.map((row) => ({
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

  return { items, totalCount };
}
