import type {
  CartMergeGuestContextDto,
  CartMergePreviewDto,
  CartMergeSelectionDto,
} from '@maevelle/contracts';
import { requestCart } from './api';

const base = '/api/storefront/v1/carts/account/merge';

export function listMergeGuests(partition: string, signal: AbortSignal) {
  return requestCart<readonly CartMergeGuestContextDto[]>(base + '/guests', {
    cache: 'no-store',
    signal,
    headers: { 'x-shopper-partition': partition },
  });
}

export function previewMerge(
  partition: string,
  selection: CartMergeSelectionDto,
  signal: AbortSignal,
) {
  return requestCart<CartMergePreviewDto>(base + '/preview', {
    method: 'POST',
    cache: 'no-store',
    signal,
    headers: { 'content-type': 'application/json', 'x-shopper-partition': partition },
    body: JSON.stringify(selection),
  });
}
