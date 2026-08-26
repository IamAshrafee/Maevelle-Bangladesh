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
  readonly productTypeName?: string;
  readonly variantCount?: number;
  readonly skuPreview?: string | null;
  readonly updatedAt?: string;
}

export interface CatalogProductWorkspaceDto extends CatalogProductSummaryDto {
  readonly description: string | null;
  readonly productTypeId: string;
  readonly options: readonly {
    readonly id: string;
    readonly code: string;
    readonly name: string;
    readonly values: readonly {
      readonly id: string;
      readonly code: string;
      readonly label: string;
    }[];
  }[];
  readonly variants: readonly {
    readonly id: string;
    readonly sku: string;
    readonly status: string;
    readonly optionValueIds: readonly string[];
  }[];
}

export interface CatalogVariantChoiceDto {
  readonly id: string;
  readonly sku: string;
  readonly productId: string;
  readonly productTitle: string;
  readonly status: string;
  readonly optionSummary: string;
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
  readonly variants: readonly {
    id: string;
    sku: string;
    optionValueIds: readonly string[];
    price?: { amount: string; compareAtAmount: string | null; currency: string };
    available: boolean;
  }[];
  readonly media: readonly {
    id: string;
    variantId: string | null;
    role: string;
    altText: string | null;
  }[];
  readonly details: readonly { group: string; label: string; value: string }[];
  readonly faqs: readonly { question: string; answer: string }[];
}

export interface StorefrontContextDto {
  readonly organizationId: string;
  readonly storeName: string;
  readonly currency: string;
  readonly locale: string;
  readonly announcement?: string;
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
