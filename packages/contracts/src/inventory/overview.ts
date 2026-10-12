export type InventoryAttentionCode =
  | 'OUT_OF_STOCK'
  | 'BELOW_REPLENISHMENT_THRESHOLD';

export interface InventoryOverviewAttentionDto {
  readonly code: InventoryAttentionCode;
  readonly severity: 'CRITICAL' | 'WARNING';
  readonly inventoryItemId: string;
  readonly variantId: string;
  readonly sku: string;
  readonly productTitle: string;
  readonly locationId: string;
  readonly locationName: string;
  readonly availableToSell: string;
  readonly replenishmentThreshold: number;
  readonly replenishmentThresholdSource:
    | 'LOCATION_POLICY'
    | 'ITEM_POLICY'
    | 'VARIANT'
    | 'ORGANIZATION_DEFAULT';
  readonly explanation: string;
  readonly owner: 'INVENTORY';
  readonly nextActionHref: string;
  readonly lastMovementAt: string | null;
}

export interface InventoryOverviewDto {
  readonly generatedAt: string;
  readonly scope: {
    readonly kind: 'ORGANIZATION' | 'LOCATIONS';
    readonly locationIds: readonly string[];
  };
  readonly kpis: {
    readonly onHand: string;
    readonly availableToSell: string;
    readonly reserved: string;
    readonly unavailable: string;
    readonly incomingSupply: string;
    readonly inTransitTransfer: string;
  };
  readonly attention: {
    readonly items: readonly InventoryOverviewAttentionDto[];
    readonly totalCount: number;
    readonly limit: number;
  };
  readonly workQueues: {
    readonly transfersInTransit: number;
    readonly transferDiscrepancies: number;
    readonly countsInProgress: number;
    readonly countsAwaitingReview: number;
    readonly unitsAwaitingQc: number;
    readonly repairsOpen: number;
    readonly activeReservations: number;
    readonly reservationExceptions: number;
  };
  readonly recentMovements: readonly {
    readonly movementId: string;
    readonly transactionType: string;
    readonly transactionNumber: string | null;
    readonly occurredAt: string;
    readonly sku: string;
    readonly productTitle: string;
    readonly locationId: string;
    readonly locationName: string;
    readonly condition: 'SELLABLE' | 'DAMAGED' | 'QUARANTINE' | 'INSPECTION';
    readonly quantityDelta: string;
    readonly actorDisplayName: string | null;
  }[];
  readonly locations: readonly {
    readonly locationId: string;
    readonly locationCode: string;
    readonly locationName: string;
    readonly onHand: string;
    readonly availableToSell: string;
    readonly unavailable: string;
    readonly attentionCount: number;
  }[];
}
