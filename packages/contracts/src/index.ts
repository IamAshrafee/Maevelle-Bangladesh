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
  readonly sizeSystemId?: string | null;
  readonly sizeGuideId?: string | null;
  readonly attributes?: readonly {
    readonly attributeDefinitionId: string;
    readonly value: string | boolean | null;
  }[];
  readonly initialVariant?: {
    readonly sku: string;
    readonly barcode?: string | null;
    readonly priceAmount?: string;
    readonly compareAtAmount?: string | null;
    readonly currency?: string;
  };
  readonly options?: readonly {
    readonly code?: string;
    readonly name: string;
    readonly position?: number;
    readonly values: readonly {
      readonly code?: string;
      readonly displayValue: string;
      readonly position?: number;
      readonly colorId?: string | null;
      readonly sizeDefinitionId?: string | null;
    }[];
  }[];
  readonly variants?: readonly {
    readonly sku: string;
    readonly title?: string | null;
    readonly barcode?: string | null;
    readonly priceAmount?: string | null;
    readonly compareAtAmount?: string | null;
    readonly currency?: string;
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
    readonly optionSelections?: readonly {
      readonly axisName: string;
      readonly valueDisplay: string;
    }[];
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
  readonly status: 'DRAFT' | 'PLACED' | 'CANCELLED';
  readonly supplierReference?: string;
  readonly orderDate: string;
  readonly expectedDate?: string;
  readonly destinationLocationId?: string;
  readonly destinationLocationName?: string;
  readonly notes?: string;
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

export interface InboundReceiptDto {
  readonly id: string;
  readonly receiptNumber: string;
  readonly shipmentId: string;
  readonly shipmentNumber: string;
  readonly locationId: string;
  readonly locationName: string;
  readonly inventoryTransactionId: string;
  readonly status: 'POSTED';
  readonly packingSlipReference?: string;
  readonly notes?: string;
  readonly postedAt: string;
  readonly lines: readonly {
    readonly id: string;
    readonly shipmentAllocationId: string;
    readonly variantId: string;
    readonly productId: string;
    readonly inventoryItemId?: string;
    readonly sku: string;
    readonly productTitle: string;
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
    readonly accountId: string;
    readonly accountName: string;
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
}

export type FinanceTransactionTypeDto =
  | 'OPENING_BALANCE'
  | 'EXPENSE_PAYMENT'
  | 'INTERNAL_TRANSFER'
  | 'EXTERNAL_ADJUSTMENT'
  | 'PAYMENT_SOURCE_POSTING'
  | 'REFUND_SOURCE_POSTING'
  | 'COD_SETTLEMENT';

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

export interface OrderSummaryDto {
  readonly id: string;
  readonly orderNumber: string;
  readonly status: string;
  readonly total: string;
  readonly currency: string;
  readonly createdAt: string;
  readonly customerId?: string;
  readonly customerName?: string;
  readonly customerEmail?: string;
}

export interface OrderDetailDto extends OrderSummaryDto {
  readonly version: number;
  readonly lines: readonly OrderLineDto[];
  readonly notes: readonly OrderNoteDto[];
  readonly timeline: readonly OrderTimelineEventDto[];
  readonly payment: OrderPaymentSummaryDto;
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
}

export interface OrderLineDto {
  readonly id: string;
  readonly variantId: string;
  readonly sku: string;
  readonly productTitle: string;
  readonly quantity: number;
  readonly unitPrice: string;
  readonly total: string;
}

export interface OrderNoteDto {
  readonly id: string;
  readonly body: string;
  readonly createdAt: string;
  readonly authorId: string;
}

export interface OrderTimelineEventDto {
  readonly id: string;
  readonly eventType: string;
  readonly occurredAt: string;
  readonly payload: Record<string, unknown>;
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
  readonly displayName: string;
  readonly email?: string;
  readonly phone?: string;
  readonly status: string;
  readonly createdAt: string;
}

export interface CustomerDetailDto extends CustomerSummaryDto {
  readonly version: number;
  readonly addresses: readonly CustomerAddressDto[];
  readonly phones: readonly CustomerPhoneDto[];
  readonly emails: readonly CustomerEmailDto[];
  readonly tags: readonly CustomerTagDto[];
  readonly notes: readonly CustomerNoteDto[];
}

export interface CustomerPhoneDto {
  readonly id: string;
  readonly phone: string;
  readonly isPrimary: boolean;
}

export interface CustomerEmailDto {
  readonly id: string;
  readonly email: string;
  readonly isPrimary: boolean;
  readonly isVerified: boolean;
}

export interface CustomerAddressDto {
  readonly id: string;
  readonly addressLine1: string;
  readonly addressLine2?: string;
  readonly city?: string;
  readonly isDefault: boolean;
  readonly version: number;
  readonly label?: string;
  readonly recipientName?: string;
  readonly phone?: string;
  readonly status: string;
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
  readonly authorId: string;
}
