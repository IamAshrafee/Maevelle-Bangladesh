import { sql, type Kysely } from 'kysely';
import type { DatabaseSchema } from '../index.js';

/** Forward-only operational hardening for immutable templates and delivery workers. */
export async function up(db: Kysely<DatabaseSchema>): Promise<void> {
  await sql`
    alter table notifications.delivery_attempts
      add column retryable boolean not null default false,
      add column response_metadata jsonb not null default '{}'::jsonb check(jsonb_typeof(response_metadata)='object');

    alter table integrations.webhook_endpoints
      add column secret_version integer not null default 1 check(secret_version > 0);

    alter table integrations.webhook_events
      add column source_outbox_event_id bigint references platform.outbox_events(id);
    create unique index webhook_event_source_type
      on integrations.webhook_events(source_outbox_event_id,event_type,event_version)
      where source_outbox_event_id is not null;

    alter table integrations.webhook_deliveries
      add column retryable boolean not null default false,
      add column response_metadata jsonb not null default '{}'::jsonb check(jsonb_typeof(response_metadata)='object'),
      add column signature_timestamp text,
      add column provider_reference text;

    create index notification_delivery_retry
      on notifications.delivery_attempts(status,next_retry_at)
      where status in ('PENDING','RETRY_WAIT');
    create index webhook_endpoints_org_status
      on integrations.webhook_endpoints(organization_id,status,updated_at desc);
    create index webhook_events_org_created
      on integrations.webhook_events(organization_id,created_at desc);

    insert into notifications.notification_policies(notification_type,delivery_requirement) values
      ('ORDER_PLACED','REQUIRED_OPERATIONAL'),('ORDER_CONFIRMED','REQUIRED_OPERATIONAL'),
      ('ORDER_CANCELLED','OPTIONAL'),('ORDER_COMPLETED','REQUIRED_OPERATIONAL'),
      ('PAYMENT_VERIFIED','REQUIRED_OPERATIONAL'),('ORDER_DISPATCHED','REQUIRED_OPERATIONAL'),
      ('DELIVERY_COMPLETED','REQUIRED_OPERATIONAL'),('DELIVERY_ATTEMPT_FAILED','OPTIONAL'),
      ('DELIVERY_FAILED','REQUIRED_OPERATIONAL'),('DELIVERY_RTO_INITIATED','REQUIRED_OPERATIONAL'),
      ('RETURN_AUTHORIZED','REQUIRED_OPERATIONAL'),('RETURN_REJECTED','REQUIRED_OPERATIONAL'),
      ('RETURN_RECEIVED','REQUIRED_OPERATIONAL'),('REFUND_COMPLETED','REQUIRED_OPERATIONAL'),
      ('REVIEW_VISIBLE','OPTIONAL'),('REVIEW_REQUEST','OPTIONAL'),('REVIEW_RESPONSE','OPTIONAL')
      on conflict(notification_type) do update set delivery_requirement=excluded.delivery_requirement,updated_at=now();

    insert into notifications.notification_channel_policies(notification_type,channel,enabled,automatic_enabled,manual_allowed,template_key) values
      ('ORDER_PLACED','IN_APP',true,true,true,null),('ORDER_PLACED','EMAIL',true,true,true,'order-received'),('ORDER_PLACED','SMS',true,false,true,'order-received'),
      ('ORDER_CONFIRMED','IN_APP',true,true,true,null),('ORDER_CONFIRMED','EMAIL',true,true,true,'order-confirmed'),('ORDER_CONFIRMED','SMS',true,false,true,'order-confirmed'),
      ('ORDER_CANCELLED','IN_APP',true,true,true,null),('ORDER_CANCELLED','EMAIL',true,true,true,'order-cancelled'),('ORDER_CANCELLED','SMS',true,false,true,'order-cancelled'),
      ('ORDER_COMPLETED','IN_APP',true,true,true,null),('ORDER_COMPLETED','EMAIL',true,true,true,'order-delivered'),
      ('PAYMENT_VERIFIED','IN_APP',true,true,true,null),('PAYMENT_VERIFIED','EMAIL',true,true,true,'payment-confirmed'),('PAYMENT_VERIFIED','SMS',true,false,true,'payment-confirmed'),
      ('ORDER_DISPATCHED','IN_APP',true,true,true,null),('ORDER_DISPATCHED','EMAIL',true,true,true,'order-shipped'),('ORDER_DISPATCHED','SMS',true,false,true,'order-shipped'),
      ('DELIVERY_COMPLETED','IN_APP',true,true,true,null),('DELIVERY_COMPLETED','EMAIL',true,true,true,'order-delivered'),('DELIVERY_COMPLETED','SMS',true,false,true,'order-delivered'),
      ('DELIVERY_ATTEMPT_FAILED','IN_APP',true,true,false,null),('DELIVERY_FAILED','IN_APP',true,true,false,null),('DELIVERY_RTO_INITIATED','IN_APP',true,true,false,null),
      ('RETURN_AUTHORIZED','IN_APP',true,true,false,null),('RETURN_REJECTED','IN_APP',true,true,false,null),('RETURN_RECEIVED','IN_APP',true,true,false,null),
      ('REFUND_COMPLETED','IN_APP',true,true,true,null),('REFUND_COMPLETED','EMAIL',true,true,true,'refund-completed'),('REFUND_COMPLETED','SMS',true,false,true,'refund-completed'),
      ('REVIEW_VISIBLE','IN_APP',true,true,false,null),
      ('REVIEW_REQUEST','IN_APP',true,true,false,null),('REVIEW_REQUEST','EMAIL',true,true,true,'review-request'),('REVIEW_REQUEST','SMS',true,false,true,'review-request'),
      ('REVIEW_RESPONSE','IN_APP',true,true,false,null),('REVIEW_RESPONSE','EMAIL',true,true,true,'review-response'),('REVIEW_RESPONSE','SMS',true,false,true,'review-response')
      on conflict(notification_type,channel) do update set enabled=excluded.enabled,automatic_enabled=excluded.automatic_enabled,manual_allowed=excluded.manual_allowed,template_key=excluded.template_key,updated_at=now();
  `.execute(db);
}

export async function down(): Promise<void> {
  throw new Error('Notification and integration operational history is append-only.');
}
