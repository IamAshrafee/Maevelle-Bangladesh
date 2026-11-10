import type { FastifyRequest } from 'fastify';
import type { RuntimeConfig } from '@maevelle/config';
import type { DatabaseClient } from '@maevelle/database';
import { resolveStorefrontContext } from '@maevelle/database/storefront';
import {
  privacyProof,
  PrivacyAuthorityError,
  type PrivacyOwner,
} from '@maevelle/database/analytics';
import { hasShopperSessionCookie } from '../auth/shopper-partition.js';
import type { CartShopperResolver } from './cart-context.js';

export const privacyCookieName = (secure: boolean) => `${secure ? '__Host-' : ''}maevelle_privacy`;
export function privacyCookie(request: FastifyRequest, secure: boolean) {
  const name = privacyCookieName(secure);
  const pairs = (request.headers.cookie ?? '')
    .split(';')
    .map((v) => v.trim())
    .filter((v) => v.split('=')[0] === name);
  if (!pairs.length) return undefined;
  if (pairs.length !== 1 || !/^[A-Za-z0-9_-]{43}$/.test(pairs[0]!.slice(name.length + 1)))
    throw new PrivacyAuthorityError('PRIVACY_CONTEXT_CHANGED');
  return pairs[0]!.slice(name.length + 1);
}
export async function resolvePrivacyOwner(
  database: DatabaseClient,
  config: RuntimeConfig,
  request: FastifyRequest,
  resolveShopper: CartShopperResolver,
): Promise<PrivacyOwner> {
  const context = await resolveStorefrontContext(database.db, config.storefrontOrganizationCode);
  if (!context) throw new Error('Privacy configuration unavailable');
  const shopper = await resolveShopper(request, true);
  if (
    (!shopper && hasShopperSessionCookie(request.headers.cookie)) ||
    (shopper && (!shopper.sessionKeyHash || shopper.organizationId !== context.organizationId))
  )
    throw new PrivacyAuthorityError('SESSION_EXPIRED');
  return {
    organizationId: context.organizationId,
    shopper,
    binding: privacyProof(
      config.betterAuthSecret,
      `${context.organizationId}:${shopper ? `account:${shopper.accountId}:${shopper.sessionKeyHash}` : 'anonymous'}`,
    ),
  };
}
