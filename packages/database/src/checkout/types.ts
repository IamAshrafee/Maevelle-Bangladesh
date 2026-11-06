import type { ShopperPrincipal } from '../shopper.js';

export class CheckoutError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
export type CheckoutAuthority =
  | {
      readonly kind: 'GUEST';
      readonly organizationId: string;
      readonly sessionId: string;
      readonly token: string;
    }
  | ({ readonly kind: 'ACCOUNT'; readonly sessionKeyHash: string } & ShopperPrincipal);
export interface CheckoutContext {
  readonly organizationId: string;
  readonly currency: string;
}
export interface DraftRow {
  id: string;
  organization_id: string;
  guest_session_id: string | null;
  owner_account_id: string | null;
  source_kind: 'CART' | 'BUY_NOW';
  source_cart_id: string | null;
  source_revision: string | null;
  revision: string;
  status: 'ACTIVE' | 'ABANDONED' | 'EXPIRED' | 'COMMITTED';
  current_quote_id: string | null;
  expires_at: Date;
  currency_code: string;
  source_review_required: boolean;
}
