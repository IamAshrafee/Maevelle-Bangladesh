import { sql, type Kysely, type Transaction } from 'kysely';
import type { DatabaseSchema } from '../index.js';
import type { CartMutationScope } from './types.js';
import { CartDomainError } from './errors.js';
import { checkedVersion, type ResolvedCart } from './context.js';
import { availableToSell, assertSellableVariant } from './availability.js';
import { quantity, availableWholeUnits } from './value.js';
import { evaluateCart } from './queries.js';
import { mutateCart } from './receipts.js';
import { resolveVariantPrice } from '../pricing.js';
export async function bumpCartVersion(
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
  return checkedVersion(version);
}

export async function addCartLine<Scope extends CartMutationScope>(
  db: Kysely<DatabaseSchema>,
  input: Scope & {
    variantId: string;
    quantity: string;
    expectedVersion: number;
    idempotencyKey?: string;
  },
) {
  return mutateCart(db, input, 'add_line', (transaction, cart) =>
    applyCartLineAddition(transaction, cart, input),
  );
}

/** Apply an exact addition inside the authorized Cart command transaction. */
export async function applyCartLineAddition(
  transaction: Transaction<DatabaseSchema>,
  cart: ResolvedCart,
  input: { variantId: string; quantity: string; expectedVersion: number; productId?: string },
) {
  const desired = quantity(input.quantity);
  await assertSellableVariant(transaction, cart.organizationId, input.variantId, input.productId);
  const existingLine = await sql<{ quantity: string }>`
    select quantity::text
    from cart.cart_lines
    where cart_id = ${cart.id} and variant_id = ${input.variantId}
    for update
  `.execute(transaction);
  const requestedTotal =
    desired + (existingLine.rows[0] ? quantity(existingLine.rows[0].quantity) : 0n);
  if (requestedTotal > 99n)
    throw new CartDomainError('LIMIT_EXCEEDED', 'Cart quantity limit exceeded.');
  if (!existingLine.rows[0]) {
    const count = await sql<{
      count: number;
    }>`select count(*)::int count from cart.cart_lines where cart_id=${cart.id}`.execute(
      transaction,
    );
    if ((count.rows[0]?.count ?? 0) >= 100)
      throw new CartDomainError('LIMIT_EXCEEDED', 'Cart line limit exceeded.');
  }
  const ats = availableWholeUnits(
    await availableToSell(transaction, cart.organizationId, input.variantId),
  );
  if (requestedTotal > ats)
    throw new CartDomainError('UNAVAILABLE', 'Requested quantity is not currently available.');
  const price = await resolveVariantPrice(transaction, {
    organizationId: cart.organizationId,
    variantId: input.variantId,
    currency: cart.currency,
    at: cart.evaluatedAt,
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
  const version = await bumpCartVersion(transaction, cart.id, input.expectedVersion);
  return evaluateCart(transaction, { ...cart, version });
}

export async function setCartLineQuantity<Scope extends CartMutationScope>(
  db: Kysely<DatabaseSchema>,
  input: Scope & {
    lineId: string;
    quantity: string;
    expectedVersion: number;
  },
) {
  const desired = quantity(input.quantity);
  return mutateCart(db, input, 'set_quantity', async (transaction, cart) => {
    const line = await sql<{ id: string; variant_id: string; quantity: string }>`
      select id, variant_id, quantity::text
      from cart.cart_lines
      where id = ${input.lineId} and cart_id = ${cart.id} and organization_id = ${cart.organizationId}
      for update
    `.execute(transaction);
    const existingLine = line.rows[0];
    if (!existingLine) throw new CartDomainError('NOT_FOUND', 'Cart line was not found.');
    if (quantity(existingLine.quantity) === desired) return evaluateCart(transaction, cart);
    await assertSellableVariant(transaction, cart.organizationId, existingLine.variant_id);
    const ats = availableWholeUnits(
      await availableToSell(transaction, cart.organizationId, existingLine.variant_id),
    );
    if (desired > ats)
      throw new CartDomainError('UNAVAILABLE', 'Requested quantity is not currently available.');
    const price = await resolveVariantPrice(transaction, {
      organizationId: cart.organizationId,
      variantId: existingLine.variant_id,
      currency: cart.currency,
      at: cart.evaluatedAt,
    });
    if (!price) throw new CartDomainError('UNPRICED', 'This Variant has no current selling price.');
    await sql<{ id: string }>`
      update cart.cart_lines set quantity = ${input.quantity}::numeric, version = version + 1, updated_at = now()
      where id = ${input.lineId} and cart_id = ${cart.id} and organization_id = ${cart.organizationId} returning id
    `.execute(transaction);
    const version = await bumpCartVersion(transaction, cart.id, input.expectedVersion);
    return evaluateCart(transaction, { ...cart, version });
  });
}

/** Replace a configuration within its product. An existing target line survives a merge. */
export async function replaceCartLineVariant<Scope extends CartMutationScope>(
  db: Kysely<DatabaseSchema>,
  input: Scope & { lineId: string; targetVariantId: string; quantity: string },
) {
  const desired = quantity(input.quantity);
  return mutateCart(db, input, 'replace_variant', async (transaction, cart) => {
    const lines = await sql<{
      id: string;
      variant_id: string;
      product_id: string;
      quantity: string;
    }>`
      select line.id, line.variant_id, variant.product_id, line.quantity::text
      from cart.cart_lines line
      join catalog.product_variants variant
        on variant.id = line.variant_id and variant.organization_id = line.organization_id
      where line.cart_id = ${cart.id} and line.organization_id = ${cart.organizationId}
        and (line.id = ${input.lineId} or line.variant_id = ${input.targetVariantId})
      for update of line
    `.execute(transaction);
    const source = lines.rows.find((line) => line.id === input.lineId);
    if (!source) throw new CartDomainError('NOT_FOUND', 'Cart line was not found.');
    const target = lines.rows.find((line) => line.id !== source.id);
    const total = desired + (target ? quantity(target.quantity) : 0n);
    if (total > 99n) throw new CartDomainError('LIMIT_EXCEEDED', 'Cart quantity limit exceeded.');

    await assertSellableVariant(
      transaction,
      cart.organizationId,
      input.targetVariantId,
      source.product_id,
    );
    const ats = availableWholeUnits(
      await availableToSell(transaction, cart.organizationId, input.targetVariantId),
    );
    if (total > ats)
      throw new CartDomainError('UNAVAILABLE', 'Requested quantity is not currently available.');
    const price = await resolveVariantPrice(transaction, {
      organizationId: cart.organizationId,
      variantId: input.targetVariantId,
      currency: cart.currency,
      at: cart.evaluatedAt,
    });
    if (!price) throw new CartDomainError('UNPRICED', 'This Variant has no current selling price.');
    if (source.variant_id === input.targetVariantId && quantity(source.quantity) === desired)
      return evaluateCart(transaction, cart);

    const survivingLineId = target?.id ?? source.id;
    await sql`
      update cart.cart_lines set variant_id = ${input.targetVariantId}, quantity = ${total.toString()}::numeric,
        last_seen_unit_price = ${price.amount}::numeric, version = version + 1, updated_at = now()
      where id = ${survivingLineId} and cart_id = ${cart.id} and organization_id = ${cart.organizationId}
    `.execute(transaction);
    if (target)
      await sql`
        delete from cart.cart_lines
        where id = ${source.id} and cart_id = ${cart.id} and organization_id = ${cart.organizationId}
      `.execute(transaction);
    const version = await bumpCartVersion(transaction, cart.id, input.expectedVersion);
    return evaluateCart(transaction, { ...cart, version });
  });
}

export async function removeCartLine<Scope extends CartMutationScope>(
  db: Kysely<DatabaseSchema>,
  input: Scope & { lineId: string; expectedVersion: number },
) {
  return mutateCart(db, input, 'remove_line', async (transaction, cart) => {
    const removed = await sql<{ id: string }>`
      delete from cart.cart_lines where id = ${input.lineId} and cart_id = ${cart.id} and organization_id = ${cart.organizationId} returning id
    `.execute(transaction);
    if (!removed.rows[0]) throw new CartDomainError('NOT_FOUND', 'Cart line was not found.');
    const version = await bumpCartVersion(transaction, cart.id, input.expectedVersion);
    return evaluateCart(transaction, { ...cart, version });
  });
}

export async function applyCartCoupon<Scope extends CartMutationScope>(
  db: Kysely<DatabaseSchema>,
  input: Scope & { couponCode: string; expectedVersion: number },
) {
  const normalizedCode = input.couponCode.trim().replace(/\s+/g, '').toLocaleUpperCase();
  return mutateCart(db, input, 'apply_coupon', async (transaction, cart) => {
    const coupon = await sql<{ id: string }>`
      select id from promotions.coupon_codes
      where organization_id = ${cart.organizationId} and normalized_code = ${normalizedCode} and status = 'ACTIVE'
    `.execute(transaction);
    const couponId = coupon.rows[0]?.id;
    if (!couponId) throw new CartDomainError('NOT_FOUND', 'Coupon was not found.');
    const selected = await sql<{ count: number; present: boolean }>`
      select count(*)::int count,coalesce(bool_or(coupon_code_id=${couponId}),false) present
      from cart.cart_coupons where cart_id=${cart.id}`.execute(transaction);
    if (selected.rows[0]!.present) return evaluateCart(transaction, cart);
    if (!selected.rows[0]!.present && selected.rows[0]!.count >= 10)
      throw new CartDomainError('LIMIT_EXCEEDED', 'Cart coupon limit exceeded.');
    await sql`insert into cart.cart_coupons (cart_id, coupon_code_id) values (${cart.id}, ${couponId}) on conflict do nothing`.execute(
      transaction,
    );
    const version = await bumpCartVersion(transaction, cart.id, input.expectedVersion);
    return evaluateCart(transaction, { ...cart, version });
  });
}

export async function removeCartCoupon<Scope extends CartMutationScope>(
  db: Kysely<DatabaseSchema>,
  input: Scope & { couponCode: string; expectedVersion: number },
) {
  const normalizedCode = input.couponCode.trim().replace(/\s+/g, '').toLocaleUpperCase();
  return mutateCart(db, input, 'remove_coupon', async (transaction, cart) => {
    const removed = await sql<{ coupon_code_id: string }>`
      delete from cart.cart_coupons link using promotions.coupon_codes coupon
      where link.cart_id = ${cart.id} and link.coupon_code_id = coupon.id and coupon.normalized_code = ${normalizedCode}
      returning link.coupon_code_id
    `.execute(transaction);
    if (!removed.rows[0])
      throw new CartDomainError('NOT_FOUND', 'Coupon was not applied to this Cart.');
    const version = await bumpCartVersion(transaction, cart.id, input.expectedVersion);
    return evaluateCart(transaction, { ...cart, version });
  });
}

/** Clear is one intention: remove lines AND coupon selections, with one revision/receipt. */
export async function clearCart<Scope extends CartMutationScope>(
  db: Kysely<DatabaseSchema>,
  input: Scope,
) {
  return mutateCart(db, input, 'clear', async (transaction, cart) => {
    const lines =
      await sql`delete from cart.cart_lines where cart_id=${cart.id} returning id`.execute(
        transaction,
      );
    const coupons =
      await sql`delete from cart.cart_coupons where cart_id=${cart.id} returning coupon_code_id`.execute(
        transaction,
      );
    const version =
      lines.rows.length || coupons.rows.length
        ? await bumpCartVersion(transaction, cart.id, input.expectedVersion)
        : cart.version;
    return evaluateCart(transaction, { ...cart, version });
  });
}
