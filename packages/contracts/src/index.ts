/** Explicit transport DTOs shared by API clients; domain entities stay private to their owners. */
export interface ApiEnvelope<T> {
  readonly data: T;
}

export interface CatalogProductSummaryDto {
  readonly id: string;
  readonly handle: string;
  readonly title: string;
  readonly status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
  readonly publicationStatus: 'UNPUBLISHED' | 'PUBLISHED';
  readonly version: number;
}

export interface StorefrontProductDto {
  readonly id: string;
  readonly handle: string;
  readonly title: string;
  readonly description: string | null;
  readonly options: readonly {
    id: string;
    code: string;
    name: string;
    values: readonly { id: string; code: string; label: string; colorHex?: string }[];
  }[];
  readonly variants: readonly { id: string; sku: string; optionValueIds: readonly string[] }[];
  readonly details: readonly { group: string; label: string; value: string }[];
  readonly faqs: readonly { question: string; answer: string }[];
}

export interface PublicSizeGuideDto {
  readonly name: string;
  readonly instructions: string | null;
  readonly rows: readonly {
    label: string;
    measurements: readonly {
      name: string;
      exact?: string;
      min?: string;
      max?: string;
      unit: string;
      approximate: boolean;
    }[];
  }[];
}

export interface ApiErrorDto {
  readonly error: string | { code: string; message: string };
}

/** Decimal quantities remain strings across HTTP so JavaScript never becomes inventory authority. */
export interface InventoryBalanceDto {
  readonly inventoryItemId: string;
  readonly variantId: string;
  readonly sku: string;
  readonly productTitle: string;
  readonly locationId: string;
  readonly locationName: string;
  readonly condition: 'SELLABLE' | 'DAMAGED' | 'QUARANTINE' | 'INSPECTION';
  readonly onHand: string;
  readonly reserved: string;
  readonly availableToSell: string;
}

export interface InventoryHistoryDto {
  readonly id: string;
  readonly occurredAt: string;
  readonly transactionType: string;
  readonly sku: string;
  readonly locationName: string;
  readonly condition: 'SELLABLE' | 'DAMAGED' | 'QUARANTINE' | 'INSPECTION';
  readonly quantityDelta: string;
  readonly reasonCode: string | null;
}

export interface WarehouseLocationDto {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly locationType: string;
  readonly status: 'DRAFT' | 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
  readonly capabilities: readonly string[];
  readonly version: number;
}
