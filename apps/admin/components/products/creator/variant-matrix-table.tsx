'use client';

import { useMemo, useState } from 'react';
import {
  Boxes,
  Check,
  CheckSquare,
  ChevronDown,
  DollarSign,
  HelpCircle,
  Layers,
  Palette,
  RefreshCw,
  Sparkles,
  Square,
  Tag,
  Warehouse,
} from 'lucide-react';
import type { CatalogColorDto, WarehouseLocationDto } from '@maevelle/contracts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { VariantMatrixRow, VariantStockEntry } from './types';

interface VariantMatrixTableProps {
  readonly matrix: readonly VariantMatrixRow[];
  readonly onUpdateRow: (id: string, updates: Partial<VariantMatrixRow>) => void;
  readonly onBulkUpdate: (updates: Partial<VariantMatrixRow>, onlyEnabled?: boolean) => void;
  readonly onToggleAll: (enabled: boolean) => void;
  readonly basePrice: string;
  readonly baseCompareAt: string;
  readonly baseCost: string;
  readonly baseEstimatedCost?: string;
  readonly colors: readonly CatalogColorDto[];
  readonly locations?: readonly WarehouseLocationDto[];
  readonly onRegenerateSkus: () => void;
}

export function VariantMatrixTable({
  matrix,
  onUpdateRow,
  onBulkUpdate,
  onToggleAll,
  basePrice,
  baseCompareAt,
  baseCost,
  baseEstimatedCost,
  colors,
  locations = [],
  onRegenerateSkus,
}: VariantMatrixTableProps) {
  const enabledCount = useMemo(() => matrix.filter((r) => r.enabled).length, [matrix]);
  const allEnabled = enabledCount === matrix.length && matrix.length > 0;
  const effectiveBaseCost = baseEstimatedCost || baseCost;

  const [bulkStockQuantity, setBulkStockQuantity] = useState('');
  const [showBulkStockPopover, setShowBulkStockPopover] = useState(false);

  // Active color lookup
  const colorMap = useMemo(() => {
    return new Map(colors.map((c) => [c.id, c]));
  }, [colors]);

  const handleApplyBulkStock = (qtyString: string) => {
    const qty = parseInt(qtyString, 10);
    if (isNaN(qty) || qty < 0 || locations.length === 0) return;
    const defaultLocation = locations[0]!;
    onBulkUpdate(
      {
        initialStock: [
          {
            locationId: defaultLocation.id,
            locationName: defaultLocation.name,
            quantity: String(qty),
          },
        ],
      },
      true,
    );
    setShowBulkStockPopover(false);
  };

  return (
    <div className="space-y-3">
      {/* Top Bar with Bulk Actions */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/30 p-2.5">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 gap-1.5 px-2 text-xs"
            onClick={() => onToggleAll(!allEnabled)}
          >
            {allEnabled ? (
              <CheckSquare className="size-3.5 text-primary" />
            ) : (
              <Square className="size-3.5 text-muted-foreground" />
            )}
            <span>{allEnabled ? 'Deselect All' : 'Select All'}</span>
          </Button>

          <Badge variant="secondary" className="text-xs font-semibold">
            {enabledCount} of {matrix.length} variants enabled
          </Badge>
        </div>

        {/* Bulk Action Buttons */}
        <div className="flex flex-wrap items-center gap-1.5">
          {basePrice && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => onBulkUpdate({ priceAmount: basePrice }, true)}
            >
              Apply Price (৳{basePrice})
            </Button>
          )}

          {baseCompareAt && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => onBulkUpdate({ compareAtAmount: baseCompareAt }, true)}
            >
              Apply Compare-at (৳{baseCompareAt})
            </Button>
          )}

          {effectiveBaseCost && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() =>
                onBulkUpdate(
                  { costAmount: effectiveBaseCost, estimatedCostAmount: effectiveBaseCost },
                  true,
                )
              }
            >
              Apply Est. Cost (৳{effectiveBaseCost})
            </Button>
          )}

          {locations.length > 0 && (
            <Popover open={showBulkStockPopover} onOpenChange={setShowBulkStockPopover}>
              <PopoverTrigger
                render={
                  <Button type="button" variant="outline" size="sm" className="h-7 gap-1 text-xs">
                    <Boxes className="size-3 text-primary" />
                    <span>Apply Opening Stock</span>
                  </Button>
                }
              />
              <PopoverContent className="w-64 space-y-2 p-3 text-xs" align="end">
                <p className="font-semibold text-foreground">Bulk Opening Stock</p>
                <p className="text-[11px] text-muted-foreground">
                  Apply units to {locations[0]?.name ?? 'primary warehouse'} for all enabled
                  variants.
                </p>
                <div className="flex items-center gap-2 pt-1">
                  <Input
                    type="number"
                    min="0"
                    placeholder="e.g. 20"
                    value={bulkStockQuantity}
                    onChange={(e) => setBulkStockQuantity(e.target.value)}
                    className="h-8 text-xs"
                  />
                  <Button
                    type="button"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => handleApplyBulkStock(bulkStockQuantity)}
                  >
                    Apply
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
          )}

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 gap-1 text-xs"
            onClick={onRegenerateSkus}
          >
            <RefreshCw className="size-3" />
            <span>Regenerate SKUs</span>
          </Button>
        </div>
      </div>

      {/* Responsive Matrix Table */}
      <div className="overflow-x-auto rounded-lg border bg-background shadow-xs">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b bg-muted/40 text-muted-foreground">
              <th className="py-2.5 pl-3 pr-2 w-10 text-center font-medium">Use</th>
              <th className="py-2.5 px-3 min-w-[140px] font-medium">Variant Combination</th>
              <th className="py-2.5 px-3 min-w-[140px] font-medium">Color Swatch</th>
              <th className="py-2.5 px-3 min-w-[130px] font-medium">SKU (Required)</th>
              <th className="py-2.5 px-3 min-w-[100px] font-medium">Price (BDT)</th>
              <th className="py-2.5 px-3 min-w-[100px] font-medium">Compare-at</th>
              <th className="py-2.5 px-3 min-w-[130px] font-medium">
                <span className="flex items-center gap-1">
                  <span>Est. Cost / Margin</span>
                  <Tooltip>
                    <TooltipTrigger
                      render={<span tabIndex={0} className="inline-flex cursor-help" />}
                    >
                      <HelpCircle className="size-3 text-muted-foreground" aria-hidden="true" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      Internal merchandising estimated cost used for gross margin calculations. Not
                      used for accounting FIFO COGS.
                    </TooltipContent>
                  </Tooltip>
                </span>
              </th>
              <th className="py-2.5 px-3 min-w-[120px] font-medium">Opening Stock</th>
              <th className="py-2.5 px-3 min-w-[110px] font-medium">Barcode (GTIN)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {matrix.map((row) => {
              const matchedColor = row.primaryColorId ? colorMap.get(row.primaryColorId) : null;
              const priceNum = parseFloat(row.priceAmount);
              const costAmount = row.estimatedCostAmount || row.costAmount;
              const costNum = parseFloat(costAmount);
              const margin =
                !isNaN(priceNum) && priceNum > 0 && !isNaN(costNum) && costNum > 0
                  ? Math.round(((priceNum - costNum) / priceNum) * 100)
                  : null;

              const totalStock = (row.initialStock || []).reduce(
                (sum, entry) => sum + (parseInt(entry.quantity, 10) || 0),
                0,
              );

              return (
                <tr
                  key={row.id}
                  className={`transition-colors ${
                    row.enabled ? 'hover:bg-muted/30' : 'opacity-40 bg-muted/10'
                  }`}
                >
                  {/* Enabled Toggle Checkbox */}
                  <td className="py-2 pl-3 pr-2 text-center align-middle">
                    <input
                      type="checkbox"
                      checked={row.enabled}
                      onChange={(e) => onUpdateRow(row.id, { enabled: e.target.checked })}
                      className="size-4 rounded-xs border-input text-primary accent-primary cursor-pointer"
                    />
                  </td>

                  {/* Combination Title */}
                  <td className="py-2 px-3 align-middle">
                    <div className="flex flex-col">
                      <span className="font-semibold text-foreground">{row.title}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {row.optionSelections
                          .map((s) => `${s.axisName}: ${s.valueDisplay}`)
                          .join(', ')}
                      </span>
                    </div>
                  </td>

                  {/* Color Swatch Picker */}
                  <td className="py-2 px-3 align-middle">
                    <div className="flex items-center gap-1.5">
                      {matchedColor?.hexValue && (
                        <span
                          className="size-3 rounded-full border border-black/20 shrink-0"
                          style={{ backgroundColor: matchedColor.hexValue }}
                        />
                      )}
                      <select
                        value={row.primaryColorId || ''}
                        onChange={(e) =>
                          onUpdateRow(row.id, { primaryColorId: e.target.value || null })
                        }
                        disabled={!row.enabled}
                        className="h-7 w-full rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed"
                      >
                        <option value="">No Color Swatch</option>
                        {colors.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name} {c.code ? `(${c.code})` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  </td>

                  {/* SKU Input */}
                  <td className="py-2 px-3 align-middle">
                    <Input
                      value={row.sku}
                      placeholder="SKU-001"
                      disabled={!row.enabled}
                      className="h-7 font-mono text-xs uppercase"
                      onChange={(e) => onUpdateRow(row.id, { sku: e.target.value.toUpperCase() })}
                    />
                  </td>

                  {/* Price */}
                  <td className="py-2 px-3 align-middle">
                    <div className="relative">
                      <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-muted-foreground">
                        ৳
                      </span>
                      <Input
                        type="number"
                        step="1"
                        min="0"
                        placeholder="2500"
                        value={row.priceAmount}
                        disabled={!row.enabled}
                        className="h-7 pl-5 text-xs font-medium"
                        onChange={(e) => onUpdateRow(row.id, { priceAmount: e.target.value })}
                      />
                    </div>
                  </td>

                  {/* Compare-at Price */}
                  <td className="py-2 px-3 align-middle">
                    <div className="relative">
                      <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-muted-foreground">
                        ৳
                      </span>
                      <Input
                        type="number"
                        step="1"
                        min="0"
                        placeholder="3000"
                        value={row.compareAtAmount}
                        disabled={!row.enabled}
                        className="h-7 pl-5 text-xs"
                        onChange={(e) => onUpdateRow(row.id, { compareAtAmount: e.target.value })}
                      />
                    </div>
                  </td>

                  {/* Cost & Margin */}
                  <td className="py-2 px-3 align-middle">
                    <div className="flex items-center gap-1.5">
                      <div className="relative w-20">
                        <span className="pointer-events-none absolute left-1.5 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-muted-foreground">
                          ৳
                        </span>
                        <Input
                          type="number"
                          step="1"
                          min="0"
                          placeholder="Cost"
                          value={costAmount}
                          disabled={!row.enabled}
                          className="h-7 pl-4 text-xs"
                          onChange={(e) =>
                            onUpdateRow(row.id, {
                              costAmount: e.target.value,
                              estimatedCostAmount: e.target.value,
                            })
                          }
                        />
                      </div>
                      {margin !== null && (
                        <Badge
                          variant="secondary"
                          className={`text-[10px] font-semibold px-1 py-0.5 ${
                            margin >= 35
                              ? 'text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-300 dark:bg-emerald-950/40'
                              : margin >= 0
                                ? 'text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-300 dark:bg-amber-950/40'
                                : 'text-red-700 bg-red-50 border-red-200 dark:text-red-300 dark:bg-red-950/40'
                          }`}
                        >
                          {margin}%
                        </Badge>
                      )}
                    </div>
                  </td>

                  {/* Opening Stock Column */}
                  <td className="py-2 px-3 align-middle">
                    {locations.length <= 1 ? (
                      <div className="relative w-20">
                        <Input
                          type="number"
                          min="0"
                          step="1"
                          placeholder="0"
                          disabled={!row.enabled}
                          value={row.initialStock?.[0]?.quantity || ''}
                          className="h-7 text-xs tabular-nums text-center"
                          onChange={(e) => {
                            const val = e.target.value;
                            const locId = locations[0]?.id || 'default-location';
                            const locName = locations[0]?.name || 'Main Warehouse';
                            onUpdateRow(row.id, {
                              initialStock: val
                                ? [{ locationId: locId, locationName: locName, quantity: val }]
                                : [],
                            });
                          }}
                        />
                      </div>
                    ) : (
                      <Popover>
                        <PopoverTrigger
                          render={
                            <button
                              type="button"
                              disabled={!row.enabled}
                              className="flex items-center gap-1.5 rounded border bg-background px-2 py-1 text-xs hover:bg-muted font-medium tabular-nums disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              <Warehouse className="size-3 text-muted-foreground" />
                              <span>{totalStock} units</span>
                            </button>
                          }
                        />
                        <PopoverContent className="w-72 space-y-2 p-3 text-xs" align="start">
                          <p className="font-semibold text-foreground">
                            Opening Stock: {row.title}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            Allocate opening inventory units per location.
                          </p>
                          <div className="space-y-2 pt-1">
                            {locations.map((loc) => {
                              const existingQty =
                                (row.initialStock || []).find((s) => s.locationId === loc.id)
                                  ?.quantity || '';
                              return (
                                <div
                                  key={loc.id}
                                  className="flex items-center justify-between gap-2"
                                >
                                  <Label className="text-xs truncate max-w-[150px]">
                                    {loc.name}
                                  </Label>
                                  <Input
                                    type="number"
                                    min="0"
                                    placeholder="0"
                                    value={existingQty}
                                    className="h-7 w-20 text-xs tabular-nums text-right"
                                    onChange={(e) => {
                                      const newQty = e.target.value;
                                      const currentList = row.initialStock || [];
                                      const withoutLoc = currentList.filter(
                                        (s) => s.locationId !== loc.id,
                                      );
                                      const updatedList: VariantStockEntry[] = newQty
                                        ? [
                                            ...withoutLoc,
                                            {
                                              locationId: loc.id,
                                              locationName: loc.name,
                                              quantity: newQty,
                                            },
                                          ]
                                        : withoutLoc;
                                      onUpdateRow(row.id, { initialStock: updatedList });
                                    }}
                                  />
                                </div>
                              );
                            })}
                          </div>
                        </PopoverContent>
                      </Popover>
                    )}
                  </td>

                  {/* Barcode */}
                  <td className="py-2 px-3 align-middle">
                    <Input
                      value={row.barcode}
                      placeholder="EAN / Barcode"
                      disabled={!row.enabled}
                      className="h-7 font-mono text-xs"
                      onChange={(e) => onUpdateRow(row.id, { barcode: e.target.value })}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
