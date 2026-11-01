import { Type } from 'typebox';
import { wishlistOutcomeNames, wishlistObservationNames } from '@maevelle/contracts';
import type { WishlistReport } from '@maevelle/database/analytics';
const count = Type.Integer({ minimum: 0 });
const nullableString = Type.Union([Type.String(), Type.Null()]);
const nullableCount = Type.Union([count, Type.Null()]);
const object = Type.Object;
const metadata = object({
  from: Type.String(),
  toExclusive: Type.String(),
  timezone: Type.String(),
  generatedAt: Type.String(),
  instrumentationStart: Type.String(),
  retainedFrom: Type.String(),
  historyComplete: Type.Boolean(),
  projection: Type.Union(['CURRENT', 'LAGGING', 'FAILED'].map((v) => Type.Literal(v))),
  pendingEvents: count,
  oldestPendingAt: nullableString,
  lastProcessedAt: nullableString,
  sources: object({
    current: Type.Literal('AUTHORITATIVE_DATABASE'),
    activity: Type.Literal('COMMITTED_OUTBOX'),
    behavioral: Type.Literal('CONSENTED_UNVERIFIED_BROWSER'),
    operations: Type.Literal('BEST_EFFORT_COUNTERS'),
  }),
  rankingMinimumLists: Type.Literal(3),
  observationRetainedFrom: Type.String(),
  unavailable: Type.Array(Type.String()),
});
const page = (items: ReturnType<typeof Type.Object>) =>
  object({ items: Type.Array(items), page: count, pageSize: count, hasMore: Type.Boolean() });
const outcomeName = Type.Union(wishlistOutcomeNames.map((n) => Type.Literal(n)));
const observationName = Type.Union(wishlistObservationNames.map((n) => Type.Literal(n)));
const schemas = {
  summary: object({
    savedItems: count,
    lists: count,
    nonemptyLists: count,
    distinctProducts: count,
    availableItems: count,
    outOfStockItems: count,
    unavailableItems: count,
  }),
  activity: Type.Array(
    object({
      day: Type.String(),
      saved: count,
      removed: count,
      mergeAdditions: count,
      merges: count,
      net: Type.Integer(),
    }),
  ),
  products: page(
    object({
      productId: Type.String(),
      title: Type.String(),
      categoryId: nullableString,
      available: Type.Union([Type.Boolean(), Type.Null()]),
      saved: count,
      recentSaves: nullableCount,
      recentRemovals: nullableCount,
    }),
  ),
  categories: page(
    object({
      categoryId: nullableString,
      name: Type.String(),
      saved: count,
      recentSaves: nullableCount,
      recentRemovals: nullableCount,
    }),
  ),
  sharing: object({
    current: object({
      active: count,
      revoked: count,
      expired: count,
      guestOwned: count,
      accountOwned: count,
    }),
    outcomes: Type.Array(
      object({
        name: outcomeName,
        count,
        guest: count,
        account: count,
        all: count,
        selected: count,
        unknown: count,
        averageSize: Type.Union([Type.Number(), Type.Null()]),
      }),
    ),
    trends: Type.Array(object({ day: Type.String(), name: outcomeName, count })),
    observations: Type.Array(object({ name: observationName, count })),
  }),
  operations: object({
    counters: Type.Array(
      object({
        day: Type.String(),
        operation: Type.String(),
        outcome: Type.String(),
        count,
        totalDurationMs: Type.Number(),
      }),
    ),
    cleanup: object({
      expiredUnreported: count,
      purgeableShares: count,
      expiredMergeReceipts: count,
    }),
  }),
};
export function wishlistResponseSchema(report: WishlistReport) {
  return object({ data: object({ metadata, result: schemas[report] }) });
}
