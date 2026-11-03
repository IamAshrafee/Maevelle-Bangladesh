'use client';

import { emitCartObservation } from '@/lib/analytics/cart-telemetry';
import { cartApi, createCartApi } from './api';
import { createCartController, type CartController } from './controller';
import { createCartJournal } from './pending-journal';
import { resolveCartShopper } from './shopper-authority';
import { cartIssue } from './errors';
import { StorefrontClientApiError } from '@/lib/api/client/http';
import { EMPTY_CART_SNAPSHOT } from './types';

const CHANNEL = 'maevelle:cart-coordination:v1';
const CART_SIGNAL = 'maevelle_cart_hint_v1';
const RESET_SIGNAL = 'maevelle_cart_session_signal_v1';
const SIGNAL = 'maevelle_cart_identity_v1';
const WISHLIST_AUTH_SIGNAL = 'maevelle_shopper_auth_signal';
const uuid = /^[0-9a-f-]{36}$/i;
let runtime: ReturnType<typeof createRuntime> | null = null;
function createRuntime() {
  let channel: BroadcastChannel | null = null;
  let clients = 0;
  let cleanup: (() => void) | null = null;
  let started = false,
    authHold = false,
    lastHint = 0;
  let hintTimer: ReturnType<typeof setTimeout> | undefined;
  const seen = new Set<string>();
  const storage = {
    getItem: (key: string) => window.sessionStorage.getItem(key),
    setItem: (key: string, value: string) => window.sessionStorage.setItem(key, value),
    removeItem: (key: string) => window.sessionStorage.removeItem(key),
  };
  const guestJournal = createCartJournal(storage);
  const accountMarker = 'maevelle_cart_account_seen_v1';
  let accountExpected = false;
  try {
    accountExpected = storage.getItem(accountMarker) === '1';
  } catch {
    /* Storage is optional. */
  }
  let authorityCheck: Promise<unknown> | null = null;
  let authorityAbort: AbortController | null = null;
  let authorityResolved = false;
  let partition: string | null = null;
  let allowGuest = false;

  function checkOwner(force = false) {
    if (authHold) return Promise.resolve();
    if (authorityCheck && !force) return authorityCheck;
    authorityAbort?.abort();
    const abort = new AbortController();
    authorityAbort = abort;
    authorityResolved = false;
    controller.ownerTransition(true);
    const task = (async () => {
      let next: string | null;
      try {
        next = await resolveCartShopper(abort.signal);
        if (abort.signal.aborted) return;
        if (!next && accountExpected && !allowGuest)
          throw new StorefrontClientApiError(
            401,
            'SESSION_EXPIRED',
            'Sign in to check your account bag.',
          );
      } catch (error) {
        if (abort.signal.aborted) return;
        const expired = error instanceof StorefrontClientApiError && error.status === 401;
        controller.authorityUnavailable(
          {
            ...cartIssue(error, Date.now()),
            message: expired
              ? 'Sign in again to access your account bag.'
              : 'We could not check your shopper session. Check your bag again.',
          },
          expired,
        );
        return;
      }
      accountExpected = Boolean(next);
      allowGuest = false;
      try {
        if (next) storage.setItem(accountMarker, '1');
        else storage.removeItem(accountMarker);
      } catch {
        /* The active tab still holds the ownership fence. */
      }
      partition = next;
      authorityResolved = true;
      return controller.settleOwner({
        partition: next,
        api: next ? createCartApi(next) : cartApi,
        journal: next ? createCartJournal(storage, Date.now, next) : guestJournal,
      });
    })().finally(() => {
      if (authorityCheck === task) authorityCheck = null;
    });
    authorityCheck = task;
    return task;
  }
  function post(message: Record<string, unknown>) {
    try {
      const hint = { ...message, nonce: crypto.randomUUID() };
      channel?.postMessage(hint);
      if (message.kind === 'cart') {
        try {
          localStorage.setItem(CART_SIGNAL, JSON.stringify(hint));
        } catch {
          /* Focus/poll fallback. */
        }
      }
    } catch {
      /* Hints are optional. */
    }
  }
  const controller = createCartController({
    api: cartApi,
    journal: guestJournal,
    coordinate: async (task) => {
      if (typeof navigator.locks?.request !== 'function') return task();
      let entered = false;
      const waiting = new AbortController();
      const timer = setTimeout(() => waiting.abort(), 20000);
      try {
        return await navigator.locks.request(
          'maevelle:cart-bootstrap',
          { signal: waiting.signal },
          () => {
            entered = true;
            return task();
          },
        );
      } catch (error) {
        // Cookie/storage policy can deny Web Locks before the callback runs.
        // Optional coordination must not bypass the server's cookie round-trip barrier.
        if (
          !entered &&
          error instanceof DOMException &&
          ['SecurityError', 'NotSupportedError'].includes(error.name)
        )
          return task();
        throw error;
      } finally {
        clearTimeout(timer);
      }
    },
    surface: () => window.location.pathname,
    observe: (interaction) => {
      void emitCartObservation(interaction);
    },
    sessionSignal: (phase) => {
      post({ kind: 'session', phase });
      try {
        localStorage.setItem(RESET_SIGNAL, JSON.stringify({ phase, nonce: crypto.randomUUID() }));
      } catch {
        /* Optional hint only. */
      }
    },
    wishlistChanged: (owner) => {
      void import('../wishlist/wishlist-store')
        .then(({ wishlistStore }) => wishlistStore.reconcileCartTransfer(owner))
        .catch(() => {
          /* Wishlist can reconcile independently on focus or next visit. */
        });
    },
    notify: (context, revision) => post({ kind: 'cart', context, revision }),
  });
  function refresh() {
    if (document.visibilityState === 'visible' && !authHold)
      void (authorityResolved ? controller.refresh() : checkOwner()).catch(() => undefined);
  }
  function receiveCart(hint: Record<string, unknown>) {
    const current = controller.getSnapshot().confirmed;
    if (
      !current ||
      current.ownerContext !== hint.context ||
      !Number.isSafeInteger(hint.revision) ||
      Number(hint.revision) <= current.version
    )
      return;
    if (hintTimer) return;
    hintTimer = setTimeout(
      () => {
        hintTimer = undefined;
        lastHint = Date.now();
        if (document.visibilityState === 'visible' && !authHold)
          void controller.refresh(true).catch(() => undefined);
      },
      Math.max(0, 500 - (Date.now() - lastHint)),
    );
  }
  let localAuthHold = false;
  let remoteHoldTimer: ReturnType<typeof setTimeout> | undefined;
  function identity(phase: 'begin' | 'settled', broadcast = false, signedOut = false) {
    // Repeated sibling hints must not extend the first reconciliation deadline.
    if (!broadcast && (localAuthHold || (authHold && phase === 'begin'))) return;
    if (broadcast) localAuthHold = phase === 'begin';
    clearTimeout(remoteHoldTimer);
    authHold = phase === 'begin';
    if (phase === 'begin') allowGuest = false;
    else if (signedOut) allowGuest = true;
    if (authHold && !broadcast) {
      // A sibling may close before sending its completion hint. Resume by
      // verifying the actual session, without treating silence as sign-out.
      remoteHoldTimer = setTimeout(() => identity('settled'), 20_000);
    }
    authorityResolved = false;
    authorityAbort?.abort();
    controller.ownerTransition(true);
    if (broadcast) {
      post({ kind: 'identity', phase, signedOut });
      try {
        localStorage.setItem(
          SIGNAL,
          JSON.stringify({ phase, signedOut, nonce: crypto.randomUUID() }),
        );
      } catch {
        /* Broadcast/focus remain available. */
      }
    }
    if (!authHold && document.visibilityState === 'visible')
      void checkOwner(true).catch(() => undefined);
  }
  let lastSessionPhase: string | null = null;
  function sessionHint(phase: 'begin' | 'settled') {
    if (partition || !authorityResolved || lastSessionPhase === phase) return;
    lastSessionPhase = phase;
    controller.expectFreshSession();
    controller.ownerTransition();
    if (phase === 'settled' && !authHold) void controller.settleOwner().catch(() => undefined);
  }
  function stop() {
    clients--;
    if (clients === 0) {
      cleanup?.();
      cleanup = null;
      started = false;
      controller.ownerTransition(true);
    }
  }
  return {
    controller,
    identity,
    refresh: () => authorityCheck ?? (authorityResolved ? controller.refresh() : checkOwner()),
    reconcile: () =>
      authorityResolved &&
      controller.getSnapshot().owner === 'guest' &&
      controller.getSnapshot().issue?.code !== 'ACCOUNT_CART_NOT_READY'
        ? controller.reconcile()
        : checkOwner(true),
    accountPartition: () => (controller.getSnapshot().owner === 'account' ? partition : null),
    start() {
      clients++;
      if (started) return stop;
      const events = new AbortController();
      const options = { signal: events.signal };
      started = true;
      try {
        channel = new BroadcastChannel(CHANNEL);
        channel.onmessage = ({ data }: { data: unknown }) => {
          if (!data || typeof data !== 'object') return;
          const hint = data as Record<string, unknown>;
          if (typeof hint.nonce !== 'string' || hint.nonce.length > 64 || seen.has(hint.nonce))
            return;
          seen.add(hint.nonce);
          if (seen.size > 128) seen.delete(seen.values().next().value!);
          if (hint.kind === 'session' && (hint.phase === 'begin' || hint.phase === 'settled')) {
            sessionHint(hint.phase);
            return;
          }
          if (hint.kind === 'identity' && (hint.phase === 'begin' || hint.phase === 'settled')) {
            identity(hint.phase, false, hint.signedOut === true);
            return;
          }
          if (
            hint.kind !== 'cart' ||
            typeof hint.context !== 'string' ||
            !uuid.test(hint.context) ||
            !Number.isSafeInteger(hint.revision) ||
            Number(hint.revision) < 1
          )
            return;
          receiveCart(hint);
        };
      } catch {
        /* Storage/focus fallback has no credentials. */
      }
      addEventListener(
        'storage',
        (event) => {
          if (event.key === CART_SIGNAL && event.newValue) {
            try {
              const hint = JSON.parse(event.newValue);
              if (hint && typeof hint === 'object') receiveCart(hint);
            } catch {
              /* Untrusted hint. */
            }
          } else if (event.key === RESET_SIGNAL && event.newValue) {
            try {
              const hint = JSON.parse(event.newValue);
              if (hint.phase === 'begin' || hint.phase === 'settled') sessionHint(hint.phase);
            } catch {
              /* Untrusted hint. */
            }
          } else if (event.key === SIGNAL && event.newValue) {
            try {
              const hint = JSON.parse(event.newValue) as { phase?: unknown; signedOut?: unknown };
              if (hint.phase === 'begin' || hint.phase === 'settled')
                identity(hint.phase, false, hint.signedOut === true);
            } catch {
              /* Untrusted hint ignored. */
            }
          } else if (event.key === WISHLIST_AUTH_SIGNAL) identity('settled');
        },
        options,
      );
      addEventListener(
        'focus',
        () => {
          if (!authHold && document.visibilityState === 'visible')
            void checkOwner().catch(() => undefined);
        },
        options,
      );
      addEventListener(
        'pageshow',
        () => {
          if (!authHold && document.visibilityState === 'visible')
            void checkOwner().catch(() => undefined);
        },
        options,
      );
      document.addEventListener(
        'visibilitychange',
        () => {
          if (document.visibilityState === 'hidden') {
            authorityAbort?.abort();
            authorityResolved = false;
            controller.ownerTransition(true);
          } else if (!authHold) void checkOwner(true).catch(() => undefined);
        },
        options,
      );
      addEventListener('online', refresh, options);
      addEventListener('maevelle:cart-changed', refresh, options);
      const timer = setInterval(() => {
        if (!partition) refresh();
      }, 30_000);
      cleanup = () => {
        clearTimeout(remoteHoldTimer);
        if (!localAuthHold) authHold = false;
        authorityAbort?.abort();
        authorityCheck = null;
        authorityResolved = false;
        events.abort();
        clearInterval(timer);
        if (hintTimer) clearTimeout(hintTimer);
        hintTimer = undefined;
        channel?.close();
        channel = null;
      };
      refresh();
      return stop;
    },
  };
}
function instance() {
  if (!runtime) runtime = createRuntime();
  return runtime;
}
function invoke<T>(action: (controller: CartController) => T): T {
  return action(instance().controller);
}
/** No browser instance/private state is created by server rendering. */
export const cartStore = {
  getSnapshot: () =>
    typeof window === 'undefined' ? EMPTY_CART_SNAPSHOT : instance().controller.getSnapshot(),
  getServerSnapshot: () => EMPTY_CART_SNAPSHOT,
  subscribe(listener: () => void) {
    const active = instance();
    const unsubscribe = active.controller.subscribe(listener);
    const stop = active.start();
    return () => {
      unsubscribe();
      stop();
    };
  },
  initialize: () => invoke((c) => c.initialize()),
  refresh: () => instance().refresh(),
  reconcile: () => instance().reconcile(),
  addItem: (id: string, quantity: number) => invoke((c) => c.addItem(id, quantity)),
  addGuestSavedItem: (...args: Parameters<CartController['addGuestSavedItem']>) =>
    invoke((c) => c.addGuestSavedItem(...args)),
  transferWishlistItem: (...args: Parameters<CartController['transferWishlistItem']>) =>
    invoke((c) => c.transferWishlistItem(...args)),
  setQuantity: (id: string, quantity: string) => invoke((c) => c.setQuantity(id, quantity)),
  replaceVariant: (
    ...args: Parameters<ReturnType<typeof createCartController>['replaceVariant']>
  ) => invoke((c) => c.replaceVariant(...args)),
  removeItem: (id: string) => invoke((c) => c.removeItem(id)),
  applyCoupon: (code: string) => invoke((c) => c.applyCoupon(code)),
  removeCoupon: (code: string) => invoke((c) => c.removeCoupon(code)),
  getCartCount: () => invoke((c) => c.getCartCount()),
  getCartSummary: () => invoke((c) => c.getCartSummary()),
  forgetSession: () => invoke((c) => c.forgetSession()),
  clearCart: () => invoke((c) => c.clearCart()),
  selectContext: (context: string) => invoke((c) => c.selectContext(context)),
  reviewContexts: () => invoke((c) => c.reviewContexts()),
  retryPending: () => invoke((c) => c.retryPending()),
  stopRetrying: () => invoke((c) => c.stopRetrying()),
  mergeGuest: (...args: Parameters<CartController['mergeGuest']>) =>
    invoke((c) => c.mergeGuest(...args)),
  guestRecoveryPending: () => invoke((c) => c.guestRecoveryPending()),
  accountPartition: () => (typeof window === 'undefined' ? null : instance().accountPartition()),
  ownerTransition: (phase: 'begin' | 'settled', signedOut = false) =>
    instance().identity(phase, true, signedOut),
};
