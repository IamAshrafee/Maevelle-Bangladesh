import { createHash, randomInt } from 'node:crypto';
import { sql, type Kysely } from 'kysely';
import type { DatabaseSchema } from './index.js';
import { appendAuditEvent } from './platform.js';
import {
  createMockSmsProvider,
  normalizeBangladeshPhone,
  type MockSmsMode,
  type NormalizedSmsDeliveryEvent,
  type SmsProvider,
  type SmsSenderType,
} from './sms.js';
import {
  renderTransactionalSms,
  type TransactionalSmsTemplateKey,
} from './sms-templates.js';

export { listTransactionalSmsTemplates, renderTransactionalSms } from './sms-templates.js';
export * from './sms.js';

export class SmsNotificationError extends Error {
  public constructor(
    public readonly code: 'NOT_FOUND' | 'CONFLICT' | 'VALIDATION_FAILED' | 'FORBIDDEN',
    message: string,
  ) {
    super(message);
  }
}

export interface SmsRuntimeOptions {
  readonly enabled: boolean;
  readonly providerConfigured: boolean;
  readonly providerName: string;
  readonly storefrontBaseUrl: string;
  readonly senderType: SmsSenderType;
  readonly senderId?: string;
  readonly recipientOverride?: string;
  readonly allowedTestRecipients?: readonly string[];
  readonly environment: 'development' | 'test' | 'production';
}

const retryAt = (attempt: number) => {
  const baseDelay = Math.min(60 * 60_000, 2_000 * 2 ** attempt);
  return new Date(Date.now() + baseDelay + randomInt(Math.max(1, Math.floor(baseDelay * 0.2))));
};

async function orderSmsModel(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  orderIdentifier: string,
) {
  const trimmed = orderIdentifier.trim();
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed);
  const row = (
    await sql<{
      id: string;
      customer_id: string;
      order_number: string;
      display_name: string;
      phone: string | null;
      normalized_phone: string | null;
      currency_code: string;
      total_amount: string;
      order_status: string;
    }>`select o.id,o.customer_id,o.order_number,coalesce(s.display_name,c.display_name,'Customer') display_name,
      case when s.order_id is not null then s.phone else cp.raw_value end phone,
      case when s.order_id is not null then s.normalized_phone else cp.normalized_value end normalized_phone,
      o.currency_code,o.total_amount::text,o.order_status
    from orders.orders o
    left join orders.order_customer_snapshots s on s.order_id=o.id
    left join customers.customers c on c.id=o.customer_id
    left join customers.customer_phones cp on cp.customer_id=o.customer_id and cp.is_primary
    where o.organization_id=${organizationId} and (${isUuid ? sql`o.id=${trimmed}::uuid` : sql`false`} or o.order_number=${trimmed})`.execute(
      db,
    )
  ).rows[0];
  if (!row) throw new SmsNotificationError('NOT_FOUND', 'Order was not found.');
  return row;
}

async function eventEligible(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  orderId: string,
  type: string,
  status: string,
) {
  if (type === 'ORDER_PLACED') return true;
  if (type === 'ORDER_CONFIRMED') return ['CONFIRMED', 'COMPLETED'].includes(status);
  if (type === 'ORDER_CANCELLED') return status === 'CANCELLED';
  const result = await sql<{ eligible: boolean }>`select case
    when ${type}='PAYMENT_VERIFIED' then exists(select 1 from platform.outbox_events e where e.organization_id=${organizationId} and e.event_type='payments.payment.verified' and e.payload->>'orderId'=${orderId})
    when ${type}='ORDER_DISPATCHED' then exists(select 1 from fulfillment.fulfillments f where f.organization_id=${organizationId} and f.order_id=${orderId}::uuid and f.status='DISPATCHED')
    when ${type}='DELIVERY_COMPLETED' then exists(select 1 from delivery.deliveries d where d.organization_id=${organizationId} and d.order_id=${orderId}::uuid and d.outcome_status='DELIVERED')
    when ${type}='REFUND_COMPLETED' then exists(select 1 from payments.refunds r where r.organization_id=${organizationId} and r.order_id=${orderId}::uuid and r.status='COMPLETED')
    else false end eligible`.execute(db);
  return result.rows[0]?.eligible ?? false;
}

async function smsPolicy(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  notificationType: string,
) {
  return (
    await sql<{
      notification_type: string;
      delivery_requirement: string;
      template_key: TransactionalSmsTemplateKey | null;
      enabled: boolean;
      automatic_enabled: boolean;
      manual_allowed: boolean;
      updated_at: string | null;
    }>`select p.notification_type,p.delivery_requirement,cp.template_key,
      coalesce(o.enabled,cp.enabled) enabled,coalesce(o.automatic_enabled,cp.automatic_enabled) automatic_enabled,
      coalesce(o.manual_allowed,cp.manual_allowed) manual_allowed,o.updated_at::text
    from notifications.notification_policies p
    join notifications.notification_channel_policies cp on cp.notification_type=p.notification_type and cp.channel='SMS'
    left join notifications.organization_policy_overrides o on o.organization_id=${organizationId} and o.notification_type=p.notification_type and o.channel='SMS'
    where p.notification_type=${notificationType}`.execute(db)
  ).rows[0];
}

export async function listSmsPolicies(db: Kysely<DatabaseSchema>, organizationId: string) {
  return (
    await sql`select p.notification_type,p.delivery_requirement,cp.template_key,
      coalesce(o.enabled,cp.enabled) enabled,coalesce(o.automatic_enabled,cp.automatic_enabled) automatic_enabled,
      coalesce(o.manual_allowed,cp.manual_allowed) manual_allowed,o.updated_at::text
    from notifications.notification_policies p
    join notifications.notification_channel_policies cp on cp.notification_type=p.notification_type and cp.channel='SMS'
    left join notifications.organization_policy_overrides o on o.organization_id=${organizationId} and o.notification_type=p.notification_type and o.channel='SMS'
    order by p.notification_type`.execute(db)
  ).rows;
}

export async function updateSmsPolicy(
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
    throw new SmsNotificationError('VALIDATION_FAILED', 'A policy-change reason is required.');
  await db.transaction().execute(async (tx) => {
    const before = await smsPolicy(tx, input.organizationId, input.notificationType);
    if (!before) throw new SmsNotificationError('NOT_FOUND', 'SMS policy was not found.');
    await sql`insert into notifications.organization_policy_overrides(organization_id,notification_type,channel,enabled,automatic_enabled,manual_allowed,updated_by_actor_id)
      values(${input.organizationId},${input.notificationType},'SMS',${input.enabled},${input.automaticEnabled},${input.manualAllowed},${input.actorId})
      on conflict(organization_id,notification_type,channel) do update set enabled=excluded.enabled,automatic_enabled=excluded.automatic_enabled,manual_allowed=excluded.manual_allowed,updated_by_actor_id=excluded.updated_by_actor_id,updated_at=now()`.execute(
      tx,
    );
    await appendAuditEvent(tx, {
      organizationId: input.organizationId,
      actorType: 'USER',
      actorId: input.actorId,
      action: 'notifications.sms_policy.updated',
      targetType: 'notifications.notification_policy',
      reason: input.reason.trim(),
      beforeDiff: before,
      afterDiff: {
        enabled: input.enabled,
        automaticEnabled: input.automaticEnabled,
        manualAllowed: input.manualAllowed,
      },
    });
  });
}

function smsModel(order: Awaited<ReturnType<typeof orderSmsModel>>, storefrontBaseUrl: string) {
  return {
    customerName: order.display_name,
    orderNumber: order.order_number,
    currencyCode: order.currency_code,
    totalAmount: order.total_amount,
    trackingUrl: `${storefrontBaseUrl}/orders/track`,
  };
}

export async function previewOrderSms(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    notificationType: string;
    orderId?: string;
    fixture?: {
      orderNumber?: string;
      totalAmount?: string;
      phone?: string;
      customerName?: string;
      trackingUrl?: string;
    };
    storefrontBaseUrl: string;
  },
) {
  const policy = await smsPolicy(db, input.organizationId, input.notificationType);
  if (!policy?.template_key)
    throw new SmsNotificationError('VALIDATION_FAILED', 'This event has no SMS template.');
  const order = input.orderId
    ? await orderSmsModel(db, input.organizationId, input.orderId)
    : {
        id: '',
        customer_id: '',
        display_name: input.fixture?.customerName ?? 'Customer',
        order_number: input.fixture?.orderNumber ?? 'MV10248',
        phone: input.fixture?.phone ?? '01712345678',
        normalized_phone: '+8801712345678',
        currency_code: 'BDT',
        total_amount: input.fixture?.totalAmount ?? '680.00',
        order_status: 'CONFIRMED',
      };
  const model = {
    ...smsModel(order, input.storefrontBaseUrl),
    ...(input.fixture?.customerName ? { customerName: input.fixture.customerName } : {}),
    ...(input.fixture?.trackingUrl ? { trackingUrl: input.fixture.trackingUrl } : {}),
  };
  const rendered = renderTransactionalSms(
    policy.template_key,
    model,
  );
  const phone = normalizeBangladeshPhone(order.normalized_phone ?? order.phone);
  const segmentCapacity =
    rendered.segmentCount <= 1
      ? rendered.perSegmentLimit
      : rendered.perSegmentLimit * rendered.segmentCount;
  return {
    ...rendered,
    segmentCapacity,
    unitsRemainingInSegment: Math.max(0, segmentCapacity - rendered.encodingUnitCount),
    intendedRecipient: order.phone,
    normalizedRecipient: phone.valid ? phone.normalized : null,
    phoneValidation: phone.valid ? 'VALID' : phone.reason === 'MISSING' ? 'MISSING' : 'INVALID',
    isSampleFixture: !input.orderId,
  };
}

async function isSuppressed(db: Kysely<DatabaseSchema>, organizationId: string, phone: string) {
  return (
    await sql<{
      reason: string;
    }>`select reason from notifications.sms_suppressions where organization_id=${organizationId} and normalized_phone=${phone} and active order by created_at desc limit 1`.execute(
      db,
    )
  ).rows[0];
}

export async function createManualOrderSms(
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
    runtime: SmsRuntimeOptions;
  },
) {
  if (!/^[A-Za-z0-9._:-]{8,200}$/.test(input.idempotencyKey))
    throw new SmsNotificationError('VALIDATION_FAILED', 'A stable idempotency key is required.');
  if (!input.reason.trim())
    throw new SmsNotificationError('VALIDATION_FAILED', 'A send reason is required.');
  return db.transaction().execute(async (tx) => {
    const policy = await smsPolicy(tx, input.organizationId, input.notificationType);
    if (!policy?.enabled || !policy.manual_allowed || !policy.template_key)
      throw new SmsNotificationError('FORBIDDEN', 'Manual SMS is not allowed for this event.');
    const order = await orderSmsModel(tx, input.organizationId, input.orderId);
    if (
      !(await eventEligible(
        tx,
        input.organizationId,
        order.id,
        input.notificationType,
        order.order_status,
      ))
    )
      throw new SmsNotificationError(
        'CONFLICT',
        'The order has not reached the required business state.',
      );
    const normalized = normalizeBangladeshPhone(
      input.recipientOverride ?? order.normalized_phone ?? order.phone,
    );
    if (!normalized.valid)
      throw new SmsNotificationError(
        'VALIDATION_FAILED',
        `The order has no usable Bangladesh mobile recipient (${normalized.reason}).`,
      );
    if (await isSuppressed(tx, input.organizationId, normalized.normalized))
      throw new SmsNotificationError('CONFLICT', 'This phone number is suppressed.');
    if (!input.runtime.enabled && input.triggerType !== 'TEST')
      throw new SmsNotificationError('CONFLICT', 'SMS sending is globally disabled.');
    if (!input.runtime.providerConfigured)
      throw new SmsNotificationError('CONFLICT', 'An SMS provider is not configured.');
    const rendered = renderTransactionalSms(
      policy.template_key,
      smsModel(order, input.runtime.storefrontBaseUrl),
    );
    const logicalKey = `notification:sms:manual:v1:${input.organizationId}:${input.idempotencyKey}`;
    const fingerprint = createHash('sha256')
      .update(
        JSON.stringify({
          orderId: order.id,
          type: input.notificationType,
          recipient: normalized.normalized,
          template: rendered.templateKey,
          version: rendered.templateVersion,
        }),
      )
      .digest('hex');
    const inserted = await sql<{ id: string }>`insert into notifications.notifications(
      organization_id,notification_type,recipient_type,customer_id,channel,template_key,template_version,rendered_body,
      intended_recipient,effective_recipient,sender_from,status,trigger_type,triggered_by_actor_id,parent_notification_id,
      idempotency_key,request_fingerprint,queued_at,source_domain,source_id)
      values(${input.organizationId},${input.notificationType},'CUSTOMER',${order.customer_id}::uuid,'SMS',${rendered.templateKey},${rendered.templateVersion},${rendered.renderedText},
      ${normalized.normalized},${input.runtime.recipientOverride ?? normalized.normalized},${input.runtime.senderId ?? null},'QUEUED',${input.triggerType ?? 'MANUAL'},${input.actorId},${input.parentNotificationId ?? null}::uuid,
      ${logicalKey},${fingerprint},now(),'orders.order',${order.id}::uuid)
      on conflict(idempotency_key) do nothing returning id`.execute(tx);
    if (!inserted.rows[0]) {
      const existing = (
        await sql<{
          id: string;
          request_fingerprint: string | null;
        }>`select id,request_fingerprint from notifications.notifications where idempotency_key=${logicalKey}`.execute(
          tx,
        )
      ).rows[0]!;
      if (existing.request_fingerprint !== fingerprint)
        throw new SmsNotificationError(
          'CONFLICT',
          'The idempotency key was reused for a different SMS request.',
        );
      return { id: existing.id, created: false };
    }
    const id = inserted.rows[0].id;
    await sql`insert into notifications.sms_delivery_details(notification_id,organization_id,original_recipient,normalized_recipient,encoding,character_count,encoding_unit_count,estimated_segments,sender_type,sender_id)
      values(${id}::uuid,${input.organizationId},${order.phone},${normalized.normalized},${rendered.encoding},${rendered.characterCount},${rendered.encodingUnitCount},${rendered.segmentCount},${input.runtime.senderType},${input.runtime.senderId ?? null})`.execute(
      tx,
    );
    await sql`insert into notifications.delivery_events(organization_id,notification_id,event_type,source,metadata) values(${input.organizationId},${id}::uuid,'QUEUED','ADMIN',${JSON.stringify({ reason: input.reason.trim(), triggerType: input.triggerType ?? 'MANUAL' })}::jsonb)`.execute(
      tx,
    );
    await appendAuditEvent(tx, {
      organizationId: input.organizationId,
      actorType: 'USER',
      actorId: input.actorId,
      action: `notifications.sms.${(input.triggerType ?? 'MANUAL').toLowerCase()}_queued`,
      targetType: 'notifications.notification',
      targetId: id,
      reason: input.reason.trim(),
      metadata: { notificationType: input.notificationType, orderId: order.id },
    });
    return { id, created: true };
  });
}

export async function listSmsNotifications(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    status?: string;
    sourceId?: string;
    customerId?: string;
    notificationType?: string;
    templateKey?: string;
    triggerType?: string;
    encoding?: string;
    provider?: string;
    search?: string;
    createdFrom?: string;
    createdTo?: string;
    page?: number;
    pageSize?: number;
  },
) {
  const page = Math.max(1, input.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, input.pageSize ?? 25));
  const offset = (page - 1) * pageSize;
  const search = input.search?.trim();
  const filters = sql`
      ${input.status ? sql`and n.status=${input.status}` : sql``}
      ${input.sourceId ? sql`and n.source_id=${input.sourceId}::uuid` : sql``}
      ${input.customerId ? sql`and n.customer_id=${input.customerId}::uuid` : sql``}
      ${input.notificationType ? sql`and n.notification_type=${input.notificationType}` : sql``}
      ${input.templateKey ? sql`and n.template_key=${input.templateKey}` : sql``}
      ${input.triggerType ? sql`and n.trigger_type=${input.triggerType}` : sql``}
      ${input.encoding ? sql`and d.encoding=${input.encoding}` : sql``}
      ${input.provider ? sql`and coalesce(n.provider,'none')=${input.provider}` : sql``}
      ${input.createdFrom ? sql`and n.created_at>=${input.createdFrom}::timestamptz` : sql``}
      ${input.createdTo ? sql`and n.created_at<${input.createdTo}::timestamptz + interval '1 day'` : sql``}
      ${search ? sql`and (o.order_number ilike ${`%${search}%`} or n.intended_recipient ilike ${`%${search}%`} or n.effective_recipient ilike ${`%${search}%`} or n.id::text ilike ${`%${search}%`} or n.provider_message_id ilike ${`%${search}%`})` : sql``}`;
  const items =
    await sql`select n.id,n.notification_type,n.status,n.intended_recipient,n.effective_recipient,n.source_id,n.source_domain,
      n.provider,n.provider_message_id,n.trigger_type,n.created_at::text,n.queued_at::text,n.sent_at::text,n.delivered_at::text,
      n.skip_reason,n.failure_code,n.failure_message,n.customer_id,n.parent_notification_id,n.template_key,n.template_version,
      d.encoding,d.character_count,d.estimated_segments,d.provider_reported_segments,d.provider_reported_cost::text,d.provider_cost_currency,d.sender_type,d.sender_id,
      o.order_number,c.display_name customer_name,latest.status latest_attempt_status,latest.next_retry_at::text
    from notifications.notifications n join notifications.sms_delivery_details d on d.notification_id=n.id
    left join orders.orders o on n.source_domain='orders.order' and o.id=n.source_id
    left join customers.customers c on c.id=n.customer_id
    left join lateral (select a.status,a.next_retry_at from notifications.delivery_attempts a where a.notification_id=n.id order by a.attempt_number desc limit 1) latest on true
    where n.organization_id=${input.organizationId} and n.channel='SMS' ${filters}
    order by n.created_at desc,n.id desc limit ${pageSize} offset ${offset}`.execute(db);
  const total =
    (
      await sql<{ count: string }>`select count(*)::text count from notifications.notifications n
    join notifications.sms_delivery_details d on d.notification_id=n.id
    left join orders.orders o on n.source_domain='orders.order' and o.id=n.source_id
    where n.organization_id=${input.organizationId} and n.channel='SMS' ${filters}`.execute(db)
    ).rows[0]?.count ?? '0';
  return {
    items: items.rows,
    pagination: {
      page,
      pageSize,
      totalItems: Number(total),
      totalPages: Math.ceil(Number(total) / pageSize),
    },
  };
}

export interface SmsNotificationDetailResult {
  readonly id: string;
  readonly organization_id: string;
  readonly status: string;
  readonly source_id?: string | null;
  readonly order_number?: string | null;
  readonly customer_name?: string | null;
  readonly original_recipient?: string | null;
  readonly normalized_recipient?: string | null;
  readonly rendered_body?: string | null;
  readonly encoding?: string | null;
  readonly character_count?: number | null;
  readonly encoding_unit_count?: number | null;
  readonly estimated_segments?: number | null;
  readonly provider_reported_segments?: number | null;
  readonly provider_reported_cost?: string | null;
  readonly provider_cost_currency?: string | null;
  readonly sender_type?: string | null;
  readonly sender_id?: string | null;
  readonly reconcile_after?: string | null;
  readonly latest_attempt_status?: string | null;
  readonly next_retry_at?: string | null;
  readonly attempts: readonly unknown[];
  readonly timeline: readonly unknown[];
  readonly providerEvents: readonly unknown[];
  readonly auditEvents: readonly unknown[];
  readonly relatedNotifications: readonly unknown[];
  readonly recommendedAction: {
    readonly code: string;
    readonly label: string;
    readonly explanation: string;
  };
  readonly availableActions: {
    readonly canRetry: boolean;
    readonly canResend: boolean;
    readonly canPreview: boolean;
    readonly retryReason: string;
    readonly resendReason: string;
  };
  readonly [key: string]: unknown;
}

export async function getSmsNotification(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  id: string,
): Promise<SmsNotificationDetailResult> {
  const item = (
    await sql<
      Record<string, unknown>
    >`select n.*,d.encoding,d.character_count,d.encoding_unit_count,d.estimated_segments,d.provider_reported_segments,
      d.provider_reported_cost::text,d.provider_cost_currency,d.sender_type,d.sender_id,d.original_recipient,d.normalized_recipient,d.reconcile_after::text,
      o.order_number,c.display_name customer_name,latest.status latest_attempt_status,latest.next_retry_at::text
    from notifications.notifications n join notifications.sms_delivery_details d on d.notification_id=n.id
    left join orders.orders o on n.source_domain='orders.order' and o.id=n.source_id
    left join customers.customers c on c.id=n.customer_id
    left join lateral (select a.status,a.next_retry_at from notifications.delivery_attempts a where a.notification_id=n.id order by a.attempt_number desc limit 1) latest on true
    where n.organization_id=${organizationId} and n.id=${id}::uuid and n.channel='SMS'`.execute(db)
  ).rows[0];
  if (!item) throw new SmsNotificationError('NOT_FOUND', 'SMS notification was not found.');
  const [attempts, timeline, providerEvents, auditEvents, related] = await Promise.all([
    sql`select id,attempt_number,provider,provider_message_id,status,started_at::text,completed_at::text,next_retry_at::text,error_code,error_category,error_metadata,response_metadata from notifications.delivery_attempts where notification_id=${id}::uuid order by attempt_number`.execute(
      db,
    ),
    sql`select id,event_type,event_at::text,source,provider_event_id,metadata from notifications.delivery_events where notification_id=${id}::uuid order by event_at,id`.execute(
      db,
    ),
    sql`select id,provider,provider_event_id,provider_message_id,provider_status,normalized_status,safe_metadata,provider_occurred_at::text,received_at::text,processed_at::text,processing_result from notifications.sms_provider_events where notification_id=${id}::uuid order by received_at,id`.execute(
      db,
    ),
    sql`select a.id,a.action,u.name actor_name,a.reason,a.metadata,a.created_at::text from audit.audit_events a left join iam.users u on u.id=a.actor_id where a.organization_id=${organizationId} and a.target_type='notifications.notification' and a.target_id=${id}::uuid order by a.created_at,a.id`.execute(
      db,
    ),
    listSmsNotifications(db, { organizationId, sourceId: String(item.source_id), pageSize: 100 }),
  ]);
  const status = String(item.status);
  const unknown = status === 'UNKNOWN_PROVIDER_OUTCOME';
  const canRetry = status === 'FAILED';
  const canResend = ['DELIVERED', 'REJECTED', 'EXPIRED', 'UNDELIVERABLE', 'FAILED'].includes(
    status,
  );
  const recommendedAction = unknown
    ? {
        code: 'WAIT_FOR_RECONCILIATION',
        label: 'Wait for reconciliation',
        explanation:
          'The provider may already have accepted this request. Sending another copy now could create a duplicate charge and customer message.',
      }
    : canRetry
      ? {
          code: 'REVIEW_AND_RETRY',
          label: 'Review technical failure',
          explanation:
            'Review the latest attempt. Retry continues this same logical notification when the failure is confirmed.',
        }
      : status === 'ACCEPTED' || status === 'DELIVERY_DELAYED'
        ? {
            code: 'WAIT_FOR_DELIVERY_REPORT',
            label: 'Wait for delivery report',
            explanation:
              'The provider accepted the SMS, but handset delivery is not confirmed yet.',
          }
        : {
            code: 'NO_ACTION_REQUIRED',
            label: 'No action required',
            explanation: 'The current lifecycle state does not require an operator action.',
          };
  return {
    ...item,
    id: String(item.id),
    organization_id: String(item.organization_id),
    status,
    attempts: attempts.rows,
    timeline: timeline.rows,
    providerEvents: providerEvents.rows,
    auditEvents: auditEvents.rows,
    relatedNotifications: related.items.filter(
      (candidate) => (candidate as { id: string }).id !== id,
    ),
    recommendedAction,
    availableActions: {
      canRetry,
      canResend,
      canPreview: true,
      retryReason: canRetry
        ? 'This is a confirmed failed attempt and can safely continue the same logical notification.'
        : unknown
          ? 'Unknown outcomes must be reconciled before retrying.'
          : 'Retry is available only for confirmed technical failures.',
      resendReason: canResend
        ? 'This creates a separately audited customer communication and may incur another provider charge.'
        : unknown
          ? 'Resend is blocked while provider acceptance is uncertain.'
          : 'Wait for the active delivery to reach a terminal state.',
    },
  };
}

export async function retrySmsNotification(
  db: Kysely<DatabaseSchema>,
  input: { organizationId: string; notificationId: string; actorId: string; reason: string },
) {
  if (!input.reason.trim())
    throw new SmsNotificationError('VALIDATION_FAILED', 'A retry reason is required.');
  await db.transaction().execute(async (tx) => {
    const updated = await sql<{
      id: string;
    }>`update notifications.notifications set status='QUEUED',failure_code=null,failure_message=null,queued_at=now(),updated_at=now()
      where organization_id=${input.organizationId} and id=${input.notificationId}::uuid and channel='SMS' and status='FAILED' returning id`.execute(
      tx,
    );
    if (!updated.rows[0])
      throw new SmsNotificationError(
        'CONFLICT',
        'Only a confirmed failed SMS can be retried. Unknown provider outcomes require reconciliation first.',
      );
    await sql`insert into notifications.delivery_events(organization_id,notification_id,event_type,source,metadata) values(${input.organizationId},${input.notificationId}::uuid,'RETRY_REQUESTED','ADMIN',${JSON.stringify({ reason: input.reason.trim() })}::jsonb)`.execute(
      tx,
    );
    await appendAuditEvent(tx, {
      organizationId: input.organizationId,
      actorType: 'USER',
      actorId: input.actorId,
      action: 'notifications.sms.retry_requested',
      targetType: 'notifications.notification',
      targetId: input.notificationId,
      reason: input.reason.trim(),
    });
  });
}

export async function listSmsSuppressions(db: Kysely<DatabaseSchema>, organizationId: string) {
  return (
    await sql`select id,normalized_phone,reason,source,provider,active,created_at::text,cleared_at::text,clear_reason from notifications.sms_suppressions where organization_id=${organizationId} order by active desc,created_at desc`.execute(
      db,
    )
  ).rows;
}

export async function setSmsSuppression(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    phone: string;
    active: boolean;
    reason: string;
  },
) {
  const phone = normalizeBangladeshPhone(input.phone);
  if (!phone.valid || !input.reason.trim())
    throw new SmsNotificationError(
      'VALIDATION_FAILED',
      'A valid Bangladesh mobile and reason are required.',
    );
  await db.transaction().execute(async (tx) => {
    if (input.active)
      await sql`insert into notifications.sms_suppressions(organization_id,normalized_phone,reason,source,active) values(${input.organizationId},${phone.normalized},'ADMIN_SUPPRESSION','ADMIN',true)
      on conflict(organization_id,normalized_phone,reason) do update set active=true,cleared_at=null,cleared_by_actor_id=null,clear_reason=null`.execute(
        tx,
      );
    else
      await sql`update notifications.sms_suppressions set active=false,cleared_at=now(),cleared_by_actor_id=${input.actorId},clear_reason=${input.reason.trim()} where organization_id=${input.organizationId} and normalized_phone=${phone.normalized} and active`.execute(
        tx,
      );
    await appendAuditEvent(tx, {
      organizationId: input.organizationId,
      actorType: 'USER',
      actorId: input.actorId,
      action: input.active
        ? 'notifications.sms.suppression_added'
        : 'notifications.sms.suppression_cleared',
      targetType: 'notifications.sms_suppression',
      reason: input.reason.trim(),
      metadata: { phoneSuffix: phone.normalized.slice(-4) },
    });
  });
}

export async function deliverPendingSms(
  db: Kysely<DatabaseSchema>,
  provider: SmsProvider,
  runtime: SmsRuntimeOptions,
  limit = 20,
) {
  if (!runtime.enabled || !runtime.providerConfigured || !provider.capabilities.has('SEND'))
    return 0;
  await sql`update notifications.notifications set status='FAILED',failure_code='PROCESSING_LEASE_EXPIRED',updated_at=now() where channel='SMS' and status='PROCESSING' and processing_started_at<now()-interval '5 minutes'`.execute(
    db,
  );
  const pending = await sql<{
    id: string;
    organization_id: string;
    rendered_body: string;
    idempotency_key: string;
    recipient: string;
    encoding: 'GSM_7' | 'UNICODE';
    estimated_segments: number;
    sender_type: SmsSenderType;
    sender_id: string | null;
  }>`with candidates as (
      select n.id from notifications.notifications n where n.channel='SMS' and (n.status='QUEUED' or (n.status='FAILED' and exists(
        select 1 from notifications.delivery_attempts a where a.notification_id=n.id and a.retryable and a.next_retry_at<=now() and a.attempt_number=(select max(a2.attempt_number) from notifications.delivery_attempts a2 where a2.notification_id=n.id))))
        and not exists(select 1 from notifications.delivery_attempts a where a.notification_id=n.id and a.status='ACCEPTED')
      order by n.created_at for update skip locked limit ${limit})
    update notifications.notifications n set status='PROCESSING',processing_started_at=now(),updated_at=now() from candidates c
    join notifications.sms_delivery_details d on d.notification_id=c.id where n.id=c.id
    returning n.id,n.organization_id,n.rendered_body,n.idempotency_key,n.effective_recipient recipient,d.encoding,d.estimated_segments,d.sender_type,d.sender_id`.execute(
    db,
  );
  for (const item of pending.rows) {
    await sql`insert into notifications.delivery_events(organization_id,notification_id,event_type,source,metadata) values(${item.organization_id},${item.id}::uuid,'PROCESSING','APPLICATION','{}'::jsonb)`.execute(
      db,
    );
    let result;
    try {
      result = await provider.send({
        notificationId: item.id,
        recipient: item.recipient,
        text: item.rendered_body,
        encoding: item.encoding,
        estimatedSegments: item.estimated_segments,
        senderType: item.sender_type,
        ...(item.sender_id ? { senderId: item.sender_id } : {}),
        idempotencyKey: item.idempotency_key,
      });
    } catch {
      result = { outcome: 'UNKNOWN' as const, errorCode: 'PROVIDER_REQUEST_OUTCOME_UNKNOWN' };
    }
    await recordSmsAttempt(db, {
      organizationId: item.organization_id,
      notificationId: item.id,
      provider: provider.name,
      result,
    });
  }
  return pending.rows.length;
}

export async function recordSmsAttempt(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    notificationId: string;
    provider: string;
    result: Awaited<ReturnType<SmsProvider['send']>>;
  },
) {
  await db.transaction().execute(async (tx) => {
    const attempt = Number(
      (
        await sql<{
          n: string;
        }>`select (count(*)+1)::text n from notifications.delivery_attempts where notification_id=${input.notificationId}::uuid`.execute(
          tx,
        )
      ).rows[0]?.n ?? '1',
    );
    if (input.result.outcome === 'ACCEPTED') {
      await sql`insert into notifications.delivery_attempts(organization_id,notification_id,attempt_number,provider,provider_message_id,status,completed_at,retryable,response_metadata)
        values(${input.organizationId},${input.notificationId}::uuid,${attempt},${input.provider},${input.result.providerMessageId},'ACCEPTED',now(),false,${JSON.stringify(input.result.safeMetadata ?? {})}::jsonb)`.execute(
        tx,
      );
      await sql`update notifications.notifications set status='ACCEPTED',provider=${input.provider},provider_message_id=${input.result.providerMessageId},sent_at=now(),updated_at=now() where id=${input.notificationId}::uuid`.execute(
        tx,
      );
      await sql`update notifications.sms_delivery_details set provider_reported_segments=${input.result.providerReportedSegments ?? null},provider_reported_cost=${input.result.providerReportedCost ?? null}::numeric,provider_cost_currency=${input.result.providerCostCurrency ?? null},reconcile_after=now()+interval '2 minutes' where notification_id=${input.notificationId}::uuid`.execute(
        tx,
      );
      await sql`insert into notifications.delivery_events(organization_id,notification_id,event_type,source,metadata) values(${input.organizationId},${input.notificationId}::uuid,'ACCEPTED','PROVIDER',${JSON.stringify({ provider: input.provider, providerMessageId: input.result.providerMessageId })}::jsonb)`.execute(
        tx,
      );
      return;
    }
    if (input.result.outcome === 'UNKNOWN') {
      await sql`insert into notifications.delivery_attempts(organization_id,notification_id,attempt_number,provider,provider_message_id,status,completed_at,error_code,error_category,retryable,response_metadata)
        values(${input.organizationId},${input.notificationId}::uuid,${attempt},${input.provider},${input.result.providerMessageId ?? null},'UNKNOWN_OUTCOME',now(),${input.result.errorCode},'UNKNOWN_OUTCOME',false,${JSON.stringify(input.result.safeMetadata ?? {})}::jsonb)`.execute(
        tx,
      );
      await sql`update notifications.notifications set status='UNKNOWN_PROVIDER_OUTCOME',provider=${input.provider},provider_message_id=coalesce(${input.result.providerMessageId ?? null},provider_message_id),failure_code=${input.result.errorCode},updated_at=now() where id=${input.notificationId}::uuid`.execute(
        tx,
      );
      await sql`update notifications.sms_delivery_details set reconcile_after=now()+interval '2 minutes' where notification_id=${input.notificationId}::uuid`.execute(
        tx,
      );
      await sql`insert into notifications.delivery_events(organization_id,notification_id,event_type,source,metadata) values(${input.organizationId},${input.notificationId}::uuid,'UNKNOWN_PROVIDER_OUTCOME','APPLICATION',${JSON.stringify({ provider: input.provider, errorCode: input.result.errorCode })}::jsonb)`.execute(
        tx,
      );
      return;
    }
    const retryable = input.result.retryable && attempt < 5;
    const nextRetry = retryable ? retryAt(attempt) : null;
    await sql`insert into notifications.delivery_attempts(organization_id,notification_id,attempt_number,provider,status,completed_at,next_retry_at,error_code,error_category,retryable,response_metadata)
      values(${input.organizationId},${input.notificationId}::uuid,${attempt},${input.provider},${retryable ? 'RETRY_WAIT' : 'PERMANENT_FAILURE'},now(),${nextRetry},${input.result.errorCode},${input.result.category},${retryable},${JSON.stringify(input.result.safeMetadata ?? {})}::jsonb)`.execute(
      tx,
    );
    await sql`update notifications.notifications set status='FAILED',provider=${input.provider},failure_code=${input.result.errorCode},updated_at=now() where id=${input.notificationId}::uuid`.execute(
      tx,
    );
    await sql`insert into notifications.delivery_events(organization_id,notification_id,event_type,source,metadata) values(${input.organizationId},${input.notificationId}::uuid,${retryable ? 'RETRY_SCHEDULED' : 'FAILED'},'APPLICATION',${JSON.stringify({ provider: input.provider, category: input.result.category, errorCode: input.result.errorCode, nextRetryAt: nextRetry?.toISOString() })}::jsonb)`.execute(
      tx,
    );
  });
}

/** Runs one explicitly-created TEST notification through the real persistence lifecycle using the mock adapter. */
export async function runSmsTestScenario(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    notificationId: string;
    scenario: MockSmsMode;
  },
) {
  const claimed = (
    await sql<{
      id: string;
      rendered_body: string;
      idempotency_key: string;
      recipient: string;
      encoding: 'GSM_7' | 'UNICODE';
      estimated_segments: number;
      sender_type: SmsSenderType;
      sender_id: string | null;
    }>`update notifications.notifications n set status='PROCESSING',processing_started_at=now(),updated_at=now()
    from notifications.sms_delivery_details d
    where n.id=${input.notificationId}::uuid and n.organization_id=${input.organizationId} and n.channel='SMS'
      and n.trigger_type='TEST' and n.status='QUEUED' and d.notification_id=n.id
    returning n.id,n.rendered_body,n.idempotency_key,n.effective_recipient recipient,d.encoding,d.estimated_segments,d.sender_type,d.sender_id`.execute(
      db,
    )
  ).rows[0];
  if (!claimed)
    throw new SmsNotificationError(
      'CONFLICT',
      'Only a newly queued test SMS can run a mock scenario.',
    );
  await sql`insert into notifications.delivery_events(organization_id,notification_id,event_type,source,metadata)
    values(${input.organizationId},${input.notificationId}::uuid,'PROCESSING','APPLICATION',${JSON.stringify({ mockScenario: input.scenario })}::jsonb)`.execute(
    db,
  );
  const provider = createMockSmsProvider({ mode: input.scenario });
  const result = await provider.send({
    notificationId: claimed.id,
    recipient: claimed.recipient,
    text: claimed.rendered_body,
    encoding: claimed.encoding,
    estimatedSegments: claimed.estimated_segments,
    senderType: claimed.sender_type,
    ...(claimed.sender_id ? { senderId: claimed.sender_id } : {}),
    idempotencyKey: claimed.idempotency_key,
  });
  await recordSmsAttempt(db, {
    organizationId: input.organizationId,
    notificationId: claimed.id,
    provider: provider.name,
    result,
  });
  if (result.outcome === 'ACCEPTED' && input.scenario !== 'ACCEPTED' && provider.getMessageStatus) {
    const event = await provider.getMessageStatus(result.providerMessageId);
    if (event) await applySmsDeliveryEvent(db, provider.name, event);
  }
}

const terminalStatuses = new Set(['DELIVERED', 'REJECTED', 'EXPIRED', 'UNDELIVERABLE']);
export async function applySmsDeliveryEvent(
  db: Kysely<DatabaseSchema>,
  provider: string,
  event: NormalizedSmsDeliveryEvent,
) {
  return db.transaction().execute(async (tx) => {
    const notification = (
      await sql<{
        id: string;
        organization_id: string;
        status: string;
      }>`select id,organization_id,status from notifications.notifications where channel='SMS' and provider=${provider} and provider_message_id=${event.providerMessageId} for update`.execute(
        tx,
      )
    ).rows[0];
    const inserted = await sql<{
      id: string;
    }>`insert into notifications.sms_provider_events(provider,provider_event_id,provider_message_id,notification_id,provider_status,normalized_status,safe_metadata,provider_occurred_at)
      values(${provider},${event.providerEventId},${event.providerMessageId},${notification?.id ?? null}::uuid,${event.providerStatus},${event.status},${JSON.stringify(event.safeMetadata ?? {})}::jsonb,${event.occurredAt ?? null}::timestamptz)
      on conflict(provider,provider_event_id) do nothing returning id::text`.execute(tx);
    if (!inserted.rows[0]) return { processed: false, reason: 'DUPLICATE' as const };
    if (!notification) {
      await sql`update notifications.sms_provider_events set processed_at=now(),processing_result='UNKNOWN_PROVIDER_MESSAGE' where id=${inserted.rows[0].id}::bigint`.execute(
        tx,
      );
      return { processed: false, reason: 'UNKNOWN_PROVIDER_MESSAGE' as const };
    }
    const regressive =
      terminalStatuses.has(notification.status) ||
      (notification.status === 'DELIVERY_DELAYED' && event.status === 'ACCEPTED');
    if (!regressive) {
      await sql`update notifications.notifications set status=${event.status},delivered_at=case when ${event.status}='DELIVERED' then coalesce(delivered_at,${event.occurredAt ?? null}::timestamptz,now()) else delivered_at end,updated_at=now() where id=${notification.id}::uuid`.execute(
        tx,
      );
      await sql`update notifications.sms_delivery_details set provider_reported_segments=coalesce(${event.providerReportedSegments ?? null},provider_reported_segments),provider_reported_cost=coalesce(${event.providerReportedCost ?? null}::numeric,provider_reported_cost),provider_cost_currency=coalesce(${event.providerCostCurrency ?? null},provider_cost_currency),reconcile_after=null where notification_id=${notification.id}::uuid`.execute(
        tx,
      );
    }
    await sql`insert into notifications.delivery_events(organization_id,notification_id,event_type,event_at,source,provider_event_id,metadata)
      values(${notification.organization_id},${notification.id}::uuid,${event.status},coalesce(${event.occurredAt ?? null}::timestamptz,now()),'PROVIDER',${event.providerEventId},${JSON.stringify({ providerStatus: event.providerStatus, ignoredAsRegressive: regressive })}::jsonb)`.execute(
      tx,
    );
    await sql`update notifications.sms_provider_events set processed_at=now(),processing_result=${regressive ? 'RECORDED_WITHOUT_STATE_REGRESSION' : 'APPLIED'} where id=${inserted.rows[0].id}::bigint`.execute(
      tx,
    );
    return { processed: true, stateChanged: !regressive };
  });
}

export async function pollSmsDeliveryStatuses(
  db: Kysely<DatabaseSchema>,
  provider: SmsProvider,
  limit = 20,
) {
  if (!provider.capabilities.has('DELIVERY_STATUS_POLLING') || !provider.getMessageStatus) return 0;
  const rows = await sql<{
    notification_id: string;
    provider_message_id: string;
  }>`select d.notification_id,n.provider_message_id from notifications.sms_delivery_details d join notifications.notifications n on n.id=d.notification_id
    where n.provider=${provider.name} and n.provider_message_id is not null and n.status in ('ACCEPTED','DELIVERY_DELAYED','UNKNOWN_PROVIDER_OUTCOME') and d.reconcile_after<=now()
    order by d.reconcile_after for update skip locked limit ${limit}`.execute(db);
  for (const row of rows.rows) {
    await sql`update notifications.sms_delivery_details set last_polled_at=now(),reconcile_after=now()+interval '5 minutes' where notification_id=${row.notification_id}::uuid`.execute(
      db,
    );
    const event = await provider.getMessageStatus(row.provider_message_id);
    if (event) await applySmsDeliveryEvent(db, provider.name, event);
  }
  return rows.rows.length;
}

export async function getOrderSmsEligibility(
  db: Kysely<DatabaseSchema>,
  input: { organizationId: string; orderId: string; runtime: SmsRuntimeOptions },
) {
  const order = await orderSmsModel(db, input.organizationId, input.orderId);
  const policies = (await listSmsPolicies(db, input.organizationId)) as Array<
    Record<string, unknown>
  >;
  const existing = await listSmsNotifications(db, {
    organizationId: input.organizationId,
    sourceId: order.id,
    pageSize: 100,
  });
  const phone = normalizeBangladeshPhone(order.normalized_phone ?? order.phone);
  const suppressed = phone.valid
    ? await isSuppressed(db, input.organizationId, phone.normalized)
    : undefined;
  const events = await Promise.all(
    policies.map(async (policy) => {
      const type = String(policy.notification_type);
      const latest = existing.items.find(
        (n) => (n as { notification_type: string }).notification_type === type,
      ) as Record<string, unknown> | undefined;
      const reached = await eventEligible(
        db,
        input.organizationId,
        order.id,
        type,
        order.order_status,
      );
      let eligibilityCode = 'ELIGIBLE';
      if (!phone.valid) eligibilityCode = phone.reason === 'MISSING' ? 'NO_PHONE' : 'INVALID_PHONE';
      else if (suppressed) eligibilityCode = 'RECIPIENT_SUPPRESSED';
      else if (!input.runtime.enabled) eligibilityCode = 'SMS_GLOBALLY_DISABLED';
      else if (!input.runtime.providerConfigured) eligibilityCode = 'PROVIDER_NOT_CONFIGURED';
      else if (!policy.enabled) eligibilityCode = 'EVENT_POLICY_DISABLED';
      else if (!reached) eligibilityCode = 'WAITING_FOR_ORDER_STATE';
      else if (latest) eligibilityCode = String(latest.status);
      const decisionSteps = [
        {
          key: 'GLOBAL_SMS',
          label: 'SMS sending enabled',
          passed: input.runtime.enabled,
          explanation: input.runtime.enabled
            ? 'Maevelle may process SMS delivery.'
            : 'The deployment-level SMS switch is disabled.',
        },
        {
          key: 'EVENT_POLICY',
          label: `${type.replaceAll('_', ' ')} policy enabled`,
          passed: Boolean(policy.enabled),
          explanation: policy.enabled
            ? 'This event is enabled for SMS.'
            : 'This event is disabled by policy.',
        },
        {
          key: 'AUTOMATIC_POLICY',
          label: 'Automatic sending enabled',
          passed: Boolean(policy.automatic_enabled),
          explanation: policy.automatic_enabled
            ? 'The event may create an automatic SMS.'
            : 'The event is currently manual-only.',
        },
        {
          key: 'ORDER_STATE',
          label: 'Order reached required state',
          passed: reached,
          explanation: reached
            ? 'The authoritative business event has occurred.'
            : 'The required business event has not occurred yet.',
        },
        {
          key: 'PHONE',
          label: 'Customer phone is valid',
          passed: phone.valid,
          explanation: phone.valid
            ? 'The order snapshot contains a valid Bangladesh mobile.'
            : phone.reason === 'MISSING'
              ? 'The order snapshot has no phone number.'
              : 'The order snapshot phone is not a valid Bangladesh mobile.',
        },
        {
          key: 'SUPPRESSION',
          label: 'Recipient is not suppressed',
          passed: !suppressed,
          explanation: suppressed
            ? `Sending is blocked: ${suppressed.reason.replaceAll('_', ' ').toLowerCase()}.`
            : 'No active SMS suppression applies.',
        },
        {
          key: 'PROVIDER',
          label: 'SMS provider configured',
          passed: input.runtime.providerConfigured,
          explanation: input.runtime.providerConfigured
            ? `${input.runtime.providerName} is available for delivery.`
            : 'A production provider has not been connected yet.',
        },
      ];
      return {
        notificationType: type,
        templateKey: policy.template_key,
        policy: {
          enabled: policy.enabled,
          automaticEnabled: policy.automatic_enabled,
          manualAllowed: policy.manual_allowed,
        },
        orderReachedState: reached,
        canSendManually: eligibilityCode === 'ELIGIBLE' && Boolean(policy.manual_allowed),
        eligibilityCode,
        decisionSteps,
        latestNotification: latest ?? null,
      };
    }),
  );
  return {
    orderId: order.id,
    orderNumber: order.order_number,
    orderStatus: order.order_status,
    customerPhone: order.phone,
    normalizedPhone: phone.valid ? phone.normalized : null,
    isSuppressed: Boolean(suppressed),
    suppressionReason: suppressed?.reason ?? null,
    globalSmsEnabled: input.runtime.enabled,
    providerConfigured: input.runtime.providerConfigured,
    providerName: input.runtime.providerName,
    recipientOverride: input.runtime.recipientOverride ?? null,
    phoneValidation: phone.valid ? 'VALID' : phone.reason === 'MISSING' ? 'MISSING' : 'INVALID',
    events,
  };
}

export async function smsOperationalSummary(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  runtime: SmsRuntimeOptions,
  provider?: SmsProvider,
) {
  const stats =
    (
      await sql<Record<string, string | null>>`select
    count(*) filter(where n.status='QUEUED')::text queued,count(*) filter(where n.status='PROCESSING')::text processing,
    count(*) filter(where n.status='FAILED')::text failed,count(*) filter(where n.status='ACCEPTED')::text accepted,count(*) filter(where n.status='DELIVERED')::text delivered,
    count(*) filter(where n.status in ('NOT_APPLICABLE','SKIPPED_NO_PHONE'))::text skipped,count(*) filter(where n.status='SUPPRESSED')::text suppressed,
    coalesce(sum(d.estimated_segments),0)::text estimated_segments,count(*) filter(where d.encoding='UNICODE')::text unicode_messages,count(*) filter(where d.encoding='GSM_7')::text gsm7_messages,
    count(*) filter(where latest.status='RETRY_WAIT')::text retries_scheduled,
    count(*) filter(where n.created_at>=date_trunc('day',now()))::text today_created,
    count(*) filter(where n.created_at>=date_trunc('day',now()) and n.status='QUEUED')::text today_queued,
    count(*) filter(where n.created_at>=date_trunc('day',now()) and n.status='ACCEPTED')::text today_accepted,
    count(*) filter(where n.created_at>=date_trunc('day',now()) and n.status='DELIVERED')::text today_delivered,
    count(*) filter(where n.created_at>=date_trunc('day',now()) and n.status in ('FAILED','REJECTED','EXPIRED','UNDELIVERABLE'))::text today_failed,
    count(*) filter(where n.created_at>=date_trunc('day',now()) and n.status in ('NOT_APPLICABLE','SKIPPED_NO_PHONE'))::text today_skipped,
    count(*) filter(where n.created_at>=date_trunc('day',now()) and n.status='SUPPRESSED')::text today_suppressed,
    coalesce(sum(d.estimated_segments) filter(where n.created_at>=date_trunc('day',now())),0)::text today_segments,
    count(*) filter(where n.created_at>=now()-interval '7 days')::text week_created,
    count(*) filter(where n.created_at>=now()-interval '7 days' and n.status='DELIVERED')::text week_delivered,
    count(*) filter(where n.created_at>=now()-interval '7 days' and n.status in ('FAILED','REJECTED','EXPIRED','UNDELIVERABLE'))::text week_failed,
    min(n.created_at) filter(where n.status='QUEUED')::text oldest_queued_at,
    (select max(e.received_at)::text from notifications.sms_provider_events e join notifications.notifications en on en.id=e.notification_id where en.organization_id=${organizationId}) last_callback_at,
    (select max(a.started_at)::text from notifications.delivery_attempts a join notifications.notifications an on an.id=a.notification_id where an.organization_id=${organizationId} and an.channel='SMS') last_worker_activity_at
    from notifications.notifications n
    join notifications.sms_delivery_details d on d.notification_id=n.id
    left join lateral (select x.status from notifications.delivery_attempts x where x.notification_id=n.id order by x.attempt_number desc limit 1) latest on true
    where n.organization_id=${organizationId} and n.channel='SMS'`.execute(db)
    ).rows[0] ?? {};
  const activeSuppressions = Number(
    (
      await sql<{
        count: string;
      }>`select count(*)::text count from notifications.sms_suppressions where organization_id=${organizationId} and active`.execute(
        db,
      )
    ).rows[0]?.count ?? 0,
  );
  const capabilities = provider ? [...provider.capabilities].sort() : [];
  const weekDelivered = Number(stats.week_delivered ?? 0);
  const weekFailed = Number(stats.week_failed ?? 0);
  const concluded = weekDelivered + weekFailed;
  return {
    enabled: runtime.enabled,
    provider: runtime.providerName,
    providerConfigured: runtime.providerConfigured,
    environment: runtime.environment,
    senderType: runtime.senderType,
    senderId: runtime.senderId ?? null,
    recipientOverride: runtime.recipientOverride ?? null,
    capabilities,
    credentialsConfigured: runtime.providerConfigured,
    mode: !runtime.enabled ? 'DISABLED' : runtime.providerName === 'mock' ? 'MOCK' : 'PRODUCTION',
    allowedTestRecipients: runtime.allowedTestRecipients ?? [],
    callbackSupported: capabilities.includes('DELIVERY_CALLBACK'),
    pollingSupported: capabilities.includes('DELIVERY_STATUS_POLLING'),
    callbackConfigured: capabilities.includes('DELIVERY_CALLBACK'),
    queued: Number(stats.queued ?? 0),
    processing: Number(stats.processing ?? 0),
    failed: Number(stats.failed ?? 0),
    accepted: Number(stats.accepted ?? 0),
    delivered: Number(stats.delivered ?? 0),
    skipped: Number(stats.skipped ?? 0),
    suppressed: Number(stats.suppressed ?? 0),
    activeSuppressions,
    estimatedSegments: Number(stats.estimated_segments ?? 0),
    unicodeMessages: Number(stats.unicode_messages ?? 0),
    gsm7Messages: Number(stats.gsm7_messages ?? 0),
    retriesScheduled: Number(stats.retries_scheduled ?? 0),
    today: {
      created: Number(stats.today_created ?? 0),
      queued: Number(stats.today_queued ?? 0),
      accepted: Number(stats.today_accepted ?? 0),
      delivered: Number(stats.today_delivered ?? 0),
      failed: Number(stats.today_failed ?? 0),
      skipped: Number(stats.today_skipped ?? 0),
      suppressed: Number(stats.today_suppressed ?? 0),
      estimatedSegments: Number(stats.today_segments ?? 0),
    },
    last7Days: {
      created: Number(stats.week_created ?? 0),
      delivered: weekDelivered,
      failed: weekFailed,
      deliveryRate: concluded ? Math.round((weekDelivered / concluded) * 1000) / 10 : null,
    },
    oldestQueuedAt: stats.oldest_queued_at ?? null,
    lastDeliveryCallbackAt: stats.last_callback_at ?? null,
    lastWorkerActivityAt: stats.last_worker_activity_at ?? null,
    workerStatus:
      Number(stats.queued ?? 0) > 100
        ? 'BACKLOG'
        : stats.last_worker_activity_at
          ? 'HEALTHY'
          : 'IDLE',
    readiness: [
      {
        key: 'PLATFORM',
        label: 'SMS platform',
        state: 'READY',
        explanation:
          'Templates, policies, persistence, worker, idempotency, and delivery tracking are installed.',
      },
      {
        key: 'PHONE_NORMALIZATION',
        label: 'Bangladesh phone normalization',
        state: 'READY',
        explanation: 'Order snapshot phones are validated and normalized before delivery.',
      },
      {
        key: 'PROVIDER',
        label: 'Production provider',
        state:
          runtime.providerName !== 'none' && runtime.providerName !== 'mock' ? 'READY' : 'PENDING',
        explanation:
          runtime.providerName === 'none'
            ? 'No production provider has been selected.'
            : runtime.providerName === 'mock'
              ? 'The mock adapter is development-only.'
              : `${runtime.providerName} is registered.`,
      },
      {
        key: 'CREDENTIALS',
        label: 'Production credentials',
        state: runtime.providerConfigured && runtime.providerName !== 'mock' ? 'READY' : 'PENDING',
        explanation:
          runtime.providerName === 'mock'
            ? 'Mock mode does not establish production credentials.'
            : runtime.providerConfigured
              ? 'Deployment reports provider configuration is present.'
              : 'Credentials will be configured in deployment secrets after provider selection.',
      },
      {
        key: 'SENDER',
        label: 'Production sender',
        state: runtime.senderId && runtime.providerName !== 'mock' ? 'READY' : 'PENDING',
        explanation: runtime.senderId
          ? `${runtime.senderType} sender identity is configured.`
          : 'Sender identity and external approval remain pending.',
      },
      {
        key: 'DELIVERY_TRACKING',
        label: 'Delivery tracking',
        state:
          capabilities.includes('DELIVERY_CALLBACK') ||
          capabilities.includes('DELIVERY_STATUS_POLLING')
            ? 'READY'
            : 'PENDING',
        explanation: capabilities.length
          ? 'The active adapter declares delivery tracking capability.'
          : 'Callback or polling behavior will be known after provider selection.',
      },
    ],
  };
}
