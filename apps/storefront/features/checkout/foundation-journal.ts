import type { CheckoutSourceDto, UpdateCheckoutDraftDto } from '@maevelle/contracts';
import type {
  CatalogReferences,
  ReviewIntent,
  ReviewOwner,
  ReviewReference,
} from './foundation-types';

const KEY = 'maevelle_checkout_review_v1';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const revision = /^[1-9][0-9]{0,18}$/;
const partition = (v: unknown): v is string =>
  v === 'guest' || (typeof v === 'string' && /^[A-Za-z0-9_-]{43}$/.test(v));
const object = (v: unknown): v is Record<string, unknown> =>
  Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const keys = (v: Record<string, unknown>, allowed: readonly string[]) =>
  Object.keys(v).every((k) => allowed.includes(k));
const id = (v: unknown): v is string => typeof v === 'string' && uuid.test(v);
const version = (v: unknown): v is string => typeof v === 'string' && revision.test(v);
function handles(v: unknown): v is CatalogReferences {
  return (
    object(v) &&
    Object.keys(v).length <= 100 &&
    Object.entries(v).every(
      ([key, value]) =>
        id(key) && typeof value === 'string' && /^[a-z0-9][a-z0-9-]{0,127}$/.test(value),
    )
  );
}
function source(v: unknown): v is CheckoutSourceDto {
  if (!object(v)) return false;
  return v.kind === 'BUY_NOW'
    ? keys(v, ['kind', 'variantId', 'quantity']) &&
        id(v.variantId) &&
        typeof v.quantity === 'string' &&
        /^[1-9][0-9]?$/.test(v.quantity)
    : v.kind === 'CART' &&
        keys(v, ['kind', 'cartId', 'cartRevision']) &&
        id(v.cartId) &&
        version(v.cartRevision);
}
function owner(v: unknown): v is ReviewOwner {
  return (
    object(v) &&
    (v.kind === 'GUEST'
      ? keys(v, ['kind', 'context']) && id(v.context)
      : v.kind === 'ACCOUNT' &&
        keys(v, ['kind', 'partition']) &&
        partition(v.partition) &&
        v.partition !== 'guest')
  );
}
function change(v: unknown): v is UpdateCheckoutDraftDto {
  return (
    object(v) &&
    keys(v, ['revision', 'source', 'action']) &&
    version(v.revision) &&
    ((v.action === 'ABANDON' && !v.source) || (!v.action && source(v.source)))
  );
}
function recent(v: unknown, now: number): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v <= now + 10000 && v > now - 86400000;
}
function intent(v: unknown, now: number): v is ReviewIntent {
  if (
    !object(v) ||
    !id(v.key) ||
    !owner(v.owner) ||
    !handles(v.handles) ||
    !recent(v.createdAt, now)
  )
    return false;
  const common = ['kind', 'key', 'owner', 'handles', 'createdAt'];
  return v.kind === 'create'
    ? keys(v, [...common, 'source']) && source(v.source)
    : v.kind === 'update'
      ? keys(v, [...common, 'id', 'change']) && id(v.id) && change(v.change)
      : v.kind === 'adopt' &&
        keys(v, [...common, 'id', 'revision', 'guestContext']) &&
        id(v.id) &&
        version(v.revision) &&
        id(v.guestContext) &&
        v.owner.kind === 'ACCOUNT';
}
function reference(v: unknown, now: number): v is ReviewReference {
  return (
    object(v) &&
    keys(v, [
      'partition',
      'context',
      'id',
      'revision',
      'handles',
      'savedAt',
      'placementAttempted',
    ]) &&
    partition(v.partition) &&
    (v.context === undefined || id(v.context)) &&
    (v.id === undefined || id(v.id)) &&
    (v.revision === undefined || version(v.revision)) &&
    (v.placementAttempted === undefined || v.placementAttempted === true) &&
    handles(v.handles) &&
    recent(v.savedAt, now) &&
    (v.partition !== 'guest' || id(v.context))
  );
}
export function ownerPartition(value: ReviewOwner) {
  return value.kind === 'GUEST' ? 'guest' : value.partition;
}
type Storage = Pick<globalThis.Storage, 'getItem' | 'setItem'>;
/** Only nonsecret recovery references; never DTOs, capability cookies, prices or customer data. */
export function createReviewJournal(storage: Storage, now = Date.now) {
  let refs: ReviewReference[] = [],
    pending: ReviewIntent[] = [],
    guestContext: string | undefined,
    healthy = true;
  try {
    const raw = storage.getItem(KEY);
    if (raw) {
      if (raw.length > 65536) throw new Error('oversized');
      const value: unknown = JSON.parse(raw);
      if (
        !object(value) ||
        !keys(value, ['version', 'refs', 'pending', 'guestContext']) ||
        value.version !== 1 ||
        !Array.isArray(value.refs) ||
        !Array.isArray(value.pending) ||
        value.refs.length > 8 ||
        value.pending.length > 8
      )
        throw new Error('invalid');
      refs = value.refs.filter((v) => reference(v, now()));
      pending = value.pending.filter((v) => intent(v, now()));
      guestContext = id(value.guestContext) ? value.guestContext : undefined;
    }
  } catch {
    healthy = false;
  }
  function persist() {
    try {
      const value = JSON.stringify({
        version: 1,
        refs,
        pending,
        ...(guestContext ? { guestContext } : {}),
      });
      if (value.length > 65536) throw new Error('oversized');
      storage.setItem(KEY, value);
      healthy = true;
    } catch {
      healthy = false;
    }
  }
  return {
    healthy: () => healthy,
    context: () => guestContext,
    setContext(value: string) {
      if (!id(value)) throw new Error('Invalid guest reference');
      guestContext = value;
      persist();
    },
    reference: (part: string) => refs.find((v) => v.partition === part),
    references: (part: string) => refs.filter((v) => v.partition === part),
    pending: (part: string) => pending.find((v) => ownerPartition(v.owner) === part),
    save(value: ReviewReference) {
      if (!reference(value, now())) throw new Error('Invalid review reference');
      const prior = refs.find((v) => v.partition === value.partition && v.id === value.id);
      refs = [
        prior?.placementAttempted ? { ...value, placementAttempted: true } : value,
        ...refs.filter((v) => !(v.partition === value.partition && v.id === value.id)),
      ].slice(0, 8);
      persist();
    },
    markPlacement(part: string, draftId: string, attempted: boolean) {
      refs = refs.map((ref) => {
        if (ref.partition !== part || ref.id !== draftId) return ref;
        const { placementAttempted: marker, ...rest } = ref;
        if (attempted === Boolean(marker)) return ref;
        return attempted ? { ...rest, placementAttempted: true } : rest;
      });
      persist();
    },
    put(value: ReviewIntent) {
      if (!intent(value, now())) throw new Error('Invalid review intent');
      pending = [
        value,
        ...pending.filter((v) => ownerPartition(v.owner) !== ownerPartition(value.owner)),
      ].slice(0, 8);
      persist();
    },
    finish(part: string) {
      pending = pending.filter((v) => ownerPartition(v.owner) !== part);
      persist();
    },
    removeReference(part: string, id: string) {
      refs = refs.filter((v) => v.partition !== part || v.id !== id);
      persist();
    },
    forgetGuest() {
      guestContext = undefined;
      refs = refs.filter((v) => v.partition !== 'guest');
      pending = pending.filter((v) => v.owner.kind !== 'GUEST');
      persist();
    },
  };
}
export type ReviewJournal = ReturnType<typeof createReviewJournal>;
