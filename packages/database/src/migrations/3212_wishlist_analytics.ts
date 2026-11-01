import { sql, type Kysely } from 'kysely';
import type { DatabaseSchema } from '../index.js';

/** Additive. No historical activity or creation scope is inferred. */
export async function up(db: Kysely<DatabaseSchema>): Promise<void> {
  await sql`
    create table analytics.wishlist_instrumentation (
      singleton boolean primary key default true check(singleton), started_at timestamptz not null default now()
    );
    insert into analytics.wishlist_instrumentation default values;
    alter table wishlist.shares add column creation_scope text not null default 'UNKNOWN'
      check(creation_scope in ('ALL','SELECTED','UNKNOWN')),
      add column expiration_reported_at timestamptz;
    create index wishlist_expiration_pending on wishlist.shares(expires_at,id)
      where expiration_reported_at is null;
    create index wishlist_interest_product on wishlist.account_items(organization_id,product_id);
    create index wishlist_outbox_pending on platform.outbox_events(id)
      where aggregate_type='wishlist.analytics';
    create table analytics.wishlist_outcomes (
      organization_id uuid not null references platform.organizations(id),
      outbox_event_id bigint primary key references platform.outbox_events(id),
      schema_version integer not null check(schema_version=1),
      event_name text not null check(event_name in ('wishlist.item.saved','wishlist.item.removed','wishlist.merge.completed','wishlist.share.created','wishlist.share.claimed','wishlist.share.revoked','wishlist.share.expiry_changed','wishlist.share.link_rotated','wishlist.share.expired')),
      product_id uuid, source text check(source in ('MANUAL','MERGE')),
      origin text check(origin in ('GUEST','ACCOUNT')),
      scope text check(scope in ('ALL','SELECTED','UNKNOWN')),
      snapshot_size integer check(snapshot_size between 1 and 100),
      occurred_at timestamptz not null, processed_at timestamptz not null default now()
    );
    create index wishlist_outcomes_period on analytics.wishlist_outcomes(organization_id,occurred_at,event_name);
    create index wishlist_outcomes_product on analytics.wishlist_outcomes(organization_id,product_id,occurred_at)
      where product_id is not null;
    create index wishlist_outcomes_retention on analytics.wishlist_outcomes(occurred_at);
    create table analytics.wishlist_processing_failures (
      outbox_event_id bigint primary key references platform.outbox_events(id) on delete cascade,
      organization_id uuid not null references platform.organizations(id),
      attempts integer not null check(attempts>0), retry_at timestamptz not null,
      last_failed_at timestamptz not null default now()
    );
    create index wishlist_failures_organization on analytics.wishlist_processing_failures(organization_id);
    create table analytics.wishlist_operations (
      organization_id uuid not null references platform.organizations(id), day date not null,
      operation text not null check(operation in ('SAVE','REMOVE','MERGE','SHARE_CREATE','SHARE_OPEN','SHARE_MANAGE','SHARE_RECOVER','SHARE_ROTATE','SHARE_CLAIM','CLEANUP','PROCESS')),
      outcome text not null check(outcome in ('SUCCESS','CLIENT_ERROR','CONFLICT','RATE_LIMITED','SERVER_ERROR')),
      count bigint not null check(count>=0), duration_ms bigint not null default 0 check(duration_ms>=0),
      primary key(organization_id,day,operation,outcome)
    );
    alter table analytics.storefront_events drop constraint storefront_events_event_name_check;
    alter table analytics.storefront_events add constraint storefront_events_event_name_check check(
      event_name in ('PRODUCT_VIEWED','PRODUCT_LIST_VIEWED','PRODUCT_SELECTED','VARIANT_SELECTED','SIZE_GUIDE_OPENED',
      'ADD_TO_CART','REMOVE_FROM_CART','VIEW_CART','BEGIN_CHECKOUT','ADD_SHIPPING_INFO','ADD_PAYMENT_INFO','ORDER_PLACED',
      'PAYMENT_CONFIRMED','ORDER_DELIVERED','ORDER_CANCELLED','REFUND_COMPLETED','WISHLIST_PAGE_VIEWED','WISHLIST_SHARE_OPENED','WISHLIST_SCOPE_SELECTED','WISHLIST_COPY_ATTEMPTED','WISHLIST_COPY_SUCCEEDED','WISHLIST_NATIVE_SHARE_INVOKED','WISHLIST_WHATSAPP_SELECTED','WISHLIST_RECIPIENT_VIEWED','WISHLIST_PRODUCT_OPENED','WISHLIST_SAVE_ONE_INITIATED','WISHLIST_SAVE_ALL_INITIATED','WISHLIST_GUEST_SAVE_OBSERVED','WISHLIST_GUEST_REMOVE_OBSERVED'));
    create index wishlist_observation_retention on analytics.storefront_events(received_at)
      where event_name like 'WISHLIST_%';
  `.execute(db);
}
export async function down(): Promise<void> {
  throw new Error('Wishlist analytics requires forward repair.');
}
