import type { Shipment, Worksheet } from '@/lib/supply/costing-types';

export interface LandedCostStatsProps {
  readonly worksheets: readonly Worksheet[];
  readonly unstartedShipments: readonly Shipment[];
}

export interface LandedCostWorksheetsTableProps {
  readonly worksheets: readonly Worksheet[];
  readonly selectedWorksheetId: string;
  readonly onSelectWorksheet: (id: string) => void;
  readonly searchQuery: string;
  readonly onSearchChange: (query: string) => void;
  readonly statusFilter: 'ALL' | 'DRAFT' | 'FINALIZED';
  readonly onStatusFilterChange: (status: 'ALL' | 'DRAFT' | 'FINALIZED') => void;
}

export interface LandedCostWorksheetDetailProps {
  readonly worksheet: Worksheet;
  readonly shipment?: Shipment | undefined;
  readonly canManageCost: boolean;
  readonly canFinalizeCost: boolean;
  readonly busy: boolean;
  readonly onOpenAddComponent: () => void;
  readonly onDeleteComponent: (componentId: string) => Promise<void>;
  readonly onOpenFinalize: () => void;
  readonly onCreateRevision: (kind: 'ADJUSTMENT' | 'CREDIT') => Promise<void>;
  readonly onDiscardRevision: (revisionId: string) => Promise<void>;
  readonly onClose?: () => void;
}

export interface LandedCostUnstartedShipmentsProps {
  readonly shipments: readonly Shipment[];
  readonly canManageCost: boolean;
  readonly busy: boolean;
  readonly onStartLandedCost: (shipment: Shipment) => void;
}

export interface LandedCostStartDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly eligibleShipments: readonly Shipment[];
  readonly initialShipmentId?: string | undefined;
  readonly onStartWorksheet: (shipmentId: string, baseCurrencyCode: string, notes?: string) => Promise<void>;
  readonly saving: boolean;
}
