import { sql, type Kysely } from 'kysely';

import { hashToken } from '@maevelle/security';

import type { DatabaseSchema } from '../index.js';
import { getGuestCart, type CartView } from '../cart.js';
import {
  CustomerDomainError,
  resolveOrCreateOrderCustomerInTransaction,
} from '../customers.js';
import { normalizeCustomerPhone } from '../customer-identities.js';
import {
  createInventoryReservationInTransaction,
  InventoryDomainError,
} from '../inventory.js';
import { claimIdempotencyRecord, IdempotencyKeyReuseError, appendAuditEvent } from '../platform.js';
import { evaluatePromotions } from '../promotions.js';
import { createPaymentIntentForOrder } from '../payments.js';
import {
  decimal4Minor,
  decimal4Text,
  OrderDomainError,
  type PlaceOrderResult,
} from './types.js';
import {
  checkoutFingerprint,
  checkoutInputView,
  checkoutRow,
  checkoutTotals,
} from './checkout.js';
import { resolveDeliveryQuote } from './delivery-pricing.js';
import { orderView } from './queries.js';

export async function nextOrderNumber(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
): Promise<string> {
  const year = new Date().getUTCFullYear();
  await sql`
    insert into platform.number_sequences (organization_id, sequence_type, prefix, counter_value, reset_policy, sequence_year, padding)
    values (${organizationId}, 'ORDER', ${`ORD-${year}-`}, 0, 'YEARLY', ${year}, 6)
    on conflict do nothing
  `.execute(db);
  const sequence = await sql<{ prefix: string; counter_value: string; padding: number }>`
    update platform.number_sequences set counter_value = counter_value + 1, version = version + 1, updated_at = now()
    where organization_id = ${organizationId} and sequence_type = 'ORDER' and sequence_year = ${year}
    returning prefix, counter_value::text, padding
  `.execute(db);
  const row = sequence.rows[0];
  if (!row) throw new Error('Order number sequence was not available.');
  return `${row.prefix}${row.counter_value.padStart(row.padding, '0')}`;
}

async function cartOrderLines(db: Kysely<DatabaseSchema>, cart: CartView) {
  const detail = await sql<{
    line_id: string;
    variant_id: string;
    product_id: string;
    quantity: string;
    sku: string;
    product_title: string;
    image_url: string | null;
    option_snapshot: unknown;
    category_ids: string[];
  }>`
    select line.id as line_id, variant.id as variant_id, product.id as product_id, line.quantity::text, variant.sku, product.title as product_title,
      (select coalesce(asset.public_url, asset.url, asset.storage_key, '/api/media/' || asset.id)::text
       from catalog.product_media media_link
       join media.media_assets asset on asset.id = media_link.asset_id
       where media_link.organization_id = cart_row.organization_id and media_link.product_id = product.id
         and (media_link.variant_id = variant.id or media_link.variant_id is null)
         and asset.status = 'READY' and asset.visibility_class = 'PUBLIC'
       order by (media_link.variant_id = variant.id) desc, media_link.position, media_link.id limit 1) as image_url,
      coalesce(jsonb_agg(jsonb_build_object('name', axis.name, 'value', value.display_value) order by axis.position) filter (where axis.id is not null), '[]'::jsonb) as option_snapshot,
      coalesce(array_agg(category.category_id) filter (where category.category_id is not null), '{}') as category_ids
    from cart.cart_lines line
    join cart.carts cart_row on cart_row.id = line.cart_id
    join catalog.product_variants variant on variant.id = line.variant_id and variant.status = 'ACTIVE'
    join catalog.products product on product.id = variant.product_id and product.status = 'ACTIVE' and product.publication_status = 'PUBLISHED'
    left join catalog.variant_option_values selection on selection.variant_id = variant.id
    left join catalog.product_option_axes axis on axis.id = selection.option_axis_id
    left join catalog.product_option_values value on value.id = selection.option_value_id
    left join catalog.product_categories category on category.product_id = product.id
    where line.cart_id = ${cart.id}
    group by line.id, variant.id, product.id, line.quantity, variant.sku, product.title, cart_row.organization_id
    order by line.id
  `.execute(db);
  if (detail.rows.length !== cart.lines.length || detail.rows.length === 0)
    throw new OrderDomainError(
      'CHECKOUT_CHANGED',
      'One or more Cart items are no longer sellable.',
    );
  return detail.rows;
}

async function promoteUsage(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    customerId: string;
    orderId: string;
    calculations: Awaited<ReturnType<typeof evaluatePromotions>>;
  },
): Promise<void> {
  for (const calculation of input.calculations) {
    if (calculation.couponCodeId) {
      const coupon = await sql<{
        usage_limit_total: string | null;
        usage_limit_per_customer: string | null;
      }>`
        select usage_limit_total::text, usage_limit_per_customer::text from promotions.coupon_codes where id = ${calculation.couponCodeId} for update
      `.execute(db);
      const limit = coupon.rows[0];
      if (!limit) throw new OrderDomainError('CHECKOUT_CHANGED', 'Coupon is no longer available.');
      const counts = await sql<{ total: string; customer: string }>`
        select count(*) filter (where status = 'COMMITTED')::text as total,
          count(*) filter (where status = 'COMMITTED' and customer_id = ${input.customerId})::text as customer
        from promotions.promotion_usage where coupon_code_id = ${calculation.couponCodeId}
      `.execute(db);
      if (
        (limit.usage_limit_total &&
          BigInt(counts.rows[0]!.total) >= BigInt(limit.usage_limit_total)) ||
        (limit.usage_limit_per_customer &&
          BigInt(counts.rows[0]!.customer) >= BigInt(limit.usage_limit_per_customer))
      )
        throw new OrderDomainError('CHECKOUT_CHANGED', 'Coupon is no longer eligible.');
    }
    await sql`
      insert into promotions.promotion_usage (organization_id, promotion_id, promotion_revision_id, coupon_code_id, customer_id, order_id, discount_amount, status)
      values (${input.organizationId}, ${calculation.promotionId}, ${calculation.revisionId}, ${calculation.couponCodeId}, ${input.customerId}, ${input.orderId}, ${calculation.discount}::numeric, 'COMMITTED')
    `.execute(db);
  }
}

export async function placeOrder(
  db: Kysely<DatabaseSchema>,
  input: {
    checkoutToken: string;
    cartToken: string;
    acceptedCalculationVersion: number;
    acceptedCalculationFingerprint: string;
    idempotencyKey: string;
    /** Test-only fault injection. Never populated by application routes. */
    fault?: (stage: 'after-order-header' | 'after-reservation' | 'after-promotion-usage') => void;
  },
): Promise<PlaceOrderResult> {
  return db.transaction().execute(async (transaction) => {
    const checkout = await checkoutRow(transaction, input.checkoutToken, true);
    if (checkout.expires_at <= new Date()) {
      await sql`update orders.checkout_sessions set status = 'EXPIRED', updated_at = now() where id = ${checkout.id}`.execute(
        transaction,
      );
      throw new OrderDomainError('CHECKOUT_EXPIRED', 'Checkout has expired.');
    }
    let recordId: string;
    try {
      const record = await claimIdempotencyRecord(transaction, {
        organizationId: checkout.organization_id,
        principalType: 'GUEST_CHECKOUT',
        principalId: checkout.id,
        operationType: 'checkout.place-order',
        idempotencyKey: input.idempotencyKey,
        requestFingerprint: hashToken(
          JSON.stringify({
            acceptedCalculationVersion: input.acceptedCalculationVersion,
            acceptedCalculationFingerprint: input.acceptedCalculationFingerprint,
          }),
        ),
      });
      if (!record.created) {
        if (record.status === 'SUCCEEDED' && checkout.resulting_order_id)
          return {
            kind: 'PLACED',
            order: await orderView(transaction, checkout.resulting_order_id),
          };
        throw new OrderDomainError(
          'IDEMPOTENCY_CONFLICT',
          'The same PlaceOrder request is already in progress.',
        );
      }
      recordId = record.id;
    } catch (error) {
      if (error instanceof IdempotencyKeyReuseError)
        throw new OrderDomainError(
          'IDEMPOTENCY_CONFLICT',
          'The idempotency key was reused for different order details.',
        );
      throw error;
    }
    if (checkout.status === 'ORDER_PLACED' && checkout.resulting_order_id)
      throw new OrderDomainError(
        'CHECKOUT_COMPLETED',
        'Checkout has already created an Order with a different request.',
      );
    const cart = await getGuestCart(transaction, input.cartToken);
    if (cart.id !== checkout.cart_id)
      throw new OrderDomainError('NOT_FOUND', 'Checkout was not found.');
    if (cart.lines.some((line) => line.availability !== 'AVAILABLE' || !line.unitPrice))
      throw new OrderDomainError('OUT_OF_STOCK', 'One or more items are no longer available.');
    const contact =
      checkout.customer_name && checkout.customer_phone
        ? {
            name: checkout.customer_name,
            phone: checkout.customer_phone,
            ...(checkout.customer_email ? { email: checkout.customer_email } : {}),
          }
        : null;
    const address =
      checkout.recipient_name &&
      checkout.delivery_phone &&
      checkout.address_line_1 &&
      checkout.country_code
        ? {
            recipientName: checkout.recipient_name,
            phone: checkout.delivery_phone,
            addressLine1: checkout.address_line_1,
            ...(checkout.address_line_2 ? { addressLine2: checkout.address_line_2 } : {}),
            ...(checkout.geography_node_id ? { geographyNodeId: checkout.geography_node_id } : {}),
            ...(checkout.area ? { area: checkout.area } : {}),
            ...(checkout.city ? { city: checkout.city } : {}),
            ...(checkout.district ? { district: checkout.district } : {}),
            ...(checkout.postal_code ? { postalCode: checkout.postal_code } : {}),
            countryCode: checkout.country_code,
          }
        : null;
    if (!contact || !address)
      throw new OrderDomainError(
        'VALIDATION_FAILED',
        'Checkout contact and delivery address are required.',
      );
    const quote = await resolveDeliveryQuote(transaction, {
      organizationId: checkout.organization_id,
      currency: cart.currency,
      countryCode: address.countryCode,
      ...(address.geographyNodeId ? { geographyNodeId: address.geographyNodeId } : {}),
    });
    const calculationFingerprint = checkoutFingerprint(cart, quote);
    const changed =
      cart.version !== Number(checkout.cart_version) ||
      checkout.delivery_pricing_rule_id !== quote.ruleId ||
      decimal4Minor(checkout.delivery_amount) !== decimal4Minor(quote.amount) ||
      input.acceptedCalculationVersion !== Number(checkout.calculation_version) ||
      input.acceptedCalculationFingerprint !== calculationFingerprint;
    if (changed) {
      const updated = await sql<{ version: string }>`
        update orders.checkout_sessions set cart_version = ${cart.version}, calculation_version = ${cart.calculationVersion},
          delivery_pricing_rule_id = ${quote.ruleId}, delivery_amount = ${quote.amount}::numeric,
          calculation_fingerprint = ${calculationFingerprint}, calculated_totals = ${JSON.stringify(checkoutTotals(cart, quote))}::jsonb,
          status = 'CHANGED', version = version + 1, updated_at = now()
        where id = ${checkout.id} returning version::text
      `.execute(transaction);
      return {
        kind: 'CHANGED',
        checkout: checkoutInputView(
          {
            ...checkout,
            version: updated.rows[0]!.version,
            status: 'CHANGED',
            calculation_version: String(cart.calculationVersion),
            delivery_pricing_rule_id: quote.ruleId,
            delivery_amount: quote.amount,
            calculation_fingerprint: calculationFingerprint,
          },
          cart,
        ),
      };
    }
    const details = await cartOrderLines(transaction, cart);
    if (cart.lines.some((line) => line.availability !== 'AVAILABLE' || !line.unitPrice))
      throw new OrderDomainError('OUT_OF_STOCK', 'One or more items are no longer available.');
    let customerId: string;
    try {
      customerId = (
        await resolveOrCreateOrderCustomerInTransaction(transaction, {
          organizationId: checkout.organization_id,
          actorId: checkout.id,
          actorType: 'GUEST_CHECKOUT',
          displayName: contact.name,
          phone: contact.phone,
          ...(contact.email ? { email: contact.email } : {}),
          source: 'STOREFRONT',
        })
      ).customerId;
    } catch (error) {
      if (error instanceof CustomerDomainError)
        throw new OrderDomainError(
          error.code === 'CUSTOMER_BLOCKED' ? 'VALIDATION_FAILED' : 'VALIDATION_FAILED',
          error.message,
        );
      throw error;
    }
    const number = await nextOrderNumber(transaction, checkout.organization_id);
    const orderCreated = await sql<{ id: string }>`
      insert into orders.orders (organization_id, order_number, checkout_session_id, customer_id, source, currency_code, order_status, payment_method, subtotal_amount, discount_amount, delivery_amount, total_amount)
      values (${checkout.organization_id}, ${number}, ${checkout.id}, ${customerId}, 'STOREFRONT', ${cart.currency}, 'PENDING', ${checkout.payment_method}, ${cart.merchandiseGross}::numeric, ${cart.discountTotal}::numeric, ${quote.amount}::numeric, ${decimal4Text(decimal4Minor(cart.merchandiseNet) + decimal4Minor(quote.amount))}::numeric) returning id
    `.execute(transaction);
    const orderId = orderCreated.rows[0]?.id;
    if (!orderId) throw new Error('Order creation did not return an id.');
    input.fault?.('after-order-header');
    await sql`insert into orders.order_customer_snapshots (order_id, organization_id, customer_id, display_name, phone, normalized_phone, email) values (${orderId}, ${checkout.organization_id}, ${customerId}, ${contact.name}, ${contact.phone}, ${normalizeCustomerPhone(contact.phone)}, ${contact.email ?? null})`.execute(
      transaction,
    );
    await sql`insert into orders.order_addresses (organization_id, order_id, address_type, geography_node_id, recipient_name, phone, address_line_1, address_line_2, area, city, district, postal_code, country_code) values (${checkout.organization_id}, ${orderId}, 'DELIVERY', ${address.geographyNodeId ?? null}, ${address.recipientName}, ${address.phone}, ${address.addressLine1}, ${address.addressLine2 ?? null}, ${address.area ?? null}, ${address.city ?? null}, ${address.district ?? null}, ${address.postalCode ?? null}, ${address.countryCode})`.execute(
      transaction,
    );
    await sql`insert into orders.order_delivery_pricing_snapshots (order_id, organization_id, delivery_pricing_rule_id, rule_name_snapshot, country_code_snapshot, geography_node_id, amount, currency_code) values (${orderId}, ${checkout.organization_id}, ${quote.ruleId}, ${quote.ruleName}, ${address.countryCode}, ${address.geographyNodeId ?? null}, ${quote.amount}::numeric, ${quote.currency})`.execute(
      transaction,
    );
    const lineByCartId = new Map<string, string>();
    for (const detail of details) {
      const cartLine = cart.lines.find((line) => line.id === detail.line_id)!;
      const created = await sql<{ id: string }>`
        insert into orders.order_lines (organization_id, order_id, product_id, variant_id, quantity, sku_snapshot, product_title_snapshot, image_url_snapshot, option_snapshot, unit_price, gross_amount, discount_amount, net_amount)
        values (${checkout.organization_id}, ${orderId}, ${detail.product_id}, ${detail.variant_id}, ${detail.quantity}::numeric, ${detail.sku}, ${detail.product_title}, ${detail.image_url ?? null}, ${JSON.stringify(detail.option_snapshot)}::jsonb, ${cartLine.unitPrice}::numeric, ${cartLine.gross}::numeric, ${cartLine.discount}::numeric, ${cartLine.net}::numeric) returning id
      `.execute(transaction);
      lineByCartId.set(detail.line_id, created.rows[0]!.id);
      const location = await sql<{ location_id: string }>`
        select level.location_id from inventory.inventory_items item join inventory.inventory_levels level on level.inventory_item_id = item.id
        join warehouse.locations location on location.id = level.location_id and location.status = 'ACTIVE'
        join warehouse.location_capabilities capability on capability.location_id = location.id and capability.organization_id = location.organization_id
          and capability.capability_code = 'STOCK_HOLDING'
        where item.organization_id = ${checkout.organization_id} and item.variant_id = ${detail.variant_id} and item.status = 'ACTIVE'
          and level.sellable_quantity - level.reserved_quantity >= ${detail.quantity}::numeric
        order by level.location_id for update limit 1
      `.execute(transaction);
      if (!location.rows[0])
        throw new OrderDomainError('OUT_OF_STOCK', 'One or more items are no longer available.');
      try {
        const reservation = await createInventoryReservationInTransaction(transaction, {
          organizationId: checkout.organization_id,
          actorId: checkout.id,
          variantId: detail.variant_id,
          locationId: location.rows[0].location_id,
          quantity: detail.quantity,
          sourceType: 'ORDER_LINE',
          sourceReference: created.rows[0]!.id,
          idempotencyKey: `order:${orderId}:${created.rows[0]!.id}`,
        });
        await sql`insert into orders.order_inventory_reservations (organization_id, order_id, order_line_id, reservation_id) values (${checkout.organization_id}, ${orderId}, ${created.rows[0]!.id}, ${reservation.reservationId})`.execute(
          transaction,
        );
        await sql`update orders.order_lines set inventory_item_id = ${reservation.inventoryItemId} where organization_id = ${checkout.organization_id} and id = ${created.rows[0]!.id}`.execute(
          transaction,
        );
        await sql`insert into inventory.inventory_reservation_allocations (organization_id, reservation_id, order_line_id, inventory_item_id, location_id, reserved_quantity) values (${checkout.organization_id}, ${reservation.reservationId}, ${created.rows[0]!.id}, ${reservation.inventoryItemId}, ${location.rows[0].location_id}, ${detail.quantity}::numeric)`.execute(
          transaction,
        );
        input.fault?.('after-reservation');
      } catch (error) {
        if (error instanceof InventoryDomainError && error.code === 'INSUFFICIENT_STOCK')
          throw new OrderDomainError('OUT_OF_STOCK', 'One or more items are no longer available.');
        throw error;
      }
    }
    const calculations = await evaluatePromotions(transaction, {
      organizationId: checkout.organization_id,
      couponCodes: cart.appliedCoupons,
      lines: details.map((line) => ({
        lineId: line.line_id,
        variantId: line.variant_id,
        productId: line.product_id,
        categoryIds: line.category_ids,
        gross: cart.lines.find((cartLine) => cartLine.id === line.line_id)!.gross,
      })),
    });
    await promoteUsage(transaction, {
      organizationId: checkout.organization_id,
      customerId,
      orderId,
      calculations,
    });
    await createPaymentIntentForOrder(transaction, {
      organizationId: checkout.organization_id,
      orderId,
      orderNumber: number,
      paymentMethod: checkout.payment_method,
      currency: cart.currency,
      expectedAmount: decimal4Text(decimal4Minor(cart.merchandiseNet) + decimal4Minor(quote.amount)),
    });
    input.fault?.('after-promotion-usage');
    for (const calculation of calculations) {
      const snapshot = await sql<{
        name: string;
        benefit_type: string;
        benefit_value: string;
        normalized_code: string | null;
      }>`
        select promotion.name, revision.benefit_type, revision.benefit_value::text, coupon.normalized_code from promotions.promotions promotion
        join promotions.promotion_revisions revision on revision.id = ${calculation.revisionId}
        left join promotions.coupon_codes coupon on coupon.id = ${calculation.couponCodeId}
        where promotion.id = ${calculation.promotionId}
      `.execute(transaction);
      const application = await sql<{ id: string }>`
        insert into orders.order_discount_applications (organization_id, order_id, promotion_id, promotion_revision_id, coupon_code_id, promotion_name_snapshot, coupon_code_snapshot, benefit_type_snapshot, benefit_value_snapshot, discount_amount)
        values (${checkout.organization_id}, ${orderId}, ${calculation.promotionId}, ${calculation.revisionId}, ${calculation.couponCodeId}, ${snapshot.rows[0]!.name}, ${snapshot.rows[0]!.normalized_code}, ${snapshot.rows[0]!.benefit_type}, ${snapshot.rows[0]!.benefit_value}::numeric, ${calculation.discount}::numeric) returning id
      `.execute(transaction);
      for (const allocation of calculation.allocations)
        await sql`insert into orders.order_discount_allocations (organization_id, discount_application_id, order_line_id, discount_amount) values (${checkout.organization_id}, ${application.rows[0]!.id}, ${lineByCartId.get(allocation.lineId)}, ${allocation.amount}::numeric)`.execute(
          transaction,
        );
    }
    await sql`update cart.carts set status = 'CONVERTED', customer_id = ${customerId}, version = version + 1, updated_at = now() where id = ${cart.id}`.execute(
      transaction,
    );
    await sql`update orders.checkout_sessions set customer_id = ${customerId}, resulting_order_id = ${orderId}, status = 'ORDER_PLACED', version = version + 1, updated_at = now() where id = ${checkout.id}`.execute(
      transaction,
    );
    await sql`update platform.idempotency_records set status = 'SUCCEEDED', result_entity_type = 'orders.order', result_entity_id = ${orderId}::uuid, safe_response = ${JSON.stringify({ orderId, orderNumber: number })}::jsonb, completed_at = now() where id = ${recordId}`.execute(
      transaction,
    );
    await appendAuditEvent(transaction, {
      organizationId: checkout.organization_id,
      actorType: 'GUEST_CHECKOUT',
      actorId: checkout.id,
      action: 'orders.order.placed',
      targetType: 'orders.order',
      targetId: orderId,
      metadata: { orderNumber: number, paymentMethod: checkout.payment_method },
    });
    await sql`insert into platform.outbox_events (organization_id, event_type, event_version, aggregate_type, aggregate_id, aggregate_version, payload, occurred_at) values (${checkout.organization_id}, 'orders.order.placed', 1, 'orders.order', ${orderId}, 1, ${JSON.stringify({ orderId, orderNumber: number })}::jsonb, now())`.execute(
      transaction,
    );
    return { kind: 'PLACED', order: await orderView(transaction, orderId) };
  });
}
