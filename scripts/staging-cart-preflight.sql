-- Preflight for the 3206 -> 3218 staging cutover. Report counts only.
\set ON_ERROR_STOP on
begin read only;
set local lock_timeout = '2s';
set local statement_timeout = '30s';

do $$
begin
  if current_database() <> 'maevelle_staging'
    or current_setting('server_version_num')::integer not between 180000 and 189999
    or (select count(*) from public.kysely_migration) <> 55
    or (select max(name) from public.kysely_migration) <> '3206_media_rendition_repair'
  then
    raise exception 'Expected PostgreSQL 18 and the 55-entry Maevelle staging baseline';
  end if;
end
$$;

select 'unexpected_wishlist_schema' as check_name, count(*) as violations
from pg_namespace where nspname = 'wishlist'
union all
select 'unexpected_recommendations_schema', count(*)
from pg_namespace where nspname = 'recommendations'
union all
select 'cart_credentials_or_revision', count(*)
from cart.carts where public_token_hash !~ '^[A-Za-z0-9_-]{43}$' or version <= 0
union all
select 'cart_customer_scope', count(*)
from cart.carts c
where c.customer_id is not null and not exists (
  select 1 from customers.customers u
  where u.id = c.customer_id and u.organization_id = c.organization_id
)
union all
select 'cart_line_cart_scope', count(*)
from cart.cart_lines l where not exists (
  select 1 from cart.carts c
  where c.id = l.cart_id and c.organization_id = l.organization_id
)
union all
select 'cart_line_variant_scope', count(*)
from cart.cart_lines l where not exists (
  select 1 from catalog.product_variants v
  where v.id = l.variant_id and v.organization_id = l.organization_id
)
union all
select 'cart_line_quantity_revision_or_price', count(*)
from cart.cart_lines
where quantity not between 1 and 99 or quantity <> trunc(quantity)
   or version <= 0 or last_seen_unit_price < 0 or last_seen_unit_price = 'NaN'::numeric
union all
select 'cart_coupon_scope', count(*)
from cart.cart_coupons l
where not exists (
  select 1 from cart.carts c
  join promotions.coupon_codes p on p.organization_id = c.organization_id
  where c.id = l.cart_id and p.id = l.coupon_code_id
)
union all
select 'storefront_event_constraint_missing_or_unvalidated', (not exists (
  select 1 from pg_constraint
  where conrelid = 'analytics.storefront_events'::regclass
    and conname = 'storefront_events_event_name_check' and contype = 'c' and convalidated
))::integer
union all
select 'storefront_event_outside_baseline_allowlist', count(*)
from analytics.storefront_events
where event_name not in (
  'PRODUCT_VIEWED', 'PRODUCT_LIST_VIEWED', 'PRODUCT_SELECTED', 'VARIANT_SELECTED',
  'SIZE_GUIDE_OPENED', 'ADD_TO_CART', 'REMOVE_FROM_CART', 'VIEW_CART', 'BEGIN_CHECKOUT',
  'ADD_SHIPPING_INFO', 'ADD_PAYMENT_INFO', 'ORDER_PLACED', 'PAYMENT_CONFIRMED',
  'ORDER_DELIVERED', 'ORDER_CANCELLED', 'REFUND_COMPLETED'
)
order by check_name;
rollback;
