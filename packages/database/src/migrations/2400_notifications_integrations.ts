import { sql, type Kysely } from 'kysely';
import type { DatabaseSchema } from '../index.js';

/** Delivery and provider state are append-oriented operational facts, never business truth. */
export async function up(db: Kysely<DatabaseSchema>): Promise<void> {
  await sql`
    create schema if not exists notifications;
    create schema if not exists integrations;

    create table notifications.notification_policies (
      notification_type text primary key,
      delivery_requirement text not null check (delivery_requirement in ('REQUIRED_OPERATIONAL','OPTIONAL')),
      category text not null default 'OPERATIONAL' check (category in ('TRANSACTIONAL','OPERATIONAL','SECURITY','MARKETING','SYSTEM')),
      default_priority text not null default 'NORMAL' check (default_priority in ('LOW','NORMAL','HIGH','CRITICAL')),
      retention_days integer not null default 365 check (retention_days between 1 and 3650),
      contains_sensitive_data boolean not null default false,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    create table notifications.notification_channel_policies (
      notification_type text not null references notifications.notification_policies(notification_type),
      channel text not null check(channel in ('IN_APP','EMAIL','SMS')),
      enabled boolean not null default true,
      automatic_enabled boolean not null default true,
      manual_allowed boolean not null default true,
      template_key text,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      primary key(notification_type,channel)
    );
    create table notifications.organization_policy_overrides (
      organization_id uuid not null references platform.organizations(id),
      notification_type text not null references notifications.notification_policies(notification_type),
      channel text not null check(channel in ('IN_APP','EMAIL','SMS')),
      enabled boolean not null default true,
      automatic_enabled boolean not null default true,
      manual_allowed boolean not null default true,
      updated_by_actor_id uuid references iam.users(id),
      updated_at timestamptz not null default now(),
      primary key (organization_id, notification_type, channel),
      foreign key(notification_type,channel) references notifications.notification_channel_policies(notification_type,channel)
    );
    create table notifications.notification_intents (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      notification_type text not null references notifications.notification_policies(notification_type),
      category text not null check (category in ('TRANSACTIONAL','OPERATIONAL','SECURITY','MARKETING','SYSTEM')),
      priority text not null check (priority in ('LOW','NORMAL','HIGH','CRITICAL')),
      source_event_id uuid references platform.outbox_events(event_id),
      source_domain text not null,
      source_id uuid not null,
      deduplication_key text not null,
      occurred_at timestamptz not null,
      status text not null default 'ACTIVE' check (status in ('ACTIVE','CANCELLED')),
      cancelled_at timestamptz,
      cancellation_reason text,
      created_at timestamptz not null default now(),
      unique (organization_id, id),
      unique (organization_id, deduplication_key),
      unique (source_event_id, notification_type)
    );
    create index notification_intents_source
      on notifications.notification_intents(organization_id,source_domain,source_id,created_at desc);
    create index notification_intents_active_priority
      on notifications.notification_intents(organization_id,priority,created_at desc)
      where status='ACTIVE';
    create table notifications.notification_templates (
      id uuid primary key default uuidv7(), organization_id uuid not null references platform.organizations(id),
      notification_type text not null, channel text not null check(channel in ('IN_APP','EMAIL','SMS')), name text not null,
      status text not null default 'DRAFT' check(status in ('DRAFT','ACTIVE','ARCHIVED')), current_revision_id uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), version bigint not null default 1,
      unique(organization_id, notification_type, channel, name), unique(organization_id,id)
    );
    create table notifications.template_revisions (
      id uuid primary key default uuidv7(), organization_id uuid not null references platform.organizations(id),
      template_id uuid not null references notifications.notification_templates(id), revision_number integer not null,
      subject_template text, body_template text not null, variable_schema jsonb not null default '{}'::jsonb check(jsonb_typeof(variable_schema)='object'),
      status text not null default 'DRAFT' check(status in ('DRAFT','PUBLISHED','SUPERSEDED')), created_at timestamptz not null default now(), published_at timestamptz,
      unique(template_id, revision_number), unique(organization_id,id), foreign key(organization_id,template_id) references notifications.notification_templates(organization_id,id)
    );
    alter table notifications.notification_templates add constraint notification_templates_current_revision_fk foreign key(current_revision_id) references notifications.template_revisions(id);
    create table notifications.preferences (
      id uuid primary key default uuidv7(), organization_id uuid not null references platform.organizations(id), recipient_type text not null check(recipient_type in ('MEMBERSHIP','CUSTOMER')), recipient_id uuid not null,
      notification_type text not null, channel text not null check(channel in ('IN_APP','EMAIL','SMS')), enabled boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
      unique(organization_id,recipient_type,recipient_id,notification_type,channel)
    );
    create table notifications.notifications (
      id uuid primary key default uuidv7(), organization_id uuid not null references platform.organizations(id), notification_type text not null,
      intent_id uuid,
      recipient_type text not null check(recipient_type in ('MEMBERSHIP','CUSTOMER')), customer_id uuid references customers.customers(id), membership_id uuid references iam.organization_memberships(id),
      channel text not null check(channel in ('IN_APP','EMAIL','SMS')), template_revision_id uuid references notifications.template_revisions(id),
      template_key text, template_version integer, rendered_subject text, rendered_body text not null, rendered_html text,
      intended_recipient text, effective_recipient text, sender_from text, reply_to text, provider text, provider_message_id text,
      category text not null default 'OPERATIONAL' check(category in ('TRANSACTIONAL','OPERATIONAL','SECURITY','MARKETING','SYSTEM')),
      priority text not null default 'NORMAL' check(priority in ('LOW','NORMAL','HIGH','CRITICAL')),
      action_path text,
      status text not null check(status in ('NOT_APPLICABLE','SKIPPED_NO_EMAIL','SKIPPED_NO_PHONE','PENDING_MANUAL','QUEUED','PROCESSING','SENT','ACCEPTED','DELIVERED','DELIVERY_DELAYED','FAILED','REJECTED','EXPIRED','UNDELIVERABLE','UNKNOWN_PROVIDER_OUTCOME','BOUNCED','COMPLAINED','SUPPRESSED','READ','CANCELLED')),
      trigger_type text not null default 'AUTOMATIC' check(trigger_type in ('AUTOMATIC','MANUAL','TEST','RESEND')),
      triggered_by_actor_id uuid references iam.users(id), parent_notification_id uuid references notifications.notifications(id),
      idempotency_key text not null default uuidv7()::text, request_fingerprint text, skip_reason text, failure_code text, failure_message text,
      source_event_id uuid references platform.outbox_events(event_id), source_domain text not null, source_id uuid not null,
      scheduled_for timestamptz not null default now(), expires_at timestamptz, cancelled_at timestamptz, cancellation_reason text,
      created_at timestamptz not null default now(), queued_at timestamptz, processing_started_at timestamptz, read_at timestamptz, sent_at timestamptz, delivered_at timestamptz, updated_at timestamptz not null default now(),
      check((recipient_type='CUSTOMER' and customer_id is not null and membership_id is null) or (recipient_type='MEMBERSHIP' and membership_id is not null and customer_id is null)),
      check(expires_at is null or expires_at > created_at),
      unique(organization_id,id), unique(idempotency_key),
      foreign key(organization_id,intent_id) references notifications.notification_intents(organization_id,id)
    );
    create unique index notifications_source_recipient_channel on notifications.notifications(source_event_id,notification_type,recipient_type,coalesce(customer_id,membership_id),channel) where source_event_id is not null;
    create index notifications_inbox on notifications.notifications(organization_id,membership_id,created_at desc) where channel='IN_APP';
    create index notifications_channel_status_created on notifications.notifications(organization_id, channel, status, created_at desc);
    create index notifications_source on notifications.notifications(organization_id, source_id);
    create index notifications_customer on notifications.notifications(organization_id, customer_id, created_at desc);
    create index notifications_provider_message on notifications.notifications(provider, provider_message_id) where provider_message_id is not null;
    create index notifications_intended_recipient on notifications.notifications(organization_id, lower(intended_recipient));
    create index notifications_intent on notifications.notifications(organization_id,intent_id,created_at desc) where intent_id is not null;
    create index notifications_dispatch_ready on notifications.notifications(channel,priority,scheduled_for,created_at)
      where status in ('QUEUED','FAILED');
    create index notifications_inbox_unread on notifications.notifications(organization_id,membership_id,created_at desc)
      where channel='IN_APP' and read_at is null;
    create table notifications.sms_delivery_details (
      notification_id uuid primary key references notifications.notifications(id) on delete cascade,
      organization_id uuid not null references platform.organizations(id),
      original_recipient text,
      normalized_recipient text,
      encoding text not null check(encoding in ('GSM_7','UNICODE')),
      character_count integer not null check(character_count>=0),
      encoding_unit_count integer not null check(encoding_unit_count>=0),
      estimated_segments integer not null check(estimated_segments>=0),
      provider_reported_segments integer check(provider_reported_segments>0),
      provider_reported_cost numeric(20,4) check(provider_reported_cost>=0),
      provider_cost_currency text check(provider_cost_currency is null or provider_cost_currency ~ '^[A-Z]{3}$'),
      sender_type text not null check(sender_type in ('MASKING','NON_MASKING','PROVIDER_DEFAULT')),
      sender_id text,
      reconcile_after timestamptz,
      last_polled_at timestamptz,
      foreign key(organization_id,notification_id) references notifications.notifications(organization_id,id)
    );
    create index sms_delivery_reconciliation on notifications.sms_delivery_details(reconcile_after,notification_id) where reconcile_after is not null;
    create table notifications.delivery_attempts (
      id bigint generated always as identity primary key, organization_id uuid not null references platform.organizations(id), notification_id uuid not null references notifications.notifications(id),
      attempt_number integer not null check(attempt_number>0), provider text not null, provider_message_id text, status text not null check(status in ('PENDING','SENT','ACCEPTED','FAILED','RETRY_WAIT','PERMANENT_FAILURE','UNKNOWN_OUTCOME')),
      started_at timestamptz not null default now(), completed_at timestamptz, next_retry_at timestamptz, error_code text, error_category text, error_metadata jsonb not null default '{}'::jsonb check(jsonb_typeof(error_metadata)='object'), unique(notification_id,attempt_number)
    );
    create table notifications.delivery_events (
      id bigint generated always as identity primary key,
      organization_id uuid not null references platform.organizations(id),
      notification_id uuid not null references notifications.notifications(id),
      event_type text not null,
      event_at timestamptz not null default now(),
      source text not null check(source in ('APPLICATION','PROVIDER','ADMIN')),
      provider_event_id text,
      metadata jsonb not null default '{}'::jsonb check(jsonb_typeof(metadata)='object'),
      unique(provider_event_id)
    );
    create index notification_delivery_events_timeline on notifications.delivery_events(notification_id,event_at,id);
    create table notifications.email_suppressions (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      normalized_email text not null,
      reason text not null check(reason in ('HARD_BOUNCE','COMPLAINT','ADMINISTRATOR','PROVIDER')),
      source text not null,
      provider text,
      active boolean not null default true,
      created_at timestamptz not null default now(),
      cleared_at timestamptz,
      cleared_by_actor_id uuid references iam.users(id),
      clear_reason text,
      unique(organization_id, normalized_email, reason)
    );
    create index email_suppressions_active_lookup on notifications.email_suppressions(organization_id,normalized_email) where active;
    create table notifications.sms_suppressions (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      normalized_phone text not null,
      reason text not null check(reason in ('INVALID_NUMBER','PERMANENT_DELIVERY_FAILURE','CUSTOMER_REQUEST','ADMIN_SUPPRESSION','PROVIDER_BLOCK')),
      source text not null,
      provider text,
      active boolean not null default true,
      created_at timestamptz not null default now(),
      cleared_at timestamptz,
      cleared_by_actor_id uuid references iam.users(id),
      clear_reason text,
      unique(organization_id, normalized_phone, reason)
    );
    create index sms_suppressions_active_lookup on notifications.sms_suppressions(organization_id,normalized_phone) where active;
    create table notifications.sms_provider_events (
      id bigint generated always as identity primary key,
      provider text not null,
      provider_event_id text not null,
      provider_message_id text,
      notification_id uuid references notifications.notifications(id),
      provider_status text not null,
      normalized_status text not null,
      safe_metadata jsonb not null default '{}'::jsonb check(jsonb_typeof(safe_metadata)='object'),
      provider_occurred_at timestamptz,
      received_at timestamptz not null default now(),
      processed_at timestamptz,
      processing_result text,
      unique(provider,provider_event_id)
    );
    create index sms_provider_events_message on notifications.sms_provider_events(provider,provider_message_id,received_at desc);
    create table notifications.provider_events (
      id bigint generated always as identity primary key,
      provider text not null,
      provider_event_id text not null,
      provider_message_id text,
      event_type text not null,
      normalized_type text not null,
      recipient text,
      payload jsonb not null check(jsonb_typeof(payload)='object'),
      provider_occurred_at timestamptz,
      received_at timestamptz not null default now(),
      processed_at timestamptz,
      processing_result text,
      unique(provider, provider_event_id)
    );
    create index provider_events_message_lookup on notifications.provider_events(provider,provider_message_id,received_at desc);

    create table integrations.integrations (
      id uuid primary key default uuidv7(), organization_id uuid not null references platform.organizations(id), provider_code text not null, integration_type text not null, name text not null,
      status text not null default 'DRAFT' check(status in ('DRAFT','ACTIVE','DISABLED')), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), version bigint not null default 1,
      unique(organization_id,provider_code,integration_type), unique(organization_id,id)
    );
    create table integrations.integration_accounts (
      id uuid primary key default uuidv7(), organization_id uuid not null references platform.organizations(id), integration_id uuid not null references integrations.integrations(id), external_account_id text, name text not null,
      status text not null default 'ACTIVE' check(status in ('ACTIVE','DISABLED')), non_secret_config jsonb not null default '{}'::jsonb check(jsonb_typeof(non_secret_config)='object'), secret_reference text,
      created_at timestamptz not null default now(), updated_at timestamptz not null default now(), version bigint not null default 1,
      unique(organization_id,id), foreign key(organization_id,integration_id) references integrations.integrations(organization_id,id)
    );
    create table integrations.provider_credentials (
      integration_account_id uuid primary key references integrations.integration_accounts(id) on delete restrict,
      organization_id uuid not null references platform.organizations(id),
      secret_ciphertext text not null,
      secret_key_id text not null,
      credential_version bigint not null default 1,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      foreign key(organization_id,integration_account_id) references integrations.integration_accounts(organization_id,id)
    );
    create table integrations.oauth_token_states (
      integration_account_id uuid primary key references integrations.integration_accounts(id) on delete restrict,
      organization_id uuid not null references platform.organizations(id),
      access_token_ciphertext text not null,
      refresh_token_ciphertext text,
      secret_key_id text not null,
      token_type text not null default 'Bearer',
      expires_at timestamptz not null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      version bigint not null default 1,
      foreign key(organization_id,integration_account_id) references integrations.integration_accounts(organization_id,id)
    ) with (fillfactor=90);
    create index oauth_token_states_expiry on integrations.oauth_token_states(expires_at,integration_account_id);
    create table integrations.courier_provider_stores (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      integration_account_id uuid not null references integrations.integration_accounts(id),
      provider_code text not null,
      external_store_id text not null,
      name text not null,
      contact_name text,
      contact_phone text,
      address text,
      external_city_id text,
      external_zone_id text,
      external_area_id text,
      is_active boolean not null default true,
      is_default boolean not null default false,
      is_default_return boolean not null default false,
      provider_metadata jsonb not null default '{}'::jsonb check(jsonb_typeof(provider_metadata)='object'),
      last_synced_at timestamptz not null default now(),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique(integration_account_id,external_store_id),
      unique(organization_id,id),
      foreign key(organization_id,integration_account_id) references integrations.integration_accounts(organization_id,id)
    );
    create unique index courier_provider_stores_one_default
      on integrations.courier_provider_stores(integration_account_id) where is_default and is_active;
    create index courier_provider_stores_account
      on integrations.courier_provider_stores(organization_id,integration_account_id,is_active,name);
    create table integrations.courier_pickup_store_mappings (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      integration_account_id uuid not null references integrations.integration_accounts(id),
      location_id uuid not null references warehouse.locations(id),
      provider_store_id uuid not null references integrations.courier_provider_stores(id),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique(integration_account_id,location_id),
      unique(organization_id,id),
      foreign key(organization_id,integration_account_id) references integrations.integration_accounts(organization_id,id),
      foreign key(organization_id,location_id) references warehouse.locations(organization_id,id),
      foreign key(organization_id,provider_store_id) references integrations.courier_provider_stores(organization_id,id)
    );
    create table integrations.external_entity_mappings (
      id uuid primary key default uuidv7(), organization_id uuid not null references platform.organizations(id), integration_account_id uuid not null references integrations.integration_accounts(id),
      local_entity_type text not null, local_entity_id uuid not null, external_entity_type text not null, external_entity_id text not null, created_at timestamptz not null default now(),
      unique(integration_account_id,external_entity_type,external_entity_id), unique(integration_account_id,local_entity_type,local_entity_id)
    );
    create table integrations.integration_operations (
      id uuid primary key default uuidv7(), organization_id uuid not null references platform.organizations(id), integration_account_id uuid not null references integrations.integration_accounts(id), operation_type text not null, operation_key text not null,
      local_entity_type text not null, local_entity_id uuid not null, request_fingerprint text not null, status text not null default 'PENDING' check(status in ('PENDING','SENT','CONFIRMED_SUCCESS','CONFIRMED_FAILURE','UNKNOWN_OUTCOME','RECONCILIATION_REQUIRED')),
      external_reference text, attempt_count integer not null default 0 check(attempt_count>=0), last_attempt_at timestamptz, reconcile_after timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), version bigint not null default 1,
      unique(integration_account_id,operation_type,operation_key), unique(organization_id,id)
    );
    alter table delivery.courier_bookings
      add column integration_account_id uuid,
      add column integration_operation_id uuid,
      add foreign key (organization_id, integration_account_id) references integrations.integration_accounts(organization_id, id),
      add foreign key (organization_id, integration_operation_id) references integrations.integration_operations(organization_id, id);
    create index courier_bookings_integration_account on delivery.courier_bookings (organization_id, integration_account_id, updated_at desc) where integration_account_id is not null;
    create table delivery.courier_quotes (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      delivery_id uuid not null references delivery.deliveries(id),
      integration_account_id uuid not null references integrations.integration_accounts(id),
      provider_code text not null,
      currency_code text not null check(currency_code ~ '^[A-Z]{3}$'),
      base_amount numeric(20,4),
      discount_amount numeric(20,4),
      cod_fee_amount numeric(20,4),
      additional_charge_amount numeric(20,4),
      final_amount numeric(20,4) not null check(final_amount>=0),
      provider_quote_reference text,
      request_snapshot jsonb not null default '{}'::jsonb check(jsonb_typeof(request_snapshot)='object'),
      provider_metadata jsonb not null default '{}'::jsonb check(jsonb_typeof(provider_metadata)='object'),
      quoted_at timestamptz not null default now(),
      expires_at timestamptz,
      unique(organization_id,id),
      foreign key(organization_id,delivery_id) references delivery.deliveries(organization_id,id),
      foreign key(organization_id,integration_account_id) references integrations.integration_accounts(organization_id,id)
    );
    create index courier_quotes_delivery on delivery.courier_quotes(organization_id,delivery_id,quoted_at desc);
    create table integrations.integration_exceptions (
      id uuid primary key default uuidv7(), organization_id uuid not null references platform.organizations(id), integration_account_id uuid not null references integrations.integration_accounts(id), integration_operation_id uuid references integrations.integration_operations(id),
      exception_type text not null, severity text not null check(severity in ('INFO','WARNING','ERROR','CRITICAL')), status text not null default 'OPEN' check(status in ('OPEN','RESOLVED','IGNORED_WITH_REASON')),
      summary text not null, details jsonb not null default '{}'::jsonb check(jsonb_typeof(details)='object'), created_at timestamptz not null default now(), resolved_at timestamptz, version bigint not null default 1
    );
    create table integrations.inbound_provider_events (
      id uuid primary key default uuidv7(), organization_id uuid not null references platform.organizations(id), integration_account_id uuid not null references integrations.integration_accounts(id), provider_event_id text,
      event_type text not null, provider_status text, payload_hash text not null, raw_payload jsonb not null check(jsonb_typeof(raw_payload)='object'), authentication_status text not null check(authentication_status in ('VERIFIED','FAILED','NOT_APPLICABLE')),
      processing_status text not null default 'PENDING' check(processing_status in ('PENDING','PROCESSED','FAILED','IGNORED')), provider_occurred_at timestamptz, received_at timestamptz not null default now(), processed_at timestamptz,
      unique(integration_account_id,provider_event_id), unique(integration_account_id,payload_hash)
    );
    create table integrations.webhook_endpoints (
      id uuid primary key default uuidv7(), organization_id uuid not null references platform.organizations(id), name text not null, endpoint_url text not null, status text not null default 'ACTIVE' check(status in ('ACTIVE','PAUSED','DISABLED','FAILING')),
      secret_ciphertext text not null, secret_key_id text not null, api_version integer not null default 1, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), version bigint not null default 1,
      unique(organization_id,name), unique(organization_id,id)
    );
    create table integrations.webhook_subscriptions (webhook_endpoint_id uuid not null references integrations.webhook_endpoints(id), event_type text not null, event_version integer not null default 1, primary key(webhook_endpoint_id,event_type,event_version));
    create table integrations.webhook_events (
      id uuid primary key default uuidv7(), event_id uuid not null unique default uuidv7(), organization_id uuid not null references platform.organizations(id), event_type text not null, event_version integer not null,
      resource_type text not null, resource_id uuid not null, resource_version bigint, payload jsonb not null check(jsonb_typeof(payload)='object'), occurred_at timestamptz not null, created_at timestamptz not null default now(), unique(organization_id,id)
    );
    create table integrations.webhook_deliveries (
      id bigint generated always as identity primary key, organization_id uuid not null references platform.organizations(id), webhook_event_id uuid not null references integrations.webhook_events(id), webhook_endpoint_id uuid not null references integrations.webhook_endpoints(id),
      attempt_number integer not null check(attempt_number>0), status text not null check(status in ('PENDING','SENT','FAILED','RETRY_WAIT','PERMANENT_FAILURE')), response_status integer, response_excerpt text, started_at timestamptz not null default now(), completed_at timestamptz, next_retry_at timestamptz, failure_code text,
      unique(webhook_event_id,webhook_endpoint_id,attempt_number)
    );
    create index integration_operations_health on integrations.integration_operations(organization_id,status,updated_at desc);
    create index inbound_provider_events_backlog on integrations.inbound_provider_events(organization_id,processing_status,received_at);
    create index webhook_deliveries_retry on integrations.webhook_deliveries(status,next_retry_at) where status in ('PENDING','RETRY_WAIT');

    insert into iam.capability_definitions(capability_code,domain,description,sensitivity) values
      ('notifications.view','notifications','View organization notification inbox and delivery state.','INTERNAL'),
      ('notifications.manage','notifications','Manage notification templates and preferences.','HIGH'),
      ('notifications.send','notifications','Send and resend eligible transactional notifications.','HIGH'),
      ('notifications.retry','notifications','Retry failed transactional notification delivery.','HIGH'),
      ('notifications.suppressions.manage','notifications','Manage transactional email suppressions.','HIGH'),
      ('notifications.sms.view','notifications','View transactional SMS activity and diagnostics.','INTERNAL'),
      ('notifications.sms.preview','notifications','Preview transactional SMS templates.','INTERNAL'),
      ('notifications.sms.test_send','notifications','Send protected transactional SMS tests.','HIGH'),
      ('notifications.sms.manual_send','notifications','Manually send eligible transactional SMS.','HIGH'),
      ('notifications.sms.retry','notifications','Retry confirmed failed transactional SMS delivery.','HIGH'),
      ('notifications.sms.resend','notifications','Create an intentional audited transactional SMS resend.','HIGH'),
      ('notifications.sms.configure_policy','notifications','Configure transactional SMS channel policies.','HIGH'),
      ('notifications.sms.suppression.view','notifications','View transactional SMS suppressions.','INTERNAL'),
      ('notifications.sms.suppression.manage','notifications','Manage transactional SMS suppressions.','HIGH'),
      ('notifications.sms.diagnostics','notifications','View SMS provider and worker diagnostics.','INTERNAL'),
      ('integrations.view','integrations','View integration health and reconciliation state.','INTERNAL'),
      ('integrations.manage','integrations','Manage integration accounts and reconciliation.','HIGH'),
      ('webhooks.manage','integrations','Manage signed outbound webhook endpoints.','HIGH') on conflict(capability_code) do nothing;
    insert into iam.membership_capability_grants(membership_id,capability_code)
      select m.id,c.capability_code from iam.organization_memberships m cross join(values('notifications.view'),('notifications.manage'),('notifications.send'),('notifications.retry'),('notifications.suppressions.manage'),
        ('notifications.sms.view'),('notifications.sms.preview'),('notifications.sms.test_send'),('notifications.sms.manual_send'),('notifications.sms.retry'),('notifications.sms.resend'),('notifications.sms.configure_policy'),('notifications.sms.suppression.view'),('notifications.sms.suppression.manage'),('notifications.sms.diagnostics'),
        ('integrations.view'),('integrations.manage'),('webhooks.manage')) c(capability_code)
      where m.membership_type='OWNER' and m.status='ACTIVE' on conflict do nothing;
  `.execute(db);
}
export async function down(): Promise<void> {
  throw new Error('Notification and integration history is append-only.');
}
