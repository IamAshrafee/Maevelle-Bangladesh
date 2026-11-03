import { sql, type Kysely } from 'kysely';
import type { DatabaseSchema } from '../index.js';

export async function up(db: Kysely<DatabaseSchema>): Promise<void> {
  await sql`
    alter table analytics.storefront_events drop constraint storefront_events_event_name_check;
    alter table analytics.storefront_events add constraint storefront_events_event_name_check check(
      event_name in ('PRODUCT_VIEWED','PRODUCT_LIST_VIEWED','PRODUCT_SELECTED','VARIANT_SELECTED','SIZE_GUIDE_OPENED',
      'ADD_TO_CART','REMOVE_FROM_CART','VIEW_CART','BEGIN_CHECKOUT','ADD_SHIPPING_INFO','ADD_PAYMENT_INFO','ORDER_PLACED',
      'PAYMENT_CONFIRMED','ORDER_DELIVERED','ORDER_CANCELLED','REFUND_COMPLETED','WISHLIST_PAGE_VIEWED','WISHLIST_SHARE_OPENED','WISHLIST_SCOPE_SELECTED','WISHLIST_COPY_ATTEMPTED','WISHLIST_COPY_SUCCEEDED','WISHLIST_NATIVE_SHARE_INVOKED','WISHLIST_WHATSAPP_SELECTED','WISHLIST_RECIPIENT_VIEWED','WISHLIST_PRODUCT_OPENED','WISHLIST_SAVE_ONE_INITIATED','WISHLIST_SAVE_ALL_INITIATED','WISHLIST_GUEST_SAVE_OBSERVED','WISHLIST_GUEST_REMOVE_OBSERVED',
      'CART_VIEWED','CART_COMMAND_INITIATED','CART_COMMAND_REJECTED','CART_RECOVERY_VIEWED'));
  `.execute(db);
}

export async function down(): Promise<void> {
  throw new Error('Cart observations require forward repair.');
}
