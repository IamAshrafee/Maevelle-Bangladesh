import type { CheckoutDeliveryStateDto, ShopperAddressDto } from '@maevelle/contracts';
import type { ReviewIssue, ReviewOwner } from './foundation-types';

/** Private bodies never enter the foundation journal or browser storage. */
export interface PrivateDeliveryIntent {
  readonly key: string;
  readonly owner: ReviewOwner;
  readonly draftId: string;
  readonly path: string;
  readonly method: 'PUT' | 'POST' | 'DELETE';
  readonly body: string;
  readonly kind: 'delivery' | 'address';
}
export interface DeliveryProjection {
  readonly phase: 'idle' | 'loading' | 'ready' | 'saving' | 'unknown' | 'conflict' | 'error';
  readonly confirmed: CheckoutDeliveryStateDto | null;
  readonly addresses: readonly ShopperAddressDto[];
  readonly nextOffset: number | null;
  readonly addressesLoaded: boolean;
  readonly pending: PrivateDeliveryIntent | null;
  readonly issue: ReviewIssue | null;
  readonly notice: string;
  readonly conflictReady: boolean;
  readonly addressOutcomeKey: string | null;
}
export const EMPTY_DELIVERY: DeliveryProjection = Object.freeze({
  phase: 'idle',
  confirmed: null,
  addresses: [],
  nextOffset: null,
  addressesLoaded: false,
  pending: null,
  issue: null,
  notice: '',
  conflictReady: false,
  addressOutcomeKey: null,
});
