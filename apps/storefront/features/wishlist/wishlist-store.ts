import type { WishlistItemDto, WishlistMergeRequestDto } from '@maevelle/contracts';
import type { WishlistItem } from './types';
import { WISHLIST_CHANGED_EVENT } from './wishlist-events';
import {
  GUEST_OP_PREFIX,
  clearTransferredGuestItems,
  readGuestJournal,
  writeGuestOperation,
  type GuestSnapshot,
} from './guest-journal';
import { accountWishlistApi, WishlistApiError } from './account-adapter';

type Mode = 'resolving' | 'guest' | 'account' | 'expired';
type Sync = 'idle' | 'loading' | 'merging' | 'pending' | 'conflicted' | 'error' | 'synced';
interface Intent {
  kind: 'save' | 'remove';
  preference?: string | null;
  attempts: number;
}
interface PendingMerge {
  request: WishlistMergeRequestDto;
  winners: [string, string][];
  state?: 'version-conflict' | 'blocked';
}
export interface WishlistSnapshot {
  readonly ownerPartition: string | null;
  readonly items: readonly WishlistItem[];
  readonly count: number;
  readonly nextCursor: string | null;
  readonly loadingMore: boolean;
  readonly ownerGeneration: number;
  readonly listVersion: number;
  readonly mode: Mode;
  readonly sync: Sync;
  readonly pendingIds: readonly string[];
  readonly message: string | null;
  readonly mergeReviewed: boolean;
  readonly mergeConflict: boolean;
}
const EMPTY: WishlistSnapshot = {
  ownerPartition: null,
  items: [],
  count: 0,
  nextCursor: null,
  loadingMore: false,
  ownerGeneration: 0,
  listVersion: 1,
  mode: 'resolving',
  sync: 'idle',
  pendingIds: [],
  message: null,
  mergeReviewed: false,
  mergeConflict: false,
};
const MERGE_PREFIX = 'maevelle_wishlist_pending_merge_v1:';
const REJECTED_PREFIX = 'maevelle_wishlist_rejected_merge_v1:';
const ACCOUNT_PENDING_PREFIX = 'maevelle_wishlist_account_pending_v1:';
const ACCOUNT_SHARE_PENDING_PREFIX = 'maevelle_wishlist_account_share_create_v1:';
const AUTH_SIGNAL = 'maevelle_shopper_auth_signal';
const listeners = new Set<() => void>();
let snapshot = EMPTY;
let started = false;
let generation = 0;
let partition: string | null = null;
let version = 1;
let accountCount = 0;
let nextCursor: string | null = null;
let loadingMore = false;
let ownerGeneration = 0;
let knownMembership = new Set<string>();
let savedMembership = new Set<string>();
let guest: GuestSnapshot = { items: [], winners: new Map() };
let guestMemoryOnly = false;
const memoryGuestActions = new Map<
  string,
  { action: 'save' | 'remove'; preference: string | null }
>();
let confirmed = new Map<string, WishlistItem>();
const presentations = new Map<string, WishlistItem>();
const desired = new Map<string, Intent>();
let draining = false;
let mergeInFlight = false;
let retryAt = 0;
let recoveredAccountIntent = false;

function placeholder(id: string): WishlistItem {
  return {
    id,
    handle: '',
    title: 'Saved product',
    subtitle: '',
    category: 'all',
    categoryLabel: 'Saved product',
    price: 0,
    imageUrl: '',
    alt: '',
    inStock: false,
  };
}
function present(id: string): WishlistItem {
  return presentations.get(id) ?? placeholder(id);
}
function fromAccount(item: WishlistItemDto): WishlistItem {
  return {
    ...present(item.productId),
    id: item.productId,
    handle: item.product?.handle ?? '',
    title: item.product?.title ?? 'Product unavailable',
    price: Number(item.product?.minimumPrice ?? 0),
    imageUrl: item.product?.primaryMediaAssetId
      ? `/api/media/public/${item.product.primaryMediaAssetId}?rendition=card`
      : '',
    inStock: item.product?.available ?? false,
    preferredVariantId: item.preferredVariantId,
    preferredVariantAvailable: item.preferredVariantAvailable,
    savedAt: item.savedAt,
  };
}
function compose(): readonly WishlistItem[] {
  if (snapshot.mode === 'resolving' || snapshot.mode === 'expired') return [];
  const active =
    snapshot.mode === 'account'
      ? new Map(confirmed)
      : new Map(
          guest.items.map((item) => [
            item.productId,
            {
              ...present(item.productId),
              preferredVariantId: item.preferredVariantId,
              savedAt: item.savedAt,
            },
          ]),
        );
  if (snapshot.mode === 'account' && !recoveredAccountIntent)
    for (const [id, intent] of desired) {
      if (intent.kind === 'remove') active.delete(id);
      else
        active.set(id, {
          ...(active.get(id) ?? present(id)),
          preferredVariantId: intent.preference ?? active.get(id)?.preferredVariantId ?? null,
        });
    }
  return [...active.values()].sort(
    (a, b) => (b.savedAt ?? '').localeCompare(a.savedAt ?? '') || b.id.localeCompare(a.id),
  );
}
function publish(update: Partial<WishlistSnapshot> = {}) {
  snapshot = { ...snapshot, ...update, items: [] };
  snapshot = {
    ...snapshot,
    ownerPartition: snapshot.mode === 'account' ? partition : null,
    items: compose(),
    count: snapshot.mode === 'account' ? accountCount : guest.items.length,
    nextCursor: snapshot.mode === 'account' ? nextCursor : null,
    loadingMore,
    ownerGeneration,
    listVersion: version,
    pendingIds: [
      ...new Set([
        ...desired.keys(),
      ]),
    ],
  };
  for (const listener of listeners) listener();
  if (typeof window !== 'undefined')
    window.dispatchEvent(
      new CustomEvent(WISHLIST_CHANGED_EVENT, { detail: { count: snapshot.count } }),
    );
}
function readGuest() {
  if (guestMemoryOnly) return true;
  try {
    guest = readGuestJournal(localStorage, true);
    return true;
  } catch {
    guestMemoryOnly = true;
    publish({
      sync: 'error',
      message: 'Browser storage is unavailable. Guest changes last only until this tab closes.',
    });
    return false;
  }
}
function memoryGuestChange(id: string, action: 'save' | 'remove', preference: string | null) {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuid.test(id) || (preference !== null && !uuid.test(preference))) return false;
  const items = guest.items.filter((item) => item.productId !== id);
  if (action === 'save') {
    if (items.length >= 100) return false;
    items.unshift({
      productId: id,
      preferredVariantId: preference,
      savedAt:
        guest.items.find((item) => item.productId === id)?.savedAt ?? new Date().toISOString(),
    });
  }
  guest = { items, winners: guest.winners };
  guestMemoryOnly = true;
  memoryGuestActions.set(id, { action, preference });
  publish({
    sync: 'error',
    message:
      'This change is saved only in this tab until it closes. Browser storage is unavailable.',
  });
  return true;
}
function flushMemoryGuest(): boolean {
  if (!guestMemoryOnly) return true;
  try {
    for (const [id, operation] of memoryGuestActions)
      writeGuestOperation(localStorage, id, operation.action, operation.preference);
    guest = readGuestJournal(localStorage, true);
    memoryGuestActions.clear();
    guestMemoryOnly = false;
    publish({ sync: 'synced', message: null });
    return true;
  } catch {
    publish({
      sync: 'error',
      message: 'Browser storage still cannot save these changes. They remain only in this tab.',
    });
    return false;
  }
}
function signalAuth() {
  try {
    localStorage.setItem(AUTH_SIGNAL, crypto.randomUUID());
  } catch {
    /* Focus revalidates. */
  }
}
function mergeKey(value: string) {
  return `${MERGE_PREFIX}${value}`;
}
function pendingAccountKey(value: string) {
  return `${ACCOUNT_PENDING_PREFIX}${value}`;
}
function discardOtherAccountIntents(currentPartition: string) {
  try {
    const stale: string[] = [];
    for (let index = 0; index < sessionStorage.length; index += 1) {
      const key = sessionStorage.key(index);
      if (key?.startsWith(ACCOUNT_PENDING_PREFIX) && key !== pendingAccountKey(currentPartition))
        stale.push(key);
    }
    for (const key of stale) sessionStorage.removeItem(key);
  } catch {
    /* Private in-memory state is still cleared. */
  }
}
function persistAccountIntents(): boolean {
  if (!partition) return false;
  try {
    if (desired.size)
      sessionStorage.setItem(pendingAccountKey(partition), JSON.stringify([...desired]));
    else sessionStorage.removeItem(pendingAccountKey(partition));
    return true;
  } catch {
    return false;
  }
}
function recoverAccountIntents(currentPartition: string): boolean {
  if (desired.size) return false;
  try {
    const parsed: unknown = JSON.parse(
      sessionStorage.getItem(pendingAccountKey(currentPartition)) ?? '[]',
    );
    if (!Array.isArray(parsed)) return false;
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    for (const entry of parsed.slice(0, 100)) {
      if (!Array.isArray(entry) || !uuid.test(entry[0])) continue;
      const intent: unknown = entry[1];
      if (!intent || typeof intent !== 'object') continue;
      const row = intent as Record<string, unknown>;
      if (row.kind !== 'save' && row.kind !== 'remove') continue;
      if (
        row.preference !== undefined &&
        row.preference !== null &&
        (typeof row.preference !== 'string' || !uuid.test(row.preference))
      )
        continue;
      desired.set(entry[0], {
        kind: row.kind,
        attempts: 0,
        ...(row.preference !== undefined ? { preference: row.preference as string | null } : {}),
      });
    }
    recoveredAccountIntent = desired.size > 0;
    return recoveredAccountIntent;
  } catch {
    return false;
  }
}
function rejectedKey(value: string) {
  return `${REJECTED_PREFIX}${value}`;
}
function rejectedWinners(value: string): Map<string, string> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(rejectedKey(value)) ?? '[]');
    return Array.isArray(parsed) ? new Map(parsed as [string, string][]) : new Map();
  } catch {
    return new Map();
  }
}
function otherPendingMerge(value: string): boolean {
  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key?.startsWith(MERGE_PREFIX) && key !== mergeKey(value)) return true;
    }
  } catch {
    return true;
  }
  return false;
}
function loadPendingMerge(value: string): PendingMerge | null {
  try {
    const raw = localStorage.getItem(mergeKey(value));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const row = parsed as PendingMerge;
    return row.request?.mergeId && Array.isArray(row.winners) ? row : null;
  } catch {
    return null;
  }
}
function scheduleRetry(seconds: number, action: () => void) {
  const delay = Math.min(Math.max(seconds, 1), 3600) * 1000;
  retryAt = Date.now() + delay;
  setTimeout(() => {
    if (Date.now() >= retryAt) action();
  }, delay);
}
async function loadAccount(epoch: number) {
  const loaded = await accountWishlistApi.page();
  if (epoch !== generation) return;
  confirmed = new Map(loaded.items.map((item) => [item.productId, fromAccount(item)]));
  knownMembership = new Set(loaded.items.map((item) => item.productId));
  savedMembership = new Set(knownMembership);
  accountCount = loaded.count;
  nextCursor = loaded.nextCursor;
  version = loaded.version;
  publish({ mode: 'account', sync: 'synced', message: null });
}
async function processMerge(epoch: number, currentPartition: string) {
  if (epoch !== generation || snapshot.mode !== 'account') return;
  if (guestMemoryOnly) {
    publish({
      sync: 'error',
      message:
        'Guest changes are only in this tab. Restore browser storage before syncing them to your account.',
    });
    return;
  }
  if (Date.now() < retryAt) return;
  let pending = loadPendingMerge(currentPartition);
  if (pending?.state === 'version-conflict') {
    publish({
      sync: 'conflicted',
      mergeReviewed: false,
      mergeConflict: true,
      message:
        'Your account changed before guest items could merge. Review current saved products before choosing to merge them.',
    });
    return;
  }
  if (pending?.state === 'blocked') {
    publish({
      sync: 'error',
      message: 'This merge request needs account support. Guest items remain in this browser.',
    });
    return;
  }
  if (!pending) {
    const rejected = rejectedWinners(currentPartition);
    const candidates = guest.items.filter(
      (item) => rejected.get(item.productId) !== guest.winners.get(item.productId),
    );
    if (!candidates.length) {
      if (guest.items.length)
        publish({
          sync: 'error',
          message: 'Some guest products remain unavailable and are still saved in this browser.',
        });
      return;
    }
    if (otherPendingMerge(currentPartition)) {
      publish({
        sync: 'conflicted',
        message:
          'Guest items have an unfinished merge for another account. Sign in to that account to recover them.',
      });
      return;
    }
    const request: WishlistMergeRequestDto = {
      mergeId: crypto.randomUUID(),
      baseVersion: version,
      items: candidates.map((item) => ({
        productId: item.productId,
        preferredVariantId: item.preferredVariantId,
        savedAt: item.savedAt,
      })),
    };
    pending = { request, winners: [...guest.winners] };
    try {
      localStorage.setItem(mergeKey(currentPartition), JSON.stringify(pending));
    } catch {
      publish({
        sync: 'error',
        message: 'Browser storage could not preserve the merge. Guest items remain here.',
      });
      return;
    }
  }
  publish({ sync: 'merging', message: 'Syncing saved products to your account…' });
  mergeInFlight = true;
  let completed = false;
  try {
    const receipt = await accountWishlistApi.merge(pending.request);
    if (epoch !== generation) return;
    const frozen: GuestSnapshot = {
      items: pending.request.items,
      winners: new Map(pending.winners),
    };
    const transferred = new Set([
      ...receipt.acceptedProductIds,
      ...receipt.alreadyPresentProductIds,
    ]);
    try {
      guest = clearTransferredGuestItems(localStorage, frozen, transferred);
      const rejected = rejectedWinners(currentPartition);
      for (const item of receipt.rejectedItems) {
        const winner = frozen.winners.get(item.productId);
        if (winner) rejected.set(item.productId, winner);
      }
      localStorage.setItem(rejectedKey(currentPartition), JSON.stringify([...rejected]));
      localStorage.removeItem(mergeKey(currentPartition));
    } catch {
      publish({
        sync: 'error',
        message: 'Account sync succeeded, but browser cleanup failed. Retry to reconcile safely.',
      });
      return;
    }
    await loadAccount(epoch);
    if (epoch !== generation) return;
    if (receipt.rejectedItems.length)
      publish({
        sync: 'error',
        message: `${receipt.rejectedItems.length} guest products could not transfer and remain in this browser.`,
      });
    else publish({ sync: 'synced', message: 'Guest products were saved to your account.' });
    completed = true;
  } catch (error) {
    if (epoch !== generation) return;
    if (error instanceof WishlistApiError && error.status === 401) {
      expire('Your session expired. Sign in to finish syncing.');
      return;
    }
    if (error instanceof WishlistApiError && error.status === 409) {
      pending.state = error.code === 'VERSION_CONFLICT' ? 'version-conflict' : 'blocked';
      try {
        localStorage.setItem(mergeKey(currentPartition), JSON.stringify(pending));
      } catch {
        /* Original request remains in memory only. */
      }
      publish({
        sync: pending.state === 'version-conflict' ? 'conflicted' : 'error',
        mergeConflict: pending.state === 'version-conflict',
        mergeReviewed: false,
        message:
          pending.state === 'version-conflict'
            ? 'Your account changed. Review current saved products before merging guest items.'
            : error.message,
      });
    } else {
      publish({
        sync: 'error',
        message:
          error instanceof WishlistApiError && error.status === 429
            ? `Too many requests. Retrying after ${error.retryAfterSeconds ?? 60} seconds.`
            : error instanceof Error
              ? error.message
              : 'Guest products could not sync. Retry later.',
      });
      if (error instanceof WishlistApiError && error.status === 429)
        scheduleRetry(error.retryAfterSeconds ?? 60, () => {
          if (partition === currentPartition) void processMerge(generation, currentPartition);
        });
    }
  } finally {
    mergeInFlight = false;
    if (desired.size && epoch === generation) void drain();
    if (completed && guest.items.length && epoch === generation)
      void processMerge(epoch, currentPartition);
  }
}
function expire(message: string) {
  generation += 1;
  ownerGeneration += 1;
  partition = null;
  version = 1;
  accountCount = 0;
  nextCursor = null;
  knownMembership.clear();
  savedMembership.clear();
  confirmed = new Map();
  desired.clear();
  recoveredAccountIntent = false;
  publish({ mode: 'expired', sync: 'error', message, mergeReviewed: false, mergeConflict: false });
}
function unavailable(message: string) {
  generation += 1;
  ownerGeneration += 1;
  partition = null;
  version = 1;
  confirmed = new Map();
  accountCount = 0;
  nextCursor = null;
  knownMembership.clear();
  savedMembership.clear();
  desired.clear();
  recoveredAccountIntent = false;
  publish({ mode: 'resolving', sync: 'error', message, mergeReviewed: false, mergeConflict: false });
}
async function drain() {
  if (
    draining ||
    mergeInFlight ||
    recoveredAccountIntent ||
    snapshot.mode !== 'account' ||
    Date.now() < retryAt
  )
    return;
  draining = true;
  const epoch = generation;
  while (desired.size && epoch === generation && snapshot.mode === 'account') {
    const [id, intent] = desired.entries().next().value as [string, Intent];
    try {
      const result =
        intent.kind === 'save'
          ? await accountWishlistApi.save(id, intent.preference, version)
          : await accountWishlistApi.remove(id, version);
      if (epoch !== generation) break;
      version = result.version;
      const wasSaved = savedMembership.has(id);
      knownMembership.add(id);
      if (intent.kind === 'remove') {
        confirmed.delete(id);
        savedMembership.delete(id);
        if (wasSaved) accountCount = Math.max(0, accountCount - 1);
      } else {
        savedMembership.add(id);
        if (!wasSaved) accountCount += 1;
        confirmed.set(id, {
          ...(confirmed.get(id) ?? present(id)),
          preferredVariantId:
            'preferredVariantId' in result ? (result.preferredVariantId as string | null) : null,
          savedAt: confirmed.get(id)?.savedAt ?? new Date().toISOString(),
        });
      }
      nextCursor = null;
      if (desired.get(id) === intent) desired.delete(id);
      persistAccountIntents();
      publish({ sync: desired.size ? 'pending' : 'synced', message: null });
    } catch (error) {
      if (epoch !== generation) break;
      if (error instanceof WishlistApiError && error.status === 401) {
        expire('Your session expired. Sign in before saving more products.');
        break;
      }
      if (error instanceof WishlistApiError && error.status === 403) {
        expire('This account cannot access its wishlist.');
        break;
      }
      if (error instanceof WishlistApiError && error.status === 409 && intent.attempts < 1) {
        intent.attempts += 1;
        try {
          await loadAccount(epoch);
          continue;
        } catch {
          /* Preserve intent below. */
        }
      }
      const rateLimited = error instanceof WishlistApiError && error.status === 429;
      if (!rateLimited) recoveredAccountIntent = true;
      if (!rateLimited) {
        try {
          await loadAccount(epoch);
        } catch (refreshError) {
          if (
            refreshError instanceof WishlistApiError &&
            (refreshError.status === 401 || refreshError.status === 403)
          ) {
            expire('Your account session is unavailable. Sign in before retrying.');
            break;
          }
        }
      }
      if (epoch !== generation) break;
      publish({
        sync: rateLimited ? 'error' : 'conflicted',
        message: rateLimited
          ? `Too many requests. Retrying after ${error.retryAfterSeconds ?? 60} seconds.`
          : 'This account change was not confirmed. Review the current list, then choose Retry to apply your intended state.',
      });
      if (rateLimited) scheduleRetry(error.retryAfterSeconds ?? 60, () => void drain());
      break;
    }
  }
  draining = false;
  if (epoch === generation && snapshot.mode === 'account' && !desired.size) {
    try { await loadAccount(epoch); } catch { /* A later focus refresh reconciles the page. */ }
  }
  if (desired.size && epoch !== generation && snapshot.mode === 'account') void drain();
  if (!desired.size && epoch === generation && partition && guest.items.length)
    void processMerge(epoch, partition);
}
function start() {
  if (started || typeof window === 'undefined') return;
  started = true;
  readGuest();
  window.addEventListener('storage', (event) => {
    if (event.key?.startsWith(GUEST_OP_PREFIX)) {
      if (readGuest() && snapshot.mode === 'guest') publish();
    } else if (event.key === AUTH_SIGNAL) void wishlistStore.revalidateSession();
  });
  window.addEventListener('focus', () => void wishlistStore.revalidateSession());
  window.addEventListener('online', () => void wishlistStore.revalidateSession());
  void wishlistStore.revalidateSession();
}

export const wishlistStore = {
  subscribe(listener: () => void) {
    listeners.add(listener);
    start();
    return () => listeners.delete(listener);
  },
  getSnapshot: () => snapshot,
  getServerSnapshot: () => EMPTY,
  async revalidateSession(force = false) {
    if (typeof window === 'undefined') return;
    if (!force && (mergeInFlight || draining)) return;
    const epoch = ++generation;
    const oldPartition = partition;
    if (force || !oldPartition) publish({ mode: 'resolving', sync: 'loading', message: null });
    let session: { authenticated: true; partition: string };
    try {
      session = await accountWishlistApi.session();
    } catch (error) {
      if (epoch !== generation) return;
      if (oldPartition) {
        if (error instanceof WishlistApiError && error.status === 401)
          expire('Your session expired. Sign in to access your account wishlist.');
        else unavailable('Account session could not be checked. Retry before saving.');
      } else {
        readGuest();
        publish({
          mode: 'guest',
          sync: error instanceof WishlistApiError && error.status === 401 ? 'synced' : 'error',
          message:
            error instanceof WishlistApiError && error.status === 401
              ? null
              : 'Account sign-in is unavailable. Guest changes stay in this browser.',
        });
      }
      return;
    }
    if (epoch !== generation) return;
    try {
      if (!session.partition || session.partition !== oldPartition) {
        ownerGeneration += 1;
        if (oldPartition && oldPartition !== session.partition) {
          try {
            sessionStorage.removeItem(pendingAccountKey(oldPartition));
            sessionStorage.removeItem(`${ACCOUNT_SHARE_PENDING_PREFIX}${oldPartition}`);
          } catch {
            /* Account state is cleared in memory. */
          }
        }
        confirmed = new Map();
        accountCount = 0;
        nextCursor = null;
        knownMembership.clear();
        savedMembership.clear();
        desired.clear();
        recoveredAccountIntent = false;
        version = 1;
        snapshot = { ...snapshot, mergeReviewed: false, mergeConflict: false };
      }
      partition = session.partition;
      discardOtherAccountIntents(session.partition);
      await loadAccount(epoch);
      if (epoch === generation) {
        readGuest();
        const restored = recoverAccountIntents(session.partition);
        if (restored || desired.size) {
          if (recoveredAccountIntent)
            publish({
              sync: 'conflicted',
              message:
                'An account change was not confirmed. Review your current saved products, then choose Retry to apply the pending intent.',
            });
          else
            publish({
              sync: 'error',
              message: 'An account change is waiting for the server retry window.',
            });
        } else {
          await processMerge(epoch, session.partition);
          void drain();
        }
      }
    } catch (error) {
      if (epoch !== generation) return;
      if (error instanceof WishlistApiError && (error.status === 401 || error.status === 403))
        expire('Your account session is unavailable. Sign in again to access your wishlist.');
      else unavailable('Account wishlist could not load. Retry to check your saved products.');
    }
  },
  signOut() {
    if (partition) {
      try {
        sessionStorage.removeItem(pendingAccountKey(partition));
        sessionStorage.removeItem(`${ACCOUNT_SHARE_PENDING_PREFIX}${partition}`);
      } catch {
        /* Memory is still cleared. */
      }
    }
    generation += 1;
    ownerGeneration += 1;
    partition = null;
    confirmed = new Map();
    accountCount = 0;
    nextCursor = null;
    knownMembership.clear();
    savedMembership.clear();
    desired.clear();
    recoveredAccountIntent = false;
    version = 1;
    readGuest();
    publish({
      mode: 'guest',
      sync: 'synced',
      message: null,
      mergeReviewed: false,
      mergeConflict: false,
    });
    signalAuth();
  },
  afterSignIn() {
    signalAuth();
    return this.revalidateSession(true);
  },
  async hydrateSavedState(productIds: readonly string[]) {
    if (snapshot.mode !== 'account') return;
    const epoch = generation;
    const unique = [...new Set(productIds)].slice(0, 100);
    if (!unique.length) return;
    try {
      let saved = await accountWishlistApi.savedState(unique);
      if (epoch !== generation) return;
      if (saved.version !== version) {
        await loadAccount(epoch);
        if (epoch !== generation) return;
        saved = await accountWishlistApi.savedState(unique);
        if (epoch !== generation || saved.version !== version) return;
      }
      const found = new Set(saved.savedProductIds);
      for (const id of unique) {
        knownMembership.add(id);
        if (found.has(id)) savedMembership.add(id);
        else savedMembership.delete(id);
      }
      accountCount = saved.count;
      publish();
    } catch (error) {
      if (epoch !== generation) return;
      if (error instanceof WishlistApiError && error.status === 401)
        expire('Your session expired. Sign in to access your account wishlist.');
      else publish({ sync: 'error', message: 'Saved products could not refresh. Try again.' });
    }
  },
  membership(id: string): boolean | null {
    if (snapshot.mode === 'resolving' || snapshot.mode === 'expired') return null;
    if (snapshot.mode === 'guest') return guest.items.some((item) => item.productId === id);
    const intent = desired.get(id);
    if (intent && !recoveredAccountIntent) return intent.kind === 'save';
    return knownMembership.has(id) ? savedMembership.has(id) : null;
  },
  async loadMore() {
    if (snapshot.mode !== 'account' || !partition || !nextCursor || loadingMore) return;
    const cursor = nextCursor;
    const epoch = generation;
    const owner = partition;
    const expectedVersion = version;
    loadingMore = true;
    publish();
    try {
      const page = await accountWishlistApi.page(cursor);
      if (epoch !== generation || partition !== owner) return;
      if (page.version !== expectedVersion) {
        await loadAccount(epoch);
        publish({ sync: 'synced', message: 'Wishlist changed. Showing the newest saved products.' });
        return;
      }
      for (const item of page.items) {
        confirmed.set(item.productId, fromAccount(item));
        knownMembership.add(item.productId);
        savedMembership.add(item.productId);
      }
      if (confirmed.size > 300) {
        const recent = [...confirmed.values()].sort((a, b) =>
          (b.savedAt ?? '').localeCompare(a.savedAt ?? '') || b.id.localeCompare(a.id));
        confirmed = new Map(recent.slice(-300).map((item) => [item.id, item]));
      }
      accountCount = page.count;
      nextCursor = page.nextCursor;
    } catch (error) {
      if (epoch === generation)
        publish({ sync: 'error', message: error instanceof Error ? error.message : 'More products could not load. Try again.' });
    } finally {
      loadingMore = false;
      if (epoch === generation) publish();
    }
  },
  retry() {
    if (Date.now() < retryAt) return;
    if (guestMemoryOnly) {
      if (!flushMemoryGuest()) return;
      if (snapshot.mode === 'account' && partition) void processMerge(generation, partition);
      return;
    }
    if (recoveredAccountIntent) {
      recoveredAccountIntent = false;
      publish({ sync: 'pending', message: 'Retrying your account change…' });
      void drain();
      return;
    }
    if (snapshot.mode === 'account' && partition) {
      if (loadPendingMerge(partition)) void processMerge(generation, partition);
      else void drain();
    } else void this.revalidateSession();
  },
  async reviewMergeConflict() {
    if (!snapshot.mergeConflict || !partition) return;
    const epoch = generation;
    try {
      await loadAccount(epoch);
      if (epoch === generation)
        publish({
          sync: 'conflicted',
          mergeReviewed: true,
          mergeConflict: true,
          message:
            'Review your current account list. Merging again may restore a product removed on another device.',
        });
    } catch (error) {
      if (epoch === generation)
        publish({
          sync: 'error',
          message: error instanceof Error ? error.message : 'Could not refresh account wishlist.',
        });
    }
  },
  async confirmMergeAfterReview() {
    if (!snapshot.mergeReviewed || !partition) return;
    const epoch = generation;
    try {
      localStorage.removeItem(mergeKey(partition));
      publish({ mergeReviewed: false, mergeConflict: false });
      await processMerge(epoch, partition);
    } catch {
      publish({ sync: 'error', message: 'Browser storage could not prepare a new merge.' });
    }
  },
  save(item: WishlistItem, preferredVariantId?: string | null): boolean {
    start();
    presentations.set(item.id, item);
    if (snapshot.mode === 'resolving' || snapshot.mode === 'expired') return false;
    if (snapshot.mode === 'guest') {
      try {
        if (guestMemoryOnly) return memoryGuestChange(item.id, 'save', preferredVariantId ?? null);
        guest = writeGuestOperation(localStorage, item.id, 'save', preferredVariantId ?? null);
        publish({ sync: 'synced', message: null });
        return true;
      } catch {
        return memoryGuestChange(item.id, 'save', preferredVariantId ?? null);
      }
    }
    desired.set(item.id, {
      kind: 'save',
      ...(preferredVariantId !== undefined ? { preference: preferredVariantId } : {}),
      attempts: 0,
    });
    const retained = persistAccountIntents();
    publish({
      sync: recoveredAccountIntent ? 'conflicted' : retained ? 'pending' : 'error',
      message: recoveredAccountIntent
        ? 'Review the current account list, then choose Retry to apply pending changes.'
        : retained
          ? 'Saving to your account…'
          : 'Saving now, but this browser cannot retain the pending change after a refresh.',
    });
    void drain();
    return true;
  },
  remove(id: string): boolean {
    start();
    if (snapshot.mode === 'resolving' || snapshot.mode === 'expired') return false;
    if (snapshot.mode === 'guest') {
      try {
        if (guestMemoryOnly) return memoryGuestChange(id, 'remove', null);
        guest = writeGuestOperation(localStorage, id, 'remove');
        publish({ sync: 'synced', message: null });
        return true;
      } catch {
        return memoryGuestChange(id, 'remove', null);
      }
    }
    desired.set(id, { kind: 'remove', attempts: 0 });
    const retained = persistAccountIntents();
    publish({
      sync: recoveredAccountIntent ? 'conflicted' : retained ? 'pending' : 'error',
      message: recoveredAccountIntent
        ? 'Review the current account list, then choose Retry to apply pending changes.'
        : retained
          ? 'Removing from your account…'
          : 'Removing now, but this browser cannot retain the pending change after a refresh.',
    });
    void drain();
    return true;
  },
  updatePreferredVariant(id: string, preferredVariantId: string | null): boolean {
    const item = snapshot.items.find((entry) => entry.id === id);
    return item ? this.save(item, preferredVariantId) : false;
  },
  replace(next: readonly WishlistItem[]): boolean {
    const keep = new Set(next.map((item) => item.id));
    let changed = false;
    for (const item of snapshot.items)
      if (!keep.has(item.id)) changed = this.remove(item.id) || changed;
    return changed;
  },
};
