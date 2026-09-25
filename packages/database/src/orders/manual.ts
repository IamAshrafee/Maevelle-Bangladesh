import { sql, type Kysely } from 'kysely';

import { hashToken } from '@maevelle/security';

import type { DatabaseSchema } from '../index.js';
import type { CustomerSource } from '../customers.js';
import { normalizeCustomerPhone } from '../customer-identities.js';
import {
  createInventoryReservationInTransaction,
  InventoryDomainError,
} from '../inventory.js';
import {
  appendAuditEvent,
  claimIdempotencyRecord,
  IdempotencyKeyReuseError,
} from '../platform.js';
import { createPaymentIntentForOrder } from '../payments.js';
import { ensureAddress } from './checkout.js';
import { resolveDeliveryQuote } from './delivery-pricing.js';
import { nextOrderNumber } from './placement.js';
import { orderView } from './queries.js';
import {
  decimal4Minor,
  decimal4Text,
  decimalPattern,
  multiplyDecimal4,
  OrderDomainError,
  type CreateManualOrderInput,
  type OrderView,
} from './types.js';

const positiveDecimalPattern = /^(?:(?:[1-9]\d*)(?:\.\d{1,4})?|(?:0\.\d*[1-9]\d*))$/;

/**
 * Creates an order initiated by an admin operator, bypassing the storefront
 * checkout flow. Unlike placeOrder:
 *
 * - Catalog prices are authoritative unless an operator supplies a reasoned override.
 * - Customer must be ACTIVE (not INACTIVE, BLOCKED, MERGED, or ANONYMIZED).
 * - Admin selects the warehouse location explicitly.
 * - Delivery is calculated from the same configured rule as Storefront;
 *   deliberate exceptions require a recorded operator reason.
 * - No promotion discounts are applied (discount_amount = 0 on all lines).
 * - Line item images are snapshotted at creation time.
 *
 * All inventory reservation logic uses the same primitive as placeOrder so
 * the two paths cannot diverge independently.
 */
export async function createManualOrder(
  db: Kysely<DatabaseSchema>,
  input: CreateManualOrderInput,
): Promise<OrderView> {
  // ---- Input validation (server-enforced, not UI-only) -------------------

  if (!input.lines.length)
    throw new OrderDomainError('VALIDATION_FAILED', 'At least one line item is required.');

  const deliveryAmountRaw = input.deliveryAmount?.trim();
  const deliveryOverrideReason = input.deliveryOverrideReason?.trim();
  if (deliveryOverrideReason && (!deliveryAmountRaw || !decimalPattern.test(deliveryAmountRaw)))
    throw new OrderDomainError(
      'VALIDATION_FAILED',
      'A delivery override requires a non-negative delivery amount.',
    );

  ensureAddress(input.deliveryAddress);

  for (const line of input.lines) {
    const qty = line.quantity.trim();
    const price = line.unitPrice?.trim();
    if (!positiveDecimalPattern.test(qty))
      throw new OrderDomainError('VALIDATION_FAILED', 'Line quantity must be a positive decimal.');
    if (price !== undefined && !decimalPattern.test(price))
      throw new OrderDomainError(
        'VALIDATION_FAILED',
        'Line unit price must be a non-negative decimal.',
      );
  }

  const currency = input.currency ?? 'BDT';
  const salesChannel = input.salesChannel ?? 'ADMIN';

  return db.transaction().execute(async (transaction) => {
    // ---- Idempotency -------------------------------------------------------
    let recordId: string;
    try {
      const record = await claimIdempotencyRecord(transaction, {
        organizationId: input.organizationId,
        principalType: 'USER',
        principalId: input.actorId,
        operationType: 'orders.manual-create',
        idempotencyKey: input.idempotencyKey,
        requestFingerprint: hashToken(
          JSON.stringify({
            customerId: input.customerId,
            locationId: input.locationId,
            lines: input.lines,
            deliveryAddress: input.deliveryAddress,
            deliveryAmount: deliveryAmountRaw ?? null,
            deliveryOverrideReason: deliveryOverrideReason ?? null,
            paymentMethod: input.paymentMethod,
            salesChannel,
            currency,
          }),
        ),
      });
      if (!record.created) {
        if (record.status === 'SUCCEEDED') {
          const idRecord = await sql<{
            result_entity_id: string | null;
          }>`select result_entity_id::text from platform.idempotency_records where id = ${record.id}`.execute(
            transaction,
          );
          if (idRecord.rows[0]?.result_entity_id) {
            return orderView(transaction, idRecord.rows[0].result_entity_id);
          }
        }
        throw new OrderDomainError(
          'IDEMPOTENCY_CONFLICT',
          'This manual order request is already in progress.',
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

    // ---- Customer guard ----------------------------------------------------
    const customerRow = await sql<{ id: string; status: string; display_name: string }>`
      select id, status, display_name
      from customers.customers
      where id = ${input.customerId} and organization_id = ${input.organizationId}
      for update
    `.execute(transaction);
    const customer = customerRow.rows[0];
    if (!customer) throw new OrderDomainError('NOT_FOUND', 'Customer was not found.');
    if (!['ACTIVE'].includes(customer.status))
      throw new OrderDomainError(
        'VALIDATION_FAILED',
        `Manual orders cannot be created for a customer with status ${customer.status}.`,
      );

    // ---- Location guard ----------------------------------------------------
    const locationRow = await sql<{ id: string }>`
      select loc.id
      from warehouse.locations loc
      join warehouse.location_capabilities cap
        on cap.location_id = loc.id and cap.organization_id = loc.organization_id
        and cap.capability_code = 'STOCK_HOLDING'
      where loc.id = ${input.locationId}
        and loc.organization_id = ${input.organizationId}
        and loc.status = 'ACTIVE'
    `.execute(transaction);
    if (!locationRow.rows[0])
      throw new OrderDomainError(
        'VALIDATION_FAILED',
        'Location was not found or is not a STOCK_HOLDING location.',
      );

    const configuredDeliveryQuote = await resolveDeliveryQuote(transaction, {
      organizationId: input.organizationId,
      currency,
      countryCode: input.deliveryAddress.countryCode,
      ...(input.deliveryAddress.geographyNodeId
        ? { geographyNodeId: input.deliveryAddress.geographyNodeId }
        : {}),
    });
    const effectiveDeliveryAmount = deliveryOverrideReason
      ? deliveryAmountRaw!
      : configuredDeliveryQuote.amount;

    // ---- Variant resolution ------------------------------------------------
    // Resolve each variant to its inventory item. Sort by variantId to ensure
    // a consistent lock acquisition order and prevent deadlocks.
    const sortedLines = [...input.lines].sort((a, b) => a.variantId.localeCompare(b.variantId));

    const resolvedLines: {
      variantId: string;
      productId: string;
      inventoryItemId: string;
      sku: string;
      productTitle: string;
      variantTitle: string | null;
      imageUrl: string | null;
      optionSnapshot: readonly { name: string; value: string }[];
      quantity: string;
      unitPrice: string;
      gross: string;
      priceSource: 'CATALOG' | 'MANUAL_OVERRIDE';
      priceOverrideReason: string | null;
    }[] = [];

    for (const line of sortedLines) {
      const variantRow = await sql<{
        variant_id: string;
        product_id: string;
        inventory_item_id: string;
        sku: string;
        product_title: string;
        variant_title: string | null;
        image_url: string | null;
        option_snapshot: readonly { name: string; value: string }[];
        catalog_unit_price: string | null;
      }>`
        select
          v.id as variant_id, p.id as product_id, item.id as inventory_item_id,
          v.sku, p.title as product_title, v.title as variant_title,
          coalesce(
            (select media.url from catalog.product_media media
             where media.organization_id = ${input.organizationId}
               and media.product_id = p.id
               and (media.variant_id = v.id or media.variant_id is null)
             order by case when media.variant_id = v.id then 0 else 1 end, media.position asc
             limit 1),
            null
          ) as image_url,
          current_price.amount::text as catalog_unit_price,
          coalesce(
            (select jsonb_agg(jsonb_build_object('name', opt.name, 'value', val.display_value) order by opt.position)
             from catalog.variant_option_values assignment
             join catalog.product_option_values val on val.id = assignment.option_value_id
             join catalog.product_option_axes opt on opt.id = val.option_axis_id
             where assignment.variant_id = v.id), '[]'::jsonb
          ) as option_snapshot
        from catalog.product_variants v
        join catalog.products p on p.id = v.product_id
        join inventory.inventory_items item on item.variant_id = v.id and item.organization_id = ${input.organizationId}
        left join lateral (
          select price.amount
          from pricing.price_definitions price
          where price.organization_id = ${input.organizationId}
            and price.variant_id = v.id and price.currency_code = ${currency}
            and price.status = 'ACTIVE' and price.effective_from <= now()
            and (price.effective_to is null or price.effective_to > now())
          order by price.effective_from desc, price.id desc
          limit 1
        ) current_price on true
        where v.id = ${line.variantId}
          and v.status = 'ACTIVE'
          and p.status = 'ACTIVE'
          and item.status = 'ACTIVE'
      `.execute(transaction);
      const variant = variantRow.rows[0];
      if (!variant)
        throw new OrderDomainError(
          'VALIDATION_FAILED',
          `Variant ${line.variantId} was not found or is not active.`,
        );
      const unitPrice = line.unitPrice?.trim() ?? variant.catalog_unit_price;
      if (!unitPrice)
        throw new OrderDomainError(
          'VALIDATION_FAILED',
          `Variant ${variant.sku} does not have an active ${currency} price.`,
        );
      const isOverride =
        variant.catalog_unit_price === null ||
        decimal4Minor(unitPrice) !== decimal4Minor(variant.catalog_unit_price);
      const overrideReason = line.priceOverrideReason?.trim() || null;
      if (isOverride && !overrideReason)
        throw new OrderDomainError(
          'VALIDATION_FAILED',
          `A price override reason is required for variant ${variant.sku}.`,
        );
      const gross = multiplyDecimal4(line.quantity.trim(), unitPrice);
      resolvedLines.push({
        variantId: variant.variant_id,
        productId: variant.product_id,
        inventoryItemId: variant.inventory_item_id,
        sku: variant.sku,
        productTitle: variant.product_title,
        variantTitle: variant.variant_title,
        imageUrl: variant.image_url,
        optionSnapshot: variant.option_snapshot,
        quantity: line.quantity.trim(),
        unitPrice,
        gross,
        priceSource: isOverride ? 'MANUAL_OVERRIDE' : 'CATALOG',
        priceOverrideReason: isOverride ? overrideReason : null,
      });
    }

    // ---- Compute totals ---------------------------------------------------
    const subtotalAmount = decimal4Text(
      resolvedLines.reduce((sum, line) => sum + decimal4Minor(line.gross), 0n),
    );
    const totalAmount = decimal4Text(
      decimal4Minor(subtotalAmount) + decimal4Minor(effectiveDeliveryAmount),
    );

    // ---- Insert order header -----------------------------------------------
    const orderNumber = await nextOrderNumber(transaction, input.organizationId);
    const orderCreated = await sql<{ id: string }>`
      insert into orders.orders (
        organization_id, order_number, customer_id, source, sales_channel, currency_code,
        order_status, payment_method,
        subtotal_amount, discount_amount, delivery_amount, tax_amount, total_amount
      ) values (
        ${input.organizationId}, ${orderNumber}, ${input.customerId}, 'MANUAL', ${salesChannel},
        ${currency}, 'PENDING', ${input.paymentMethod},
        ${subtotalAmount}::numeric, 0::numeric,
        ${effectiveDeliveryAmount}::numeric, 0::numeric,
        ${totalAmount}::numeric
      ) returning id
    `.execute(transaction);
    const orderId = orderCreated.rows[0]?.id;
    if (!orderId) throw new Error('Manual order creation did not return an id.');
    const customerSourceByChannel: Record<
      Exclude<OrderView['salesChannel'], 'STOREFRONT'>,
      CustomerSource
    > = {
      ADMIN: 'MANUAL_ORDER',
      FACEBOOK: 'FACEBOOK',
      INSTAGRAM: 'INSTAGRAM',
      WHATSAPP: 'WHATSAPP',
      PHONE: 'PHONE',
      EXTERNAL_API: 'EXTERNAL_API',
      IMPORT: 'IMPORT',
    };
    await sql`
      update customers.customers
      set latest_source = ${customerSourceByChannel[salesChannel]}, updated_at = now(), version = version + 1
      where organization_id = ${input.organizationId} and id = ${input.customerId}
    `.execute(transaction);

    // ---- Customer and address snapshots -----------------------------------
    // Fetch primary contact details from the customer's profile.
    const primaryContact = await sql<{ phone: string | null; email: string | null }>`
      select
        (select raw_value from customers.customer_phones where customer_id = ${input.customerId} and is_primary order by created_at limit 1) as phone,
        (select raw_value from customers.customer_emails where customer_id = ${input.customerId} and is_primary order by created_at limit 1) as email
    `.execute(transaction);
    const phone = primaryContact.rows[0]?.phone ?? input.deliveryAddress.phone;
    const email = primaryContact.rows[0]?.email ?? null;

    await sql`
      insert into orders.order_customer_snapshots
        (order_id, organization_id, customer_id, display_name, phone, normalized_phone, email)
      values (${orderId}, ${input.organizationId}, ${input.customerId},
        ${customer.display_name}, ${phone}, ${normalizeCustomerPhone(phone)}, ${email})
    `.execute(transaction);
    await sql`
      insert into orders.order_addresses (
        organization_id, order_id, address_type,
        geography_node_id, recipient_name, phone,
        address_line_1, address_line_2, area, city, district, postal_code, country_code
      ) values (
        ${input.organizationId}, ${orderId}, 'DELIVERY',
        ${input.deliveryAddress.geographyNodeId ?? null},
        ${input.deliveryAddress.recipientName.trim()},
        ${input.deliveryAddress.phone.trim()},
        ${input.deliveryAddress.addressLine1.trim()},
        ${input.deliveryAddress.addressLine2?.trim() ?? null},
        ${input.deliveryAddress.area?.trim() ?? null},
        ${input.deliveryAddress.city?.trim() ?? null},
        ${input.deliveryAddress.district?.trim() ?? null},
        ${input.deliveryAddress.postalCode?.trim() ?? null},
        ${input.deliveryAddress.countryCode}
      )
    `.execute(transaction);
    await sql`
      insert into orders.order_delivery_pricing_snapshots (
        order_id, organization_id, delivery_pricing_rule_id, rule_name_snapshot,
        country_code_snapshot, geography_node_id, amount, currency_code, pricing_source, override_reason
      ) values (
        ${orderId}, ${input.organizationId},
        ${deliveryOverrideReason ? null : configuredDeliveryQuote.ruleId},
        ${deliveryOverrideReason ? 'Manual delivery override' : configuredDeliveryQuote.ruleName},
        ${input.deliveryAddress.countryCode}, ${input.deliveryAddress.geographyNodeId ?? null},
        ${effectiveDeliveryAmount}::numeric, ${currency},
        ${deliveryOverrideReason ? 'MANUAL_OVERRIDE' : 'RULE'}, ${deliveryOverrideReason ?? null}
      )
    `.execute(transaction);

    // Optionally save address to customer profile.
    if (input.deliveryAddress.saveToCustomer) {
      await sql`
        insert into customers.customer_addresses (
          organization_id, customer_id, recipient_name, phone,
          address_line_1, address_line_2, geography_node_id,
          area, city, district, postal_code, country_code, is_default
        ) values (
          ${input.organizationId}, ${input.customerId},
          ${input.deliveryAddress.recipientName.trim()},
          ${input.deliveryAddress.phone.trim()},
          ${input.deliveryAddress.addressLine1.trim()},
          ${input.deliveryAddress.addressLine2?.trim() ?? null},
          ${input.deliveryAddress.geographyNodeId ?? null},
          ${input.deliveryAddress.area?.trim() ?? null},
          ${input.deliveryAddress.city?.trim() ?? null},
          ${input.deliveryAddress.district?.trim() ?? null},
          ${input.deliveryAddress.postalCode?.trim() ?? null},
          ${input.deliveryAddress.countryCode},
          false
        )
      `.execute(transaction);
    }

    // ---- Order lines + inventory reservations ----------------------------
    // Lines are processed in variantId sort order (consistent with lock ordering above).
    for (const line of resolvedLines) {
      const created = await sql<{ id: string }>`
        insert into orders.order_lines (
          organization_id, order_id, product_id, variant_id, inventory_item_id,
          quantity, sku_snapshot, product_title_snapshot, variant_title_snapshot, option_snapshot,
          image_url_snapshot,
          unit_price, price_source, price_override_reason, gross_amount, discount_amount, net_amount
        ) values (
          ${input.organizationId}, ${orderId}, ${line.productId}, ${line.variantId},
          ${line.inventoryItemId},
          ${line.quantity}::numeric, ${line.sku}, ${line.productTitle},
          ${line.variantTitle}, ${JSON.stringify(line.optionSnapshot)}::jsonb,
          ${line.imageUrl ?? null},
          ${line.unitPrice}::numeric, ${line.priceSource}, ${line.priceOverrideReason}, ${line.gross}::numeric,
          0::numeric, ${line.gross}::numeric
        ) returning id
      `.execute(transaction);
      const lineId = created.rows[0]?.id;
      if (!lineId) throw new Error('Order line creation did not return an id.');

      // Shared reservation primitive — same function used by placeOrder.
      try {
        const reservation = await createInventoryReservationInTransaction(transaction, {
          organizationId: input.organizationId,
          actorId: input.actorId,
          variantId: line.variantId,
          locationId: input.locationId,
          quantity: line.quantity,
          sourceType: 'ORDER_LINE',
          sourceReference: lineId,
          idempotencyKey: `manual-order:${orderId}:${lineId}`,
        });
        await sql`
          insert into orders.order_inventory_reservations
            (organization_id, order_id, order_line_id, reservation_id)
          values (${input.organizationId}, ${orderId}, ${lineId}, ${reservation.reservationId})
        `.execute(transaction);
        await sql`
          insert into inventory.inventory_reservation_allocations
            (organization_id, reservation_id, order_line_id, inventory_item_id, location_id, reserved_quantity)
          values (${input.organizationId}, ${reservation.reservationId}, ${lineId},
            ${reservation.inventoryItemId}, ${input.locationId}, ${line.quantity}::numeric)
        `.execute(transaction);
      } catch (error) {
        if (error instanceof InventoryDomainError && error.code === 'INSUFFICIENT_STOCK')
          throw new OrderDomainError(
            'OUT_OF_STOCK',
            `Insufficient stock for variant ${line.variantId} at the selected location.`,
          );
        throw error;
      }
    }

    // ---- Payment intent ---------------------------------------------------
    await createPaymentIntentForOrder(transaction, {
      organizationId: input.organizationId,
      orderId,
      orderNumber,
      paymentMethod: input.paymentMethod,
      currency,
      expectedAmount: totalAmount,
    });

    // ---- Finalize idempotency record -------------------------------------
    await sql`
      update platform.idempotency_records
      set status = 'SUCCEEDED', result_entity_type = 'orders.order',
          result_entity_id = ${orderId}::uuid,
          safe_response = ${JSON.stringify({ orderId, orderNumber })}::jsonb,
          completed_at = now()
      where id = ${recordId}
    `.execute(transaction);

    await appendAuditEvent(transaction, {
      organizationId: input.organizationId,
      actorType: 'USER',
      actorId: input.actorId,
      action: 'orders.order.placed',
      targetType: 'orders.order',
      targetId: orderId,
      metadata: {
        orderNumber,
        source: 'MANUAL',
        salesChannel,
        paymentMethod: input.paymentMethod,
        deliveryAmount: effectiveDeliveryAmount,
        deliveryPricingSource: deliveryOverrideReason ? 'MANUAL_OVERRIDE' : 'RULE',
        ...(deliveryOverrideReason ? { deliveryOverrideReason } : {}),
        priceOverrides: resolvedLines.filter((line) => line.priceSource === 'MANUAL_OVERRIDE')
          .length,
      },
    });
    await sql`
      insert into platform.outbox_events (
        organization_id, event_type, event_version, aggregate_type, aggregate_id, aggregate_version, payload, occurred_at
      ) values (
        ${input.organizationId}, 'orders.order.placed', 1, 'orders.order', ${orderId}, 1,
        ${JSON.stringify({ orderId, orderNumber, source: 'MANUAL', salesChannel })}::jsonb, now()
      )
    `.execute(transaction);

    return orderView(transaction, orderId);
  });
}
