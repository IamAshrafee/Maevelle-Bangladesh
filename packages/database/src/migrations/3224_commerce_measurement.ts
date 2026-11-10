import { sql, type Kysely } from 'kysely';
import type { DatabaseSchema } from '../index.js';

export async function up(db: Kysely<DatabaseSchema>): Promise<void> {
  await sql`
    create table analytics.commerce_reporting_scopes (
      organization_id uuid primary key references platform.organizations(id),
      traffic_class text not null check(traffic_class in ('SYNTHETIC','BUSINESS'))
    );
    create table analytics.commerce_events (
      id uuid primary key default uuidv7(),
      organization_id uuid not null references platform.organizations(id),
      outbox_event_id bigint not null references platform.outbox_events(id),
      event_name text not null check(event_name in ('ORDER_COMMITTED','PAYMENT_CLAIM_SUBMITTED',
        'CLAIM_REJECTED','CLAIM_CORRECTION_REQUESTED','PAYMENT_VERIFIED','OBLIGATION_SATISFIED',
        'COD_COLLECTED','ORDER_CANCELLED','REFUND_COMPLETED','PAYMENT_REVERSED')),
      schema_version integer not null default 1 check(schema_version=1),
      business_id uuid not null,
      occurred_at timestamptz not null,
      traffic_class text not null check(traffic_class in ('UNCLASSIFIED','SYNTHETIC','BUSINESS')),
      currency text check(currency ~ '^[A-Z]{3}$'),
      amount numeric(24,4) check(amount>=0),
      allocated_amount numeric(24,4) check(allocated_amount>=0 and allocated_amount<=amount),
      check((amount is null)=(currency is null)),
      unique(organization_id,event_name,schema_version,business_id),
      unique(organization_id,id)
    );
    create index commerce_events_period on analytics.commerce_events(organization_id,traffic_class,occurred_at,event_name);
    create index commerce_events_outbox on analytics.commerce_events(outbox_event_id);
    create table analytics.commerce_operations (
      organization_id uuid not null references platform.organizations(id),
      day date not null,
      traffic_class text not null check(traffic_class in ('BUSINESS','SYNTHETIC','UNCLASSIFIED')),
      operation text not null check(operation in ('QUOTE','FINAL_TERMS','PLACEMENT','PAYMENT_READ','CLAIM_SUBMIT')),
      outcome text not null check(outcome in ('SUCCESS','REVIEW_REQUIRED','POLICY_BLOCKED','SOURCE_CONFLICT','PAYMENT_METHOD_UNAVAILABLE','RATE_LIMITED','CLIENT_ERROR','SERVER_ERROR')),
      count bigint not null check(count>0),
      duration_ms bigint not null check(duration_ms>=0),
      max_duration_ms bigint not null check(max_duration_ms>=0),
      primary key(organization_id,day,traffic_class,operation,outcome)
    );
    create index commerce_operations_retention on analytics.commerce_operations(day);
    create table analytics.commerce_consent (
      organization_id uuid not null references platform.organizations(id),
      subject_id uuid not null,
      scope text not null check(scope in ('SESSION','ACCOUNT')),
      purpose text not null check(purpose in ('ANALYTICS','ADVERTISING')),
      decision text not null check(decision in ('GRANTED','DENIED','UNKNOWN')),
      policy_version text not null check(length(policy_version) between 1 and 64),
      revision bigint not null check(revision>0),
      changed_at timestamptz not null default clock_timestamp(),
      expires_at timestamptz not null,
      check(expires_at>changed_at and expires_at<=changed_at+interval '180 days'),
      primary key(organization_id,subject_id,scope,purpose)
    );
    create table analytics.commerce_deliveries (
      organization_id uuid not null,
      event_id uuid not null,
      destination text not null check(destination='TEST'),
      policy_version text not null check(policy_version='test-v1'),
      subject_id uuid not null,
      scope text not null,
      purpose text not null,
      consent_revision bigint not null,
      status text not null default 'PENDING' check(status in ('PENDING','RETRY_WAIT','COMPLETED','SUPPRESSED','DEAD_LETTER')),
      attempt_count integer not null default 0 check(attempt_count between 0 and 5),
      next_attempt_at timestamptz not null default clock_timestamp(),
      error_code text check(error_code in ('TIMEOUT','RATE_LIMIT','INVALID_PAYLOAD','DISABLED','CONSENT','EXPIRED')),
      expires_at timestamptz not null default clock_timestamp()+interval '1 day',
      primary key(organization_id,event_id,destination),
      foreign key(organization_id,event_id) references analytics.commerce_events(organization_id,id),
      foreign key(organization_id,subject_id,scope,purpose) references analytics.commerce_consent(organization_id,subject_id,scope,purpose)
    );
    create index commerce_deliveries_pending on analytics.commerce_deliveries(next_attempt_at)
      where status in ('PENDING','RETRY_WAIT');
    create index commerce_deliveries_retention on analytics.commerce_deliveries(expires_at);
    create index commerce_deliveries_subject on analytics.commerce_deliveries(organization_id,subject_id,scope,purpose);
    create index commerce_consent_retention on analytics.commerce_consent(expires_at);
    create index commerce_receipts_pending on platform.event_consumer_receipts(outbox_event_id)
      where consumer_name='analytics.commerce.v1' and status in ('PENDING','RETRY_WAIT');
    create function analytics.enqueue_commerce_measurement() returns trigger language plpgsql as $$
    begin
      if new.organization_id is not null and new.event_type in (
        'orders.order.placed','orders.order.cancelled','payments.payment_attempt.submitted',
        'payments.payment_attempt.rejected','payments.claim.reviewed','payments.payment.verified',
        'payments.cod_collection.recorded','payments.refund.completed','payments.payment.reversed') then
        insert into platform.event_consumer_receipts(outbox_event_id,consumer_name,status)
          values(new.id,'analytics.commerce.v1','PENDING') on conflict do nothing;
      end if;
      return new;
    end $$;
    create trigger enqueue_commerce_measurement after insert on platform.outbox_events
      for each row execute function analytics.enqueue_commerce_measurement();
  `.execute(db);
  // Historical events are intentionally not exported or inferred as new activity.
}

export async function down(): Promise<void> {
  throw new Error('Commerce measurement requires forward repair.');
}
