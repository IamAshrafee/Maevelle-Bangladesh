import type {
  CatalogCategoryChoiceDto,
  CatalogColorDto,
  CatalogProductTypeDefinitionDto,
  CatalogVocabularyItemDto,
  SizeGuideSummaryDto,
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

export interface VariantMatrixRow {
  readonly id: string;
  enabled: boolean;
  title: string;
  optionSelections: readonly {
    readonly axisName: string;
    readonly valueDisplay: string;
  }[];
  sku: string;
  barcode: string;
  priceAmount: string;
  compareAtAmount: string;
  costAmount: string;
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

export interface OptionAxisState {
  readonly name: string;
  readonly values: readonly string[];
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
