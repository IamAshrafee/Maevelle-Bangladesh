import { createHash } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { sql, type Kysely } from 'kysely';
import {
  constantTimeEqual,
  decryptSecret,
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

export interface TemplateVariableDefinition {
  readonly required?: boolean;
  readonly maxLength?: number;
}
export type TemplateVariableSchema = Readonly<Record<string, TemplateVariableDefinition>>;
export type TemplateVariables = Readonly<Record<string, string | number | boolean>>;

export interface EmailDeliveryRequest {
  readonly notificationId: string;
  readonly recipient: string;
  readonly subject: string;
  readonly body: string;
  readonly idempotencyKey: string;
}
export type DeliveryResult =
  | { readonly status: 'SENT'; readonly providerReference?: string; readonly metadata?: object }
  | {
      readonly status: 'FAILED';
      readonly retryable: boolean;
      readonly errorCode: string;
      readonly metadata?: object;
    };
export interface EmailAdapter {
  readonly name: string;
  send(request: EmailDeliveryRequest): Promise<DeliveryResult>;
}

export function createLocalEmailAdapter(): EmailAdapter {
  const delivered = new Map<string, string>();
  return {
    name: 'local',
    async send(request) {
      const reference = delivered.get(request.idempotencyKey) ?? `local:${request.notificationId}`;
      delivered.set(request.idempotencyKey, reference);
      return { status: 'SENT', providerReference: reference };
    },
  };
}

const templateToken = /\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}/g;
export function renderNotificationTemplate(
  template: string,
  schema: TemplateVariableSchema,
  variables: TemplateVariables,
): string {
  const declared = new Set(Object.keys(schema));
  for (const [name, definition] of Object.entries(schema)) {
    const value = variables[name];
    if (definition.required && value === undefined)
      throw new NotificationDomainError(
        'VALIDATION_FAILED',
        `Template variable ${name} is required.`,
      );
    if (value !== undefined && String(value).length > (definition.maxLength ?? 4_096))
      throw new NotificationDomainError(
        'VALIDATION_FAILED',
        `Template variable ${name} is too long.`,
      );
  }
  for (const name of Object.keys(variables))
    if (!declared.has(name))
      throw new NotificationDomainError(
        'VALIDATION_FAILED',
        `Template variable ${name} is not declared.`,
      );
  return template.replace(templateToken, (_match, name: string) => {
    if (!declared.has(name) || variables[name] === undefined)
      throw new NotificationDomainError(
        'VALIDATION_FAILED',
        `Template variable ${name} is missing.`,
      );
    return String(variables[name]);
  });
}

export async function createNotificationTemplate(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    notificationType: string;
    channel: 'IN_APP' | 'EMAIL';
    name: string;
  },
) {
  const row = await sql<{
    id: string;
  }>`insert into notifications.notification_templates(organization_id,notification_type,channel,name) values(${input.organizationId},${input.notificationType},${input.channel},${input.name}) returning id`.execute(
    db,
  );
  return row.rows[0]!;
}

export async function createTemplateRevision(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    templateId: string;
    subjectTemplate?: string;
    bodyTemplate: string;
    variableSchema: TemplateVariableSchema;
  },
) {
  return db.transaction().execute(async (tx) => {
    const template = await sql<{
      id: string;
    }>`select id from notifications.notification_templates where id=${input.templateId}::uuid and organization_id=${input.organizationId} for update`.execute(
      tx,
    );
    if (!template.rows[0])
      throw new NotificationDomainError('NOT_FOUND', 'Notification template was not found.');
    const row = await sql<{
      id: string;
      revision_number: number;
    }>`insert into notifications.template_revisions(organization_id,template_id,revision_number,subject_template,body_template,variable_schema) select ${input.organizationId},${input.templateId}::uuid,coalesce(max(revision_number),0)+1,${input.subjectTemplate ?? null},${input.bodyTemplate},${JSON.stringify(input.variableSchema)}::jsonb from notifications.template_revisions where template_id=${input.templateId}::uuid returning id,revision_number`.execute(
      tx,
    );
    return row.rows[0]!;
  });
}

export async function publishTemplateRevision(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  templateId: string,
  revisionId: string,
) {
  await db.transaction().execute(async (tx) => {
    const target = await sql<{
      id: string;
    }>`select r.id from notifications.template_revisions r join notifications.notification_templates t on t.id=r.template_id where r.id=${revisionId}::uuid and r.template_id=${templateId}::uuid and r.organization_id=${organizationId} and t.organization_id=${organizationId} and r.status='DRAFT' for update`.execute(
      tx,
    );
    if (!target.rows[0])
      throw new NotificationDomainError('NOT_FOUND', 'Draft template revision was not found.');
    await sql`update notifications.template_revisions set status='SUPERSEDED' where template_id=${templateId}::uuid and status='PUBLISHED'`.execute(
      tx,
    );
    await sql`update notifications.template_revisions set status='PUBLISHED',published_at=now() where id=${revisionId}::uuid`.execute(
      tx,
    );
    await sql`update notifications.notification_templates set current_revision_id=${revisionId}::uuid,status='ACTIVE',updated_at=now(),version=version+1 where id=${templateId}::uuid`.execute(
      tx,
    );
  });
}

async function currentTemplateRevision(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  notificationType: string,
  channel: 'IN_APP' | 'EMAIL',
) {
  return (
    await sql<{
      id: string;
      subject_template: string | null;
      body_template: string;
      variable_schema: TemplateVariableSchema;
    }>`select r.id,r.subject_template,r.body_template,r.variable_schema from notifications.notification_templates t join notifications.template_revisions r on r.id=t.current_revision_id where t.organization_id=${organizationId} and t.notification_type=${notificationType} and t.channel=${channel} and t.status='ACTIVE'`.execute(
      db,
    )
  ).rows[0];
}

async function ensureCurrentTemplate(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  notificationType: string,
  channel: 'IN_APP' | 'EMAIL',
) {
  const existing = await currentTemplateRevision(db, organizationId, notificationType, channel);
  if (existing) return existing;
  await sql`insert into notifications.notification_templates(organization_id,notification_type,channel,name) values(${organizationId},${notificationType},${channel},'System default') on conflict(organization_id,notification_type,channel,name) do nothing`.execute(
    db,
  );
  const template = await sql<{
    id: string;
    current_revision_id: string | null;
  }>`select id,current_revision_id from notifications.notification_templates where organization_id=${organizationId} and notification_type=${notificationType} and channel=${channel} and name='System default' for update`.execute(
    db,
  );
  const selected = template.rows[0];
  if (!selected) throw new Error('Default notification template could not be created.');
  if (!selected.current_revision_id) {
    const revision = await sql<{
      id: string;
    }>`insert into notifications.template_revisions(organization_id,template_id,revision_number,subject_template,body_template,variable_schema,status,published_at) values(${organizationId},${selected.id}::uuid,1,${channel === 'EMAIL' ? `Maevelle: ${notificationType}` : null},${`Notification ${notificationType}`},'{}'::jsonb,'PUBLISHED',now()) on conflict(template_id,revision_number) do update set template_id=excluded.template_id returning id`.execute(
      db,
    );
    await sql`update notifications.notification_templates set current_revision_id=${revision.rows[0]!.id}::uuid,status='ACTIVE',updated_at=now() where id=${selected.id}::uuid and current_revision_id is null`.execute(
      db,
    );
  }
  return (await currentTemplateRevision(db, organizationId, notificationType, channel))!;
}

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

function isPublicAddress(address: string): boolean {
  if (!isIP(address)) return false;
  const normalized = address.toLowerCase();
  if (
    normalized === '::1' ||
    normalized === '::' ||
    normalized.startsWith('fe8') ||
    normalized.startsWith('fe9') ||
    normalized.startsWith('fea') ||
    normalized.startsWith('feb') ||
    normalized.startsWith('fc') ||
    normalized.startsWith('fd')
  )
    return false;
  if (normalized.startsWith('::ffff:')) return isPublicAddress(normalized.slice(7));
  const parts = address.split('.').map(Number);
  if (parts.length === 4) {
    const a = parts[0]!;
    const b = parts[1]!;
    if (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && (b === 0 || b === 168)) ||
      (a === 198 && (b === 18 || b === 19))
    )
      return false;
  }
  return true;
}

export async function validateWebhookDestination(
  value: string,
  resolve: (hostname: string) => Promise<readonly string[]> = async (hostname) =>
    (await lookup(hostname, { all: true, verbatim: true })).map((entry) => entry.address),
): Promise<URL> {
  const url = validateWebhookUrl(value);
  const addresses = isIP(url.hostname) ? [url.hostname] : await resolve(url.hostname);
  if (addresses.length === 0 || addresses.some((address) => !isPublicAddress(address)))
    throw new NotificationDomainError(
      'VALIDATION_FAILED',
      'Webhook endpoint resolved to private or reserved network space.',
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
      const revision = await ensureCurrentTemplate(tx, event.organization_id, rule.type, channel);
      await sql`insert into notifications.notifications(organization_id,notification_type,recipient_type,customer_id,channel,template_revision_id,rendered_subject,rendered_body,status,source_event_id,source_domain,source_id) values(${event.organization_id},${rule.type},'CUSTOMER',${customerId}::uuid,${channel},${revision.id}::uuid,${revision.subject_template ? renderNotificationTemplate(revision.subject_template, revision.variable_schema, {}) : null},${renderNotificationTemplate(revision.body_template, revision.variable_schema, {})},${status},${event.event_id}::uuid,${event.aggregate_type},${event.aggregate_id}::uuid) on conflict(source_event_id,recipient_type,coalesce(customer_id,membership_id),channel) where source_event_id is not null do nothing`.execute(
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
    retryable?: boolean;
    providerReference?: string;
    responseMetadata?: object;
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
    const retryable = input.outcome === 'FAILED' && (input.retryable ?? true) && attempt < 5;
    const retry = retryable ? retryAt(attempt) : undefined;
    const attemptStatus =
      input.outcome === 'SENT' ? 'SENT' : retryable ? 'RETRY_WAIT' : 'PERMANENT_FAILURE';
    await sql`insert into notifications.delivery_attempts(organization_id,notification_id,attempt_number,provider,provider_message_id,status,completed_at,next_retry_at,error_code,retryable,response_metadata) values(${input.organizationId},${input.notificationId}::uuid,${attempt},${input.provider},${input.providerReference ?? null},${attemptStatus},now(),${retry ?? null},${input.errorCode ?? null},${retryable},${JSON.stringify(input.responseMetadata ?? {})}::jsonb)`.execute(
      tx,
    );
    await sql`update notifications.notifications set status=${input.outcome === 'SENT' ? 'SENT' : 'FAILED'},sent_at=case when ${input.outcome === 'SENT'} then now() else sent_at end where id=${input.notificationId}::uuid`.execute(
      tx,
    );
  });
}
export async function listNotifications(db: Kysely<DatabaseSchema>, organizationId: string) {
  return (
    await sql`select n.id,n.notification_type,n.recipient_type,n.channel,n.status,n.rendered_subject,n.rendered_body,n.created_at::text,n.read_at::text,n.source_domain,n.source_id,r.revision_number,(select jsonb_agg(jsonb_build_object('attemptNumber',a.attempt_number,'status',a.status,'provider',a.provider,'startedAt',a.started_at,'completedAt',a.completed_at,'nextRetryAt',a.next_retry_at,'errorCode',a.error_code) order by a.attempt_number) from notifications.delivery_attempts a where a.notification_id=n.id) attempts from notifications.notifications n left join notifications.template_revisions r on r.id=n.template_revision_id where n.organization_id=${organizationId} order by n.created_at desc limit 100`.execute(
      db,
    )
  ).rows;
}

export async function listRecipientInbox(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    recipientType: 'MEMBERSHIP' | 'CUSTOMER';
    recipientId: string;
    unreadOnly?: boolean;
  },
) {
  return (
    await sql<{
      id: string;
      notification_type: string;
      rendered_subject: string | null;
      rendered_body: string;
      status: string;
      source_domain: string;
      source_id: string;
      created_at: string;
      read_at: string | null;
    }>`select id,notification_type,rendered_subject,rendered_body,status,source_domain,source_id,created_at::text,read_at::text from notifications.notifications where organization_id=${input.organizationId} and recipient_type=${input.recipientType} and coalesce(customer_id,membership_id)=${input.recipientId}::uuid and channel='IN_APP' ${input.unreadOnly ? sql`and read_at is null` : sql``} order by created_at desc limit 100`.execute(
      db,
    )
  ).rows;
}

export async function markNotificationRead(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    recipientType: 'MEMBERSHIP' | 'CUSTOMER';
    recipientId: string;
    notificationId: string;
  },
) {
  const row = await sql<{
    id: string;
  }>`update notifications.notifications set status='READ',read_at=coalesce(read_at,now()) where id=${input.notificationId}::uuid and organization_id=${input.organizationId} and recipient_type=${input.recipientType} and coalesce(customer_id,membership_id)=${input.recipientId}::uuid and channel='IN_APP' returning id`.execute(
    db,
  );
  if (!row.rows[0]) throw new NotificationDomainError('NOT_FOUND', 'Notification was not found.');
}

export async function deliverPendingEmails(
  db: Kysely<DatabaseSchema>,
  adapter: EmailAdapter,
  limit = 20,
) {
  const pending = await sql<{
    id: string;
    organization_id: string;
    rendered_subject: string | null;
    rendered_body: string;
    recipient: string;
  }>`select n.id,n.organization_id,n.rendered_subject,n.rendered_body,coalesce(e.email,p.value) recipient from notifications.notifications n left join customers.customer_emails e on e.customer_id=n.customer_id and e.is_primary=true left join lateral (select null::text value) p on true where n.channel='EMAIL' and n.status in ('PENDING','FAILED') and coalesce((select max(a.next_retry_at) from notifications.delivery_attempts a where a.notification_id=n.id),now())<=now() and not exists(select 1 from notifications.delivery_attempts a where a.notification_id=n.id and a.status='SENT') order by n.created_at for update skip locked limit ${limit}`.execute(
    db,
  );
  let processed = 0;
  for (const item of pending.rows) {
    if (!item.recipient) {
      await recordNotificationAttempt(db, {
        organizationId: item.organization_id,
        notificationId: item.id,
        provider: adapter.name,
        outcome: 'FAILED',
        errorCode: 'INVALID_RECIPIENT',
        retryable: false,
      });
      processed++;
      continue;
    }
    let result: DeliveryResult;
    try {
      result = await adapter.send({
        notificationId: item.id,
        recipient: item.recipient,
        subject: item.rendered_subject ?? '',
        body: item.rendered_body,
        idempotencyKey: `notification:${item.id}:email`,
      });
    } catch {
      result = { status: 'FAILED', retryable: true, errorCode: 'ADAPTER_TIMEOUT' };
    }
    await recordNotificationAttempt(db, {
      organizationId: item.organization_id,
      notificationId: item.id,
      provider: adapter.name,
      outcome: result.status,
      ...(result.status === 'SENT'
        ? {
            ...(result.providerReference ? { providerReference: result.providerReference } : {}),
            ...(result.metadata ? { responseMetadata: result.metadata } : {}),
          }
        : {
            errorCode: result.errorCode,
            retryable: result.retryable,
            ...(result.metadata ? { responseMetadata: result.metadata } : {}),
          }),
    });
    processed++;
  }
  return processed;
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
  const endpoint = await validateWebhookDestination(input.endpointUrl);
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

export async function createWebhookEventsFromOutbox(db: Kysely<DatabaseSchema>, limit = 20) {
  const events = await sql<{
    id: string;
    event_id: string;
    organization_id: string;
    event_type: string;
    event_version: number;
    aggregate_type: string;
    aggregate_id: string;
    aggregate_version: string | null;
    payload: object;
    occurred_at: Date;
  }>`select o.id::text,o.event_id,o.organization_id,o.event_type,o.event_version,o.aggregate_type,o.aggregate_id,o.aggregate_version::text,o.payload,o.occurred_at from platform.outbox_events o where o.organization_id is not null and exists(select 1 from integrations.webhook_endpoints e join integrations.webhook_subscriptions s on s.webhook_endpoint_id=e.id where e.organization_id=o.organization_id and e.status='ACTIVE' and s.event_type=o.event_type and s.event_version=o.event_version) and not exists(select 1 from integrations.webhook_events w where w.source_outbox_event_id=o.id and w.event_type=o.event_type and w.event_version=o.event_version) order by o.id limit ${limit}`.execute(
    db,
  );
  for (const event of events.rows) {
    await db.transaction().execute(async (tx) => {
      const created = await sql<{
        id: string;
      }>`insert into integrations.webhook_events(organization_id,event_type,event_version,resource_type,resource_id,resource_version,payload,occurred_at,source_outbox_event_id) values(${event.organization_id},${event.event_type},${event.event_version},${event.aggregate_type},${event.aggregate_id}::uuid,${event.aggregate_version ? Number(event.aggregate_version) : null},${JSON.stringify(event.payload)}::jsonb,${event.occurred_at},${Number(event.id)}) on conflict(source_outbox_event_id,event_type,event_version) where source_outbox_event_id is not null do nothing returning id`.execute(
        tx,
      );
      if (!created.rows[0]) return;
      await sql`insert into integrations.webhook_deliveries(organization_id,webhook_event_id,webhook_endpoint_id,attempt_number,status) select ${event.organization_id},${created.rows[0].id}::uuid,e.id,1,'PENDING' from integrations.webhook_endpoints e join integrations.webhook_subscriptions s on s.webhook_endpoint_id=e.id where e.organization_id=${event.organization_id} and e.status='ACTIVE' and s.event_type=${event.event_type} and s.event_version=${event.event_version} on conflict do nothing`.execute(
        tx,
      );
    });
  }
  return events.rows.length;
}

export async function deliverPendingWebhooks(
  db: Kysely<DatabaseSchema>,
  encryptionKey: EncryptionKey,
  options: {
    fetch?: typeof fetch;
    resolve?: (hostname: string) => Promise<readonly string[]>;
    limit?: number;
  } = {},
) {
  const requester = options.fetch ?? fetch;
  const pending = await sql<{
    id: string;
    organization_id: string;
    webhook_event_id: string;
    webhook_endpoint_id: string;
    attempt_number: number;
    endpoint_url: string;
    secret_ciphertext: string;
    event_id: string;
    event_type: string;
    payload: object;
  }>`select d.id::text,d.organization_id,d.webhook_event_id,d.webhook_endpoint_id,d.attempt_number,e.endpoint_url,e.secret_ciphertext,w.event_id,w.event_type,w.payload from integrations.webhook_deliveries d join integrations.webhook_endpoints e on e.id=d.webhook_endpoint_id join integrations.webhook_events w on w.id=d.webhook_event_id where d.status in ('PENDING','RETRY_WAIT') and coalesce(d.next_retry_at,now())<=now() and e.status='ACTIVE' and not exists(select 1 from integrations.webhook_deliveries ok where ok.webhook_event_id=d.webhook_event_id and ok.webhook_endpoint_id=d.webhook_endpoint_id and ok.status='SENT') order by d.id for update skip locked limit ${options.limit ?? 20}`.execute(
    db,
  );
  for (const delivery of pending.rows) {
    const body = JSON.stringify({
      id: delivery.event_id,
      type: delivery.event_type,
      data: delivery.payload,
    });
    const timestamp = Math.floor(Date.now() / 1000).toString();
    let result: {
      status: 'SENT' | 'RETRY_WAIT' | 'PERMANENT_FAILURE';
      responseStatus?: number;
      failureCode?: string;
      retryable: boolean;
    };
    try {
      let destination = await validateWebhookDestination(delivery.endpoint_url, options.resolve);
      let response: Response | undefined;
      for (let redirects = 0; redirects < 3; redirects++) {
        response = await requester(destination, {
          method: 'POST',
          redirect: 'manual',
          signal: AbortSignal.timeout(10_000),
          headers: {
            'content-type': 'application/json',
            'x-maevelle-event-id': delivery.event_id,
            'x-maevelle-timestamp': timestamp,
            'x-maevelle-signature': webhookSignature(
              decryptSecret(delivery.secret_ciphertext, encryptionKey),
              delivery.event_id,
              timestamp,
              body,
            ),
          },
          body,
        });
        if (![301, 302, 303, 307, 308].includes(response.status)) break;
        const location = response.headers.get('location');
        if (!location) throw new Error('REDIRECT_WITHOUT_LOCATION');
        destination = await validateWebhookDestination(
          new URL(location, destination).toString(),
          options.resolve,
        );
      }
      if (!response) throw new Error('NO_RESPONSE');
      const retryable = response.status === 429 || response.status >= 500;
      result = response.ok
        ? { status: 'SENT', responseStatus: response.status, retryable: false }
        : {
            status: retryable && delivery.attempt_number < 5 ? 'RETRY_WAIT' : 'PERMANENT_FAILURE',
            responseStatus: response.status,
            failureCode: `HTTP_${response.status}`,
            retryable,
          };
    } catch (error) {
      const code =
        error instanceof NotificationDomainError ? 'UNSAFE_DESTINATION' : 'NETWORK_ERROR';
      result = {
        status:
          code === 'NETWORK_ERROR' && delivery.attempt_number < 5
            ? 'RETRY_WAIT'
            : 'PERMANENT_FAILURE',
        failureCode: code,
        retryable: code === 'NETWORK_ERROR',
      };
    }
    await db.transaction().execute(async (tx) => {
      await sql`update integrations.webhook_deliveries set status=${result.status},response_status=${result.responseStatus ?? null},failure_code=${result.failureCode ?? null},retryable=${result.retryable},signature_timestamp=${timestamp},completed_at=now(),next_retry_at=${result.status === 'RETRY_WAIT' ? retryAt(delivery.attempt_number) : null} where id=${Number(delivery.id)} and status in ('PENDING','RETRY_WAIT')`.execute(
        tx,
      );
      if (result.status === 'RETRY_WAIT')
        await sql`insert into integrations.webhook_deliveries(organization_id,webhook_event_id,webhook_endpoint_id,attempt_number,status,next_retry_at,retryable) values(${delivery.organization_id},${delivery.webhook_event_id}::uuid,${delivery.webhook_endpoint_id}::uuid,${delivery.attempt_number + 1},'RETRY_WAIT',${retryAt(delivery.attempt_number)},true) on conflict do nothing`.execute(
          tx,
        );
    });
  }
  return pending.rows.length;
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
export async function reconcileIntegrationOperation(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    operationId: string;
    outcome: 'CONFIRMED_SUCCESS' | 'CONFIRMED_FAILURE' | 'RECONCILIATION_REQUIRED';
    externalReference?: string;
  },
) {
  const row = await sql<{
    id: string;
  }>`update integrations.integration_operations set status=${input.outcome},external_reference=coalesce(${input.externalReference ?? null},external_reference),reconcile_after=null,updated_at=now(),version=version+1 where id=${input.operationId}::uuid and organization_id=${input.organizationId} and status in ('PENDING','SENT','UNKNOWN_OUTCOME','RECONCILIATION_REQUIRED') returning id`.execute(
    db,
  );
  if (!row.rows[0])
    throw new NotificationDomainError(
      'NOT_FOUND',
      'Integration operation was not found or is already terminal.',
    );
}

export async function upsertExternalEntityMapping(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    integrationAccountId: string;
    localEntityType: string;
    localEntityId: string;
    externalEntityType: string;
    externalEntityId: string;
  },
) {
  const row = await sql<{
    id: string;
  }>`insert into integrations.external_entity_mappings(organization_id,integration_account_id,local_entity_type,local_entity_id,external_entity_type,external_entity_id) select ${input.organizationId},a.id,${input.localEntityType},${input.localEntityId}::uuid,${input.externalEntityType},${input.externalEntityId} from integrations.integration_accounts a where a.id=${input.integrationAccountId}::uuid and a.organization_id=${input.organizationId} on conflict(integration_account_id,local_entity_type,local_entity_id) do update set external_entity_type=excluded.external_entity_type,external_entity_id=excluded.external_entity_id returning id`.execute(
    db,
  );
  if (!row.rows[0])
    throw new NotificationDomainError('NOT_FOUND', 'Integration account was not found.');
  return row.rows[0];
}

export async function integrationHealth(db: Kysely<DatabaseSchema>, organizationId: string) {
  return (
    await sql`select i.id,i.name,i.provider_code,i.status,count(distinct a.id)::int accounts,count(distinct o.id) filter(where o.status='PENDING')::int pending_operations,count(distinct o.id) filter(where o.status='UNKNOWN_OUTCOME')::int unknown_outcomes,count(distinct o.id) filter(where o.status in ('PENDING','UNKNOWN_OUTCOME','RECONCILIATION_REQUIRED'))::int unresolved_operations,count(distinct e.id) filter(where e.status='OPEN')::int open_exceptions,count(distinct p.id) filter(where p.processing_status in ('PENDING','FAILED'))::int provider_event_backlog,(select count(*)::int from integrations.webhook_deliveries wd where wd.organization_id=i.organization_id and wd.status in ('FAILED','PERMANENT_FAILURE')) webhook_failures,(select count(*)::int from integrations.webhook_deliveries wd where wd.organization_id=i.organization_id and wd.status='RETRY_WAIT') webhook_retry_backlog,max(o.updated_at) filter(where o.status='CONFIRMED_SUCCESS')::text last_success_at,max(o.updated_at) filter(where o.status in ('CONFIRMED_FAILURE','UNKNOWN_OUTCOME','RECONCILIATION_REQUIRED'))::text last_failure_at from integrations.integrations i left join integrations.integration_accounts a on a.integration_id=i.id left join integrations.integration_operations o on o.integration_account_id=a.id left join integrations.integration_exceptions e on e.integration_account_id=a.id left join integrations.inbound_provider_events p on p.integration_account_id=a.id where i.organization_id=${organizationId} group by i.id order by i.name`.execute(
      db,
    )
  ).rows;
}

export async function integrationOperations(db: Kysely<DatabaseSchema>, organizationId: string) {
  const [accounts, operations, events, exceptions, mappings, webhooks, deliveries] =
    await Promise.all([
      sql`select a.id,a.name,a.status,a.external_account_id,i.name integration,i.provider_code from integrations.integration_accounts a join integrations.integrations i on i.id=a.integration_id where a.organization_id=${organizationId} order by a.updated_at desc`.execute(
        db,
      ),
      sql`select id,integration_account_id,operation_type,local_entity_type,local_entity_id,status,external_reference,attempt_count,updated_at::text,reconcile_after::text from integrations.integration_operations where organization_id=${organizationId} order by updated_at desc limit 100`.execute(
        db,
      ),
      sql`select id,integration_account_id,provider_event_id,event_type,provider_status,authentication_status,processing_status,provider_occurred_at::text,received_at::text from integrations.inbound_provider_events where organization_id=${organizationId} order by received_at desc limit 100`.execute(
        db,
      ),
      sql`select id,integration_account_id,exception_type,severity,status,summary,created_at::text from integrations.integration_exceptions where organization_id=${organizationId} order by created_at desc limit 100`.execute(
        db,
      ),
      sql`select id,integration_account_id,local_entity_type,local_entity_id,external_entity_type,external_entity_id,created_at::text from integrations.external_entity_mappings where organization_id=${organizationId} order by created_at desc limit 100`.execute(
        db,
      ),
      sql`select e.id,e.name,e.endpoint_url,e.status,e.api_version,e.secret_version,e.created_at::text,e.updated_at::text,array_agg(s.event_type order by s.event_type) event_types from integrations.webhook_endpoints e join integrations.webhook_subscriptions s on s.webhook_endpoint_id=e.id where e.organization_id=${organizationId} group by e.id order by e.updated_at desc`.execute(
        db,
      ),
      sql`select d.id::text,d.webhook_event_id,d.webhook_endpoint_id,w.event_type,d.attempt_number,d.status,d.response_status,d.failure_code,d.next_retry_at::text,d.completed_at::text from integrations.webhook_deliveries d join integrations.webhook_events w on w.id=d.webhook_event_id where d.organization_id=${organizationId} order by d.started_at desc limit 100`.execute(
        db,
      ),
    ]);
  return {
    accounts: accounts.rows,
    operations: operations.rows,
    providerEvents: events.rows,
    exceptions: exceptions.rows,
    mappings: mappings.rows,
    webhooks: webhooks.rows,
    webhookDeliveries: deliveries.rows,
  };
}

export async function verifyNotificationIntegrationIntegrity(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
) {
  const issues = await sql<{ code: string; entity_id: string | null }>`
    select 'NOTIFICATION_TEMPLATE_REVISION_MISSING' code,n.id entity_id from notifications.notifications n where n.organization_id=${organizationId} and n.status<>'SUPPRESSED' and n.template_revision_id is null
    union all select 'DUPLICATE_SUCCESSFUL_NOTIFICATION_DELIVERY',n.id from notifications.notifications n join notifications.delivery_attempts a on a.notification_id=n.id and a.status='SENT' where n.organization_id=${organizationId} group by n.id having count(*)>1
    union all select 'REQUIRED_NOTIFICATION_SUPPRESSED',n.id from notifications.notifications n join notifications.notification_policies p on p.notification_type=n.notification_type and p.delivery_requirement='REQUIRED_OPERATIONAL' where n.organization_id=${organizationId} and n.status='SUPPRESSED'
    union all select 'DUPLICATE_CANONICAL_WEBHOOK_EVENT',min(w.id) from integrations.webhook_events w where w.organization_id=${organizationId} and w.source_outbox_event_id is not null group by w.source_outbox_event_id,w.event_type,w.event_version having count(*)>1
    union all select 'WEBHOOK_SUCCESS_WITHOUT_ATTEMPT',w.id from integrations.webhook_events w where w.organization_id=${organizationId} and exists(select 1 from integrations.webhook_deliveries d where d.webhook_event_id=w.id and d.status='SENT') and not exists(select 1 from integrations.webhook_deliveries d where d.webhook_event_id=w.id and d.status='SENT' and d.completed_at is not null)
    union all select 'PROVIDER_RAW_STATUS_MISSING',p.id from integrations.inbound_provider_events p where p.organization_id=${organizationId} and p.provider_status is null
    union all select 'CROSS_ORG_EXTERNAL_MAPPING',m.id from integrations.external_entity_mappings m join integrations.integration_accounts a on a.id=m.integration_account_id where m.organization_id=${organizationId} and a.organization_id<>m.organization_id
  `.execute(db);
  return issues.rows;
}
