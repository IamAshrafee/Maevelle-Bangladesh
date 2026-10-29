export interface VariantPriceDefinitionDto {
  readonly priceDefinitionId: string;
  readonly productId: string;
  readonly productTitle: string;
  readonly variantId: string;
  readonly variantTitle?: string | null;
  readonly sku: string;
  readonly amount: string;
  readonly compareAtAmount: string | null;
  readonly currency: string;
  readonly effectiveFrom: string;
  readonly effectiveTo: string | null;
  readonly status: 'ACTIVE' | 'DRAFT' | 'ARCHIVED';
  readonly version: number;
}

export interface CreatePriceDefinitionInputDto {
  readonly variantId: string;
  readonly currency: string;
  readonly amount: string;
  readonly compareAtAmount?: string | null;
  readonly effectiveFrom?: string;
  readonly effectiveTo?: string | null;
  readonly status?: 'ACTIVE' | 'DRAFT' | 'ARCHIVED';
}

export interface SetCurrentVariantPriceInputDto {
  readonly currency: string;
  readonly amount: string;
  readonly compareAtAmount?: string | null;
}

export interface ArchivePriceDefinitionResultDto {
  readonly priceDefinitionId: string;
  readonly status: 'ARCHIVED';
  readonly version: number;
}

