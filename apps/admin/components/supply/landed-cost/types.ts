import type { Shipment, Worksheet } from '@/lib/supply/costing-types';

export interface LandedCostStatsProps {
  readonly worksheets: readonly Worksheet[];
  readonly unstartedShipments: readonly Shipment[];
  readonly loading?: boolean;
}

export interface LandedCostWorksheetsTableProps {
  readonly worksheets: readonly Worksheet[];
  readonly searchQuery: string;
  readonly onSearchChange: (query: string) => void;
  readonly statusFilter: 'ALL' | 'DRAFT' | 'FINALIZED';
  readonly onStatusFilterChange: (status: 'ALL' | 'DRAFT' | 'FINALIZED') => void;
  readonly loading?: boolean;
}

export interface LandedCostUnstartedShipmentsProps {
  readonly shipments: readonly Shipment[];
  readonly canManageCost: boolean;
  readonly loading?: boolean;
}
