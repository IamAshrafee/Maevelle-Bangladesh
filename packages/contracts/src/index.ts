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

export interface CatalogProductUpdateDto {
  readonly title?: string;
  readonly handle?: string;
  readonly description?: string | null;
  readonly productTypeId?: string;
}

export interface CatalogProductCreateDto {
  readonly productTypeId: string;
  readonly title: string;
  readonly handle: string;
  readonly description?: string;
  readonly categoryIds?: readonly string[];
  readonly primaryCategoryId?: string;
  readonly tagIds?: readonly string[];
  readonly occasionIds?: readonly string[];
  readonly collectionIds?: readonly string[];
}

export interface CatalogColorDto {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly hexValue: string | null;
  readonly status: 'ACTIVE' | 'ARCHIVED';
  readonly version: number;
}

export interface CatalogProductMediaDto {
  readonly id: string;
  readonly assetId: string;
  readonly variantId: string | null;
  readonly optionValueId: string | null;
  readonly role: 'GALLERY' | 'THUMBNAIL' | 'COLOR_GALLERY' | 'SIZE_DIAGRAM';
  readonly isPrimary: boolean;
  readonly position: number;
  readonly title: string | null;
  readonly altText: string | null;
  readonly visibility: 'PUBLIC' | 'PRIVATE';
  readonly width: number | null;
  readonly height: number | null;
}

export interface CatalogVariantCreateDto {
  readonly sku: string;
  readonly title?: string;
  readonly optionValueIds: readonly string[];
  readonly barcode?: string;
  readonly primaryColorId?: string;
  readonly associatedColorIds?: readonly string[];
  readonly weight?: { readonly value: string; readonly unit: 'G' | 'KG' | 'OZ' | 'LB' };
  readonly dimensions?: {
    readonly length: string;
    readonly width: string;
    readonly height: string;
    readonly unit: 'MM' | 'CM' | 'IN';
  };
}

export interface CatalogVariantUpdateDto {
  readonly version: number;
  readonly sku?: string;
  readonly title?: string | null;
  readonly optionValueIds?: readonly string[];
  readonly barcode?: string | null;
  readonly status?: 'ACTIVE' | 'ARCHIVED';
  readonly primaryColorId?: string | null;
  readonly associatedColorIds?: readonly string[];
  readonly weight?:
    | { readonly value: string; readonly unit: 'G' | 'KG' | 'OZ' | 'LB' }
    | null;
  readonly dimensions?:
    | {
        readonly length: string;
        readonly width: string;
        readonly height: string;
        readonly unit: 'MM' | 'CM' | 'IN';
      }
    | null;
}

export type CatalogReadinessState = 'READY' | 'BLOCKED' | 'PUBLISHED' | 'ATTENTION';

export interface CatalogReadinessCheckDto {
  readonly code:
    | 'IDENTITY'
    | 'ACTIVE_VARIANT'
    | 'REQUIRED_ATTRIBUTES'
    | 'OPTION_COMBINATIONS'
    | 'CURRENT_PRICE'
    | 'PUBLIC_MEDIA'
    | 'CATEGORY'
    | 'AVAILABLE_INVENTORY'
    | 'DESCRIPTION';
  readonly label: string;
  readonly state: 'PASS' | 'BLOCKER' | 'WARNING';
  readonly message: string;
  readonly actionHref?: string;
}

export interface CatalogProductReadinessDto {
  readonly state: CatalogReadinessState;
  readonly canPublish: boolean;
  readonly blockerCount: number;
  readonly warningCount: number;
  readonly checks: readonly CatalogReadinessCheckDto[];
}

export interface CatalogProductOperationalSignalsDto {
  readonly defaultCurrency: string;
  readonly activeVariantCount: number;
  readonly pricedVariantCount: number;
  readonly publicMediaCount: number;
  readonly availableVariantCount: number;
  readonly categoryCount: number;
}

export interface CatalogProductWorkItemDto extends CatalogProductSummaryDto {
  readonly readinessState: CatalogReadinessState;
  readonly blockerCount: number;
  readonly warningCount: number;
  readonly operationalSignals: CatalogProductOperationalSignalsDto;
  readonly primaryMediaId: string | null;
  readonly priceRange: {
    readonly minimum: string;
    readonly maximum: string;
    readonly currency: string;
  } | null;
  readonly availableQuantity: string;
}

export interface CatalogProductWorklistDto {
  readonly items: readonly CatalogProductWorkItemDto[];
  readonly pagination: {
    readonly page: number;
    readonly pageSize: number;
    readonly totalItems: number;
    readonly totalPages: number;
  };
  readonly summary: {
    readonly total: number;
    readonly published: number;
    readonly drafts: number;
    readonly archived: number;
  };
}

export interface CatalogCategoryChoiceDto {
  readonly id: string;
  readonly name: string;
  readonly handle: string;
  readonly path: string;
  readonly depth: number;
}

export type CatalogClassificationStatusDto = 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
export type CatalogCategoryStatusDto = CatalogClassificationStatusDto;

export interface CatalogCategoryDto {
  readonly id: string;
  readonly name: string;
  readonly handle: string;
  readonly status: CatalogCategoryStatusDto;
  readonly effectiveStatus: 'ACTIVE' | 'INACTIVE';
  readonly effectiveStatusReason: 'ACTIVE' | 'SELF_INACTIVE' | 'ANCESTOR_INACTIVE';
  readonly parentCategoryId: string | null;
  readonly path: string;
  readonly depth: number;
  readonly position: number;
  readonly productCount: number;
  readonly childCount: number;
  readonly version: number;
  readonly updatedAt: string;
}

export interface CatalogCategoryListDto {
  readonly items: readonly CatalogCategoryDto[];
  readonly pagination: PaginationDto;
  readonly summary: {
    readonly total: number;
    readonly active: number;
    readonly inactive: number;
    readonly archived: number;
  };
}

export type CatalogVocabularyKindDto = 'TAG' | 'OCCASION' | 'COLLECTION';

export interface CatalogVocabularyItemDto {
  readonly id: string;
  readonly kind: CatalogVocabularyKindDto;
  readonly name: string;
  readonly handle: string;
  readonly description: string | null;
  readonly status: CatalogClassificationStatusDto;
  readonly position: number;
  readonly productCount: number;
  readonly version: number;
  readonly updatedAt: string;
}

export interface CatalogVocabularyListDto {
  readonly items: readonly CatalogVocabularyItemDto[];
  readonly pagination: PaginationDto;
  readonly summary: {
    readonly total: number;
    readonly active: number;
    readonly inactive: number;
    readonly archived: number;
  };
}

export interface CatalogProductAttributeDto {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly valueType: 'TEXT' | 'INTEGER' | 'DECIMAL' | 'BOOLEAN' | 'DATE' | 'REFERENCE';
  readonly required: boolean;
  readonly filterable: boolean;
  readonly searchable: boolean;
  readonly value: string | boolean | null;
  readonly referenceOptions: readonly CatalogReferenceOptionDto[];
}

export type CatalogDefinitionStatusDto = 'ACTIVE' | 'ARCHIVED';
export type CatalogAttributeValueTypeDto =
  'TEXT' | 'INTEGER' | 'DECIMAL' | 'BOOLEAN' | 'DATE' | 'REFERENCE';
export type CatalogAttributeScopeDto = 'PRODUCT' | 'VARIANT';

export interface CatalogReferenceOptionDto {
  readonly id: string;
  readonly code: string;
  readonly label: string;
  readonly status: CatalogDefinitionStatusDto;
  readonly position: number;
  readonly version: number;
  readonly selectionCount: number;
}

export interface CatalogAttributeDefinitionDto {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly valueType: CatalogAttributeValueTypeDto;
  readonly scope: CatalogAttributeScopeDto;
  readonly status: CatalogDefinitionStatusDto;
  readonly required: boolean;
  readonly filterable: boolean;
  readonly searchable: boolean;
  readonly version: number;
  readonly valueCount: number;
  readonly referenceOptions: readonly CatalogReferenceOptionDto[];
}

export interface CatalogProductTypeDefinitionDto {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly status: CatalogDefinitionStatusDto;
  readonly version: number;
  readonly productCount: number;
  readonly attributes: readonly CatalogAttributeDefinitionDto[];
}

export interface CatalogProductInformationGroupDto {
  readonly id: string;
  readonly title: string;
  readonly items: readonly {
    readonly id: string;
    readonly label: string;
    readonly value: string;
  }[];
}

export interface CatalogProductFaqDto {
  readonly id: string;
  readonly question: string;
  readonly answer: string;
}

export interface CatalogProductContentUpdateDto {
  readonly informationGroups: readonly {
    readonly title: string;
    readonly items: readonly { readonly label: string; readonly value: string }[];
  }[];
  readonly faqs: readonly { readonly question: string; readonly answer: string }[];
  readonly seoTitle: string | null;
  readonly seoDescription: string | null;
}

export interface CatalogProductWorkspaceDto extends CatalogProductSummaryDto {
  readonly description: string | null;
  readonly productTypeId: string;
  readonly options: readonly {
    readonly id: string;
    readonly code: string;
    readonly name: string;
    readonly status: 'ACTIVE' | 'ARCHIVED';
    readonly position: number;
    readonly version: number;
    readonly values: readonly {
      readonly id: string;
      readonly code: string;
      readonly label: string;
      readonly status: 'ACTIVE' | 'ARCHIVED';
      readonly position: number;
      readonly version: number;
      readonly color: CatalogColorDto | null;
      readonly sizeDefinitionId: string | null;
    }[];
  }[];
  readonly variants: readonly {
    readonly id: string;
    readonly title: string | null;
    readonly sku: string;
    readonly barcode: string | null;
    readonly status: 'ACTIVE' | 'ARCHIVED';
    readonly version: number;
    readonly optionValueIds: readonly string[];
    readonly primaryColor: CatalogColorDto | null;
    readonly associatedColors: readonly CatalogColorDto[];
    readonly weight: { readonly value: string; readonly unit: string } | null;
    readonly dimensions: {
      readonly length: string;
      readonly width: string;
      readonly height: string;
      readonly unit: string;
    } | null;
    readonly currentPrice: {
      readonly amount: string;
      readonly compareAtAmount: string | null;
      readonly currency: string;
    } | null;
    readonly sellableQuantity: string;
    readonly media: readonly CatalogProductMediaDto[];
  }[];
  readonly media: readonly CatalogProductMediaDto[];
  readonly readiness: CatalogProductReadinessDto;
  readonly operationalSignals: CatalogProductOperationalSignalsDto;
  readonly organization: {
    readonly categoryIds: readonly string[];
    readonly primaryCategoryId: string | null;
    readonly tagIds: readonly string[];
    readonly occasionIds: readonly string[];
    readonly collectionIds: readonly string[];
    readonly attributes: readonly CatalogProductAttributeDto[];
  };
  readonly content: {
    readonly informationGroups: readonly CatalogProductInformationGroupDto[];
    readonly faqs: readonly CatalogProductFaqDto[];
    readonly seoTitle: string | null;
    readonly seoDescription: string | null;
  };
}

export interface CatalogVariantChoiceDto {
  readonly id: string;
  readonly sku: string;
  readonly productId: string;
  readonly productTitle: string;
  readonly status: string;
  readonly optionSummary: string;
}

export interface CatalogVariantMatrixDto {
  readonly product: {
    readonly id: string;
    readonly title: string;
    readonly version: number;
    readonly defaultCurrency: string;
  };
  readonly axes: readonly {
    readonly id: string;
    readonly code: string;
    readonly name: string;
    readonly status: 'ACTIVE' | 'ARCHIVED';
    readonly position: number;
    readonly version: number;
    readonly values: readonly {
      readonly id: string;
      readonly code: string;
      readonly label: string;
      readonly status: 'ACTIVE' | 'ARCHIVED';
      readonly position: number;
      readonly version: number;
    }[];
  }[];
  readonly rows: readonly {
    readonly combinationKey: string;
    readonly values: readonly {
      readonly axisId: string;
      readonly axisName: string;
      readonly valueId: string;
      readonly valueLabel: string;
    }[];
    readonly state: 'MISSING' | 'ACTIVE' | 'ARCHIVED';
    readonly variant: {
      readonly id: string;
      readonly sku: string;
      readonly status: 'ACTIVE' | 'ARCHIVED';
      readonly version: number;
      readonly barcode: string | null;
      readonly weight: { readonly value: string; readonly unit: string } | null;
      readonly dimensions: {
        readonly length: string;
        readonly width: string;
        readonly height: string;
        readonly unit: string;
      } | null;
      readonly currentPrice: {
        readonly amount: string;
        readonly compareAtAmount: string | null;
        readonly currency: string;
      } | null;
      readonly sellableQuantity: string;
      readonly variantMediaCount: number;
      readonly usesProductMedia: boolean;
      readonly setupIssues: readonly ('PRICE' | 'MEDIA' | 'INVENTORY')[];
    } | null;
  }[];
  readonly pagination: PaginationDto;
  readonly summary: {
    readonly potentialCombinations: number;
    readonly activeVariants: number;
    readonly archivedVariants: number;
    readonly missingCombinations: number;
    readonly incompleteVariants: number;
  };
  readonly incompleteVariants: readonly {
    readonly id: string;
    readonly sku: string;
    readonly status: 'ACTIVE' | 'ARCHIVED';
    readonly reasons: readonly ('MISSING_AXIS' | 'ARCHIVED_AXIS' | 'ARCHIVED_VALUE')[];
  }[];
}

export interface StorefrontProductDto {
  readonly id: string;
  readonly handle: string;
  readonly title: string;
  readonly description: string | null;
  readonly seoTitle: string | null;
  readonly seoDescription: string | null;
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
    optionValueId: string | null;
    role: string;
    altText: string | null;
    isPrimary: boolean;
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

export interface PaginatedDto<T> {
  readonly items: readonly T[];
  readonly nextCursor?: string | null;
  readonly totalCount?: number;
}

export interface InventoryStatsDto {
  readonly totalOnHand: string;
  readonly totalAvailable: string;
  readonly totalReserved: string;
  readonly totalDamaged: string;
  readonly lowStockCount: number;
  readonly outOfStockCount: number;
}

export interface InventoryItemDetailDto {
  readonly id: string;
  readonly variantId: string;
  readonly sku: string;
  readonly productTitle: string;
  readonly optionSummary?: string;
  readonly trackingMode: 'STANDARD' | 'LOT' | 'SERIAL';
  readonly unitCode: string;
  readonly balances: readonly InventoryBalanceDto[];
  readonly recentHistory: readonly InventoryHistoryDto[];
  readonly activeReservations: readonly InventoryReservationDto[];
}

export interface WarehouseLocationDetailDto extends WarehouseLocationDto {
  readonly address?: Record<string, unknown>;
  readonly inventorySummary: {
    readonly totalOnHand: string;
    readonly totalAvailable: string;
    readonly totalReserved: string;
    readonly totalDamaged: string;
    readonly totalIncoming: string;
    readonly lowStockSkus: number;
  };
}

export interface WarehouseTransferDto {
  readonly id: string;
  readonly transferNumber: string;
  readonly sourceLocationId: string;
  readonly sourceLocationName: string;
  readonly destinationLocationId: string;
  readonly destinationLocationName: string;
  readonly status: 'DRAFT' | 'READY' | 'IN_TRANSIT' | 'PARTIALLY_RECEIVED' | 'RECEIVED' | 'CANCELLED';
  readonly version: number;
  readonly totalRequested: string;
  readonly totalDispatched: string;
  readonly totalReceived: string;
  readonly lineCount: number;
  readonly createdAt: string;
  readonly dispatchedAt?: string;
  readonly completedAt?: string;
}

export interface WarehouseTransferDetailDto extends WarehouseTransferDto {
  readonly notes?: string;
  readonly createdByActorId?: string;
  readonly approvedAt?: string;
  readonly lines: readonly WarehouseTransferLineDto[];
}

export interface WarehouseTransferLineDto {
  readonly id: string;
  readonly inventoryItemId: string;
  readonly variantId: string;
  readonly sku: string;
  readonly productTitle: string;
  readonly requestedQuantity: string;
  readonly dispatchedQuantity: string;
  readonly receivedQuantity: string;
  readonly cancelledQuantity: string;
}

export interface StocktakeSessionDto {
  readonly id: string;
  readonly stocktakeNumber: string;
  readonly locationId: string;
  readonly locationName: string;
  readonly status: 'DRAFT' | 'COUNTING' | 'REVIEW' | 'POSTED' | 'CANCELLED';
  readonly snapshotAt: string;
  readonly postedAt?: string;
  readonly version: number;
  readonly totalLines: number;
  readonly countedLines: number;
}

export interface StocktakeDetailDto extends StocktakeSessionDto {
  readonly createdByActorId?: string;
  readonly postedInventoryTransactionId?: string;
  readonly lines: readonly StocktakeLineDto[];
}

export interface StocktakeLineDto {
  readonly id: string;
  readonly inventoryItemId: string;
  readonly variantId: string;
  readonly sku: string;
  readonly productTitle: string;
  readonly expectedQuantityAtSnapshot: string;
  readonly countedQuantity?: string | null;
  readonly movementsAfterSnapshot: string;
  readonly finalExpectedQuantity?: string | null;
  readonly varianceQuantity?: string | null;
  readonly status: 'PENDING' | 'COUNTED' | 'POSTED';
}

export interface InventoryReservationDto {
  readonly id: string;
  readonly inventoryItemId: string;
  readonly variantId: string;
  readonly sku: string;
  readonly productTitle: string;
  readonly locationId: string;
  readonly locationName: string;
  readonly quantity: string;
  readonly status: 'ACTIVE' | 'CONSUMED' | 'RELEASED' | 'EXPIRED';
  readonly sourceType: string;
  readonly sourceReference: string;
  readonly expiresAt?: string;
  readonly createdAt: string;
}

export type SupplierStatusDto = 'ACTIVE' | 'INACTIVE' | 'BLOCKED' | 'ARCHIVED';
export type SupplierTypeDto =
  'MANUFACTURER' | 'WHOLESALER' | 'DISTRIBUTOR' | 'AGENT' | 'LOCAL_VENDOR' | 'OTHER';

export interface SupplierDto {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly status: SupplierStatusDto;
  readonly supplierType: SupplierTypeDto;
  readonly countryCode?: string;
  readonly preferredCurrencyCode?: 'BDT' | 'CNY' | 'USD';
  readonly paymentTerms?: string;
  readonly leadTimeDays?: number;
  readonly websiteUrl?: string;
  readonly contactName?: string;
  readonly contactEmail?: string;
  readonly contactPhone?: string;
  readonly notes?: string;
  readonly version: number;
}

export interface PurchaseDto {
  readonly id: string;
  readonly purchaseNumber: string;
  readonly supplierId: string;
  readonly supplierName: string;
  readonly currencyCode: 'BDT' | 'CNY' | 'USD';
  readonly status: 'DRAFT' | 'PLACED' | 'CANCELLED';
  readonly supplierReference?: string;
  readonly orderDate: string;
  readonly expectedDate?: string;
  readonly destinationLocationId?: string;
  readonly destinationLocationName?: string;
  readonly notes?: string;
  readonly createdAt: string;
  readonly totalAmount: string;
  readonly version: number;
  readonly lines: readonly {
    readonly id: string;
    readonly variantId: string;
    readonly sku: string;
    readonly productTitle: string;
    readonly quantity: string;
    readonly unitPrice: string;
    readonly allocatedQuantity: string;
    readonly receivedQuantity: string;
  }[];
}

export interface InboundShipmentDto {
  readonly id: string;
  readonly shipmentNumber: string;
  readonly receivingLocationId: string;
  readonly receivingLocationName: string;
  readonly transportMode: string;
  readonly originText?: string;
  readonly trackingReference?: string;
  readonly expectedArrivalDate?: string;
  readonly arrivedAt?: string;
  readonly createdAt: string;
  readonly status: 'PLANNED' | 'IN_TRANSIT' | 'ARRIVED' | 'CANCELLED';
  readonly receivingStatus: 'NOT_RECEIVED' | 'PARTIALLY_RECEIVED' | 'RECEIVED';
  readonly version: number;
  readonly allocations: readonly {
    readonly id: string;
    readonly purchaseLineId: string;
    readonly purchaseNumber: string;
    readonly supplierName: string;
    readonly variantId: string;
    readonly sku: string;
    readonly productTitle: string;
    readonly allocatedQuantity: string;
    readonly receivedQuantity: string;
  }[];
}

export interface InboundReceiptDto {
  readonly id: string;
  readonly receiptNumber: string;
  readonly shipmentId: string;
  readonly locationId: string;
  readonly inventoryTransactionId: string;
  readonly status: 'POSTED';
  readonly packingSlipReference?: string;
  readonly notes?: string;
  readonly postedAt: string;
  readonly lines: readonly {
    readonly id: string;
    readonly shipmentAllocationId: string;
    readonly variantId: string;
    readonly condition: 'SELLABLE' | 'DAMAGED' | 'QUARANTINE' | 'INSPECTION';
    readonly quantity: string;
  }[];
}

export interface SupplyOverviewDto {
  readonly activeSuppliers: number;
  readonly draftPurchases: number;
  readonly openPurchases: number;
  readonly plannedShipments: number;
  readonly inTransitShipments: number;
  readonly awaitingReceiptShipments: number;
  readonly receiptsToday: number;
  readonly overdueShipments: number;
}

export interface PaginationDto {
  readonly page: number;
  readonly pageSize: number;
  readonly totalItems: number;
  readonly totalPages: number;
}
