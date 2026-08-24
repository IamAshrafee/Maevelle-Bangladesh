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

    insert into notifications.notification_policies(notification_type,delivery_requirement,channels) values
      ('ORDER_PLACED','REQUIRED_OPERATIONAL',array['IN_APP','EMAIL']),
      ('ORDER_CANCELLED','OPTIONAL',array['IN_APP','EMAIL']),
      ('PAYMENT_VERIFIED','REQUIRED_OPERATIONAL',array['IN_APP','EMAIL']),
      ('ORDER_DISPATCHED','REQUIRED_OPERATIONAL',array['IN_APP','EMAIL']),
      ('DELIVERY_COMPLETED','REQUIRED_OPERATIONAL',array['IN_APP','EMAIL']),
      ('REFUND_COMPLETED','REQUIRED_OPERATIONAL',array['IN_APP','EMAIL']),
      ('REVIEW_VISIBLE','OPTIONAL',array['IN_APP','EMAIL'])
      on conflict(notification_type) do update set delivery_requirement=excluded.delivery_requirement,channels=excluded.channels,updated_at=now();
  `.execute(db);
}

export async function down(): Promise<void> {
  throw new Error('Notification and integration operational history is append-only.');
}
