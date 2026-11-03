import type { WishlistCartTransferRequestDto } from '@maevelle/contracts';
import { sql, type Kysely } from 'kysely';
import type { DatabaseSchema } from '../index.js';
import { removeLockedWishlistProduct } from '../wishlist/account.js';
import { applyCartLineAddition } from './commands.js';
import { CartDomainError } from './errors.js';
import { mutateCart } from './receipts.js';
import type { AccountMutationScope } from './types.js';

export function transferAccountWishlistItem(
  db: Kysely<DatabaseSchema>,
  scope: AccountMutationScope,
  intent: Omit<WishlistCartTransferRequestDto, 'version' | 'ownerContext'>,
) {
  const owner = scope.account;
  return mutateCart(db, { ...scope, ...intent }, 'wishlist_transfer', async (tx, cart) => {
    // Cart has already validated and locked the account. Take the Wishlist list lock
    // before touching its items, matching Wishlist save, remove and merge.
    const list = (
      await sql<{ id: string; version: string }>`
      select id::text, version::text from wishlist.account_lists
      where organization_id=${owner.organizationId} and owner_account_id=${owner.accountId}
      for update
    `.execute(tx)
    ).rows[0];
    if (!list) throw new CartDomainError('NOT_FOUND', 'Wishlist item was not found.');
    if (Number(list.version) !== intent.wishlistVersion)
      throw new CartDomainError('WISHLIST_CHANGED', 'Wishlist changed. Review it before retrying.');
    const item = (
      await sql<{ preferred_variant_id: string | null }>`
      select preferred_variant_id::text from wishlist.account_items
      where organization_id=${owner.organizationId} and wishlist_id=${list.id}
        and product_id=${intent.productId}
    `.execute(tx)
    ).rows[0];
    if (!item) throw new CartDomainError('NOT_FOUND', 'Wishlist item was not found.');
    if (item.preferred_variant_id && item.preferred_variant_id !== intent.variantId.toLowerCase())
      throw new CartDomainError(
        'INVALID_CONFIGURATION',
        'Select the saved variant or update your Wishlist preference.',
      );
    const view = await applyCartLineAddition(tx, cart, {
      ...intent,
      expectedVersion: scope.expectedVersion,
    });
    if (intent.action === 'MOVE')
      await removeLockedWishlistProduct(
        tx,
        owner,
        list.id,
        intent.productId,
        intent.wishlistVersion,
      );
    return view;
  });
}
