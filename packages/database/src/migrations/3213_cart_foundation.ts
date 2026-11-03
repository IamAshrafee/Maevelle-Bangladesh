import { sql, type Kysely } from 'kysely';
import type { DatabaseSchema } from '../index.js';

/** Expand only. Legacy tokens, CartView, statuses and monetary storage survive. */
export async function up(db: Kysely<DatabaseSchema>): Promise<void> {
  await sql`
    alter table cart.carts
      add column owner_context uuid not null default uuidv7(),
      add column owner_account_id uuid,
      add constraint cart_scoped_identity unique (organization_id, id),
      add constraint cart_account_owner_fk foreign key (organization_id, owner_account_id)
        references customers.customer_accounts(organization_id, id),
      add constraint cart_revision_positive check (version > 0) not valid;
    create unique index cart_active_account_owner
      on cart.carts (organization_id, owner_account_id, currency_code)
      where owner_account_id is not null and status='ACTIVE';
    alter table cart.cart_lines
      add constraint cart_line_scoped_cart_fk foreign key (organization_id, cart_id)
        references cart.carts(organization_id, id) on delete cascade not valid,
      add constraint cart_line_scoped_variant_fk foreign key (organization_id, variant_id)
        references catalog.product_variants(organization_id, id) not valid;
    alter table cart.carts add constraint cart_owner_context_unique unique(owner_context);
    alter table promotions.coupon_codes add constraint coupon_codes_scoped_id unique(organization_id,id);
    alter table cart.cart_coupons add column organization_id uuid;
    -- Backfill only tenant metadata provable from the referenced Cart, 500 rows at a time.
    do $$ declare changed integer; total bigint:=0; begin loop
      with batch as (select cart_id,coupon_code_id from cart.cart_coupons where organization_id is null limit 500)
      update cart.cart_coupons link set organization_id=owner.organization_id
      from batch,cart.carts owner where link.cart_id=batch.cart_id and link.coupon_code_id=batch.coupon_code_id
        and owner.id=link.cart_id;
      get diagnostics changed=row_count; total:=total+changed;
      exit when changed=0;
    end loop; raise notice 'Cart coupon scope backfill: % rows',total; end $$;
    alter table cart.cart_coupons alter column organization_id set not null;
    alter table cart.cart_coupons
      add constraint cart_coupon_scoped_cart_fk foreign key(organization_id,cart_id)
        references cart.carts(organization_id,id) on delete cascade,
      add constraint cart_coupon_scoped_coupon_fk foreign key(organization_id,coupon_code_id)
        references promotions.coupon_codes(organization_id,id);
    create index cart_coupon_scope_fk on cart.cart_coupons(organization_id,coupon_code_id);
    -- Preserve old insert shapes while making the tenant constraint authoritative.
    create function cart.fill_coupon_scope() returns trigger language plpgsql as $$ begin
      if new.organization_id is null then
        select organization_id into new.organization_id from cart.carts where id=new.cart_id;
      end if;
      return new;
    end $$;
    create trigger cart_coupon_scope before insert or update on cart.cart_coupons
      for each row execute function cart.fill_coupon_scope();
    create index cart_lines_variant_fk on cart.cart_lines(organization_id, variant_id);
    create index cart_account_owner_fk on cart.carts(organization_id, owner_account_id);
    -- Existing rows are checked rather than rewritten/truncated or ownership-guessed.
    alter table cart.carts validate constraint cart_revision_positive;
    alter table cart.cart_lines validate constraint cart_line_scoped_cart_fk;
    alter table cart.cart_lines validate constraint cart_line_scoped_variant_fk;
    create index cart_receipt_expiry on platform.idempotency_records(expires_at, id)
      where principal_type='GUEST_CART' and operation_type like 'cart.foundation.%';
  `.execute(db);
}
export async function down(): Promise<void> {
  throw new Error(
    'Cart foundation requires schema-compatible rollback or forward repair; no automatic data removal.',
  );
}
