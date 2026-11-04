import { CheckoutRequestError } from './checkout-errors.js';
import type { FastifyRequest } from 'fastify';
import type { RuntimeConfig } from '@maevelle/config';
import type { DatabaseClient } from '@maevelle/database';
import { type CheckoutAuthority } from '@maevelle/database/checkout';
import { resolveStorefrontContext } from '@maevelle/database/storefront';
import type { CartShopperResolver } from './cart-context.js';
import { hasShopperSessionCookie, shopperPartition } from '../auth/shopper-partition.js';

export function checkoutGuestCookieName(id: string, secure: boolean): string {
  return `${secure ? '__Host-' : ''}maevelle_checkout_guest_${id.replaceAll('-', '')}`;
}
export function checkoutGuestAuthority(
  request: FastifyRequest,
  config: RuntimeConfig,
  organizationId: string,
): Extract<CheckoutAuthority, { kind: 'GUEST' }> {
  const id = request.headers['x-checkout-context'];
  if (
    typeof id !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
  )
    throw new CheckoutRequestError(
      'GUEST_CONTEXT_REQUIRED',
      401,
      'Establish and select a guest Checkout session.',
    );
  const expected = checkoutGuestCookieName(id.toLowerCase(), config.nodeEnv === 'production');
  const pairs = (request.headers.cookie ?? '')
    .split(';')
    .map((pair) => pair.trim())
    .filter((pair) => pair.split('=')[0] === expected);
  if (pairs.length !== 1 || !/^[A-Za-z0-9_-]{43}$/.test(pairs[0]!.slice(expected.length + 1)))
    throw new CheckoutRequestError(
      'SESSION_EXPIRED',
      401,
      'Guest Checkout session is unavailable.',
    );
  return {
    kind: 'GUEST',
    organizationId,
    sessionId: id.toLowerCase(),
    token: pairs[0]!.slice(expected.length + 1),
  };
}
export async function checkoutRequestContext(
  database: DatabaseClient,
  config: RuntimeConfig,
  request: FastifyRequest,
  resolveShopper: CartShopperResolver,
) {
  const context = await resolveStorefrontContext(database.db, config.storefrontOrganizationCode);
  if (!context)
    throw new CheckoutRequestError('UNAVAILABLE', 503, 'Checkout configuration is unavailable.');
  const shopper = await resolveShopper(request, true);
  let owner: CheckoutAuthority;
  if (shopper) {
    if (shopper.organizationId !== context.organizationId || !shopper.sessionKeyHash)
      throw new CheckoutRequestError(
        'SESSION_EXPIRED',
        401,
        'Verified shopper session is required.',
      );
    if (
      request.headers['x-shopper-partition'] !== shopperPartition(config.betterAuthSecret, shopper)
    )
      throw new CheckoutRequestError(
        'OWNER_CHANGED',
        409,
        'Restore the current shopper session before accessing Checkout.',
      );
    owner = { ...shopper, kind: 'ACCOUNT', sessionKeyHash: shopper.sessionKeyHash };
  } else {
    if (hasShopperSessionCookie(request.headers.cookie))
      throw new CheckoutRequestError('SESSION_EXPIRED', 401, 'Sign in again.');
    owner = checkoutGuestAuthority(request, config, context.organizationId);
  }
  return { context, owner };
}
