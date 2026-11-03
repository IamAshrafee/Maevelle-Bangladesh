export type { GuestCartViewDto as CartView } from '@maevelle/contracts';
export interface GuestMutationScope {
  readonly token: string;
  readonly expectedVersion: number;
  readonly idempotencyKey?: string;
  readonly organizationId?: string;
  readonly currency?: string;
  readonly ownerContext?: string;
}
