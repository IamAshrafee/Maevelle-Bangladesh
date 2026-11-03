import type { AccountCartViewDto, GuestCartViewDto } from '@maevelle/contracts';
import type { ShopperPrincipal } from '../shopper.js';

export type CartView = GuestCartViewDto;
export type OwnedCartView = AccountCartViewDto | GuestCartViewDto;

export interface AccountCartAuthority extends ShopperPrincipal {
  readonly currency: string;
}

export interface AccountMutationScope {
  readonly account: AccountCartAuthority;
  readonly expectedVersion: number;
  readonly ownerContext: string;
  readonly idempotencyKey: string;
}

export type CartMutationScope = GuestMutationScope | AccountMutationScope;
export type CartMutationView<Scope extends CartMutationScope> = Scope extends AccountMutationScope
  ? AccountCartViewDto
  : GuestCartViewDto;
export interface GuestMutationScope {
  readonly token: string;
  readonly expectedVersion: number;
  readonly idempotencyKey?: string;
  readonly organizationId?: string;
  readonly currency?: string;
  readonly ownerContext?: string;
}
