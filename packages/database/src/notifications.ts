import { createHash } from 'node:crypto';
import { sql, type Kysely } from 'kysely';
import {
  constantTimeEqual,
  encryptSecret,
  generateOpaqueToken,
  hmacSha256,
  type EncryptionKey,
} from '@maevelle/security';
import type { DatabaseSchema } from './index.js';
import { appendAuditEvent } from './platform.js';

export class NotificationDomainError extends Error {
  public constructor(
    public readonly code: 'NOT_FOUND' | 'CONFLICT' | 'VALIDATION_FAILED' | 'FORBIDDEN',
    message: string,
  ) {
    super(message);
  }
}
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
const retryAt = (attempt: number) =>
  new Date(Date.now() + Math.min(60 * 60_000, 1_000 * 2 ** attempt));
const supportedEvents: Record<string, { type: string; required: boolean }> = {
  'orders.order.placed': { type: 'ORDER_PLACED', required: true },
  'orders.order.cancelled': { type: 'ORDER_CANCELLED', required: false },
  'payments.payment.verified': { type: 'PAYMENT_VERIFIED', required: true },
  'fulfillment.fulfillment.dispatched': { type: 'ORDER_DISPATCHED', required: true },
  'delivery.delivery.delivered': { type: 'DELIVERY_COMPLETED', required: true },
  'payments.refund.completed': { type: 'REFUND_COMPLETED', required: true },
  'reviews.review.visible': { type: 'REVIEW_VISIBLE', required: false },
};

function validateWebhookUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new NotificationDomainError(
      'VALIDATION_FAILED',
      'Webhook endpoint must be a valid HTTPS URL.',
    );
  }
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.port ||
    url.hostname === 'localhost' ||
    url.hostname.endsWith('.localhost')
  )
    throw new NotificationDomainError(
      'VALIDATION_FAILED',
      'Webhook endpoint is not an allowed public HTTPS destination.',
    );
  const host = url.hostname;
  if (
    /^(127\.|10\.|192\.168\.|169\.254\.|0\.|::1$|fc|fd)/i.test(host) ||
    (host.startsWith('172.') &&
      Number(host.split('.')[1]) >= 16 &&
      Number(host.split('.')[1]) <= 31)
  )
    throw new NotificationDomainError(
      'VALIDATION_FAILED',
      'Webhook endpoint must not target private or reserved network space.',
    );
  return url;
}
export function webhookSignature(
  secret: string,
  eventId: string,
  timestamp: string,
  body: string,
): string {
  return hmacSha256(secret, `${timestamp}.${eventId}.${body}`);
}
export function verifyWebhookSignature(
  secret: string,
  eventId: string,
  timestamp: string,
  body: string,
  signature: string,
): boolean {
  return constantTimeEqual(webhookSignature(secret, eventId, timestamp, body), signature);
}

export async function createNotificationFromOutbox(
  db: Kysely<DatabaseSchema>,
  outboxEventId: number,
) {
  return db.transaction().execute(async (tx) => {
    const receipt = await sql<{
      id: string;
    }>`insert into platform.event_consumer_receipts(outbox_event_id,consumer_name,status) values(${outboxEventId},'notifications.outbox.v1','PROCESSING') on conflict(outbox_event_id,consumer_name) do nothing returning id::text`.execute(
      tx,
    );
    if (!receipt.rows[0]) return { created: false };
    const e = await sql<{
      event_id: string;
      organization_id: string;
      event_type: string;
      aggregate_type: string;
      aggregate_id: string;
      payload: unknown;
    }>`select event_id,organization_id,event_type,aggregate_type,aggregate_id,payload from platform.outbox_events where id=${outboxEventId} for update`.execute(
      tx,
    );
    const event = e.rows[0];
    if (!event?.organization_id) {
      await sql`update platform.event_consumer_receipts set status='COMPLETED',processed_at=now() where id=${receipt.rows[0].id}::bigint`.execute(
        tx,
      );
      return { created: false };
    }
    const rule = supportedEvents[event.event_type];
    if (!rule) {
      await sql`update platform.event_consumer_receipts set status='COMPLETED',processed_at=now() where id=${receipt.rows[0].id}::bigint`.execute(
        tx,
      );
      return { created: false };
    }
    const customer =
      event.event_type.startsWith('orders.') || event.event_type.startsWith('payments.')
        ? await sql<{
            customer_id: string;
          }>`select customer_id from orders.orders where id=coalesce((${JSON.stringify(event.payload)}::jsonb->>'orderId')::uuid,${event.aggregate_id}::uuid) and organization_id=${event.organization_id}`.execute(
            tx,
          )
        : undefined;
    const customerId = customer?.rows[0]?.customer_id;
    if (!customerId) {
      await sql`update platform.event_consumer_receipts set status='COMPLETED',processed_at=now() where id=${receipt.rows[0].id}::bigint`.execute(
        tx,
      );
      return { created: false };
    }
    for (const channel of ['IN_APP', 'EMAIL'] as const) {
      const preference = await sql<{
        enabled: boolean;
      }>`select enabled from notifications.preferences where organization_id=${event.organization_id} and recipient_type='CUSTOMER' and recipient_id=${customerId}::uuid and notification_type=${rule.type} and channel=${channel}`.execute(
        tx,
      );
      const status =
        !rule.required && preference.rows[0]?.enabled === false ? 'SUPPRESSED' : 'PENDING';
      await sql`insert into notifications.notifications(organization_id,notification_type,recipient_type,customer_id,channel,rendered_body,status,source_event_id,source_domain,source_id) values(${event.organization_id},${rule.type},'CUSTOMER',${customerId}::uuid,${channel},${`Notification ${rule.type}`},${status},${event.event_id}::uuid,${event.aggregate_type},${event.aggregate_id}::uuid) on conflict(source_event_id,recipient_type,coalesce(customer_id,membership_id),channel) where source_event_id is not null do nothing`.execute(
        tx,
      );
    }
    await sql`update platform.event_consumer_receipts set status='COMPLETED',processed_at=now() where id=${receipt.rows[0].id}::bigint`.execute(
      tx,
    );
    return { created: true };
  });
}
export async function processNotificationOutbox(db: Kysely<DatabaseSchema>, limit = 20) {
  const events = await sql<{
    id: string;
  }>`select event.id::text from platform.outbox_events event left join platform.event_consumer_receipts receipt on receipt.outbox_event_id=event.id and receipt.consumer_name='notifications.outbox.v1' where receipt.id is null order by event.id limit ${limit}`.execute(
    db,
  );
  for (const event of events.rows) await createNotificationFromOutbox(db, Number(event.id));
  return events.rows.length;
}
export async function recordNotificationAttempt(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    notificationId: string;
    provider: string;
    outcome: 'SENT' | 'FAILED';
    errorCode?: string;
  },
) {
  return db.transaction().execute(async (tx) => {
    const notification = await sql<{
      id: string;
    }>`select id from notifications.notifications where id=${input.notificationId}::uuid and organization_id=${input.organizationId} for update`.execute(
      tx,
    );
    if (!notification.rows[0])
      throw new NotificationDomainError('NOT_FOUND', 'Notification was not found.');
    const next = await sql<{
      n: number;
    }>`select (count(*)+1)::int n from notifications.delivery_attempts where notification_id=${input.notificationId}::uuid`.execute(
      tx,
    );
    const attempt = next.rows[0]?.n ?? 1;
    const retry = input.outcome === 'FAILED' ? retryAt(attempt) : undefined;
    await sql`insert into notifications.delivery_attempts(organization_id,notification_id,attempt_number,provider,status,completed_at,next_retry_at,error_code) values(${input.organizationId},${input.notificationId}::uuid,${attempt},${input.provider},${input.outcome === 'SENT' ? 'SENT' : 'RETRY_WAIT'},now(),${retry ?? null},${input.errorCode ?? null})`.execute(
      tx,
    );
    await sql`update notifications.notifications set status=${input.outcome === 'SENT' ? 'SENT' : 'FAILED'},sent_at=case when ${input.outcome === 'SENT'} then now() else sent_at end where id=${input.notificationId}::uuid`.execute(
      tx,
    );
  });
}
export async function listNotifications(db: Kysely<DatabaseSchema>, organizationId: string) {
  return (
    await sql`select id,notification_type,recipient_type,channel,status,rendered_subject,rendered_body,created_at::text,read_at::text from notifications.notifications where organization_id=${organizationId} order by created_at desc limit 100`.execute(
      db,
    )
  ).rows;
}
export async function setNotificationPreference(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    recipientType: 'MEMBERSHIP' | 'CUSTOMER';
    recipientId: string;
    notificationType: string;
    channel: 'IN_APP' | 'EMAIL';
    enabled: boolean;
  },
) {
  await sql`insert into notifications.preferences(organization_id,recipient_type,recipient_id,notification_type,channel,enabled) values(${input.organizationId},${input.recipientType},${input.recipientId}::uuid,${input.notificationType},${input.channel},${input.enabled}) on conflict(organization_id,recipient_type,recipient_id,notification_type,channel) do update set enabled=excluded.enabled,updated_at=now()`.execute(
    db,
  );
}

export async function createWebhookEndpoint(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    name: string;
    endpointUrl: string;
    eventTypes: string[];
    encryptionKey: EncryptionKey;
  },
) {
  const endpoint = validateWebhookUrl(input.endpointUrl);
  const secret = generateOpaqueToken();
  return db.transaction().execute(async (tx) => {
    const row = await sql<{
      id: string;
    }>`insert into integrations.webhook_endpoints(organization_id,name,endpoint_url,secret_ciphertext,secret_key_id) values(${input.organizationId},${input.name},${endpoint.toString()},${encryptSecret(secret, input.encryptionKey)},${input.encryptionKey.id}) returning id`.execute(
      tx,
    );
    const id = row.rows[0]?.id;
    if (!id) throw new Error('Webhook endpoint creation failed.');
    for (const type of input.eventTypes)
      await sql`insert into integrations.webhook_subscriptions(webhook_endpoint_id,event_type) values(${id}::uuid,${type})`.execute(
        tx,
      );
    await appendAuditEvent(tx, {
      organizationId: input.organizationId,
      actorType: 'USER',
      actorId: input.actorId,
      action: 'integrations.webhook.create',
      targetType: 'integrations.webhook_endpoint',
      targetId: id,
    });
    return { id, secret };
  });
}
export async function ingestProviderEvent(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    integrationAccountId: string;
    providerEventId?: string;
    eventType: string;
    providerStatus?: string;
    payload: Record<string, unknown>;
    authenticationStatus: 'VERIFIED' | 'FAILED' | 'NOT_APPLICABLE';
    providerOccurredAt?: Date;
  },
) {
  const payload = JSON.stringify(input.payload);
  const result = await sql<{
    id: string;
  }>`insert into integrations.inbound_provider_events(organization_id,integration_account_id,provider_event_id,event_type,provider_status,payload_hash,raw_payload,authentication_status,provider_occurred_at) select ${input.organizationId},a.id,${input.providerEventId ?? null},${input.eventType},${input.providerStatus ?? null},${sha256(payload)},${payload}::jsonb,${input.authenticationStatus},${input.providerOccurredAt ?? null} from integrations.integration_accounts a where a.id=${input.integrationAccountId}::uuid and a.organization_id=${input.organizationId} on conflict(integration_account_id,provider_event_id) do nothing returning id`.execute(
    db,
  );
  return result.rows[0] ? { created: true, id: result.rows[0].id } : { created: false };
}
export async function createIntegrationOperation(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    integrationAccountId: string;
    operationType: string;
    operationKey: string;
    localEntityType: string;
    localEntityId: string;
    requestFingerprint: string;
  },
) {
  const row = await sql<{
    id: string;
    status: string;
  }>`insert into integrations.integration_operations(organization_id,integration_account_id,operation_type,operation_key,local_entity_type,local_entity_id,request_fingerprint) select ${input.organizationId},a.id,${input.operationType},${input.operationKey},${input.localEntityType},${input.localEntityId}::uuid,${input.requestFingerprint} from integrations.integration_accounts a where a.id=${input.integrationAccountId}::uuid and a.organization_id=${input.organizationId} on conflict(integration_account_id,operation_type,operation_key) do update set updated_at=now() returning id,status`.execute(
    db,
  );
  if (!row.rows[0])
    throw new NotificationDomainError('NOT_FOUND', 'Integration account was not found.');
  return row.rows[0];
}
export async function markOperationUnknown(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  operationId: string,
) {
  await sql`update integrations.integration_operations set status='UNKNOWN_OUTCOME',reconcile_after=now(),updated_at=now(),version=version+1 where id=${operationId}::uuid and organization_id=${organizationId}`.execute(
    db,
  );
}
export async function integrationHealth(db: Kysely<DatabaseSchema>, organizationId: string) {
  return (
    await sql`select i.id,i.name,i.provider_code,i.status,count(o.id) filter(where o.status in ('PENDING','UNKNOWN_OUTCOME','RECONCILIATION_REQUIRED'))::int as unresolved_operations,count(e.id) filter(where e.status='OPEN')::int as open_exceptions from integrations.integrations i left join integrations.integration_accounts a on a.integration_id=i.id left join integrations.integration_operations o on o.integration_account_id=a.id left join integrations.integration_exceptions e on e.integration_account_id=a.id where i.organization_id=${organizationId} group by i.id order by i.name`.execute(
      db,
    )
  ).rows;
}
