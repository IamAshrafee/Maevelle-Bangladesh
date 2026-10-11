import type { CatalogProductWorkspaceDto } from '@maevelle/contracts';

export type VariantAcquisitionCost = NonNullable<
  CatalogProductWorkspaceDto['variants'][number]['latestAcquisitionCost']
>;

export type MerchandisingCostSource = 'LANDED_COST' | 'ESTIMATE' | 'NONE';

export interface MerchandisingCost {
  readonly amount: string;
  readonly source: MerchandisingCostSource;
  readonly acquisition: VariantAcquisitionCost | null;
}

export function merchandisingCost(
  estimatedCostAmount: string | null | undefined,
  acquisitionCost: VariantAcquisitionCost | null | undefined,
  currency = 'BDT',
): MerchandisingCost {
  if (
    acquisitionCost &&
    acquisitionCost.currency === currency &&
    isPositiveNumber(acquisitionCost.amount)
  ) {
    return {
      amount: acquisitionCost.amount,
      source: 'LANDED_COST',
      acquisition: acquisitionCost,
    };
  }

  if (isPositiveNumber(estimatedCostAmount)) {
    return {
      amount: estimatedCostAmount!.trim(),
      source: 'ESTIMATE',
      acquisition: null,
    };
  }

  return { amount: '', source: 'NONE', acquisition: null };
}

export function grossMarginPercent(
  sellingPriceAmount: string | null | undefined,
  unitCostAmount: string | null | undefined,
): number | null {
  const price = Number(sellingPriceAmount);
  const cost = Number(unitCostAmount);
  if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(cost) || cost <= 0) {
    return null;
  }

  return Math.round(((price - cost) / price) * 100 * 10) / 10;
}

export function suggestedSellingPrice(
  unitCostAmount: string | null | undefined,
  targetMarginPercent: number,
  roundingIncrement = 10,
): string | null {
  const cost = Number(unitCostAmount);
  if (
    !Number.isFinite(cost) ||
    cost <= 0 ||
    !Number.isFinite(targetMarginPercent) ||
    targetMarginPercent <= 0 ||
    targetMarginPercent >= 100 ||
    !Number.isFinite(roundingIncrement) ||
    roundingIncrement <= 0
  ) {
    return null;
  }

  const exactPrice = cost / (1 - targetMarginPercent / 100);
  return String(Math.ceil(exactPrice / roundingIncrement) * roundingIncrement);
}

function isPositiveNumber(value: string | null | undefined): boolean {
  if (!value?.trim()) return false;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0;
}
