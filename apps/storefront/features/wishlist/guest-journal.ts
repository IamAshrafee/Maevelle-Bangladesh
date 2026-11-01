/** Independent localStorage keys make different-tab writes additive rather than whole-list rewrites. */
export const GUEST_OP_PREFIX = 'maevelle_wishlist_op_v2:';
export const LEGACY_GUEST_KEY = 'maevelle_wishlist_items_v1';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_SAVED = 100;
const MAX_JOURNAL_KEYS = 2000;

export interface GuestReference {
  productId: string;
  preferredVariantId: string | null;
  savedAt: string;
}

export interface GuestOperation {
  id: string;
  productId: string;
  action: 'save' | 'remove';
  preferredVariantId: string | null;
  savedAt: string;
  at: string;
}

export interface GuestSnapshot {
  items: readonly GuestReference[];
  winners: ReadonlyMap<string, string>;
}

type BrowserStorage = Pick<Storage, 'length' | 'key' | 'getItem' | 'setItem' | 'removeItem'>;

function valid(value: unknown): value is GuestOperation {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === 'string' &&
    typeof row.productId === 'string' &&
    UUID.test(row.productId) &&
    (row.action === 'save' || row.action === 'remove') &&
    (row.preferredVariantId === null ||
      (typeof row.preferredVariantId === 'string' && UUID.test(row.preferredVariantId))) &&
    typeof row.savedAt === 'string' &&
    Number.isFinite(Date.parse(row.savedAt)) &&
    typeof row.at === 'string' &&
    Number.isFinite(Date.parse(row.at))
  );
}

function compare(a: GuestOperation, b: GuestOperation): number {
  return a.at.localeCompare(b.at) || a.id.localeCompare(b.id);
}

function keys(storage: BrowserStorage): string[] {
  const result: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key?.startsWith(GUEST_OP_PREFIX)) result.push(key);
  }
  return result;
}

/** Legacy rows are written with an old logical clock so a later remove always wins. */
export function migrateLegacyGuestWishlist(storage: BrowserStorage): void {
  const raw = storage.getItem(LEGACY_GUEST_KEY);
  if (!raw) return;
  let rows: unknown;
  try {
    rows = JSON.parse(raw);
  } catch {
    return;
  }
  if (!Array.isArray(rows)) return;
  const seen = new Set<string>();
  for (const [index, value] of rows.entries()) {
    if (!value || typeof value !== 'object') continue;
    const row = value as Record<string, unknown>;
    const productId = typeof row.id === 'string' ? row.id.toLowerCase() : '';
    if (!UUID.test(productId) || seen.has(productId) || seen.size >= MAX_SAVED) continue;
    seen.add(productId);
    const preferredVariantId =
      typeof row.preferredVariantId === 'string' && UUID.test(row.preferredVariantId)
        ? row.preferredVariantId.toLowerCase()
        : null;
    const savedAt =
      typeof row.savedAt === 'string' && Number.isFinite(Date.parse(row.savedAt))
        ? new Date(row.savedAt).toISOString()
        : new Date(Date.UTC(2000, 0, 1, 0, 0, index)).toISOString();
    const id = `legacy:${productId}`;
    const key = `${GUEST_OP_PREFIX}${id}`;
    if (storage.getItem(key)) continue;
    storage.setItem(
      key,
      JSON.stringify({
        id,
        productId,
        action: 'save',
        preferredVariantId,
        savedAt,
        at: new Date(0).toISOString(),
      } satisfies GuestOperation),
    );
  }
  storage.removeItem(LEGACY_GUEST_KEY);
}

export function readGuestJournal(storage: BrowserStorage, compact = false): GuestSnapshot {
  migrateLegacyGuestWishlist(storage);
  const latest = new Map<string, { key: string; op: GuestOperation }>();
  const obsolete: string[] = [];
  for (const key of keys(storage)) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(storage.getItem(key) ?? 'null');
    } catch {
      continue;
    }
    if (!valid(parsed) || key !== `${GUEST_OP_PREFIX}${parsed.id}`) continue;
    const productId = parsed.productId.toLowerCase();
    const current = latest.get(productId);
    if (!current || compare(parsed, current.op) > 0) {
      if (current) obsolete.push(current.key);
      latest.set(productId, { key, op: parsed });
    } else obsolete.push(key);
  }
  if (compact) {
    for (const key of obsolete) storage.removeItem(key);
    const oldRemovals = [...latest.values()]
      .filter(
        ({ op }) =>
          op.action === 'remove' && Date.parse(op.at) < Date.now() - 30 * 24 * 60 * 60 * 1000,
      )
      .sort((a, b) => compare(a.op, b.op));
    for (const value of oldRemovals.slice(0, Math.max(0, oldRemovals.length - 500))) {
      storage.removeItem(value.key);
      latest.delete(value.op.productId.toLowerCase());
    }
  }
  const saved = [...latest.values()]
    .filter(({ op }) => op.action === 'save')
    .sort((a, b) => compare(b.op, a.op))
    .slice(0, MAX_SAVED);
  return {
    items: saved.map(({ op }) => ({
      productId: op.productId.toLowerCase(),
      preferredVariantId: op.preferredVariantId,
      savedAt: op.savedAt,
    })),
    winners: new Map([...latest].map(([id, value]) => [id, value.key])),
  };
}

export function writeGuestOperation(
  storage: BrowserStorage,
  productId: string,
  action: 'save' | 'remove',
  preferredVariantId: string | null = null,
): GuestSnapshot {
  if (!UUID.test(productId) || (preferredVariantId !== null && !UUID.test(preferredVariantId)))
    throw new Error('Invalid product or variant.');
  const before = readGuestJournal(storage);
  if (
    action === 'save' &&
    before.items.length >= MAX_SAVED &&
    !before.items.some((item) => item.productId === productId.toLowerCase())
  )
    throw new Error('Your wishlist has reached its 100 item limit.');
  if (keys(storage).length >= MAX_JOURNAL_KEYS)
    throw new Error(
      'Browser wishlist storage is full. Clear older browser data before saving more.',
    );
  const id = crypto.randomUUID();
  const priorKey = before.winners.get(productId.toLowerCase());
  let priorAt = 0;
  if (priorKey) {
    try {
      const prior: unknown = JSON.parse(storage.getItem(priorKey) ?? 'null');
      if (valid(prior)) priorAt = Date.parse(prior.at);
    } catch {
      /* A corrupt earlier operation cannot set the clock. */
    }
  }
  const at = new Date(Math.max(Date.now(), priorAt + 1)).toISOString();
  const existing = before.items.find((item) => item.productId === productId.toLowerCase());
  const op: GuestOperation = {
    id,
    productId: productId.toLowerCase(),
    action,
    preferredVariantId,
    savedAt: action === 'save' ? (existing?.savedAt ?? at) : at,
    at,
  };
  storage.setItem(`${GUEST_OP_PREFIX}${id}`, JSON.stringify(op));
  try {
    return readGuestJournal(storage, true);
  } catch {
    return readGuestJournal(storage);
  }
}

/** Remove only the frozen winner; later guest intent survives an in-flight merge. */
export function clearTransferredGuestItems(
  storage: BrowserStorage,
  frozen: GuestSnapshot,
  transferred: ReadonlySet<string>,
): GuestSnapshot {
  for (const item of frozen.items) {
    if (!transferred.has(item.productId)) continue;
    const current = readGuestJournal(storage);
    if (current.winners.get(item.productId) === frozen.winners.get(item.productId))
      writeGuestOperation(storage, item.productId, 'remove');
  }
  return readGuestJournal(storage, true);
}
