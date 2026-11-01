'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { wishlistStore } from './wishlist-store';

/** One bounded membership check for a product grid; never one request per card. */
export function WishlistMembershipHydrator({ productIds }: { productIds: readonly string[] }) {
  const state = useSyncExternalStore(
    wishlistStore.subscribe,
    () => wishlistStore.getSnapshot(),
    () => wishlistStore.getServerSnapshot(),
  );
  const ids = productIds.join(',');
  useEffect(() => {
    if (state.mode === 'account' && ids) void wishlistStore.hydrateSavedState(ids.split(','));
  }, [state.mode, state.ownerGeneration, state.listVersion, ids]);
  return null;
}
