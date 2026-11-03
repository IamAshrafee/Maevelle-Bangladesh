import { createHmac } from 'node:crypto';
import type { ShopperPrincipal } from '@maevelle/database/shopper';

export function shopperPartition(secret: string, principal: ShopperPrincipal): string {
  return createHmac('sha256', secret)
    .update(`shopper-client-partition:v1:${principal.organizationId}:${principal.accountId}`)
    .digest('base64url');
}

export function hasShopperSessionCookie(cookie: string | undefined): boolean {
  return /(?:^|;\s*)(?:__Secure-)?maevelle-shopper[.-]/.test(cookie ?? '');
}
