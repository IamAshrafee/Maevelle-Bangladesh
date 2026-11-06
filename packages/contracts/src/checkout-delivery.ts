/** Purchase contact only. Saving an account address always requires a separate explicit command. */
export interface CheckoutDeliveryInput {
  readonly recipientName: string;
  readonly mobile: string;
  readonly geographyNodeId: string;
  readonly addressLine1: string;
  readonly addressLine2?: string | null;
  readonly instructions?: string | null;
}
export interface CheckoutDeliverySnapshot extends CheckoutDeliveryInput {
  readonly countryCode: 'BD';
}
export interface CheckoutDeliveryEligibilityDto {
  readonly status: 'ELIGIBLE' | 'UNSUPPORTED_AREA' | 'DELIVERY_UNAVAILABLE';
  readonly configurationRevision: string;
  /** Informational authoritative tariff, never a final Checkout quote. */
  readonly tariff: null | {
    readonly ruleId: string;
    readonly revision: string;
    readonly amount: string;
    readonly currency: string;
    readonly final: false;
  };
  readonly courierCompatibility: 'NOT_EVALUATED';
}
export interface CheckoutDeliveryStateDto {
  readonly draftId: string;
  readonly draftStatus: 'ACTIVE' | 'ABANDONED' | 'EXPIRED' | 'COMMITTED';
  readonly expiresAt: string;
  readonly revision: string;
  readonly delivery: CheckoutDeliverySnapshot | null;
  readonly savedAddress: null | {
    readonly id: string;
    readonly selectedRevision: string;
    readonly status: 'CURRENT' | 'CHANGED' | 'REMOVED';
  };
  readonly eligibility: CheckoutDeliveryEligibilityDto | null;
  readonly configurationChanged: boolean;
  readonly reviewRequired: boolean;
  readonly quoteAvailable: false;
  readonly purchaseAvailable: false;
}
export type UpdateCheckoutDeliveryDto = { readonly revision: string } & (
  | { readonly delivery: CheckoutDeliveryInput }
  | { readonly savedAddressId: string; readonly savedAddressRevision: string }
  | { readonly action: 'REVALIDATE' }
);
export interface ShopperAddressInput extends CheckoutDeliveryInput {
  readonly label?: string | null;
  readonly isDefault?: boolean;
}
export interface ShopperAddressDto {
  readonly id: string;
  readonly revision: string;
  readonly recipientName: string;
  readonly mobile: string | null;
  readonly countryCode: string;
  readonly geographyNodeId: string | null;
  readonly addressLine1: string;
  readonly addressLine2: string | null;
  readonly instructions: string | null;
  readonly label: string | null;
  readonly isDefault: boolean;
}
export interface CheckoutAreaPageDto {
  readonly items: readonly {
    readonly id: string;
    readonly name: string;
    readonly localName: string | null;
    readonly nodeType: string;
    readonly parentName: string | null;
  }[];
  readonly nextOffset: number | null;
}
