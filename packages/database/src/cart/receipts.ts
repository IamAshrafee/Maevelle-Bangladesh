import { sql, type Kysely, type Transaction } from 'kysely';
import type { CartMutationOutcomeDto } from '@maevelle/contracts';
import type { DatabaseSchema } from '../index.js';
import { claimIdempotencyRecord, IdempotencyKeyReuseError } from '../platform.js';
import { findCart, type ResolvedCart } from './context.js';
import { CartDomainError } from './errors.js';
import { evaluateCart } from './queries.js';
import { assertActiveCartAccount, findAccountCart } from './account.js';
import { cartTransaction } from './transaction.js';
import { fingerprint, quantity } from './value.js';
import type { OwnedCartView, CartMutationScope, CartMutationView } from './types.js';

/** Sorting object keys makes command identity independent of transport property order. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonical(item)]),
    );
  return value;
}

/** Authorize and serialize Cart intent, then commit its receipt and outbox together. */
export function mutateCart<Scope extends CartMutationScope>(
  db: Kysely<DatabaseSchema>,
  input: Scope,
  operation: string,
  apply: (transaction: Transaction<DatabaseSchema>, cart: ResolvedCart) => Promise<OwnedCartView>,
): Promise<CartMutationView<Scope>>;
export async function mutateCart(
  db: Kysely<DatabaseSchema>,
  input: CartMutationScope,
  operation: string,
  apply: (transaction: Transaction<DatabaseSchema>, cart: ResolvedCart) => Promise<OwnedCartView>,
): Promise<OwnedCartView> {
  if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 1)
    throw new CartDomainError('VALIDATION_FAILED', 'Cart revision is invalid.');
  const request = Object.fromEntries(
    Object.entries(input).filter(
      ([key]) => key !== 'token' && key !== 'idempotencyKey' && key !== 'account',
    ),
  );
  const digest = fingerprint(canonical({ operation, ...request }));
  const key =
    'account' in input ? input.idempotencyKey : (input.idempotencyKey ?? `legacy:${digest}`);
  if (!key || !/^[A-Za-z0-9:_-]{1,160}$/.test(key))
    throw new CartDomainError('VALIDATION_FAILED', 'Idempotency key is invalid.');
  return cartTransaction(db, async (tx) => {
    const account = 'account' in input ? input.account : null;
    if (account) await assertActiveCartAccount(tx, account, true);
    const cart =
      'account' in input
        ? await findAccountCart(tx, input.account, true)
        : await findCart(tx, input.token, true);
    if (
      'token' in input &&
      ((input.organizationId && cart.organizationId !== input.organizationId) ||
        (input.currency && cart.currency !== input.currency))
    )
      throw new CartDomainError('NOT_FOUND', 'Cart was not found.');
    if ((account || input.ownerContext) && input.ownerContext !== cart.ownerContext)
      throw new CartDomainError(
        'OWNER_CHANGED',
        'Cart owner changed. Resolve the current context.',
      );
    let record;
    try {
      record = await claimIdempotencyRecord(tx, {
        organizationId: cart.organizationId,
        principalType: account ? 'ACCOUNT_CART' : 'GUEST_CART',
        principalId: cart.id,
        operationType: `cart.foundation.${operation}`,
        idempotencyKey: key,
        requestFingerprint: digest,
      });
    } catch (error) {
      if (error instanceof IdempotencyKeyReuseError)
        throw new CartDomainError(
          input.ownerContext ? 'IDEMPOTENCY_CONFLICT' : 'CONFLICT',
          'The intent key was used for a different Cart request.',
        );
      throw error;
    }
    if (!record.created) {
      const receipt = await sql<{
        safe_response: CartMutationOutcomeDto | null;
        expired: boolean;
      }>`
        select safe_response, (expires_at is null or expires_at <= clock_timestamp()) expired
        from platform.idempotency_records where id=${record.id}`.execute(tx);
      const saved = receipt.rows[0];
      if (saved?.expired)
        throw new CartDomainError(
          'INTENT_EXPIRED',
          'This intent is outside its recovery window. Review the Cart before a new action.',
        );
      if (record.status !== 'SUCCEEDED' || !saved?.safe_response)
        throw new CartDomainError('CONFLICT', 'This Cart intent is not ready for replay.');
      return {
        ...(await evaluateCart(tx, cart)),
        outcome: { ...saved.safe_response, replayed: true },
      };
    }
    if (cart.version !== input.expectedVersion)
      throw new CartDomainError(
        'STALE_VERSION',
        'Cart has changed; reload before updating.',
        cart.version,
      );
    const before = await sql<{ id: string; variant_id: string; quantity: string }>`
      select id::text,variant_id::text,quantity::text from cart.cart_lines where cart_id=${cart.id} order by id limit 101`.execute(
      tx,
    );
    if (before.rows.length > 100)
      throw new CartDomainError('LIMIT_EXCEEDED', 'Cart requires review before further mutations.');
    const view = await apply(tx, cart);
    const previous = new Map(before.rows.map((line) => [line.id, line]));
    const next = new Map(view.lines.map((line) => [line.id, line]));
    const changes: CartMutationOutcomeDto['changes'] = [
      ...new Set([...previous.keys(), ...next.keys()]),
    ]
      .sort()
      .flatMap((id) => {
        const old = previous.get(id),
          current = next.get(id);
        const previousQuantity = old ? quantity(old.quantity).toString() : '0';
        const nextQuantity = current ? quantity(current.quantity).toString() : '0';
        return previousQuantity === nextQuantity && old?.variant_id === current?.variantId
          ? []
          : [
              {
                lineId: id,
                variantId: current?.variantId ?? old!.variant_id,
                ...(old && current && old.variant_id !== current.variantId
                  ? { previousVariantId: old.variant_id }
                  : {}),
                previousQuantity,
                quantity: nextQuantity,
              },
            ];
      });
    const event =
      view.version === cart.version
        ? { rows: [] }
        : await sql<{ event_id: string }>`insert into platform.outbox_events
      (organization_id,event_type,event_version,aggregate_type,aggregate_id,aggregate_version,payload,occurred_at)
      values (${cart.organizationId},'cart.intent.mutated',1,'cart',${cart.id},${view.version},
        ${JSON.stringify({ operation, receiptId: record.id, changes })}::jsonb,now()) returning event_id::text`.execute(
            tx,
          );
    const outcome: CartMutationOutcomeDto = {
      receiptId: record.id,
      operation,
      committedVersion: String(view.version),
      eventIds: event.rows.map((row) => row.event_id),
      replayed: false,
      changes,
    };
    await sql`update platform.idempotency_records set status='SUCCEEDED',
      result_entity_type='cart',result_entity_id=${cart.id},safe_response=${JSON.stringify(outcome)}::jsonb,
      completed_at=now(),expires_at=now()+interval '7 days' where id=${record.id}`.execute(tx);
    return { ...view, outcome };
  });
}

/** Compatibility entry point for internal guest callers. */
export { mutateCart as mutateGuestCart };
