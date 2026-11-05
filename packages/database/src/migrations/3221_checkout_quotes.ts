import { sql, type Kysely } from 'kysely';
import type { DatabaseSchema } from '../index.js';

export async function up(db: Kysely<DatabaseSchema>): Promise<void> {
  await sql`
    create table orders.checkout_quotes (
      id uuid primary key default uuidv7(),
      organization_id uuid not null,
      draft_id uuid not null,
      draft_revision bigint not null check(draft_revision>0),
      source_kind text not null check(source_kind in ('CART','BUY_NOW')),
      source_cart_id uuid,
      source_revision bigint,
      currency_code text not null check(currency_code ~ '^[A-Z]{3}$'),
      evaluated_at timestamptz not null,
      expires_at timestamptz not null check(expires_at>evaluated_at),
      fingerprint text not null check(length(fingerprint)=43),
      merchandise_subtotal numeric(20,4) not null check(merchandise_subtotal>=0),
      discount_total numeric(20,4) not null check(discount_total between 0 and merchandise_subtotal),
      shipping numeric(20,4) not null check(shipping>=0),
      evaluated_total numeric(20,4) not null,
      -- No tax/fee/payable column: unresolved policies must never default to zero.
      snapshot jsonb not null check(jsonb_typeof(snapshot)='object' and pg_column_size(snapshot)<=131072),
      discounts jsonb not null check(jsonb_typeof(discounts)='array' and jsonb_array_length(discounts)<=100),
      coupons jsonb not null check(jsonb_typeof(coupons)='array' and jsonb_array_length(coupons)<=10),
      previous_quote_id uuid,
      changes text[] not null,
      unique(organization_id,draft_id,id),
      unique(draft_id,draft_revision),
      foreign key(organization_id,draft_id) references orders.checkout_drafts(organization_id,id),
      foreign key(organization_id,draft_id,previous_quote_id) references orders.checkout_quotes(organization_id,draft_id,id),
      foreign key(organization_id,source_cart_id) references cart.carts(organization_id,id),
      check(evaluated_total=merchandise_subtotal-discount_total+shipping),
      check((source_kind='CART' and source_cart_id is not null and source_revision is not null and source_revision>0)
        or (source_kind='BUY_NOW' and source_cart_id is null and source_revision is null))
    );
    create index checkout_quotes_draft on orders.checkout_quotes(organization_id,draft_id,draft_revision desc);
    create index checkout_quotes_source on orders.checkout_quotes(organization_id,source_cart_id);
    create index checkout_quotes_previous on orders.checkout_quotes(organization_id,draft_id,previous_quote_id);
    create table orders.checkout_quote_lines (
      organization_id uuid not null,
      draft_id uuid not null,
      quote_id uuid not null,
      id uuid not null,
      variant_id uuid not null,
      product_id uuid not null,
      title text not null,
      sku text not null,
      quantity integer not null check(quantity between 1 and 99),
      price_definition_id uuid not null references pricing.price_definitions(id),
      unit_price numeric(20,4) not null check(unit_price>=0),
      gross numeric(20,4) not null check(gross=unit_price*quantity),
      discount numeric(20,4) not null check(discount between 0 and gross),
      net numeric(20,4) not null check(net=gross-discount),
      primary key(quote_id,id),
      unique(quote_id,variant_id),
      foreign key(organization_id,draft_id,quote_id) references orders.checkout_quotes(organization_id,draft_id,id),
      foreign key(organization_id,variant_id) references catalog.product_variants(organization_id,id),
      foreign key(organization_id,product_id) references catalog.products(organization_id,id)
    );
    create index checkout_quote_lines_tenant on orders.checkout_quote_lines(organization_id,draft_id,quote_id);
    create index checkout_quote_lines_variant on orders.checkout_quote_lines(organization_id,variant_id);
    create index checkout_quote_lines_product on orders.checkout_quote_lines(organization_id,product_id);
    create index checkout_quote_lines_price on orders.checkout_quote_lines(price_definition_id);
    alter table orders.checkout_drafts add column current_quote_id uuid;
    alter table orders.checkout_drafts add foreign key(organization_id,id,current_quote_id)
      references orders.checkout_quotes(organization_id,draft_id,id);
    create index checkout_draft_current_quote on orders.checkout_drafts(organization_id,id,current_quote_id);
    create table orders.checkout_quote_acknowledgements (
      organization_id uuid not null,
      draft_id uuid not null,
      quote_id uuid primary key,
      acknowledged_at timestamptz not null default clock_timestamp(),
      foreign key(organization_id,draft_id,quote_id) references orders.checkout_quotes(organization_id,draft_id,id)
    );
    create index checkout_quote_ack_draft on orders.checkout_quote_acknowledgements(organization_id,draft_id,quote_id);
    create function orders.checkout_quote_immutable() returns trigger language plpgsql as $$
    begin raise exception 'Checkout evaluated facts are immutable' using errcode='23514'; end $$;
    create trigger immutable_quote before update or delete on orders.checkout_quotes
      for each row execute function orders.checkout_quote_immutable();
    create trigger immutable_quote_line before update or delete on orders.checkout_quote_lines
      for each row execute function orders.checkout_quote_immutable();
    create trigger immutable_quote_ack before update or delete on orders.checkout_quote_acknowledgements
      for each row execute function orders.checkout_quote_immutable();
    create function orders.checkout_quote_line_creation() returns trigger language plpgsql as $$
    begin
      if not exists(select 1 from orders.checkout_quotes q where q.id=new.quote_id
        and q.xmin=pg_current_xact_id()::text::xid) then
        raise exception 'Quote lines must be inserted with their quote' using errcode='23514';
      end if;
      return new;
    end $$;
    create trigger quote_line_creation before insert on orders.checkout_quote_lines
      for each row execute function orders.checkout_quote_line_creation();
    create function orders.checkout_quote_equations() returns trigger language plpgsql as $$
    declare q orders.checkout_quotes; n integer; g numeric; d numeric; a numeric; validation_key text;
    begin
      if tg_table_name='checkout_quotes' then
        select * into q from orders.checkout_quotes where id=new.id;
      else select * into q from orders.checkout_quotes where id=new.quote_id; end if;
      select count(*) into n from orders.checkout_quote_lines where quote_id=q.id;
      -- Deferred row triggers see the final set. Immutable children can only grow in their
      -- creation transaction: validate once per distinct count, including SET CONSTRAINTS.
      validation_key='maevelle.quote_'||replace(q.id::text,'-','');
      if current_setting(validation_key,true)=n::text then return null; end if;
      select coalesce(sum(gross),0),coalesce(sum(discount),0) into g,d
        from orders.checkout_quote_lines where quote_id=q.id;
      select coalesce(sum((v->>'discount')::numeric),0) into a from jsonb_array_elements(q.discounts) v;
      if n not between 1 and 100 or (q.source_kind='BUY_NOW' and n<>1)
        or g<>q.merchandise_subtotal or d<>q.discount_total or a<>d
        or exists(select 1 from orders.checkout_quote_lines l where l.quote_id=q.id and not exists(
          select 1 from pricing.price_definitions p join catalog.product_variants v
            on v.organization_id=p.organization_id and v.id=p.variant_id
          where p.id=l.price_definition_id and p.organization_id=q.organization_id
            and p.variant_id=l.variant_id and p.currency_code=q.currency_code and v.product_id=l.product_id))
        or exists(select 1 from jsonb_array_elements(q.discounts) p
          where (p->>'discount')::numeric < 0 or (p->>'discount')::numeric <>
            (select coalesce(sum((x->>'amount')::numeric),0) from jsonb_array_elements(p->'allocations') x))
        or exists(select 1 from jsonb_array_elements(q.discounts) p,
          jsonb_array_elements(p->'allocations') x where (x->>'amount')::numeric<0
            or not exists(select 1 from orders.checkout_quote_lines l where l.quote_id=q.id and l.id=(x->>'lineId')::uuid))
        or exists(select 1 from orders.checkout_quote_lines l where l.quote_id=q.id and l.discount<>
          (select coalesce(sum((x->>'amount')::numeric),0) from jsonb_array_elements(q.discounts) p,
            jsonb_array_elements(p->'allocations') x where (x->>'lineId')::uuid=l.id))
      then raise exception 'Checkout quote equations failed' using errcode='23514'; end if;
      perform set_config(validation_key,n::text,true);
      return null;
    end $$;
    create constraint trigger quote_equations after insert on orders.checkout_quotes
      deferrable initially deferred for each row execute function orders.checkout_quote_equations();
    create constraint trigger quote_line_equations after insert on orders.checkout_quote_lines
      deferrable initially deferred for each row execute function orders.checkout_quote_equations();
  `.execute(db);
}
export async function down(): Promise<void> {
  throw new Error('Immutable Checkout quotation history requires forward repair.');
}
