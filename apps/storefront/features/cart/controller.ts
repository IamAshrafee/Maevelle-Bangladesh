import type {
  CartInteraction,
  CartMergeCommitRequestDto,
  CartObservationCommand,
} from '@maevelle/contracts';
import { StorefrontClientApiError } from '@/lib/api/client/http';
import { forgetGuestSession } from './session-recovery';
import { cartObservationCommand, cartRejectionReason } from './observation';
import { createCartActivity } from './activity';
import type { CartApi } from './api';
import { CART_INTENT_MAX_AGE, type CartJournal } from './pending-journal';
import { CartCoordinationError, cartIssue, isUncertain, cartOwnerUnavailable } from './errors';
import {
  EMPTY_CART_SNAPSHOT,
  confirmedCartCount,
  type CartCommand,
  type CartIntent,
  type CartSnapshot,
  type CartView,
  type WishlistTransfer,
} from './types';

interface Dependencies {
  api: CartApi;
  journal: CartJournal;
  coordinate<T>(task: () => Promise<T>): Promise<T>;
  sessionSignal?(phase: 'begin' | 'settled'): void;
  notify(context: string, revision: number): void;
  wishlistChanged?(partition: string): void;
  surface?: () => string;
  observe?: (interaction: CartInteraction) => void;
  now?: () => number;
  uuid?: () => string;
}
/** Server projections and submitted intents are distinct; this store owns neither prices nor inventory. */
export function createCartController(deps: Dependencies) {
  const now = deps.now ?? Date.now,
    uuid = deps.uuid ?? (() => crypto.randomUUID());
  const activity = createCartActivity();
  let api = deps.api;
  let journal = deps.journal;
  let partition: string | null = null;
  const parked = new Map<string | null, CartIntent>();
  let freshSessionExpected = journal.requiresSessionReview();
  let resetting = false;
  let resetFlight: Promise<void> | null = null;
  let state: CartSnapshot = EMPTY_CART_SNAPSHOT;
  const listeners = new Set<() => void>();
  let selected = journal.context();
  let epoch = 0,
    issued = 0,
    accepted = 0,
    externalFence = 0;
  let readFlight: Promise<CartView | null> | null = null;
  let initFlight: Promise<CartView> | null = null;
  let readAbort: AbortController | null = null;
  let readTicket = 0;
  let queue: Promise<unknown> = Promise.resolve();
  const flights = new Map<string, Promise<CartView>>();
  let unresolvedIntent: CartIntent | null = null;
  let submitted = false;
  let ownerPending = false;
  let retryFlight: Promise<CartView> | null = null;
  let restored = false;
  let ownerLost = false;
  function publish(patch: Partial<CartSnapshot>) {
    state = {
      ...state,
      ...patch,
      epoch,
      owner: ownerPending ? 'checking' : partition ? 'account' : 'guest',
    };
    for (const listener of listeners) listener();
  }
  function current(e: number) {
    if (e !== epoch)
      throw new CartCoordinationError(
        'OWNER_TRANSITION',
        'The shopper context changed. Review your current bag.',
      );
  }
  function apply(view: CartView, e: number, ticket: number, mutation = false) {
    current(e);
    if (ticket < accepted) return;
    if (Boolean(partition) !== (view.expiresAt === null))
      throw new CartCoordinationError(
        'OWNER_TRANSITION',
        'The bag does not match your shopper session.',
      );
    const previous = state.confirmed;
    if (
      previous?.ownerContext === view.ownerContext &&
      (view.version < previous.version ||
        (view.version === previous.version &&
          Date.parse(view.evaluatedAt) < Date.parse(previous.evaluatedAt)))
    )
      return;
    if (previous && previous.ownerContext !== view.ownerContext)
      throw new CartCoordinationError(
        'OWNER_TRANSITION',
        'Choose the current bag before continuing.',
      );
    if (
      previous &&
      view.version > previous.version &&
      (!mutation || Number(view.outcome?.committedVersion ?? view.version) < view.version)
    )
      externalFence++;
    accepted = ticket;
    ownerLost = false;
    selected = view.ownerContext;
    journal.select(selected);
    const evaluationChanged =
      !mutation &&
      previous?.version === view.version &&
      previous.calculationFingerprint !== view.calculationFingerprint &&
      (previous.discountTotal !== view.discountTotal ||
        previous.merchandiseNet !== view.merchandiseNet ||
        view.lines.some((line) => {
          const prior = previous.lines.find((item) => item.id === line.id);
          return (
            prior &&
            (prior.unitPrice !== line.unitPrice || prior.availability !== line.availability)
          );
        }) ||
        JSON.stringify(previous.commerceReview?.coupons) !==
          JSON.stringify(view.commerceReview?.coupons));
    publish({
      confirmed: view,
      mode: 'ready',
      ...(evaluationChanged
        ? {
            notice:
              'Prices, offers or availability changed. Review the latest details in your bag.',
          }
        : {}),
    });
  }
  function fail(error: unknown, e: number, ticket: number, writing = false) {
    if (e !== epoch || ticket < accepted) return;
    const issue = cartIssue(error, now(), writing);
    const code = issue.code;
    if (error instanceof StorefrontClientApiError && code === 'CART_CONTEXT_REQUIRED') {
      accepted = ticket;
      publish({
        mode: 'ambiguous',
        confirmed: null,
        contexts: error.details.contexts ?? [],
        issue,
        sync: 'conflict',
      });
      return;
    }
    if (cartOwnerUnavailable(code)) {
      epoch++;
      externalFence++;
      readAbort?.abort();
      readFlight = null;
      initFlight = null;
      submitted = false;
      selected = undefined;
      ownerLost = true;
      journal.select();
      accepted = ticket;
      const unresolved = state.pending ?? unresolvedIntent ?? journal.read();
      publish({
        confirmed: null,
        mode: code === 'ACCOUNT_CART_NOT_READY' ? 'unavailable' : 'expired',
        sync: 'idle',
        issue,
        pending: code === 'ACCOUNT_CART_NOT_READY' ? null : unresolved,
        notice: null,
      });
      return;
    }
    const pendingIssue = state.pending && !writing ? state.issue : null;
    publish({
      ...(partition && !writing ? { confirmed: null } : {}),
      mode: state.confirmed && (!partition || writing) ? 'ready' : 'error',
      sync: state.pending ? 'uncertain' : 'idle',
      issue:
        pendingIssue && issue.retryAt <= pendingIssue.retryAt
          ? pendingIssue
          : pendingIssue
            ? { ...issue, recovery: pendingIssue.recovery }
            : issue,
      notice: null,
    });
  }
  function restorePending() {
    if (restored) return;
    restored = true;
    const persisted = journal.read();
    const intent = unresolvedIntent ?? persisted;
    if (intent) {
      const expired = now() - intent.createdAt > CART_INTENT_MAX_AGE;
      publish({
        pending: intent,
        recoveryPersisted: persisted?.key === intent.key,
        sync: expired ? 'conflict' : 'uncertain',
        issue: {
          code: expired ? 'INTENT_EXPIRED' : 'RECOVERED_INTENT',
          message: expired
            ? 'An earlier action may already be saved. Its recovery window ended. Review the bag and Wishlist before starting again.'
            : 'An earlier action may already be saved. Retry it while the original bag is available, or explicitly stop recovery before starting again.',
          recovery: expired ? 'review' : 'same-intent',
          retryAt: 0,
        },
      });
    }
  }
  async function refresh(force = false): Promise<CartView | null> {
    if (ownerPending || resetting) return null;
    if (now() < (state.issue?.retryAt ?? 0)) return state.confirmed;
    if (readFlight && !force) return readFlight;
    if (force) readAbort?.abort();
    const e = epoch,
      ticket = ++issued;
    readTicket = ticket;
    readAbort = new AbortController();
    const context = selected;
    if (!state.confirmed) publish({ mode: 'loading' });
    if (!state.pending) publish({ sync: 'refreshing' });
    const task: Promise<CartView | null> = (async () => {
      try {
        const view = await activity.track(api.get(context, readAbort!.signal));
        if (freshSessionExpected && !state.confirmed)
          throw new CartCoordinationError(
            'OWNER_TRANSITION',
            'A bag session returned from another window after recovery. Check the bag explicitly before continuing.',
          );
        apply(view, e, ticket);
        if (!state.pending && ticket >= accepted) publish({ issue: null });
        restorePending();
        return view;
      } catch (error) {
        if (e !== epoch) return null;
        if (error instanceof Error && error.name === 'AbortError') return null;
        if (
          error instanceof StorefrontClientApiError &&
          error.status === 404 &&
          ticket >= accepted &&
          !submitted
        ) {
          accepted = ticket;
          const hadOwner = Boolean(context || state.confirmed || ownerLost);
          ownerLost = hadOwner;
          publish({
            confirmed: null,
            mode: hadOwner ? 'expired' : 'empty',
            sync: 'idle',
            issue: hadOwner
              ? {
                  code: error.code,
                  message:
                    'This browser no longer has access to the selected bag. No replacement has been created.',
                  recovery: 'review',
                  retryAt: 0,
                }
              : null,
          });
          restorePending();
          return null;
        }
        fail(error, e, ticket);
        throw error;
      } finally {
        if (e === epoch && state.sync === 'refreshing') publish({ sync: 'idle' });
        if (readTicket === ticket) readFlight = null;
      }
    })();
    readFlight = task;
    return task;
  }
  async function initialize(): Promise<CartView> {
    if (resetting)
      throw new CartCoordinationError(
        'REVIEW_REQUIRED',
        'Wait for the new-bag recovery to finish.',
      );
    if (initFlight) return initFlight;
    const e = epoch;
    const task = deps
      .coordinate(async () => {
        current(e);
        const found = await refresh(true);
        current(e);
        if (found) return found;
        if (state.mode !== 'empty')
          throw new CartCoordinationError(
            'REVIEW_REQUIRED',
            'Review the current session before starting another bag.',
          );
        publish({ sync: 'initializing', notice: null, issue: null });
        const created = await activity.track(api.initialize());
        current(e);
        if (partition) {
          apply(created, e, ++issued);
          publish({ sync: 'idle' });
          return created;
        }
        // Unqualified cookie round trip deliberately surfaces competing authorities.
        let verified: CartView;
        try {
          verified = await activity.track(api.get());
        } catch (error) {
          current(e);
          if (error instanceof StorefrontClientApiError && error.status === 404)
            throw new CartCoordinationError(
              'PERSISTENCE_UNAVAILABLE',
              'The browser did not return its guest session cookie.',
            );
          throw error;
        }
        current(e);
        if (verified.ownerContext !== created.ownerContext)
          throw new CartCoordinationError(
            'REVIEW_REQUIRED',
            'The initialized bag differs from the current browser context. Review your bags.',
          );
        freshSessionExpected = false;
        journal.markSessionForgotten(false);
        apply(verified, e, ++issued);
        publish({ sync: 'idle' });
        return verified;
      })
      .catch((error: unknown) => {
        fail(error, e, ++issued);
        throw error;
      })
      .finally(() => {
        if (initFlight === task) initFlight = null;
      });
    initFlight = task;
    return task;
  }
  function observe(interaction: CartInteraction) {
    try {
      deps.observe?.(interaction);
    } catch {
      // Measurement cannot affect the commerce command.
    }
  }
  function requireNoPending() {
    if (state.pending || unresolvedIntent)
      throw new CartCoordinationError(
        'REVIEW_REQUIRED',
        'Review the earlier action before submitting another action.',
      );
  }
  async function submit(
    intent: CartIntent,
    e: number,
    recovering = false,
    surface = deps.surface?.(),
    observationCommand?: CartObservationCommand,
  ): Promise<CartView> {
    current(e);
    if (now() - intent.createdAt > CART_INTENT_MAX_AGE)
      throw new CartCoordinationError(
        'REVIEW_REQUIRED',
        'This action is too old to replay. Review the bag before a new action.',
      );
    const ticket = ++issued;
    const mode = partition ? 'ACCOUNT' : 'GUEST';
    let attempted = false;
    submitted = true;
    unresolvedIntent = intent;
    publish({
      pending: intent,
      sync: 'pending',
      issue: null,
      notice: null,
      recoveryPersisted: journal.save(intent),
    });
    try {
      const view = await deps.coordinate(() => {
        current(e);
        if (observationCommand) {
          attempted = true;
          observe({ name: 'CART_COMMAND_INITIATED', data: { mode, command: observationCommand } });
        }
        return activity.track(api.mutate(intent));
      });
      current(e);
      if (!view.outcome) throw new Error('The mutation outcome was not returned.');
      apply(view, e, ticket, true);
      journal.save(null);
      unresolvedIntent = null;
      const command = intent.command;
      const version = Number(view.outcome.committedVersion);
      let notice = 'Your bag is up to date.';
      if (command.kind === 'wishlist-transfer') {
        if (command.request.action === 'MOVE' && partition) deps.wishlistChanged?.(partition);
        const action =
          command.request.action === 'MOVE' ? 'Moved to your bag' : 'Added to your bag';
        const quantity = view.outcome.changes.find(
          (change) => change.variantId === command.request.variantId,
        )?.quantity;
        notice =
          quantity && version === view.version
            ? `${action}. Your bag now has ${quantity} of this selection.`
            : `${action}. Review your bag for current quantities.`;
      } else if (command.kind === 'merge') {
        if (deps.journal.context() === command.request.guestOwnerContext) deps.journal.select();
        notice = 'Guest bag merged into your account bag.';
      } else if (command.kind !== 'replace' && (recovering || surface !== deps.surface?.()))
        notice = 'Your earlier bag action was confirmed. Review your bag for details.';
      else if (version !== view.version)
        notice = 'Your action was confirmed. Review the latest bag changes.';
      else if (command.kind === 'replace')
        notice = view.outcome.changes.some(
          (change) => change.lineId === command.lineId && change.quantity === '0',
        )
          ? 'Selection changed and matching items were combined.'
          : 'Your selection was updated.';
      else if (command.kind === 'clear')
        notice =
          version === intent.version
            ? 'Your bag is already empty. No items or coupons changed.'
            : 'Your bag was cleared. Items and selected coupons were removed.';
      else if (command.kind === 'add') notice = 'Added to your bag.';
      publish({ pending: null, sync: 'idle', issue: null, notice });
      deps.notify(intent.ownerContext, view.version);
      return view;
    } catch (error) {
      if (e !== epoch) throw error;
      const reason = attempted && observationCommand ? cartRejectionReason(error) : null;
      if (reason && observationCommand)
        observe({
          name: 'CART_COMMAND_REJECTED',
          data: { mode, command: observationCommand, reason },
        });
      const policy = cartIssue(error, now(), true);
      if (isUncertain(error) || policy.recovery === 'same-intent') {
        publish({
          ...(partition ? { confirmed: null, mode: 'error' } : {}),
          pending: intent,
          sync: 'uncertain',
          issue: policy,
          notice: null,
        });
      } else {
        const unresolvedReplay =
          recovering || ['IDEMPOTENCY_CONFLICT', 'INTENT_EXPIRED'].includes(policy.code);
        if (!unresolvedReplay) {
          journal.save(null);
          unresolvedIntent = null;
        }
        publish({
          pending: unresolvedReplay ? intent : null,
          sync: 'conflict',
          issue: policy,
          notice: null,
        });
        if (
          intent.command.kind === 'wishlist-transfer' &&
          partition &&
          ['WISHLIST_CHANGED', 'NOT_FOUND'].includes(policy.code)
        )
          deps.wishlistChanged?.(partition);
        if (cartOwnerUnavailable(policy.code)) fail(error, e, ticket);
        else if (policy.code === 'STALE_VERSION') {
          try {
            await refresh(true);
          } catch {
            /* Keep the original rejection/review notice. */
          }
          if (e === epoch) publish({ issue: policy, sync: 'conflict' });
        }
      }
      throw error;
    } finally {
      if (e === epoch) submitted = false;
    }
  }
  function command(
    command: CartCommand,
    observed?: Pick<CartView, 'ownerContext' | 'version'>,
    expectedPartition?: string | null,
    observationCommand = cartObservationCommand(command),
  ): Promise<CartView> {
    if (expectedPartition !== undefined && (ownerPending || expectedPartition !== partition))
      return Promise.reject(
        new CartCoordinationError(
          'OWNER_TRANSITION',
          'Your shopper context changed. Review your saved items.',
        ),
      );
    if (now() < (state.issue?.retryAt ?? 0))
      return Promise.reject(
        new CartCoordinationError(
          'REVIEW_REQUIRED',
          'Please wait before trying another bag action.',
        ),
      );
    if (state.mode === 'expired' && !state.confirmed)
      return Promise.reject(
        new CartCoordinationError(
          'REVIEW_REQUIRED',
          'Check the unavailable session or explicitly start a new bag before adding.',
        ),
      );
    const same = flights.get(JSON.stringify(command));
    if (same) return same;
    if (resetting || state.pending || flights.has(JSON.stringify({ kind: 'clear' })))
      return Promise.reject(
        new CartCoordinationError(
          'REVIEW_REQUIRED',
          'Resolve the current bag action before submitting another.',
        ),
      );
    const duplicate = JSON.stringify(command);
    const existing = flights.get(duplicate);
    if (existing) return existing;
    if (flights.size >= 20)
      return Promise.reject(
        new CartCoordinationError(
          'REVIEW_REQUIRED',
          'Too many bag actions are waiting. Review your bag.',
        ),
      );
    const e = epoch,
      fence = externalFence,
      surface = deps.surface?.();
    const task = queue
      .catch(() => undefined)
      .then(async () => {
        current(e);
        if (ownerPending)
          throw new CartCoordinationError(
            'REVIEW_REQUIRED',
            'Wait for shopper verification before changing the bag.',
          );
        requireNoPending();
        const known = state.confirmed;
        // A stale configuration editor must never establish a different bag.
        const view = known ? await refresh(true) : observed ? null : await initialize();
        current(e);
        requireNoPending();
        if (!view)
          throw new CartCoordinationError(
            'REVIEW_REQUIRED',
            'Your bag is not available. Review it before continuing.',
          );
        if (
          (known && (fence !== externalFence || known.ownerContext !== view.ownerContext)) ||
          (observed &&
            (observed.version !== view.version || observed.ownerContext !== view.ownerContext))
        ) {
          const error = new CartCoordinationError(
            'REVIEW_REQUIRED',
            'Your bag changed in another window. Review the current quantities before repeating your action.',
          );
          publish({
            sync: 'conflict',
            issue: { code: error.code, message: error.message, recovery: 'review', retryAt: 0 },
            notice: null,
          });
          throw error;
        }
        return submit(
          {
            key: uuid(),
            command,
            ownerContext: view.ownerContext,
            version: view.version,
            createdAt: now(),
          },
          e,
          false,
          surface,
          observationCommand,
        );
      })
      .finally(() => {
        if (flights.get(duplicate) === task) flights.delete(duplicate);
      });
    flights.set(duplicate, task);
    queue = task;
    return task;
  }
  return {
    getSnapshot: () => state,
    getServerSnapshot: () => EMPTY_CART_SNAPSHOT,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    refresh,
    initialize,
    addItem: (variantId: string, quantity: number) =>
      command({ kind: 'add', variantId, quantity: String(quantity) }),
    addGuestSavedItem: (
      variantId: string,
      quantity: string,
      observed?: Pick<CartView, 'ownerContext' | 'version'>,
    ) => command({ kind: 'add', variantId, quantity }, observed, null, 'WISHLIST_ADD'),
    transferWishlistItem: (
      request: WishlistTransfer,
      ownerPartition: string,
      observed?: Pick<CartView, 'ownerContext' | 'version'>,
    ) => command({ kind: 'wishlist-transfer', request }, observed, ownerPartition),
    setQuantity: (lineId: string, quantity: string) => command({ kind: 'set', lineId, quantity }),
    replaceVariant: (
      lineId: string,
      targetVariantId: string,
      quantity: string,
      observed: Pick<CartView, 'ownerContext' | 'version'>,
    ) => command({ kind: 'replace', lineId, targetVariantId, quantity }, observed),
    removeItem: (lineId: string) => command({ kind: 'remove', lineId }),
    applyCoupon: (couponCode: string) => command({ kind: 'apply-coupon', couponCode }),
    removeCoupon: (couponCode: string) => command({ kind: 'remove-coupon', couponCode }),
    clearCart: () => command({ kind: 'clear' }),
    mergeGuest(request: CartMergeCommitRequestDto) {
      if (!partition || parked.has(null) || deps.journal.read())
        return Promise.reject(
          new CartCoordinationError(
            'REVIEW_REQUIRED',
            'Resolve the earlier guest bag action before merging.',
          ),
        );
      return command({ kind: 'merge', request }, request);
    },
    guestRecoveryPending: () => parked.has(null) || Boolean(deps.journal.read()),
    forgetSession() {
      if (now() < (state.issue?.retryAt ?? 0))
        return Promise.reject(
          new CartCoordinationError(
            'REVIEW_REQUIRED',
            'Please wait before checking the bag session again.',
          ),
        );
      if (resetFlight) return resetFlight;
      // Unknown outcomes require a separate explicit stop-recovery decision first.
      if (state.pending || unresolvedIntent || journal.read() || submitted || flights.size)
        return Promise.reject(
          new CartCoordinationError(
            'REVIEW_REQUIRED',
            'Resolve or explicitly stop recovery of the earlier action before starting a new bag.',
          ),
        );
      if (partition || ownerPending || !['expired', 'empty'].includes(state.mode))
        return Promise.reject(
          new CartCoordinationError(
            'REVIEW_REQUIRED',
            'Only an unavailable guest session can be forgotten.',
          ),
        );
      resetting = true;
      const e = ++epoch;
      externalFence++;
      readAbort?.abort();
      readFlight = null;
      initFlight = null;
      publish({
        confirmed: null,
        pending: null,
        contexts: [],
        sync: 'resetting',
        notice: null,
        issue: null,
      });
      deps.sessionSignal?.('begin');
      let reviewPersisted = true;
      const task = (async () => {
        try {
          const remaining = await forgetGuestSession({
            api: deps.api,
            activity,
            coordinate: deps.coordinate,
            assertCurrent: () => current(e),
            onAcknowledged: () => {
              freshSessionExpected = true;
              reviewPersisted = journal.markSessionForgotten(true);
              selected = undefined;
              journal.select();
              journal.save(null);
              restored = false;
            },
          });
          current(e);
          if (remaining) {
            ownerLost = true;
            publish({
              mode: 'expired',
              sync: 'conflict',
              issue: {
                code: 'REVIEW_REQUIRED',
                message:
                  'Another window returned a bag session while recovery was finishing. Close other shopping tabs and check again before starting a new bag.',
                recovery: 'review',
                retryAt: 0,
              },
            });
          } else {
            ownerLost = false;
            freshSessionExpected = true;
            publish({
              ...EMPTY_CART_SNAPSHOT,
              mode: 'empty',
              notice:
                'This browser’s bag session was forgotten. Stored bags were not deleted or recovered. Choose an item to start a new bag.' +
                (reviewPersisted
                  ? ''
                  : ' Browser storage could not record this recovery. Keep this tab open and check your bag again if you reload.'),
            });
          }
        } catch (error) {
          fail(error, e, ++issued);
          if (epoch === e) publish({ mode: 'expired' });
          throw error;
        } finally {
          resetting = false;
          if (epoch === e && state.sync === 'resetting') publish({ sync: 'idle' });
          deps.sessionSignal?.('settled');
          resetFlight = null;
        }
      })();
      resetFlight = task;
      return task;
    },
    getCartCount: () => confirmedCartCount(state),
    getCartSummary: () =>
      state.confirmed
        ? {
            count: confirmedCartCount(state),
            currency: state.confirmed.currency,
            merchandiseNet: state.confirmed.merchandiseNet,
          }
        : null,
    async selectContext(context: string) {
      const outstanding = state.pending ?? unresolvedIntent ?? journal.read();
      if (outstanding && outstanding.ownerContext !== context)
        throw new CartCoordinationError(
          'REVIEW_REQUIRED',
          'Resolve the original bag’s action before choosing another bag.',
        );
      if (!state.contexts.includes(context))
        throw new CartCoordinationError(
          'REVIEW_REQUIRED',
          'Refresh the available bags before selecting one.',
        );
      epoch++;
      readAbort?.abort();
      readFlight = null;
      initFlight = null;
      selected = context;
      accepted = 0;
      publish({ confirmed: null, mode: 'loading', sync: 'refreshing', issue: null, notice: null });
      const view = await refresh(true);
      if (view) publish({ notice: 'Bag selected. Review it before adding again.' });
      return view;
    },
    async reviewContexts() {
      requireNoPending();
      epoch++;
      readAbort?.abort();
      readFlight = null;
      initFlight = null;
      selected = undefined;
      accepted = 0;
      journal.select();
      publish({ confirmed: null, mode: 'loading', sync: 'refreshing', issue: null, notice: null });
      return refresh(true);
    },
    retryPending() {
      if (retryFlight) return retryFlight;
      const task = (async () => {
        const intent = state.pending;
        if (!intent || ownerPending || resetting || submitted)
          throw new CartCoordinationError(
            'REVIEW_REQUIRED',
            'The pending action is not available in this shopper context.',
          );
        if (now() - intent.createdAt > CART_INTENT_MAX_AGE) {
          const message = 'This action is too old to replay. Review the bag before a new action.';
          publish({
            sync: 'conflict',
            issue: { code: 'INTENT_EXPIRED', message, recovery: 'review', retryAt: 0 },
          });
          throw new CartCoordinationError('REVIEW_REQUIRED', message);
        }
        if (state.confirmed && state.confirmed.ownerContext !== intent.ownerContext)
          throw new CartCoordinationError(
            'REVIEW_REQUIRED',
            'Review the original bag before retrying its action.',
          );
        if (now() < (state.issue?.retryAt ?? 0))
          throw new CartCoordinationError('REVIEW_REQUIRED', 'Please wait before retrying.');
        const e = epoch;
        let view: CartView;
        try {
          view = await activity.track(api.get(intent.ownerContext));
          current(e);
        } catch (error) {
          fail(error, e, ++issued);
          throw error;
        }
        if (view.ownerContext !== intent.ownerContext)
          throw new CartCoordinationError('OWNER_TRANSITION', 'The original bag is unavailable.');
        apply(view, e, ++issued);
        return submit(intent, e, true);
      })().finally(() => {
        if (retryFlight === task) retryFlight = null;
      });
      retryFlight = task;
      return task;
    },
    stopRetrying() {
      if (submitted || resetting || activity.busy())
        throw new CartCoordinationError(
          'REVIEW_REQUIRED',
          'Wait for the in-flight action before stopping retries.',
        );
      journal.save(null);
      unresolvedIntent = null;
      publish({
        pending: null,
        sync: 'idle',
        issue: null,
        notice:
          'Automatic recovery stopped. Earlier changes may already be saved; review the bag before adding again.',
      });
    },
    ownerTransition(preserveContext = false) {
      ownerPending = true;
      epoch++;
      issued++;
      accepted = 0;
      externalFence++;
      readAbort?.abort();
      readFlight = null;
      initFlight = null;
      submitted = false;
      retryFlight = null;
      if (!preserveContext) {
        ownerLost = false;
        selected = undefined;
        journal.select();
      }
      flights.clear();
      queue = Promise.resolve();
      restored = false;
      publish({ ...EMPTY_CART_SNAPSHOT, mode: 'loading', sync: 'refreshing' });
    },
    settleOwner(next?: { partition: string | null; api: CartApi; journal: CartJournal }) {
      if (next && next.partition !== partition) {
        if (unresolvedIntent) parked.set(partition, unresolvedIntent);
        if (parked.size > 16) {
          const oldestAccount = [...parked.keys()].find((key) => key !== null);
          if (oldestAccount) parked.delete(oldestAccount);
        }
        partition = next.partition;
        api = next.api;
        journal = next.journal;
        unresolvedIntent = parked.get(partition) ?? null;
        parked.delete(partition);
        selected = journal.context();
        ownerLost = false;
        freshSessionExpected = !partition && journal.requiresSessionReview();
      }
      ownerPending = false;
      if (resetFlight) {
        const e = epoch;
        return resetFlight.catch(() => undefined).then(() => (e === epoch ? refresh(true) : null));
      }
      return refresh(true);
    },
    authorityUnavailable(issue: CartSnapshot['issue'], expired: boolean) {
      ownerPending = true;
      publish({ mode: expired ? 'expired' : 'error', sync: 'idle', confirmed: null, issue });
    },
    expectFreshSession: () => {
      freshSessionExpected = true;
      journal.markSessionForgotten(true);
    },
    reconcile: () => {
      freshSessionExpected = false;
      journal.markSessionForgotten(false);
      return refresh(true);
    },
  };
}
export type CartController = ReturnType<typeof createCartController>;
