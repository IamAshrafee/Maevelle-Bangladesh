export type ReplenishmentPolicySource =
  | 'LOCATION_POLICY'
  | 'ITEM_POLICY'
  | 'VARIANT'
  | 'ORGANIZATION_DEFAULT';

export interface ReplenishmentPolicyDto {
  readonly id: string;
  readonly inventoryItemId: string;
  readonly variantId: string;
  readonly sku: string;
  readonly productTitle: string;
  readonly locationId: string | null;
  readonly locationName: string | null;
  readonly reorderPoint: string;
  readonly safetyStock: string;
  readonly targetStock: string;
  readonly leadTimeDays: number | null;
  readonly preferredSourceLocationId: string | null;
  readonly preferredSourceLocationName: string | null;
  readonly preferredSupplierId: string | null;
  readonly preferredSupplierName: string | null;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ReplenishmentPolicyInput {
  readonly inventoryItemId: string;
  readonly locationId: string | null;
  readonly reorderPoint: string;
  readonly safetyStock: string;
  readonly targetStock: string;
  readonly leadTimeDays: number | null;
  readonly preferredSourceLocationId: string | null;
  readonly preferredSupplierId: string | null;
  readonly expectedVersion: number;
}

export type ReplenishmentRecommendationAction =
  | {
      readonly type: 'TRANSFER';
      readonly sourceLocationId: string;
      readonly sourceLocationName: string;
      readonly availableSurplus: string;
      readonly href: string;
    }
  | {
      readonly type: 'PURCHASE';
      readonly supplierId: string;
      readonly supplierName: string;
      readonly href: string;
    }
  | {
      readonly type: 'REVIEW_SOURCE';
      readonly href: string;
    };

export interface ReplenishmentRecommendationDto {
  readonly inventoryItemId: string;
  readonly variantId: string;
  readonly sku: string;
  readonly productTitle: string;
  readonly locationId: string;
  readonly locationName: string;
  readonly availableToSell: string;
  readonly incomingSupply: string;
  readonly incomingTransfer: string;
  readonly outgoingTransfer: string;
  readonly projectedAvailable: string;
  readonly reorderPoint: string;
  readonly safetyStock: string;
  readonly targetStock: string;
  readonly policySource: ReplenishmentPolicySource;
  readonly suggestedQuantity: string;
  readonly status: 'REPLENISH' | 'BELOW_THRESHOLD' | 'HEALTHY';
  readonly explanation: string;
  readonly suggestedAction: ReplenishmentRecommendationAction | null;
}

export interface ReplenishmentPolicyListDto {
  readonly items: readonly ReplenishmentPolicyDto[];
  readonly page: number;
  readonly limit: number;
  readonly total: number;
}

export interface ReplenishmentRecommendationListDto {
  readonly items: readonly ReplenishmentRecommendationDto[];
  readonly page: number;
  readonly limit: number;
  readonly total: number;
}
