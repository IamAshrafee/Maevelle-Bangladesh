import type { AssetConditionDto, AssetStatusDto } from '@maevelle/contracts';

export type AssetFilterState = {
  search: string;
  status: AssetStatusDto | 'ALL';
  condition: AssetConditionDto | 'ALL';
  categoryId: string;
  locationId: string;
  custodianId: string;
  page: number;
};

export type AssetDialogKind =
  | 'edit'
  | 'assign'
  | 'move'
  | 'lifecycle'
  | 'maintenance'
  | 'sale'
  | 'dispose'
  | 'attach'
  | 'complete-repair'
  | 'mark-lost'
  | 'recover';

export interface AssetLifecyclePreset {
  targetStatus: AssetStatusDto;
  suggestedCondition?: AssetConditionDto | undefined;
  title: string;
  description: string;
  defaultReason: string;
}

export function isTerminalAsset(status: AssetStatusDto | string): boolean {
  return status === 'SOLD' || status === 'DISPOSED';
}
