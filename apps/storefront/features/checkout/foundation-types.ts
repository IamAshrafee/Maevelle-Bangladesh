import { EMPTY_QUOTE, type QuoteProjection } from './quote-types';
import { EMPTY_DELIVERY, type DeliveryProjection } from './delivery-types';
import { EMPTY_PLACEMENT, type PlacementProjection } from './placement-types';
import type {
  CheckoutDraftDto,
  CheckoutSourceDto,
  UpdateCheckoutDraftDto,
} from '@maevelle/contracts';

export type ReviewOwner =
  { kind: 'GUEST'; context: string } | { kind: 'ACCOUNT'; partition: string };
export type CatalogReferences = Readonly<Record<string, string>>;
export interface ReviewReference {
  partition: string;
  context?: string;
  id?: string;
  revision?: string;
  placementAttempted?: boolean;
  handles: CatalogReferences;
  savedAt: number;
}
export type ReviewIntent = {
  key: string;
  owner: ReviewOwner;
  handles: CatalogReferences;
  createdAt: number;
} & (
  | { kind: 'create'; source: CheckoutSourceDto }
  | { kind: 'update'; id: string; change: UpdateCheckoutDraftDto }
  | { kind: 'adopt'; id: string; revision: string; guestContext: string }
);
export interface ReviewIssue {
  message: string;
  retryable: boolean;
  retryAt: number;
  code: string;
}
export interface ReviewSnapshot {
  suspended: boolean;
  quote: QuoteProjection;
  placement: PlacementProjection;
  deliveryEditing: boolean;
  delivery: DeliveryProjection;
  phase: 'idle' | 'checking' | 'ready' | 'pending' | 'error';
  partition: string | null;
  draft: CheckoutDraftDto | null;
  pending: ReviewIntent | null;
  guestCandidate: ReviewReference | null;
  issue: ReviewIssue | null;
  persisted: boolean;
  handles: CatalogReferences;
}
export const EMPTY_REVIEW: ReviewSnapshot = Object.freeze({
  suspended: false,
  quote: EMPTY_QUOTE,
  placement: EMPTY_PLACEMENT,
  deliveryEditing: false,
  delivery: EMPTY_DELIVERY,
  phase: 'idle',
  partition: null,
  draft: null,
  pending: null,
  guestCandidate: null,
  issue: null,
  persisted: true,
  handles: {},
});
