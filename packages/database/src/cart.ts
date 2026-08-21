import { sql, type Kysely, type Transaction } from 'kysely';

import { generateOpaqueToken, hashToken } from '@maevelle/security';

import type { DatabaseSchema } from './index.js';
import { claimIdempotencyRecord, IdempotencyKeyReuseError } from './platform.js';
import { evaluatePromotions } from './promotions.js';
import { resolveVariantPrice } from './pricing.js';

const moneyScale = 10_000n;
const defaultCartLifetimeDays = 30;

export class CartDomainError extends Error {
  public constructor(
    public readonly code:
      'NOT_FOUND' | 'CONFLICT' | 'VALIDATION_FAILED' | 'STALE_VERSION' | 'UNAVAILABLE' | 'UNPRICED',
    message: string,
  ) {
    super(message);
    this.name = 'CartDomainError';
  }
}

export interface CartView {
  readonly id: string;
  readonly currency: string;
  readonly version: number;
  readonly expiresAt: string;
  readonly calculationVersion: number;
  readonly calculationFingerprint: string;
  readonly lines: readonly {
    id: string;
    variantId: string;
    sku: string;
    productTitle: string;
    quantity: string;
    unitPrice: string | null;
    compareAtUnitPrice: string | null;
    gross: string;
    discount: string;
    net: string;
    availability: 'AVAILABLE' | 'UNAVAILABLE' | 'UNPRICED' | 'INSUFFICIENT_CURRENT_STOCK';
  }[];
  readonly appliedCoupons: readonly string[];
  readonly merchandiseGross: string;
  readonly discountTotal: string;
  readonly merchandiseNet: string;
}

function parseMoney(value: string): bigint {
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole ?? '0') * moneyScale + BigInt(((fraction ?? '') + '0000').slice(0, 4));
}

function money(value: bigint): string {
  const sign = value < 0n ? '-' : '';
  const absolute = value < 0n ? -value : value;
  return `${sign}${(absolute / moneyScale).toString()}.${(absolute % moneyScale).toString().padStart(4, '0')}`;
}

function quantity(value: string): bigint {
  const match = /^([1-9]\d*)(?:\.0+)?$/.exec(value);
  if (!match) {
    throw new CartDomainError(
      'VALIDATION_FAILED',
      'Cart quantity must be a positive whole number.',
    );
  }
  return BigInt(match[1]!);
}

/** Storefront V1 sells discrete units; floor ATS only for that availability hint. */
function availableWholeUnits(value: string): bigint {
  const whole = value.split('.')[0] ?? '0';
  return /^\d+$/.test(whole) ? BigInt(whole) : 0n;
}

function fingerprint(value: unknown): string {
  return hashToken(JSON.stringify(value));
}

async function findCart(
  db: Kysely<DatabaseSchema>,
  token: string,
  lock = false,
): Promise<{
  id: string;
  organizationId: string;
  currency: string;
  version: number;
  expiresAt: Date;
}> {
  const result = await sql<{
    id: string;
    organization_id: string;
    currency_code: string;
    version: string;
    expires_at: Date;
  }>`
    select id, organization_id, currency_code, version::text, expires_at
    from cart.carts
    where public_token_hash = ${hashToken(token)} and status = 'ACTIVE' and expires_at > now()
    ${lock ? sql`for update` : sql``}
  `.execute(db);
  const row = result.rows[0];
  if (!row) throw new CartDomainError('NOT_FOUND', 'Cart was not found.');
  return {
    id: row.id,
    organizationId: row.organization_id,
    currency: row.currency_code,
    version: Number(row.version),
    expiresAt: row.expires_at,
  };
}

async function availableToSell(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  variantId: string,
): Promise<string> {
  const result = await sql<{ available_to_sell: string }>`
    select coalesce(sum(level.sellable_quantity - level.reserved_quantity), 0)::text as available_to_sell
    from inventory.inventory_items item
    join inventory.inventory_levels level on level.inventory_item_id = item.id and level.organization_id = item.organization_id
    where item.organization_id = ${organizationId} and item.variant_id = ${variantId} and item.status = 'ACTIVE'
  `.execute(db);
  return result.rows[0]?.available_to_sell ?? '0';
}

async function assertSellableVariant(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  variantId: string,
): Promise<void> {
  const variant = await sql<{ id: string }>`
    select variant.id
    from catalog.product_variants variant
    join catalog.products product on product.id = variant.product_id
    where variant.id = ${variantId} and variant.organization_id = ${organizationId}
      and variant.status = 'ACTIVE' and product.status = 'ACTIVE' and product.publication_status = 'PUBLISHED'
  `.execute(db);
  if (!variant.rows[0])
    throw new CartDomainError('UNAVAILABLE', 'This Variant is not currently available.');
}

async function bumpCartVersion(
  transaction: Transaction<DatabaseSchema>,
  cartId: string,
  expectedVersion: number,
): Promise<number> {
  const changed = await sql<{ version: string }>`
    update cart.carts set version = version + 1, updated_at = now()
    where id = ${cartId} and version = ${expectedVersion}
    returning version::text
  `.execute(transaction);
  const version = changed.rows[0]?.version;
  if (!version)
    throw new CartDomainError('STALE_VERSION', 'Cart has changed; reload before updating.');
  return Number(version);
}

export async function createGuestCart(
  db: Kysely<DatabaseSchema>,
  input: { organizationId: string; currency: string; expiresAt?: Date },
): Promise<{ token: string; cart: CartView }> {
  if (!/^[A-Z]{3}$/.test(input.currency)) {
    throw new CartDomainError(
      'VALIDATION_FAILED',
      'Currency must be a three-letter uppercase code.',
    );
  }
  const token = generateOpaqueToken();
  const expiresAt = input.expiresAt ?? new Date(Date.now() + defaultCartLifetimeDays * 86_400_000);
  await sql`
    insert into cart.carts (organization_id, public_token_hash, currency_code, expires_at)
    values (${input.organizationId}, ${hashToken(token)}, ${input.currency}, ${expiresAt})
  `.execute(db);
  return { token, cart: await getGuestCart(db, token) };
}

export async function getGuestCart(db: Kysely<DatabaseSchema>, token: string): Promise<CartView> {
  const cart = await findCart(db, token);
  const lines = await sql<{
    id: string;
    variant_id: string;
    quantity: string;
    sku: string;
    product_id: string;
    product_title: string;
    category_ids: string[];
  }>`
    select line.id, line.variant_id, line.quantity::text, variant.sku, product.id as product_id, product.title as product_title,
      coalesce(array_agg(category.category_id) filter (where category.category_id is not null), '{}') as category_ids
    from cart.cart_lines line
    join catalog.product_variants variant on variant.id = line.variant_id
    join catalog.products product on product.id = variant.product_id
    left join catalog.product_categories category on category.product_id = product.id
    where line.cart_id = ${cart.id}
    group by line.id, line.variant_id, line.quantity, variant.sku, product.id, product.title
    order by line.created_at, line.id
  `.execute(db);
  const coupons = await sql<{ normalized_code: string }>`
    select coupon.normalized_code
    from cart.cart_coupons link join promotions.coupon_codes coupon on coupon.id = link.coupon_code_id
    where link.cart_id = ${cart.id}
    order by coupon.normalized_code
  `.execute(db);
  const computedLines = await Promise.all(
    lines.rows.map(async (line) => {
      const price = await resolveVariantPrice(db, {
        organizationId: cart.organizationId,
        variantId: line.variant_id,
        currency: cart.currency,
      });
      const ats = await availableToSell(db, cart.organizationId, line.variant_id);
      const lineQuantity = quantity(line.quantity);
      const availability: CartView['lines'][number]['availability'] = !price
        ? 'UNPRICED'
        : availableWholeUnits(ats) < lineQuantity
          ? availableWholeUnits(ats) === 0n
            ? 'UNAVAILABLE'
            : 'INSUFFICIENT_CURRENT_STOCK'
          : 'AVAILABLE';
      const gross = price ? money(parseMoney(price.amount) * lineQuantity) : '0.0000';
      return { ...line, price, gross, availability };
    }),
  );
  const calculations = await evaluatePromotions(db, {
    organizationId: cart.organizationId,
    couponCodes: coupons.rows.map((coupon) => coupon.normalized_code),
    lines: computedLines
      .filter((line) => line.price && line.availability === 'AVAILABLE')
      .map((line) => ({
        lineId: line.id,
        variantId: line.variant_id,
        productId: line.product_id,
        categoryIds: line.category_ids,
        gross: line.gross,
      })),
  });
  const discountByLine = new Map<string, bigint>();
  for (const calculation of calculations) {
    for (const allocation of calculation.allocations) {
      discountByLine.set(
        allocation.lineId,
        (discountByLine.get(allocation.lineId) ?? 0n) + parseMoney(allocation.amount),
      );
    }
  }
  const viewLines = computedLines.map((line) => {
    const discount = discountByLine.get(line.id) ?? 0n;
    const gross = parseMoney(line.gross);
    return {
      id: line.id,
      variantId: line.variant_id,
      sku: line.sku,
      productTitle: line.product_title,
      quantity: line.quantity,
      unitPrice: line.price?.amount ?? null,
      compareAtUnitPrice: line.price?.compareAtAmount ?? null,
      gross: line.gross,
      discount: money(discount),
      net: money(gross - discount),
      availability: line.availability,
    };
  });
  const merchandiseGross = viewLines.reduce((sum, line) => sum + parseMoney(line.gross), 0n);
  const discountTotal = viewLines.reduce((sum, line) => sum + parseMoney(line.discount), 0n);
  const calculationVersion = cart.version;
  return {
    id: cart.id,
    currency: cart.currency,
    version: cart.version,
    expiresAt: cart.expiresAt.toISOString(),
    calculationVersion,
    calculationFingerprint: fingerprint({
      calculationVersion,
      currency: cart.currency,
      lines: viewLines.map((line) => [
        line.variantId,
        line.quantity,
        line.unitPrice,
        line.availability,
      ]),
      coupons: coupons.rows.map((coupon) => coupon.normalized_code),
      discounts: calculations.map((calculation) => [calculation.promotionId, calculation.discount]),
    }),
    lines: viewLines,
    appliedCoupons: coupons.rows.map((coupon) => coupon.normalized_code),
    merchandiseGross: money(merchandiseGross),
    discountTotal: money(discountTotal),
    merchandiseNet: money(merchandiseGross - discountTotal),
  };
}

export async function addGuestCartLine(
  db: Kysely<DatabaseSchema>,
  input: {
    token: string;
    variantId: string;
    quantity: string;
    expectedVersion: number;
    idempotencyKey?: string;
  },
): Promise<CartView> {
  const desired = quantity(input.quantity);
  return db.transaction().execute(async (transaction) => {
    const cart = await findCart(transaction, input.token, true);
    let idempotencyRecordId: string | undefined;
    if (input.idempotencyKey) {
      try {
        const record = await claimIdempotencyRecord(transaction, {
          organizationId: cart.organizationId,
          principalType: 'GUEST_CART',
          principalId: cart.id,
          operationType: 'cart.add_line',
          idempotencyKey: input.idempotencyKey,
          requestFingerprint: fingerprint({ variantId: input.variantId, quantity: input.quantity }),
        });
        if (!record.created) {
          if (record.status === 'SUCCEEDED') return getGuestCart(transaction, input.token);
          throw new CartDomainError('CONFLICT', 'The same Cart action is already in progress.');
        }
        idempotencyRecordId = record.id;
      } catch (error) {
        if (error instanceof IdempotencyKeyReuseError) {
          throw new CartDomainError(
            'CONFLICT',
            'The idempotency key was reused for a different Cart action.',
          );
        }
        throw error;
      }
    }
    if (cart.version !== input.expectedVersion) {
      throw new CartDomainError('STALE_VERSION', 'Cart has changed; reload before updating.');
    }
    await assertSellableVariant(transaction, cart.organizationId, input.variantId);
    const existingLine = await sql<{ quantity: string }>`
      select quantity::text
      from cart.cart_lines
      where cart_id = ${cart.id} and variant_id = ${input.variantId}
      for update
    `.execute(transaction);
    const requestedTotal =
      desired + (existingLine.rows[0] ? quantity(existingLine.rows[0].quantity) : 0n);
    const ats = availableWholeUnits(
      await availableToSell(transaction, cart.organizationId, input.variantId),
    );
    if (requestedTotal > ats)
      throw new CartDomainError('UNAVAILABLE', 'Requested quantity is not currently available.');
    const price = await resolveVariantPrice(transaction, {
      organizationId: cart.organizationId,
      variantId: input.variantId,
      currency: cart.currency,
    });
    if (!price) throw new CartDomainError('UNPRICED', 'This Variant has no current selling price.');
    await sql`
      insert into cart.cart_lines (organization_id, cart_id, variant_id, quantity, last_seen_unit_price)
      values (${cart.organizationId}, ${cart.id}, ${input.variantId}, ${input.quantity}::numeric, ${price.amount}::numeric)
      on conflict (cart_id, variant_id) do update
      set quantity = cart.cart_lines.quantity + excluded.quantity,
          last_seen_unit_price = excluded.last_seen_unit_price,
          version = cart.cart_lines.version + 1,
          updated_at = now()
    `.execute(transaction);
    await bumpCartVersion(transaction, cart.id, input.expectedVersion);
    const view = await getGuestCart(transaction, input.token);
    if (idempotencyRecordId) {
      await sql`
        update platform.idempotency_records
        set status = 'SUCCEEDED', result_entity_type = 'cart', result_entity_id = ${cart.id}::uuid,
            safe_response = ${JSON.stringify({ cartId: cart.id, version: view.version })}::jsonb, completed_at = now()
        where id = ${idempotencyRecordId}
      `.execute(transaction);
    }
    return view;
  });
}

export async function setGuestCartLineQuantity(
  db: Kysely<DatabaseSchema>,
  input: { token: string; lineId: string; quantity: string; expectedVersion: number },
): Promise<CartView> {
  const desired = quantity(input.quantity);
  return db.transaction().execute(async (transaction) => {
    const cart = await findCart(transaction, input.token, true);
    if (cart.version !== input.expectedVersion)
      throw new CartDomainError('STALE_VERSION', 'Cart has changed; reload before updating.');
    const line = await sql<{ id: string; variant_id: string }>`
      select id, variant_id
      from cart.cart_lines
      where id = ${input.lineId} and cart_id = ${cart.id} and organization_id = ${cart.organizationId}
      for update
    `.execute(transaction);
    const existingLine = line.rows[0];
    if (!existingLine) throw new CartDomainError('NOT_FOUND', 'Cart line was not found.');
    await assertSellableVariant(transaction, cart.organizationId, existingLine.variant_id);
    const ats = availableWholeUnits(
      await availableToSell(transaction, cart.organizationId, existingLine.variant_id),
    );
    if (desired > ats)
      throw new CartDomainError('UNAVAILABLE', 'Requested quantity is not currently available.');
    await sql<{ id: string }>`
      update cart.cart_lines set quantity = ${input.quantity}::numeric, version = version + 1, updated_at = now()
      where id = ${input.lineId} and cart_id = ${cart.id} and organization_id = ${cart.organizationId} returning id
    `.execute(transaction);
    await bumpCartVersion(transaction, cart.id, input.expectedVersion);
    return getGuestCart(transaction, input.token);
  });
}

export async function removeGuestCartLine(
  db: Kysely<DatabaseSchema>,
  input: { token: string; lineId: string; expectedVersion: number },
): Promise<CartView> {
  return db.transaction().execute(async (transaction) => {
    const cart = await findCart(transaction, input.token, true);
    if (cart.version !== input.expectedVersion)
      throw new CartDomainError('STALE_VERSION', 'Cart has changed; reload before updating.');
    const removed = await sql<{ id: string }>`
      delete from cart.cart_lines where id = ${input.lineId} and cart_id = ${cart.id} and organization_id = ${cart.organizationId} returning id
    `.execute(transaction);
    if (!removed.rows[0]) throw new CartDomainError('NOT_FOUND', 'Cart line was not found.');
    await bumpCartVersion(transaction, cart.id, input.expectedVersion);
    return getGuestCart(transaction, input.token);
  });
}

export async function applyGuestCartCoupon(
  db: Kysely<DatabaseSchema>,
  input: { token: string; couponCode: string; expectedVersion: number },
): Promise<CartView> {
  const normalizedCode = input.couponCode.trim().replace(/\s+/g, '').toLocaleUpperCase();
  return db.transaction().execute(async (transaction) => {
    const cart = await findCart(transaction, input.token, true);
    if (cart.version !== input.expectedVersion)
      throw new CartDomainError('STALE_VERSION', 'Cart has changed; reload before updating.');
    const coupon = await sql<{ id: string }>`
      select id from promotions.coupon_codes
      where organization_id = ${cart.organizationId} and normalized_code = ${normalizedCode} and status = 'ACTIVE'
    `.execute(transaction);
    const couponId = coupon.rows[0]?.id;
    if (!couponId) throw new CartDomainError('NOT_FOUND', 'Coupon was not found.');
    await sql`insert into cart.cart_coupons (cart_id, coupon_code_id) values (${cart.id}, ${couponId}) on conflict do nothing`.execute(
      transaction,
    );
    await bumpCartVersion(transaction, cart.id, input.expectedVersion);
    return getGuestCart(transaction, input.token);
  });
}

export async function removeGuestCartCoupon(
  db: Kysely<DatabaseSchema>,
  input: { token: string; couponCode: string; expectedVersion: number },
): Promise<CartView> {
  const normalizedCode = input.couponCode.trim().replace(/\s+/g, '').toLocaleUpperCase();
  return db.transaction().execute(async (transaction) => {
    const cart = await findCart(transaction, input.token, true);
    if (cart.version !== input.expectedVersion)
      throw new CartDomainError('STALE_VERSION', 'Cart has changed; reload before updating.');
    const removed = await sql<{ coupon_code_id: string }>`
      delete from cart.cart_coupons link using promotions.coupon_codes coupon
      where link.cart_id = ${cart.id} and link.coupon_code_id = coupon.id and coupon.normalized_code = ${normalizedCode}
      returning link.coupon_code_id
    `.execute(transaction);
    if (!removed.rows[0])
      throw new CartDomainError('NOT_FOUND', 'Coupon was not applied to this Cart.');
    await bumpCartVersion(transaction, cart.id, input.expectedVersion);
    return getGuestCart(transaction, input.token);
  });
}
