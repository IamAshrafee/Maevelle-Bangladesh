export const SKYBUY_REQUIRED_SHEETS = [
  'Summary',
  'Orders',
  'Order Items',
  'Products',
  'Variants',
  'Charges',
  'Payments',
  'Timeline',
  'Shipment Videos',
  'Data Quality',
  'Extra Fields',
  'Errors',
  'Run Info',
] as const;

export type SkyBuySheetName = (typeof SKYBUY_REQUIRED_SHEETS)[number];
export type SkyBuyCell = string | number | boolean | null;
export type SkyBuyRow = Readonly<Record<string, SkyBuyCell>>;

export interface SkyBuySheet {
  readonly name: SkyBuySheetName;
  readonly headers: readonly string[];
  readonly rows: readonly SkyBuyRow[];
}

export interface SkyBuyWorkbook {
  readonly sourcePath: string;
  readonly sourceSha256: string;
  readonly logicalCellSha256: string;
  readonly nonEmptyCellCount: number;
  readonly sheets: Readonly<Record<SkyBuySheetName, SkyBuySheet>>;
}

export interface SkyBuyValidationIssue {
  readonly severity: 'WARNING' | 'ERROR';
  readonly code: string;
  readonly message: string;
  readonly sheet?: SkyBuySheetName;
  readonly rowNumber?: number;
  readonly sourceKey?: string;
}

export interface SkyBuyProductMapping {
  readonly productTypeCode: string;
  readonly primaryCategoryHandle: string;
  readonly additionalCategoryHandles?: readonly string[];
}

export interface SkyBuyPlannedVariant {
  readonly sourceListingId: string;
  readonly sourceProductId: string;
  readonly sku: string;
  readonly attributes: Readonly<Record<string, string>>;
  readonly imageUrl?: string;
}

export interface SkyBuyPlannedProduct {
  readonly sourceListingId: string;
  readonly sourceProductId: string;
  readonly sourceUrl: string;
  readonly title: string;
  readonly handle: string;
  readonly imageUrl?: string;
  readonly productTypeCode: string;
  readonly primaryCategoryHandle: string;
  readonly additionalCategoryHandles: readonly string[];
  readonly variants: readonly SkyBuyPlannedVariant[];
}

export interface SkyBuyPlannedPurchaseLine {
  readonly sourceListingId: string;
  readonly sourceProductId: string;
  readonly sku: string;
  readonly attributes: Readonly<Record<string, string>>;
  readonly quantity: string;
  readonly unitPrice: string;
  readonly lineTotal: string;
}

export interface SkyBuyPlannedPurchase {
  readonly orderId: string;
  readonly orderDate: string;
  readonly sourceStatus: 'Completed' | 'Refunded' | 'Cancelled';
  readonly targetStatus: 'CLOSED' | 'PLACED' | 'CANCELLED';
  readonly productPrice: string;
  readonly effectiveTotal: string;
  readonly paidTotal: string;
  readonly dueTotal: string;
  readonly lines: readonly SkyBuyPlannedPurchaseLine[];
}

export interface SkyBuyPlannedShipment {
  readonly shipmentCode: string;
  readonly orderIds: readonly string[];
  readonly transportMode: 'AIR' | 'SEA';
  readonly evidenceDates: readonly string[];
  readonly thumbnailUrls: readonly string[];
}

export interface SkyBuyImportPlan {
  readonly source: {
    readonly fileName: string;
    readonly sha256: string;
    readonly exportedAt?: string;
    readonly workbookStatus?: string;
    readonly nonEmptyCellCount: number;
    readonly rowCounts: Readonly<Record<SkyBuySheetName, number>>;
  };
  readonly summary: {
    readonly orders: number;
    readonly completedOrders: number;
    readonly refundedOrders: number;
    readonly cancelledOrders: number;
    readonly products: number;
    readonly variants: number;
    readonly purchasedUnits: string;
    readonly completedUnits: string;
    readonly listedOrderValueBdt: string;
    readonly nonCancelledOrderValueBdt: string;
    readonly paidValueBdt: string;
    readonly productValueBdt: string;
    readonly discountValueBdt: string;
    readonly acquisitionFeeValueBdt: string;
  };
  readonly readiness: {
    readonly catalog: 'READY_AS_DRAFT';
    readonly procurement: 'READY';
    readonly inboundShipments: 'EVIDENCE_STAGED_PENDING_TIMELINE';
    readonly landedCost: 'BLOCKED_BY_RECEIVING';
    readonly supplierPayments: 'BLOCKED_BY_DOMAIN_GAP';
    readonly receivingAndInventory: 'BLOCKED_BY_OPENING_STOCK';
    readonly storefrontPublication: 'BLOCKED_BY_SELLING_PRICES';
  };
  readonly products: readonly SkyBuyPlannedProduct[];
  readonly purchases: readonly SkyBuyPlannedPurchase[];
  readonly shipments: readonly SkyBuyPlannedShipment[];
  readonly issues: readonly SkyBuyValidationIssue[];
}
