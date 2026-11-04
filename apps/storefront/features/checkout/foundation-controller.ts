import type {
  CheckoutDraftDto,
  CheckoutSourceDto,
  UpdateCheckoutDraftDto,
} from '@maevelle/contracts';
import type { reviewApi } from './foundation-api';
import { reviewIssue } from './foundation-errors';
import {
  EMPTY_REVIEW,
  type CatalogReferences,
  type ReviewIntent,
  type ReviewOwner,
  type ReviewSnapshot,
} from './foundation-types';
import { ownerPartition, type ReviewJournal } from './foundation-journal';

interface Dependencies {
  api: typeof reviewApi;
  journal: ReviewJournal;
  resolveOwner(signal: AbortSignal): Promise<string | null>;
  uuid?: () => string;
  now?: () => number;
}
/** One server projection plus an immutable pending command. Identity hints invalidate both views. */
export function createReviewController(deps: Dependencies) {
  const now = deps.now ?? Date.now,
    uuid = deps.uuid ?? (() => crypto.randomUUID());
  let state: ReviewSnapshot = EMPTY_REVIEW,
    generation = 0,
    abort = new AbortController(),
    part: string | undefined,
    held = false;
  let running: Promise<unknown> | null = null;
  const listeners = new Set<() => void>();
  function publish(patch: Partial<ReviewSnapshot>) {
    state = { ...state, ...patch, persisted: deps.journal.healthy() };
    listeners.forEach((fn) => fn());
  }
  function invalidate(hold = false) {
    held = hold;
    generation++;
    abort.abort();
    abort = new AbortController();
    part = undefined;
    running = null;
    state = { ...EMPTY_REVIEW, phase: 'checking', persisted: deps.journal.healthy() };
    listeners.forEach((fn) => fn());
  }
  function assertCurrent(epoch: number) {
    if (epoch !== generation || held) throw new Error('Shopper changed');
  }
  async function identify(epoch: number) {
    if (held) throw new Error('Shopper transition in progress');
    const value = await deps.resolveOwner(abort.signal);
    assertCurrent(epoch);
    const next = value ?? 'guest';
    if (part !== undefined && part !== next) {
      invalidate();
      throw new Error('Shopper changed');
    }
    part = next;
    publish({
      partition: next,
      guestCandidate: next !== 'guest' ? (deps.journal.reference('guest') ?? null) : null,
    });
    return next;
  }
  function authority(current: string, context = deps.journal.context()): ReviewOwner {
    if (current !== 'guest') return { kind: 'ACCOUNT', partition: current };
    if (!context) throw new Error('Establish a guest review explicitly.');
    return { kind: 'GUEST', context };
  }
  async function accept(
    value: CheckoutDraftDto,
    epoch: number,
    current: string,
    owner: ReviewOwner,
    handles: CatalogReferences,
  ) {
    assertCurrent(epoch);
    const verified = await identify(epoch);
    assertCurrent(epoch);
    if (verified !== current || value.ownerKind !== owner.kind) throw new Error('Shopper changed');
    deps.journal.save({
      partition: current,
      ...(owner.kind === 'GUEST' ? { context: owner.context } : {}),
      id: value.id,
      revision: value.revision,
      handles,
      savedAt: now(),
    });
    deps.journal.finish(current);
    publish({
      draft: value,
      handles,
      pending: null,
      issue: null,
      phase: 'ready',
      guestCandidate: owner.kind === 'ACCOUNT' ? null : state.guestCandidate,
    });
    return value;
  }
  async function execute(intent: ReviewIntent, epoch: number) {
    const current = ownerPartition(intent.owner);
    if ((await identify(epoch)) !== current) throw new Error('Shopper changed');
    deps.journal.put(intent);
    publish({ pending: intent, issue: null, phase: 'pending' });
    const value = await deps.api.mutate(intent, abort.signal);
    const accepted = await accept(value, epoch, current, intent.owner, intent.handles);
    if (intent.kind === 'adopt') deps.journal.removeReference('guest', intent.id);
    return accepted;
  }
  function task<T>(run: (epoch: number) => Promise<T>): Promise<T> {
    if (running) return running as Promise<T>;
    const epoch = generation;
    const job = run(epoch)
      .catch((error) => {
        if (epoch === generation && !held)
          publish({ phase: 'error', issue: reviewIssue(error, now()) });
        throw error;
      })
      .finally(() => {
        if (running === job) running = null;
      });
    running = job;
    return job;
  }
  async function restore(epoch: number, selectedId?: string) {
    publish({ phase: 'checking', draft: null, issue: null });
    const current = await identify(epoch);
    const pending = deps.journal.pending(current);
    const ref = selectedId
      ? deps.journal.references(current).find((v) => v.id === selectedId)
      : deps.journal.reference(current);
    // Never silently resubmit on render, reload, focus or identity change.
    if (pending) {
      publish({ pending, phase: 'ready', handles: pending.handles });
      return null;
    }
    if (!ref?.id) {
      publish({ phase: 'ready', draft: null });
      return null;
    }
    const owner = authority(current, ref.context);
    const value = await deps.api.read(ref.id, owner, abort.signal);
    return accept(value, epoch, current, owner, ref.handles);
  }
  return {
    getSnapshot: () => state,
    subscribe(fn: () => void) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    invalidate,
    refresh: (id?: string) => task((epoch) => restore(epoch, id)),
    async initiate(source: CheckoutSourceDto, handles: CatalogReferences = {}) {
      // Existing uncertain intent is never replaced by a fresh key/payload.
      return task(async (epoch) => {
        const current = await identify(epoch),
          previous = deps.journal.pending(current);
        if (previous) {
          publish({ pending: previous, handles: previous.handles, phase: 'ready' });
          return null;
        }
        if (current === 'guest' && !deps.journal.context()) {
          const session = await deps.api.establish(abort.signal);
          assertCurrent(epoch);
          if ((await identify(epoch)) !== current) throw new Error('Shopper changed');
          deps.journal.setContext(session.id);
        }
        return execute(
          {
            kind: 'create',
            key: uuid(),
            owner: authority(current),
            source,
            handles,
            createdAt: now(),
          },
          epoch,
        );
      });
    },
    retry: () => {
      if (state.issue && now() < state.issue.retryAt)
        return Promise.reject(new Error('Wait before retrying.'));
      return task(async (epoch) => {
        const current = await identify(epoch),
          intent = deps.journal.pending(current);
        if (!intent) return restore(epoch);
        return execute(intent, epoch);
      });
    },
    update: (change: UpdateCheckoutDraftDto, handles = state.handles) =>
      task(async (epoch) => {
        const current = await identify(epoch);
        if (deps.journal.pending(current)) throw new Error('Recover the pending request first.');
        const value = state.draft;
        if (!value) throw new Error('Restore the review first.');
        return execute(
          {
            kind: 'update',
            id: value.id,
            change,
            key: uuid(),
            owner: authority(current),
            handles,
            createdAt: now(),
          },
          epoch,
        );
      }),
    adopt: () =>
      task(async (epoch) => {
        const current = await identify(epoch),
          guest = deps.journal.reference('guest');
        if (current === 'guest' || !guest?.id || !guest.context || !guest.revision)
          throw new Error('Sign in and restore the guest review first.');
        if (deps.journal.pending(current)) throw new Error('Recover the pending request first.');
        return execute(
          {
            kind: 'adopt',
            id: guest.id,
            revision: guest.revision,
            guestContext: guest.context,
            key: uuid(),
            owner: authority(current),
            handles: guest.handles,
            createdAt: now(),
          },
          epoch,
        );
      }),
    stopRecovering: () => {
      if (part) deps.journal.finish(part);
      publish({ pending: null, issue: null, phase: 'ready' });
    },
    revoke: () =>
      task(async (epoch) => {
        const current = await identify(epoch),
          owner = authority(current);
        if (owner.kind !== 'GUEST') throw new Error('Only a guest session can be ended here.');
        const result = await deps.api.revoke(owner, abort.signal);
        assertCurrent(epoch);
        if (result.revoked !== true) throw new Error('Guest session was not revoked.');
        deps.journal.forgetGuest();
        publish({ draft: null, pending: null, phase: 'ready' });
      }),
    startNewGuest: () => {
      invalidate();
      deps.journal.forgetGuest();
      publish({ phase: 'ready' });
    },
  };
}
export type ReviewController = ReturnType<typeof createReviewController>;
