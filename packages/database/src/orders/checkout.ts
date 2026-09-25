import { sql, type Kysely } from 'kysely';

import { generateOpaqueToken, hashToken } from '@maevelle/security';

import type { DatabaseSchema } from '../index.js';
import { getGuestCart, type CartView } from '../cart.js';
import { normalizeCustomerPhone } from '../customer-identities.js';
import {
  listPaymentMethods,
  requireActivePaymentMethod,
  type PaymentMethodCode,
} from '../payments.js';
import {
  checkoutLifetimeMs,
  decimal4Minor,
  decimal4Text,
  OrderDomainError,
  type CheckoutAddressInput,
  type CheckoutContactInput,
  type CheckoutView,
  type DeliveryQuote,
} from './types.js';
import { quoteForCheckout, resolveDeliveryQuote } from './delivery-pricing.js';

export function checkoutTotals(cart: CartView, quote: DeliveryQuote | null = null) {
  const deliveryAmount = quote?.amount ?? '0';
  return {
    merchandiseGross: cart.merchandiseGross,
    discountTotal: cart.discountTotal,
    merchandiseNet: cart.merchandiseNet,
    deliveryAmount,
    total: decimal4Text(decimal4Minor(cart.merchandiseNet) + decimal4Minor(deliveryAmount)),
  };
}

export function checkoutFingerprint(cart: CartView, quote: DeliveryQuote | null): string {
  return hashToken(
    JSON.stringify({
      cart: cart.calculationFingerprint,
      deliveryRuleId: quote?.ruleId ?? null,
      deliveryAmount: quote?.amount ?? '0',
    }),
  );
}

export function ensureContact(input: CheckoutContactInput): void {
  if (!input.name.trim() || !/^\+?[0-9\s()-]{7,24}$/.test(input.phone.trim()))
    throw new OrderDomainError(
      'VALIDATION_FAILED',
      'A customer name and valid phone number are required.',
    );
  if (input.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim()))
    throw new OrderDomainError('VALIDATION_FAILED', 'Customer email is not valid.');
}

export function ensureAddress(input: CheckoutAddressInput): void {
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

export async function checkoutRow(db: Kysely<DatabaseSchema>, token: string, lock = false) {
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

export function checkoutInputView(
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

export async function activeCheckout(
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
