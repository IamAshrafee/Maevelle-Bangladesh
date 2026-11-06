import { sql, type Kysely } from 'kysely';
import type { DatabaseSchema } from '../index.js';

export async function up(db: Kysely<DatabaseSchema>): Promise<void> {
  await sql`
    alter table orders.checkout_drafts drop constraint checkout_drafts_status_check,
      add constraint checkout_drafts_status_check
        check (status in ('ACTIVE','ABANDONED','EXPIRED','COMMITTED'));
    alter table orders.orders add column checkout_draft_id uuid,
      add foreign key(organization_id,checkout_draft_id) references orders.checkout_drafts(organization_id,id),
      add unique(organization_id,checkout_draft_id,id),
      add check(checkout_draft_id is null or (checkout_session_id is null and source='STOREFRONT'));
    create unique index one_order_per_checkout_draft on orders.orders(checkout_draft_id)
      where checkout_draft_id is not null;
    alter table payments.payment_intents add unique(organization_id,order_id,id);

    create table orders.checkout_placements (
      organization_id uuid not null,
      draft_id uuid primary key,
      quote_id uuid not null,
      order_id uuid not null unique,
      intent_id uuid not null unique,
      final_terms jsonb not null check(jsonb_typeof(final_terms)='object' and pg_column_size(final_terms)<=8192),
      delivery_instructions text,
      guest_grant_hash text unique check(length(guest_grant_hash)=43),
      guest_grant_expires_at timestamptz,
      created_at timestamptz not null default clock_timestamp(),
      check ((guest_grant_hash is null)=(guest_grant_expires_at is null)),
      foreign key(organization_id,draft_id,quote_id) references orders.checkout_quotes(organization_id,draft_id,id),
      foreign key(organization_id,draft_id,order_id) references orders.orders(organization_id,checkout_draft_id,id),
      foreign key(organization_id,order_id,intent_id) references payments.payment_intents(organization_id,order_id,id)
    );
    create trigger immutable_checkout_placement before update or delete on orders.checkout_placements
      for each row execute function orders.checkout_quote_immutable();
    create function orders.guard_committed_checkout_draft() returns trigger language plpgsql as $$
    begin
      if old.status='COMMITTED' then
        raise exception 'Committed Checkout ownership is immutable' using errcode='23514';
      end if;
      if tg_op='DELETE' then return old; end if;
      if new.status='COMMITTED' and not exists (
        select 1 from orders.checkout_placements p where p.organization_id=new.organization_id
          and p.draft_id=new.id and p.quote_id=new.current_quote_id
      ) then
        raise exception 'Committed Checkout requires its Order binding' using errcode='23514';
      end if;
      return new;
    end $$;
    create trigger guard_committed_checkout_draft before update or delete on orders.checkout_drafts
      for each row execute function orders.guard_committed_checkout_draft();
    create index checkout_review_receipts on platform.idempotency_records(organization_id,result_entity_id)
      where operation_type='checkout.foundation.placement.v1' and result_entity_type='checkout.review';
  `.execute(db);
}

export async function down(): Promise<void> {
  throw new Error('Committed Checkout history requires forward repair.');
}
