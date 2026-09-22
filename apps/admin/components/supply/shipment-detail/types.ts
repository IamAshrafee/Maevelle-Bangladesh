import type { InboundReceiptDto, InboundShipmentDto } from '@maevelle/contracts';
import type { Worksheet } from '@/lib/supply/costing-types';
import type { ReceiptDraftLine } from '@/lib/supply/types';

export type ShipmentAllocation = InboundShipmentDto['allocations'][number];

export interface ShipmentDetailProps {
  readonly shipmentId: string;
}

export interface ShipmentDetailHeaderProps {
  readonly shipment: InboundShipmentDto;
  readonly canManage: boolean;
  readonly canReceive: boolean;
  readonly canManageCost: boolean;
  readonly busy: boolean;
  readonly worksheet?: Worksheet | undefined;
  readonly onDepart: () => void;
  readonly onArrive: () => void;
  readonly onOpenReceive: () => void;
  readonly onOpenEdit: () => void;
  readonly onOpenCancel: () => void;
  readonly onOpenStartWorksheet: () => void;
}

export interface ShipmentDetailStatsProps {
  readonly shipment: InboundShipmentDto;
  readonly worksheet?: Worksheet | undefined;
}

export interface ShipmentDetailItemsTableProps {
  readonly shipment: InboundShipmentDto;
}

export interface ShipmentDetailReceiptsSectionProps {
  readonly shipment: InboundShipmentDto;
  readonly receipts: readonly InboundReceiptDto[];
  readonly canReceive: boolean;
  readonly onOpenReceive: () => void;
}

export interface ShipmentDetailCostingSectionProps {
  readonly shipment: InboundShipmentDto;
  readonly worksheet?: Worksheet | undefined;
  readonly canManageCost: boolean;
  readonly onOpenStartWorksheet: () => void;
  readonly onOpenAddComponent: () => void;
  readonly onDeleteComponent: (componentId: string) => Promise<void>;
  readonly onOpenFinalize: () => void;
  readonly onCreateRevision: (kind: 'ADJUSTMENT' | 'CREDIT') => Promise<void>;
  readonly onDiscardRevision: (revisionId: string) => Promise<void>;
  readonly onOpenReceive: () => void;
  readonly busy: boolean;
}

export interface ShipmentDetailLogisticsCardProps {
  readonly shipment: InboundShipmentDto;
  readonly canManage: boolean;
  readonly onOpenEdit: () => void;
}

export interface ReceiveGoodsDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly shipment: InboundShipmentDto;
  readonly lines: ReceiptDraftLine[];
  readonly setLines: (lines: ReceiptDraftLine[]) => void;
  readonly onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  readonly saving: boolean;
}

export interface EditShipmentDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly shipment: InboundShipmentDto;
  readonly onSave: (data: {
    trackingReference?: string | undefined;
    expectedArrivalDate?: string | undefined;
    originText?: string | undefined;
    transportMode: 'AIR' | 'SEA' | 'ROAD' | 'RAIL' | 'OTHER';
  }) => Promise<void>;
  readonly saving: boolean;
}

export interface CancelShipmentDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly shipment: InboundShipmentDto;
  readonly onConfirmCancel: (reason: string) => Promise<void>;
  readonly saving: boolean;
}

export interface StartLandedCostDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly shipment: InboundShipmentDto;
  readonly onStartWorksheet: (notes?: string) => Promise<void>;
  readonly saving: boolean;
}

export interface AddCostComponentInput {
  readonly costType: string;
  readonly scope: 'GLOBAL' | 'DIRECT';
  readonly directShipmentAllocationId?: string | undefined;
  readonly originalAmount: string;
  readonly originalCurrencyCode: string;
  readonly fxRate?: string | undefined;
  readonly fxSource?: string | undefined;
  readonly valueStatus: 'ESTIMATED' | 'ACTUAL' | 'CREDIT';
  readonly allocationMethod: 'PURCHASE_VALUE' | 'QUANTITY' | 'EQUAL' | 'WEIGHT' | 'VOLUME' | 'DIRECT';
  readonly reference?: string | undefined;
  readonly notes?: string | undefined;
}

export interface AddCostComponentDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly worksheet: Worksheet;
  readonly shipment: InboundShipmentDto;
  readonly onAddComponent: (data: AddCostComponentInput) => Promise<void>;
  readonly saving: boolean;
}

export interface FinalizeCostingDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly worksheet: Worksheet;
  readonly onFinalize: () => Promise<void>;
  readonly saving: boolean;
}
