'use client';

import { useMemo, useState } from 'react';
import {
  Layers,
  Sparkles,
  CheckSquare,
  Square,
  RefreshCw,
  Tag,
  DollarSign,
  Palette,
  Check,
  ChevronDown,
} from 'lucide-react';
import type { CatalogColorDto } from '@maevelle/contracts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { VariantMatrixRow } from './types';

interface VariantMatrixTableProps {
  readonly matrix: readonly VariantMatrixRow[];
  readonly onUpdateRow: (id: string, updates: Partial<VariantMatrixRow>) => void;
  readonly onBulkUpdate: (updates: Partial<VariantMatrixRow>, onlyEnabled?: boolean) => void;
  readonly onToggleAll: (enabled: boolean) => void;
  readonly basePrice: string;
  readonly baseCompareAt: string;
  readonly baseCost: string;
  readonly colors: readonly CatalogColorDto[];
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
  colors,
  onRegenerateSkus,
}: VariantMatrixTableProps) {
  const enabledCount = useMemo(() => matrix.filter((r) => r.enabled).length, [matrix]);
  const allEnabled = enabledCount === matrix.length && matrix.length > 0;

  // Active color lookup
  const colorMap = useMemo(() => {
    return new Map(colors.map((c) => [c.id, c]));
  }, [colors]);

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

          {baseCost && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => onBulkUpdate({ costAmount: baseCost }, true)}
            >
              Apply Cost (৳{baseCost})
            </Button>
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
              <th className="py-2.5 px-3 min-w-[140px] font-medium">SKU (Required)</th>
              <th className="py-2.5 px-3 min-w-[110px] font-medium">Price (BDT)</th>
              <th className="py-2.5 px-3 min-w-[110px] font-medium">Compare-at</th>
              <th className="py-2.5 px-3 min-w-[100px] font-medium">Cost / Margin</th>
              <th className="py-2.5 px-3 min-w-[110px] font-medium">Barcode (GTIN)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {matrix.map((row) => {
              const matchedColor = row.primaryColorId ? colorMap.get(row.primaryColorId) : null;
              const priceNum = parseFloat(row.priceAmount);
              const costNum = parseFloat(row.costAmount);
              const margin =
                !isNaN(priceNum) && priceNum > 0 && !isNaN(costNum) && costNum > 0
                  ? Math.round(((priceNum - costNum) / priceNum) * 100)
                  : null;

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
                        {row.optionSelections.map((s) => `${s.axisName}: ${s.valueDisplay}`).join(', ')}
                      </span>
                    </div>
                  </td>

                  {/* Color Swatch Picker */}
                  <td className="py-2 px-3 align-middle">
                    <select
                      value={row.primaryColorId || ''}
                      onChange={(e) => onUpdateRow(row.id, { primaryColorId: e.target.value || null })}
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
                  </td>

                  {/* SKU Input */}
                  <td className="py-2 px-3 align-middle">
                    <Input
                      value={row.sku}
                      placeholder="SKU-001"
                      disabled={!row.enabled}
                      className="h-7 font-mono text-xs uppercase"
                      onChange={(e) =>
                        onUpdateRow(row.id, { sku: e.target.value.toUpperCase() })
                      }
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
                        onChange={(e) =>
                          onUpdateRow(row.id, { compareAtAmount: e.target.value })
                        }
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
                          value={row.costAmount}
                          disabled={!row.enabled}
                          className="h-7 pl-4 text-xs"
                          onChange={(e) => onUpdateRow(row.id, { costAmount: e.target.value })}
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
