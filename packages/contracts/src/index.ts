/** Explicit transport DTOs shared by API clients; domain entities stay private to their owners. */
export interface ApiEnvelope<T> {
  readonly data: T;
}

export type AssetStatusDto =
  'ACTIVE' | 'IN_STORAGE' | 'UNDER_REPAIR' | 'DAMAGED' | 'LOST' | 'SOLD' | 'DISPOSED';
export type AssetConditionDto = 'GOOD' | 'FAIR' | 'NEEDS_REPAIR' | 'DAMAGED';
export type AssetAcquisitionSourceDto = 'EXISTING' | 'EXPENSE' | 'PURCHASE' | 'GIFT';

export interface AssetCategoryDto {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly status: 'ACTIVE' | 'ARCHIVED';
  readonly assetCount: number;
  readonly version: number;
}

export interface AssetListItemDto {
  readonly id: string;
  readonly assetCode: string;
  readonly name: string;
  readonly categoryId: string | null;
  readonly categoryName: string | null;
  readonly brand: string | null;
  readonly model: string | null;
  readonly serialNumber: string | null;
  readonly status: AssetStatusDto;
  readonly condition: AssetConditionDto;
  readonly locationId: string | null;
  readonly locationName: string | null;
  readonly customLocation: string | null;
  readonly custodianMembershipId: string | null;
  readonly custodianName: string | null;
  readonly acquisitionDate: string;
  readonly acquisitionCost: string | null;
  readonly currencyCode: string;
  readonly updatedAt: string;
  readonly version: number;
}

export interface AssetFinancialProvenanceDto {
  readonly acquisitionSource: AssetAcquisitionSourceDto;
  readonly expense: {
    readonly id: string;
    readonly number: string;
    readonly amount: string;
    readonly status: string;
  } | null;
  readonly purchase: {
    readonly id: string;
    readonly number: string;
    readonly supplierName: string;
    readonly status: string;
  } | null;
  readonly purchaseLine: {
    readonly id: string;
    readonly title: string;
    readonly sku: string;
  } | null;
  readonly payments: readonly {
    readonly id: string;
    readonly amount: string;
    readonly source: 'BUSINESS_ACCOUNT' | 'OWNER_CAPITAL' | 'REVERSAL';
    readonly accountId: string | null;
    readonly accountName: string | null;
    readonly contributorId: string | null;
    readonly contributorName: string | null;
    readonly paidAt: string;
  }[];
  readonly sale: {
    readonly transactionId: string;
    readonly amount: string;
    readonly currencyCode: string;
    readonly accountId: string;
    readonly accountName: string;
    readonly occurredAt: string;
  } | null;
}

export interface AssetMaintenanceDto {
  readonly id: string;
  readonly type: 'INSPECTION' | 'SERVICE' | 'REPAIR' | 'PART_REPLACEMENT';
  readonly occurredOn: string;
  readonly issue: string | null;
  readonly workPerformed: string;
  readonly serviceProvider: string | null;
  readonly expenseId: string | null;
  readonly expenseNumber: string | null;
  readonly expenseAmount: string | null;
  readonly nextServiceOn: string | null;
  readonly notes: string | null;
  readonly createdAt: string;
  readonly status: 'ACTIVE' | 'VOIDED';
  readonly voidReason: string | null;
}

export interface AssetMediaDto {
  readonly id: string;
  readonly mediaAssetId: string;
  readonly role:
    | 'PHOTO'
    | 'PURCHASE_RECEIPT'
    | 'INVOICE'
    | 'WARRANTY'
    | 'REPAIR_RECEIPT'
    | 'SERIAL_PHOTO'
    | 'OTHER';
  readonly label: string | null;
  readonly filename: string;
  readonly assetType: 'IMAGE' | 'DOCUMENT';
  readonly createdAt: string;
}

export interface AssetEventDto {
  readonly id: string;
  readonly type: string;
  readonly summary: string;
  readonly beforeState: Record<string, unknown> | null;
  readonly afterState: Record<string, unknown> | null;
  readonly occurredAt: string;
  readonly actorName: string | null;
}

export interface AssetDetailDto extends AssetListItemDto {
  readonly description: string | null;
  readonly acquisitionSource: AssetAcquisitionSourceDto;
  readonly warrantyExpiresOn: string | null;
  readonly notes: string | null;
  readonly createdAt: string;
  readonly financial: AssetFinancialProvenanceDto;
  readonly maintenance: readonly AssetMaintenanceDto[];
  readonly media: readonly AssetMediaDto[];
  readonly history: readonly AssetEventDto[];
}

export interface AssetSummaryDto {
  readonly total: number;
  readonly active: number;
  readonly inStorage: number;
  readonly underRepair: number;
  readonly attention: number;
  readonly disposed: number;
  readonly totalAcquisitionCost: string;
  readonly currencyCode: string;
}

export interface AssetOptionsDto {
  readonly categories: readonly AssetCategoryDto[];
  readonly locations: readonly {
    readonly id: string;
    readonly name: string;
    readonly code: string;
  }[];
  readonly custodians: readonly { readonly id: string; readonly name: string }[];
  readonly expenses: readonly {
    readonly id: string;
    readonly number: string;
    readonly description: string;
    readonly amount: string;
    readonly currencyCode: string;
    readonly paymentSource?: 'BUSINESS_ACCOUNT' | 'OWNER_CAPITAL' | null;
    readonly contributorName?: string | null;
  }[];
  readonly purchases: readonly {
    readonly id: string;
    readonly number: string;
    readonly supplierName: string;
    readonly currencyCode: string;
    readonly totalAmount?: string;
    readonly lines?: readonly {
      readonly id: string;
      readonly title: string;
      readonly sku: string;
      readonly cost: string;
    }[];
  }[];
  readonly accounts: readonly {
    readonly id: string;
    readonly name: string;
    readonly currencyCode: string;
  }[];
  readonly defaultCurrency: string;
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
  readonly shipping?: {
    readonly weight?: {
      readonly value: string;
      readonly unit: 'G' | 'KG' | 'OZ' | 'LB';
    } | null;
    readonly dimensions?: {
      readonly length: string;
      readonly width: string;
      readonly height: string;
      readonly unit: 'MM' | 'CM' | 'IN';
    } | null;
  } | null;
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
  readonly sizeSystemId?: string | null;
  readonly sizeGuideId?: string | null;
  readonly attributes?: readonly {
    readonly attributeDefinitionId: string;
    readonly value: string | boolean | null;
  }[];
  readonly shipping?: {
    readonly weight?: {
      readonly value: string;
      readonly unit: 'G' | 'KG' | 'OZ' | 'LB';
    } | null;
    readonly dimensions?: {
      readonly length: string;
      readonly width: string;
      readonly height: string;
      readonly unit: 'MM' | 'CM' | 'IN';
    } | null;
  } | null;
  readonly initialVariant?: {
    readonly sku: string;
    readonly barcode?: string | null;
    readonly priceAmount?: string;
    readonly compareAtAmount?: string | null;
    readonly currency?: string;
    readonly estimatedCostAmount?: string | null;
    readonly initialStock?: readonly {
      readonly locationId: string;
      readonly quantity: number;
    }[];
    readonly weight?: {
      readonly value: string;
      readonly unit: 'G' | 'KG' | 'OZ' | 'LB';
    } | null;
    readonly dimensions?: {
      readonly length: string;
      readonly width: string;
      readonly height: string;
      readonly unit: 'MM' | 'CM' | 'IN';
    } | null;
  };
  readonly options?: readonly {
    readonly clientRef?: string;
    readonly code?: string;
    readonly name: string;
    readonly position?: number;
    readonly isVisual?: boolean;
    readonly values: readonly {
      readonly clientRef?: string;
      readonly code?: string;
      readonly displayValue: string;
      readonly position?: number;
      readonly colorId?: string | null;
      readonly sizeDefinitionId?: string | null;
      readonly isPrimary?: boolean;
    }[];
  }[];
  readonly variants?: readonly {
    readonly clientRef?: string;
    readonly sku: string;
    readonly title?: string | null;
    readonly barcode?: string | null;
    readonly optionValueRefs?: readonly string[];
    readonly optionSelections?: readonly {
      readonly axisName: string;
      readonly valueDisplay: string;
    }[];
    readonly priceAmount?: string | null;
    readonly compareAtAmount?: string | null;
    readonly currency?: string;
    readonly estimatedCostAmount?: string | null;
    readonly initialStock?: readonly {
      readonly locationId: string;
      readonly quantity: number;
    }[];
    readonly weight?: {
      readonly value: string;
      readonly unit: 'G' | 'KG' | 'OZ' | 'LB';
    } | null;
    readonly dimensions?: {
      readonly length: string;
      readonly width: string;
      readonly height: string;
      readonly unit: 'MM' | 'CM' | 'IN';
    } | null;
    readonly primaryColorId?: string | null;
    readonly associatedColorIds?: readonly string[];
  }[];
  readonly media?: readonly {
    readonly assetId: string;
    readonly optionValueRef?: string | null;
    readonly variantRef?: string | null;
    readonly role: 'GALLERY' | 'THUMBNAIL' | 'COLOR_GALLERY' | 'SIZE_DIAGRAM';
    readonly altTextOverride?: string | null;
    readonly isPrimary?: boolean;
    readonly position?: number;
  }[];
  readonly seoTitle?: string | null;
  readonly seoDescription?: string | null;
}

export interface CatalogColorDto {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly hexValue: string | null;
  readonly status: 'ACTIVE' | 'ARCHIVED';
  readonly version: number;
  readonly usageCount?: number;
  readonly variantCount?: number;
  readonly createdAt?: string;
  readonly updatedAt?: string;
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
  readonly weight?: { readonly value: string; readonly unit: 'G' | 'KG' | 'OZ' | 'LB' } | null;
  readonly dimensions?: {
    readonly length: string;
    readonly width: string;
    readonly height: string;
    readonly unit: 'MM' | 'CM' | 'IN';
  } | null;
  readonly estimatedCostAmount?: string | null;
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

export type CatalogProductWorklistSort =
  'UPDATED_DESC' | 'UPDATED_ASC' | 'ATTENTION_FIRST' | 'TITLE_ASC';

export interface CatalogProductWorkItemDto extends CatalogProductSummaryDto {
  readonly readinessState: CatalogReadinessState;
  readonly blockerCount: number;
  readonly warningCount: number;
  /** The first canonical readiness issue, ordered by the Product publishing workflow. */
  readonly attention: CatalogReadinessCheckDto | null;
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
  readonly defaultSizeGuideId?: string | null;
  readonly defaultSizeGuideName?: string | null;
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
  readonly primaryCategoryId: string | null;
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
  readonly sizeSystemId: string | null;
  readonly sizeGuideId: string | null;
  readonly shipping: {
    readonly weight: { readonly value: string; readonly unit: string } | null;
    readonly dimensions: {
      readonly length: string;
      readonly width: string;
      readonly height: string;
      readonly unit: string;
    } | null;
  } | null;
  readonly options: readonly {
    readonly id: string;
    readonly code: string;
    readonly name: string;
    readonly isVisual: boolean;
    readonly status: 'ACTIVE' | 'ARCHIVED';
    readonly position: number;
    readonly version: number;
    readonly values: readonly {
      readonly id: string;
      readonly code: string;
      readonly label: string;
      readonly isPrimary: boolean;
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
    readonly shipping?: {
      readonly weight: { readonly value: string; readonly unit: string } | null;
      readonly dimensions: {
        readonly length: string;
        readonly width: string;
        readonly height: string;
        readonly unit: string;
      } | null;
    } | null;
    readonly estimatedCostAmount: string | null;
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
      readonly title: string | null;
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
    readonly reasons: readonly (
      'MISSING_AXIS' | 'ARCHIVED_AXIS' | 'ARCHIVED_VALUE' | 'SIGNATURE_MISMATCH'
    )[];
  }[];
}

export interface StorefrontProductDto {
  readonly id: string;
  readonly handle: string;
  readonly title: string;
  readonly description: string | null;
  readonly seoTitle: string | null;
  readonly seoDescription: string | null;
  readonly shipping?: {
    readonly weight: { readonly value: string; readonly unit: string } | null;
    readonly dimensions: {
      readonly length: string;
      readonly width: string;
      readonly height: string;
      readonly unit: string;
    } | null;
  } | null;
  readonly options: readonly {
    id: string;
    code: string;
    name: string;
    isVisual: boolean;
    values: readonly {
      id: string;
      code: string;
      label: string;
      colorHex?: string;
      isPrimary?: boolean;
    }[];
  }[];
  readonly variants: readonly {
    id: string;
    sku: string;
    optionValueIds: readonly string[];
    price?: { amount: string; compareAtAmount: string | null; currency: string };
    available: boolean;
    stockStatus?: 'AVAILABLE' | 'OUT_OF_STOCK' | 'UNAVAILABLE';
    shipping?: {
      readonly weight: { readonly value: string; readonly unit: string } | null;
      readonly dimensions: {
        readonly length: string;
        readonly width: string;
        readonly height: string;
        readonly unit: string;
      } | null;
    } | null;
  }[];
  readonly media: readonly {
    id: string;
    variantId: string | null;
    optionValueId: string | null;
    role: string;
    altText: string | null;
    isPrimary: boolean;
    width?: number | null;
    height?: number | null;
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

export type SizingLifecycleStatusDto = 'ACTIVE' | 'ARCHIVED';
export type SizingRevisionStatusDto = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
export type SizingSubjectTypeDto = 'BODY' | 'GARMENT' | 'PRODUCT';
export type SizingMeasurementUnitDto = 'cm' | 'inch' | 'kg';
export type SizingMappingStatusDto = 'MAPPED' | 'UNMAPPED' | 'ALL';

export interface PublicSizeGuideDto {
  readonly name: string;
  readonly instructions: string | null;
  readonly fitNotes: string | null;
  readonly rows: readonly {
    readonly label: string;
    readonly measurements: readonly {
      readonly name: string;
      readonly instructions: string | null;
      readonly exact?: string;
      readonly min?: string;
      readonly max?: string;
      readonly unit: string;
      readonly approximate: boolean;
    }[];
  }[];
}

export interface SizingDomainDto {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly subjectType: SizingSubjectTypeDto;
  readonly status: SizingLifecycleStatusDto;
}

export interface SizeSystemDto {
  readonly id: string;
  readonly sizingDomainId: string;
  readonly code: string;
  readonly name: string;
  readonly regionCode: string | null;
  readonly status: SizingLifecycleStatusDto;
}

export interface SizeDefinitionDto {
  readonly id: string;
  readonly sizeSystemId: string;
  readonly code: string;
  readonly label: string;
  readonly sortOrder: number;
  readonly status: SizingLifecycleStatusDto;
}

export interface MeasurementDefinitionDto {
  readonly id: string;
  readonly sizingDomainId: string;
  readonly code: string;
  readonly name: string;
  readonly description: string | null;
  readonly instructions: string | null;
  readonly subjectType: SizingSubjectTypeDto;
  readonly defaultUnit: SizingMeasurementUnitDto;
  readonly sortOrder: number;
  readonly status: SizingLifecycleStatusDto;
}

export interface SizeGuideSummaryDto {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly sizingDomainId: string;
  readonly sizingDomainName: string;
  readonly sizeSystemId: string | null;
  readonly sizeSystemName: string | null;
  readonly status: SizingLifecycleStatusDto;
  readonly hasPublishedRevision: boolean;
  readonly version: number;
  readonly productCount: number;
  readonly categoryCount: number;
  readonly updatedAt: string;
}

export interface SizeGuideListDto {
  readonly items: readonly SizeGuideSummaryDto[];
  readonly pagination: PaginationDto;
}

export interface SizeGuideMeasurementDto {
  readonly measurementDefinitionId: string;
  readonly measurementDefinitionName?: string;
  readonly exact: string | null;
  readonly min: string | null;
  readonly max: string | null;
  readonly unit: SizingMeasurementUnitDto;
  readonly approximate: boolean;
}

export interface SizeGuideRowDto {
  readonly id: string;
  readonly displayLabel: string;
  readonly position: number;
  readonly sizeDefinitionId: string | null;
  readonly sizeDefinitionLabel?: string | null;
  readonly measurements: readonly SizeGuideMeasurementDto[];
}

export interface SizeGuideRevisionDetailDto {
  readonly id: string;
  readonly revisionNumber: number;
  readonly status: SizingRevisionStatusDto;
  readonly version: number;
  readonly instructions: string | null;
  readonly fitNotes: string | null;
  readonly createdAt: string;
  readonly publishedAt: string | null;
  readonly rows: readonly SizeGuideRowDto[];
}

export interface SizeGuideDetailDto {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly sizingDomainId: string;
  readonly sizingDomainName: string;
  readonly sizeSystemId: string | null;
  readonly sizeSystemName: string | null;
  readonly status: SizingLifecycleStatusDto;
  readonly currentPublishedRevisionId: string | null;
  readonly version: number;
  readonly revisions: readonly SizeGuideRevisionDetailDto[];
  readonly products: readonly {
    readonly id: string;
    readonly title: string;
    readonly handle: string;
  }[];
  readonly categories: readonly {
    readonly id: string;
    readonly name: string;
    readonly handle: string;
  }[];
}

export interface ProductSizingDto {
  readonly productId: string;
  readonly productVersion: number | null;
  readonly configured: boolean;
  readonly sizeSystemId: string | null;
  readonly sizeSystemName: string | null;
  readonly sizeGuideId: string | null;
  readonly sizeGuideName: string | null;
  readonly sizeGuideStatus: SizingLifecycleStatusDto | null;
  readonly sizeGuideSystemId: string | null;
  readonly hasPublishedGuide: boolean;
  readonly configStatus: SizingLifecycleStatusDto | null;
}

export interface AdminSizingGuideDto {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly sizingDomainId: string;
  readonly sizeSystemId: string | null;
  readonly status: SizingLifecycleStatusDto;
  readonly currentPublishedRevisionId: string | null;
  readonly version: number;
  readonly revisions: readonly {
    readonly id: string;
    readonly revisionNumber: number;
    readonly status: SizingRevisionStatusDto;
    readonly version: number;
    readonly instructions: string | null;
    readonly fitNotes: string | null;
    readonly createdAt: string;
    readonly publishedAt: string | null;
    readonly rows: readonly {
      readonly id: string;
      readonly displayLabel: string;
      readonly position: number;
      readonly sizeDefinitionId: string | null;
      readonly measurements: readonly {
        readonly measurementDefinitionId: string;
        readonly exact: string | null;
        readonly min: string | null;
        readonly max: string | null;
        readonly unit: SizingMeasurementUnitDto;
        readonly approximate: boolean;
      }[];
    }[];
  }[];
}

export interface AdminSizingWorkspaceDto {
  readonly domains: readonly SizingDomainDto[];
  readonly systems: readonly SizeSystemDto[];
  readonly sizeDefinitions: readonly SizeDefinitionDto[];
  readonly measurementDefinitions: readonly MeasurementDefinitionDto[];
  readonly guides: readonly AdminSizingGuideDto[];
  readonly productConfigurations: readonly {
    readonly productId: string;
    readonly productTitle: string;
    readonly productVersion: number;
    readonly sizeSystemId: string;
    readonly sizeGuideId: string | null;
    readonly status: SizingLifecycleStatusDto;
  }[];
}

export interface SizingQualityChecksDto {
  readonly productsWithSizeAxisButNoSizingConfig: number;
  readonly productsWithConfigButNoPublishedGuide: number;
  readonly productsUsingArchivedGuide: number;
  readonly productConfigurationsWithSystemGuideMismatch: number;
  readonly publishedRevisionsWithEmptyRows: number;
  readonly publishedRowsWithoutMeasurements: number;
  readonly optionValuesInSizeAxisWithoutSizeDefinitionLink: number;
  readonly optionValuesMappedOutsideConfiguredSystem: number;
  readonly guideRowsWithSystemMismatch: number;
  readonly categoryDefaultsUsingUnavailableGuide: number;
  readonly activeDefinitionsUnderArchivedSystem: number;
  readonly activeMeasurementsUnderArchivedDomain: number;
}

export interface CategorySizeGuideDefaultDto {
  readonly categoryId: string;
  readonly categoryName: string;
  readonly categoryPath: string;
  readonly sizeGuideId: string | null;
  readonly sizeGuideName: string | null;
  readonly sizeGuideStatus: SizingLifecycleStatusDto | null;
  readonly hasPublishedGuide: boolean;
}

export interface CategorySizeGuideDefaultListDto {
  readonly items: readonly CategorySizeGuideDefaultDto[];
  readonly pagination: PaginationDto;
}

export interface SizeOptionValueMappingDto {
  readonly optionValueId: string;
  readonly optionValueLabel: string;
  readonly optionAxisId: string;
  readonly optionAxisName: string;
  readonly productTitle: string;
  readonly productId: string;
  readonly configuredSizeSystemId: string | null;
  readonly sizeDefinitionId: string | null;
  readonly sizeDefinitionLabel: string | null;
  readonly sizeDefinitionSystemId: string | null;
}

export interface SizeOptionValueMappingListDto {
  readonly items: readonly SizeOptionValueMappingDto[];
  readonly pagination: PaginationDto;
}

/* -------------------------------------------------------------------------- */
/*                        Sizing mutation transport DTOs                       */
/* -------------------------------------------------------------------------- */

export interface CreateSizingDomainDto {
  readonly code: string;
  readonly name: string;
  readonly subjectType: SizingSubjectTypeDto;
}

export interface UpdateSizingDomainDto {
  readonly name: string;
}

export interface CreateSizeSystemDto {
  readonly sizingDomainId: string;
  readonly code: string;
  readonly name: string;
  readonly regionCode?: string;
}

export interface UpdateSizeSystemDto {
  readonly name?: string;
  readonly regionCode?: string | null;
}

export interface CreateSizeDefinitionDto {
  readonly sizeSystemId: string;
  readonly code: string;
  readonly label: string;
  readonly sortOrder?: number;
}

export interface UpdateSizeDefinitionDto {
  readonly label?: string;
  readonly sortOrder?: number;
}

export interface CreateMeasurementDefinitionDto {
  readonly sizingDomainId: string;
  readonly code: string;
  readonly name: string;
  readonly description?: string;
  readonly instructions?: string;
  readonly sortOrder?: number;
  readonly subjectType: SizingSubjectTypeDto;
  readonly defaultUnit: SizingMeasurementUnitDto;
}

export interface UpdateMeasurementDefinitionDto {
  readonly name?: string;
  readonly description?: string | null;
  readonly instructions?: string | null;
  readonly sortOrder?: number;
  readonly defaultUnit?: SizingMeasurementUnitDto;
}

export interface CreateSizeGuideDto {
  readonly name: string;
  readonly description?: string;
  readonly sizingDomainId: string;
  readonly sizeSystemId?: string;
}

export interface UpdateSizeGuideDto {
  readonly expectedVersion: number;
  readonly name?: string;
  readonly description?: string | null;
  readonly sizeSystemId?: string | null;
}

export interface CreateSizeGuideRevisionDto {
  readonly sourceRevisionId?: string;
  readonly instructions?: string;
  readonly fitNotes?: string;
}

export interface UpdateSizeGuideRevisionMetaDto {
  readonly expectedVersion: number;
  readonly instructions?: string | null;
  readonly fitNotes?: string | null;
}

export interface CreateSizeGuideRowDto {
  readonly expectedVersion: number;
  readonly displayLabel: string;
  readonly position: number;
  readonly sizeDefinitionId?: string;
}

export interface UpdateSizeGuideRowDto {
  readonly expectedVersion: number;
  readonly displayLabel?: string;
  readonly position?: number;
  readonly sizeDefinitionId?: string | null;
}

export interface ReorderSizeGuideRowsDto {
  readonly expectedVersion: number;
  readonly rows: readonly {
    readonly rowId: string;
    readonly position: number;
  }[];
}

export type SetSizeGuideMeasurementDto =
  | {
      readonly expectedVersion: number;
      readonly unitCode: SizingMeasurementUnitDto;
      readonly exact: string;
      readonly isApproximate?: boolean;
    }
  | {
      readonly expectedVersion: number;
      readonly unitCode: SizingMeasurementUnitDto;
      readonly min: string;
      readonly max: string;
      readonly isApproximate?: boolean;
    };

export type SizeGuideMatrixChangeDto =
  | {
      readonly operation: 'SET';
      readonly rowId: string;
      readonly measurementDefinitionId: string;
      readonly unitCode: SizingMeasurementUnitDto;
      readonly exact: string;
      readonly isApproximate?: boolean;
    }
  | {
      readonly operation: 'SET';
      readonly rowId: string;
      readonly measurementDefinitionId: string;
      readonly unitCode: SizingMeasurementUnitDto;
      readonly min: string;
      readonly max: string;
      readonly isApproximate?: boolean;
    }
  | {
      readonly operation: 'CLEAR';
      readonly rowId: string;
      readonly measurementDefinitionId: string;
    };

export interface SetSizeGuideMeasurementsBulkDto {
  readonly expectedVersion: number;
  readonly changes: readonly SizeGuideMatrixChangeDto[];
}

export interface ApiErrorDto {
  readonly error: string | { code: string; message: string; details?: unknown };
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

export interface InventoryPositionDto {
  readonly inventoryItemId: string;
  readonly variantId: string;
  readonly productId: string;
  readonly sku: string;
  readonly productTitle: string;
  readonly optionSummary: string | null;
  readonly inventoryStatus: 'ACTIVE' | 'ARCHIVED';
  readonly variantStatus: 'ACTIVE' | 'ARCHIVED';
  readonly unitCode: string;
  readonly locationId: string;
  readonly locationCode: string;
  readonly locationName: string;
  readonly onHand: string;
  readonly sellable: string;
  readonly reserved: string;
  readonly availableToSell: string;
  readonly unavailable: string;
  readonly damaged: string;
  readonly quarantine: string;
  readonly inspection: string;
  readonly incomingTransfer: string;
  readonly outgoingTransfer: string;
  readonly incomingSupply: string;
  readonly activeReservationCount: number;
  readonly lastMovementAt: string | null;
}

/** Catalog-backed inventory identity used by stock operations before a SKU has any movement. */
export interface InventoryItemChoiceDto {
  readonly inventoryItemId: string;
  readonly variantId: string;
  readonly productId: string;
  readonly sku: string;
  readonly productTitle: string;
  readonly optionSummary: string;
  readonly inventoryStatus: 'ACTIVE' | 'ARCHIVED';
  readonly variantStatus: 'ACTIVE' | 'ARCHIVED';
}

export interface InventoryHistoryDto {
  readonly id: string;
  readonly transactionId: string;
  readonly inventoryItemId: string;
  readonly variantId: string;
  readonly productId: string;
  readonly occurredAt: string;
  readonly transactionType: string;
  readonly transactionNumber: string | null;
  readonly sku: string;
  readonly productTitle: string;
  readonly optionSummary: string | null;
  readonly locationId: string;
  readonly locationName: string;
  readonly condition: 'SELLABLE' | 'DAMAGED' | 'QUARANTINE' | 'INSPECTION';
  readonly quantityDelta: string;
  readonly reasonCode: string | null;
  readonly reasonText: string | null;
  readonly referenceType: string | null;
  readonly referenceId: string | null;
  readonly referenceNumber: string | null;
  readonly actorId: string | null;
  readonly actorDisplayName: string | null;
  readonly runningBalance: string;
}

export type LocationType =
  | 'WAREHOUSE'
  | 'SHOWROOM'
  | 'RETAIL_STORE'
  | 'FULFILLMENT_CENTER'
  | 'RETURN_CENTER'
  | 'THIRD_PARTY'
  | 'OTHER';

export type LocationCapability =
  | 'STOCK_HOLDING'
  | 'PURCHASE_RECEIVING'
  | 'TRANSFER_SEND'
  | 'TRANSFER_RECEIVE'
  | 'ORDER_FULFILLMENT'
  | 'RETURN_RECEIVING'
  | 'CUSTOMER_PICKUP'
  | 'INTERNAL_STORAGE';

export interface WarehouseLocationAddressDto {
  readonly fullAddress?: string;
  readonly city?: string;
  readonly postalCode?: string;
  readonly countryCode?: string;
}

export interface CreateWarehouseLocationInput {
  readonly code: string;
  readonly name: string;
  readonly locationType: LocationType;
  readonly capabilities: readonly LocationCapability[];
  readonly status?: 'ACTIVE' | 'DRAFT';
  readonly address?: WarehouseLocationAddressDto;
}

export interface WarehouseLocationDto {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly locationType: LocationType | string;
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
  readonly totalUnavailable: string;
  readonly totalDamaged: string;
  readonly lowStockCount: number;
  readonly outOfStockCount: number;
}

export interface InventoryItemDetailDto {
  readonly id: string;
  readonly variantId: string;
  readonly productId: string;
  readonly sku: string;
  readonly productTitle: string;
  readonly optionSummary?: string;
  readonly inventoryStatus: 'ACTIVE' | 'ARCHIVED';
  readonly variantStatus: 'ACTIVE' | 'ARCHIVED';
  readonly trackingMode: 'STANDARD' | 'LOT' | 'SERIAL';
  readonly unitCode: string;
  readonly summary: {
    readonly onHand: string;
    readonly sellable: string;
    readonly reserved: string;
    readonly availableToSell: string;
    readonly unavailable: string;
    readonly incomingTransfer: string;
    readonly outgoingTransfer: string;
    readonly incomingSupply: string;
  };
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
  readonly status:
    | 'DRAFT'
    | 'READY'
    | 'IN_TRANSIT'
    | 'PARTIALLY_RECEIVED'
    | 'RECEIVED'
    | 'CLOSED_WITH_DISCREPANCY'
    | 'CANCELLED';
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
  /** Quantity permanently resolved as missing/lost while this transfer was in transit. */
  readonly discrepancy?: WarehouseTransferDiscrepancyDto;
}

export interface WarehouseTransferDiscrepancyDto {
  readonly dispositionCode: 'MISSING' | 'LOST';
  readonly quantity: string;
  readonly reasonCode: string;
  readonly notes?: string;
  readonly recordedAt: string;
}

export interface StocktakeSessionDto {
  readonly id: string;
  readonly stocktakeNumber: string;
  readonly locationId: string;
  readonly locationName: string;
  readonly status: 'DRAFT' | 'COUNTING' | 'REVIEW' | 'POSTED' | 'CANCELLED';
  readonly snapshotAt: string;
  readonly postedAt: string | null;
  readonly version: number;
  readonly totalLines: number;
  readonly countedLines: number;
}

export interface StocktakeDetailDto extends StocktakeSessionDto {
  readonly createdByActorId: string | null;
  readonly postedInventoryTransactionId: string | null;
  readonly lines: readonly StocktakeLineDto[];
}

export interface StocktakeLineDto {
  readonly id: string;
  readonly inventoryItemId: string;
  readonly variantId: string;
  readonly sku: string;
  readonly productTitle: string;
  readonly optionSummary: string | null;
  readonly expectedQuantityAtSnapshot: string;
  readonly expectedQuantitiesByCondition: Partial<
    Record<'SELLABLE' | 'DAMAGED' | 'QUARANTINE' | 'INSPECTION', string>
  >;
  readonly countedQuantity: string | null;
  readonly countedQuantitiesByCondition: Partial<
    Record<'SELLABLE' | 'DAMAGED' | 'QUARANTINE' | 'INSPECTION', string>
  > | null;
  readonly movementsAfterSnapshot: string;
  readonly finalExpectedQuantity: string | null;
  readonly varianceQuantity: string | null;
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
  readonly consumedQuantity: string;
  readonly releasedQuantity: string;
  readonly remainingQuantity: string;
  readonly status: 'ACTIVE' | 'PARTIALLY_CONSUMED' | 'CONSUMED' | 'RELEASED' | 'EXPIRED';
  readonly sourceType: string;
  readonly sourceReference: string;
  readonly owner?: {
    readonly type: 'ORDER';
    readonly orderId: string;
    readonly orderNumber: string;
    readonly orderStatus: string;
    readonly fulfillmentStatus?: string;
    readonly paymentStatus: string;
    readonly paymentExpiresAt?: string;
  };
  readonly attentionCode?:
    | 'TERMINAL_ORDER_OWNER'
    | 'ORDER_ON_HOLD'
    | 'PAYMENT_REJECTED'
    | 'PAYMENT_REVIEW_OVERDUE'
    | 'EXPIRED_STANDALONE_HOLD';
  readonly releaseAllowed: boolean;
  readonly releaseBlockedReason?: string;
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
  readonly status: 'DRAFT' | 'PLACED' | 'CANCELLED' | 'CLOSED';
  readonly supplierReference?: string;
  readonly orderDate: string;
  readonly expectedDate?: string;
  readonly destinationLocationId?: string;
  readonly destinationLocationName?: string;
  readonly notes?: string;
  readonly closeReason?: string;
  readonly closedAt?: string;
  readonly closedByActorId?: string;
  readonly cancelledAt?: string;
  readonly createdAt: string;
  readonly placedAt?: string;
  readonly totalAmount: string;
  readonly version: number;
  readonly lines: readonly {
    readonly id: string;
    readonly variantId: string;
    readonly productId: string;
    readonly sku: string;
    readonly productTitle: string;
    readonly optionSummary?: string;
    readonly quantity: string;
    readonly unitPrice: string;
    readonly allocatedQuantity: string;
    readonly receivedQuantity: string;
  }[];
}

export interface CreatePurchaseLineInputDto {
  readonly variantId: string;
  readonly quantity: string;
  readonly unitPrice: string;
}

export interface CreatePurchaseInputDto {
  readonly supplierId: string;
  readonly currencyCode: 'BDT' | 'CNY' | 'USD';
  readonly notes?: string;
  readonly supplierReference?: string;
  readonly orderDate?: string;
  readonly expectedDate?: string;
  readonly destinationLocationId?: string;
  readonly lines?: readonly CreatePurchaseLineInputDto[];
}

export interface InboundShipmentDto {
  readonly id: string;
  readonly shipmentNumber: string;
  readonly receivingLocationId: string;
  readonly receivingLocationName: string;
  readonly currencyCode: 'BDT' | 'CNY' | 'USD';
  readonly transportMode: string;
  readonly originText?: string;
  readonly trackingReference?: string;
  readonly expectedArrivalDate?: string;
  readonly departedAt?: string;
  readonly arrivedAt?: string;
  readonly createdAt: string;
  readonly status: 'PLANNED' | 'IN_TRANSIT' | 'ARRIVED' | 'CANCELLED';
  readonly receivingStatus: 'NOT_RECEIVED' | 'PARTIALLY_RECEIVED' | 'RECEIVED';
  readonly version: number;
  readonly allocations: readonly {
    readonly id: string;
    readonly purchaseLineId: string;
    readonly purchaseId: string;
    readonly purchaseNumber: string;
    readonly supplierName: string;
    readonly variantId: string;
    readonly productId: string;
    readonly sku: string;
    readonly productTitle: string;
    readonly allocatedQuantity: string;
    readonly receivedQuantity: string;
    readonly optionSummary?: string;
    readonly unitPrice?: string;
  }[];
}

export interface UpdateInboundShipmentInputDto {
  readonly version: number;
  readonly trackingReference?: string;
  readonly expectedArrivalDate?: string;
  readonly originText?: string;
  readonly transportMode?: 'AIR' | 'SEA' | 'ROAD' | 'RAIL' | 'OTHER';
}

export interface InboundReceiptLineDto {
  readonly id: string;
  readonly shipmentAllocationId: string;
  readonly variantId: string;
  readonly productId: string;
  readonly inventoryItemId?: string;
  readonly sku: string;
  readonly productTitle: string;
  readonly condition: 'SELLABLE' | 'DAMAGED' | 'QUARANTINE' | 'INSPECTION';
  readonly quantity: string;
}

export interface InboundReceiptDto {
  readonly id: string;
  readonly receiptNumber: string;
  readonly shipmentId: string;
  readonly shipmentNumber: string;
  readonly locationId: string;
  readonly locationName: string;
  readonly inventoryTransactionId: string;
  readonly status: 'POSTED' | 'REVERSED';
  readonly packingSlipReference?: string;
  readonly notes?: string;
  readonly reversedAt?: string;
  readonly reversedByActorId?: string;
  readonly reversalReason?: string;
  readonly postedAt: string;
  readonly lines: readonly InboundReceiptLineDto[];
}

export interface SupplyListQueryDto {
  readonly page?: number;
  readonly pageSize?: number;
  readonly q?: string;
  readonly status?: string;
  readonly sortBy?: string;
  readonly sortDirection?: 'asc' | 'desc';
}

export interface SupplierListQueryDto extends SupplyListQueryDto {
  readonly supplierType?: string;
}

export interface PurchaseListQueryDto extends SupplyListQueryDto {
  readonly supplierId?: string;
}

export interface ShipmentListQueryDto extends SupplyListQueryDto {
  readonly receivingStatus?: string;
  readonly purchaseId?: string;
}

export interface ReceiptListQueryDto extends SupplyListQueryDto {
  readonly shipmentId?: string;
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

export interface PaginatedEnvelope<T> {
  readonly items: readonly T[];
  readonly totalCount: number;
}

export interface PaginatedResultDto<T> {
  readonly items: readonly T[];
  readonly pagination: PaginationDto;
}

export type PaymentMethodCodeDto = 'COD' | 'BKASH_MANUAL' | 'NAGAD_MANUAL';

export interface PaymentMethodDto {
  readonly id: string;
  readonly code: PaymentMethodCodeDto;
  readonly name: string;
  readonly methodType: 'COD' | 'MOBILE_WALLET';
  readonly status: 'ACTIVE' | 'DISABLED';
  readonly instructions: { readonly accountNumber?: string; readonly text?: string };
  readonly paymentWindowMinutes: number | null;
  readonly displayOrder: number;
  readonly version: number;
}

export interface PaymentAttemptDto {
  readonly id: string;
  readonly orderId: string;
  readonly orderNumber: string;
  readonly method: PaymentMethodCodeDto;
  readonly methodName: string;
  readonly expectedAmount: string;
  readonly customerReference: string;
  readonly claimedAmount: string | null;
  readonly status: 'PENDING_VERIFICATION' | 'VERIFIED' | 'REJECTED';
  readonly submittedAt: string;
}

export interface PendingCodCollectionDto {
  readonly deliveryId: string;
  readonly deliveryNumber: string;
  readonly orderId: string;
  readonly orderNumber: string;
  readonly expectedAmount: string;
  readonly outstandingAmount: string;
  readonly currency: string;
  readonly carrierName: string | null;
  readonly trackingReference: string | null;
  readonly deliveredAt: string;
}

export interface FinancePostingDto {
  readonly transactionId: string;
  readonly transactionNumber: string;
  readonly accountId: string;
  readonly accountName: string;
  readonly postedAt: string;
}

export interface PaymentDto {
  readonly id: string;
  readonly paymentNumber: string;
  readonly orderId: string;
  readonly orderNumber: string;
  readonly method: PaymentMethodCodeDto;
  readonly amount: string;
  readonly currency: string;
  readonly externalReference: string;
  readonly status: 'CONFIRMED' | 'VOIDED' | 'REVERSED';
  readonly confirmedAt: string;
  readonly refunded: string;
  readonly net: string;
  readonly financePosting: FinancePostingDto | null;
}

export interface PaymentDetailDto extends PaymentDto {
  readonly order: {
    readonly status: string;
    readonly total: string;
    readonly currency: string;
    readonly paymentStatus: string;
    readonly collected: string;
    readonly outstanding: string;
  };
  readonly customer: {
    readonly id: string | null;
    readonly name: string;
    readonly phone: string;
    readonly email: string | null;
  };
  readonly source:
    | {
        readonly type: 'MANUAL_SUBMISSION';
        readonly id: string;
        readonly submittedAt: string;
      }
    | {
        readonly type: 'COD_COLLECTION';
        readonly id: string;
        readonly deliveryNumber: string;
        readonly carrierName: string | null;
        readonly trackingReference: string | null;
        readonly deliveredAt: string | null;
      };
  readonly refunds: readonly RefundDto[];
}

export interface RefundDto {
  readonly id: string;
  readonly refundNumber: string;
  readonly orderId: string;
  readonly orderNumber: string;
  readonly paymentId: string;
  readonly paymentNumber: string;
  readonly amount: string;
  readonly currency: string;
  readonly status: string;
  readonly reasonCode: string;
  readonly externalReference: string | null;
  readonly requestedAt: string;
  readonly completedAt: string | null;
  readonly version: number;
  readonly financePosting: FinancePostingDto | null;
}

export interface FinancialAccountDto {
  readonly id: string;
  readonly account_number: string;
  readonly name: string;
  readonly account_type: string;
  readonly currency_code: string;
  readonly status: string;
  readonly reference_label: string | null;
  readonly version: string;
  readonly ledger_balance: string;
  readonly last_movement_at: string | null;
  readonly created_at?: string;
  readonly updated_at?: string;
}

export interface FinanceAccountDetailDto extends FinancialAccountDto {
  readonly summary: {
    readonly totalInflow: string;
    readonly totalOutflow: string;
    readonly entryCount: number;
  };
  readonly latestReconciliation: {
    readonly id: string;
    readonly status: 'OPEN' | 'CLOSED';
    readonly differenceAmount: string;
    readonly observedAt: string;
  } | null;
  readonly hasOpeningBalance?: boolean;
  readonly canSetOpeningBalance?: boolean;
}

export interface UpdateFinancialAccountRequest {
  readonly name?: string;
  readonly referenceLabel?: string | null;
  readonly expectedVersion: number;
}

export interface SetFinancialAccountOpeningBalanceRequest {
  readonly amount: string;
  readonly description?: string;
  readonly idempotencyKey?: string;
}

export interface FinanceExpenseDto {
  readonly id: string;
  readonly expense_number: string;
  readonly description: string;
  readonly amount: string;
  readonly currency_code: string;
  readonly expense_date: string;
  readonly status: string;
  readonly category_id: string;
  readonly category_name: string;
  readonly category_classification: string;
  readonly paid: string;
  readonly adjustments: string;
  readonly outstanding: string;
  readonly source_domain: string | null;
  readonly source_id: string | null;
  readonly source_reference: string | null;
  readonly source_counterparty: string | null;
  readonly payee_name: string | null;
  readonly external_reference: string | null;
  readonly notes: string | null;
  readonly created_at: string;
  readonly version: number;
}

export interface FinanceExpenseDetailDto extends FinanceExpenseDto {
  readonly payments: readonly {
    readonly id: string;
    readonly amount: string;
    readonly paidAt: string;
    readonly reference: string | null;
    readonly paymentSource: 'BUSINESS_ACCOUNT' | 'OWNER_CAPITAL' | 'REVERSAL';
    readonly accountId: string | null;
    readonly accountName: string | null;
    readonly contributorId: string | null;
    readonly contributorName: string | null;
    readonly reversalOfPaymentId: string | null;
    readonly reversalReason: string | null;
    readonly financeTransactionId: string;
    readonly transactionNumber: string;
  }[];
  readonly adjustmentHistory: readonly {
    readonly id: string;
    readonly type: string;
    readonly amount: string;
    readonly reason: string;
    readonly createdAt: string;
  }[];
  readonly activity: readonly {
    readonly id: string;
    readonly action: string;
    readonly reason: string | null;
    readonly occurredAt: string;
    readonly actorId: string | null;
  }[];
  readonly linkedAssets?: readonly {
    readonly id: string;
    readonly assetCode: string;
    readonly name: string;
    readonly status: string;
    readonly linkType: 'ACQUISITION' | 'MAINTENANCE';
  }[];
}

export type FinanceTransactionTypeDto =
  | 'OPENING_BALANCE'
  | 'EXPENSE_PAYMENT'
  | 'INTERNAL_TRANSFER'
  | 'EXTERNAL_ADJUSTMENT'
  | 'PAYMENT_SOURCE_POSTING'
  | 'REFUND_SOURCE_POSTING'
  | 'COD_SETTLEMENT'
  | 'CAPITAL_CONTRIBUTION'
  | 'OWNER_FUNDED_EXPENSE'
  | 'CAPITAL_WITHDRAWAL'
  | 'CAPITAL_REVERSAL'
  | 'ASSET_SALE';

export interface CapitalContributorDto {
  readonly id: string;
  readonly displayName: string;
  readonly linkedUserId: string | null;
  readonly linkedUserName?: string | null;
  readonly linkedUserEmail?: string | null;
  readonly contactNote: string | null;
  readonly status: 'ACTIVE' | 'INACTIVE';
  readonly grossContributed: string;
  readonly ownerFundedExpenses: string;
  readonly withdrawn: string;
  readonly netCapital: string;
  readonly lastActivityAt: string | null;
  readonly version: number;
}

export type CapitalEventTypeDto =
  'CONTRIBUTION' | 'OWNER_FUNDED_EXPENSE' | 'WITHDRAWAL' | 'REVERSAL';

export interface CapitalEventDto {
  readonly id: string;
  readonly eventType: CapitalEventTypeDto;
  readonly amountDelta: string;
  readonly currencyCode: string;
  readonly occurredAt: string;
  readonly contributorId: string;
  readonly contributorName: string;
  readonly accountId: string | null;
  readonly accountName: string | null;
  readonly expenseId: string | null;
  readonly expenseNumber: string | null;
  readonly purchaseId: string | null;
  readonly purchaseNumber: string | null;
  readonly financeTransactionId: string;
  readonly transactionNumber: string;
  readonly reference: string | null;
  readonly note: string | null;
  readonly reversalOfEventId: string | null;
  readonly isReversed: boolean;
  readonly reversalEventId?: string | null;
  readonly reversalTransactionNumber?: string | null;
  readonly reversalReason?: string | null;
  readonly reversalOfTransactionNumber?: string | null;
}

export interface CapitalOverviewDto {
  readonly currency: string;
  readonly totalContributed: string;
  readonly ownerFundedExpenses: string;
  readonly totalWithdrawn: string;
  readonly netCapital: string;
  readonly contributorCount: number;
  readonly recentEvents: readonly CapitalEventDto[];
}

export interface FinanceLedgerEntryDto {
  readonly id: string;
  readonly amount_delta: string;
  readonly currency_code: string;
  readonly created_at: string;
  readonly transaction_id: string;
  readonly transaction_number: string;
  readonly transaction_type: FinanceTransactionTypeDto;
  readonly description: string;
  readonly source_domain: string | null;
  readonly source_id: string | null;
  readonly account_id?: string;
  readonly account_name: string;
}

export interface FinanceReconciliationDto {
  readonly id: string;
  readonly account_id: string;
  readonly account_name: string;
  readonly observed_balance: string;
  readonly ledger_balance: string;
  readonly difference_amount: string;
  readonly status: 'OPEN' | 'CLOSED';
  readonly created_at: string;
  readonly resolution: {
    readonly code: 'EXPLAINED_DIFFERENCE' | 'EXTERNAL_BALANCE_CORRECTED';
    readonly note: string;
    readonly resolved_at: string;
    readonly resolved_by: string | null;
  } | null;
}

export interface OutstandingCodSettlementPaymentDto {
  readonly paymentId: string;
  readonly paymentNumber: string;
  readonly orderId: string;
  readonly orderNumber: string;
  readonly deliveryId: string;
  readonly deliveryNumber: string;
  readonly carrierName: string;
  readonly trackingReference: string | null;
  readonly collectedAt: string;
  readonly amount: string;
  readonly settledAmount: string;
  readonly outstandingAmount: string;
  readonly currency: string;
  readonly sourceAccountId: string | null;
  readonly sourceAccountName: string | null;
  readonly canSettle: boolean;
}

export interface FinanceCodSettlementDto {
  readonly id: string;
  readonly settlementNumber: string;
  readonly carrierName: string;
  readonly remittanceReference: string;
  readonly currency: string;
  readonly grossAmount: string;
  readonly deductionAmount: string;
  readonly netAmount: string;
  readonly deductionNote: string | null;
  readonly sourceAccountId: string;
  readonly sourceAccountName: string;
  readonly destinationAccountId: string;
  readonly destinationAccountName: string;
  readonly financeTransactionId: string;
  readonly settledAt: string;
  readonly createdBy: string | null;
  readonly allocations: readonly {
    readonly paymentId: string;
    readonly paymentNumber: string;
    readonly orderId: string;
    readonly orderNumber: string;
    readonly deliveryId: string;
    readonly deliveryNumber: string;
    readonly amount: string;
  }[];
}

export type FinanceTrendRangeDto = 'LAST_7_DAYS' | 'LAST_30_DAYS' | 'LAST_90_DAYS' | 'THIS_MONTH';

export interface FinanceTrendsDto {
  readonly range: FinanceTrendRangeDto;
  readonly currency: string;
  readonly period: {
    readonly from: string;
    readonly to: string;
    readonly label: string;
  };
  readonly totals: {
    readonly collectedPayments: string;
    readonly completedRefunds: string;
    readonly paidExpenses: string;
    readonly courierDeductions: string;
    readonly netAccountMovement: string;
  };
  readonly series: readonly {
    readonly date: string;
    readonly collectedPayments: string;
    readonly completedRefunds: string;
    readonly paidExpenses: string;
    readonly courierDeductions: string;
    readonly netAccountMovement: string;
  }[];
}

export interface FinanceOverviewDto {
  readonly currency: string;
  readonly period: {
    readonly from: string;
    readonly to: string;
    readonly label: string;
  };
  readonly metrics: {
    readonly collectedPayments: string;
    readonly completedRefunds: string;
    readonly paidExpenses: string;
    readonly netAccountMovement: string;
    readonly accountBalance: string;
    readonly outstandingExpenses: string;
    readonly outstandingSupplierPayments: string;
    readonly outstandingCodHeld: string;
  };
  readonly attention: {
    readonly pendingPaymentVerifications: number;
    readonly pendingCodCollections: number;
    readonly unpostedPayments: number;
    readonly unpostedRefunds: number;
    readonly reconciliationDifferences: number;
    readonly outstandingExpenses: number;
    readonly outstandingSupplierPayments: number;
    readonly outstandingCodPayments: number;
  };
  readonly recentActivity: readonly FinanceLedgerEntryDto[];
}

export type OrderStatusDto = 'PENDING' | 'CONFIRMED' | 'ON_HOLD' | 'COMPLETED' | 'CANCELLED';
export type OrderSourceDto = 'STOREFRONT' | 'MANUAL';
export type OrderSalesChannelDto =
  | 'STOREFRONT'
  | 'ADMIN'
  | 'FACEBOOK'
  | 'INSTAGRAM'
  | 'WHATSAPP'
  | 'PHONE'
  | 'EXTERNAL_API'
  | 'IMPORT';
export type OrderPaymentStatusDto =
  | 'UNPAID'
  | 'PAYMENT_PENDING'
  | 'PARTIALLY_PAID'
  | 'PAID'
  | 'PARTIALLY_REFUNDED'
  | 'REFUNDED'
  | 'EXPIRED'
  | 'CANCELLED';
export type OrderFulfillmentStatusDto =
  'UNFULFILLED' | 'PARTIALLY_FULFILLED' | 'IN_PROGRESS' | 'FULFILLED' | 'CANCELLED';
export type OrderDeliveryStatusDto =
  | 'NOT_STARTED'
  | 'PENDING'
  | 'IN_TRANSIT'
  | 'PARTIALLY_DELIVERED'
  | 'DELIVERED'
  | 'FAILED'
  | 'CANCELLED';

export interface OrderTagDto {
  readonly id: string;
  readonly label: string;
  readonly name?: string;
  readonly color?: string | null;
}

export interface OrderSummaryDto {
  readonly id: string;
  readonly orderNumber: string;
  readonly status: OrderStatusDto;
  readonly source: OrderSourceDto;
  readonly salesChannel: OrderSalesChannelDto;
  readonly paymentMethod: PaymentMethodCodeDto;
  readonly paymentStatus: OrderPaymentStatusDto;
  readonly fulfillmentStatus: OrderFulfillmentStatusDto;
  readonly deliveryStatus: OrderDeliveryStatusDto;
  readonly total: string;
  readonly deliveryAmount: string;
  readonly currency: string;
  readonly createdAt: string;
  readonly customerId?: string | null;
  readonly customerName?: string;
  readonly customerPhone?: string;
  readonly customerEmail?: string | null;
  readonly tags?: readonly OrderTagDto[];
  readonly riskLevel?: 'INSUFFICIENT_HISTORY' | 'LOW' | 'MODERATE' | 'ELEVATED' | null;
}

export interface CustomerDeliveryHistoryDto {
  readonly ordersCount: number;
  readonly deliveredCount: number;
  readonly rtoCount: number;
  readonly cancelledCount: number;
  readonly rtoRate: number | null;
  readonly totalDeliveredSpend: string;
}

export interface OrderCapabilitiesDto {
  readonly canConfirm: boolean;
  readonly canHold: boolean;
  readonly canResume: boolean;
  readonly canCancel: boolean;
  readonly canCancelLines: boolean;
  readonly canEditAddress: boolean;
  readonly canEditCustomerContact: boolean;
  readonly canAddNote: boolean;
  readonly canRecordVerification: boolean;
  readonly canComplete: boolean;
  readonly canCreateFulfillment: boolean;
}

export interface OrderVerificationDto {
  readonly id: string;
  readonly orderId: string;
  readonly actorId: string;
  readonly actorName?: string | null;
  readonly verificationType:
    | 'PHONE_CALL'
    | 'WHATSAPP_MESSAGE'
    | 'SMS_CONFIRMATION'
    | 'FRAUD_RISK_REVIEW'
    | 'MANUAL_APPROVAL';
  readonly outcome:
    | 'CONFIRMED'
    | 'UNREACHABLE'
    | 'WRONG_NUMBER'
    | 'CANCEL_REQUESTED'
    | 'ADDRESS_CORRECTION_REQUESTED'
    | 'FLAGGED_SUSPICIOUS'
    | 'APPROVED_OVERRIDE';
  readonly notes: string | null;
  readonly riskSnapshot: Record<string, unknown> | null;
  readonly createdAt: string;
}

export interface RecordOrderVerificationDto {
  readonly verificationType:
    | 'PHONE_CALL'
    | 'WHATSAPP_MESSAGE'
    | 'SMS_CONFIRMATION'
    | 'FRAUD_RISK_REVIEW'
    | 'MANUAL_APPROVAL';
  readonly outcome:
    | 'CONFIRMED'
    | 'UNREACHABLE'
    | 'WRONG_NUMBER'
    | 'CANCEL_REQUESTED'
    | 'ADDRESS_CORRECTION_REQUESTED'
    | 'FLAGGED_SUSPICIOUS'
    | 'APPROVED_OVERRIDE';
  readonly notes?: string;
  readonly riskSnapshot?: Record<string, unknown>;
}

export interface OrderRiskSignalDto {
  readonly code: string;
  readonly title: string;
  readonly severity: 'INFO' | 'LOW' | 'WARNING' | 'CRITICAL';
  readonly explanation: string;
}

export interface OrderDuplicateCandidateDto {
  readonly orderId: string;
  readonly orderNumber: string;
  readonly orderStatus: string;
  readonly createdAt: string;
  readonly matchingReasons: readonly string[];
}

export interface OrderDeliveryRiskAssessmentDto {
  readonly orderId: string;
  readonly orderNumber: string;
  readonly normalizedPhone: string;
  readonly overallRiskLevel: 'INSUFFICIENT_HISTORY' | 'LOW' | 'MODERATE' | 'ELEVATED';
  readonly recommendation:
    | 'APPROVE_COD'
    | 'VERIFY_CUSTOMER'
    | 'REQUIRE_PREPAYMENT'
    | 'REJECT_SUSPICIOUS';
  readonly signals: readonly OrderRiskSignalDto[];
  readonly internalHistory: CustomerDeliveryHistoryDto;
  readonly providerHistory: {
    readonly steadfast?: {
      readonly available: boolean;
      readonly phone: string;
      readonly totalParcels: number;
      readonly deliveredCount: number;
      readonly cancelledCount: number;
      readonly fraudReportsCount: number;
      readonly successRate: number | null;
      readonly checkedAt: string;
      readonly error?: string;
    };
    readonly pathao: { readonly available: false; readonly reason: string };
  };
  readonly duplicateOrders: readonly OrderDuplicateCandidateDto[];
  readonly evaluatedAt: string;
  readonly expiresAt: string;
  readonly isFresh: boolean;
}

export interface OrderDetailDto extends OrderSummaryDto {
  readonly version: number;
  readonly capabilities: OrderCapabilitiesDto;
  readonly lines: readonly OrderLineDto[];
  readonly tags?: readonly OrderTagDto[];
  readonly notes: readonly OrderNoteDto[];
  readonly verifications?: readonly OrderVerificationDto[];
  readonly riskSummary?: {
    readonly overallRiskLevel: string;
    readonly recommendation: string;
    readonly signalCount: number;
  } | null;
  readonly timeline: readonly OrderTimelineEventDto[];
  readonly payment: OrderPaymentSummaryDto;
  readonly merchandiseGross: string;
  readonly discountTotal: string;
  readonly merchandiseNet: string;
  readonly taxAmount: string;
  readonly customer: {
    readonly displayName: string;
    readonly phone: string;
    readonly email: string | null;
  };
  readonly address: {
    readonly recipientName: string;
    readonly phone: string;
    readonly addressLine1: string;
    readonly addressLine2?: string;
    readonly geographyNodeId?: string;
    readonly area?: string;
    readonly city?: string;
    readonly district?: string;
    readonly postalCode?: string;
    readonly countryCode: string;
  };
  readonly fulfillments?: readonly {
    readonly id: string;
    readonly fulfillmentNumber: string;
    readonly status: string;
    readonly locationId: string;
    readonly dispatchedAt: string | null;
  }[];
  readonly deliveries?: readonly {
    readonly id: string;
    readonly deliveryNumber: string;
    readonly status: string;
    readonly outcomeStatus: string | null;
    readonly trackingNumber: string | null;
    readonly dispatchedAt: string | null;
    readonly deliveredAt: string | null;
  }[];
  readonly returnCases?: readonly {
    readonly id: string;
    readonly caseNumber: string;
    readonly status: string;
    readonly returnType: string;
    readonly createdAt: string;
  }[];
  readonly refunds?: readonly {
    readonly id: string;
    readonly amount: string;
    readonly status: string;
    readonly createdAt: string;
  }[];
  readonly discountApplications?: readonly {
    readonly promotionName: string;
    readonly couponCode: string | null;
    readonly benefitType: string;
    readonly benefitValue: string;
    readonly discountAmount: string;
  }[];
  readonly cancellation?: {
    readonly reasonCode: string;
    readonly reasonText: string | null;
    readonly initiatedBy?: 'CUSTOMER' | 'MERCHANT' | 'SYSTEM';
    readonly createdAt: string;
    readonly refundSettlement:
      'NOT_REQUIRED' | 'REFUND_PENDING' | 'PARTIALLY_REFUNDED' | 'REFUNDED';
    readonly refundObligations: readonly {
      readonly id: string;
      readonly amount: string;
      readonly status: string;
    }[];
  } | null;
}

export interface OrderLineDto {
  readonly id: string;
  readonly variantId: string | null;
  readonly sku: string;
  readonly productTitle: string;
  readonly variantTitle: string | null;
  readonly imageUrl?: string | null;
  readonly quantity: string;
  readonly unitPrice: string;
  readonly gross: string;
  readonly discount: string;
  readonly net: string;
  readonly status: 'ACTIVE' | 'CANCELLED';
  readonly cancellationReasonCode: string | null;
  readonly cancellationReasonText: string | null;
  readonly cancelledAt: string | null;
  readonly options: readonly { readonly name: string; readonly value: string }[];
  readonly fulfilledQuantity?: string;
  readonly remainingFulfillableQuantity?: string;
}

export interface OrderNoteDto {
  readonly id: string;
  readonly noteType: 'INTERNAL' | 'CUSTOMER_VISIBLE';
  readonly body: string;
  readonly createdAt: string;
  readonly authorActorId: string;
}

export interface OrderTimelineEventDto {
  readonly id: string;
  readonly eventType: string;
  readonly occurredAt: string;
  readonly category?:
    | 'ORDER'
    | 'PAYMENT'
    | 'FULFILLMENT'
    | 'DELIVERY'
    | 'RETURN'
    | 'VERIFICATION'
    | 'NOTE';
  readonly title?: string;
  readonly description?: string | null;
  readonly actorType?: 'CUSTOMER' | 'ADMIN' | 'SYSTEM' | 'COURIER';
  readonly actorName?: string | null;
  readonly metadata?: Record<string, unknown>;
  readonly aggregateType?: string;
  readonly aggregateId?: string;
  readonly payload?: Record<string, unknown>;
}

export interface OrderPaymentSummaryDto {
  readonly method: string;
  readonly expected: string;
  readonly collected: string;
  readonly refunded: string;
  readonly outstanding: string;
  readonly status: string;
}

export interface CustomerSummaryDto {
  readonly id: string;
  readonly customerNumber: string;
  readonly displayName: string;
  readonly status: 'ACTIVE' | 'INACTIVE' | 'BLOCKED' | 'MERGED' | 'ANONYMIZED';
  readonly version: number;
  readonly firstSource: CustomerSourceDto;
  readonly latestSource: CustomerSourceDto;
  readonly primaryEmail?: string | null;
  readonly primaryPhone?: string | null;
  readonly orderCount?: number;
  readonly totalSpend?: string;
  readonly lastOrderAt?: string | null;
  readonly createdAt: string;
  readonly activeRestrictions?: readonly CustomerRestrictionTypeDto[];
}

export interface CustomerDuplicateCandidateDto {
  readonly customerId: string;
  readonly confidence: string;
  readonly signals: readonly string[];
  readonly displayName?: string;
  readonly customerNumber?: string;
  readonly status?: string;
  readonly primaryPhone?: string | null;
  readonly primaryEmail?: string | null;
  readonly orderCount?: number;
}

export interface CustomerListFiltersDto {
  readonly page?: number;
  readonly pageSize?: number;
  readonly status?: 'ACTIVE' | 'INACTIVE' | 'BLOCKED' | 'MERGED' | 'ANONYMIZED';
  readonly source?: CustomerSourceDto;
  readonly from?: string;
  readonly to?: string;
  readonly q?: string;
  readonly sortBy?: 'CREATED_DESC' | 'CREATED_ASC' | 'ORDERS_DESC' | 'SPEND_DESC' | 'RECENT_ORDER';
  readonly minOrders?: number;
}

export type CustomerSourceDto =
  | 'STOREFRONT'
  | 'MANUAL_ORDER'
  | 'FACEBOOK'
  | 'INSTAGRAM'
  | 'WHATSAPP'
  | 'PHONE'
  | 'IMPORT'
  | 'ADMIN_CREATED'
  | 'EXTERNAL_API';

export type CustomerRestrictionTypeDto =
  | 'ORDERING_BLOCKED'
  | 'COD_RESTRICTED'
  | 'ORDER_REVIEW_REQUIRED';

export type CustomerRestrictionStatusDto = 'ACTIVE' | 'LIFTED' | 'EXPIRED';

export interface CustomerRestrictionDto {
  readonly id: string;
  readonly customerId: string;
  readonly restrictionType: CustomerRestrictionTypeDto;
  readonly status: CustomerRestrictionStatusDto;
  readonly reason: string;
  readonly notes?: string | null;
  readonly createdBy: string;
  readonly createdAt: string;
  readonly expiresAt?: string | null;
  readonly liftedAt?: string | null;
  readonly liftedBy?: string | null;
  readonly liftReason?: string | null;
}

export interface ApplyCustomerRestrictionInputDto {
  readonly restrictionType: CustomerRestrictionTypeDto;
  readonly reason: string;
  readonly notes?: string;
  readonly expiresAt?: string;
}

export interface LiftCustomerRestrictionInputDto {
  readonly liftReason: string;
}

export type CustomerAccountLinkTypeDto =
  | 'VERIFIED_PHONE'
  | 'VERIFIED_EMAIL'
  | 'MANUAL_CLAIM'
  | 'INVITATION'
  | 'GUEST_CONVERSION';

export type CustomerAccountStatusDto = 'ACTIVE' | 'UNLINKED' | 'SUSPENDED';

export interface CustomerAccountDto {
  readonly id: string;
  readonly customerId: string;
  readonly userId: string;
  readonly linkType: CustomerAccountLinkTypeDto;
  readonly verifiedAt: string;
  readonly status: CustomerAccountStatusDto;
  readonly createdAt: string;
  readonly unlinkedAt?: string | null;
  readonly unlinkedBy?: string | null;
  readonly unlinkReason?: string | null;
  readonly user?: {
    readonly id: string;
    readonly name: string;
    readonly email: string;
  } | null;
}

export interface LinkCustomerAccountInputDto {
  readonly userId: string;
  readonly linkType: CustomerAccountLinkTypeDto;
}

export interface UnlinkCustomerAccountInputDto {
  readonly reason: string;
}

export interface CustomerCommunicationSummaryDto {
  readonly id: string;
  readonly channel: 'IN_APP' | 'EMAIL' | 'SMS';
  readonly notificationType: string;
  readonly renderedSubject: string | null;
  readonly renderedBody: string;
  readonly intendedRecipient: string | null;
  readonly effectiveRecipient: string | null;
  readonly status: string;
  readonly provider: string | null;
  readonly providerMessageId: string | null;
  readonly skipReason: string | null;
  readonly failureCode: string | null;
  readonly failureMessage: string | null;
  readonly sourceDomain: string;
  readonly sourceId: string;
  readonly sentAt: string | null;
  readonly deliveredAt: string | null;
  readonly createdAt: string;
  readonly smsDetails?: {
    readonly originalRecipient: string | null;
    readonly normalizedRecipient: string | null;
    readonly encoding: string;
    readonly characterCount: number;
    readonly estimatedSegments: number;
    readonly senderType: string;
    readonly senderId: string | null;
  } | null;
}

export type CustomerTimelineEventTypeDto =
  | 'CUSTOMER_CREATED'
  | 'CUSTOMER_UPDATED'
  | 'ORDER_PLACED'
  | 'ORDER_CONFIRMED'
  | 'ORDER_DELIVERED'
  | 'ORDER_CANCELLED'
  | 'RETURN_REQUESTED'
  | 'RETURN_COMPLETED'
  | 'REFUND_COMPLETED'
  | 'RESTRICTION_APPLIED'
  | 'RESTRICTION_LIFTED'
  | 'NOTE_ADDED'
  | 'TAG_ASSIGNED'
  | 'ACCOUNT_LINKED'
  | 'ACCOUNT_UNLINKED'
  | 'CUSTOMER_MERGED'
  | 'COMMUNICATION_SENT';

export interface CustomerTimelineEventDto {
  readonly id: string;
  readonly eventType: CustomerTimelineEventTypeDto;
  readonly title: string;
  readonly description?: string | null;
  readonly occurredAt: string;
  readonly actorType?: string | null;
  readonly actorId?: string | null;
  readonly referenceType?: string | null;
  readonly referenceId?: string | null;
  readonly metadata?: Record<string, unknown>;
}

export interface CustomerMergePreviewDto {
  readonly sourceCustomer: CustomerSummaryDto;
  readonly targetCustomer: CustomerSummaryDto;
  readonly canMerge: boolean;
  readonly blockingConflicts: readonly string[];
  readonly warnings: readonly string[];
  readonly summary: {
    readonly ordersToMove: number;
    readonly phonesToCombine: number;
    readonly duplicatePhones: number;
    readonly emailsToCombine: number;
    readonly duplicateEmails: number;
    readonly addressesToMove: number;
    readonly notesToMove: number;
    readonly tagsToMerge: number;
    readonly restrictionsToTransfer: number;
    readonly sourceHasAccount: boolean;
    readonly targetHasAccount: boolean;
  };
}

export interface CustomerDeliveryMetricsDto {
  readonly totalDeliveries: number;
  readonly eligibleDeliveries: number;
  readonly deliveredCount: number;
  readonly failedDeliveryCount: number;
  readonly rtoCount: number;
  readonly successRate: number | null;
  readonly rtoRate: number | null;
  readonly lastSuccessfulDelivery?: string | null;
  readonly lastRto?: string | null;
  readonly riskLevel: 'INSUFFICIENT_HISTORY' | 'LOW' | 'MODERATE' | 'ELEVATED';
  readonly riskReasons: readonly { readonly code: string; readonly explanation: string }[];
}

export interface CustomerDetailDto extends CustomerSummaryDto {
  readonly canonicalCustomerId?: string;
  readonly addresses: readonly CustomerAddressDto[];
  readonly phones: readonly CustomerPhoneDto[];
  readonly emails: readonly CustomerEmailDto[];
  readonly tags: readonly CustomerTagDto[];
  readonly notes: readonly CustomerNoteDto[];
  readonly restrictions: readonly CustomerRestrictionDto[];
  readonly account?: CustomerAccountDto | null;
  readonly deliveryMetrics?: CustomerDeliveryMetricsDto | null;
  readonly commerceMetrics: {
    readonly totalOrders: number;
    readonly activeOrders: number;
    readonly cancelledOrders: number;
    readonly deliveredOrders?: number;
    readonly returnedOrders?: number;
    readonly lifetimeOrderValue: string;
    readonly collectedAmount: string;
    readonly refundedAmount: string;
    readonly outstandingAmount: string;
    readonly averageOrderValue?: string;
    readonly lastOrderAt: string | null;
  };
}

export interface CustomerPhoneDto {
  readonly id: string;
  readonly phone: string;
  readonly normalizedPhone: string;
  readonly isPrimary: boolean;
  readonly verificationStatus: string;
  readonly verifiedAt?: string | null;
  readonly verificationSource?: string | null;
  readonly createdAt: string;
}

export interface CustomerEmailDto {
  readonly id: string;
  readonly email: string;
  readonly normalizedEmail: string;
  readonly isPrimary: boolean;
  readonly verificationStatus: string;
  readonly verifiedAt?: string | null;
  readonly verificationSource?: string | null;
  readonly createdAt: string;
}

export interface CustomerAddressDto {
  readonly id: string;
  readonly addressLine1: string;
  readonly addressLine2: string | null;
  readonly city: string | null;
  readonly isDefault: boolean;
  readonly version: number;
  readonly label: string | null;
  readonly recipientName: string;
  readonly phone: string | null;
  readonly geographyNodeId: string | null;
  readonly area: string | null;
  readonly district: string | null;
  readonly postalCode: string | null;
  readonly countryCode: string;
  readonly status: string;
  readonly createdAt: string;
}

export interface CustomerTagDto {
  readonly id: string;
  readonly label: string;
  readonly color?: string;
}

export interface CustomerNoteDto {
  readonly id: string;
  readonly body: string;
  readonly createdAt: string;
  readonly authorActorId: string;
}

export interface CreateManualOrderInputDto {
  readonly customerId?: string;
  readonly customer?: {
    readonly name: string;
    readonly phone: string;
    readonly email?: string | null | undefined;
  };
  readonly locationId: string;
  readonly lines: readonly {
    readonly variantId: string;
    readonly quantity: string;
    readonly unitPrice?: string;
    readonly priceOverrideReason?: string;
  }[];
  readonly deliveryAddress: {
    readonly recipientName: string;
    readonly phone: string;
    readonly addressLine1: string;
    readonly addressLine2?: string;
    readonly geographyNodeId?: string;
    readonly area?: string;
    readonly city?: string;
    readonly district?: string;
    readonly postalCode?: string;
    readonly countryCode: string;
    readonly saveToCustomer?: boolean;
  };
  readonly deliveryAmount?: string;
  readonly deliveryOverrideReason?: string;
  readonly discountAmount?: string;
  readonly discountOverrideReason?: string;
  readonly paymentMethod: PaymentMethodCodeDto;
  readonly salesChannel: Exclude<OrderSalesChannelDto, 'STOREFRONT'>;
  readonly currency?: string;
}

export interface DeliveryPricingRuleDto {
  readonly id: string;
  readonly name: string;
  readonly countryCode: string;
  readonly geographyNodeId: string | null;
  readonly geographyNodeName?: string | null;
  readonly flatAmount: string;
  readonly currencyCode: string;
  readonly priority: number;
  readonly status: 'ACTIVE' | 'INACTIVE';
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CreateDeliveryPricingRuleInputDto {
  readonly name: string;
  readonly countryCode: string;
  readonly geographyNodeId?: string;
  readonly flatAmount: string;
  readonly currencyCode: string;
  readonly priority?: number;
}

export interface UpdateDeliveryPricingRuleInputDto {
  readonly expectedVersion: number;
  readonly name?: string;
  readonly flatAmount?: string;
  readonly priority?: number;
  readonly status?: 'ACTIVE' | 'INACTIVE';
}

export interface PublicOrderTrackingDto {
  readonly orderNumber: string;
  readonly status: OrderStatusDto;
  readonly paymentStatus: string;
  readonly paymentMethod: PaymentMethodCodeDto;
  readonly fulfillmentStatus: OrderFulfillmentStatusDto;
  readonly deliveryStatus: OrderDeliveryStatusDto;
  readonly delivery?: {
    readonly carrierName: string | null;
    readonly trackingReference: string | null;
    readonly estimatedDeliveryAt: string | null;
    readonly deliveredAt: string | null;
  } | null;
  readonly destination: {
    readonly city: string | null;
    readonly area: string | null;
    readonly district: string | null;
    readonly countryCode: string;
  };
  readonly lines: readonly {
    readonly productTitle: string;
    readonly variantTitle: string | null;
    readonly sku: string;
    readonly quantity: string;
    readonly imageUrl: string | null;
    readonly unitPrice: string;
    readonly net: string;
    readonly options: readonly { readonly name: string; readonly value: string }[];
  }[];
  readonly merchandiseGross: string;
  readonly discountTotal: string;
  readonly deliveryAmount: string;
  readonly total: string;
  readonly currency: string;
  readonly createdAt: string;
}

export interface AddCustomerNoteInputDto {
  readonly body: string;
}

export interface CreateCustomerTagInputDto {
  readonly label: string;
  readonly color?: string;
}

export interface CreateOrderTagInputDto {
  readonly label: string;
  readonly color?: string;
}

export interface CompleteOrderInputDto {
  readonly manualReason?: string;
}

export interface UpdateOrderCustomerContactInputDto {
  readonly displayName: string;
  readonly phone: string;
  readonly email?: string | null;
  readonly reason: string;
}

export interface UpdateCustomerAddressInputDto {
  readonly recipientName: string;
  readonly addressLine1: string;
  readonly countryCode: string;
  readonly label?: string | null;
  readonly phone?: string | null;
  readonly addressLine2?: string | null;
  readonly geographyNodeId?: string | null;
  readonly area?: string | null;
  readonly city?: string | null;
  readonly district?: string | null;
  readonly postalCode?: string | null;
  readonly isDefault?: boolean;
}

// ---------------------------------------------------------------------------
// Fulfillment Contracts
// ---------------------------------------------------------------------------

export type FulfillmentStatusDto =
  'DRAFT' | 'READY' | 'PICKING' | 'PACKED' | 'DISPATCHED' | 'CANCELLED';

export interface FulfillmentLineDto {
  readonly id: string;
  readonly orderLineId: string;
  readonly sku: string;
  readonly productTitle: string;
  readonly quantity: string;
  readonly consumed: string;
}

export interface FulfillmentDto {
  readonly id: string;
  readonly version: number;
  readonly fulfillmentNumber: string;
  readonly orderId: string;
  readonly orderNumber: string;
  readonly locationId: string;
  readonly locationName: string;
  readonly status: FulfillmentStatusDto;
  readonly createdAt: string;
  readonly dispatchedAt?: string;
  readonly lines: readonly FulfillmentLineDto[];
}

export interface CreateFulfillmentInputDto {
  readonly locationId: string;
  readonly expectedVersion?: number;
  readonly lines: readonly {
    readonly orderLineId: string;
    readonly quantity: string;
  }[];
}

export interface TransitionFulfillmentInputDto {
  readonly version: number;
}

// ---------------------------------------------------------------------------
// Delivery & Courier Contracts
// ---------------------------------------------------------------------------

export type DeliveryOperationalStatusDto =
  | 'READY'
  | 'BOOKING'
  | 'BOOKED'
  | 'HANDED_OVER'
  | 'IN_TRANSIT'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'FAILED'
  | 'CANCELLED'
  | 'RTO_INITIATED'
  | 'RETURNING'
  | 'RETURNED_TO_ORIGIN'
  | 'LOST'
  | 'DAMAGED';

export type DeliveryOutcomeStatusDto =
  | 'PENDING'
  | 'DELIVERED'
  | 'FAILED'
  | 'CANCELLED_BEFORE_HANDOVER'
  | 'LOST'
  | 'DAMAGED'
  | 'RETURNED_TO_ORIGIN';

export type DeliveryAttemptOutcomeDto =
  | 'DELIVERED'
  | 'CUSTOMER_UNAVAILABLE'
  | 'CUSTOMER_REFUSED'
  | 'ADDRESS_NOT_FOUND'
  | 'RESCHEDULE_REQUESTED'
  | 'PHONE_UNREACHABLE'
  | 'PROVIDER_FAILURE'
  | 'OTHER_FAILED';

export interface DeliveryLineDto {
  readonly orderLineId: string;
  readonly sku: string;
  readonly quantity: string;
}

export interface DeliveryPackageDto {
  readonly packageNumber: number;
  readonly weightValue?: string | null;
  readonly weightUnit?: string;
  readonly lengthValue?: string | null;
  readonly widthValue?: string | null;
  readonly heightValue?: string | null;
  readonly dimensionUnit?: string;
  readonly declaredValue?: string | null;
}

export interface CourierBookingDto {
  readonly id: string;
  readonly providerCode: string;
  readonly status: string;
  readonly externalConsignmentId?: string;
  readonly trackingNumber?: string;
  readonly trackingUrl?: string;
  readonly bookedAt?: string;
}

export interface DeliveryEventDto {
  readonly type: string;
  readonly source: string;
  readonly occurredAt: string;
  readonly normalizedStatus?: string;
  readonly providerStatusRaw?: string;
}

export interface DeliveryAttemptDto {
  readonly attemptNumber: number;
  readonly outcome: DeliveryAttemptOutcomeDto;
  readonly reasonCode?: string;
  readonly note?: string;
  readonly attemptedAt: string;
  readonly nextAttemptAt?: string;
}

export interface DeliveryExceptionDto {
  readonly id: string;
  readonly type: string;
  readonly severity: 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';
  readonly summary: string;
  readonly createdAt: string;
}

export interface DeliveryClaimDto {
  readonly id: string;
  readonly version: number;
  readonly claimNumber: string;
  readonly reason: 'LOST' | 'DAMAGED' | 'COD_MISMATCH' | 'OVERCHARGE' | 'OTHER';
  readonly status: 'OPEN' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'PAID' | 'CLOSED';
  readonly claimedAmount?: string;
  readonly approvedAmount?: string;
  readonly currency: string;
}

export interface DeliveryDto {
  readonly id: string;
  readonly version: number;
  readonly deliveryNumber: string;
  readonly orderId: string;
  readonly orderNumber: string;
  readonly fulfillmentId: string;
  readonly fulfillmentNumber: string;
  readonly method: string;
  readonly operationalStatus: DeliveryOperationalStatusDto;
  readonly outcomeStatus: DeliveryOutcomeStatusDto;
  readonly recipient: {
    readonly name: string;
    readonly phone: string;
    readonly address: string;
  };
  readonly cod: {
    readonly required: boolean;
    readonly expectedAmount: string;
    readonly currency: string;
  };
  readonly manualCarrierName?: string;
  readonly trackingReference?: string;
  readonly activeBooking?: CourierBookingDto;
  readonly lines: readonly DeliveryLineDto[];
  readonly events: readonly DeliveryEventDto[];
  readonly attempts: readonly DeliveryAttemptDto[];
  readonly exceptions: readonly DeliveryExceptionDto[];
  readonly claims: readonly DeliveryClaimDto[];
}

export interface CreateDeliveryInputDto {
  readonly fulfillmentId: string;
}

export interface ManualCourierBookingInputDto {
  readonly version: number;
  readonly carrierName: string;
  readonly trackingReference: string;
}

export interface RequestCourierBookingInputDto {
  readonly version: number;
  readonly integrationAccountId: string;
  readonly packageWeightKg?: string;
}

export interface CourierQuoteDto {
  readonly id: string;
  readonly amount: string;
  readonly currency: string;
  readonly baseAmount?: string;
  readonly discountAmount?: string;
  readonly codFeeAmount?: string;
  readonly additionalChargeAmount?: string;
  readonly providerQuoteReference?: string;
}

export interface CourierAccountDto {
  readonly id: string;
  readonly providerCode: string;
  readonly name: string;
  readonly capabilities: Record<string, boolean>;
}

export interface CustomerDeliveryHistoryDto {
  readonly eligibleDeliveries: number;
  readonly deliveredCount: number;
  readonly failedDeliveryCount: number;
  readonly rtoCount: number;
  readonly successRate: number | null;
  readonly rtoRate: number | null;
  readonly risk: {
    readonly level: 'INSUFFICIENT_HISTORY' | 'LOW' | 'MODERATE' | 'ELEVATED';
    readonly reasons: readonly { readonly code: string; readonly explanation: string }[];
  };
}

export interface DeliveryFinancialObservationDto {
  readonly id: string;
  readonly type: 'COLLECTION' | 'CHARGE';
  readonly chargeType?: string;
  readonly amount: string;
  readonly currency: string;
  readonly occurredAt: string;
  readonly providerReference?: string;
}

// ---------------------------------------------------------------------------
// Returns & Reverse Logistics (RTO & Customer Returns) Contracts
// ---------------------------------------------------------------------------

export type ReturnCaseTypeDto = 'CUSTOMER_RETURN' | 'RTO';
export type ReturnCaseStatusDto = 'OPEN' | 'RESOLVED' | 'CANCELLED';
export type ReturnAuthorizationStatusDto =
  'NOT_REQUIRED' | 'PENDING' | 'APPROVED' | 'PARTIALLY_APPROVED' | 'REJECTED';
export type ReturnTransportStatusDto =
  'NOT_STARTED' | 'EXPECTED' | 'IN_TRANSIT' | 'ARRIVED' | 'LOST' | 'CANCELLED';
export type ReturnReceiptStatusDto =
  'NOT_RECEIVED' | 'PARTIALLY_RECEIVED' | 'RECEIVED' | 'DISCREPANCY';
export type ReturnInspectionStatusDto =
  'NOT_REQUIRED' | 'PENDING' | 'PARTIALLY_INSPECTED' | 'COMPLETED';
export type ReturnResolutionStatusDto =
  'PENDING' | 'NO_REFUND_REQUIRED' | 'REFUND_PENDING' | 'REFUND_COMPLETED' | 'OTHER_RESOLUTION';

export interface ReturnLineDto {
  readonly id: string;
  readonly orderLineId: string;
  readonly sku: string;
  readonly productTitle: string;
  readonly requestedQuantity: string;
  readonly authorizedQuantity: string;
  readonly receivedQuantity: string;
}

export interface ReturnCaseDto {
  readonly id: string;
  readonly version: string;
  readonly returnNumber: string;
  readonly caseType: ReturnCaseTypeDto;
  readonly caseStatus: ReturnCaseStatusDto;
  readonly authorizationStatus: ReturnAuthorizationStatusDto;
  readonly transportStatus: ReturnTransportStatusDto;
  readonly receiptStatus: ReturnReceiptStatusDto;
  readonly inspectionStatus: ReturnInspectionStatusDto;
  readonly commercialResolutionStatus: ReturnResolutionStatusDto;
  readonly orderId: string;
  readonly orderNumber: string;
  readonly customerName: string | null;
  readonly reasonCode: string;
  readonly reasonText?: string | null;
  readonly deliveryId?: string | null;
  readonly createdAt: string;
  readonly lines?: readonly ReturnLineDto[];
}

export interface ReturnReceiptLineDto {
  readonly id: string;
  readonly receiptNumber: string;
  readonly version: string;
  readonly sku: string;
  readonly quantity: string;
  readonly inspectedQuantity: string;
  readonly conditionCode: 'SELLABLE' | 'DAMAGED' | 'QUARANTINE' | 'INSPECTION';
}

export interface ReturnReceiptDto {
  readonly id: string;
  readonly receiptNumber: string;
  readonly status: string;
  readonly receivingLocationId: string;
  readonly receivingLocationName?: string;
  readonly postedAt: string;
  readonly lines: readonly ReturnReceiptLineDto[];
}

export interface CreateReturnCaseInputDto {
  readonly orderId: string;
  readonly reasonCode: string;
  readonly reasonText?: string;
  readonly lines: readonly {
    readonly orderLineId: string;
    readonly quantity: string;
  }[];
}

export interface AuthorizeReturnCaseInputDto {
  readonly version: number;
}

export interface PostReturnReceiptInputDto {
  readonly locationId: string;
  readonly lines: readonly {
    readonly returnLineId: string;
    readonly quantity: string;
  }[];
}

export interface InspectReturnReceiptLineInputDto {
  readonly version: number;
  readonly quantity: string;
  readonly outcome: 'SELLABLE' | 'DAMAGED' | 'QUARANTINE' | 'REJECTED_RETURN';
  readonly note?: string;
}

export interface InitiateRtoInputDto {
  readonly deliveryId: string;
}

// ---------------------------------------------------------------------------
// Steadfast Courier Configuration Contracts
// ---------------------------------------------------------------------------

export type SteadfastEnvironmentDto = 'SANDBOX' | 'PRODUCTION';

export interface SteadfastSafeConfigurationDto {
  readonly accountId: string;
  readonly name: string;
  readonly environment: SteadfastEnvironmentDto;
  readonly status: string;
  readonly connectionStatus: 'NOT_CHECKED' | 'CONNECTED' | 'ERROR';
  readonly lastValidatedAt?: string;
  readonly lastErrorCode?: string;
  readonly hasCredentials: boolean;
  readonly capabilities: Record<string, boolean>;
}

export interface ConfigureSteadfastInputDto {
  readonly accountId?: string;
  readonly name?: string;
  readonly environment: SteadfastEnvironmentDto;
  readonly apiKey?: string;
  readonly secretKey?: string;
}

// ---------------------------------------------------------------------------
// Media Platform Contracts
// ---------------------------------------------------------------------------

export type MediaRenditionKeyDto = 'thumbnail' | 'card' | 'pdp' | 'zoom';

export type MediaStatusDto =
  | 'PENDING_UPLOAD'
  | 'UPLOADED'
  | 'PROCESSING'
  | 'READY'
  | 'FAILED'
  | 'QUARANTINED'
  | 'ARCHIVED'
  | 'TRASHED'
  | 'PURGING';

export type MediaVisibilityDto = 'PUBLIC' | 'PRIVATE';

export type MediaAssetTypeDto = 'IMAGE' | 'DOCUMENT';

export interface MediaLibraryItemDto {
  readonly id: string;
  readonly originalFilename: string;
  readonly assetType: MediaAssetTypeDto;
  readonly mimeType: string;
  readonly byteSize: number;
  readonly status: MediaStatusDto;
  readonly visibility: MediaVisibilityDto;
  readonly width: number | null;
  readonly height: number | null;
  readonly title: string | null;
  readonly altText: string | null;
  readonly caption: string | null;
  readonly internalDescription: string | null;
  readonly folderId: string | null;
  readonly folderName: string | null;
  readonly tagIds: readonly string[];
  readonly version: number;
  readonly usageCount: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface MediaFolderDto {
  readonly id: string;
  readonly name: string;
  readonly parentId: string | null;
  readonly version: number;
}

export interface MediaTagDto {
  readonly id: string;
  readonly name: string;
}

export interface ProductMediaPlacementInputDto {
  readonly assetId: string;
  readonly role: 'GALLERY' | 'THUMBNAIL' | 'COLOR_GALLERY' | 'SIZE_DIAGRAM';
  readonly position: number;
  readonly variantId?: string | null;
  readonly optionValueId?: string | null;
  readonly isPrimary?: boolean;
  readonly altTextOverride?: string | null;
}

export interface MediaBulkOrganizeDto {
  readonly assetIds: readonly string[];
  readonly folderId?: string | null;
  readonly addTagIds?: readonly string[];
  readonly removeTagIds?: readonly string[];
}

export interface MediaBulkTrashDto {
  readonly assetIds: readonly string[];
}

/** IAM & Team Access contracts. */
export type MembershipTypeDto = 'OWNER' | 'STANDARD';
export type MembershipStatusDto = 'INVITED' | 'ACTIVE' | 'DISABLED' | 'EXPIRED_INVITE' | 'REMOVED';
export type CapabilitySensitivityDto = 'INTERNAL' | 'HIGH' | 'CRITICAL' | 'RESTRICTED';
export type ScopeTypeDto = 'LOCATION';

export interface AccessScopeDto {
  readonly capabilityCode: string;
  readonly scopeType: ScopeTypeDto;
  readonly scopeId: string;
}

export interface TeamMemberListItemDto {
  readonly id: string;
  readonly user_id?: string;
  readonly name: string;
  readonly email: string;
  readonly two_factor_enabled: boolean;
  readonly membership_type: MembershipTypeDto;
  readonly status: MembershipStatusDto;
  readonly version: string | number;
  readonly access_version?: string | number;
  readonly created_at: string;
  readonly updated_at?: string;
  readonly capabilities: readonly string[];
  readonly scopes: readonly AccessScopeDto[];
}

export interface CapabilityCatalogItemDto {
  readonly capability_code: string;
  readonly domain: string;
  readonly description: string;
  readonly sensitivity: CapabilitySensitivityDto;
  readonly supported_scope_types?: readonly ScopeTypeDto[];
  readonly status?: string;
}

export interface PermissionPresetDto {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly is_system_default?: boolean;
  readonly version?: string | number;
  readonly capability_codes: readonly string[];
  readonly member_count?: number;
}

export interface TeamLocationOptionDto {
  readonly id: string;
  readonly name: string;
  readonly code: string;
  readonly type: string;
}

export interface TeamMemberDetailDto extends TeamMemberListItemDto {
  readonly invited_at?: string | null;
  readonly activated_at?: string | null;
  readonly disabled_at?: string | null;
  readonly removed_at?: string | null;
  readonly lifecycle_reason?: string | null;
}

export interface CreatePermissionPresetRequestDto {
  readonly name: string;
  readonly description?: string;
  readonly capabilityCodes: readonly string[];
}

export interface UpdatePermissionPresetRequestDto {
  readonly expectedVersion: number;
  readonly name: string;
  readonly description?: string;
  readonly capabilityCodes: readonly string[];
}

export interface DeletePermissionPresetRequestDto {
  readonly expectedVersion: number;
}

export interface MembershipInvitationDto {
  readonly id: string;
  readonly email: string;
  readonly display_name: string;
  readonly status: string;
  readonly expires_at: string;
  readonly last_sent_at: string | null;
  readonly delivery_attempt_count: number;
  readonly version: string | number;
  readonly capability_codes: readonly string[];
  readonly scopes?: readonly AccessScopeDto[];
}

export interface TeamAuditItemDto {
  readonly id: string;
  readonly event_id?: string;
  readonly action: string;
  readonly actor_id?: string | null;
  readonly actorId?: string;
  readonly membership_id?: string | null;
  readonly membershipId?: string | null;
  readonly actor_name?: string | null;
  readonly actorName?: string | null;
  readonly actor_email?: string | null;
  readonly actorEmail?: string | null;
  readonly target_type?: string | null;
  readonly targetType?: string | null;
  readonly target_id?: string | null;
  readonly targetId?: string | null;
  readonly target_name?: string | null;
  readonly targetName?: string | null;
  readonly target_email?: string | null;
  readonly targetEmail?: string | null;
  readonly occurredAt?: string;
  readonly created_at?: string;
  readonly reason: string | null;
  readonly before_diff?: unknown;
  readonly beforeDiff?: unknown;
  readonly after_diff?: unknown;
  readonly afterDiff?: unknown;
  readonly metadata?: unknown;
}

export interface AuthSessionDto {
  readonly id?: string;
  readonly createdAt?: string;
  readonly updatedAt?: string;
  readonly expiresAt?: string;
  readonly ipAddress?: string | null;
  readonly userAgent?: string | null;
}

export interface CreateMembershipInvitationRequestDto {
  readonly email: string;
  readonly displayName: string;
  readonly capabilityCodes: readonly string[];
  readonly scopes: readonly AccessScopeDto[];
  readonly expiresInHours?: number;
}

export interface ResendMembershipInvitationRequestDto {
  readonly expectedVersion: number;
  readonly expiresInHours?: number;
}

export interface RevokeMembershipInvitationRequestDto {
  readonly expectedVersion: number;
  readonly reason: string;
}

export interface AcceptMembershipInvitationRequestDto {
  readonly token: string;
  readonly password?: string;
}

export interface ReplaceMemberPermissionsRequestDto {
  readonly expectedVersion: number;
  readonly capabilityCodes: readonly string[];
  readonly scopes: readonly AccessScopeDto[];
  readonly reason?: string;
}

export interface ChangeMemberLifecycleRequestDto {
  readonly expectedVersion: number;
  readonly reason: string;
}

export interface TransferOwnershipRequestDto {
  readonly targetMembershipId: string;
  readonly expectedOwnerVersion: number;
  readonly expectedTargetVersion: number;
  readonly reason: string;
}

export interface AdminContextDto {
  readonly actorId: string;
  readonly organizationId: string;
  readonly membershipId: string;
  readonly membershipType: MembershipTypeDto;
  readonly capabilities: readonly string[];
  readonly scopes: readonly AccessScopeDto[];
}

export type EmailNotificationStatus =
  | 'NOT_APPLICABLE'
  | 'SKIPPED_NO_EMAIL'
  | 'PENDING_MANUAL'
  | 'QUEUED'
  | 'PROCESSING'
  | 'SENT'
  | 'DELIVERED'
  | 'DELIVERY_DELAYED'
  | 'FAILED'
  | 'BOUNCED'
  | 'COMPLAINED'
  | 'SUPPRESSED'
  | 'READ';

export type EmailTriggerType = 'AUTOMATIC' | 'MANUAL' | 'TEST' | 'RESEND';

export interface EmailNotificationRowDto {
  readonly id: string;
  readonly notification_type: string;
  readonly status: EmailNotificationStatus;
  readonly intended_recipient: string | null;
  readonly effective_recipient: string | null;
  readonly rendered_subject: string | null;
  readonly source_id: string;
  readonly source_domain: string;
  readonly provider: string | null;
  readonly provider_message_id: string | null;
  readonly trigger_type: EmailTriggerType;
  readonly created_at: string;
  readonly queued_at?: string | null;
  readonly sent_at?: string | null;
  readonly delivered_at?: string | null;
  readonly skip_reason?: string | null;
  readonly failure_code?: string | null;
  readonly failure_message?: string | null;
  readonly customer_id?: string | null;
  readonly parent_notification_id?: string | null;
  readonly template_key?: string | null;
  readonly template_version?: number | null;
}

export interface EmailDeliveryAttemptDto {
  readonly id: number;
  readonly attempt_number: number;
  readonly provider: string;
  readonly provider_message_id: string | null;
  readonly status: string;
  readonly started_at: string;
  readonly completed_at: string | null;
  readonly next_retry_at: string | null;
  readonly error_code: string | null;
  readonly error_metadata: Record<string, unknown>;
}

export interface EmailTimelineEventDto {
  readonly id: number;
  readonly event_type: string;
  readonly event_at: string;
  readonly source: 'APPLICATION' | 'PROVIDER' | 'ADMIN';
  readonly provider_event_id: string | null;
  readonly metadata: Record<string, unknown>;
  readonly actor_name?: string | null;
}

export interface EmailNotificationDetailDto extends EmailNotificationRowDto {
  readonly attempts: readonly EmailDeliveryAttemptDto[];
  readonly timeline: readonly EmailTimelineEventDto[];
  readonly rendered_html: string | null;
  readonly rendered_body: string;
  readonly availableActions: {
    readonly canRetry: boolean;
    readonly canResend: boolean;
    readonly canPreview: boolean;
    readonly retryReason?: string;
    readonly resendReason?: string;
  };
  readonly recipientSuppressed: boolean;
}

export interface EmailPolicyDto {
  readonly notification_type: string;
  readonly delivery_requirement: string;
  readonly template_key: string | null;
  readonly enabled: boolean;
  readonly automatic_enabled: boolean;
  readonly manual_allowed: boolean;
  readonly updated_at: string | null;
}

export interface EmailSuppressionDto {
  readonly id: string;
  readonly normalized_email: string;
  readonly reason: 'HARD_BOUNCE' | 'COMPLAINT' | 'ADMINISTRATOR' | 'PROVIDER';
  readonly source: string;
  readonly provider: string | null;
  readonly active: boolean;
  readonly created_at: string;
  readonly cleared_at: string | null;
  readonly clear_reason: string | null;
}

export interface EmailDiagnosticsDto {
  readonly provider: string;
  readonly environment: string;
  readonly enabled: boolean;
  readonly from: string;
  readonly replyTo: string;
  readonly providerConfigured: boolean;
  readonly webhookConfigured: boolean;
  readonly testRecipientOverride: string | null;
  readonly allowedTestRecipients: readonly string[];
  readonly queued: number;
  readonly processing: number;
  readonly failed: number;
  readonly delivered: number;
  readonly suppressed: number;
  readonly last_webhook_at: string | null;
  readonly oldest_queued_at: string | null;
  readonly worker_status: 'HEALTHY' | 'BACKLOG' | 'DEGRADED' | 'IDLE';
  readonly top_failure_reason: { readonly code: string; readonly count: number } | null;
  readonly today: {
    readonly created: number;
    readonly queued: number;
    readonly sent: number;
    readonly delivered: number;
    readonly failed: number;
    readonly bounced: number;
    readonly complained: number;
    readonly suppressed: number;
  };
  readonly last_7_days: {
    readonly total: number;
    readonly delivered: number;
    readonly failed: number;
    readonly success_rate: number | null;
  };
}

export type SmsNotificationStatus =
  | 'NOT_APPLICABLE'
  | 'SKIPPED_NO_PHONE'
  | 'PENDING_MANUAL'
  | 'QUEUED'
  | 'PROCESSING'
  | 'ACCEPTED'
  | 'DELIVERED'
  | 'DELIVERY_DELAYED'
  | 'FAILED'
  | 'REJECTED'
  | 'EXPIRED'
  | 'UNDELIVERABLE'
  | 'UNKNOWN_PROVIDER_OUTCOME'
  | 'SUPPRESSED';

export type SmsTriggerType = 'AUTOMATIC' | 'MANUAL' | 'TEST' | 'RESEND';

export interface SmsNotificationRowDto {
  readonly id: string;
  readonly notification_type: string;
  readonly status: SmsNotificationStatus;
  readonly intended_recipient: string | null;
  readonly effective_recipient: string | null;
  readonly source_id: string;
  readonly source_domain: string;
  readonly provider: string | null;
  readonly provider_message_id: string | null;
  readonly trigger_type: SmsTriggerType;
  readonly created_at: string;
  readonly queued_at: string | null;
  readonly sent_at: string | null;
  readonly delivered_at: string | null;
  readonly skip_reason: string | null;
  readonly failure_code: string | null;
  readonly failure_message: string | null;
  readonly customer_id: string | null;
  readonly parent_notification_id: string | null;
  readonly template_key: string | null;
  readonly template_version: number | null;
  readonly encoding: 'GSM_7' | 'UNICODE';
  readonly character_count: number;
  readonly estimated_segments: number;
  readonly provider_reported_segments: number | null;
  readonly provider_reported_cost: string | null;
  readonly provider_cost_currency: string | null;
  readonly sender_type: 'MASKING' | 'NON_MASKING' | 'PROVIDER_DEFAULT';
  readonly sender_id: string | null;
  readonly order_number: string | null;
  readonly customer_name: string | null;
  readonly latest_attempt_status: string | null;
  readonly next_retry_at: string | null;
}

export interface SmsProviderEventDto {
  readonly id: number;
  readonly provider: string;
  readonly provider_event_id: string;
  readonly provider_message_id: string | null;
  readonly provider_status: string;
  readonly normalized_status: string;
  readonly provider_occurred_at: string | null;
  readonly received_at: string;
  readonly processed_at: string | null;
  readonly processing_result: string | null;
  readonly safe_metadata: Record<string, unknown>;
}

export interface SmsAuditEventDto {
  readonly id: number;
  readonly action: string;
  readonly actor_name: string | null;
  readonly reason: string | null;
  readonly metadata: Record<string, unknown> | null;
  readonly created_at: string;
}

export interface SmsNotificationDetailDto extends SmsNotificationRowDto {
  readonly rendered_body: string;
  readonly original_recipient: string | null;
  readonly normalized_recipient: string | null;
  readonly encoding_unit_count: number;
  readonly reconcile_after: string | null;
  readonly attempts: readonly EmailDeliveryAttemptDto[];
  readonly timeline: readonly EmailTimelineEventDto[];
  readonly providerEvents: readonly SmsProviderEventDto[];
  readonly auditEvents: readonly SmsAuditEventDto[];
  readonly relatedNotifications: readonly SmsNotificationRowDto[];
  readonly recommendedAction: {
    readonly code: string;
    readonly label: string;
    readonly explanation: string;
  };
  readonly permissions: {
    readonly canRetry: boolean;
    readonly canResend: boolean;
    readonly canPreview: boolean;
  };
  readonly availableActions: {
    readonly canRetry: boolean;
    readonly canResend: boolean;
    readonly canPreview: boolean;
    readonly retryReason: string;
    readonly resendReason: string;
  };
}

export type SmsPolicyDto = EmailPolicyDto;

export interface SmsSuppressionDto {
  readonly id: string;
  readonly normalized_phone: string;
  readonly reason:
    | 'INVALID_NUMBER'
    | 'PERMANENT_DELIVERY_FAILURE'
    | 'CUSTOMER_REQUEST'
    | 'ADMIN_SUPPRESSION'
    | 'PROVIDER_BLOCK';
  readonly source: string;
  readonly provider: string | null;
  readonly active: boolean;
  readonly created_at: string;
  readonly cleared_at: string | null;
  readonly clear_reason: string | null;
}

export interface SmsTemplateDto {
  readonly key: string;
  readonly version: number;
  readonly event: string;
  readonly description: string;
}

export interface SmsPreviewDto {
  readonly templateKey: string;
  readonly templateVersion: number;
  readonly event: string;
  readonly renderedText: string;
  readonly encoding: 'GSM_7' | 'UNICODE';
  readonly characterCount: number;
  readonly encodingUnitCount: number;
  readonly segmentCount: number;
  readonly perSegmentLimit: number;
  readonly segmentCapacity: number;
  readonly unitsRemainingInSegment: number;
  readonly warnings: readonly string[];
  readonly unicodeTriggerCharacters?: readonly string[];
  readonly intendedRecipient: string | null;
  readonly normalizedRecipient: string | null;
  readonly phoneValidation: 'VALID' | 'MISSING' | 'INVALID';
  readonly isSampleFixture: boolean;
}

export interface SmsDiagnosticsDto {
  readonly enabled: boolean;
  readonly provider: string;
  readonly providerConfigured: boolean;
  readonly environment: string;
  readonly senderType: string;
  readonly senderId: string | null;
  readonly recipientOverride: string | null;
  readonly capabilities: readonly string[];
  readonly credentialsConfigured: boolean;
  readonly mode: 'DISABLED' | 'MOCK' | 'PRODUCTION';
  readonly allowedTestRecipients: readonly string[];
  readonly callbackSupported: boolean;
  readonly pollingSupported: boolean;
  readonly callbackConfigured: boolean;
  readonly queued: number;
  readonly processing: number;
  readonly failed: number;
  readonly accepted: number;
  readonly delivered: number;
  readonly skipped: number;
  readonly suppressed: number;
  readonly activeSuppressions: number;
  readonly estimatedSegments: number;
  readonly unicodeMessages: number;
  readonly gsm7Messages: number;
  readonly retriesScheduled: number;
  readonly today: {
    readonly created: number;
    readonly queued: number;
    readonly accepted: number;
    readonly delivered: number;
    readonly failed: number;
    readonly skipped: number;
    readonly suppressed: number;
    readonly estimatedSegments: number;
  };
  readonly last7Days: {
    readonly created: number;
    readonly delivered: number;
    readonly failed: number;
    readonly deliveryRate: number | null;
  };
  readonly oldestQueuedAt: string | null;
  readonly lastDeliveryCallbackAt: string | null;
  readonly lastWorkerActivityAt: string | null;
  readonly workerStatus: 'HEALTHY' | 'BACKLOG' | 'IDLE' | 'UNAVAILABLE';
  readonly readiness: readonly {
    readonly key: string;
    readonly label: string;
    readonly state: 'READY' | 'PENDING' | 'UNAVAILABLE';
    readonly explanation: string;
  }[];
}

export type OrderSmsEligibilityCode =
  | 'ELIGIBLE'
  | 'NO_PHONE'
  | 'INVALID_PHONE'
  | 'SMS_GLOBALLY_DISABLED'
  | 'EVENT_POLICY_DISABLED'
  | 'PROVIDER_NOT_CONFIGURED'
  | 'RECIPIENT_SUPPRESSED'
  | 'WAITING_FOR_ORDER_STATE'
  | SmsNotificationStatus;

export interface OrderSmsEligibilityDto {
  readonly orderId: string;
  readonly orderNumber: string;
  readonly orderStatus: string;
  readonly customerPhone: string | null;
  readonly normalizedPhone: string | null;
  readonly isSuppressed: boolean;
  readonly suppressionReason: string | null;
  readonly globalSmsEnabled: boolean;
  readonly providerConfigured: boolean;
  readonly providerName: string;
  readonly recipientOverride: string | null;
  readonly phoneValidation: 'VALID' | 'MISSING' | 'INVALID';
  readonly permissions: {
    readonly canManualSend: boolean;
    readonly canPreview: boolean;
    readonly canRetry: boolean;
    readonly canResend: boolean;
  };
  readonly events: readonly {
    readonly notificationType: string;
    readonly templateKey: string | null;
    readonly policy: {
      readonly enabled: boolean;
      readonly automaticEnabled: boolean;
      readonly manualAllowed: boolean;
    };
    readonly orderReachedState: boolean;
    readonly canSendManually: boolean;
    readonly eligibilityCode: OrderSmsEligibilityCode;
    readonly decisionSteps: readonly {
      readonly key: string;
      readonly label: string;
      readonly passed: boolean;
      readonly explanation: string;
    }[];
    readonly latestNotification: SmsNotificationRowDto | null;
  }[];
}

export type SmsMockScenario =
  | 'ACCEPTED'
  | 'DELIVERED'
  | 'DELAYED'
  | 'TRANSIENT_FAILURE'
  | 'PERMANENT_FAILURE'
  | 'RATE_LIMITED'
  | 'UNKNOWN_OUTCOME'
  | 'UNDELIVERABLE';

export type OrderEmailEligibilityCode =
  | 'DELIVERED'
  | 'ACCEPTED'
  | 'QUEUED'
  | 'FAILED'
  | 'READY_TO_SEND'
  | 'WAITING_FOR_ORDER_STATE'
  | 'CUSTOMER_EMAIL_MISSING'
  | 'RECIPIENT_SUPPRESSED'
  | 'POLICY_DISABLED'
  | 'GLOBAL_EMAIL_DISABLED'
  | 'MANUAL_SEND_FORBIDDEN';

export interface OrderEmailEventEligibilityDto {
  readonly notificationType: string;
  readonly templateKey: string;
  readonly label: string;
  readonly description: string;
  readonly policy: {
    readonly enabled: boolean;
    readonly automaticEnabled: boolean;
    readonly manualAllowed: boolean;
  };
  readonly orderReachedState: boolean;
  readonly canSendManually: boolean;
  readonly eligibilityCode: OrderEmailEligibilityCode;
  readonly explanation: string;
  readonly latestNotification: EmailNotificationRowDto | null;
}

export interface OrderEmailEligibilityDto {
  readonly orderId: string;
  readonly orderNumber: string;
  readonly orderStatus: string;
  readonly customerEmail: string | null;
  readonly isSuppressed: boolean;
  readonly suppressionReason: string | null;
  readonly globalEmailEnabled: boolean;
  readonly events: readonly OrderEmailEventEligibilityDto[];
}

// ---------------------------------------------------------------------------
// Centralized Runtime Configuration & Settings Domain Contracts
// ---------------------------------------------------------------------------

export type SettingScope = 'ORGANIZATION' | 'SYSTEM';
export type SettingDataType = 'string' | 'number' | 'boolean' | 'json' | 'string_list';
export type SettingSource = 'DEFAULT' | 'DATABASE' | 'DEPLOYMENT_OVERRIDE';

export type SettingsReadinessStatus =
  'ready' | 'needs_configuration' | 'disabled' | 'restricted' | 'error';

export interface SettingMetadataDto {
  readonly key: string;
  readonly module: string;
  readonly label: string;
  readonly description: string;
  readonly type: SettingDataType;
  readonly defaultValue: unknown;
  readonly sensitive: boolean;
  readonly runtimeMutable: boolean;
  readonly requiresRestart: boolean;
  readonly allowedValues?: readonly string[];
}

export interface SettingEntryDto {
  readonly key: string;
  readonly module: string;
  readonly label: string;
  readonly description: string;
  readonly type: SettingDataType;
  readonly value: unknown;
  readonly effectiveValue: unknown;
  readonly defaultValue: unknown;
  readonly source: SettingSource;
  readonly sensitive: boolean;
  readonly runtimeMutable: boolean;
  readonly requiresRestart: boolean;
  readonly updatedAt?: string | null;
  readonly updatedBy?: string | null;
}

export interface EmailSettingsDto {
  readonly enabled: boolean;
  readonly provider: 'local' | 'resend';
  readonly fromName: string;
  readonly fromAddress: string;
  readonly replyTo: string;
  readonly testRecipientOverride: string | null;
  readonly allowedTestRecipients: readonly string[];
}

export interface EmailReadinessDto {
  readonly status: SettingsReadinessStatus;
  readonly provider: 'local' | 'resend';
  readonly environment: 'development' | 'test' | 'production';
  readonly enabled: boolean;
  readonly effectiveEnabled: boolean;
  readonly providerConfigured: boolean;
  readonly webhookConfigured: boolean;
  readonly reasons: readonly string[];
}

export interface MediaSettingsDto {
  readonly maxUploadBytes: number;
  readonly uploadExpirySeconds: number;
}

export interface StorefrontSettingsDto {
  readonly publicBaseUrl: string;
  readonly storeName: string;
  readonly supportEmail: string;
  readonly supportPhone: string;
}

export interface GeneralSettingsDto {
  readonly storeName: string;
  readonly supportEmail: string;
  readonly timezone: string;
  readonly defaultCurrency: string;
  readonly lowStockThreshold: number;
  readonly sessionTimeoutMinutes: number;
}

export interface ModuleSettingsSummaryDto {
  readonly module: string;
  readonly label: string;
  readonly description: string;
  readonly settingCount: number;
  readonly readinessStatus?: SettingsReadinessStatus;
}

export interface SettingsListResponseDto {
  readonly modules: readonly ModuleSettingsSummaryDto[];
  readonly settings: readonly SettingEntryDto[];
}

export interface ModuleSettingsResponseDto<T = Record<string, unknown>> {
  readonly module: string;
  readonly settings: T;
  readonly effective: T;
  readonly readiness?: {
    readonly status: SettingsReadinessStatus;
    readonly reasons: readonly string[];
  };
  readonly schema: readonly SettingMetadataDto[];
  readonly version: number;
  readonly updatedAt?: string | null;
}

export interface IntegrationSecretStatusDto {
  readonly providerCode: string;
  readonly keyName: string;
  readonly configured: boolean;
  readonly updatedAt?: string | null;
}

export interface UpdateSettingInputDto {
  readonly key: string;
  readonly value: unknown;
  readonly reason?: string;
  readonly expectedVersion?: number;
}

export interface UpdateModuleSettingsInputDto {
  readonly settings: Record<string, unknown>;
  readonly reason?: string;
  readonly expectedVersion?: number;
}

export type HealthSeverity = 'HEALTHY' | 'INFO' | 'WARNING' | 'BLOCKING';

export interface ConfigurationHealthIssueDto {
  readonly id: string;
  readonly module: string;
  readonly severity: HealthSeverity;
  readonly title: string;
  readonly description: string;
  readonly actionLabel?: string;
  readonly actionHref?: string;
}

export interface ConfigurationHealthResponseDto {
  readonly overallStatus: 'HEALTHY' | 'NEEDS_ATTENTION' | 'CRITICAL';
  readonly issues: readonly ConfigurationHealthIssueDto[];
  readonly moduleStatuses: Record<
    string,
    {
      readonly status: SettingsReadinessStatus;
      readonly label: string;
      readonly settingCount: number;
      readonly issueCount: number;
    }
  >;
  readonly checkedAt: string;
}

export type IntegrationStatus =
  'CONNECTED' | 'NEEDS_CONFIGURATION' | 'RESTRICTED' | 'DEPLOYMENT_MANAGED';

export interface IntegrationSecretItemDto {
  readonly keyName: string;
  readonly label: string;
  readonly configured: boolean;
  readonly source: 'DATABASE' | 'DEPLOYMENT';
  readonly updatedAt?: string | null;
}

export interface IntegrationSummaryDto {
  readonly providerCode: string;
  readonly name: string;
  readonly category: 'EMAIL' | 'COURIER' | 'STORAGE' | 'PAYMENTS';
  readonly status: IntegrationStatus;
  readonly usedByModules: readonly string[];
  readonly description: string;
  readonly secrets: readonly IntegrationSecretItemDto[];
  readonly isDeploymentManaged: boolean;
  readonly docsUrl?: string;
  readonly details?: Record<string, unknown>;
}

export interface IntegrationTestResultDto {
  readonly success: boolean;
  readonly message: string;
  readonly latencyMs?: number;
  readonly checkedAt: string;
}

export interface SettingsAuditItemDto {
  readonly id: string;
  readonly action: string;
  readonly targetType: string;
  readonly targetId: string;
  readonly actorId: string | null;
  readonly actorName?: string | null;
  readonly reason?: string | null;
  readonly beforeDiff?: Record<string, unknown> | null;
  readonly afterDiff?: Record<string, unknown> | null;
  readonly createdAt: string;
}

export interface SettingsAuditListResponseDto {
  readonly items: readonly SettingsAuditItemDto[];
  readonly totalCount: number;
}

export interface SystemStatusDto {
  readonly environment: string;
  readonly nodeVersion: string;
  readonly uptimeSeconds: number;
  readonly memoryUsageMb: number;
  readonly database: {
    readonly status: 'CONNECTED' | 'DEGRADED' | 'DISCONNECTED';
    readonly latencyMs?: number;
    readonly managedBy: 'DEPLOYMENT';
  };
  readonly api: {
    readonly status: 'HEALTHY' | 'WARNING';
    readonly version: string;
  };
  readonly worker: {
    readonly status: 'HEALTHY' | 'UNKNOWN';
    readonly isRunning: boolean;
  };
  readonly storage: {
    readonly provider: string;
    readonly status: 'CONNECTED' | 'CONFIGURED';
    readonly managedBy: 'DEPLOYMENT';
  };
  readonly email: {
    readonly provider: string;
    readonly status: SettingsReadinessStatus;
  };
  readonly activeRevision: number;
}
