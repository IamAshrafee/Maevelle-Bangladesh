import type { FastifyRequest } from 'fastify';
import type { RuntimeConfig } from '@maevelle/config';
import type { DatabaseClient } from '@maevelle/database';
import { sql } from '@maevelle/database';
import type { ShopperPrincipal } from '@maevelle/database/shopper';
import { resolveStorefrontContext } from '@maevelle/database/storefront';
import { hashToken } from '@maevelle/security';
import type { CartOwnerDto } from '@maevelle/contracts';

export class CartRequestError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    message: string,
    public readonly contexts?: readonly string[],
  ) {
    super(message);
  }
}
export type CartShopperResolver = (
  request: FastifyRequest,
  strict?: boolean,
) => Promise<ShopperPrincipal | null>;
export const guestCookiePrefix = (secure: boolean) =>
  secure ? '__Host-maevelle_cart_' : 'maevelle_cart_';

export function cartCookies(request: FastifyRequest, secure: boolean): string[] {
  const values: string[] = [];
  const names = new Set<string>();
  for (const part of (request.headers.cookie ?? '').split(';')) {
    const [name = '', ...rest] = part.trim().split('=');
    // No independent proof exists for fixed-cookie ownership. Never adopt it.
    if (name === 'maevelle_cart')
      throw new CartRequestError('SESSION_EXPIRED', 401, 'Your guest Cart session is unavailable.');
    if (!name.startsWith('maevelle_cart_') && !name.startsWith('__Host-maevelle_cart_')) continue;
    if (!new RegExp(`^${guestCookiePrefix(secure)}[0-9a-f]{32}$`).test(name))
      throw new CartRequestError('INVALID_SESSION', 401, 'Invalid Cart credential.');
    if (names.has(name))
      throw new CartRequestError('INVALID_SESSION', 401, 'Ambiguous Cart cookie.');
    names.add(name);
    const token = rest.join('=');
    if (!/^[A-Za-z0-9_-]{43}$/.test(token))
      throw new CartRequestError('INVALID_SESSION', 401, 'Invalid Cart credential.');
    values.push(token);
  }
  if (values.length > 32)
    throw new CartRequestError(
      'CART_CONTEXT_LIMIT',
      409,
      'Too many guest contexts. Resolve existing contexts before continuing.',
    );
  return values;
}

export async function resolveCartRequest(
  database: DatabaseClient,
  config: RuntimeConfig,
  request: FastifyRequest,
  resolveShopper: CartShopperResolver,
): Promise<{
  context: { organizationId: string; currency: string };
  owner: CartOwnerDto | null;
  token?: string;
  tokens: readonly string[];
}> {
  const context = await resolveStorefrontContext(database.db, config.storefrontOrganizationCode);
  if (!context)
    throw new CartRequestError(
      'INVALID_CONFIGURATION',
      503,
      'Storefront Cart configuration is unavailable.',
    );
  // Unavailable or invalid authenticated state is never anonymous Cart authority.
  const hasShopperCookie = /(?:^|;\s*)(?:__Secure-)?maevelle-shopper[.-]/.test(
    request.headers.cookie ?? '',
  );
  const shopper = await resolveShopper(request, true);
  if (shopper) {
    if (shopper.organizationId !== context.organizationId)
      throw new CartRequestError('INVALID_OWNERSHIP', 403, 'Cart ownership could not be resolved.');
    return {
      context,
      tokens: [],
      owner: {
        kind: 'ACCOUNT',
        organizationId: context.organizationId,
        accountId: shopper.accountId,
        customerId: shopper.customerId,
        currency: context.currency,
      },
    };
  }
  if (hasShopperCookie)
    throw new CartRequestError('SESSION_EXPIRED', 401, 'Sign in again before accessing your Cart.');
  const tokens = cartCookies(request, config.nodeEnv === 'production');
  if (!tokens.length) return { context, owner: null, tokens };
  const rows = await sql<{ id: string; owner_context: string; public_token_hash: string }>`
    select id::text,owner_context::text,public_token_hash from cart.carts
    where organization_id=${context.organizationId} and currency_code=${context.currency}
      and credential_state='SLOT_V1' and owner_account_id is null and status='ACTIVE' and expires_at>clock_timestamp()
      and public_token_hash=any(${tokens.map(hashToken)}) order by id`.execute(database.db);
  // A valid hash in a different cookie slot cannot substitute another authority.
  const matched = rows.rows.filter((row) =>
    (request.headers.cookie ?? '')
      .split(';')
      .some(
        (part) =>
          part.trim() ===
          `${guestCookiePrefix(config.nodeEnv === 'production')}${row.id.replaceAll('-', '')}=${tokens.find((token) => hashToken(token) === row.public_token_hash)}`,
      ),
  );
  if (matched.length !== tokens.length)
    throw new CartRequestError('INVALID_SESSION', 401, 'Invalid Cart credential.');
  if (!rows.rows.length)
    throw new CartRequestError('SESSION_EXPIRED', 401, 'Your guest Cart session is unavailable.');
  const bodyContext = (request.body as { ownerContext?: string } | undefined)?.ownerContext;
  if (
    request.headers['x-cart-context'] !== undefined &&
    (typeof request.headers['x-cart-context'] !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        request.headers['x-cart-context'],
      ))
  )
    throw new CartRequestError('INVALID_REQUEST', 400, 'Cart context must be a UUID.');
  const selected = request.headers['x-cart-context'] ?? bodyContext;
  if (typeof selected === 'string' && bodyContext && selected !== bodyContext)
    throw new CartRequestError('OWNER_CHANGED', 409, 'Cart context preconditions disagree.');
  if (!selected && rows.rows.length > 1)
    throw new CartRequestError(
      'CART_CONTEXT_REQUIRED',
      409,
      'Choose an established Cart context before continuing.',
      rows.rows.map((row) => row.owner_context),
    );
  const row = selected
    ? rows.rows.find((candidate) => candidate.owner_context === selected)
    : rows.rows[0];
  if (!row)
    throw new CartRequestError(
      'OWNER_CHANGED',
      409,
      'Cart owner changed. Resolve the current context.',
    );
  const token = tokens.find((candidate) => hashToken(candidate) === row.public_token_hash)!;
  return {
    context,
    tokens,
    token,
    owner: {
      kind: 'GUEST',
      organizationId: context.organizationId,
      cartId: row.id,
      ownerContext: row.owner_context,
      currency: context.currency,
    },
  };
}
