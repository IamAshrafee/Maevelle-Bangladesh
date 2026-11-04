'use client';
import { useSyncExternalStore } from 'react';
import type { CheckoutSourceDto } from '@maevelle/contracts';
import { resolveShopperPartition } from '@/lib/auth/shopper-session';
import {
  SHOPPER_TRANSITION_EVENT,
  SHOPPER_TRANSITION_STORAGE,
  SHOPPER_AUTH_STORAGE,
} from '@/lib/auth/shopper-transitions';
import { cartStore } from '@/features/cart/browser-runtime';
import { cartIsBusy } from '@/features/cart/types';
import { StorefrontClientApiError } from '@/lib/api/client/http';
import { checkoutPreviewEnabled } from './availability';
import { reviewApi } from './foundation-api';
import { createReviewController } from './foundation-controller';
import { createReviewJournal } from './foundation-journal';
import { EMPTY_REVIEW, type CatalogReferences } from './foundation-types';

let runtime: ReturnType<typeof createRuntime> | undefined;
function createRuntime() {
  const journal = createReviewJournal({
    getItem: (key) => sessionStorage.getItem(key),
    setItem: (key, value) => sessionStorage.setItem(key, value),
  });
  const controller = createReviewController({
    api: reviewApi,
    journal,
    resolveOwner: resolveShopperPartition,
  });
  let clients = 0,
    activities = 0,
    cleanup: (() => void) | undefined,
    authHold = false,
    localHold = false;
  let remoteTimer: ReturnType<typeof setTimeout> | undefined;
  function listen() {
    if (cleanup) return;
    const events = new AbortController(),
      options = { signal: events.signal };
    const refresh = () => {
      if (authHold) return;
      if (controller.getSnapshot().suspended) {
        if (clients) void controller.resume().catch(() => undefined);
      } else if (controller.getSnapshot().draft) {
        if (clients) void controller.checkOwner().catch(() => undefined);
      } else {
        controller.invalidate();
        if (clients) void controller.refresh().catch(() => undefined);
      }
    };
    const transition = (phase: string, local = false) => {
      if (!local && (localHold || (authHold && phase === 'begin'))) return;
      if (local) localHold = phase === 'begin';
      clearTimeout(remoteTimer);
      authHold = phase === 'begin';
      controller.invalidate(authHold);
      // A closed sibling cannot leave this tab permanently waiting. Verify live authority.
      if (authHold && !local) remoteTimer = setTimeout(() => transition('settled'), 20_000);
      if (!authHold && clients) void controller.refresh().catch(() => undefined);
    };
    addEventListener(
      SHOPPER_TRANSITION_EVENT,
      (event) => transition((event as CustomEvent<{ phase: string }>).detail.phase, true),
      options,
    );
    addEventListener(
      'storage',
      (event) => {
        if (![SHOPPER_TRANSITION_STORAGE, SHOPPER_AUTH_STORAGE].includes(event.key ?? '')) return;
        if (event.key === SHOPPER_TRANSITION_STORAGE && event.newValue) {
          try {
            const value = JSON.parse(event.newValue);
            if (value.phase === 'begin' || value.phase === 'settled') transition(value.phase);
            else refresh();
          } catch {
            refresh();
          }
        } else refresh();
      },
      options,
    );
    addEventListener('focus', refresh, options);
    addEventListener('pageshow', refresh, options);
    addEventListener('online', refresh, options);
    document.addEventListener(
      'visibilitychange',
      () => {
        if (document.visibilityState === 'hidden') controller.suspend();
        else refresh();
      },
      options,
    );
    // Existing Cart channel is an identity hint fallback when storage is blocked.
    let channel: BroadcastChannel | undefined;
    try {
      channel = new BroadcastChannel('maevelle:cart-coordination:v1');
      channel.onmessage = ({ data }) => {
        if (data?.kind === 'identity' && (data.phase === 'begin' || data.phase === 'settled'))
          transition(data.phase);
      };
    } catch {
      /* Focus and same-tab events still invalidate. */
    }
    cleanup = () => {
      clearTimeout(remoteTimer);
      localHold = false;
      authHold = false;
      events.abort();
      channel?.close();
      controller.invalidate();
      cleanup = undefined;
    };
  }
  function release() {
    if (!clients && !activities) cleanup?.();
  }
  return {
    controller,
    journal,
    subscribe(fn: () => void) {
      clients++;
      listen();
      const unsubscribe = controller.subscribe(fn);
      return () => {
        unsubscribe();
        clients--;
        release();
      };
    },
    async action<T>(run: () => Promise<T>) {
      activities++;
      listen();
      try {
        return await run();
      } finally {
        activities--;
        release();
      }
    },
  };
}
function instance() {
  if (!checkoutPreviewEnabled)
    throw new StorefrontClientApiError(503, 'CHECKOUT_DISABLED', 'Checkout is unavailable.');
  return (runtime ??= createRuntime());
}
const subscribeReview = (fn: () => void) => instance().subscribe(fn);
const reviewSnapshot = () => instance().controller.getSnapshot();
const serverReviewSnapshot = () => EMPTY_REVIEW;
export function useReviewSnapshot() {
  return useSyncExternalStore(subscribeReview, reviewSnapshot, serverReviewSnapshot);
}
function currentCart() {
  const snapshot = cartStore.getSnapshot(),
    cart = snapshot.confirmed;
  if (!cart || cartIsBusy(snapshot) || !cart.lines.length || !cart.commerceReview?.merchandiseReady)
    throw new StorefrontClientApiError(422, 'SOURCE_INELIGIBLE', 'Review your current bag.');
  return {
    source: { kind: 'CART' as const, cartId: cart.id, cartRevision: cart.intentRevision },
    handles: Object.fromEntries(
      cart.lines
        .filter((line) => line.productHandle)
        .map((line) => [line.variantId, line.productHandle]),
    ),
  };
}
export async function startReview(source: CheckoutSourceDto, handles: CatalogReferences) {
  const active = instance();
  const intended = source.kind === 'CART' ? currentCart() : { source, handles };
  return active.action(() => active.controller.initiate(intended.source, intended.handles));
}
export const reviewActions = {
  delivery: () => instance().controller.delivery,
  resume: () => instance().controller.resume(),
  refresh: (id?: string) => instance().controller.refresh(id),
  retry: () => instance().controller.retry(),
  abandon: () => {
    const c = instance().controller,
      draft = c.getSnapshot().draft;
    if (!draft) return Promise.resolve();
    return c.update({ revision: draft.revision, action: 'ABANDON' });
  },
  adopt: () => instance().controller.adopt(),
  async refreshCart() {
    await cartStore.refresh();
    const c = instance().controller,
      state = c.getSnapshot(),
      intended = currentCart();
    if (state.partition !== (cartStore.accountPartition() ?? 'guest'))
      throw new StorefrontClientApiError(409, 'OWNER_CHANGED', 'Check your current bag.');
    if (!state.draft) return;
    return c.update({ revision: state.draft.revision, source: intended.source }, intended.handles);
  },
  stopRecovering: () => instance().controller.stopRecovering(),
  freshGuest: () => instance().controller.startNewGuest(),
  revoke: () => instance().controller.revoke(),
  references: () => {
    const active = instance(),
      part = active.controller.getSnapshot().partition;
    return part ? active.journal.references(part) : [];
  },
};
