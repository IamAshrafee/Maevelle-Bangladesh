import { sql, type Kysely } from 'kysely';
import { generateOpaqueToken, hashToken } from '@maevelle/security';
import type { DatabaseSchema } from '../index.js';
import type { CartView } from './types.js';
import { CartDomainError } from './errors.js';
import { getGuestCart } from './queries.js';
const defaultCartLifetimeDays = 30;
export function checkedVersion(value: string): number {
  const version = Number(value);
  if (!Number.isSafeInteger(version) || version < 1)
    throw new CartDomainError('UNAVAILABLE', 'Cart revision cannot be represented safely.');
  return version;
}
export interface ResolvedCart<Expiry extends Date | null = Date | null> {
  id: string;
  organizationId: string;
  currency: string;
  version: number;
  expiresAt: Expiry;
  evaluatedAt: string;
  ownerContext: string;
}
export async function findCart(
  db: Kysely<DatabaseSchema>,
  token: string,
  lock = false,
): Promise<ResolvedCart<Date>> {
  const result = await sql<{
    id: string;
    organization_id: string;
    currency_code: string;
    version: string;
    expires_at: Date;
    evaluated_at: string;
    owner_context: string;
  }>`
    select id, organization_id, currency_code, version::text, expires_at, owner_context, transaction_timestamp()::text as evaluated_at
    from cart.carts
    where public_token_hash = ${hashToken(token)} and credential_state = 'SLOT_V1' and owner_account_id is null and status = 'ACTIVE' and expires_at > clock_timestamp()
    ${lock ? sql`for update` : sql``}
  `.execute(db);
  const row = result.rows[0];
  if (!row) throw new CartDomainError('NOT_FOUND', 'Cart was not found.');
  // A lock wait may outlive the credential. Recheck database wall-clock after acquiring it.
  if (lock) {
    const valid = await sql<{ valid: boolean }>`select expires_at > clock_timestamp() as valid
      from cart.carts where id=${row.id}`.execute(db);
    if (!valid.rows[0]?.valid) throw new CartDomainError('NOT_FOUND', 'Cart was not found.');
  }
  return {
    id: row.id,
    organizationId: row.organization_id,
    currency: row.currency_code,
    version: checkedVersion(row.version),
    expiresAt: row.expires_at,
    evaluatedAt: row.evaluated_at,
    ownerContext: row.owner_context,
  };
}

export async function createGuestCart(
  db: Kysely<DatabaseSchema>,
  input: { organizationId: string; currency: string; expiresAt?: Date },
): Promise<{ token: string; cart: CartView }> {
  if (!db.isTransaction)
    return db.transaction().execute(async (tx) => {
      await sql`set local lock_timeout='2s'`.execute(tx);
      await sql`set local statement_timeout='5s'`.execute(tx);
      return createGuestCart(tx, input);
    });
  if (!/^[A-Z]{3}$/.test(input.currency)) {
    throw new CartDomainError(
      'VALIDATION_FAILED',
      'Currency must be a three-letter uppercase code.',
    );
  }
  const token = generateOpaqueToken();
  const expiresAt = input.expiresAt ?? new Date(Date.now() + defaultCartLifetimeDays * 86_400_000);
  await sql`
    insert into cart.carts (organization_id, public_token_hash, currency_code, expires_at, credential_state)
    values (${input.organizationId}, ${hashToken(token)}, ${input.currency}, ${expiresAt}, 'SLOT_V1')
  `.execute(db);
  return { token, cart: await getGuestCart(db, token) };
}
