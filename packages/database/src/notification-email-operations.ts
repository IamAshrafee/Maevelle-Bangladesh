import { createHash } from 'node:crypto';
import { sql, type Kysely } from 'kysely';
import type { DatabaseSchema } from './index.js';
import { appendAuditEvent } from './platform.js';
import {
  renderTransactionalEmail,
  type TransactionalEmailTemplateKey,
} from './email-templates.js';

export class EmailNotificationError extends Error {
  public constructor(
    public readonly code: 'NOT_FOUND' | 'CONFLICT' | 'VALIDATION_FAILED' | 'FORBIDDEN',
    message: string,
  ) {
    super(message);
  }
}

export interface EmailRenderOptions {
  readonly storefrontBaseUrl: string;
  readonly supportEmail: string;
  readonly senderFrom?: string;
  readonly environmentLabel?: string;
}

async function orderEmailModel(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  orderIdentifier: string,
) {
  const trimmed = orderIdentifier.trim();
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed);
  const order = await sql<{
    id: string;
    customer_id: string;
    order_number: string;
    display_name: string;
    email: string | null;
    currency_code: string;
    total_amount: string;
    order_status: string;
    delivery_address: string | null;
  }>`select order_row.id,order_row.customer_id,order_row.order_number,
      coalesce(snapshot.display_name, customer.display_name, 'Customer') display_name,
      case when snapshot.order_id is not null then snapshot.email else customer_email.normalized_value end email,
      order_row.currency_code,order_row.total_amount::text,order_row.order_status,
      concat_ws(', ',address.address_line_1,address.address_line_2,address.area,address.city,address.district,address.postal_code) delivery_address
    from orders.orders order_row
    left join orders.order_customer_snapshots snapshot on snapshot.order_id=order_row.id
    left join customers.customers customer on customer.id=order_row.customer_id
    left join customers.customer_emails customer_email on customer_email.customer_id=order_row.customer_id and customer_email.is_primary
    left join orders.order_addresses address on address.order_id=order_row.id and address.address_type='DELIVERY'
    where order_row.organization_id=${organizationId} and (${isUuid ? sql`order_row.id=${trimmed}::uuid` : sql`false`} or order_row.order_number=${trimmed})`.execute(db);
  const row = order.rows[0];
  if (!row) throw new EmailNotificationError('NOT_FOUND', 'Order was not found.');
  const items = await sql<{ title: string; variant: string | null; quantity: string; amount: string }>`
    select product_title_snapshot title,variant_title_snapshot variant,quantity::text,net_amount::text amount
    from orders.order_lines where order_id=${row.id}::uuid and line_status='ACTIVE' order by id
  `.execute(db);
  return { ...row, items: items.rows };
}

async function manualEventEligible(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  orderId: string,
  notificationType: string,
  orderStatus: string,
) {
  if (notificationType === 'ORDER_PLACED') return true;
  if (notificationType === 'ORDER_CONFIRMED') return ['CONFIRMED', 'COMPLETED'].includes(orderStatus);
  if (notificationType === 'ORDER_CANCELLED') return orderStatus === 'CANCELLED';
  if (notificationType === 'ORDER_COMPLETED') return orderStatus === 'COMPLETED';
  const result = await sql<{ eligible: boolean }>`select case
    when ${notificationType}='PAYMENT_VERIFIED' then exists(
      select 1 from platform.outbox_events event where event.organization_id=${organizationId}
        and event.event_type='payments.payment.verified' and event.payload->>'orderId'=${orderId}
    )
    when ${notificationType}='ORDER_DISPATCHED' then exists(
      select 1 from fulfillment.fulfillments fulfillment where fulfillment.organization_id=${organizationId}
        and fulfillment.order_id=${orderId}::uuid and fulfillment.status='DISPATCHED'
    )
    when ${notificationType}='DELIVERY_COMPLETED' then exists(
      select 1 from delivery.deliveries delivery where delivery.organization_id=${organizationId}
        and delivery.order_id=${orderId}::uuid and delivery.outcome_status='DELIVERED'
    )
    when ${notificationType}='REFUND_COMPLETED' then exists(
      select 1 from payments.refunds refund where refund.organization_id=${organizationId}
        and refund.order_id=${orderId}::uuid and refund.status='COMPLETED'
    )
    else false end eligible`.execute(db);
  return result.rows[0]?.eligible ?? false;
}

async function policy(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  notificationType: string,
) {
  const result = await sql<{
    notification_type: string;
    template_key: TransactionalEmailTemplateKey | null;
    enabled: boolean;
    automatic_enabled: boolean;
    manual_allowed: boolean;
  }>`select policy.notification_type,policy.template_key,
      coalesce(override.enabled,true) enabled,
      coalesce(override.automatic_enabled,policy.automatic_enabled) automatic_enabled,
      coalesce(override.manual_allowed,policy.manual_allowed) manual_allowed
    from notifications.notification_policies policy
    left join notifications.organization_policy_overrides override
      on override.organization_id=${organizationId} and override.notification_type=policy.notification_type
    where policy.notification_type=${notificationType} and 'EMAIL'=any(policy.channels)`.execute(db);
  return result.rows[0];
}

export async function listEmailPolicies(db: Kysely<DatabaseSchema>, organizationId: string) {
  return (
    await sql`select policy.notification_type,policy.delivery_requirement,policy.template_key,
      coalesce(override.enabled,true) enabled,
      coalesce(override.automatic_enabled,policy.automatic_enabled) automatic_enabled,
      coalesce(override.manual_allowed,policy.manual_allowed) manual_allowed,
      override.updated_at::text
    from notifications.notification_policies policy
    left join notifications.organization_policy_overrides override
      on override.organization_id=${organizationId} and override.notification_type=policy.notification_type
    where 'EMAIL'=any(policy.channels) order by policy.notification_type`.execute(db)
  ).rows;
}

export async function updateEmailPolicy(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    notificationType: string;
    enabled: boolean;
    automaticEnabled: boolean;
    manualAllowed: boolean;
    actorId: string;
    reason: string;
  },
) {
  if (!input.reason.trim())
    throw new EmailNotificationError('VALIDATION_FAILED', 'A policy-change reason is required.');
  await db.transaction().execute(async (tx) => {
    const existing = await policy(tx, input.organizationId, input.notificationType);
    if (!existing) throw new EmailNotificationError('NOT_FOUND', 'Email policy was not found.');
    await sql`insert into notifications.organization_policy_overrides(
      organization_id,notification_type,enabled,automatic_enabled,manual_allowed,updated_by_actor_id
    ) values(${input.organizationId},${input.notificationType},${input.enabled},${input.automaticEnabled},${input.manualAllowed},${input.actorId})
    on conflict(organization_id,notification_type) do update set enabled=excluded.enabled,automatic_enabled=excluded.automatic_enabled,manual_allowed=excluded.manual_allowed,updated_by_actor_id=excluded.updated_by_actor_id,updated_at=now()`.execute(tx);
    await appendAuditEvent(tx, {
      organizationId: input.organizationId,
      actorType: 'USER',
      actorId: input.actorId,
      action: 'notifications.email_policy.updated',
      targetType: 'notifications.notification_policy',
      reason: input.reason.trim(),
      beforeDiff: existing,
      afterDiff: {
        enabled: input.enabled,
        automaticEnabled: input.automaticEnabled,
        manualAllowed: input.manualAllowed,
      },
    });
  });
}

export async function previewOrderEmail(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    orderId?: string | undefined;
    notificationType: string;
    options: EmailRenderOptions;
  },
) {
  const selectedPolicy = await policy(db, input.organizationId, input.notificationType);
  if (!selectedPolicy?.template_key)
    throw new EmailNotificationError('VALIDATION_FAILED', 'This event has no transactional email template.');

  let orderData: {
    display_name: string;
    order_number: string;
    currency_code: string;
    total_amount: string;
    delivery_address: string | null;
    email: string | null;
    items: readonly { title: string; variant?: string | null; quantity: string; amount: string }[];
  };

  if (input.orderId && input.orderId.trim()) {
    const order = await orderEmailModel(db, input.organizationId, input.orderId.trim());
    orderData = {
      display_name: order.display_name,
      order_number: order.order_number,
      currency_code: order.currency_code,
      total_amount: order.total_amount,
      delivery_address: order.delivery_address,
      email: order.email,
      items: order.items,
    };
  } else {
    orderData = {
      display_name: 'Ayesha Rahman',
      order_number: 'MV-10248',
      currency_code: 'BDT',
      total_amount: '4250.00',
      delivery_address: 'House 12, Road 4, Dhanmondi, Dhaka 1205',
      email: 'ayesha.rahman@example.com',
      items: [
        { title: 'Embroidered Silk Kurti', variant: 'Plum / M', quantity: '1', amount: '2850.00' },
        { title: 'Matching Organza Dupatta', variant: 'Plum', quantity: '1', amount: '1400.00' },
      ],
    };
  }

  return {
    intendedRecipient: orderData.email,
    isSampleFixture: !input.orderId?.trim(),
    ...renderTransactionalEmail(selectedPolicy.template_key, {
      customerName: orderData.display_name,
      orderNumber: orderData.order_number,
      currencyCode: orderData.currency_code,
      totalAmount: orderData.total_amount,
      ...(orderData.delivery_address ? { deliveryAddress: orderData.delivery_address } : {}),
      trackingUrl: `${input.options.storefrontBaseUrl}/orders/track`,
      supportEmail: input.options.supportEmail,
      ...(input.options.environmentLabel
        ? { environmentLabel: input.options.environmentLabel }
        : {}),
      items: orderData.items.map((item) => ({
        title: item.title,
        ...(item.variant ? { variant: item.variant } : {}),
        quantity: item.quantity,
        amount: item.amount,
      })),
    }),
  };
}

export async function createManualOrderEmail(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    orderId: string;
    notificationType: string;
    actorId: string;
    idempotencyKey: string;
    reason: string;
    triggerType?: 'MANUAL' | 'TEST' | 'RESEND';
    recipientOverride?: string;
    parentNotificationId?: string;
    options: EmailRenderOptions;
  },
) {
  if (!/^[A-Za-z0-9._:-]{8,200}$/.test(input.idempotencyKey))
    throw new EmailNotificationError('VALIDATION_FAILED', 'A stable idempotency key is required.');
  if (!input.reason.trim())
    throw new EmailNotificationError('VALIDATION_FAILED', 'A send reason is required.');
  return db.transaction().execute(async (tx) => {
    const selectedPolicy = await policy(tx, input.organizationId, input.notificationType);
    if (!selectedPolicy?.enabled || !selectedPolicy.manual_allowed || !selectedPolicy.template_key)
      throw new EmailNotificationError('FORBIDDEN', 'Manual sending is not allowed for this event.');
    const order = await orderEmailModel(tx, input.organizationId, input.orderId);
    if (
      !(await manualEventEligible(
        tx,
        input.organizationId,
        order.id,
        input.notificationType,
        order.order_status,
      ))
    )
      throw new EmailNotificationError(
        'CONFLICT',
        'The order has not reached the business state required by this email.',
      );
    const recipient = input.recipientOverride?.trim().toLowerCase() || order.email?.trim().toLowerCase();
    if (!recipient || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient))
      throw new EmailNotificationError('VALIDATION_FAILED', 'The order has no usable email recipient.');
    const suppressed = await sql`select 1 from notifications.email_suppressions where organization_id=${input.organizationId} and normalized_email=${recipient} and active limit 1`.execute(tx);
    if (suppressed.rows[0] && input.triggerType !== 'TEST')
      throw new EmailNotificationError('CONFLICT', 'This recipient is suppressed.');
    const rendered = renderTransactionalEmail(selectedPolicy.template_key, {
      customerName: order.display_name,
      orderNumber: order.order_number,
      currencyCode: order.currency_code,
      totalAmount: order.total_amount,
      ...(order.delivery_address ? { deliveryAddress: order.delivery_address } : {}),
      trackingUrl: `${input.options.storefrontBaseUrl}/orders/track`,
      supportEmail: input.options.supportEmail,
      ...(input.options.environmentLabel ? { environmentLabel: input.options.environmentLabel } : {}),
      items: order.items.map((item) => ({
        title: item.title,
        ...(item.variant ? { variant: item.variant } : {}),
        quantity: item.quantity,
        amount: item.amount,
      })),
    });
    const logicalKey = `notification:manual:v1:${input.organizationId}:${input.notificationType}:${order.id}:${input.idempotencyKey}`;
    const inserted = await sql<{ id: string }>`insert into notifications.notifications(
      organization_id,notification_type,recipient_type,customer_id,channel,template_key,template_version,
      rendered_subject,rendered_body,rendered_html,intended_recipient,effective_recipient,sender_from,reply_to,status,trigger_type,
      triggered_by_actor_id,parent_notification_id,idempotency_key,queued_at,source_domain,source_id
    ) values(${input.organizationId},${input.notificationType},'CUSTOMER',${order.customer_id}::uuid,'EMAIL',${rendered.templateKey},${rendered.templateVersion},
      ${rendered.subject},${rendered.text},${rendered.html},${recipient},${recipient},${input.options.senderFrom ?? null},${input.options.supportEmail},'QUEUED',${input.triggerType ?? 'MANUAL'},
      ${input.actorId},${input.parentNotificationId ?? null}::uuid,${logicalKey},now(),'orders.order',${order.id}::uuid)
    on conflict(idempotency_key) do nothing returning id`.execute(tx);
    const notificationId = inserted.rows[0]?.id;
    if (!notificationId) {
      const existing = await sql<{ id: string }>`select id from notifications.notifications where idempotency_key=${logicalKey}`.execute(tx);
      return { id: existing.rows[0]!.id, created: false };
    }
    await sql`insert into notifications.delivery_events(organization_id,notification_id,event_type,source,metadata) values(${input.organizationId},${notificationId}::uuid,'QUEUED','ADMIN',${JSON.stringify({ reason: input.reason.trim(), triggerType: input.triggerType ?? 'MANUAL' })}::jsonb)`.execute(tx);
    await appendAuditEvent(tx, {
      organizationId: input.organizationId,
      actorType: 'USER',
      actorId: input.actorId,
      action: `notifications.email.${(input.triggerType ?? 'MANUAL').toLowerCase()}_queued`,
      targetType: 'notifications.notification',
      targetId: notificationId,
      reason: input.reason.trim(),
      metadata: { notificationType: input.notificationType, orderId: input.orderId },
    });
    return { id: notificationId, created: true };
  });
}

export async function retryEmailNotification(
  db: Kysely<DatabaseSchema>,
  input: { organizationId: string; notificationId: string; actorId: string; reason: string },
) {
  if (!input.reason.trim())
    throw new EmailNotificationError('VALIDATION_FAILED', 'A retry reason is required.');
  await db.transaction().execute(async (tx) => {
    const updated = await sql<{ id: string }>`update notifications.notifications set status='QUEUED',failure_code=null,failure_message=null,queued_at=now(),updated_at=now() where organization_id=${input.organizationId} and id=${input.notificationId}::uuid and channel='EMAIL' and status='FAILED' returning id`.execute(tx);
    if (!updated.rows[0])
      throw new EmailNotificationError('CONFLICT', 'Only a failed email can be retried.');
    await sql`insert into notifications.delivery_events(organization_id,notification_id,event_type,source,metadata) values(${input.organizationId},${input.notificationId}::uuid,'RETRY_REQUESTED','ADMIN',${JSON.stringify({ reason: input.reason.trim() })}::jsonb)`.execute(tx);
    await appendAuditEvent(tx, {
      organizationId: input.organizationId,
      actorType: 'USER',
      actorId: input.actorId,
      action: 'notifications.email.retry_requested',
      targetType: 'notifications.notification',
      targetId: input.notificationId,
      reason: input.reason.trim(),
    });
  });
}

export async function listEmailNotifications(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    page: number;
    pageSize: number;
    status?: string;
    notificationType?: string;
    search?: string;
    sourceId?: string;
    provider?: string;
    createdAfter?: string;
    createdBefore?: string;
  },
) {
  const offset = (input.page - 1) * input.pageSize;
  const search = input.search?.trim() ? `%${input.search.trim()}%` : null;
  const rows = await sql<Record<string, unknown> & { total_count: string }>`select n.*,count(*) over()::text total_count
    from notifications.notifications n
    where n.organization_id=${input.organizationId} and n.channel='EMAIL'
      and (${input.status ?? null}::text is null or n.status=${input.status ?? null})
      and (${input.notificationType ?? null}::text is null or n.notification_type=${input.notificationType ?? null})
      and (${input.sourceId ?? null}::uuid is null or n.source_id=${input.sourceId ?? null}::uuid)
      and (${input.provider ?? null}::text is null or n.provider=${input.provider ?? null})
      and (${input.createdAfter ?? null}::timestamptz is null or n.created_at>=${input.createdAfter ?? null}::timestamptz)
      and (${input.createdBefore ?? null}::timestamptz is null or n.created_at<${input.createdBefore ?? null}::timestamptz)
      and (${search}::text is null or n.rendered_subject ilike ${search} or n.intended_recipient ilike ${search})
    order by n.created_at desc,n.id desc limit ${input.pageSize} offset ${offset}`.execute(db);
  const totalItems = Number(rows.rows[0]?.total_count ?? 0);
  return {
    data: rows.rows.map((source) => {
      const row = { ...source };
      Reflect.deleteProperty(row, 'total_count');
      Reflect.deleteProperty(row, 'rendered_html');
      return row;
    }),
    pagination: {
      page: input.page,
      pageSize: input.pageSize,
      totalItems,
      totalPages: Math.ceil(totalItems / input.pageSize),
    },
  };
}

export async function getEmailNotification(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  notificationId: string,
) {
  const row = await sql<Record<string, any>>`select n.*,
      coalesce((select jsonb_agg(to_jsonb(a) order by a.attempt_number) from notifications.delivery_attempts a where a.notification_id=n.id),'[]'::jsonb) attempts,
      coalesce((select jsonb_agg(to_jsonb(e) order by e.event_at,e.id) from notifications.delivery_events e where e.notification_id=n.id),'[]'::jsonb) timeline
    from notifications.notifications n where n.organization_id=${organizationId} and n.id=${notificationId}::uuid and n.channel='EMAIL'`.execute(db);
  if (!row.rows[0]) throw new EmailNotificationError('NOT_FOUND', 'Email notification was not found.');
  return row.rows[0];
}

export async function listEmailSuppressions(db: Kysely<DatabaseSchema>, organizationId: string) {
  return (
    await sql`select id,normalized_email,reason,source,provider,active,created_at::text,cleared_at::text,clear_reason from notifications.email_suppressions where organization_id=${organizationId} order by active desc,created_at desc limit 200`.execute(db)
  ).rows;
}

export async function setEmailSuppression(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    email: string;
    active: boolean;
    actorId: string;
    reason: string;
  },
) {
  const email = input.email.trim().toLowerCase();
  if (!email.includes('@') || !input.reason.trim())
    throw new EmailNotificationError('VALIDATION_FAILED', 'Email and reason are required.');
  await db.transaction().execute(async (tx) => {
    if (input.active)
      await sql`insert into notifications.email_suppressions(organization_id,normalized_email,reason,source,active) values(${input.organizationId},${email},'ADMINISTRATOR','ADMIN',true) on conflict(organization_id,normalized_email,reason) do update set active=true,cleared_at=null,cleared_by_actor_id=null,clear_reason=null`.execute(tx);
    else
      await sql`update notifications.email_suppressions set active=false,cleared_at=now(),cleared_by_actor_id=${input.actorId},clear_reason=${input.reason.trim()} where organization_id=${input.organizationId} and normalized_email=${email} and active`.execute(tx);
    await appendAuditEvent(tx, {
      organizationId: input.organizationId,
      actorType: 'USER',
      actorId: input.actorId,
      action: input.active
        ? 'notifications.email_suppression.created'
        : 'notifications.email_suppression.cleared',
      targetType: 'notifications.email_suppression',
      reason: input.reason.trim(),
      metadata: { emailHash: createHash('sha256').update(email).digest('hex') },
    });
  });
}

const providerStatus: Record<string, string> = {
  'email.sent': 'SENT',
  'email.delivered': 'DELIVERED',
  'email.delivery_delayed': 'DELIVERY_DELAYED',
  'email.bounced': 'BOUNCED',
  'email.complained': 'COMPLAINED',
  'email.failed': 'FAILED',
  'email.suppressed': 'SUPPRESSED',
  'email.opened': 'OPENED',
  'email.clicked': 'CLICKED',
};

export async function ingestResendWebhook(
  db: Kysely<DatabaseSchema>,
  input: {
    providerEventId: string;
    type: string;
    createdAt?: string;
    data: Record<string, unknown>;
    rawPayload: Record<string, unknown>;
  },
) {
  const normalized = providerStatus[input.type] ?? 'IGNORED';
  const providerMessageId = typeof input.data.email_id === 'string' ? input.data.email_id : null;
  const recipient = Array.isArray(input.data.to) && typeof input.data.to[0] === 'string' ? input.data.to[0].toLowerCase() : null;
  return db.transaction().execute(async (tx) => {
    const event = await sql<{ id: string }>`insert into notifications.provider_events(provider,provider_event_id,provider_message_id,event_type,normalized_type,recipient,payload,provider_occurred_at)
      values('resend',${input.providerEventId},${providerMessageId},${input.type},${normalized},${recipient},${JSON.stringify(input.rawPayload)}::jsonb,${input.createdAt ? new Date(input.createdAt) : null})
      on conflict(provider,provider_event_id) do nothing returning id::text`.execute(tx);
    if (!event.rows[0]) return { created: false, processed: false };
    if (!providerMessageId || normalized === 'IGNORED') {
      await sql`update notifications.provider_events set processed_at=now(),processing_result='IGNORED' where id=${Number(event.rows[0]!.id)}`.execute(tx);
      return { created: true, processed: false };
    }
    const notification = await sql<{ id: string; organization_id: string; status: string; intended_recipient: string | null }>`select id,organization_id,status,intended_recipient from notifications.notifications where provider='resend' and provider_message_id=${providerMessageId} for update`.execute(tx);
    const target = notification.rows[0];
    if (!target) {
      await sql`update notifications.provider_events set processed_at=now(),processing_result='UNMATCHED_MESSAGE' where id=${Number(event.rows[0]!.id)}`.execute(tx);
      return { created: true, processed: false };
    }
    const terminal = ['BOUNCED', 'COMPLAINED', 'SUPPRESSED'].includes(target.status);
    const shouldUpdate = !terminal && !(target.status === 'DELIVERED' && ['SENT', 'DELIVERY_DELAYED', 'FAILED'].includes(normalized));
    if (shouldUpdate && !['OPENED', 'CLICKED'].includes(normalized)) {
      await sql`update notifications.notifications set status=${normalized},delivered_at=case when ${normalized}='DELIVERED' then coalesce(delivered_at,now()) else delivered_at end,failure_code=case when ${normalized} in ('FAILED','BOUNCED','COMPLAINED','SUPPRESSED') then ${input.type} else failure_code end,updated_at=now() where id=${target.id}::uuid`.execute(tx);
    }
    await sql`insert into notifications.delivery_events(organization_id,notification_id,event_type,event_at,source,provider_event_id,metadata) values(${target.organization_id},${target.id}::uuid,${normalized},${input.createdAt ? new Date(input.createdAt) : new Date()},'PROVIDER',${input.providerEventId},${JSON.stringify({ providerType: input.type })}::jsonb)`.execute(tx);
    const bounce = input.data.bounce as { type?: unknown } | undefined;
    const shouldSuppress =
      normalized === 'COMPLAINED' ||
      normalized === 'SUPPRESSED' ||
      (normalized === 'BOUNCED' && bounce?.type === 'Permanent');
    if (recipient && shouldSuppress) {
      const reason = normalized === 'BOUNCED' ? 'HARD_BOUNCE' : normalized === 'COMPLAINED' ? 'COMPLAINT' : 'PROVIDER';
      await sql`insert into notifications.email_suppressions(organization_id,normalized_email,reason,source,provider,active) values(${target.organization_id},${recipient},${reason},'WEBHOOK','resend',true) on conflict(organization_id,normalized_email,reason) do update set active=true,cleared_at=null`.execute(tx);
    }
    await sql`update notifications.provider_events set processed_at=now(),processing_result='PROCESSED' where id=${Number(event.rows[0]!.id)}`.execute(tx);
    return { created: true, processed: true, notificationId: target.id };
  });
}

export async function emailOperationalSummary(db: Kysely<DatabaseSchema>, organizationId: string) {
  const result = await sql<{
    queued: number;
    processing: number;
    failed: number;
    delivered: number;
    suppressed: number;
    last_webhook_at: string | null;
  }>`select
      count(*) filter(where status='QUEUED')::int queued,
      count(*) filter(where status='PROCESSING')::int processing,
      count(*) filter(where status='FAILED')::int failed,
      count(*) filter(where status='DELIVERED')::int delivered,
      count(*) filter(where status in ('SUPPRESSED','BOUNCED','COMPLAINED'))::int suppressed,
      (select max(event.received_at)::text from notifications.provider_events event join notifications.notifications notification on notification.provider_message_id=event.provider_message_id where notification.organization_id=${organizationId}) last_webhook_at
    from notifications.notifications where organization_id=${organizationId} and channel='EMAIL'`.execute(db);
  return result.rows[0]!;
}
