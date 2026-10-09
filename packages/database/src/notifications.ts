import { createHash, randomInt } from 'node:crypto';
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
import { renderTransactionalEmail, type TransactionalEmailTemplateKey } from './email-templates.js';
import { reconcileUnmatchedEmailProviderEvents } from './notification-email-operations.js';
import { normalizeBangladeshPhone } from './sms.js';
import { renderTransactionalSms, type TransactionalSmsTemplateKey } from './sms-templates.js';
import {
  customerDefinitionFor,
  notificationDefinitionsFor,
  type NotificationCategory,
  type NotificationPriority,
  type StaffNotificationEventDefinition,
} from './notification-event-catalog.js';

export { listTransactionalEmailTemplates, renderTransactionalEmail } from './email-templates.js';
export { notificationEventCatalog } from './notification-event-catalog.js';
export type {
  NotificationCategory,
  NotificationPriority,
  NotificationEventDefinition,
} from './notification-event-catalog.js';
export * from './notification-email-operations.js';
export * from './notification-sms-operations.js';

export class NotificationDomainError extends Error {
  public constructor(
    public readonly code: 'NOT_FOUND' | 'CONFLICT' | 'VALIDATION_FAILED' | 'FORBIDDEN',
    message: string,
  ) {
    super(message);
  }
}
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
const escapeHtml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
const retryAt = (attempt: number) => {
  const baseDelay = Math.min(60 * 60_000, 1_000 * 2 ** attempt);
  const jitterLimit = Math.max(1, Math.min(30_000, Math.floor(baseDelay * 0.2)));
  return new Date(Date.now() + Math.min(60 * 60_000, baseDelay + randomInt(jitterLimit)));
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
  readonly html: string;
  readonly text: string;
  readonly idempotencyKey: string;
}
export type DeliveryResult =
  | { readonly status: 'SENT'; readonly providerReference?: string; readonly metadata?: object }
  | {
      readonly status: 'FAILED';
      readonly retryable: boolean;
      readonly errorCode: string;
      readonly metadata?: object;
    }
  | {
      readonly status: 'UNKNOWN';
      readonly errorCode: string;
      readonly providerReference?: string;
      readonly metadata?: object;
    };
export interface EmailAdapter {
  readonly name: string;
  effectiveRecipient(recipient: string): string;
  send(request: EmailDeliveryRequest): Promise<DeliveryResult>;
}

export function createLocalEmailAdapter(): EmailAdapter {
  const delivered = new Map<string, string>();
  return {
    name: 'local',
    effectiveRecipient: (recipient) => recipient,
    async send(request) {
      const reference = delivered.get(request.idempotencyKey) ?? `local:${request.notificationId}`;
      delivered.set(request.idempotencyKey, reference);
      return { status: 'SENT', providerReference: reference };
    },
  };
}

const templateToken = /\{\{\s*([a-zA-Z][a-zA-Z0-9_]*)\s*\}\}/g;
const anyTemplateToken = /\{\{([^{}]+)\}\}/g;

function validateTemplateSource(
  subjectTemplate: string | undefined,
  bodyTemplate: string,
  schema: TemplateVariableSchema,
) {
  if (!bodyTemplate.trim() || bodyTemplate.length > 20_000)
    throw new NotificationDomainError(
      'VALIDATION_FAILED',
      'Template body must contain between 1 and 20,000 characters.',
    );
  if (subjectTemplate && subjectTemplate.length > 300)
    throw new NotificationDomainError(
      'VALIDATION_FAILED',
      'Template subject must not exceed 300 characters.',
    );
  const variables = Object.keys(schema);
  if (variables.length > 64 || variables.some((name) => !/^[a-zA-Z][a-zA-Z0-9_]*$/.test(name)))
    throw new NotificationDomainError(
      'VALIDATION_FAILED',
      'Template variable names must be simple identifiers and no more than 64 may be declared.',
    );
  for (const definition of Object.values(schema)) {
    if (
      definition.maxLength !== undefined &&
      (!Number.isInteger(definition.maxLength) ||
        definition.maxLength < 1 ||
        definition.maxLength > 10_000)
    )
      throw new NotificationDomainError(
        'VALIDATION_FAILED',
        'Template variable maximum lengths must be between 1 and 10,000.',
      );
  }
  const declared = new Set(variables);
  for (const source of [subjectTemplate, bodyTemplate]) {
    if (!source) continue;
    if (source.includes('{{{') || source.includes('}}}'))
      throw new NotificationDomainError(
        'VALIDATION_FAILED',
        'Unescaped or executable template constructs are not supported.',
      );
    for (const match of source.matchAll(anyTemplateToken)) {
      const name = match[1]?.trim() ?? '';
      if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(name) || !declared.has(name))
        throw new NotificationDomainError(
          'VALIDATION_FAILED',
          `Template variable ${name || '(empty)'} is not safely declared.`,
        );
    }
  }
}

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
    channel: 'IN_APP' | 'EMAIL' | 'SMS';
    name: string;
  },
) {
  if (!input.name.trim() || input.name.trim().length > 160)
    throw new NotificationDomainError('VALIDATION_FAILED', 'Template name is required.');
  const supported = await sql`select 1 from notifications.notification_channel_policies
    where notification_type=${input.notificationType} and channel=${input.channel}`.execute(db);
  if (!supported.rows[0])
    throw new NotificationDomainError(
      'VALIDATION_FAILED',
      'The event catalog does not support this notification type and channel.',
    );
  const row = await sql<{
    id: string;
  }>`insert into notifications.notification_templates(organization_id,notification_type,channel,name) values(${input.organizationId},${input.notificationType},${input.channel},${input.name.trim()}) returning id`.execute(
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
  validateTemplateSource(input.subjectTemplate, input.bodyTemplate, input.variableSchema);
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
  channel: 'IN_APP' | 'EMAIL' | 'SMS',
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
  channel: 'IN_APP' | 'EMAIL' | 'SMS',
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

export interface NotificationRuntimeOptions {
  readonly storefrontBaseUrl?: string;
  readonly supportEmail?: string;
  readonly senderFrom?: string;
  readonly environmentLabel?: string;
  readonly smsEnabled?: boolean;
  readonly smsProviderConfigured?: boolean;
  readonly smsProviderName?: string;
  readonly smsRecipientOverride?: string;
  readonly smsSenderType?: 'MASKING' | 'NON_MASKING' | 'PROVIDER_DEFAULT';
  readonly smsSenderId?: string;
}

interface NotificationSourceEvent {
  readonly event_id: string;
  readonly organization_id: string;
  readonly event_type: string;
  readonly aggregate_type: string;
  readonly aggregate_id: string;
  readonly payload: unknown;
  readonly occurred_at: Date;
}

function eventPayload(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

async function ensureNotificationIntent(
  db: Kysely<DatabaseSchema>,
  event: NotificationSourceEvent,
  input: {
    notificationType: string;
    category: NotificationCategory;
    priority: NotificationPriority;
  },
): Promise<string> {
  const key = `outbox:v1:${event.event_id}:${input.notificationType}`;
  const inserted = await sql<{ id: string }>`insert into notifications.notification_intents(
      organization_id,notification_type,category,priority,source_event_id,source_domain,source_id,deduplication_key,occurred_at
    ) values(
      ${event.organization_id},${input.notificationType},${input.category},${input.priority},${event.event_id}::uuid,
      ${event.aggregate_type},${event.aggregate_id}::uuid,${key},${event.occurred_at}
    ) on conflict(organization_id,deduplication_key) do nothing returning id`.execute(db);
  if (inserted.rows[0]) return inserted.rows[0].id;
  const existing = await sql<{
    id: string;
  }>`select id from notifications.notification_intents where organization_id=${event.organization_id} and deduplication_key=${key}`.execute(
    db,
  );
  if (!existing.rows[0]) throw new Error('Notification intent could not be resolved.');
  return existing.rows[0].id;
}

async function createStaffInAppNotifications(
  db: Kysely<DatabaseSchema>,
  event: NotificationSourceEvent,
  definition: StaffNotificationEventDefinition,
): Promise<number> {
  const policy = await sql<{ enabled: boolean; automatic_enabled: boolean }>`select
      coalesce(override.enabled,channel.enabled) enabled,
      coalesce(override.automatic_enabled,channel.automatic_enabled) automatic_enabled
    from notifications.notification_channel_policies channel
    left join notifications.organization_policy_overrides override
      on override.organization_id=${event.organization_id}
      and override.notification_type=channel.notification_type and override.channel=channel.channel
    where channel.notification_type=${definition.notificationType} and channel.channel='IN_APP'`.execute(
    db,
  );
  if (!policy.rows[0]?.enabled || !policy.rows[0].automatic_enabled) return 0;

  const intentId = await ensureNotificationIntent(db, event, {
    notificationType: definition.notificationType,
    category: definition.category,
    priority: definition.priority,
  });
  const payload = eventPayload(event.payload);
  const actionPath = definition.actionPath(event.aggregate_id, payload);
  const recipients = await sql<{ id: string }>`select membership.id
    from iam.organization_memberships membership
    where membership.organization_id=${event.organization_id} and membership.status='ACTIVE'
      and exists(
        select 1 from iam.membership_capability_grants grant_record
        where grant_record.membership_id=membership.id
          and grant_record.capability_code=${definition.requiredCapability}
      )`.execute(db);
  let created = 0;
  for (const recipient of recipients.rows) {
    const inserted = await sql<{ id: string }>`insert into notifications.notifications(
        organization_id,notification_type,intent_id,recipient_type,membership_id,channel,
        rendered_subject,rendered_body,category,priority,action_path,status,idempotency_key,queued_at,
        source_event_id,source_domain,source_id
      ) values(
        ${event.organization_id},${definition.notificationType},${intentId}::uuid,'MEMBERSHIP',${recipient.id}::uuid,'IN_APP',
        ${definition.title},${definition.body},${definition.category},${definition.priority},${actionPath},'QUEUED',
        ${`notification:v1:${event.event_id}:${definition.notificationType}:${recipient.id}:IN_APP`},now(),
        ${event.event_id}::uuid,${event.aggregate_type},${event.aggregate_id}::uuid
      ) on conflict(source_event_id,notification_type,recipient_type,coalesce(customer_id,membership_id),channel)
        where source_event_id is not null do nothing returning id`.execute(db);
    if (!inserted.rows[0]) continue;
    created += 1;
    await sql`insert into notifications.delivery_events(
        organization_id,notification_id,event_type,source,metadata
      ) values(
        ${event.organization_id},${inserted.rows[0].id}::uuid,'QUEUED','APPLICATION',
        ${JSON.stringify({ audience: 'STAFF', requiredCapability: definition.requiredCapability })}::jsonb
      )`.execute(db);
  }
  return created;
}

export async function createNotificationFromOutbox(
  db: Kysely<DatabaseSchema>,
  outboxEventId: number,
  options: NotificationRuntimeOptions = {},
  receiptAlreadyClaimed = false,
) {
  return db.transaction().execute(async (tx) => {
    const receipt = receiptAlreadyClaimed
      ? await sql<{
          id: string;
        }>`select id::text from platform.event_consumer_receipts where outbox_event_id=${outboxEventId} and consumer_name='notifications.outbox.v1' and status='PROCESSING' for update`.execute(
          tx,
        )
      : await sql<{
          id: string;
        }>`insert into platform.event_consumer_receipts(outbox_event_id,consumer_name,status,attempt_count,last_attempt_at) values(${outboxEventId},'notifications.outbox.v1','PROCESSING',1,now()) on conflict(outbox_event_id,consumer_name) do nothing returning id::text`.execute(
          tx,
        );
    if (!receipt.rows[0]) return { created: false };
    const e =
      await sql<NotificationSourceEvent>`select event_id,organization_id,event_type,aggregate_type,aggregate_id,payload,occurred_at from platform.outbox_events where id=${outboxEventId} for update`.execute(
        tx,
      );
    const event = e.rows[0];
    if (!event?.organization_id) {
      await sql`update platform.event_consumer_receipts set status='COMPLETED',processed_at=now() where id=${receipt.rows[0].id}::bigint`.execute(
        tx,
      );
      return { created: false };
    }
    const definitions = notificationDefinitionsFor(event.event_type);
    if (definitions.length === 0) {
      await sql`update platform.event_consumer_receipts set status='COMPLETED',processed_at=now() where id=${receipt.rows[0].id}::bigint`.execute(
        tx,
      );
      return { created: false };
    }
    let createdCount = 0;
    for (const definition of definitions) {
      if (definition.audience === 'STAFF')
        createdCount += await createStaffInAppNotifications(tx, event, definition);
    }
    const rule = customerDefinitionFor(event.event_type);
    if (!rule) {
      await sql`update platform.event_consumer_receipts set status='COMPLETED',processed_at=now(),last_error_code=null,next_retry_at=null where id=${receipt.rows[0].id}::bigint`.execute(
        tx,
      );
      return { created: createdCount > 0, createdCount };
    }
    // Commerce events own different aggregate IDs. Resolve the Order through
    // the owning record instead of assuming every aggregate ID is an Order ID.
    const order = await sql<{
      order_id: string;
      customer_id: string;
      order_number: string;
      display_name: string;
      email: string | null;
      phone: string | null;
      normalized_phone: string | null;
      currency_code: string;
      total_amount: string;
      delivery_address: string | null;
    }>`
      with candidate_orders(order_id) as (
        select (${JSON.stringify(event.payload)}::jsonb->>'orderId')::uuid
          where ${JSON.stringify(event.payload)}::jsonb ? 'orderId'
        union all
        select ${event.aggregate_id}::uuid where ${event.event_type} like 'orders.%'
        union all
        select refund.order_id from payments.refunds refund
          where ${event.event_type} = 'payments.refund.completed'
            and refund.organization_id = ${event.organization_id} and refund.id = ${event.aggregate_id}::uuid
        union all
        select fulfillment.order_id from fulfillment.fulfillments fulfillment
          where ${event.event_type} = 'fulfillment.dispatched'
            and fulfillment.organization_id = ${event.organization_id} and fulfillment.id = ${event.aggregate_id}::uuid
        union all
        select delivery.order_id from delivery.deliveries delivery
          where ${event.event_type} like 'delivery.%'
            and delivery.organization_id = ${event.organization_id} and delivery.id = ${event.aggregate_id}::uuid
        union all
        select return_case.order_id from returns.return_cases return_case
          where (${event.event_type} like 'returns.%' or ${event.event_type} = 'rto.initiated')
            and return_case.organization_id = ${event.organization_id} and return_case.id = ${event.aggregate_id}::uuid
        union all
        select order_line.order_id from reviews.reviews review
          join orders.order_lines order_line on order_line.id=review.verification_order_line_id
          where ${event.event_type} in ('reviews.review.approved','reviews.merchant_response.upserted')
            and review.organization_id=${event.organization_id} and review.id=${event.aggregate_id}::uuid
      )
      select orders.id as order_id, orders.customer_id, orders.order_number,
        coalesce(snapshot.display_name, customer.display_name, 'Customer') as display_name,
        case when snapshot.order_id is not null then snapshot.email else customer_email.normalized_value end as email,
        case when snapshot.order_id is not null then snapshot.phone else customer_phone.raw_value end as phone,
        case when snapshot.order_id is not null then snapshot.normalized_phone else customer_phone.normalized_value end as normalized_phone,
        orders.currency_code, orders.total_amount::text,
        concat_ws(', ', address.address_line_1, address.address_line_2, address.area, address.city, address.district, address.postal_code) delivery_address
      from candidate_orders candidate
      join orders.orders orders
        on orders.id = candidate.order_id and orders.organization_id = ${event.organization_id}
      left join orders.order_customer_snapshots snapshot on snapshot.order_id = orders.id
      left join customers.customers customer on customer.id = orders.customer_id
      left join customers.customer_emails customer_email on customer_email.customer_id = orders.customer_id and customer_email.is_primary
      left join customers.customer_phones customer_phone on customer_phone.customer_id = orders.customer_id and customer_phone.is_primary
      left join orders.order_addresses address on address.order_id = orders.id and address.address_type = 'DELIVERY'
      where orders.customer_id is not null
      limit 1
    `.execute(tx);
    const context = order.rows[0];
    if (!context) {
      await sql`update platform.event_consumer_receipts set status='COMPLETED',processed_at=now() where id=${receipt.rows[0].id}::bigint`.execute(
        tx,
      );
      return { created: false };
    }
    const customerIntentId = await ensureNotificationIntent(tx, event, {
      notificationType: rule.notificationType,
      category: rule.category,
      priority: rule.priority,
    });
    const policy = await sql<{
      channel: 'IN_APP' | 'EMAIL' | 'SMS';
      enabled: boolean;
      automatic_enabled: boolean;
      template_key: TransactionalEmailTemplateKey | TransactionalSmsTemplateKey | null;
    }>`select channel_policy.channel,
      coalesce(override.enabled,channel_policy.enabled) enabled,
      coalesce(override.automatic_enabled,channel_policy.automatic_enabled) automatic_enabled,
      channel_policy.template_key
      from notifications.notification_policies policy
      join notifications.notification_channel_policies channel_policy on channel_policy.notification_type=policy.notification_type
      left join notifications.organization_policy_overrides override
        on override.organization_id=${event.organization_id} and override.notification_type=policy.notification_type and override.channel=channel_policy.channel
      where policy.notification_type=${rule.notificationType}`.execute(tx);
    if (policy.rows.length === 0) {
      await sql`update platform.event_consumer_receipts set status='COMPLETED',processed_at=now() where id=${receipt.rows[0].id}::bigint`.execute(
        tx,
      );
      return { created: false };
    }
    const items = await sql<{
      title: string;
      variant: string | null;
      quantity: string;
      amount: string;
    }>`select product_title_snapshot title,variant_title_snapshot variant,quantity::text,net_amount::text amount from orders.order_lines where order_id=${context.order_id}::uuid and line_status='ACTIVE' order by id`.execute(
      tx,
    );
    const normalizedEmail = context.email?.trim().toLowerCase() ?? null;
    const hasUsableEmail = Boolean(
      normalizedEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail),
    );
    const isSuppressed = normalizedEmail
      ? Boolean(
          (
            await sql`select 1 from notifications.email_suppressions where organization_id=${event.organization_id} and normalized_email=${normalizedEmail} and active limit 1`.execute(
              tx,
            )
          ).rows[0],
        )
      : false;
    const normalizedPhone = normalizeBangladeshPhone(context.normalized_phone ?? context.phone);
    const isSmsSuppressed = normalizedPhone.valid
      ? Boolean(
          (
            await sql`select 1 from notifications.sms_suppressions where organization_id=${event.organization_id} and normalized_phone=${normalizedPhone.normalized} and active limit 1`.execute(
              tx,
            )
          ).rows[0],
        )
      : false;
    for (const effectivePolicy of policy.rows) {
      const channel = effectivePolicy.channel;
      const preference = await sql<{
        enabled: boolean;
      }>`select enabled from notifications.preferences where organization_id=${event.organization_id} and recipient_type='CUSTOMER' and recipient_id=${context.customer_id}::uuid and notification_type=${rule.notificationType} and channel=${channel}`.execute(
        tx,
      );
      const preferenceSuppressed = !rule.required && preference.rows[0]?.enabled === false;
      let status = !effectivePolicy.enabled || preferenceSuppressed ? 'SUPPRESSED' : 'QUEUED';
      let skipReason: string | null = !effectivePolicy.enabled
        ? 'POLICY_DISABLED'
        : preferenceSuppressed
          ? 'RECIPIENT_PREFERENCE'
          : null;
      if (channel === 'EMAIL' && !normalizedEmail) {
        status = 'SKIPPED_NO_EMAIL';
        skipReason = 'CUSTOMER_EMAIL_MISSING';
      } else if (channel === 'EMAIL' && !hasUsableEmail) {
        status = 'NOT_APPLICABLE';
        skipReason = 'INVALID_RECIPIENT';
      } else if (channel === 'EMAIL' && isSuppressed) {
        status = 'SUPPRESSED';
        skipReason = 'ACTIVE_EMAIL_SUPPRESSION';
      } else if (channel === 'EMAIL' && !effectivePolicy.automatic_enabled) {
        status = 'PENDING_MANUAL';
        skipReason = 'AUTOMATIC_SENDING_DISABLED';
      } else if (
        channel === 'SMS' &&
        !normalizedPhone.valid &&
        normalizedPhone.reason === 'MISSING'
      ) {
        status = 'SKIPPED_NO_PHONE';
        skipReason = 'CUSTOMER_PHONE_MISSING';
      } else if (channel === 'SMS' && !normalizedPhone.valid) {
        status = 'NOT_APPLICABLE';
        skipReason = 'INVALID_PHONE';
      } else if (channel === 'SMS' && isSmsSuppressed) {
        status = 'SUPPRESSED';
        skipReason = 'ACTIVE_SMS_SUPPRESSION';
      } else if (channel === 'SMS' && options.smsEnabled !== true) {
        status = 'NOT_APPLICABLE';
        skipReason = 'SMS_GLOBALLY_DISABLED';
      } else if (channel === 'SMS' && options.smsProviderConfigured !== true) {
        status = 'NOT_APPLICABLE';
        skipReason = 'PROVIDER_NOT_CONFIGURED';
      } else if (channel === 'SMS' && !effectivePolicy.automatic_enabled) {
        status = 'PENDING_MANUAL';
        skipReason = 'AUTOMATIC_SENDING_DISABLED';
      }

      let revisionId: string | null = null;
      let templateKey: string | null = null;
      let templateVersion: number | null = null;
      let renderedSubject: string | null;
      let renderedBody: string;
      let renderedHtml: string | null = null;
      let smsMetrics: ReturnType<typeof renderTransactionalSms> | undefined;
      if (channel === 'EMAIL' && effectivePolicy.template_key) {
        const rendered = renderTransactionalEmail(effectivePolicy.template_key, {
          customerName: context.display_name,
          orderNumber: context.order_number,
          currencyCode: context.currency_code,
          totalAmount: context.total_amount,
          ...(context.delivery_address ? { deliveryAddress: context.delivery_address } : {}),
          trackingUrl: `${options.storefrontBaseUrl ?? 'http://localhost:3000'}/orders/track`,
          supportEmail: options.supportEmail ?? 'maevelleBangladesh@gmail.com',
          ...(options.environmentLabel ? { environmentLabel: options.environmentLabel } : {}),
          items: items.rows.map((item) => ({
            title: item.title,
            ...(item.variant ? { variant: item.variant } : {}),
            quantity: item.quantity,
            amount: item.amount,
          })),
        });
        templateKey = rendered.templateKey;
        templateVersion = rendered.templateVersion;
        renderedSubject = rendered.subject;
        renderedBody = rendered.text;
        renderedHtml = rendered.html;
      } else if (channel === 'SMS' && effectivePolicy.template_key) {
        const rendered = renderTransactionalSms(
          effectivePolicy.template_key as TransactionalSmsTemplateKey,
          {
            customerName: context.display_name,
            orderNumber: context.order_number,
            currencyCode: context.currency_code,
            totalAmount: context.total_amount,
            trackingUrl: `${options.storefrontBaseUrl ?? 'http://localhost:3000'}/orders/track`,
          },
        );
        smsMetrics = rendered;
        templateKey = rendered.templateKey;
        templateVersion = rendered.templateVersion;
        renderedSubject = null;
        renderedBody = rendered.renderedText;
      } else {
        const revision = await ensureCurrentTemplate(
          tx,
          event.organization_id,
          rule.notificationType,
          channel,
        );
        revisionId = revision.id;
        renderedSubject = revision.subject_template
          ? renderNotificationTemplate(revision.subject_template, revision.variable_schema, {})
          : null;
        renderedBody = renderNotificationTemplate(
          revision.body_template,
          revision.variable_schema,
          {},
        );
      }
      const inserted = await sql<{ id: string }>`insert into notifications.notifications(
        organization_id,notification_type,intent_id,recipient_type,customer_id,channel,template_revision_id,template_key,template_version,
        rendered_subject,rendered_body,rendered_html,intended_recipient,effective_recipient,sender_from,reply_to,category,priority,status,skip_reason,
        idempotency_key,queued_at,source_event_id,source_domain,source_id
      ) values(
        ${event.organization_id},${rule.notificationType},${customerIntentId}::uuid,'CUSTOMER',${context.customer_id}::uuid,${channel},${revisionId}::uuid,${templateKey},${templateVersion},
        ${renderedSubject},${renderedBody},${renderedHtml},${channel === 'EMAIL' ? normalizedEmail : channel === 'SMS' && normalizedPhone.valid ? normalizedPhone.normalized : null},${channel === 'EMAIL' ? normalizedEmail : channel === 'SMS' && normalizedPhone.valid ? (options.smsRecipientOverride ?? normalizedPhone.normalized) : null},${channel === 'EMAIL' ? (options.senderFrom ?? null) : channel === 'SMS' ? (options.smsSenderId ?? null) : null},${channel === 'EMAIL' ? (options.supportEmail ?? null) : null},${rule.category},${rule.priority},${status},${skipReason},
        ${`notification:v1:${event.event_id}:${context.customer_id}:${channel}`},${status === 'QUEUED' ? new Date() : null},${event.event_id}::uuid,${event.aggregate_type},${context.order_id}::uuid
      ) on conflict(source_event_id,notification_type,recipient_type,coalesce(customer_id,membership_id),channel) where source_event_id is not null do nothing returning id`.execute(
        tx,
      );
      if (inserted.rows[0]) {
        createdCount += 1;
        if (channel === 'SMS' && smsMetrics) {
          await sql`insert into notifications.sms_delivery_details(notification_id,organization_id,original_recipient,normalized_recipient,encoding,character_count,encoding_unit_count,estimated_segments,sender_type,sender_id)
            values(${inserted.rows[0].id}::uuid,${event.organization_id},${context.phone},${normalizedPhone.valid ? normalizedPhone.normalized : null},${smsMetrics.encoding},${smsMetrics.characterCount},${smsMetrics.encodingUnitCount},${smsMetrics.segmentCount},${options.smsSenderType ?? 'PROVIDER_DEFAULT'},${options.smsSenderId ?? null})`.execute(
            tx,
          );
        }
        await sql`insert into notifications.delivery_events(organization_id,notification_id,event_type,source,metadata) values(${event.organization_id},${inserted.rows[0].id}::uuid,${status},'APPLICATION',${JSON.stringify({ reason: skipReason, automatic: effectivePolicy.automatic_enabled })}::jsonb)`.execute(
          tx,
        );
      }
    }
    await sql`update platform.event_consumer_receipts set status='COMPLETED',processed_at=now(),last_error_code=null,next_retry_at=null where id=${receipt.rows[0].id}::bigint`.execute(
      tx,
    );
    return { created: createdCount > 0, createdCount };
  });
}

export async function listNotificationTemplates(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    page: number;
    pageSize: number;
    channel?: 'IN_APP' | 'EMAIL' | 'SMS';
    status?: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
  },
) {
  const offset = (input.page - 1) * input.pageSize;
  const rows = await sql<Record<string, unknown> & { total_count: string }>`select
      template.id,template.notification_type,template.channel,template.name,template.status,template.version,
      template.current_revision_id,template.created_at::text,template.updated_at::text,
      revision.revision_number,revision.subject_template,revision.body_template,revision.variable_schema,
      count(*) over()::text total_count
    from notifications.notification_templates template
    left join notifications.template_revisions revision on revision.id=template.current_revision_id
    where template.organization_id=${input.organizationId}
      and (${input.channel ?? null}::text is null or template.channel=${input.channel ?? null})
      and (${input.status ?? null}::text is null or template.status=${input.status ?? null})
    order by template.updated_at desc,template.id desc limit ${input.pageSize} offset ${offset}`.execute(
    db,
  );
  const totalItems = Number(rows.rows[0]?.total_count ?? 0);
  return {
    data: rows.rows.map((source) => {
      const row = { ...source };
      Reflect.deleteProperty(row, 'total_count');
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

export async function previewNotificationTemplate(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    revisionId: string;
    variables: TemplateVariables;
  },
) {
  const revision = await sql<{
    subject_template: string | null;
    body_template: string;
    variable_schema: TemplateVariableSchema;
  }>`select revision.subject_template,revision.body_template,revision.variable_schema
    from notifications.template_revisions revision
    join notifications.notification_templates template on template.id=revision.template_id
    where revision.id=${input.revisionId}::uuid and revision.organization_id=${input.organizationId}
      and template.organization_id=${input.organizationId}`.execute(db);
  const selected = revision.rows[0];
  if (!selected)
    throw new NotificationDomainError('NOT_FOUND', 'Notification template revision was not found.');
  return {
    subject: selected.subject_template
      ? renderNotificationTemplate(
          selected.subject_template,
          selected.variable_schema,
          input.variables,
        )
      : null,
    body: renderNotificationTemplate(
      selected.body_template,
      selected.variable_schema,
      input.variables,
    ),
  };
}
export async function processNotificationOutbox(
  db: Kysely<DatabaseSchema>,
  limit = 20,
  options: NotificationRuntimeOptions = {},
) {
  await sql`update platform.event_consumer_receipts
    set status=case when attempt_count>=8 then 'DEAD_LETTER' else 'RETRY_WAIT' end,
        next_retry_at=case when attempt_count>=8 then null else now() end,
        last_error_code='PROCESSING_LEASE_EXPIRED'
    where consumer_name='notifications.outbox.v1' and status='PROCESSING'
      and last_attempt_at<now()-interval '5 minutes'`.execute(db);
  const events = await sql<{
    id: string;
  }>`select event.id::text from platform.outbox_events event
    left join platform.event_consumer_receipts receipt
      on receipt.outbox_event_id=event.id and receipt.consumer_name='notifications.outbox.v1'
    where receipt.id is null or (receipt.status='RETRY_WAIT' and receipt.next_retry_at<=now())
    order by event.id limit ${limit}`.execute(db);
  let processed = 0;
  for (const event of events.rows) {
    const eventId = Number(event.id);
    const claimed = await sql<{
      id: string;
      attempt_count: number;
    }>`insert into platform.event_consumer_receipts(
        outbox_event_id,consumer_name,status,attempt_count,last_attempt_at
      ) values(${eventId},'notifications.outbox.v1','PROCESSING',1,now())
      on conflict(outbox_event_id,consumer_name) do update set
        status='PROCESSING',attempt_count=platform.event_consumer_receipts.attempt_count+1,
        last_attempt_at=now(),next_retry_at=null
      where platform.event_consumer_receipts.status='RETRY_WAIT'
      returning id::text,attempt_count`.execute(db);
    if (!claimed.rows[0]) continue;
    try {
      await createNotificationFromOutbox(db, eventId, options, true);
      processed += 1;
    } catch {
      const attempt = claimed.rows[0].attempt_count;
      const deadLetter = attempt >= 8;
      await sql`update platform.event_consumer_receipts set
          status=${deadLetter ? 'DEAD_LETTER' : 'RETRY_WAIT'},
          next_retry_at=${deadLetter ? null : retryAt(attempt)},
          last_error_code='NOTIFICATION_MATERIALIZATION_FAILED'
        where id=${claimed.rows[0].id}::bigint and status='PROCESSING'`.execute(db);
    }
  }
  return processed;
}
export async function recordNotificationAttempt(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    notificationId: string;
    provider: string;
    outcome: 'SENT' | 'FAILED' | 'UNKNOWN';
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
      input.outcome === 'SENT'
        ? 'SENT'
        : input.outcome === 'UNKNOWN'
          ? 'UNKNOWN_OUTCOME'
          : retryable
            ? 'RETRY_WAIT'
            : 'PERMANENT_FAILURE';
    await sql`insert into notifications.delivery_attempts(organization_id,notification_id,attempt_number,provider,provider_message_id,status,completed_at,next_retry_at,error_code,retryable,response_metadata) values(${input.organizationId},${input.notificationId}::uuid,${attempt},${input.provider},${input.providerReference ?? null},${attemptStatus},now(),${retry ?? null},${input.errorCode ?? null},${retryable},${JSON.stringify(input.responseMetadata ?? {})}::jsonb)`.execute(
      tx,
    );
    await sql`update notifications.notifications set status=${input.outcome === 'SENT' ? 'SENT' : input.outcome === 'UNKNOWN' ? 'UNKNOWN_PROVIDER_OUTCOME' : 'FAILED'},provider=${input.provider},provider_message_id=coalesce(${input.providerReference ?? null},provider_message_id),failure_code=${input.errorCode ?? null},sent_at=case when ${input.outcome === 'SENT'} then now() else sent_at end,updated_at=now() where id=${input.notificationId}::uuid`.execute(
      tx,
    );
    await sql`insert into notifications.delivery_events(organization_id,notification_id,event_type,source,metadata) values(${input.organizationId},${input.notificationId}::uuid,${input.outcome === 'SENT' ? 'SENT' : input.outcome === 'UNKNOWN' ? 'UNKNOWN_PROVIDER_OUTCOME' : retryable ? 'RETRY_SCHEDULED' : 'FAILED'},'APPLICATION',${JSON.stringify({ provider: input.provider, errorCode: input.errorCode, retryable, nextRetryAt: retry?.toISOString() })}::jsonb)`.execute(
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
    }>`select id,notification_type,rendered_subject,rendered_body,status,source_domain,source_id,created_at::text,read_at::text from notifications.notifications where organization_id=${input.organizationId} and recipient_type=${input.recipientType} and coalesce(customer_id,membership_id)=${input.recipientId}::uuid and channel='IN_APP' ${input.unreadOnly ? sql`and read_at is null` : sql``} and (recipient_type<>'MEMBERSHIP' or exists(select 1 from iam.organization_memberships membership where membership.id=membership_id and membership.organization_id=${input.organizationId} and membership.status='ACTIVE')) order by created_at desc limit 100`.execute(
      db,
    )
  ).rows;
}

export async function listRecipientInboxPage(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    membershipId: string;
    page: number;
    pageSize: number;
    unreadOnly?: boolean;
    category?: NotificationCategory;
  },
) {
  const offset = (input.page - 1) * input.pageSize;
  const [rows, unread] = await Promise.all([
    sql<Record<string, unknown> & { total_count: string }>`select
        n.id,n.notification_type,n.rendered_subject,n.rendered_body,n.category,n.priority,n.action_path,
        n.status,n.source_domain,n.source_id,n.created_at::text,n.read_at::text,count(*) over()::text total_count
      from notifications.notifications n
      join iam.organization_memberships membership on membership.id=n.membership_id
        and membership.organization_id=n.organization_id and membership.status='ACTIVE'
      where n.organization_id=${input.organizationId} and n.membership_id=${input.membershipId}::uuid
        and n.channel='IN_APP' and n.status<>'CANCELLED'
        and (${input.unreadOnly ?? false}=false or n.read_at is null)
        and (${input.category ?? null}::text is null or n.category=${input.category ?? null})
      order by n.created_at desc,n.id desc limit ${input.pageSize} offset ${offset}`.execute(db),
    sql<{ count: string }>`select count(*)::text as count
      from notifications.notifications n
      join iam.organization_memberships membership on membership.id=n.membership_id
        and membership.organization_id=n.organization_id and membership.status='ACTIVE'
      where n.organization_id=${input.organizationId} and n.membership_id=${input.membershipId}::uuid
        and n.channel='IN_APP' and n.status<>'CANCELLED' and n.read_at is null`.execute(db),
  ]);
  const totalItems = Number(rows.rows[0]?.total_count ?? 0);
  const unreadCount = Number(unread.rows[0]?.count ?? 0);
  return {
    data: rows.rows.map((source) => {
      const row = { ...source };
      Reflect.deleteProperty(row, 'total_count');
      return row;
    }),
    pagination: {
      page: input.page,
      pageSize: input.pageSize,
      totalItems,
      totalPages: Math.ceil(totalItems / input.pageSize),
    },
    unreadCount,
  };
}

export async function getRecipientUnreadCount(
  db: Kysely<DatabaseSchema>,
  input: { organizationId: string; membershipId: string },
): Promise<number> {
  const result = await sql<{ count: string }>`select count(*)::text as count
    from notifications.notifications n
    join iam.organization_memberships membership on membership.id=n.membership_id
      and membership.organization_id=n.organization_id and membership.status='ACTIVE'
    where n.organization_id=${input.organizationId} and n.membership_id=${input.membershipId}::uuid
      and n.channel='IN_APP' and n.status<>'CANCELLED' and n.read_at is null`.execute(db);
  return Number(result.rows[0]?.count ?? 0);
}

export async function markAllNotificationsRead(
  db: Kysely<DatabaseSchema>,
  input: { organizationId: string; membershipId: string },
) {
  const result = await sql<{
    id: string;
  }>`update notifications.notifications set status='READ',read_at=now(),updated_at=now()
    where organization_id=${input.organizationId} and membership_id=${input.membershipId}::uuid
      and channel='IN_APP' and read_at is null and status<>'CANCELLED' returning id`.execute(db);
  return result.rows.length;
}

export async function listNotificationHistory(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    page: number;
    pageSize: number;
    channel?: 'IN_APP' | 'EMAIL' | 'SMS';
    status?: string;
    notificationType?: string;
    category?: NotificationCategory;
    sourceId?: string;
  },
) {
  const offset = (input.page - 1) * input.pageSize;
  const rows = await sql<Record<string, unknown> & { total_count: string }>`select
      n.id,n.intent_id,n.notification_type,n.recipient_type,n.customer_id,n.membership_id,n.channel,
      n.category,n.priority,n.status,n.trigger_type,n.provider,n.failure_code,n.skip_reason,n.source_domain,
      n.source_id,n.scheduled_for::text,n.expires_at::text,n.created_at::text,n.sent_at::text,n.delivered_at::text,
      count(*) over()::text total_count
    from notifications.notifications n where n.organization_id=${input.organizationId}
      and (${input.channel ?? null}::text is null or n.channel=${input.channel ?? null})
      and (${input.status ?? null}::text is null or n.status=${input.status ?? null})
      and (${input.notificationType ?? null}::text is null or n.notification_type=${input.notificationType ?? null})
      and (${input.category ?? null}::text is null or n.category=${input.category ?? null})
      and (${input.sourceId ?? null}::uuid is null or n.source_id=${input.sourceId ?? null}::uuid)
    order by n.created_at desc,n.id desc limit ${input.pageSize} offset ${offset}`.execute(db);
  const totalItems = Number(rows.rows[0]?.total_count ?? 0);
  return {
    data: rows.rows.map((source) => {
      const row = { ...source };
      Reflect.deleteProperty(row, 'total_count');
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

export interface DetailedNotificationRecord {
  id: string;
  intent_id: string | null;
  notification_type: string;
  recipient_type: 'MEMBERSHIP' | 'CUSTOMER';
  customer_id: string | null;
  membership_id: string | null;
  channel: 'IN_APP' | 'EMAIL' | 'SMS';
  category: NotificationCategory;
  priority: NotificationPriority;
  status: string;
  trigger_type: string;
  provider: string | null;
  provider_message_id: string | null;
  failure_code: string | null;
  skip_reason: string | null;
  source_domain: string;
  source_id: string;
  intended_recipient: string | null;
  effective_recipient: string | null;
  rendered_subject: string | null;
  rendered_body: string;
  action_path: string | null;
  scheduled_for: string;
  expires_at: string | null;
  created_at: string;
  sent_at: string | null;
  delivered_at: string | null;
  read_at: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  updated_at: string;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  membership_user_name: string | null;
  membership_user_email: string | null;
  revision_number: number | null;
  attempts: readonly Record<string, unknown>[];
  timeline: readonly Record<string, unknown>[];
}

export async function getNotificationDetail(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  notificationId: string,
): Promise<DetailedNotificationRecord & { canRetry: boolean; canCancel: boolean; canSchedule: boolean }> {
  const row = await sql<DetailedNotificationRecord>`select
      n.id,n.intent_id,n.notification_type,n.recipient_type,n.customer_id,n.membership_id,n.channel,
      n.category,n.priority,n.status,n.trigger_type,n.provider,n.provider_message_id,n.failure_code,
      n.skip_reason,n.source_domain,n.source_id,n.intended_recipient,n.effective_recipient,
      n.rendered_subject,n.rendered_body,n.action_path,n.scheduled_for::text,n.expires_at::text,
      n.created_at::text,n.sent_at::text,n.delivered_at::text,n.read_at::text,n.cancelled_at::text,
      n.cancellation_reason,n.updated_at::text,
      c.display_name as customer_name,
      c.email as customer_email,
      c.phone as customer_phone,
      u.name as membership_user_name,
      u.email as membership_user_email,
      r.revision_number,
      coalesce((select jsonb_agg(
        jsonb_build_object(
          'id', a.id,
          'attemptNumber', a.attempt_number,
          'provider', a.provider,
          'providerMessageId', a.provider_message_id,
          'status', a.status,
          'startedAt', a.started_at,
          'completedAt', a.completed_at,
          'nextRetryAt', a.next_retry_at,
          'errorCode', a.error_code,
          'errorCategory', a.error_category
        ) order by a.attempt_number) from notifications.delivery_attempts a where a.notification_id=n.id),'[]'::jsonb) attempts,
      coalesce((select jsonb_agg(
        jsonb_build_object(
          'id', e.id,
          'event_type', e.event_type,
          'event_at', e.event_at,
          'source', e.source,
          'provider_event_id', e.provider_event_id,
          'metadata', e.metadata
        ) order by e.event_at, e.id) from notifications.delivery_events e where e.notification_id=n.id),'[]'::jsonb) timeline
    from notifications.notifications n
    left join customers.customers c on c.id = n.customer_id
    left join iam.organization_memberships m on m.id = n.membership_id
    left join iam.users u on u.id = m.user_id
    left join notifications.template_revisions r on r.id = n.template_revision_id
    where n.organization_id=${organizationId} and n.id=${notificationId}::uuid`.execute(db);
  if (!row.rows[0]) {
    throw new NotificationDomainError('NOT_FOUND', 'Notification was not found.');
  }
  const item = row.rows[0];
  const status = String(item.status);
  const channel = String(item.channel);
  const canRetry = status === 'FAILED' && (channel === 'EMAIL' || channel === 'SMS');
  const canCancel = ['QUEUED', 'PENDING_MANUAL', 'FAILED'].includes(status) && item.intent_id !== null;
  const canSchedule = ['QUEUED', 'PENDING_MANUAL', 'FAILED'].includes(status);
  return {
    ...item,
    canRetry,
    canCancel,
    canSchedule,
  };
}

export async function cancelNotificationIntent(
  db: Kysely<DatabaseSchema>,
  input: { organizationId: string; intentId: string; actorId: string; reason: string },
) {
  if (!input.reason.trim())
    throw new NotificationDomainError('VALIDATION_FAILED', 'A cancellation reason is required.');
  return db.transaction().execute(async (tx) => {
    const intent = await sql<{ id: string }>`update notifications.notification_intents
      set status='CANCELLED',cancelled_at=now(),cancellation_reason=${input.reason.trim()}
      where organization_id=${input.organizationId} and id=${input.intentId}::uuid and status='ACTIVE'
      returning id`.execute(tx);
    if (!intent.rows[0])
      throw new NotificationDomainError(
        'CONFLICT',
        'Only an active notification intent can be cancelled.',
      );
    const cancelled = await sql<{ id: string }>`update notifications.notifications set
        status='CANCELLED',cancelled_at=now(),cancellation_reason=${input.reason.trim()},updated_at=now()
      where organization_id=${input.organizationId} and intent_id=${input.intentId}::uuid
        and status in ('QUEUED','FAILED','PENDING_MANUAL') returning id`.execute(tx);
    await appendAuditEvent(tx, {
      organizationId: input.organizationId,
      actorType: 'USER',
      actorId: input.actorId,
      action: 'notifications.intent.cancelled',
      targetType: 'notifications.notification_intent',
      targetId: input.intentId,
      reason: input.reason.trim(),
      metadata: { cancelledDeliveryCount: cancelled.rows.length },
    });
    return { cancelledDeliveryCount: cancelled.rows.length };
  });
}

export async function scheduleNotificationDelivery(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    notificationId: string;
    actorId: string;
    scheduledFor: Date;
    expiresAt?: Date;
    reason: string;
  },
) {
  if (!input.reason.trim())
    throw new NotificationDomainError('VALIDATION_FAILED', 'A scheduling reason is required.');
  if (input.scheduledFor.getTime() > Date.now() + 365 * 24 * 60 * 60 * 1_000)
    throw new NotificationDomainError(
      'VALIDATION_FAILED',
      'A notification cannot be scheduled more than one year ahead.',
    );
  if (input.expiresAt && input.expiresAt <= input.scheduledFor)
    throw new NotificationDomainError(
      'VALIDATION_FAILED',
      'Delivery expiry must be later than the scheduled time.',
    );
  return db.transaction().execute(async (tx) => {
    const updated = await sql<{ id: string }>`update notifications.notifications set
        scheduled_for=${input.scheduledFor},expires_at=${input.expiresAt ?? null},updated_at=now()
      where organization_id=${input.organizationId} and id=${input.notificationId}::uuid
        and status in ('QUEUED','FAILED','PENDING_MANUAL') returning id`.execute(tx);
    if (!updated.rows[0])
      throw new NotificationDomainError(
        'CONFLICT',
        'Only an unsent notification can be scheduled.',
      );
    await sql`insert into notifications.delivery_events(organization_id,notification_id,event_type,source,metadata)
      values(${input.organizationId},${input.notificationId}::uuid,'SCHEDULED','ADMIN',${JSON.stringify({ scheduledFor: input.scheduledFor.toISOString(), expiresAt: input.expiresAt?.toISOString() ?? null, reason: input.reason.trim() })}::jsonb)`.execute(
      tx,
    );
    await appendAuditEvent(tx, {
      organizationId: input.organizationId,
      actorType: 'USER',
      actorId: input.actorId,
      action: 'notifications.delivery.scheduled',
      targetType: 'notifications.notification',
      targetId: input.notificationId,
      reason: input.reason.trim(),
      metadata: {
        scheduledFor: input.scheduledFor.toISOString(),
        expiresAt: input.expiresAt?.toISOString() ?? null,
      },
    });
    return updated.rows[0];
  });
}

export async function notificationOperationalHealth(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
) {
  const result = await sql<{
    queued: number;
    processing: number;
    retry_wait: number;
    unknown_outcome: number;
    dead_letter_events: number;
    unmatched_provider_events: number;
    oldest_queued_at: string | null;
  }>`select
      count(*) filter(where n.status='QUEUED')::int queued,
      count(*) filter(where n.status='PROCESSING')::int processing,
      count(*) filter(where n.status='FAILED' and exists(select 1 from notifications.delivery_attempts a where a.notification_id=n.id and a.status='RETRY_WAIT'))::int retry_wait,
      count(*) filter(where n.status='UNKNOWN_PROVIDER_OUTCOME')::int unknown_outcome,
      (select count(*)::int from platform.event_consumer_receipts receipt join platform.outbox_events event on event.id=receipt.outbox_event_id where event.organization_id=${organizationId} and receipt.consumer_name='notifications.outbox.v1' and receipt.status='DEAD_LETTER') dead_letter_events,
      (select count(*)::int
        from notifications.provider_events event
        join notifications.notifications related
          on related.provider=event.provider and related.provider_message_id=event.provider_message_id
        where related.organization_id=${organizationId} and event.processing_result='UNMATCHED_MESSAGE') unmatched_provider_events,
      min(n.scheduled_for) filter(where n.status='QUEUED')::text oldest_queued_at
    from notifications.notifications n where n.organization_id=${organizationId}`.execute(db);
  return result.rows[0]!;
}

export async function purgeExpiredNotificationHistory(db: Kysely<DatabaseSchema>, limit = 100) {
  return db.transaction().execute(async (tx) => {
    const candidates = await sql<{ id: string }>`select notification.id
      from notifications.notifications notification
      join notifications.notification_policies policy on policy.notification_type=notification.notification_type
      where notification.status in (
          'NOT_APPLICABLE','SKIPPED_NO_EMAIL','SKIPPED_NO_PHONE','SENT','ACCEPTED','DELIVERED','FAILED',
          'REJECTED','EXPIRED','UNDELIVERABLE','BOUNCED','COMPLAINED','SUPPRESSED','READ','CANCELLED'
        )
        and notification.status<>'UNKNOWN_PROVIDER_OUTCOME'
        and notification.updated_at < now()-(policy.retention_days*interval '1 day')
        and not exists(select 1 from notifications.notifications child where child.parent_notification_id=notification.id)
      order by notification.updated_at,notification.id for update skip locked limit ${limit}`.execute(
      tx,
    );
    const ids = candidates.rows.map((row) => row.id);
    if (ids.length === 0) return 0;
    await sql`update notifications.sms_provider_events set notification_id=null where notification_id=any(${ids}::uuid[])`.execute(
      tx,
    );
    await sql`delete from notifications.delivery_events where notification_id=any(${ids}::uuid[])`.execute(
      tx,
    );
    await sql`delete from notifications.delivery_attempts where notification_id=any(${ids}::uuid[])`.execute(
      tx,
    );
    await sql`delete from notifications.sms_delivery_details where notification_id=any(${ids}::uuid[])`.execute(
      tx,
    );
    await sql`delete from notifications.notifications where id=any(${ids}::uuid[])`.execute(tx);
    await sql`delete from notifications.notification_intents intent
      where not exists(select 1 from notifications.notifications notification where notification.intent_id=intent.id)
        and intent.created_at<now()-interval '365 days'`.execute(tx);
    return ids.length;
  });
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
  organizationId?: string,
) {
  await sql`update notifications.notifications n set status='CANCELLED',cancelled_at=now(),cancellation_reason='INTENT_CANCELLED',updated_at=now()
    where n.channel='EMAIL' and n.status in ('QUEUED','FAILED','PENDING_MANUAL')
      and exists(select 1 from notifications.notification_intents intent where intent.id=n.intent_id and intent.organization_id=n.organization_id and intent.status='CANCELLED')`.execute(
    db,
  );
  await sql`update notifications.notifications n set status='EXPIRED',failure_code='DELIVERY_WINDOW_EXPIRED',updated_at=now()
    where n.channel='EMAIL' and n.status in ('QUEUED','FAILED') and n.expires_at is not null and n.expires_at<=now()`.execute(
    db,
  );
  await sql`update notifications.notifications n set status='SUPPRESSED',skip_reason='ACTIVE_EMAIL_SUPPRESSION',updated_at=now()
    where n.channel='EMAIL' and n.status in ('QUEUED','FAILED') and n.intended_recipient is not null
      and exists(select 1 from notifications.email_suppressions suppression
        where suppression.organization_id=n.organization_id and suppression.normalized_email=lower(n.intended_recipient) and suppression.active)`.execute(
    db,
  );
  await sql`update notifications.notifications n set status='SUPPRESSED',skip_reason='CHANNEL_POLICY_DISABLED_AT_SEND',updated_at=now()
    where n.channel='EMAIL' and n.status in ('QUEUED','FAILED') and exists(
      select 1 from notifications.notification_channel_policies channel
      left join notifications.organization_policy_overrides override
        on override.organization_id=n.organization_id and override.notification_type=channel.notification_type and override.channel=channel.channel
      where channel.notification_type=n.notification_type and channel.channel='EMAIL'
        and (not coalesce(override.enabled,channel.enabled)
          or (n.trigger_type='AUTOMATIC' and not coalesce(override.automatic_enabled,channel.automatic_enabled))))`.execute(
    db,
  );
  const stale = await sql<{
    id: string;
    organization_id: string;
    provider: string | null;
  }>`update notifications.notifications
    set status='UNKNOWN_PROVIDER_OUTCOME',failure_code='PROCESSING_LEASE_EXPIRED_OUTCOME_UNKNOWN',updated_at=now()
    where channel='EMAIL' and status='PROCESSING' and processing_started_at < now() - interval '5 minutes'
    returning id,organization_id,provider`.execute(db);
  for (const item of stale.rows) {
    await recordNotificationAttempt(db, {
      organizationId: item.organization_id,
      notificationId: item.id,
      provider: item.provider ?? adapter.name,
      outcome: 'UNKNOWN',
      errorCode: 'PROCESSING_LEASE_EXPIRED_OUTCOME_UNKNOWN',
    });
  }
  const pending = await sql<{
    id: string;
    organization_id: string;
    rendered_subject: string | null;
    rendered_body: string;
    rendered_html: string | null;
    idempotency_key: string;
    recipient: string;
  }>`with candidates as (
      select n.id from notifications.notifications n
      where n.channel='EMAIL' and (
          n.status='QUEUED'
          or (
            n.status='FAILED' and exists(
              select 1 from notifications.delivery_attempts latest
              where latest.notification_id=n.id and latest.retryable
                and latest.attempt_number=(select max(candidate.attempt_number) from notifications.delivery_attempts candidate where candidate.notification_id=n.id)
                and latest.next_retry_at<=now()
            )
          )
        )
        and n.scheduled_for<=now()
        and (n.expires_at is null or n.expires_at>now())
        and (${organizationId ?? null}::uuid is null or n.organization_id=${organizationId ?? null}::uuid)
        and not exists(select 1 from platform.operational_controls control where control.organization_id=n.organization_id and control.control_key='email_delivery_enabled' and not control.enabled)
        and not exists(
          select 1 from settings.runtime_settings s
          where s.organization_id=n.organization_id
            and s.setting_key='email.enabled'
            and s.value_json='false'::jsonb
        )
        and not exists(select 1 from notifications.delivery_attempts a where a.notification_id=n.id and a.status='SENT')
        and not exists(select 1 from notifications.email_suppressions suppression where suppression.organization_id=n.organization_id and suppression.normalized_email=lower(n.intended_recipient) and suppression.active)
        and not exists(select 1 from notifications.notification_intents intent where intent.id=n.intent_id and intent.status='CANCELLED')
        and exists(
          select 1 from notifications.notification_channel_policies channel
          left join notifications.organization_policy_overrides override
            on override.organization_id=n.organization_id and override.notification_type=channel.notification_type and override.channel=channel.channel
          where channel.notification_type=n.notification_type and channel.channel='EMAIL'
            and coalesce(override.enabled,channel.enabled)
            and (n.trigger_type<>'AUTOMATIC' or coalesce(override.automatic_enabled,channel.automatic_enabled))
        )
      order by case n.priority when 'CRITICAL' then 1 when 'HIGH' then 2 when 'NORMAL' then 3 else 4 end,n.scheduled_for,n.created_at
      for update skip locked limit ${limit}
    )
    update notifications.notifications n set status='PROCESSING',processing_started_at=now(),updated_at=now()
    from candidates where n.id=candidates.id
    returning n.id,n.organization_id,n.rendered_subject,n.rendered_body,n.rendered_html,n.idempotency_key,n.intended_recipient recipient`.execute(
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
    const emailSettingsRow = await sql<{ value_json: unknown }>`
      select value_json from settings.runtime_settings
      where organization_id = ${item.organization_id} and setting_key = 'email.testRecipientOverride'
      limit 1
    `.execute(db);
    const dynamicOverride =
      typeof emailSettingsRow.rows[0]?.value_json === 'string' &&
      emailSettingsRow.rows[0].value_json.trim() !== ''
        ? emailSettingsRow.rows[0].value_json.trim()
        : undefined;
    const effectiveRecipient = dynamicOverride ?? adapter.effectiveRecipient(item.recipient);
    await sql`update notifications.notifications set effective_recipient=${effectiveRecipient},updated_at=now() where id=${item.id}::uuid`.execute(
      db,
    );
    await sql`insert into notifications.delivery_events(organization_id,notification_id,event_type,source,metadata) values(${item.organization_id},${item.id}::uuid,'PROCESSING','APPLICATION',${JSON.stringify({ intendedRecipient: item.recipient, effectiveRecipient })}::jsonb)`.execute(
      db,
    );
    let result: DeliveryResult;
    try {
      result = await adapter.send({
        notificationId: item.id,
        recipient: effectiveRecipient,
        subject: item.rendered_subject ?? '',
        html: item.rendered_html ?? `<pre>${escapeHtml(item.rendered_body)}</pre>`,
        text: item.rendered_body,
        idempotencyKey: item.idempotency_key,
      });
    } catch {
      result = { status: 'UNKNOWN', errorCode: 'ADAPTER_OUTCOME_UNKNOWN' };
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
        : result.status === 'FAILED'
          ? {
              errorCode: result.errorCode,
              retryable: result.retryable,
              ...(result.metadata ? { responseMetadata: result.metadata } : {}),
            }
          : {
              errorCode: result.errorCode,
              ...(result.providerReference ? { providerReference: result.providerReference } : {}),
              ...(result.metadata ? { responseMetadata: result.metadata } : {}),
            }),
    });
    if (result.status === 'SENT') await reconcileUnmatchedEmailProviderEvents(db, 20);
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
    channel: 'IN_APP' | 'EMAIL' | 'SMS';
    enabled: boolean;
  },
) {
  await db.transaction().execute(async (tx) => {
    const policy = await sql<{ delivery_requirement: string }>`select policy.delivery_requirement
      from notifications.notification_policies policy
      join notifications.notification_channel_policies channel_policy
        on channel_policy.notification_type=policy.notification_type and channel_policy.channel=${input.channel}
      where policy.notification_type=${input.notificationType}`.execute(tx);
    if (!policy.rows[0]) {
      throw new NotificationDomainError(
        'VALIDATION_FAILED',
        'The notification type does not support this channel.',
      );
    }
    if (!input.enabled && policy.rows[0].delivery_requirement === 'REQUIRED_OPERATIONAL') {
      throw new NotificationDomainError(
        'CONFLICT',
        'Required operational notifications cannot be disabled by a recipient preference.',
      );
    }
    const recipient =
      input.recipientType === 'MEMBERSHIP'
        ? await sql<{ id: string }>`select id from iam.organization_memberships
            where organization_id=${input.organizationId} and id=${input.recipientId}::uuid and status='ACTIVE'`.execute(
            tx,
          )
        : await sql<{ id: string }>`select id from customers.customers
            where organization_id=${input.organizationId} and id=${input.recipientId}::uuid and status not in ('MERGED','ANONYMIZED')`.execute(
            tx,
          );
    if (!recipient.rows[0]) {
      throw new NotificationDomainError('NOT_FOUND', 'The notification recipient was not found.');
    }
    await sql`insert into notifications.preferences(organization_id,recipient_type,recipient_id,notification_type,channel,enabled) values(${input.organizationId},${input.recipientType},${input.recipientId}::uuid,${input.notificationType},${input.channel},${input.enabled}) on conflict(organization_id,recipient_type,recipient_id,notification_type,channel) do update set enabled=excluded.enabled,updated_at=now()`.execute(
      tx,
    );
  });
}

export async function listNotificationPreferences(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    recipientType: 'MEMBERSHIP' | 'CUSTOMER';
    recipientId: string;
  },
) {
  return (
    await sql<{
      notification_type: string;
      channel: string;
      enabled: boolean;
      updated_at: string;
    }>`select notification_type,channel,enabled,updated_at::text from notifications.preferences where organization_id=${input.organizationId} and recipient_type=${input.recipientType} and recipient_id=${input.recipientId}::uuid order by notification_type,channel`.execute(
      db,
    )
  ).rows;
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
  }>`select o.id::text,o.event_id,o.organization_id,o.event_type,o.event_version,o.aggregate_type,o.aggregate_id,o.aggregate_version::text,o.payload,o.occurred_at from platform.outbox_events o where o.organization_id is not null and not exists(select 1 from platform.operational_controls control where control.organization_id=o.organization_id and control.control_key='webhook_delivery_enabled' and not control.enabled) and exists(select 1 from integrations.webhook_endpoints e join integrations.webhook_subscriptions s on s.webhook_endpoint_id=e.id where e.organization_id=o.organization_id and e.status='ACTIVE' and s.event_type=o.event_type and s.event_version=o.event_version) and not exists(select 1 from integrations.webhook_events w where w.source_outbox_event_id=o.id and w.event_type=o.event_type and w.event_version=o.event_version) order by o.id limit ${limit}`.execute(
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
  }>`insert into integrations.inbound_provider_events(organization_id,integration_account_id,provider_event_id,event_type,provider_status,payload_hash,raw_payload,authentication_status,provider_occurred_at) select ${input.organizationId},a.id,${input.providerEventId ?? null},${input.eventType},${input.providerStatus ?? null},${sha256(payload)},${payload}::jsonb,${input.authenticationStatus},${input.providerOccurredAt ?? null} from integrations.integration_accounts a where a.id=${input.integrationAccountId}::uuid and a.organization_id=${input.organizationId} on conflict do nothing returning id`.execute(
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
    select 'NOTIFICATION_TEMPLATE_REVISION_MISSING' code,n.id entity_id from notifications.notifications n where n.organization_id=${organizationId} and n.status<>'SUPPRESSED' and n.template_revision_id is null and n.template_key is null
    union all select 'DUPLICATE_SUCCESSFUL_NOTIFICATION_DELIVERY',n.id from notifications.notifications n join notifications.delivery_attempts a on a.notification_id=n.id and a.status='SENT' where n.organization_id=${organizationId} group by n.id having count(*)>1
    union all select 'REQUIRED_NOTIFICATION_SUPPRESSED',n.id from notifications.notifications n join notifications.notification_policies p on p.notification_type=n.notification_type and p.delivery_requirement='REQUIRED_OPERATIONAL' where n.organization_id=${organizationId} and n.status='SUPPRESSED'
    union all select 'DUPLICATE_CANONICAL_WEBHOOK_EVENT',min(w.id::text)::uuid from integrations.webhook_events w where w.organization_id=${organizationId} and w.source_outbox_event_id is not null group by w.source_outbox_event_id,w.event_type,w.event_version having count(*)>1
    union all select 'WEBHOOK_SUCCESS_WITHOUT_ATTEMPT',w.id from integrations.webhook_events w where w.organization_id=${organizationId} and exists(select 1 from integrations.webhook_deliveries d where d.webhook_event_id=w.id and d.status='SENT') and not exists(select 1 from integrations.webhook_deliveries d where d.webhook_event_id=w.id and d.status='SENT' and d.completed_at is not null)
    union all select 'PROVIDER_RAW_STATUS_MISSING',p.id from integrations.inbound_provider_events p where p.organization_id=${organizationId} and p.provider_status is null
    union all select 'CROSS_ORG_EXTERNAL_MAPPING',m.id from integrations.external_entity_mappings m join integrations.integration_accounts a on a.id=m.integration_account_id where m.organization_id=${organizationId} and a.organization_id<>m.organization_id
  `.execute(db);
  return issues.rows;
}
