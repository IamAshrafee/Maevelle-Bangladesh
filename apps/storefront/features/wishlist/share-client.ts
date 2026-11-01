import type { WishlistShareCreateDto, WishlistShareCreatedDto } from '@maevelle/contracts';
import { requestStorefrontClient, StorefrontClientApiError } from '@/lib/api/client/http';
import type { WishlistItem } from './types';

export type GuestShare = WishlistShareCreatedDto & { manageToken: string; revoked?: boolean };
export type PendingShare = { owner: string; request: WishlistShareCreateDto };
export const GUEST_SHARES_KEY = 'maevelle_wishlist_shares_v1';
export const GUEST_PENDING_KEY = 'maevelle_wishlist_share_create_v1';
const ACCOUNT_PENDING_KEY = 'maevelle_wishlist_account_share_create_v1';

export function readGuestShares(): GuestShare[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(GUEST_SHARES_KEY) ?? '[]');
    return Array.isArray(value)
      ? value
          .filter(
            (item): item is GuestShare =>
              item &&
              typeof item.id === 'string' &&
              typeof item.viewToken === 'string' &&
              typeof item.manageToken === 'string',
          )
          .slice(0, 50)
      : [];
  } catch {
    return [];
  }
}
export function writeGuestShares(shares: GuestShare[]) {
  localStorage.setItem(GUEST_SHARES_KEY, JSON.stringify(shares.slice(0, 50)));
}
export function accountPendingKey(owner: string) {
  return `${ACCOUNT_PENDING_KEY}:${owner}`;
}
export function shareUrl(token: string) {
  return `${window.location.origin}/wishlist/shared#${token}`;
}
export function operationId() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}
export function expiresIn(days: number) {
  return new Date(Date.now() + days * 86_400_000).toISOString();
}
export function buildShareRequest(input: {
  mode: 'guest' | 'account';
  selection: 'all' | 'selected';
  items: readonly WishlistItem[];
  selected: readonly { productId: string; preferredVariantId: string | null }[];
  operationId: string;
  expiresAt: string;
}): WishlistShareCreateDto {
  return {
    operationId: input.operationId,
    expiresAt: input.expiresAt,
    selection: input.selection,
    items:
      input.selection === 'all'
        ? input.mode === 'account'
          ? []
          : input.items.map((item) => ({
              productId: item.id,
              preferredVariantId: item.preferredVariantId ?? null,
            }))
        : [...input.selected],
  };
}
export function shareError(error: unknown) {
  if (error instanceof StorefrontClientApiError) {
    if (error.status === 401)
      return 'Your session expired. Sign in again before managing account links.';
    if (error.status === 409)
      return 'This operation may already have completed or the link changed. Review your links before starting a new action.';
    if (error.status === 429) return `Too many requests. Please wait ${error.retryAfterSeconds ?? 60} seconds before retrying.`;
    if (error.status === 404) return 'This link is unavailable to this account.';
    if (error.status === 422)
      return error.message || 'The selection or expiration is no longer valid.';
  }
  return error instanceof Error && error.message
    ? error.message
    : 'The request could not be completed. Try again.';
}
export async function copyPublicLink(token: string) {
  const url = shareUrl(token);
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(url);
    return;
  }
  const input = document.createElement('textarea');
  input.value = url;
  input.setAttribute('readonly', '');
  input.style.position = 'fixed';
  input.style.opacity = '0';
  document.body.append(input);
  input.select();
  const copied = document.execCommand('copy');
  input.remove();
  if (!copied) throw new Error('Could not copy the link.');
}
export async function nativeShare(token: string) {
  if (!navigator.share) throw new Error('Device sharing is unavailable. Copy the link instead.');
  await navigator.share({
    title: 'Maevelle favorites',
    text: "Here are some Maevelle favorites I thought you'd love.",
    url: shareUrl(token),
  });
}
export async function createAccountShare(request: WishlistShareCreateDto) {
  return requestStorefrontClient<WishlistShareCreatedDto>(
    '/api/storefront/v1/wishlist/account-shares',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
    },
  );
}
