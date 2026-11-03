import type { CommerceConsentStateDto } from './index.js';

export const cartMutationOperations = [
  'add_line',
  'remove_line',
  'set_quantity',
  'replace_variant',
  'clear',
  'apply_coupon',
  'remove_coupon',
  'wishlist_transfer',
  'merge_guest',
] as const;

export type CartMutationOperation = (typeof cartMutationOperations)[number];

/** Internal operational measurement on cart.intent.mutated v2. */
export interface CartMutationMeasurement {
  readonly owner: 'GUEST' | 'ACCOUNT';
  readonly wishlistAction: 'ADD' | 'MOVE' | null;
  readonly currency: string;
  readonly unitDelta: number;
  readonly unitsAfter: number;
  readonly linesAfter: number;
  readonly merchandiseGrossAfter: string;
  readonly merchandiseNetAfter: string;
}

export const cartInteractionNames = [
  'CART_VIEWED',
  'CART_COMMAND_INITIATED',
  'CART_COMMAND_REJECTED',
  'CART_RECOVERY_VIEWED',
] as const;
export type CartInteractionName = (typeof cartInteractionNames)[number];

export const cartObservationCommands = [
  'ADD',
  'QUANTITY',
  'VARIANT',
  'REMOVE',
  'CLEAR',
  'COUPON_APPLY',
  'COUPON_REMOVE',
  'WISHLIST_ADD',
  'WISHLIST_MOVE',
  'MERGE_CONFIRM',
] as const;
export const cartObservationSurfaces = ['DRAWER', 'PAGE', 'MERGE_REVIEW'] as const;
export const cartRejectionReasons = ['STALE', 'VALIDATION', 'OTHER'] as const;
export type CartObservationCommand = (typeof cartObservationCommands)[number];
export type CartObservationSurface = (typeof cartObservationSurfaces)[number];
export type CartRejectionReason = (typeof cartRejectionReasons)[number];
export type CartObservationMode = CartMutationMeasurement['owner'];

type Mode = { readonly mode: CartObservationMode };
export type CartInteraction =
  | {
      readonly name: 'CART_VIEWED';
      readonly data: Mode & { readonly surface: CartObservationSurface };
    }
  | {
      readonly name: 'CART_COMMAND_INITIATED';
      readonly data: Mode & { readonly command: CartObservationCommand };
    }
  | {
      readonly name: 'CART_COMMAND_REJECTED';
      readonly data: Mode & {
        readonly command: CartObservationCommand;
        readonly reason: CartRejectionReason;
      };
    }
  | { readonly name: 'CART_RECOVERY_VIEWED'; readonly data: Mode };

export type CartObservationDto = CartInteraction & {
  readonly schemaVersion: 1;
  readonly origin: 'BROWSER';
  readonly eventId: string;
  readonly occurredAt: string;
  readonly consent: CommerceConsentStateDto;
};

export interface CartActivityTotals {
  readonly mutations: string;
  readonly distinctCarts: string;
}

export interface CartActivityBreakdown extends CartActivityTotals {
  readonly operation: CartMutationOperation;
  readonly owner: CartMutationMeasurement['owner'];
  readonly wishlistAction: CartMutationMeasurement['wishlistAction'];
  readonly currency: string;
  readonly netUnitChange: string;
}

export const cartAnalyticsTimezone = 'Asia/Dhaka';
export const cartAnalyticsMaxDays = 366;

export interface CartAnalyticsQueryDto {
  readonly from: string;
  readonly to: string;
  readonly currency?: string;
}

export interface CartAnalyticsDayDto {
  readonly day: string;
  readonly count: string;
}

export interface CartAnalyticsDto {
  readonly generatedAt: string;
  readonly committed: CartActivityTotals & {
    readonly breakdown: readonly CartActivityBreakdown[];
    readonly trend: readonly CartAnalyticsDayDto[];
    readonly currencies: readonly string[];
    readonly netUnitChange: string;
    readonly firstRecordedAt: string | null;
    readonly lastRecordedAt: string | null;
    readonly values: readonly {
      readonly currency: string;
      readonly averageGross: string;
      readonly averageNet: string;
    }[];
    readonly pending: string;
    readonly failed: string;
  };
  readonly observations: {
    readonly counts: readonly {
      readonly name: CartInteractionName;
      readonly count: string;
    }[];
    readonly viewsTrend: readonly CartAnalyticsDayDto[];
    readonly firstRecordedAt: string | null;
    readonly lastRecordedAt: string | null;
  };
}
