import type { InspectionStageDto, InventoryUnitDto } from '@maevelle/contracts';

export function unitCanBeInspected(unit: InventoryUnitDto): boolean {
  return ['AWAITING_QC', 'AVAILABLE', 'ON_HOLD', 'RETURNED'].includes(unit.status) &&
    !unit.activeRepair;
}

export function unitCanBeBulkPassed(unit: InventoryUnitDto): boolean {
  return unit.status === 'AWAITING_QC' &&
    unit.currentCondition !== 'REPAIR_REQUIRED' &&
    !unit.activeRepair;
}

export function recommendedInspectionStage(unit: InventoryUnitDto): InspectionStageDto {
  if (unit.status === 'RETURNED') return 'RETURN_INSPECTION';
  if (unit.status === 'AWAITING_QC' && unit.currentCondition === 'REPAIR_REQUIRED') {
    return 'REINSPECTION';
  }
  if (unit.status === 'AVAILABLE' || unit.status === 'ON_HOLD') return 'ROUTINE_AUDIT';
  return 'INBOUND_INTAKE';
}

export function unitCanEnterRepair(unit: InventoryUnitDto): boolean {
  return ['AWAITING_QC', 'AVAILABLE', 'ON_HOLD'].includes(unit.status) && !unit.activeRepair;
}

export function unitCanCompleteRepair(unit: InventoryUnitDto): boolean {
  return Boolean(unit.activeRepair);
}

export function unitCanBeReleased(unit: InventoryUnitDto): boolean {
  return ['ON_HOLD', 'AWAITING_QC'].includes(unit.status) &&
    ['GRADE_A', 'GRADE_B'].includes(unit.currentCondition) &&
    !unit.activeRepair;
}

export function unitCanEnterTransfer(unit: InventoryUnitDto): boolean {
  return !['DISPATCHED', 'IN_TRANSFER', 'WRITTEN_OFF'].includes(unit.status);
}

export function unitCanBeWrittenOff(unit: InventoryUnitDto): boolean {
  return !['RESERVED', 'IN_FULFILLMENT', 'IN_TRANSFER', 'DISPATCHED', 'WRITTEN_OFF'].includes(
    unit.status,
  );
}
