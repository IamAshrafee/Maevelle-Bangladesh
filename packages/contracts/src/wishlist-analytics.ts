/** Backend-owned metric vocabulary. Browser observations never establish domain outcomes. */
export const wishlistOutcomeNames = [
  'wishlist.item.saved',
  'wishlist.item.removed',
  'wishlist.merge.completed',
  'wishlist.share.created',
  'wishlist.share.claimed',
  'wishlist.share.revoked',
  'wishlist.share.expiry_changed',
  'wishlist.share.link_rotated',
  'wishlist.share.expired',
] as const;
export type WishlistOutcomeName = (typeof wishlistOutcomeNames)[number];
export const wishlistObservationNames = [
  'WISHLIST_PAGE_VIEWED',
  'WISHLIST_SHARE_OPENED',
  'WISHLIST_SCOPE_SELECTED',
  'WISHLIST_COPY_ATTEMPTED',
  'WISHLIST_COPY_SUCCEEDED',
  'WISHLIST_NATIVE_SHARE_INVOKED',
  'WISHLIST_WHATSAPP_SELECTED',
  'WISHLIST_RECIPIENT_VIEWED',
  'WISHLIST_PRODUCT_OPENED',
  'WISHLIST_SAVE_ONE_INITIATED',
  'WISHLIST_SAVE_ALL_INITIATED',
  'WISHLIST_GUEST_SAVE_OBSERVED',
  'WISHLIST_GUEST_REMOVE_OBSERVED',
] as const;
export type WishlistObservationName = (typeof wishlistObservationNames)[number];
export interface WishlistObservationDto {
  schemaVersion: 1;
  eventId: string;
  name: WishlistObservationName;
  origin: 'BROWSER';
  occurredAt: string;
  sessionId: string;
  consent: {
    necessary: 'GRANTED';
    analytics: 'GRANTED' | 'DENIED' | 'UNKNOWN';
    marketing: 'GRANTED' | 'DENIED' | 'UNKNOWN';
    preferences: 'GRANTED' | 'DENIED' | 'UNKNOWN';
    recordedAt: string;
  };
  data: { mode: 'GUEST' | 'ACCOUNT'; scope?: 'ALL' | 'SELECTED' };
}
export interface WishlistAnalyticsQueryDto {
  from: string;
  to: string;
  page?: number;
  pageSize?: number;
}
export interface WishlistAnalyticsMetadataDto {
  from: string;
  toExclusive: string;
  timezone: string;
  generatedAt: string;
  instrumentationStart: string;
  retainedFrom: string;
  historyComplete: boolean;
  projection: 'CURRENT' | 'LAGGING' | 'FAILED';
  pendingEvents: number;
  oldestPendingAt: string | null;
  lastProcessedAt: string | null;
  sources: {
    current: 'AUTHORITATIVE_DATABASE';
    activity: 'COMMITTED_OUTBOX';
    behavioral: 'CONSENTED_UNVERIFIED_BROWSER';
    operations: 'BEST_EFFORT_COUNTERS';
  };
  rankingMinimumLists: 3;
  observationRetainedFrom: string;
  unavailable: readonly string[];
}
export interface WishlistSummaryDto {
  savedItems: number;
  lists: number;
  nonemptyLists: number;
  distinctProducts: number;
  availableItems: number;
  outOfStockItems: number;
  unavailableItems: number;
}
export interface WishlistTrendDto {
  day: string;
  saved: number;
  removed: number;
  mergeAdditions: number;
  merges: number;
  net: number;
}
export interface WishlistProductInterestDto {
  productId: string;
  title: string;
  categoryId: string | null;
  available: boolean | null;
  saved: number;
  recentSaves: number | null;
  recentRemovals: number | null;
}
export interface WishlistCategoryInterestDto {
  categoryId: string | null;
  name: string;
  saved: number;
  recentSaves: number | null;
  recentRemovals: number | null;
}
export interface WishlistSharingDto {
  current: {
    active: number;
    revoked: number;
    expired: number;
    guestOwned: number;
    accountOwned: number;
  };
  outcomes: {
    name: WishlistOutcomeName;
    count: number;
    guest: number;
    account: number;
    all: number;
    selected: number;
    unknown: number;
    averageSize: number | null;
  }[];
  trends: { day: string; name: WishlistOutcomeName; count: number }[];
  observations: { name: WishlistObservationName; count: number }[];
}
export interface WishlistOperationsDto {
  counters: {
    day: string;
    operation: string;
    outcome: string;
    count: number;
    totalDurationMs: number;
  }[];
  cleanup: { expiredUnreported: number; purgeableShares: number; expiredMergeReceipts: number };
}
export interface WishlistAnalyticsResponseDto<T> {
  metadata: WishlistAnalyticsMetadataDto;
  result: T;
}
export interface WishlistAnalyticsPageDto<T> {
  items: T[];
  page: number;
  pageSize: number;
  hasMore: boolean;
}
