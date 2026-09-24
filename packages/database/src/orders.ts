import { sql, type Kysely } from 'kysely';

import { generateOpaqueToken, hashToken } from '@maevelle/security';

import type { DatabaseSchema } from './index.js';
import {
  CustomerDomainError,
  resolveOrCreateOrderCustomerInTransaction,
  type CustomerSource,
} from './customers.js';
import { normalizeCustomerPhone } from './customer-identities.js';
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
  createCancellationRefundObligationsInTransaction,
  getOrderPaymentSummary,
  listPaymentMethods,
  PaymentDomainError,
  requireActivePaymentMethod,
  reviseOpenPaymentIntentForOrder,
  type PaymentMethodCode,
  type PaymentSummary,
} from './payments.js';
import {
  cancelOpenFulfillmentsForOrderInTransaction,
  FulfillmentDomainError,
} from './fulfillment.js';

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
  readonly deliveryAmount: string;
  readonly total: string;
  readonly cart: CartView;
  readonly contact: CheckoutContactInput | null;
  readonly address: CheckoutAddressInput | null;
  readonly orderNumber?: string;
}

export interface OrderView {
  readonly id: string;
  readonly version: number;
  readonly orderNumber: string;
  readonly status: 'PENDING' | 'CONFIRMED' | 'ON_HOLD' | 'COMPLETED' | 'CANCELLED';
  readonly source: 'STOREFRONT' | 'MANUAL';
  readonly salesChannel:
    | 'STOREFRONT'
    | 'ADMIN'
    | 'FACEBOOK'
    | 'INSTAGRAM'
    | 'WHATSAPP'
    | 'PHONE'
    | 'EXTERNAL_API'
    | 'IMPORT';
  readonly currency: string;
  readonly total: string;
  readonly createdAt: string;
  readonly customerName?: string;
  readonly customerPhone?: string;
  readonly customerEmail?: string | null;
  readonly customerId?: string | null;
  readonly paymentMethod: PaymentMethodCode;
  readonly paymentStatus: string;
  readonly payment: PaymentSummary;
  readonly merchandiseGross: string;
  readonly discountTotal: string;
  readonly merchandiseNet: string;
  readonly deliveryAmount: string;
  readonly taxAmount: string;
  readonly customer: { displayName: string; phone: string; email: string | null };
  readonly address: CheckoutAddressInput;
  readonly lines: readonly {
    id: string;
    variantId: string | null;
    sku: string;
    productTitle: string;
    variantTitle: string | null;
    quantity: string;
    unitPrice: string;
    gross: string;
    discount: string;
    net: string;
    status: 'ACTIVE' | 'CANCELLED';
    cancellationReasonCode: string | null;
    cancellationReasonText: string | null;
    cancelledAt: string | null;
    options: readonly { name: string; value: string }[];
  }[];
}

interface DeliveryQuote {
  readonly ruleId: string | null;
  readonly ruleName: string;
  readonly amount: string;
  readonly currency: string;
}

function checkoutTotals(cart: CartView, quote: DeliveryQuote | null = null) {
  const deliveryAmount = quote?.amount ?? '0';
  return {
    merchandiseGross: cart.merchandiseGross,
    discountTotal: cart.discountTotal,
    merchandiseNet: cart.merchandiseNet,
    deliveryAmount,
    total: decimal4Text(decimal4Minor(cart.merchandiseNet) + decimal4Minor(deliveryAmount)),
  };
}

function checkoutFingerprint(cart: CartView, quote: DeliveryQuote | null): string {
  return hashToken(
    JSON.stringify({
      cart: cart.calculationFingerprint,
      deliveryRuleId: quote?.ruleId ?? null,
      deliveryAmount: quote?.amount ?? '0',
    }),
  );
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
  try {
    normalizeCustomerPhone(input.phone);
  } catch {
    throw new OrderDomainError('VALIDATION_FAILED', 'A valid delivery phone number is required.');
  }
}

async function resolveDeliveryQuote(
  db: Kysely<DatabaseSchema>,
  input: { organizationId: string; currency: string; countryCode: string; geographyNodeId?: string },
): Promise<DeliveryQuote> {
  const result = await sql<{
    id: string;
    name: string;
    flat_amount: string;
    currency_code: string;
  }>`
    with recursive ancestry(id, depth) as (
      select ${input.geographyNodeId ?? null}::uuid, 0 where ${input.geographyNodeId ?? null}::uuid is not null
      union all
      select node.parent_id, ancestry.depth + 1
      from geography.nodes node join ancestry on ancestry.id = node.id
      where node.parent_id is not null
    )
    select rule.id, rule.name, rule.flat_amount::text, rule.currency_code
    from orders.delivery_pricing_rules rule
    where rule.organization_id = ${input.organizationId}
      and rule.status = 'ACTIVE'
      and rule.country_code = ${input.countryCode.toUpperCase()}
      and rule.currency_code = ${input.currency}
      and (rule.geography_node_id is null or rule.geography_node_id in (select id from ancestry))
    order by rule.priority desc,
      case when rule.geography_node_id is null then 1000000 else coalesce((select depth from ancestry where id = rule.geography_node_id), 1000000) end,
      rule.id
    limit 1
  `.execute(db);
  const row = result.rows[0];
  if (!row)
    throw new OrderDomainError(
      'VALIDATION_FAILED',
      'Delivery is not configured for this address and currency.',
    );
  return { ruleId: row.id, ruleName: row.name, amount: row.flat_amount, currency: row.currency_code };
}

async function quoteForCheckout(
  db: Kysely<DatabaseSchema>,
  checkout: Awaited<ReturnType<typeof checkoutRow>>,
  cart: CartView,
): Promise<DeliveryQuote | null> {
  if (!checkout.country_code) return null;
  return resolveDeliveryQuote(db, {
    organizationId: checkout.organization_id,
    currency: cart.currency,
    countryCode: checkout.country_code,
    ...(checkout.geography_node_id ? { geographyNodeId: checkout.geography_node_id } : {}),
  });
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
    delivery_pricing_rule_id: string | null;
    delivery_amount: string;
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
    deliveryAmount: row.delivery_amount,
    total: decimal4Text(decimal4Minor(cart.merchandiseNet) + decimal4Minor(row.delivery_amount)),
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
    values (${organizationId}, ${cart.id}, ${hashToken(token)}, ${cart.version}, ${cart.calculationVersion}, ${checkoutFingerprint(cart, null)}, ${JSON.stringify(checkoutTotals(cart))}::jsonb, ${expiresAt}) returning id
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
      calculationFingerprint: checkoutFingerprint(cart, null),
      deliveryAmount: '0',
      total: cart.merchandiseNet,
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
    deliveryAmount: row.delivery_amount,
    total: decimal4Text(decimal4Minor(cart.merchandiseNet) + decimal4Minor(row.delivery_amount)),
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
    const quote = await resolveDeliveryQuote(transaction, {
      organizationId: checkout.organization_id,
      currency: cart.currency,
      countryCode: input.address.countryCode,
      ...(input.address.geographyNodeId ? { geographyNodeId: input.address.geographyNodeId } : {}),
    });
    const updated = await sql<{ version: string }>`
      update orders.checkout_sessions set recipient_name = ${input.address.recipientName.trim()}, delivery_phone = ${input.address.phone.trim()},
        address_line_1 = ${input.address.addressLine1.trim()}, address_line_2 = ${input.address.addressLine2?.trim() ?? null},
        geography_node_id = ${input.address.geographyNodeId ?? null}, area = ${input.address.area?.trim() ?? null}, city = ${input.address.city?.trim() ?? null},
        district = ${input.address.district?.trim() ?? null}, postal_code = ${input.address.postalCode?.trim() ?? null}, country_code = ${input.address.countryCode},
        delivery_pricing_rule_id = ${quote.ruleId}, delivery_amount = ${quote.amount}::numeric,
        calculation_fingerprint = ${checkoutFingerprint(cart, quote)}, calculated_totals = ${JSON.stringify(checkoutTotals(cart, quote))}::jsonb,
        status = 'ACTIVE', version = version + 1, updated_at = now() where id = ${checkout.id} returning version::text
    `.execute(transaction);
    return {
      ...checkoutInputView(
        {
          ...checkout,
          version: updated.rows[0]!.version,
          status: 'ACTIVE',
          delivery_pricing_rule_id: quote.ruleId,
          delivery_amount: quote.amount,
          calculation_fingerprint: checkoutFingerprint(cart, quote),
        },
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

export async function listDeliveryPricingRules(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
) {
  return (
    await sql<{
      id: string;
      name: string;
      country_code: string;
      geography_node_id: string | null;
      flat_amount: string;
      currency_code: string;
      priority: number;
      status: 'ACTIVE' | 'INACTIVE';
      version: string;
    }>`select id,name,country_code,geography_node_id,flat_amount::text,currency_code,priority,status,version::text from orders.delivery_pricing_rules where organization_id=${organizationId} order by status,priority desc,name,id`.execute(
      db,
    )
  ).rows.map((row) => ({ ...row, version: Number(row.version) }));
}

export async function createDeliveryPricingRule(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    name: string;
    countryCode: string;
    geographyNodeId?: string;
    flatAmount: string;
    currency: string;
    priority?: number;
  },
) {
  if (!input.name.trim() || !/^[A-Z]{2}$/.test(input.countryCode) || !/^[A-Z]{3}$/.test(input.currency))
    throw new OrderDomainError('VALIDATION_FAILED', 'Delivery pricing rule details are invalid.');
  if (!decimalPattern.test(input.flatAmount) || decimal4Minor(input.flatAmount) < 0n)
    throw new OrderDomainError('VALIDATION_FAILED', 'Delivery amount is invalid.');
  if (!Number.isInteger(input.priority ?? 0))
    throw new OrderDomainError('VALIDATION_FAILED', 'Delivery pricing priority must be an integer.');
  return db.transaction().execute(async (transaction) => {
    if (input.geographyNodeId) {
      const geography = await sql<{ id: string }>`select id from geography.nodes where id=${input.geographyNodeId} and status='ACTIVE'`.execute(
        transaction,
      );
      if (!geography.rows[0])
        throw new OrderDomainError('VALIDATION_FAILED', 'Delivery geography was not found.');
    }
    const conflicting = await sql<{ id: string }>`
      select id from orders.delivery_pricing_rules
      where organization_id=${input.organizationId} and status='ACTIVE'
        and country_code=${input.countryCode}
        and currency_code=${input.currency}
        and coalesce(geography_node_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(${input.geographyNodeId ?? null}::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
        and priority=${input.priority ?? 0}
      limit 1
    `.execute(transaction);
    if (conflicting.rows[0])
      throw new OrderDomainError(
        'VALIDATION_FAILED',
        'An active delivery pricing rule already has this country, geography, and priority.',
      );
    const result = await sql<{ id: string; version: string }>`
      insert into orders.delivery_pricing_rules (organization_id,name,country_code,geography_node_id,flat_amount,currency_code,priority)
      values (${input.organizationId},${input.name.trim()},${input.countryCode},${input.geographyNodeId ?? null},${input.flatAmount}::numeric,${input.currency},${input.priority ?? 0})
      returning id,version::text
    `.execute(transaction);
    await appendAuditEvent(transaction, {
      organizationId: input.organizationId,
      actorType: 'USER',
      actorId: input.actorId,
      action: 'orders.delivery_pricing_rule.created',
      targetType: 'orders.delivery_pricing_rule',
      targetId: result.rows[0]!.id,
      metadata: { countryCode: input.countryCode, flatAmount: input.flatAmount, priority: input.priority ?? 0 },
    });
    return { id: result.rows[0]!.id, version: Number(result.rows[0]!.version) };
  });
}

export async function updateDeliveryPricingRule(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    ruleId: string;
    expectedVersion: number;
    name: string;
    countryCode: string;
    geographyNodeId?: string;
    flatAmount: string;
    currency: string;
    priority: number;
    status: 'ACTIVE' | 'INACTIVE';
  },
) {
  if (!input.name.trim() || !/^[A-Z]{2}$/.test(input.countryCode) || !/^[A-Z]{3}$/.test(input.currency))
    throw new OrderDomainError('VALIDATION_FAILED', 'Delivery pricing rule details are invalid.');
  if (!decimalPattern.test(input.flatAmount) || decimal4Minor(input.flatAmount) < 0n)
    throw new OrderDomainError('VALIDATION_FAILED', 'Delivery amount is invalid.');
  if (!Number.isInteger(input.priority))
    throw new OrderDomainError('VALIDATION_FAILED', 'Delivery pricing priority must be an integer.');
  return db.transaction().execute(async (transaction) => {
    if (input.geographyNodeId) {
      const geography = await sql<{ id: string }>`select id from geography.nodes where id=${input.geographyNodeId} and status='ACTIVE'`.execute(
        transaction,
      );
      if (!geography.rows[0])
        throw new OrderDomainError('VALIDATION_FAILED', 'Delivery geography was not found.');
    }
    if (input.status === 'ACTIVE') {
      const conflicting = await sql<{ id: string }>`
        select id from orders.delivery_pricing_rules
        where organization_id=${input.organizationId} and status='ACTIVE' and id<>${input.ruleId}
          and country_code=${input.countryCode}
          and currency_code=${input.currency}
          and coalesce(geography_node_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(${input.geographyNodeId ?? null}::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
          and priority=${input.priority}
        limit 1
      `.execute(transaction);
      if (conflicting.rows[0])
        throw new OrderDomainError(
          'VALIDATION_FAILED',
          'An active delivery pricing rule already has this country, geography, and priority.',
        );
    }
    const updated = await sql<{ version: string }>`
      update orders.delivery_pricing_rules
      set name=${input.name.trim()},country_code=${input.countryCode},geography_node_id=${input.geographyNodeId ?? null},
          flat_amount=${input.flatAmount}::numeric,currency_code=${input.currency},priority=${input.priority},status=${input.status},
          version=version+1,updated_at=now()
      where organization_id=${input.organizationId} and id=${input.ruleId} and version=${input.expectedVersion}
      returning version::text
    `.execute(transaction);
    if (updated.rows[0]) {
      await appendAuditEvent(transaction, {
        organizationId: input.organizationId,
        actorType: 'USER',
        actorId: input.actorId,
        action: 'orders.delivery_pricing_rule.updated',
        targetType: 'orders.delivery_pricing_rule',
        targetId: input.ruleId,
        metadata: { countryCode: input.countryCode, flatAmount: input.flatAmount, priority: input.priority, status: input.status },
      });
      return { id: input.ruleId, version: Number(updated.rows[0].version) };
    }
    const exists = await sql<{ id: string }>`select id from orders.delivery_pricing_rules where organization_id=${input.organizationId} and id=${input.ruleId}`.execute(transaction);
    if (!exists.rows[0]) throw new OrderDomainError('NOT_FOUND', 'Delivery pricing rule was not found.');
    throw new OrderDomainError('STALE_VERSION', 'Delivery pricing rule changed; reload before saving.');
  });
}

export async function refreshCheckout(
  db: Kysely<DatabaseSchema>,
  input: { checkoutToken: string; cartToken: string; expectedVersion: number },
): Promise<CheckoutView> {
  return db.transaction().execute(async (transaction) => {
    const { checkout, cart } = await activeCheckout(transaction, input);
    const quote = await quoteForCheckout(transaction, checkout, cart);
    const updated = await sql<{ version: string }>`
      update orders.checkout_sessions set cart_version = ${cart.version}, calculation_version = ${cart.calculationVersion},
        delivery_pricing_rule_id = ${quote?.ruleId ?? null}, delivery_amount = ${quote?.amount ?? '0'}::numeric,
        calculation_fingerprint = ${checkoutFingerprint(cart, quote)}, calculated_totals = ${JSON.stringify(checkoutTotals(cart, quote))}::jsonb,
        status = 'ACTIVE', version = version + 1, updated_at = now() where id = ${checkout.id} returning version::text
    `.execute(transaction);
    return checkoutInputView(
      {
        ...checkout,
        version: updated.rows[0]!.version,
        status: 'ACTIVE',
        calculation_version: String(cart.calculationVersion),
        delivery_pricing_rule_id: quote?.ruleId ?? null,
        delivery_amount: quote?.amount ?? '0',
        calculation_fingerprint: checkoutFingerprint(cart, quote),
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
    order_status: OrderView['status'];
    source: OrderView['source'];
    sales_channel: OrderView['salesChannel'];
    currency_code: string;
    payment_method: PaymentMethodCode;
    subtotal_amount: string;
    discount_amount: string;
    merchandise_net: string;
    total_amount: string;
    delivery_amount: string;
    tax_amount: string;
    version: string;
    created_at: Date;
    display_name: string;
    customer_id: string | null;
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
    select order_row.id, order_row.organization_id, order_row.order_number, order_row.order_status,
      order_row.source, order_row.sales_channel, order_row.currency_code, order_row.payment_method, order_row.version::text,
      order_row.subtotal_amount::text, order_row.discount_amount::text, order_row.delivery_amount::text,
      (order_row.subtotal_amount - order_row.discount_amount)::text as merchandise_net,
      order_row.tax_amount::text, order_row.total_amount::text, order_row.created_at,
      customer.customer_id::text as customer_id, customer.display_name, customer.phone, customer.email, address.recipient_name, address.phone as delivery_phone, address.address_line_1, address.address_line_2,
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
    variant_id: string | null;
    sku_snapshot: string;
    product_title_snapshot: string;
    variant_title_snapshot: string | null;
    quantity: string;
    unit_price: string;
    gross_amount: string;
    discount_amount: string;
    net_amount: string;
    line_status: 'ACTIVE' | 'CANCELLED';
    cancellation_reason_code: string | null;
    cancellation_reason_text: string | null;
    cancelled_at: Date | null;
    option_snapshot: readonly { name: string; value: string }[];
  }>`
    select id, variant_id, sku_snapshot, product_title_snapshot, variant_title_snapshot,
      quantity::text, unit_price::text, gross_amount::text, discount_amount::text, net_amount::text,
      line_status, cancellation_reason_code, cancellation_reason_text, cancelled_at, option_snapshot
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
    source: row.source,
    salesChannel: row.sales_channel,
    currency: row.currency_code,
    total: row.total_amount,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
    customerName: row.display_name,
    customerPhone: row.phone,
    customerEmail: row.email,
    customerId: row.customer_id ?? null,
    paymentMethod: row.payment_method,
    paymentStatus: payment.status,
    payment,
    merchandiseGross: row.subtotal_amount,
    discountTotal: row.discount_amount,
    merchandiseNet: row.merchandise_net,
    deliveryAmount: row.delivery_amount,
    taxAmount: row.tax_amount,
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
      variantId: line.variant_id,
      sku: line.sku_snapshot,
      productTitle: line.product_title_snapshot,
      variantTitle: line.variant_title_snapshot,
      quantity: line.quantity,
      unitPrice: line.unit_price,
      gross: line.gross_amount,
      discount: line.discount_amount,
      net: line.net_amount,
      status: line.line_status,
      cancellationReasonCode: line.cancellation_reason_code,
      cancellationReasonText: line.cancellation_reason_text,
      cancelledAt: line.cancelled_at?.toISOString() ?? null,
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
  readonly fulfillmentStatus: OrderFulfillmentStatus;
  readonly deliveryStatus: OrderDeliveryStatus;
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
    refundSettlement: 'NOT_REQUIRED' | 'REFUND_PENDING' | 'PARTIALLY_REFUNDED' | 'REFUNDED';
    refundObligations: readonly { id: string; amount: string; status: string }[];
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
    cancellationRefundsQuery,
  ] = await Promise.all([
    baseOrderPromise,
    sql<{ id: string; author_actor_id: string; note_type: string; body: string; created_at: Date }>`
      select id, author_actor_id, note_type, body, created_at
      from orders.order_notes
      where order_id = ${input.orderId}
      order by created_at desc limit 20
    `.execute(db),
    sql<{
      id: string;
      event_type: string;
      aggregate_type: string;
      aggregate_id: string;
      occurred_at: Date;
      payload: Record<string, unknown>;
    }>`
      select id, event_type, aggregate_type, aggregate_id, occurred_at, payload
      from platform.outbox_events
      where aggregate_type in ('orders.order', 'fulfillment.fulfillment', 'delivery.delivery', 'returns.return_case')
        and payload->>'orderId' = ${input.orderId}
      order by occurred_at desc limit 30
    `.execute(db),
    sql<{
      id: string;
      fulfillment_number: string;
      status: string;
      location_id: string;
      dispatched_at: Date | null;
      allocated_quantity: string;
    }>`
      select record.id, record.fulfillment_number, record.status, record.location_id,
        record.dispatched_at, coalesce(sum(line.quantity), 0)::text as allocated_quantity
      from fulfillment.fulfillments record
      left join fulfillment.fulfillment_lines line
        on line.organization_id = record.organization_id and line.fulfillment_id = record.id
      where record.organization_id = ${input.organizationId} and record.order_id = ${input.orderId}
      group by record.id
      order by record.created_at desc
    `.execute(db),
    sql<{
      id: string;
      delivery_number: string;
      operational_status: string;
      outcome_status: string | null;
      tracking_reference: string | null;
      dispatched_at: Date | null;
      delivered_at: Date | null;
    }>`
      select d.id, d.delivery_number, d.operational_status, d.outcome_status, d.tracking_reference,
        f.dispatched_at, d.delivered_at
      from delivery.deliveries d
      join fulfillment.fulfillments f on f.id = d.fulfillment_id
      where d.order_id = ${input.orderId}
      order by d.created_at desc
    `.execute(db),
    sql<{
      id: string;
      return_number: string;
      case_status: string;
      case_type: string;
      created_at: Date;
    }>`
      select id, return_number, case_status, case_type, created_at
      from returns.return_cases
      where order_id = ${input.orderId}
      order by created_at desc
    `.execute(db),
    sql<{ id: string; amount: string; status: string; created_at: Date }>`
      select r.id, r.amount::text, r.status, r.created_at
      from payments.refunds r
      where r.organization_id = ${input.organizationId} and r.order_id = ${input.orderId}
      order by r.created_at desc
    `.execute(db),
    sql<{
      promotion_name: string;
      coupon_code: string | null;
      benefit_type: string;
      benefit_value: string;
      discount_amount: string;
    }>`
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
    sql<{ id: string; amount: string; status: string }>`
      select refund.id, refund.amount::text, refund.status
      from orders.order_cancellation_refunds link
      join payments.refunds refund
        on refund.organization_id = link.organization_id and refund.id = link.refund_id
      where link.organization_id = ${input.organizationId} and link.order_id = ${input.orderId}
      order by refund.created_at, refund.id
    `.execute(db),
  ]);

  const orderedQuantity = baseOrder.lines.reduce(
    (total, line) => (line.status === 'ACTIVE' ? total + decimal6Minor(line.quantity) : total),
    0n,
  );
  const activeFulfillments = fulfillmentsQuery.rows.filter((row) => row.status !== 'CANCELLED');
  const allocatedQuantity = activeFulfillments.reduce(
    (total, row) => total + decimal6Minor(row.allocated_quantity),
    0n,
  );
  const fulfillmentStatus: OrderFulfillmentStatus =
    baseOrder.status === 'CANCELLED'
      ? 'CANCELLED'
      : activeFulfillments.length === 0
        ? 'UNFULFILLED'
        : allocatedQuantity < orderedQuantity
          ? 'PARTIALLY_FULFILLED'
          : activeFulfillments.some((row) => row.status !== 'DISPATCHED')
            ? 'IN_PROGRESS'
            : 'FULFILLED';
  const deliveryStatus: OrderDeliveryStatus =
    baseOrder.status === 'CANCELLED'
      ? 'CANCELLED'
      : deliveriesQuery.rows.length === 0
        ? 'NOT_STARTED'
        : deliveriesQuery.rows.some((row) =>
              ['FAILED', 'LOST', 'DAMAGED'].includes(row.outcome_status ?? ''),
            )
          ? 'FAILED'
          : deliveriesQuery.rows.every((row) => row.outcome_status === 'DELIVERED')
            ? 'DELIVERED'
            : deliveriesQuery.rows.some((row) => row.outcome_status === 'DELIVERED')
              ? 'PARTIALLY_DELIVERED'
              : deliveriesQuery.rows.some((row) =>
                    ['BOOKED', 'HANDED_OVER', 'IN_TRANSIT'].includes(row.operational_status),
                  )
                ? 'IN_TRANSIT'
                : deliveriesQuery.rows.every(
                      (row) => row.outcome_status === 'CANCELLED_BEFORE_HANDOVER',
                    )
                  ? 'CANCELLED'
                  : 'PENDING';

  return {
    ...baseOrder,
    fulfillmentStatus,
    deliveryStatus,
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
    returnCases: returnsQuery.rows.map((row) => ({
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
          refundSettlement:
            cancellationRefundsQuery.rows.length === 0
              ? 'NOT_REQUIRED'
              : cancellationRefundsQuery.rows.every((refund) => refund.status === 'COMPLETED')
                ? 'REFUNDED'
                : cancellationRefundsQuery.rows.some((refund) => refund.status === 'COMPLETED')
                  ? 'PARTIALLY_REFUNDED'
                  : 'REFUND_PENDING',
          refundObligations: cancellationRefundsQuery.rows.map((refund) => ({
            id: refund.id,
            amount: refund.amount,
            status: refund.status,
          })),
        }
      : null,
  };
}

export interface OrderListFilters {
  readonly page?: number;
  readonly pageSize?: number;
  readonly status?: OrderView['status'];
  readonly paymentStatus?: OrderPaymentStatus;
  readonly fulfillmentStatus?: OrderFulfillmentStatus;
  readonly deliveryStatus?: OrderDeliveryStatus;
  readonly paymentMethod?: PaymentMethodCode;
  readonly salesChannel?: OrderView['salesChannel'];
  readonly source?: OrderView['source'];
  /** Searched against historical order number, customer name, phone, and email snapshots. */
  readonly q?: string;
  readonly from?: string;
  readonly to?: string;
  /** When provided, also resolves MERGED alias customers to include their orders. */
  readonly customerId?: string;
}

export type OrderPaymentStatus =
  | 'UNPAID'
  | 'PAYMENT_PENDING'
  | 'PARTIALLY_PAID'
  | 'PAID'
  | 'PARTIALLY_REFUNDED'
  | 'REFUNDED'
  | 'EXPIRED'
  | 'CANCELLED';
export type OrderFulfillmentStatus =
  'UNFULFILLED' | 'PARTIALLY_FULFILLED' | 'IN_PROGRESS' | 'FULFILLED' | 'CANCELLED';
export type OrderDeliveryStatus =
  | 'NOT_STARTED'
  | 'PENDING'
  | 'IN_TRANSIT'
  | 'PARTIALLY_DELIVERED'
  | 'DELIVERED'
  | 'FAILED'
  | 'CANCELLED';

export interface OrderListItem {
  readonly id: string;
  readonly orderNumber: string;
  readonly source: string;
  readonly salesChannel: OrderView['salesChannel'];
  readonly status: string;
  readonly paymentMethod: PaymentMethodCode;
  readonly paymentStatus: OrderPaymentStatus;
  readonly fulfillmentStatus: OrderFulfillmentStatus;
  readonly deliveryStatus: OrderDeliveryStatus;
  readonly total: string;
  readonly deliveryAmount: string;
  readonly currency: string;
  readonly customerName: string;
  readonly customerId: string | null;
  readonly customerPhone: string;
  readonly customerEmail: string | null;
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
      where organization_id = ${organizationId}
        and (canonical_customer_id = ${filters.customerId}
          or alias_customer_id = ${filters.customerId})
    `.execute(db);
    customerIds = aliasResult.rows.map((r) => r.customer_id);
  }

  const searchTerm = filters?.q?.trim() ?? null;
  let normalizedSearchPhone: string | null = null;
  if (searchTerm) {
    try {
      normalizedSearchPhone = normalizeCustomerPhone(searchTerm);
    } catch {
      normalizedSearchPhone = null;
    }
  }

  const result = await sql<{
    id: string;
    order_number: string;
    source: string;
    sales_channel: OrderView['salesChannel'];
    order_status: string;
    payment_method: PaymentMethodCode;
    total_amount: string;
    delivery_amount: string;
    currency_code: string;
    display_name: string;
    customer_id: string | null;
    phone: string;
    normalized_phone: string;
    email: string | null;
    created_at: Date;
    payment_status: OrderPaymentStatus;
    fulfillment_status: OrderFulfillmentStatus;
    delivery_status: OrderDeliveryStatus;
    total_count: string;
  }>`
    with projected as (
      select
        o.id, o.order_number, o.source, o.sales_channel, o.order_status, o.payment_method,
        o.total_amount::text, o.delivery_amount::text, o.currency_code,
        snap.display_name, snap.customer_id, snap.phone, snap.normalized_phone, snap.email,
        o.created_at,
        case
          when pay.refunded > 0 and pay.collected - pay.refunded <= 0 then 'REFUNDED'
          when pay.refunded > 0 then 'PARTIALLY_REFUNDED'
          when pay.collected >= o.total_amount and o.total_amount > 0 then 'PAID'
          when pay.collected > 0 then 'PARTIALLY_PAID'
          when pay.pending_attempt_count > 0 then 'PAYMENT_PENDING'
          when pay.intent_status = 'EXPIRED' then 'EXPIRED'
          when pay.intent_status = 'CANCELLED' then 'CANCELLED'
          else 'UNPAID'
        end as payment_status,
        case
          when o.order_status = 'CANCELLED' then 'CANCELLED'
          when fulfillment.allocated_quantity = 0 then 'UNFULFILLED'
          when fulfillment.allocated_quantity < lines.ordered_quantity then 'PARTIALLY_FULFILLED'
          when fulfillment.open_count > 0 then 'IN_PROGRESS'
          else 'FULFILLED'
        end as fulfillment_status,
        case
          when o.order_status = 'CANCELLED' then 'CANCELLED'
          when shipment.delivery_count = 0 then 'NOT_STARTED'
          when shipment.failed_count > 0 then 'FAILED'
          when shipment.delivered_count = shipment.delivery_count then 'DELIVERED'
          when shipment.delivered_count > 0 then 'PARTIALLY_DELIVERED'
          when shipment.in_transit_count > 0 then 'IN_TRANSIT'
          when shipment.cancelled_count = shipment.delivery_count then 'CANCELLED'
          else 'PENDING'
        end as delivery_status
      from orders.orders o
      join orders.order_customer_snapshots snap
        on snap.organization_id = o.organization_id and snap.order_id = o.id
      left join lateral (
        select
          (select intent.status from payments.payment_intents intent
            where intent.organization_id = o.organization_id and intent.order_id = o.id
            order by intent.created_at desc, intent.id desc limit 1) as intent_status,
          coalesce((select sum(allocation.amount)
            from payments.payment_allocations allocation
            join payments.payments payment
              on payment.organization_id = allocation.organization_id
              and payment.id = allocation.payment_id
            where allocation.organization_id = o.organization_id
              and allocation.order_id = o.id and payment.status = 'CONFIRMED'), 0) as collected,
          coalesce((select sum(refund.amount)
            from payments.refunds refund
            where refund.organization_id = o.organization_id
              and refund.order_id = o.id and refund.status = 'COMPLETED'), 0) as refunded,
          (select count(*) from payments.payment_attempts attempt
            join payments.payment_intents intent
              on intent.organization_id = attempt.organization_id
              and intent.id = attempt.payment_intent_id
            where intent.organization_id = o.organization_id and intent.order_id = o.id
              and attempt.status = 'PENDING_VERIFICATION') as pending_attempt_count
      ) pay on true
      left join lateral (
        select coalesce(sum(line.quantity), 0) as ordered_quantity
        from orders.order_lines line
        where line.organization_id = o.organization_id and line.order_id = o.id
          and line.line_status = 'ACTIVE'
      ) lines on true
      left join lateral (
        select
          coalesce(sum(line.quantity) filter (where record.status <> 'CANCELLED'), 0) as allocated_quantity,
          count(*) filter (where record.status not in ('DISPATCHED', 'CANCELLED')) as open_count
        from fulfillment.fulfillments record
        join fulfillment.fulfillment_lines line
          on line.organization_id = record.organization_id and line.fulfillment_id = record.id
        where record.organization_id = o.organization_id and record.order_id = o.id
      ) fulfillment on true
      left join lateral (
        select count(*) as delivery_count,
          count(*) filter (where delivery.outcome_status = 'DELIVERED') as delivered_count,
          count(*) filter (where delivery.outcome_status in ('FAILED', 'LOST', 'DAMAGED')) as failed_count,
          count(*) filter (where delivery.outcome_status = 'CANCELLED_BEFORE_HANDOVER') as cancelled_count,
          count(*) filter (where delivery.operational_status in ('BOOKED', 'HANDED_OVER', 'IN_TRANSIT')) as in_transit_count
        from delivery.deliveries delivery
        where delivery.organization_id = o.organization_id and delivery.order_id = o.id
      ) shipment on true
      where o.organization_id = ${organizationId}
    )
    select projected.*,
      count(*) over ()::text as total_count
    from projected
    where (${filters?.status ?? null}::text is null or order_status = ${filters?.status ?? null})
      and (${filters?.paymentStatus ?? null}::text is null or payment_status = ${filters?.paymentStatus ?? null})
      and (${filters?.fulfillmentStatus ?? null}::text is null or fulfillment_status = ${filters?.fulfillmentStatus ?? null})
      and (${filters?.deliveryStatus ?? null}::text is null or delivery_status = ${filters?.deliveryStatus ?? null})
      and (${filters?.paymentMethod ?? null}::text is null or payment_method = ${filters?.paymentMethod ?? null})
      and (${filters?.salesChannel ?? null}::text is null or sales_channel = ${filters?.salesChannel ?? null})
      and (${filters?.source ?? null}::text is null or source = ${filters?.source ?? null})
      and (${filters?.from ?? null}::text is null or created_at >= (${filters?.from ?? null})::timestamptz)
      and (${filters?.to ?? null}::text is null or created_at <= (${filters?.to ?? null})::timestamptz)
      and (
        ${customerIds ?? null}::uuid[] is null
        or customer_id = any(${customerIds ?? null}::uuid[])
      )
      and (
        ${searchTerm ?? null}::text is null
        or order_number ilike ${searchTerm ? `${searchTerm}%` : ''}
        or lower(display_name) like ${searchTerm ? `%${searchTerm.toLocaleLowerCase()}%` : ''}
        or lower(coalesce(email, '')) like ${searchTerm ? `%${searchTerm.toLocaleLowerCase()}%` : ''}
        or normalized_phone = ${normalizedSearchPhone ?? ''}
      )
    order by created_at desc, id desc
    limit ${pageSize} offset ${offset}
  `.execute(db);

  const totalItems = Number(result.rows[0]?.total_count ?? 0);

  const data: OrderListItem[] = result.rows.map((row) => ({
    id: row.id,
    orderNumber: row.order_number,
    source: row.source,
    salesChannel: row.sales_channel,
    status: row.order_status,
    paymentMethod: row.payment_method,
    paymentStatus: row.payment_status,
    fulfillmentStatus: row.fulfillment_status,
    deliveryStatus: row.delivery_status,
    total: row.total_amount,
    deliveryAmount: row.delivery_amount,
    currency: row.currency_code,
    customerName: row.display_name,
    customerId: row.customer_id ?? null,
    customerPhone: row.phone,
    customerEmail: row.email,
    createdAt: row.created_at.toISOString(),
  }));

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

/**
 * Cancels one complete line before fulfillment/payment activity begins. The
 * original line remains immutable evidence; active totals and obligations are
 * reduced atomically and the line's reservation is released through Inventory.
 */
export async function cancelOrderLine(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    orderId: string;
    orderLineId: string;
    expectedVersion: number;
    reasonCode: string;
    reasonText?: string;
    idempotencyKey: string;
  },
): Promise<OrderView> {
  const reasonCode = input.reasonCode.trim();
  const reasonText = input.reasonText?.trim() || null;
  if (!reasonCode)
    throw new OrderDomainError('VALIDATION_FAILED', 'A line cancellation reason is required.');

  return db.transaction().execute(async (transaction) => {
    let idempotencyRecordId: string;
    try {
      const record = await claimIdempotencyRecord(transaction, {
        organizationId: input.organizationId,
        principalType: 'USER',
        principalId: input.actorId,
        operationType: 'orders.cancel-line',
        idempotencyKey: input.idempotencyKey,
        requestFingerprint: JSON.stringify({
          orderId: input.orderId,
          orderLineId: input.orderLineId,
          expectedVersion: input.expectedVersion,
          reasonCode,
          reasonText,
        }),
      });
      if (!record.created) {
        if (record.status === 'SUCCEEDED') return orderView(transaction, input.orderId);
        throw new OrderDomainError(
          'IDEMPOTENCY_CONFLICT',
          'This line cancellation is already in progress.',
        );
      }
      idempotencyRecordId = record.id;
    } catch (error) {
      if (error instanceof IdempotencyKeyReuseError)
        throw new OrderDomainError('IDEMPOTENCY_CONFLICT', error.message);
      throw error;
    }

    const orderResult = await sql<{
      order_status: OrderView['status'];
      version: string;
      total_amount: string;
    }>`
      select order_status, version::text, total_amount::text
      from orders.orders
      where organization_id = ${input.organizationId} and id = ${input.orderId}
      for update
    `.execute(transaction);
    const order = orderResult.rows[0];
    if (!order) throw new OrderDomainError('NOT_FOUND', 'Order was not found.');
    if (Number(order.version) !== input.expectedVersion)
      throw new OrderDomainError(
        'STALE_VERSION',
        'Order has changed; reload before cancelling an item.',
      );
    if (!['PENDING', 'CONFIRMED', 'ON_HOLD'].includes(order.order_status))
      throw new OrderDomainError(
        'INVALID_TRANSITION',
        'Items can only be cancelled before an Order is completed or cancelled.',
      );

    const lineResult = await sql<{
      id: string;
      sku_snapshot: string;
      line_status: 'ACTIVE' | 'CANCELLED';
      gross_amount: string;
      discount_amount: string;
      net_amount: string;
      reservation_id: string | null;
    }>`
      select line.id, line.sku_snapshot, line.line_status,
        line.gross_amount::text, line.discount_amount::text, line.net_amount::text,
        bridge.reservation_id
      from orders.order_lines line
      left join orders.order_inventory_reservations bridge
        on bridge.organization_id = line.organization_id and bridge.order_line_id = line.id
      where line.organization_id = ${input.organizationId}
        and line.order_id = ${input.orderId}
        and line.id = ${input.orderLineId}
      for update of line
    `.execute(transaction);
    const line = lineResult.rows[0];
    if (!line) throw new OrderDomainError('NOT_FOUND', 'Order line was not found.');
    if (line.line_status === 'CANCELLED') {
      await sql`
        update platform.idempotency_records
        set status = 'SUCCEEDED', result_entity_type = 'orders.order_line',
            result_entity_id = ${input.orderLineId}::uuid,
            safe_response = ${JSON.stringify({ orderId: input.orderId, orderLineId: input.orderLineId })}::jsonb,
            completed_at = now()
        where id = ${idempotencyRecordId}
      `.execute(transaction);
      return orderView(transaction, input.orderId);
    }

    const eligibility = await sql<{
      active_line_count: number;
      fulfillment_count: number;
    }>`
      select
        (select count(*)::int from orders.order_lines candidate
          where candidate.organization_id = ${input.organizationId}
            and candidate.order_id = ${input.orderId}
            and candidate.line_status = 'ACTIVE') as active_line_count,
        (select count(*)::int from fulfillment.fulfillment_lines fulfillment_line
          join fulfillment.fulfillments fulfillment
            on fulfillment.organization_id = fulfillment_line.organization_id
            and fulfillment.id = fulfillment_line.fulfillment_id
          where fulfillment.organization_id = ${input.organizationId}
            and fulfillment.order_id = ${input.orderId}) as fulfillment_count
    `.execute(transaction);
    const policy = eligibility.rows[0]!;
    if (policy.active_line_count <= 1)
      throw new OrderDomainError(
        'VALIDATION_FAILED',
        'Cancel the entire Order instead of cancelling its final active item.',
      );
    if (policy.fulfillment_count > 0)
      throw new OrderDomainError(
        'INVALID_TRANSITION',
        'Order items cannot be cancelled after fulfillment allocation has started.',
      );

    const nextTotal = await sql<{ amount: string }>`
      select (${order.total_amount}::numeric - ${line.net_amount}::numeric)::numeric(20,4)::text as amount
    `.execute(transaction);
    try {
      await reviseOpenPaymentIntentForOrder(transaction, {
        organizationId: input.organizationId,
        orderId: input.orderId,
        expectedAmount: nextTotal.rows[0]!.amount,
      });
    } catch (error) {
      if (error instanceof PaymentDomainError)
        throw new OrderDomainError('INVALID_TRANSITION', error.message);
      throw error;
    }

    if (line.reservation_id)
      await releaseInventoryReservationInTransaction(transaction, {
        organizationId: input.organizationId,
        actorId: input.actorId,
        reservationId: line.reservation_id,
        idempotencyKey: `order-line-cancel:${input.orderLineId}:${line.reservation_id}`,
        authority: { type: 'ORDER_AMENDMENT', orderId: input.orderId },
      });

    await sql`
      update orders.order_lines
      set line_status = 'CANCELLED', cancelled_at = now(),
          cancelled_by_actor_id = ${input.actorId},
          cancellation_reason_code = ${reasonCode},
          cancellation_reason_text = ${reasonText}
      where organization_id = ${input.organizationId} and id = ${input.orderLineId}
    `.execute(transaction);
    const updated = await sql<{ version: string }>`
      update orders.orders
      set subtotal_amount = subtotal_amount - ${line.gross_amount}::numeric,
          discount_amount = discount_amount - ${line.discount_amount}::numeric,
          total_amount = total_amount - ${line.net_amount}::numeric,
          version = version + 1,
          updated_at = now()
      where organization_id = ${input.organizationId} and id = ${input.orderId}
      returning version::text
    `.execute(transaction);
    await sql`
      insert into orders.order_line_cancellations (
        organization_id, order_id, order_line_id, reason_code, reason_text,
        amount_removed, reservation_id, created_by_actor_id
      ) values (
        ${input.organizationId}, ${input.orderId}, ${input.orderLineId}, ${reasonCode},
        ${reasonText}, ${line.net_amount}::numeric, ${line.reservation_id}, ${input.actorId}
      )
    `.execute(transaction);
    await appendAuditEvent(transaction, {
      organizationId: input.organizationId,
      actorType: 'USER',
      actorId: input.actorId,
      action: 'orders.order.line_cancelled',
      targetType: 'orders.order_line',
      targetId: input.orderLineId,
      ...(reasonText ? { reason: reasonText } : {}),
      metadata: {
        orderId: input.orderId,
        sku: line.sku_snapshot,
        reasonCode,
        amountRemoved: line.net_amount,
        reservationId: line.reservation_id,
      },
    });
    await sql`
      insert into platform.outbox_events (
        organization_id, event_type, event_version, aggregate_type, aggregate_id,
        aggregate_version, payload, occurred_at
      ) values (
        ${input.organizationId}, 'orders.order.line_cancelled', 1, 'orders.order',
        ${input.orderId}, ${Number(updated.rows[0]!.version)},
        ${JSON.stringify({ orderId: input.orderId, orderLineId: input.orderLineId, reasonCode, amountRemoved: line.net_amount })}::jsonb,
        now()
      )
    `.execute(transaction);
    await sql`
      update platform.idempotency_records
      set status = 'SUCCEEDED', result_entity_type = 'orders.order_line',
          result_entity_id = ${input.orderLineId}::uuid,
          safe_response = ${JSON.stringify({ orderId: input.orderId, orderLineId: input.orderLineId })}::jsonb,
          completed_at = now()
      where id = ${idempotencyRecordId}
    `.execute(transaction);
    return orderView(transaction, input.orderId);
  });
}

/** Corrects the immutable delivery snapshot before fulfillment starts and keeps both versions as evidence. */
export async function updateOrderDeliveryAddress(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    orderId: string;
    expectedVersion: number;
    address: CheckoutAddressInput;
    reason: string;
    idempotencyKey: string;
  },
): Promise<OrderView> {
  ensureAddress(input.address);
  const reason = input.reason.trim();
  if (!reason)
    throw new OrderDomainError('VALIDATION_FAILED', 'An address correction reason is required.');
  return db.transaction().execute(async (transaction) => {
    let idempotencyRecordId: string;
    try {
      const record = await claimIdempotencyRecord(transaction, {
        organizationId: input.organizationId,
        principalType: 'USER',
        principalId: input.actorId,
        operationType: 'orders.correct-delivery-address',
        idempotencyKey: input.idempotencyKey,
        requestFingerprint: JSON.stringify({
          orderId: input.orderId,
          expectedVersion: input.expectedVersion,
          address: input.address,
          reason,
        }),
      });
      if (!record.created) {
        if (record.status === 'SUCCEEDED') return orderView(transaction, input.orderId);
        throw new OrderDomainError(
          'IDEMPOTENCY_CONFLICT',
          'This address correction is already in progress.',
        );
      }
      idempotencyRecordId = record.id;
    } catch (error) {
      if (error instanceof IdempotencyKeyReuseError)
        throw new OrderDomainError('IDEMPOTENCY_CONFLICT', error.message);
      throw error;
    }

    const orderResult = await sql<{ order_status: OrderView['status']; version: string }>`
      select order_status, version::text from orders.orders
      where organization_id = ${input.organizationId} and id = ${input.orderId}
      for update
    `.execute(transaction);
    const order = orderResult.rows[0];
    if (!order) throw new OrderDomainError('NOT_FOUND', 'Order was not found.');
    if (Number(order.version) !== input.expectedVersion)
      throw new OrderDomainError(
        'STALE_VERSION',
        'Order has changed; reload before correcting its address.',
      );
    if (!['PENDING', 'CONFIRMED', 'ON_HOLD'].includes(order.order_status))
      throw new OrderDomainError(
        'INVALID_TRANSITION',
        'The delivery address can only be corrected before the Order is completed or cancelled.',
      );
    const allocated = await sql<{ exists: boolean }>`
      select exists (
        select 1 from fulfillment.fulfillments fulfillment
        join fulfillment.fulfillment_lines line
          on line.organization_id = fulfillment.organization_id
          and line.fulfillment_id = fulfillment.id
        where fulfillment.organization_id = ${input.organizationId}
          and fulfillment.order_id = ${input.orderId}
      ) as exists
    `.execute(transaction);
    if (allocated.rows[0]?.exists)
      throw new OrderDomainError(
        'INVALID_TRANSITION',
        'The delivery address cannot be changed after fulfillment allocation has started.',
      );

    const currentResult = await sql<{
      id: string;
      source_customer_address_id: string | null;
      geography_node_id: string | null;
      recipient_name: string;
      phone: string;
      address_line_1: string;
      address_line_2: string | null;
      area: string | null;
      city: string | null;
      district: string | null;
      postal_code: string | null;
      country_code: string;
    }>`
      select id, source_customer_address_id, geography_node_id, recipient_name, phone,
        address_line_1, address_line_2, area, city, district, postal_code, country_code
      from orders.order_addresses
      where organization_id = ${input.organizationId} and order_id = ${input.orderId}
        and address_type = 'DELIVERY'
      for update
    `.execute(transaction);
    const current = currentResult.rows[0];
    if (!current) throw new OrderDomainError('NOT_FOUND', 'Delivery address was not found.');
    const beforeSnapshot = {
      recipientName: current.recipient_name,
      phone: current.phone,
      addressLine1: current.address_line_1,
      addressLine2: current.address_line_2,
      geographyNodeId: current.geography_node_id,
      area: current.area,
      city: current.city,
      district: current.district,
      postalCode: current.postal_code,
      countryCode: current.country_code,
    };
    const afterSnapshot = {
      recipientName: input.address.recipientName.trim(),
      phone: input.address.phone.trim(),
      addressLine1: input.address.addressLine1.trim(),
      addressLine2: input.address.addressLine2?.trim() || null,
      geographyNodeId: input.address.geographyNodeId ?? null,
      area: input.address.area?.trim() || null,
      city: input.address.city?.trim() || null,
      district: input.address.district?.trim() || null,
      postalCode: input.address.postalCode?.trim() || null,
      countryCode: input.address.countryCode.trim().toLocaleUpperCase(),
    };
    await sql`
      update orders.order_addresses
      set source_customer_address_id = null,
          geography_node_id = ${afterSnapshot.geographyNodeId},
          recipient_name = ${afterSnapshot.recipientName}, phone = ${afterSnapshot.phone},
          address_line_1 = ${afterSnapshot.addressLine1}, address_line_2 = ${afterSnapshot.addressLine2},
          area = ${afterSnapshot.area}, city = ${afterSnapshot.city}, district = ${afterSnapshot.district},
          postal_code = ${afterSnapshot.postalCode}, country_code = ${afterSnapshot.countryCode}
      where organization_id = ${input.organizationId} and id = ${current.id}
    `.execute(transaction);
    const updated = await sql<{ version: string }>`
      update orders.orders set version = version + 1, updated_at = now()
      where organization_id = ${input.organizationId} and id = ${input.orderId}
      returning version::text
    `.execute(transaction);
    await sql`
      insert into orders.order_address_corrections (
        organization_id, order_id, order_address_id, before_snapshot, after_snapshot,
        reason, created_by_actor_id
      ) values (
        ${input.organizationId}, ${input.orderId}, ${current.id},
        ${JSON.stringify(beforeSnapshot)}::jsonb, ${JSON.stringify(afterSnapshot)}::jsonb,
        ${reason}, ${input.actorId}
      )
    `.execute(transaction);
    await appendAuditEvent(transaction, {
      organizationId: input.organizationId,
      actorType: 'USER',
      actorId: input.actorId,
      action: 'orders.order.delivery_address_corrected',
      targetType: 'orders.order',
      targetId: input.orderId,
      reason,
      metadata: { before: beforeSnapshot, after: afterSnapshot },
    });
    await sql`
      insert into platform.outbox_events (
        organization_id, event_type, event_version, aggregate_type, aggregate_id,
        aggregate_version, payload, occurred_at
      ) values (
        ${input.organizationId}, 'orders.order.delivery_address_corrected', 1,
        'orders.order', ${input.orderId}, ${Number(updated.rows[0]!.version)},
        ${JSON.stringify({ orderId: input.orderId })}::jsonb, now()
      )
    `.execute(transaction);
    await sql`
      update platform.idempotency_records
      set status = 'SUCCEEDED', result_entity_type = 'orders.order',
          result_entity_id = ${input.orderId}::uuid,
          safe_response = ${JSON.stringify({ orderId: input.orderId })}::jsonb,
          completed_at = now()
      where id = ${idempotencyRecordId}
    `.execute(transaction);
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
    actorType?: 'USER' | 'SYSTEM';
    /** Worker-only proof that this cancellation is driven by an eligible timed-out intent. */
    paymentTimeoutIntentId?: string;
  },
): Promise<{ order: OrderView; releasedReservations: number; cancelledFulfillments: number }> {
  if (!input.reasonCode.trim())
    throw new OrderDomainError('VALIDATION_FAILED', 'A cancellation reason is required.');
  return db.transaction().execute(async (transaction) => {
    let idempotencyRecordId: string;
    try {
      const record = await claimIdempotencyRecord(transaction, {
        organizationId: input.organizationId,
        principalType: input.actorType ?? 'USER',
        principalId: input.actorId,
        operationType: 'orders.cancel',
        idempotencyKey: input.idempotencyKey,
        requestFingerprint: JSON.stringify({
          orderId: input.orderId,
          expectedVersion: input.expectedVersion,
          reasonCode: input.reasonCode.trim(),
          reasonText: input.reasonText?.trim() ?? null,
          paymentTimeoutIntentId: input.paymentTimeoutIntentId ?? null,
        }),
      });
      if (!record.created) {
        if (record.status !== 'SUCCEEDED')
          throw new OrderDomainError(
            'IDEMPOTENCY_CONFLICT',
            'This Order cancellation is already in progress.',
          );
        const replay = await sql<{
          safe_response: { releasedReservations?: number; cancelledFulfillments?: number } | null;
        }>`select safe_response from platform.idempotency_records where id = ${record.id}`.execute(
          transaction,
        );
        return {
          order: await orderView(transaction, input.orderId),
          releasedReservations: replay.rows[0]?.safe_response?.releasedReservations ?? 0,
          cancelledFulfillments: replay.rows[0]?.safe_response?.cancelledFulfillments ?? 0,
        };
      }
      idempotencyRecordId = record.id;
    } catch (error) {
      if (error instanceof IdempotencyKeyReuseError)
        throw new OrderDomainError(
          'IDEMPOTENCY_CONFLICT',
          'The idempotency key was reused for different cancellation details.',
        );
      throw error;
    }
    const order = await sql<{
      order_status: string;
      version: string;
    }>`select order_status, version::text from orders.orders where id = ${input.orderId} and organization_id = ${input.organizationId} for update`.execute(
      transaction,
    );
    const row = order.rows[0];
    if (!row) throw new OrderDomainError('NOT_FOUND', 'Order was not found.');
    if (row.order_status === 'CANCELLED') {
      const response = { releasedReservations: 0, cancelledFulfillments: 0 };
      await sql`update platform.idempotency_records set status = 'SUCCEEDED', result_entity_type = 'orders.order', result_entity_id = ${input.orderId}::uuid, safe_response = ${JSON.stringify(response)}::jsonb, completed_at = now() where id = ${idempotencyRecordId}`.execute(
        transaction,
      );
      return { order: await orderView(transaction, input.orderId), ...response };
    }
    if (!['PENDING', 'CONFIRMED', 'ON_HOLD'].includes(row.order_status))
      throw new OrderDomainError('INVALID_TRANSITION', 'This Order cannot be cancelled.');
    if (Number(row.version) !== input.expectedVersion)
      throw new OrderDomainError('STALE_VERSION', 'Order has changed; reload before cancelling.');
    if (input.paymentTimeoutIntentId) {
      if (row.order_status !== 'PENDING')
        throw new OrderDomainError(
          'INVALID_TRANSITION',
          'Only a pending unpaid Order can expire automatically.',
        );
      const eligibleIntent = await sql<{ id: string }>`
        select intent.id
        from payments.payment_intents intent
        join payments.payment_methods method
          on method.organization_id = intent.organization_id
          and method.id = intent.payment_method_id
        where intent.organization_id = ${input.organizationId}
          and intent.order_id = ${input.orderId}
          and intent.id = ${input.paymentTimeoutIntentId}
          and intent.status = 'READY'
          and intent.expires_at is not null
          and intent.expires_at <= now()
          and method.method_type = 'MOBILE_WALLET'
          and not exists (
            select 1 from payments.payment_attempts attempt
            where attempt.organization_id = intent.organization_id
              and attempt.payment_intent_id = intent.id
              and attempt.status = 'PENDING_VERIFICATION'
          )
          and not exists (
            select 1
            from payments.payment_allocations allocation
            join payments.payments payment
              on payment.organization_id = allocation.organization_id
              and payment.id = allocation.payment_id
            where allocation.organization_id = intent.organization_id
              and allocation.order_id = intent.order_id
              and payment.status = 'CONFIRMED'
          )
        for update of intent
      `.execute(transaction);
      if (!eligibleIntent.rows[0])
        throw new OrderDomainError(
          'INVALID_TRANSITION',
          'The payment obligation is no longer eligible for automatic expiry.',
        );
    }
    let cancelledFulfillments: number;
    try {
      cancelledFulfillments = await cancelOpenFulfillmentsForOrderInTransaction(transaction, {
        organizationId: input.organizationId,
        ...(input.actorType === 'SYSTEM' ? {} : { actorId: input.actorId }),
        ...(input.actorType ? { actorType: input.actorType } : {}),
        orderId: input.orderId,
      });
    } catch (error) {
      if (error instanceof FulfillmentDomainError)
        throw new OrderDomainError('INVALID_TRANSITION', error.message);
      throw error;
    }
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
        authority: { type: 'ORDER_CANCELLATION', orderId: input.orderId },
        ...(input.actorType ? { actorType: input.actorType } : {}),
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
    const cancellation = await sql<{ id: string }>`insert into orders.order_cancellations (organization_id, order_id, reason_code, reason_text, created_by_actor_id) values (${input.organizationId}, ${input.orderId}, ${input.reasonCode.trim()}, ${input.reasonText?.trim() ?? null}, ${input.actorType === 'SYSTEM' ? null : input.actorId}) returning id`.execute(
      transaction,
    );
    const cancellationRefunds = await createCancellationRefundObligationsInTransaction(transaction, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      orderId: input.orderId,
      cancellationId: cancellation.rows[0]!.id,
      ...(input.reasonText ? { reasonText: input.reasonText } : {}),
    });
    await appendAuditEvent(transaction, {
      organizationId: input.organizationId,
      actorType: input.actorType ?? 'USER',
      ...(input.actorType === 'SYSTEM' ? {} : { actorId: input.actorId }),
      action: 'orders.order.cancelled',
      targetType: 'orders.order',
      targetId: input.orderId,
      ...(input.reasonText ? { reason: input.reasonText } : {}),
      metadata: {
        reasonCode: input.reasonCode,
        releasedReservations,
        cancelledFulfillments,
        refundObligationCount: cancellationRefunds.length,
      },
    });
    await sql`insert into platform.outbox_events (organization_id, event_type, event_version, aggregate_type, aggregate_id, aggregate_version, payload, occurred_at) values (${input.organizationId}, 'orders.order.cancelled', 1, 'orders.order', ${input.orderId}, 1, ${JSON.stringify({ orderId: input.orderId, releasedReservations, cancelledFulfillments, refundObligationCount: cancellationRefunds.length })}::jsonb, now())`.execute(
      transaction,
    );
    const response = { releasedReservations, cancelledFulfillments };
    await sql`update platform.idempotency_records set status = 'SUCCEEDED', result_entity_type = 'orders.order', result_entity_id = ${input.orderId}::uuid, safe_response = ${JSON.stringify(response)}::jsonb, completed_at = now() where id = ${idempotencyRecordId}`.execute(
      transaction,
    );
    return { order: await orderView(transaction, input.orderId), ...response };
  });
}

/**
 * Cancels only expired, unpaid manual-payment Orders. Candidate discovery is
 * intentionally optimistic; cancelOrder re-locks and revalidates the Order and
 * Payment Intent so verification, fulfillment, or operator activity wins safely.
 */
export async function processExpiredPaymentOrders(
  db: Kysely<DatabaseSchema>,
  limit = 100,
): Promise<number> {
  if (!Number.isInteger(limit) || limit < 1 || limit > 1_000)
    throw new OrderDomainError('VALIDATION_FAILED', 'Payment expiry batch limit is invalid.');
  const candidates = await sql<{
    organization_id: string;
    order_id: string;
    intent_id: string;
    version: string;
  }>`
    select intent.organization_id, intent.order_id, intent.id as intent_id, order_row.version::text
    from payments.payment_intents intent
    join payments.payment_methods method
      on method.organization_id = intent.organization_id and method.id = intent.payment_method_id
    join orders.orders order_row
      on order_row.organization_id = intent.organization_id and order_row.id = intent.order_id
    where intent.status = 'READY'
      and intent.expires_at is not null
      and intent.expires_at <= now()
      and method.method_type = 'MOBILE_WALLET'
      and order_row.order_status = 'PENDING'
      and not exists (
        select 1 from payments.payment_attempts attempt
        where attempt.organization_id = intent.organization_id
          and attempt.payment_intent_id = intent.id
          and attempt.status = 'PENDING_VERIFICATION'
      )
      and not exists (
        select 1
        from payments.payment_allocations allocation
        join payments.payments payment
          on payment.organization_id = allocation.organization_id
          and payment.id = allocation.payment_id
        where allocation.organization_id = intent.organization_id
          and allocation.order_id = intent.order_id
          and payment.status = 'CONFIRMED'
      )
    order by intent.expires_at, intent.id
    limit ${limit}
  `.execute(db);
  let expired = 0;
  for (const candidate of candidates.rows) {
    try {
      await cancelOrder(db, {
        organizationId: candidate.organization_id,
        actorId: candidate.organization_id,
        actorType: 'SYSTEM',
        orderId: candidate.order_id,
        expectedVersion: Number(candidate.version),
        reasonCode: 'PAYMENT_TIMEOUT',
        reasonText: 'Manual payment window expired without a verified payment.',
        idempotencyKey: `payment-timeout:${candidate.intent_id}`,
        paymentTimeoutIntentId: candidate.intent_id,
      });
      expired += 1;
    } catch (error) {
      if (
        error instanceof OrderDomainError &&
        ['STALE_VERSION', 'INVALID_TRANSITION'].includes(error.code)
      )
        continue;
      throw error;
    }
  }
  return expired;
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
        and ol.line_status = 'ACTIVE'
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
  /** Omit to use the current authoritative Catalog price. */
  readonly unitPrice?: string;
  /** Required when unitPrice differs from the current Catalog price. */
  readonly priceOverrideReason?: string;
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
  /** Admin-only exception to the configured delivery rule. */
  readonly deliveryAmount?: string;
  /** Required whenever deliveryAmount is intentionally overridden. */
  readonly deliveryOverrideReason?: string;
  readonly paymentMethod: PaymentMethodCode;
  readonly salesChannel?: Exclude<OrderView['salesChannel'], 'STOREFRONT'>;
  /**
   * Client-generated UUID. Required. The same key returns the same order
   * if the request is replayed after a network failure.
   */
  readonly idempotencyKey: string;
  readonly currency?: string;
}

const decimalPattern = /^(?:0|[1-9]\d*)(?:\.\d{1,4})?$/;
const positiveDecimalPattern = /^(?:(?:[1-9]\d*)(?:\.\d{1,4})?|(?:0\.\d*[1-9]\d*))$/;

function decimal6Minor(value: string): bigint {
  const [whole = '0', fraction = ''] = value.split('.');
  return BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, '0'));
}

function decimal4Minor(value: string): bigint {
  const [whole = '0', fraction = ''] = value.split('.');
  return BigInt(whole) * 10_000n + BigInt(fraction.padEnd(4, '0'));
}

function decimal4Text(value: bigint): string {
  const whole = value / 10_000n;
  const fraction = (value % 10_000n).toString().padStart(4, '0');
  return `${whole}.${fraction}`;
}

function multiplyDecimal4(left: string, right: string): string {
  const scaledProduct = decimal4Minor(left) * decimal4Minor(right);
  return decimal4Text((scaledProduct + 5_000n) / 10_000n);
}

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
        option_snapshot: readonly { name: string; value: string }[];
        catalog_unit_price: string | null;
      }>`
        select
          v.id as variant_id, p.id as product_id, item.id as inventory_item_id,
          v.sku, p.title as product_title, v.title as variant_title,
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
          unit_price, price_source, price_override_reason, gross_amount, discount_amount, net_amount
        ) values (
          ${input.organizationId}, ${orderId}, ${line.productId}, ${line.variantId},
          ${line.inventoryItemId},
          ${line.quantity}::numeric, ${line.sku}, ${line.productTitle},
          ${line.variantTitle}, ${JSON.stringify(line.optionSnapshot)}::jsonb,
          ${line.unitPrice}::numeric, ${line.priceSource}, ${line.priceOverrideReason}, ${line.gross}::numeric,
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

export async function processOrderOutbox(db: Kysely<DatabaseSchema>): Promise<number> {
  const candidates = await sql<{
    event_id: string;
    organization_id: string;
    aggregate_id: string;
  }>`
    select event.id::text as event_id, event.organization_id::text, event.aggregate_id::text
    from platform.outbox_events event
    left join platform.event_consumer_receipts receipt
      on receipt.outbox_event_id = event.id
      and receipt.consumer_name = 'orders.autocomplete.v1'
    where event.event_type = 'delivery.all_lines_delivered'
      and (
        receipt.id is null
        or (receipt.status = 'RETRY_WAIT' and receipt.next_retry_at <= now())
        or (receipt.status = 'PROCESSING' and receipt.last_attempt_at < now() - interval '5 minutes')
      )
    order by event.occurred_at asc
    limit 100
  `.execute(db);

  let processed = 0;
  for (const row of candidates.rows) {
    const claim = await sql<{ id: string; attempt_count: number }>`
      insert into platform.event_consumer_receipts (
        outbox_event_id, consumer_name, status, attempt_count, last_attempt_at
      ) values (
        ${row.event_id}::bigint, 'orders.autocomplete.v1', 'PROCESSING', 1, now()
      )
      on conflict (outbox_event_id, consumer_name) do update
      set status = 'PROCESSING',
          attempt_count = platform.event_consumer_receipts.attempt_count + 1,
          last_attempt_at = now(),
          next_retry_at = null,
          last_error_code = null
      where (
        platform.event_consumer_receipts.status = 'RETRY_WAIT'
        and platform.event_consumer_receipts.next_retry_at <= now()
      ) or (
        platform.event_consumer_receipts.status = 'PROCESSING'
        and platform.event_consumer_receipts.last_attempt_at < now() - interval '5 minutes'
      )
      returning id::text, attempt_count
    `.execute(db);
    const receipt = claim.rows[0];
    if (!receipt) continue;

    try {
      await completeOrder(db, {
        organizationId: row.organization_id,
        orderId: row.aggregate_id,
        actorId: null,
        idempotencyKey: `auto-complete:${row.event_id}`,
        triggerOutboxEventId: row.event_id,
      });
      await sql`
        update platform.event_consumer_receipts
        set status = 'COMPLETED', processed_at = now(), next_retry_at = null, last_error_code = null
        where id = ${receipt.id}::bigint and status = 'PROCESSING'
      `.execute(db);
      processed++;
    } catch (error) {
      const errorCode =
        error instanceof OrderDomainError
          ? error.code
          : typeof error === 'object' && error !== null && 'code' in error
            ? String(error.code)
            : 'UNEXPECTED';
      await sql`
        update platform.event_consumer_receipts
        set status = case when attempt_count >= 10 then 'DEAD_LETTER' else 'RETRY_WAIT' end,
            next_retry_at = case
              when attempt_count >= 10 then null
              else now() + make_interval(secs => least(3600, power(2, attempt_count)::integer))
            end,
            last_error_code = ${errorCode},
            processed_at = null
        where id = ${receipt.id}::bigint and status = 'PROCESSING'
      `.execute(db);
      console.error('Failed to auto-complete order', row.aggregate_id, error);
    }
  }

  return processed;
}
