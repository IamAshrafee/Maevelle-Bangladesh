import type {
  CatalogCategoryChoiceDto,
  CatalogColorDto,
  CatalogProductTypeDefinitionDto,
  CatalogVocabularyItemDto,
  SizeGuideSummaryDto,
  WarehouseLocationDto,
} from '@maevelle/contracts';

export interface SizingReferenceData {
  readonly systems: readonly {
    readonly id: string;
    readonly sizingDomainId: string;
    readonly name: string;
    readonly status: 'ACTIVE' | 'ARCHIVED';
  }[];
  readonly sizeDefinitions: readonly {
    readonly id: string;
    readonly sizeSystemId: string;
    readonly code: string;
    readonly label: string;
    readonly sortOrder: number;
  }[];
}

export interface OptionValueState {
  readonly id: string; // clientRef or existing id
  readonly label: string;
  readonly isPrimary?: boolean;
  readonly colorId?: string | null;
  readonly colorHex?: string | null;
  readonly sizeDefinitionId?: string | null;
}

export interface OptionAxisState {
  readonly id: string; // clientRef or existing id
  readonly name: string;
  readonly isVisual: boolean;
  readonly values: readonly OptionValueState[];
}

export interface VariantStockEntry {
  locationId: string;
  locationName?: string;
  quantity: string;
}

export interface VariantMatrixRow {
  readonly id: string; // clientRef
  enabled: boolean;
  title: string;
  optionSelections: readonly {
    readonly axisName: string;
    readonly valueDisplay: string;
    readonly valueRef?: string;
  }[];
  sku: string;
  barcode: string;
  priceAmount: string;
  compareAtAmount: string;
  costAmount: string; // backward compat
  estimatedCostAmount: string;
  initialStock: VariantStockEntry[];
  primaryColorId: string | null;
  weightValue: string;
  weightUnit: 'G' | 'KG' | 'OZ' | 'LB';
  lengthValue: string;
  widthValue: string;
  heightValue: string;
  dimensionUnit: 'MM' | 'CM' | 'IN';
}

export interface StagedMediaItem {
  readonly id: string;
  readonly file?: File;
  previewUrl: string;
  assetId?: string;
  isPrimary: boolean;
  role?: 'GALLERY' | 'THUMBNAIL' | 'COLOR_GALLERY' | 'SIZE_DIAGRAM';
  variantId?: string | null;
  optionValueId?: string | null;
  variantRef?: string | null;
  optionValueRef?: string | null;
  position?: number;
  altText: string;
  isUploading: boolean;
  uploadProgress?: number;
  processingStage?: 'UPLOADING' | 'PROCESSING';
  error?: string;
}

export interface ShippingPreset {
  readonly label: string;
  readonly description: string;
  readonly weightValue: string;
  readonly weightUnit: 'G' | 'KG';
  readonly length: string;
  readonly width: string;
  readonly height: string;
  readonly dimensionUnit: 'CM';
}

export interface FaqEntry {
  readonly id: string;
  question: string;
  answer: string;
}

export interface InfoHighlightEntry {
  readonly id: string;
  label: string;
  value: string;
}

export interface ReadinessChecklistItem {
  readonly id: string;
  readonly label: string;
  readonly isComplete: boolean;
}

export interface ProductCreatorReferences {
  readonly types: readonly CatalogProductTypeDefinitionDto[];
  readonly categories: readonly CatalogCategoryChoiceDto[];
  readonly colors: readonly CatalogColorDto[];
  readonly tags: readonly CatalogVocabularyItemDto[];
  readonly occasions: readonly CatalogVocabularyItemDto[];
  readonly collections: readonly CatalogVocabularyItemDto[];
  readonly sizingData: SizingReferenceData;
  readonly sizeGuides: readonly SizeGuideSummaryDto[];
  readonly locations: readonly WarehouseLocationDto[];
}

export interface ProductCreatorDraft {
  readonly timestamp: number;
  readonly title: string;
  readonly handle: string;
  readonly productTypeId: string;
  readonly description: string;
  readonly selectedCategoryIds: readonly string[];
  readonly primaryCategoryId: string;
  readonly selectedTagIds: readonly string[];
  readonly selectedOccasionIds: readonly string[];
  readonly selectedCollectionIds: readonly string[];
  readonly sizeSystemId: string;
  readonly sizeGuideId: string;
  readonly attributeValues: Record<string, string | boolean>;
  readonly variantMode: 'simple' | 'variants';
  readonly priceAmount: string;
  readonly compareAtAmount: string;
  readonly costAmount: string;
  readonly estimatedCostAmount: string;
  readonly initialStock: VariantStockEntry[];
  readonly sku: string;
  readonly barcode: string;
  readonly optionAxes: readonly OptionAxisState[];
  readonly matrixRows: readonly VariantMatrixRow[];
  readonly weightValue: string;
  readonly weightUnit: 'G' | 'KG';
  readonly lengthValue: string;
  readonly widthValue: string;
  readonly heightValue: string;
  readonly dimensionUnit: 'CM' | 'MM' | 'IN';
  readonly seoTitle: string;
  readonly seoDescription: string;
  readonly highlights: readonly InfoHighlightEntry[];
  readonly faqs: readonly FaqEntry[];
}
