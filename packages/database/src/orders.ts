import { sql, type Kysely } from 'kysely';

import { generateOpaqueToken, hashToken } from '@maevelle/security';

import type { DatabaseSchema } from './index.js';
import {
  createInventoryReservationInTransaction,
  InventoryDomainError,
  releaseInventoryReservationInTransaction,
} from './inventory.js';
import { claimIdempotencyRecord, IdempotencyKeyReuseError, appendAuditEvent } from './platform.js';
import { evaluatePromotions } from './promotions.js';
import { getGuestCart, type CartView } from './cart.js';
import {
  createPaymentIntentForOrder,
  cancelPendingPaymentIntentsForOrder,
  getOrderPaymentSummary,
  listPaymentMethods,
  requireActivePaymentMethod,
  type PaymentMethodCode,
  type PaymentSummary,
} from './payments.js';

const checkoutLifetimeMs = 60 * 60 * 1000;

export class OrderDomainError extends Error {
  public constructor(
    public readonly code:
      | 'NOT_FOUND'
      | 'VALIDATION_FAILED'
      | 'CHECKOUT_CHANGED'
      | 'CHECKOUT_COMPLETED'
      | 'CHECKOUT_EXPIRED'
      | 'OUT_OF_STOCK'
      | 'IDEMPOTENCY_CONFLICT'
      | 'STALE_VERSION'
      | 'INVALID_TRANSITION',
    message: string,
    public readonly checkout?: CheckoutView,
  ) {
    super(message);
    this.name = 'OrderDomainError';
  }
}

export interface CheckoutContactInput {
  readonly name: string;
  readonly phone: string;
  readonly email?: string;
}

export interface CheckoutAddressInput {
  readonly recipientName: string;
  readonly phone: string;
  readonly addressLine1: string;
  readonly addressLine2?: string;
  readonly geographyNodeId?: string;
  readonly area?: string;
  readonly city?: string;
  readonly district?: string;
  readonly postalCode?: string;
  readonly countryCode: string;
}

export interface CheckoutView {
  readonly id: string;
  readonly version: number;
  readonly status: 'ACTIVE' | 'CHANGED' | 'ORDER_PLACED' | 'EXPIRED';
  readonly expiresAt: string;
  readonly paymentMethod: PaymentMethodCode;
  readonly calculationVersion: number;
  readonly calculationFingerprint: string;
  readonly cart: CartView;
  readonly contact: CheckoutContactInput | null;
  readonly address: CheckoutAddressInput | null;
  readonly orderNumber?: string;
}

export interface OrderView {
  readonly id: string;
  readonly version: number;
  readonly orderNumber: string;
  readonly status: string;
  readonly currency: string;
  readonly paymentMethod: PaymentMethodCode;
  readonly payment: PaymentSummary;
  readonly merchandiseGross: string;
  readonly discountTotal: string;
  readonly merchandiseNet: string;
  readonly customer: { displayName: string; phone: string; email: string | null };
  readonly address: CheckoutAddressInput;
  readonly lines: readonly {
    id: string;
    sku: string;
    productTitle: string;
    quantity: string;
    unitPrice: string;
    gross: string;
    discount: string;
    net: string;
    options: readonly { name: string; value: string }[];
  }[];
}

function checkoutTotals(cart: CartView) {
  return {
    merchandiseGross: cart.merchandiseGross,
    discountTotal: cart.discountTotal,
    merchandiseNet: cart.merchandiseNet,
  };
}

function ensureContact(input: CheckoutContactInput): void {
  if (!input.name.trim() || !/^\+?[0-9\s()-]{7,24}$/.test(input.phone.trim()))
    throw new OrderDomainError(
      'VALIDATION_FAILED',
      'A customer name and valid phone number are required.',
    );
  if (input.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim()))
    throw new OrderDomainError('VALIDATION_FAILED', 'Customer email is not valid.');
}

function ensureAddress(input: CheckoutAddressInput): void {
  if (
    !input.recipientName.trim() ||
    !input.phone.trim() ||
    !input.addressLine1.trim() ||
    !/^[A-Z]{2}$/.test(input.countryCode)
  )
    throw new OrderDomainError('VALIDATION_FAILED', 'A complete delivery address is required.');
}

function cartFingerprint(cart: CartView): string {
  return cart.calculationFingerprint;
}

async function checkoutRow(db: Kysely<DatabaseSchema>, token: string, lock = false) {
  const result = await sql<{
    id: string;
    organization_id: string;
    cart_id: string;
    customer_id: string | null;
    customer_name: string | null;
    customer_phone: string | null;
    customer_email: string | null;
    recipient_name: string | null;
    delivery_phone: string | null;
    address_line_1: string | null;
    address_line_2: string | null;
    geography_node_id: string | null;
    area: string | null;
    city: string | null;
    district: string | null;
    postal_code: string | null;
    country_code: string | null;
    status: CheckoutView['status'];
    expires_at: Date;
    version: string;
    cart_version: string;
    calculation_version: string;
    calculation_fingerprint: string;
    payment_method: PaymentMethodCode;
    resulting_order_id: string | null;
  }>`select * from orders.checkout_sessions where public_token_hash = ${hashToken(token)} ${lock ? sql`for update` : sql``}`.execute(
    db,
  );
  const row = result.rows[0];
  if (!row) throw new OrderDomainError('NOT_FOUND', 'Checkout was not found.');
  return row;
}

export async function getCheckout(
  db: Kysely<DatabaseSchema>,
  input: { checkoutToken: string; cartToken: string },
): Promise<CheckoutView> {
  const row = await checkoutRow(db, input.checkoutToken);
  if (row.status !== 'ORDER_PLACED' && row.expires_at <= new Date()) {
    await sql`update orders.checkout_sessions set status = 'EXPIRED', updated_at = now() where id = ${row.id} and status in ('ACTIVE', 'CHANGED')`.execute(
      db,
    );
    throw new OrderDomainError('CHECKOUT_EXPIRED', 'Checkout has expired.');
  }
  const cart = await getGuestCart(db, input.cartToken);
  if (cart.id !== row.cart_id) throw new OrderDomainError('NOT_FOUND', 'Checkout was not found.');
  const order = row.resulting_order_id
    ? await sql<{
        order_number: string;
      }>`select order_number from orders.orders where id = ${row.resulting_order_id}`.execute(db)
    : undefined;
  return {
    id: row.id,
    version: Number(row.version),
    status: row.status,
    expiresAt: row.expires_at.toISOString(),
    paymentMethod: row.payment_method,
    calculationVersion: Number(row.calculation_version),
    calculationFingerprint: row.calculation_fingerprint,
    cart,
    contact:
      row.customer_name && row.customer_phone
        ? {
            name: row.customer_name,
            phone: row.customer_phone,
            ...(row.customer_email ? { email: row.customer_email } : {}),
          }
        : null,
    address:
      row.recipient_name && row.delivery_phone && row.address_line_1 && row.country_code
        ? {
            recipientName: row.recipient_name,
            phone: row.delivery_phone,
            addressLine1: row.address_line_1,
            ...(row.address_line_2 ? { addressLine2: row.address_line_2 } : {}),
            ...(row.geography_node_id ? { geographyNodeId: row.geography_node_id } : {}),
            ...(row.area ? { area: row.area } : {}),
            ...(row.city ? { city: row.city } : {}),
            ...(row.district ? { district: row.district } : {}),
            ...(row.postal_code ? { postalCode: row.postal_code } : {}),
            countryCode: row.country_code,
          }
        : null,
    ...(order?.rows[0] ? { orderNumber: order.rows[0].order_number } : {}),
  };
}

export async function createCheckout(
  db: Kysely<DatabaseSchema>,
  input: { cartToken: string },
): Promise<{ token: string; checkout: CheckoutView }> {
  const cart = await getGuestCart(db, input.cartToken);
  const cartRecord = await sql<{ organization_id: string }>`
    select organization_id from cart.carts where id = ${cart.id}
  `.execute(db);
  const organizationId = cartRecord.rows[0]?.organization_id;
  if (!organizationId) throw new OrderDomainError('NOT_FOUND', 'Cart was not found.');
  const token = generateOpaqueToken();
  const expiresAt = new Date(Date.now() + checkoutLifetimeMs);
  const created = await sql<{ id: string }>`
    insert into orders.checkout_sessions (organization_id, cart_id, public_token_hash, cart_version, calculation_version, calculation_fingerprint, calculated_totals, expires_at)
    values (${organizationId}, ${cart.id}, ${hashToken(token)}, ${cart.version}, ${cart.calculationVersion}, ${cartFingerprint(cart)}, ${JSON.stringify(checkoutTotals(cart))}::jsonb, ${expiresAt}) returning id
  `.execute(db);
  // The organization is not part of CartView; derive it safely from the cart row for this response.
  const checkoutId = created.rows[0]?.id;
  if (!checkoutId) throw new Error('Checkout creation did not return an id.');
  return {
    token,
    checkout: {
      id: checkoutId,
      version: 1,
      status: 'ACTIVE',
      expiresAt: expiresAt.toISOString(),
      paymentMethod: 'COD',
      calculationVersion: cart.calculationVersion,
      calculationFingerprint: cartFingerprint(cart),
      cart,
      contact: null,
      address: null,
    },
  };
}

async function activeCheckout(
  db: Kysely<DatabaseSchema>,
  input: { checkoutToken: string; cartToken: string; expectedVersion: number },
) {
  const checkout = await checkoutRow(db, input.checkoutToken, true);
  const cart = await getGuestCart(db, input.cartToken);
  if (cart.id !== checkout.cart_id)
    throw new OrderDomainError('NOT_FOUND', 'Checkout was not found.');
  if (checkout.status === 'ORDER_PLACED')
    throw new OrderDomainError('CHECKOUT_COMPLETED', 'Checkout has already created an Order.');
  if (checkout.expires_at <= new Date()) {
    await sql`update orders.checkout_sessions set status = 'EXPIRED', updated_at = now() where id = ${checkout.id}`.execute(
      db,
    );
    throw new OrderDomainError('CHECKOUT_EXPIRED', 'Checkout has expired.');
  }
  if (Number(checkout.version) !== input.expectedVersion)
    throw new OrderDomainError('STALE_VERSION', 'Checkout has changed; reload before updating.');
  return { checkout, cart };
}

function checkoutInputView(
  row: Awaited<ReturnType<typeof checkoutRow>>,
  cart: CartView,
): CheckoutView {
  return {
    id: row.id,
    version: Number(row.version),
    status: row.status,
    expiresAt: row.expires_at.toISOString(),
    paymentMethod: row.payment_method,
    calculationVersion: Number(row.calculation_version),
    calculationFingerprint: row.calculation_fingerprint,
    cart,
    contact:
      row.customer_name && row.customer_phone
        ? {
            name: row.customer_name,
            phone: row.customer_phone,
            ...(row.customer_email ? { email: row.customer_email } : {}),
          }
        : null,
    address:
      row.recipient_name && row.delivery_phone && row.address_line_1 && row.country_code
        ? {
            recipientName: row.recipient_name,
            phone: row.delivery_phone,
            addressLine1: row.address_line_1,
            ...(row.address_line_2 ? { addressLine2: row.address_line_2 } : {}),
            ...(row.geography_node_id ? { geographyNodeId: row.geography_node_id } : {}),
            ...(row.area ? { area: row.area } : {}),
            ...(row.city ? { city: row.city } : {}),
            ...(row.district ? { district: row.district } : {}),
            ...(row.postal_code ? { postalCode: row.postal_code } : {}),
            countryCode: row.country_code,
          }
        : null,
  };
}

export async function updateCheckoutContact(
  db: Kysely<DatabaseSchema>,
  input: {
    checkoutToken: string;
    cartToken: string;
    expectedVersion: number;
    contact: CheckoutContactInput;
  },
): Promise<CheckoutView> {
  ensureContact(input.contact);
  return db.transaction().execute(async (transaction) => {
    const { checkout, cart } = await activeCheckout(transaction, input);
    const updated = await sql<{ version: string }>`
      update orders.checkout_sessions set customer_name = ${input.contact.name.trim()}, customer_phone = ${input.contact.phone.trim()},
        customer_email = ${input.contact.email?.trim() ?? null}, status = 'ACTIVE', version = version + 1, updated_at = now()
      where id = ${checkout.id} returning version::text
    `.execute(transaction);
    return {
      ...checkoutInputView(
        { ...checkout, version: updated.rows[0]!.version, status: 'ACTIVE' },
        cart,
      ),
      contact: input.contact,
    };
  });
}

export async function updateCheckoutAddress(
  db: Kysely<DatabaseSchema>,
  input: {
    checkoutToken: string;
    cartToken: string;
    expectedVersion: number;
    address: CheckoutAddressInput;
  },
): Promise<CheckoutView> {
  ensureAddress(input.address);
  return db.transaction().execute(async (transaction) => {
    const { checkout, cart } = await activeCheckout(transaction, input);
    if (input.address.geographyNodeId) {
      const geography = await sql<{
        id: string;
      }>`select id from geography.nodes where id = ${input.address.geographyNodeId} and status = 'ACTIVE'`.execute(
        transaction,
      );
      if (!geography.rows[0])
        throw new OrderDomainError('VALIDATION_FAILED', 'Delivery geography was not found.');
    }
    const updated = await sql<{ version: string }>`
      update orders.checkout_sessions set recipient_name = ${input.address.recipientName.trim()}, delivery_phone = ${input.address.phone.trim()},
        address_line_1 = ${input.address.addressLine1.trim()}, address_line_2 = ${input.address.addressLine2?.trim() ?? null},
        geography_node_id = ${input.address.geographyNodeId ?? null}, area = ${input.address.area?.trim() ?? null}, city = ${input.address.city?.trim() ?? null},
        district = ${input.address.district?.trim() ?? null}, postal_code = ${input.address.postalCode?.trim() ?? null}, country_code = ${input.address.countryCode},
        status = 'ACTIVE', version = version + 1, updated_at = now() where id = ${checkout.id} returning version::text
    `.execute(transaction);
    return {
      ...checkoutInputView(
        { ...checkout, version: updated.rows[0]!.version, status: 'ACTIVE' },
        cart,
      ),
      address: input.address,
    };
  });
}

/** Orders own checkout state; they ask the public Payments interface which methods are selectable. */
export async function updateCheckoutPaymentMethod(
  db: Kysely<DatabaseSchema>,
  input: {
    checkoutToken: string;
    cartToken: string;
    expectedVersion: number;
    paymentMethod: PaymentMethodCode;
  },
): Promise<CheckoutView> {
  return db.transaction().execute(async (transaction) => {
    const { checkout, cart } = await activeCheckout(transaction, input);
    await requireActivePaymentMethod(transaction, {
      organizationId: checkout.organization_id,
      code: input.paymentMethod,
    });
    const updated = await sql<{ version: string }>`
      update orders.checkout_sessions set payment_method = ${input.paymentMethod}, status = 'ACTIVE',
        version = version + 1, updated_at = now() where id = ${checkout.id} returning version::text
    `.execute(transaction);
    return checkoutInputView(
      {
        ...checkout,
        version: updated.rows[0]!.version,
        status: 'ACTIVE',
        payment_method: input.paymentMethod,
      },
      cart,
    );
  });
}

export async function getAvailableCheckoutPaymentMethods(
  db: Kysely<DatabaseSchema>,
  input: { checkoutToken: string; cartToken: string },
) {
  const checkout = await checkoutRow(db, input.checkoutToken);
  const cart = await getGuestCart(db, input.cartToken);
  if (cart.id !== checkout.cart_id)
    throw new OrderDomainError('NOT_FOUND', 'Checkout was not found.');
  return listPaymentMethods(db, checkout.organization_id, true);
}

export async function refreshCheckout(
  db: Kysely<DatabaseSchema>,
  input: { checkoutToken: string; cartToken: string; expectedVersion: number },
): Promise<CheckoutView> {
  return db.transaction().execute(async (transaction) => {
    const { checkout, cart } = await activeCheckout(transaction, input);
    const updated = await sql<{ version: string }>`
      update orders.checkout_sessions set cart_version = ${cart.version}, calculation_version = ${cart.calculationVersion},
        calculation_fingerprint = ${cartFingerprint(cart)}, calculated_totals = ${JSON.stringify(checkoutTotals(cart))}::jsonb,
        status = 'ACTIVE', version = version + 1, updated_at = now() where id = ${checkout.id} returning version::text
    `.execute(transaction);
    return checkoutInputView(
      {
        ...checkout,
        version: updated.rows[0]!.version,
        status: 'ACTIVE',
        calculation_version: String(cart.calculationVersion),
        calculation_fingerprint: cartFingerprint(cart),
      },
      cart,
    );
  });
}

async function nextOrderNumber(
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
    option_snapshot: unknown;
    category_ids: string[];
  }>`
    select line.id as line_id, variant.id as variant_id, product.id as product_id, line.quantity::text, variant.sku, product.title as product_title,
      coalesce(jsonb_agg(jsonb_build_object('name', axis.name, 'value', value.display_value) order by axis.position) filter (where axis.id is not null), '[]'::jsonb) as option_snapshot,
      coalesce(array_agg(category.category_id) filter (where category.category_id is not null), '{}') as category_ids
    from cart.cart_lines line
    join catalog.product_variants variant on variant.id = line.variant_id and variant.status = 'ACTIVE'
    join catalog.products product on product.id = variant.product_id and product.status = 'ACTIVE' and product.publication_status = 'PUBLISHED'
    left join catalog.variant_option_values selection on selection.variant_id = variant.id
    left join catalog.product_option_axes axis on axis.id = selection.option_axis_id
    left join catalog.product_option_values value on value.id = selection.option_value_id
    left join catalog.product_categories category on category.product_id = product.id
    where line.cart_id = ${cart.id}
    group by line.id, variant.id, product.id, line.quantity, variant.sku, product.title
    order by line.id
  `.execute(db);
  if (detail.rows.length !== cart.lines.length || detail.rows.length === 0)
    throw new OrderDomainError(
      'CHECKOUT_CHANGED',
      'One or more Cart items are no longer sellable.',
    );
  return detail.rows;
}

async function resolveCustomer(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  actorId: string,
  contact: CheckoutContactInput,
): Promise<string> {
  const normalizedPhone = contact.phone.replace(/[\s()-]/g, '').replace(/^([^+])/, '+$1');
  const matches = await sql<{ customer_id: string }>`
    select customer_id from customers.customer_phones where organization_id = ${organizationId} and normalized_value = ${normalizedPhone}
  `.execute(db);
  if (matches.rows.length === 1) return matches.rows[0]!.customer_id;
  const customer = await sql<{ id: string }>`
    insert into customers.customers (organization_id, customer_number, display_name)
    values (${organizationId}, 'CUS-' || upper(replace(uuidv7()::text, '-', '')), ${contact.name.trim()}) returning id
  `.execute(db);
  const customerId = customer.rows[0]?.id;
  if (!customerId) throw new Error('Customer creation did not return an id.');
  await sql`
    insert into customers.customer_phones (organization_id, customer_id, raw_value, normalized_value, is_primary)
    values (${organizationId}, ${customerId}, ${contact.phone.trim()}, ${normalizedPhone}, true)
  `.execute(db);
  if (contact.email) {
    await sql`
      insert into customers.customer_emails (organization_id, customer_id, raw_value, normalized_value, is_primary)
      values (${organizationId}, ${customerId}, ${contact.email.trim()}, ${contact.email.trim().toLocaleLowerCase()}, true)
    `.execute(db);
  }
  return customerId;
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

export type PlaceOrderResult =
  | { readonly kind: 'PLACED'; readonly order: OrderView }
  | { readonly kind: 'CHANGED'; readonly checkout: CheckoutView };

async function orderView(db: Kysely<DatabaseSchema>, orderId: string): Promise<OrderView> {
  const order = await sql<{
    id: string;
    organization_id: string;
    order_number: string;
    order_status: string;
    currency_code: string;
    payment_method: PaymentMethodCode;
    subtotal_amount: string;
    discount_amount: string;
    total_amount: string;
    version: string;
    display_name: string;
    phone: string;
    email: string | null;
    recipient_name: string;
    delivery_phone: string;
    address_line_1: string;
    address_line_2: string | null;
    geography_node_id: string | null;
    area: string | null;
    city: string | null;
    district: string | null;
    postal_code: string | null;
    country_code: string;
  }>`
    select order_row.id, order_row.organization_id, order_row.order_number, order_row.order_status, order_row.currency_code, order_row.payment_method, order_row.version::text,
      order_row.subtotal_amount::text, order_row.discount_amount::text, order_row.total_amount::text,
      customer.display_name, customer.phone, customer.email, address.recipient_name, address.phone as delivery_phone, address.address_line_1, address.address_line_2,
      address.geography_node_id, address.area, address.city, address.district, address.postal_code, address.country_code
    from orders.orders order_row
    join orders.order_customer_snapshots customer on customer.order_id = order_row.id
    join orders.order_addresses address on address.order_id = order_row.id and address.address_type = 'DELIVERY'
    where order_row.id = ${orderId}
  `.execute(db);
  const row = order.rows[0];
  if (!row) throw new OrderDomainError('NOT_FOUND', 'Order was not found.');
  const lines = await sql<{
    id: string;
    sku_snapshot: string;
    product_title_snapshot: string;
    quantity: string;
    unit_price: string;
    gross_amount: string;
    discount_amount: string;
    net_amount: string;
    option_snapshot: readonly { name: string; value: string }[];
  }>`
    select id, sku_snapshot, product_title_snapshot, quantity::text, unit_price::text, gross_amount::text, discount_amount::text, net_amount::text, option_snapshot
    from orders.order_lines where order_id = ${orderId} order by id
  `.execute(db);
  const payment = await getOrderPaymentSummary(db, {
    organizationId: row.organization_id,
    orderId,
    paymentMethod: row.payment_method,
    expectedAmount: row.total_amount,
  });
  return {
    id: row.id,
    version: Number(row.version),
    orderNumber: row.order_number,
    status: row.order_status,
    currency: row.currency_code,
    paymentMethod: row.payment_method,
    payment,
    merchandiseGross: row.subtotal_amount,
    discountTotal: row.discount_amount,
    merchandiseNet: row.total_amount,
    customer: { displayName: row.display_name, phone: row.phone, email: row.email },
    address: {
      recipientName: row.recipient_name,
      phone: row.delivery_phone,
      addressLine1: row.address_line_1,
      ...(row.address_line_2 ? { addressLine2: row.address_line_2 } : {}),
      ...(row.geography_node_id ? { geographyNodeId: row.geography_node_id } : {}),
      ...(row.area ? { area: row.area } : {}),
      ...(row.city ? { city: row.city } : {}),
      ...(row.district ? { district: row.district } : {}),
      ...(row.postal_code ? { postalCode: row.postal_code } : {}),
      countryCode: row.country_code,
    },
    lines: lines.rows.map((line) => ({
      id: line.id,
      sku: line.sku_snapshot,
      productTitle: line.product_title_snapshot,
      quantity: line.quantity,
      unitPrice: line.unit_price,
      gross: line.gross_amount,
      discount: line.discount_amount,
      net: line.net_amount,
      options: line.option_snapshot,
    })),
  };
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
    const changed =
      cart.version !== Number(checkout.cart_version) ||
      cartFingerprint(cart) !== checkout.calculation_fingerprint ||
      input.acceptedCalculationVersion !== Number(checkout.calculation_version) ||
      input.acceptedCalculationFingerprint !== checkout.calculation_fingerprint;
    if (changed) {
      const updated = await sql<{ version: string }>`
        update orders.checkout_sessions set cart_version = ${cart.version}, calculation_version = ${cart.calculationVersion}, calculation_fingerprint = ${cartFingerprint(cart)},
          calculated_totals = ${JSON.stringify(checkoutTotals(cart))}::jsonb, status = 'CHANGED', version = version + 1, updated_at = now()
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
            calculation_fingerprint: cartFingerprint(cart),
          },
          cart,
        ),
      };
    }
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
    const details = await cartOrderLines(transaction, cart);
    if (cart.lines.some((line) => line.availability !== 'AVAILABLE' || !line.unitPrice))
      throw new OrderDomainError('OUT_OF_STOCK', 'One or more items are no longer available.');
    const customerId = await resolveCustomer(
      transaction,
      checkout.organization_id,
      checkout.id,
      contact,
    );
    const number = await nextOrderNumber(transaction, checkout.organization_id);
    const orderCreated = await sql<{ id: string }>`
      insert into orders.orders (organization_id, order_number, checkout_session_id, customer_id, source, currency_code, order_status, payment_method, subtotal_amount, discount_amount, total_amount)
      values (${checkout.organization_id}, ${number}, ${checkout.id}, ${customerId}, 'STOREFRONT', ${cart.currency}, 'PENDING', ${checkout.payment_method}, ${cart.merchandiseGross}::numeric, ${cart.discountTotal}::numeric, ${cart.merchandiseNet}::numeric) returning id
    `.execute(transaction);
    const orderId = orderCreated.rows[0]?.id;
    if (!orderId) throw new Error('Order creation did not return an id.');
    input.fault?.('after-order-header');
    await sql`insert into orders.order_customer_snapshots (order_id, organization_id, customer_id, display_name, phone, email) values (${orderId}, ${checkout.organization_id}, ${customerId}, ${contact.name}, ${contact.phone}, ${contact.email ?? null})`.execute(
      transaction,
    );
    await sql`insert into orders.order_addresses (organization_id, order_id, address_type, geography_node_id, recipient_name, phone, address_line_1, address_line_2, area, city, district, postal_code, country_code) values (${checkout.organization_id}, ${orderId}, 'DELIVERY', ${address.geographyNodeId ?? null}, ${address.recipientName}, ${address.phone}, ${address.addressLine1}, ${address.addressLine2 ?? null}, ${address.area ?? null}, ${address.city ?? null}, ${address.district ?? null}, ${address.postalCode ?? null}, ${address.countryCode})`.execute(
      transaction,
    );
    const lineByCartId = new Map<string, string>();
    for (const detail of details) {
      const cartLine = cart.lines.find((line) => line.id === detail.line_id)!;
      const created = await sql<{ id: string }>`
        insert into orders.order_lines (organization_id, order_id, product_id, variant_id, quantity, sku_snapshot, product_title_snapshot, option_snapshot, unit_price, gross_amount, discount_amount, net_amount)
        values (${checkout.organization_id}, ${orderId}, ${detail.product_id}, ${detail.variant_id}, ${detail.quantity}::numeric, ${detail.sku}, ${detail.product_title}, ${JSON.stringify(detail.option_snapshot)}::jsonb, ${cartLine.unitPrice}::numeric, ${cartLine.gross}::numeric, ${cartLine.discount}::numeric, ${cartLine.net}::numeric) returning id
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
      expectedAmount: cart.merchandiseNet,
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

export async function getOrderForCheckout(
  db: Kysely<DatabaseSchema>,
  checkoutToken: string,
): Promise<OrderView> {
  const checkout = await checkoutRow(db, checkoutToken);
  if (!checkout.resulting_order_id || checkout.status !== 'ORDER_PLACED')
    throw new OrderDomainError('NOT_FOUND', 'Order confirmation was not found.');
  return orderView(db, checkout.resulting_order_id);
}

/** Secure checkout credential resolver for adjacent application services such as Payments. */
export async function getOrderForCheckoutContext(
  db: Kysely<DatabaseSchema>,
  checkoutToken: string,
): Promise<{ order: OrderView; organizationId: string }> {
  const checkout = await checkoutRow(db, checkoutToken);
  if (!checkout.resulting_order_id || checkout.status !== 'ORDER_PLACED')
    throw new OrderDomainError('NOT_FOUND', 'Order confirmation was not found.');
  return {
    order: await orderView(db, checkout.resulting_order_id),
    organizationId: checkout.organization_id,
  };
}

export interface AdminOrderDetailView extends OrderView {
  readonly deliveryAmount: string;
  readonly notes: readonly {
    id: string;
    authorActorId: string;
    noteType: string;
    body: string;
    createdAt: string;
  }[];
  readonly timeline: readonly {
    id: string;
    eventType: string;
    aggregateType: string;
    aggregateId: string;
    occurredAt: string;
    payload: Record<string, unknown>;
  }[];
  readonly fulfillments: readonly {
    id: string;
    fulfillmentNumber: string;
    status: string;
    locationId: string;
    dispatchedAt: string | null;
  }[];
  readonly deliveries: readonly {
    id: string;
    deliveryNumber: string;
    status: string;
    outcomeStatus: string | null;
    trackingNumber: string | null;
    dispatchedAt: string | null;
    deliveredAt: string | null;
  }[];
  readonly returnCases: readonly {
    id: string;
    caseNumber: string;
    status: string;
    returnType: string;
    createdAt: string;
  }[];
  readonly refunds: readonly {
    id: string;
    amount: string;
    status: string;
    createdAt: string;
  }[];
  readonly discountApplications: readonly {
    promotionName: string;
    couponCode: string | null;
    benefitType: string;
    benefitValue: string;
    discountAmount: string;
  }[];
  readonly cancellation: {
    reasonCode: string;
    reasonText: string | null;
    createdAt: string;
  } | null;
}

export async function getOrderForAdmin(
  db: Kysely<DatabaseSchema>,
  input: { organizationId: string; orderId: string },
): Promise<AdminOrderDetailView> {
  const exists = await sql<{
    id: string;
    delivery_amount: string;
  }>`select id, delivery_amount::text from orders.orders where id = ${input.orderId} and organization_id = ${input.organizationId}`.execute(
    db,
  );
  if (!exists.rows[0]) throw new OrderDomainError('NOT_FOUND', 'Order was not found.');

  const baseOrderPromise = orderView(db, input.orderId);

  const [
    baseOrder,
    notesQuery,
    timelineQuery,
    fulfillmentsQuery,
    deliveriesQuery,
    returnsQuery,
    refundsQuery,
    discountsQuery,
    cancellationQuery,
  ] = await Promise.all([
    baseOrderPromise,
    sql<{ id: string; author_actor_id: string; note_type: string; body: string; created_at: Date }>`
      select id, author_actor_id, note_type, body, created_at
      from orders.order_notes
      where order_id = ${input.orderId}
      order by created_at desc limit 20
    `.execute(db),
    sql<{ id: string; event_type: string; aggregate_type: string; aggregate_id: string; occurred_at: Date; payload: Record<string, unknown> }>`
      select id, event_type, aggregate_type, aggregate_id, occurred_at, payload
      from platform.outbox_events
      where aggregate_type in ('orders.order', 'fulfillment.fulfillment', 'delivery.delivery', 'returns.return_case')
        and payload->>'orderId' = ${input.orderId}
      order by occurred_at desc limit 30
    `.execute(db),
    sql<{ id: string; fulfillment_number: string; status: string; location_id: string; dispatched_at: Date | null }>`
      select id, fulfillment_number, status, location_id, dispatched_at
      from fulfillment.fulfillments
      where order_id = ${input.orderId}
      order by created_at desc
    `.execute(db),
    sql<{ id: string; delivery_number: string; operational_status: string; outcome_status: string | null; tracking_reference: string | null; dispatched_at: Date | null; delivered_at: Date | null }>`
      select d.id, d.delivery_number, d.operational_status, d.outcome_status, d.tracking_reference, f.dispatched_at, null as delivered_at
      from delivery.deliveries d
      join fulfillment.fulfillments f on f.id = d.fulfillment_id
      where d.order_id = ${input.orderId}
      order by d.created_at desc
    `.execute(db),
    sql<{ id: string; return_number: string; case_status: string; case_type: string; created_at: Date }>`
      select id, return_number, case_status, case_type, created_at
      from returns.return_cases
      where order_id = ${input.orderId}
      order by created_at desc
    `.execute(db),
    sql<{ id: string; amount: string; status: string; created_at: Date }>`
      select r.id, r.amount::text, r.status, r.created_at
      from payments.refunds r
      join payments.payments p on p.id = r.payment_id
      join payments.payment_attempts pa on pa.id = p.source_attempt_id
      join payments.payment_intents pi on pi.id = pa.payment_intent_id
      where pi.order_id = ${input.orderId}
      order by r.created_at desc
    `.execute(db),
    sql<{ promotion_name: string; coupon_code: string | null; benefit_type: string; benefit_value: string; discount_amount: string }>`
      select promotion_name_snapshot as promotion_name, coupon_code_snapshot as coupon_code,
             benefit_type_snapshot as benefit_type, benefit_value_snapshot::text as benefit_value,
             discount_amount::text as discount_amount
      from orders.order_discount_applications
      where order_id = ${input.orderId}
      order by created_at desc
    `.execute(db),
    sql<{ reason_code: string; reason_text: string | null; created_at: Date }>`
      select reason_code, reason_text, created_at
      from orders.order_cancellations
      where order_id = ${input.orderId}
    `.execute(db),
  ]);

  return {
    ...baseOrder,
    deliveryAmount: exists.rows[0].delivery_amount,
    notes: notesQuery.rows.map((row) => ({
      id: row.id,
      authorActorId: row.author_actor_id,
      noteType: row.note_type,
      body: row.body,
      createdAt: row.created_at.toISOString(),
    })),
    timeline: timelineQuery.rows.map((row) => ({
      id: row.id,
      eventType: row.event_type,
      aggregateType: row.aggregate_type,
      aggregateId: row.aggregate_id,
      occurredAt: row.occurred_at.toISOString(),
      payload: row.payload,
    })),
    fulfillments: fulfillmentsQuery.rows.map((row) => ({
      id: row.id,
      fulfillmentNumber: row.fulfillment_number,
      status: row.status,
      locationId: row.location_id,
      dispatchedAt: row.dispatched_at?.toISOString() ?? null,
    })),
    deliveries: deliveriesQuery.rows.map((row) => ({
      id: row.id,
      deliveryNumber: row.delivery_number,
      status: row.operational_status,
      outcomeStatus: row.outcome_status,
      trackingNumber: row.tracking_reference,
      dispatchedAt: row.dispatched_at?.toISOString() ?? null,
      deliveredAt: row.delivered_at?.toISOString() ?? null,
    })),
    returnCases: returnsQuery.rows.map(row => ({
      id: row.id,
      caseNumber: row.return_number,
      status: row.case_status,
      returnType: row.case_type,
      createdAt: row.created_at.toISOString(),
    })),
    refunds: refundsQuery.rows.map((row) => ({
      id: row.id,
      amount: row.amount,
      status: row.status,
      createdAt: row.created_at.toISOString(),
    })),
    discountApplications: discountsQuery.rows.map((row) => ({
      promotionName: row.promotion_name,
      couponCode: row.coupon_code,
      benefitType: row.benefit_type,
      benefitValue: row.benefit_value,
      discountAmount: row.discount_amount,
    })),
    cancellation: cancellationQuery.rows[0]
      ? {
          reasonCode: cancellationQuery.rows[0].reason_code,
          reasonText: cancellationQuery.rows[0].reason_text,
          createdAt: cancellationQuery.rows[0].created_at.toISOString(),
        }
      : null,
  };
}

export interface OrderListFilters {
  readonly page?: number;
  readonly pageSize?: number;
  readonly status?: string;
  /** Searched against order_number prefix, snapshot display_name ILIKE, and normalized phone. */
  readonly q?: string;
  readonly from?: string;
  readonly to?: string;
  /** When provided, also resolves MERGED alias customers to include their orders. */
  readonly customerId?: string;
}

export interface OrderListItem {
  readonly id: string;
  readonly orderNumber: string;
  readonly source: string;
  readonly status: string;
  readonly paymentMethod: PaymentMethodCode;
  readonly paymentStatus: string;
  readonly total: string;
  readonly deliveryAmount: string;
  readonly currency: string;
  readonly customerName: string;
  readonly customerId: string | null;
  readonly createdAt: string;
}

export interface PaginationMeta {
  readonly page: number;
  readonly pageSize: number;
  readonly totalItems: number;
  readonly totalPages: number;
}

export async function listOrders(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  filters?: OrderListFilters,
): Promise<{ data: readonly OrderListItem[]; pagination: PaginationMeta }> {
  const page = Math.max(1, filters?.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, filters?.pageSize ?? 25));
  const offset = (page - 1) * pageSize;

  // Resolve alias customer IDs so that scoping to a canonical customer
  // also surfaces orders placed while the customer was a separate record.
  let customerIds: string[] | null = null;
  if (filters?.customerId) {
    const aliasResult = await sql<{ customer_id: string }>`
      select ${filters.customerId}::uuid as customer_id
      union all
      select alias_customer_id as customer_id
      from customers.customer_aliases
      where canonical_customer_id = ${filters.customerId}
        or alias_customer_id = ${filters.customerId}
    `.execute(db);
    customerIds = aliasResult.rows.map((r) => r.customer_id);
  }

  const searchTerm = filters?.q?.trim() ?? null;

  const result = await sql<{
    id: string;
    order_number: string;
    source: string;
    order_status: string;
    payment_method: PaymentMethodCode;
    total_amount: string;
    delivery_amount: string;
    currency_code: string;
    display_name: string;
    customer_id: string | null;
    created_at: Date;
    // Inline payment summary from LEFT JOIN LATERAL — no per-row async call.
    payment_intent_status: string | null;
    collected: string | null;
    refunded: string | null;
    total_count: string;
  }>`
    select
      o.id, o.order_number, o.source, o.order_status, o.payment_method,
      o.total_amount::text, o.delivery_amount::text, o.currency_code,
      snap.display_name, snap.customer_id,
      o.created_at,
      pay.status           as payment_intent_status,
      pay.collected        as collected,
      pay.refunded         as refunded,
      count(*) over ()::text as total_count
    from orders.orders o
    join orders.order_customer_snapshots snap on snap.order_id = o.id
    left join lateral (
      select
        pi.status,
        coalesce((select sum(p.amount) from payments.payments p join payments.payment_attempts pa on pa.id = p.source_attempt_id where pa.payment_intent_id = pi.id), 0)::text as collected,
        coalesce((select sum(r.amount) from payments.refunds r where r.payment_id in (
          select p2.id from payments.payments p2 join payments.payment_attempts pa2 on pa2.id = p2.source_attempt_id where pa2.payment_intent_id = pi.id
        )), 0)::text as refunded
      from payments.payment_intents pi
      where pi.order_id = o.id
      order by pi.created_at desc
      limit 1
    ) pay on true
    where o.organization_id = ${organizationId}
      and (${filters?.status ?? null}::text is null or o.order_status = ${filters?.status ?? null})
      and (${filters?.from ?? null}::text is null or o.created_at >= (${filters?.from ?? null})::timestamptz)
      and (${filters?.to ?? null}::text is null or o.created_at <= (${filters?.to ?? null})::timestamptz)
      and (
        ${customerIds ?? null}::uuid[] is null
        or snap.customer_id = any(${customerIds ?? null}::uuid[])
      )
      and (
        ${searchTerm ?? null}::text is null
        or o.order_number ilike ${searchTerm ? `${searchTerm}%` : ''}
        or lower(snap.display_name) like ${searchTerm ? `%${searchTerm.toLocaleLowerCase()}%` : ''}
        or snap.phone = (select normalized_value from customers.customer_phones
          where normalized_value = ${searchTerm ?? ''} limit 1)
      )
    order by o.created_at desc, o.id desc
    limit ${pageSize} offset ${offset}
  `.execute(db);

  const totalItems = Number(result.rows[0]?.total_count ?? 0);

  const data: OrderListItem[] = result.rows.map((row) => {
    // Derive a human-readable payment status from the intent status and collected amounts.
    const collected = Number(row.collected ?? 0);
    const refunded = Number(row.refunded ?? 0);
    const expected = Number(row.total_amount);
    let paymentStatus = row.payment_intent_status ?? 'UNPAID';
    if (paymentStatus === 'ACTIVE') {
      if (collected === 0) paymentStatus = 'UNPAID';
      else if (collected - refunded >= expected) paymentStatus = 'PAID';
      else paymentStatus = 'PARTIALLY_PAID';
    } else if (paymentStatus === 'CAPTURED' || paymentStatus === 'COLLECTED') {
      if (refunded > 0 && refunded >= expected) paymentStatus = 'REFUNDED';
      else if (refunded > 0) paymentStatus = 'PARTIALLY_REFUNDED';
      else paymentStatus = 'PAID';
    }
    return {
      id: row.id,
      orderNumber: row.order_number,
      source: row.source,
      status: row.order_status,
      paymentMethod: row.payment_method,
      paymentStatus,
      total: row.total_amount,
      deliveryAmount: row.delivery_amount,
      currency: row.currency_code,
      customerName: row.display_name,
      customerId: row.customer_id ?? null,
      createdAt: row.created_at.toISOString(),
    };
  });

  return {
    data,
    pagination: {
      page,
      pageSize,
      totalItems,
      totalPages: totalItems === 0 ? 1 : Math.ceil(totalItems / pageSize),
    },
  };
}

export async function updateOrderStatus(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    orderId: string;
    expectedVersion: number;
    nextStatus: 'CONFIRMED' | 'ON_HOLD';
    reason?: string;
  },
): Promise<OrderView> {
  return db.transaction().execute(async (transaction) => {
    const order = await sql<{
      order_status: string;
      version: string;
    }>`select order_status, version::text from orders.orders where id = ${input.orderId} and organization_id = ${input.organizationId} for update`.execute(
      transaction,
    );
    const row = order.rows[0];
    if (!row) throw new OrderDomainError('NOT_FOUND', 'Order was not found.');
    if (Number(row.version) !== input.expectedVersion)
      throw new OrderDomainError('STALE_VERSION', 'Order has changed; reload before updating.');
    const valid =
      (input.nextStatus === 'CONFIRMED' && row.order_status === 'PENDING') ||
      (input.nextStatus === 'ON_HOLD' && ['PENDING', 'CONFIRMED'].includes(row.order_status));
    if (!valid)
      throw new OrderDomainError('INVALID_TRANSITION', 'This Order transition is not allowed.');
    await sql`update orders.orders set order_status = ${input.nextStatus}, confirmed_at = case when ${input.nextStatus} = 'CONFIRMED' then now() else confirmed_at end, version = version + 1, updated_at = now() where id = ${input.orderId}`.execute(
      transaction,
    );
    await appendAuditEvent(transaction, {
      organizationId: input.organizationId,
      actorType: 'USER',
      actorId: input.actorId,
      action: `orders.order.${input.nextStatus.toLocaleLowerCase()}`,
      targetType: 'orders.order',
      targetId: input.orderId,
      ...(input.reason ? { reason: input.reason } : {}),
    });
    return orderView(transaction, input.orderId);
  });
}

export async function cancelOrder(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    orderId: string;
    expectedVersion: number;
    reasonCode: string;
    reasonText?: string;
    idempotencyKey: string;
  },
): Promise<{ order: OrderView; releasedReservations: number }> {
  if (!input.reasonCode.trim())
    throw new OrderDomainError('VALIDATION_FAILED', 'A cancellation reason is required.');
  return db.transaction().execute(async (transaction) => {
    const order = await sql<{
      order_status: string;
      version: string;
    }>`select order_status, version::text from orders.orders where id = ${input.orderId} and organization_id = ${input.organizationId} for update`.execute(
      transaction,
    );
    const row = order.rows[0];
    if (!row) throw new OrderDomainError('NOT_FOUND', 'Order was not found.');
    if (row.order_status === 'CANCELLED')
      return { order: await orderView(transaction, input.orderId), releasedReservations: 0 };
    if (!['PENDING', 'CONFIRMED', 'ON_HOLD'].includes(row.order_status))
      throw new OrderDomainError('INVALID_TRANSITION', 'This Order cannot be cancelled.');
    if (Number(row.version) !== input.expectedVersion)
      throw new OrderDomainError('STALE_VERSION', 'Order has changed; reload before cancelling.');
    const reservations = await sql<{
      reservation_id: string;
    }>`select reservation_id from orders.order_inventory_reservations where order_id = ${input.orderId} order by reservation_id`.execute(
      transaction,
    );
    let releasedReservations = 0;
    for (const reservation of reservations.rows) {
      const release = await releaseInventoryReservationInTransaction(transaction, {
        organizationId: input.organizationId,
        actorId: input.actorId,
        reservationId: reservation.reservation_id,
        idempotencyKey: `order-cancel:${input.orderId}:${reservation.reservation_id}`,
      });
      if (release.released) releasedReservations += 1;
    }
    await cancelPendingPaymentIntentsForOrder(transaction, {
      organizationId: input.organizationId,
      orderId: input.orderId,
    });
    await sql`update orders.orders set order_status = 'CANCELLED', cancelled_at = now(), version = version + 1, updated_at = now() where id = ${input.orderId}`.execute(
      transaction,
    );
    await sql`insert into orders.order_cancellations (organization_id, order_id, reason_code, reason_text, created_by_actor_id) values (${input.organizationId}, ${input.orderId}, ${input.reasonCode.trim()}, ${input.reasonText?.trim() ?? null}, ${input.actorId})`.execute(
      transaction,
    );
    await appendAuditEvent(transaction, {
      organizationId: input.organizationId,
      actorType: 'USER',
      actorId: input.actorId,
      action: 'orders.order.cancelled',
      targetType: 'orders.order',
      targetId: input.orderId,
      ...(input.reasonText ? { reason: input.reasonText } : {}),
      metadata: { reasonCode: input.reasonCode, releasedReservations },
    });
    await sql`insert into platform.outbox_events (organization_id, event_type, event_version, aggregate_type, aggregate_id, aggregate_version, payload, occurred_at) values (${input.organizationId}, 'orders.order.cancelled', 1, 'orders.order', ${input.orderId}, 1, ${JSON.stringify({ orderId: input.orderId, releasedReservations })}::jsonb, now())`.execute(
      transaction,
    );
    return { order: await orderView(transaction, input.orderId), releasedReservations };
  });
}

/**
 * Adds an operator note to an order. Notes are append-only \u2014 there is no edit/delete.
 * INTERNAL notes are visible only to admin staff; CUSTOMER_VISIBLE may be surfaced
 * to the customer in future notification workflows.
 */
export async function addOrderNote(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    orderId: string;
    noteType: 'INTERNAL' | 'CUSTOMER_VISIBLE';
    body: string;
  },
): Promise<{ id: string }> {
  const body = input.body.trim();
  if (!body) throw new OrderDomainError('VALIDATION_FAILED', 'Note body cannot be empty.');
  // Verify the order exists and belongs to this organization.
  const exists = await sql<{ id: string }>`
    select id from orders.orders where id = ${input.orderId} and organization_id = ${input.organizationId}
  `.execute(db);
  if (!exists.rows[0]) throw new OrderDomainError('NOT_FOUND', 'Order was not found.');

  const created = await sql<{ id: string }>`
    insert into orders.order_notes (organization_id, order_id, author_actor_id, note_type, body)
    values (${input.organizationId}, ${input.orderId}, ${input.actorId}, ${input.noteType}, ${body})
    returning id
  `.execute(db);
  const id = created.rows[0]?.id;
  if (!id) throw new Error('Note creation did not return an id.');
  await appendAuditEvent(db, {
    organizationId: input.organizationId,
    actorType: 'USER',
    actorId: input.actorId,
    action: 'orders.order.note_added',
    targetType: 'orders.order',
    targetId: input.orderId,
    metadata: { noteType: input.noteType },
  });
  return { id };
}

/**
 * Transitions an ON_HOLD order back to CONFIRMED, resuming normal processing.
 * Version-checked to prevent lost-update races.
 */
export async function resumeOrderFromHold(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    orderId: string;
    expectedVersion: number;
  },
): Promise<OrderView> {
  return db.transaction().execute(async (transaction) => {
    const order = await sql<{ order_status: string; version: string }>`
      select order_status, version::text from orders.orders
      where id = ${input.orderId} and organization_id = ${input.organizationId}
      for update
    `.execute(transaction);
    const row = order.rows[0];
    if (!row) throw new OrderDomainError('NOT_FOUND', 'Order was not found.');
    if (Number(row.version) !== input.expectedVersion)
      throw new OrderDomainError('STALE_VERSION', 'Order has changed; reload before updating.');
    if (row.order_status !== 'ON_HOLD')
      throw new OrderDomainError('INVALID_TRANSITION', 'Only ON_HOLD orders can be resumed.');
    await sql`
      update orders.orders
      set order_status = 'CONFIRMED', version = version + 1, updated_at = now()
      where id = ${input.orderId}
    `.execute(transaction);
    await appendAuditEvent(transaction, {
      organizationId: input.organizationId,
      actorType: 'USER',
      actorId: input.actorId,
      action: 'orders.order.confirmed',
      targetType: 'orders.order',
      targetId: input.orderId,
      metadata: { resumedFromHold: true },
    });
    await sql`
      insert into platform.outbox_events (organization_id, event_type, event_version, aggregate_type, aggregate_id, aggregate_version, payload, occurred_at)
      values (${input.organizationId}, 'orders.order.resumed', 1, 'orders.order', ${input.orderId}, 1,
        ${JSON.stringify({ orderId: input.orderId })}::jsonb, now())
    `.execute(transaction);
    return orderView(transaction, input.orderId);
  });
}

/**
 * Transitions a CONFIRMED order to COMPLETED.
 *
 * Normally triggered automatically by the background consumer when it receives
 * the `delivery.all_lines_delivered` outbox event — in that case, pass the
 * outbox event ID as the `idempotencyKey` and `triggerOutboxEventId`.
 *
 * Can also be called manually by an admin (e.g., for partially-delivered orders
 * where the customer confirmed receipt). In that case, `actorId` is set and
 * `triggerOutboxEventId` is null.
 *
 * Guard: all order lines must have sufficient delivered quantity before completing.
 */
export async function completeOrder(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    orderId: string;
    actorId: string | null;
    idempotencyKey: string;
    triggerOutboxEventId?: string | null;
  },
): Promise<OrderView> {
  return db.transaction().execute(async (transaction) => {
    const order = await sql<{ order_status: string; version: string; organization_id: string }>`
      select order_status, version::text, organization_id
      from orders.orders
      where id = ${input.orderId} and organization_id = ${input.organizationId}
      for update
    `.execute(transaction);
    const row = order.rows[0];
    if (!row) throw new OrderDomainError('NOT_FOUND', 'Order was not found.');

    // Idempotency: if already completed, return current state without error.
    if (row.order_status === 'COMPLETED') return orderView(transaction, input.orderId);

    if (row.order_status !== 'CONFIRMED')
      throw new OrderDomainError(
        'INVALID_TRANSITION',
        `Cannot complete an order in ${row.order_status} status.`,
      );

    // Guard: all ordered lines must be covered by delivered delivery lines.
    // An order line is covered when sum(delivery_line.delivered_quantity) >= order_line.quantity.
    const undelivered = await sql<{ count: string }>`
      select count(*)::text as count
      from orders.order_lines ol
      where ol.order_id = ${input.orderId}
        and (
          select coalesce(sum(dl.delivered_quantity), 0)
          from delivery.delivery_lines dl
          join delivery.deliveries d on d.id = dl.delivery_id
          where dl.order_line_id = ol.id
            and d.outcome_status = 'DELIVERED'
        ) < ol.quantity
    `.execute(transaction);
    if (Number(undelivered.rows[0]?.count ?? 1) > 0)
      throw new OrderDomainError(
        'INVALID_TRANSITION',
        'Not all order lines have been delivered. Cannot complete.',
      );

    // Idempotency check against explicit key (handles retry of auto-completion event).
    let recordId: string | undefined;
    try {
      const record = await claimIdempotencyRecord(transaction, {
        organizationId: input.organizationId,
        principalType: 'USER',
        principalId: input.actorId ?? input.orderId,
        operationType: 'orders.complete',
        idempotencyKey: input.idempotencyKey,
        requestFingerprint: input.orderId,
      });
      if (!record.created && record.status === 'SUCCEEDED')
        return orderView(transaction, input.orderId);
      recordId = record.id;
    } catch (error) {
      if (error instanceof IdempotencyKeyReuseError)
        throw new OrderDomainError('IDEMPOTENCY_CONFLICT', 'Idempotency key reused.');
      throw error;
    }

    await sql`
      update orders.orders
      set order_status = 'COMPLETED', completed_at = now(), version = version + 1, updated_at = now()
      where id = ${input.orderId}
    `.execute(transaction);

    // Record completion traceability \u2014 links to the delivery event that triggered this, if any.
    await sql`
      insert into orders.order_completion_events (order_id, organization_id, trigger_outbox_event_id, completed_by_actor_id)
      values (${input.orderId}, ${input.organizationId}, ${input.triggerOutboxEventId ?? null}, ${input.actorId ?? null})
      on conflict (order_id) do nothing
    `.execute(transaction);

    await sql`
      update platform.idempotency_records
      set status = 'SUCCEEDED', result_entity_type = 'orders.order', result_entity_id = ${input.orderId}::uuid,
          safe_response = ${JSON.stringify({ orderId: input.orderId })}::jsonb, completed_at = now()
      where id = ${recordId}
    `.execute(transaction);

    await appendAuditEvent(transaction, {
      organizationId: input.organizationId,
      actorType: input.actorId ? 'USER' : 'SYSTEM',
      actorId: input.actorId ?? 'system',
      action: 'orders.order.completed',
      targetType: 'orders.order',
      targetId: input.orderId,
      metadata: { triggerOutboxEventId: input.triggerOutboxEventId ?? null },
    });

    await sql`
      insert into platform.outbox_events (organization_id, event_type, event_version, aggregate_type, aggregate_id, aggregate_version, payload, occurred_at)
      values (${input.organizationId}, 'orders.order.completed', 1, 'orders.order', ${input.orderId}, 1,
        ${JSON.stringify({ orderId: input.orderId })}::jsonb, now())
    `.execute(transaction);

    return orderView(transaction, input.orderId);
  });
}

// ---------------------------------------------------------------------------
// Manual order creation inputs
// ---------------------------------------------------------------------------

export interface ManualOrderLine {
  readonly variantId: string;
  /** Must be > 0. Decimal string, e.g. "2" or "1.5". */
  readonly quantity: string;
  /** Admin-set price. Must be >= 0. Decimal string, e.g. "1200.00". */
  readonly unitPrice: string;
}

export interface ManualOrderDeliveryAddress {
  readonly recipientName: string;
  readonly phone: string;
  readonly addressLine1: string;
  readonly addressLine2?: string;
  readonly geographyNodeId?: string;
  readonly area?: string;
  readonly city?: string;
  readonly district?: string;
  readonly postalCode?: string;
  readonly countryCode: string;
  /**
   * When true, saves this address to the customer's address book within the
   * same transaction. When false, the address is used for this order only.
   */
  readonly saveToCustomer?: boolean;
}

export interface CreateManualOrderInput {
  readonly organizationId: string;
  readonly actorId: string;
  readonly customerId: string;
  /** Must reference a STOCK_HOLDING location. Single location per order (v1). */
  readonly locationId: string;
  readonly lines: readonly ManualOrderLine[];
  readonly deliveryAddress: ManualOrderDeliveryAddress;
  /** Shipping charge in the order currency. Must be >= 0. */
  readonly deliveryAmount: string;
  readonly paymentMethod: PaymentMethodCode;
  /**
   * Client-generated UUID. Required. The same key returns the same order
   * if the request is replayed after a network failure.
   */
  readonly idempotencyKey: string;
  readonly currency?: string;
}

const decimalPattern = /^(?:0|[1-9]\d*)(?:\.\d{1,4})?$/;
const positiveDecimalPattern = /^(?:(?:[1-9]\d*)(?:\.\d{1,4})?|(?:0\.\d*[1-9]\d*))$/;

/**
 * Creates an order initiated by an admin operator, bypassing the storefront
 * checkout flow. Unlike placeOrder:
 *
 * - Prices are admin-set (no promotion evaluation).
 * - Customer must be ACTIVE (not INACTIVE, BLOCKED, MERGED, or ANONYMIZED).
 * - Admin selects the warehouse location explicitly.
 * - A delivery charge can be specified.
 * - No promotion discounts are applied (discount_amount = 0 on all lines).
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

  const deliveryAmountRaw = input.deliveryAmount.trim();
  if (!decimalPattern.test(deliveryAmountRaw))
    throw new OrderDomainError('VALIDATION_FAILED', 'Delivery amount must be a non-negative decimal.');

  ensureAddress(input.deliveryAddress);

  for (const line of input.lines) {
    const qty = line.quantity.trim();
    const price = line.unitPrice.trim();
    if (!positiveDecimalPattern.test(qty))
      throw new OrderDomainError('VALIDATION_FAILED', 'Line quantity must be a positive decimal.');
    if (!decimalPattern.test(price))
      throw new OrderDomainError('VALIDATION_FAILED', 'Line unit price must be a non-negative decimal.');
  }

  const currency = input.currency ?? 'BDT';

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
            deliveryAmount: deliveryAmountRaw,
            paymentMethod: input.paymentMethod,
          }),
        ),
      });
      if (!record.created) {
        if (record.status === 'SUCCEEDED') {
          const idRecord = await sql<{ result_entity_id: string | null }>`select result_entity_id::text from platform.idempotency_records where id = ${record.id}`.execute(transaction);
          if (idRecord.rows[0]?.result_entity_id) {
            return orderView(transaction, idRecord.rows[0].result_entity_id);
          }
        }
        throw new OrderDomainError('IDEMPOTENCY_CONFLICT', 'This manual order request is already in progress.');
      }
      recordId = record.id;
    } catch (error) {
      if (error instanceof IdempotencyKeyReuseError)
        throw new OrderDomainError('IDEMPOTENCY_CONFLICT', 'The idempotency key was reused for different order details.');
      throw error;
    }

    // ---- Customer guard ----------------------------------------------------
    const customerRow = await sql<{ id: string; status: string; display_name: string }>`
      select id, status, display_name
      from customers.customers
      where id = ${input.customerId} and organization_id = ${input.organizationId}
      for share
    `.execute(transaction);
    const customer = customerRow.rows[0];
    if (!customer)
      throw new OrderDomainError('NOT_FOUND', 'Customer was not found.');
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
      throw new OrderDomainError('VALIDATION_FAILED', 'Location was not found or is not a STOCK_HOLDING location.');

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
      optionSnapshot: readonly { name: string; value: string }[];
      quantity: string;
      unitPrice: string;
      gross: string;
    }[] = [];

    for (const line of sortedLines) {
      const variantRow = await sql<{
        variant_id: string;
        product_id: string;
        inventory_item_id: string;
        sku: string;
        product_title: string;
        variant_title: string | null;
        option_snapshot: readonly { name: string; value: string }[];
      }>`
        select
          v.id as variant_id, p.id as product_id, item.id as inventory_item_id,
          v.sku, p.title as product_title, v.title as variant_title,
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
      const gross = (Number(line.quantity) * Number(line.unitPrice)).toFixed(4);
      resolvedLines.push({
        variantId: variant.variant_id,
        productId: variant.product_id,
        inventoryItemId: variant.inventory_item_id,
        sku: variant.sku,
        productTitle: variant.product_title,
        variantTitle: variant.variant_title,
        optionSnapshot: variant.option_snapshot,
        quantity: line.quantity.trim(),
        unitPrice: line.unitPrice.trim(),
        gross,
      });
    }

    // ---- Compute totals ---------------------------------------------------
    const subtotalAmount = resolvedLines
      .reduce((sum, l) => sum + Number(l.gross), 0)
      .toFixed(4);
    const totalAmount = (Number(subtotalAmount) + Number(deliveryAmountRaw)).toFixed(4);

    // ---- Insert order header -----------------------------------------------
    const orderNumber = await nextOrderNumber(transaction, input.organizationId);
    const orderCreated = await sql<{ id: string }>`
      insert into orders.orders (
        organization_id, order_number, customer_id, source, currency_code,
        order_status, payment_method,
        subtotal_amount, discount_amount, delivery_amount, tax_amount, total_amount
      ) values (
        ${input.organizationId}, ${orderNumber}, ${input.customerId}, 'MANUAL',
        ${currency}, 'PENDING', ${input.paymentMethod},
        ${subtotalAmount}::numeric, 0::numeric,
        ${deliveryAmountRaw}::numeric, 0::numeric,
        ${totalAmount}::numeric
      ) returning id
    `.execute(transaction);
    const orderId = orderCreated.rows[0]?.id;
    if (!orderId) throw new Error('Manual order creation did not return an id.');

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
        (order_id, organization_id, customer_id, display_name, phone, email)
      values (${orderId}, ${input.organizationId}, ${input.customerId},
        ${customer.display_name}, ${phone}, ${email})
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
          unit_price, gross_amount, discount_amount, net_amount
        ) values (
          ${input.organizationId}, ${orderId}, ${line.productId}, ${line.variantId},
          ${line.inventoryItemId},
          ${line.quantity}::numeric, ${line.sku}, ${line.productTitle},
          ${line.variantTitle}, ${JSON.stringify(line.optionSnapshot)}::jsonb,
          ${line.unitPrice}::numeric, ${line.gross}::numeric,
          0::numeric, ${line.gross}::numeric
        ) returning id
      `.execute(transaction);
      const lineId = created.rows[0]?.id;
      if (!lineId) throw new Error('Order line creation did not return an id.');

      // Shared reservation primitive \u2014 same function used by placeOrder.
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
      metadata: { orderNumber, source: 'MANUAL', paymentMethod: input.paymentMethod },
    });
    await sql`
      insert into platform.outbox_events (
        organization_id, event_type, event_version, aggregate_type, aggregate_id, aggregate_version, payload, occurred_at
      ) values (
        ${input.organizationId}, 'orders.order.placed', 1, 'orders.order', ${orderId}, 1,
        ${JSON.stringify({ orderId, orderNumber, source: 'MANUAL' })}::jsonb, now()
      )
    `.execute(transaction);

    return orderView(transaction, orderId);
  });
}

export async function processOrderOutbox(db: Kysely<DatabaseSchema>): Promise<number> {
  const result = await sql<{
    event_id: string;
    organization_id: string;
    aggregate_id: string;
  }>`
    with next_batch as (
      select event.id, event.organization_id, event.aggregate_id
      from platform.outbox_events event
      left join platform.event_consumer_receipts receipt 
        on receipt.outbox_event_id = event.id 
        and receipt.consumer_name = 'orders.autocomplete.v1'
      where event.event_type = 'delivery.all_lines_delivered'
        and receipt.id is null
      order by event.occurred_at asc
      limit 100
      for update of event skip locked
    ),
    marked as (
      insert into platform.event_consumer_receipts (outbox_event_id, consumer_name, status, processed_at)
      select id, 'orders.autocomplete.v1', 'COMPLETED', now()
      from next_batch
    )
    select id as event_id, organization_id, aggregate_id from next_batch
  `.execute(db);

  let processed = 0;
  for (const row of result.rows) {
    try {
      await completeOrder(db, {
        organizationId: row.organization_id,
        orderId: row.aggregate_id,
        actorId: null,
        idempotencyKey: `auto-complete:${row.event_id}`,
        triggerOutboxEventId: row.event_id,
      });
      processed++;
    } catch (error) {
      if (error instanceof OrderDomainError) {
        // Skip invalid transition errors (already completed or changed)
        processed++;
      } else {
        // We log and let the lease expire if it was an infrastructure error, or just continue
        console.error('Failed to auto-complete order', row.aggregate_id, error);
      }
    }
  }

  return processed;
}
