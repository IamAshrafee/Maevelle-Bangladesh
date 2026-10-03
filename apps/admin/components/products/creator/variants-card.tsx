'use client';

import { useMemo, useState } from 'react';
import {
  Camera,
  Check,
  Eye,
  HelpCircle,
  Info,
  Layers,
  Package,
  Palette,
  Plus,
  Sparkles,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import type { CatalogColorDto, WarehouseLocationDto } from '@maevelle/contracts';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

import type {
  OptionAxisState,
  OptionValueState,
  VariantMatrixRow,
  VariantStockEntry,
} from './types';
import { VariantMatrixTable } from './variant-matrix-table';

export interface VariantsCardProps {
  readonly variantMode: 'simple' | 'variants';
  readonly sku: string;
  readonly barcode: string;
  readonly optionAxes: readonly OptionAxisState[];
  readonly matrixRows: readonly VariantMatrixRow[];
  readonly colors: readonly CatalogColorDto[];
  readonly locations?: readonly WarehouseLocationDto[];
  readonly sizeSystemId: string;
  readonly priceAmount: string;
  readonly compareAtAmount: string;
  readonly costAmount: string;
  readonly estimatedCostAmount?: string;
  readonly simpleInitialStock?: readonly VariantStockEntry[];
  readonly fieldErrors: Record<string, string>;
  readonly onVariantModeChange: (mode: 'simple' | 'variants') => void;
  readonly onSkuChange: (val: string) => void;
  readonly onBarcodeChange: (val: string) => void;
  readonly onEstimatedCostChange?: (val: string) => void;
  readonly onSimpleInitialStockChange?: (locationId: string, quantity: string) => void;
  readonly onAddOptionValue: (axisName: string, val: string) => void;
  readonly onRemoveOptionValue: (axisName: string, val: string) => void;
  readonly onSetPrimaryVisualValue?: (axisId: string, valueId: string) => void;
  readonly onToggleAxisVisual?: (axisId: string) => void;
  readonly onAddOptionAxis?: (name: string, isVisual: boolean) => void;
  readonly onRemoveOptionAxis?: (axisId: string) => void;
  readonly onApplyPresetStructure?: (preset: 'color-size' | 'size-only' | 'single') => void;
  readonly onImportSizesFromSystem: (systemId: string) => void;
  readonly onUpdateMatrixRow: (
    id: string,
    updates: Partial<VariantMatrixRow>,
  ) => void;
  readonly onBulkUpdateMatrix: (
    updates: Partial<VariantMatrixRow>,
    onlyEnabled?: boolean,
  ) => void;
  readonly onToggleAllVariants: (enabled: boolean) => void;
  readonly onRegenerateAllSkus: () => void;
}

export function VariantsCard({
  variantMode,
  sku,
  barcode,
  optionAxes,
  matrixRows,
  colors,
  locations = [],
  sizeSystemId,
  priceAmount,
  compareAtAmount,
  costAmount,
  estimatedCostAmount = '',
  simpleInitialStock = [],
  fieldErrors,
  onVariantModeChange,
  onSkuChange,
  onBarcodeChange,
  onEstimatedCostChange,
  onSimpleInitialStockChange,
  onAddOptionValue,
  onRemoveOptionValue,
  onSetPrimaryVisualValue,
  onToggleAxisVisual,
  onAddOptionAxis,
  onRemoveOptionAxis,
  onApplyPresetStructure,
  onImportSizesFromSystem,
  onUpdateMatrixRow,
  onBulkUpdateMatrix,
  onToggleAllVariants,
  onRegenerateAllSkus,
}: VariantsCardProps) {
  const [newColorInput, setNewColorInput] = useState('');
  const [newSizeInput, setNewSizeInput] = useState('');
  const [customAxisInputs, setCustomAxisInputs] = useState<Record<string, string>>({});
  const [newAxisName, setNewAxisName] = useState('');
  const [newAxisIsVisual, setNewAxisIsVisual] = useState(false);
  const [showAddAxis, setShowAddAxis] = useState(false);

  // Compute live estimated margin for simple mode
  const simpleMargin = useMemo(() => {
    const price = parseFloat(priceAmount);
    const cost = parseFloat(estimatedCostAmount || costAmount);
    if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(cost) || cost < 0) {
      return null;
    }
    const margin = ((price - cost) / price) * 100;
    const profit = price - cost;
    return { margin: Math.round(margin * 10) / 10, profit: Math.round(profit) };
  }, [priceAmount, estimatedCostAmount, costAmount]);

  const activeVisualAxis = useMemo(
    () => optionAxes.find((a) => a.isVisual),
    [optionAxes],
  );

  const handleAddColor = () => {
    if (newColorInput.trim()) {
      onAddOptionValue('Color', newColorInput.trim());
      setNewColorInput('');
    }
  };

  const handleAddSize = () => {
    if (newSizeInput.trim()) {
      onAddOptionValue('Size', newSizeInput.trim());
      setNewSizeInput('');
    }
  };

  const handleAddCustomAxis = () => {
    if (newAxisName.trim()) {
      onAddOptionAxis?.(newAxisName.trim(), newAxisIsVisual);
      setNewAxisName('');
      setNewAxisIsVisual(false);
      setShowAddAxis(false);
    }
  };

  const handleAddCustomValue = (axisName: string) => {
    const val = customAxisInputs[axisName]?.trim();
    if (val) {
      onAddOptionValue(axisName, val);
      setCustomAxisInputs((prev) => ({ ...prev, [axisName]: '' }));
    }
  };

  return (
    <Card className="shadow-xs">
      <CardHeader>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Layers className="size-4 text-primary" aria-hidden="true" />
            <CardTitle className="text-base font-semibold">
              Variants & Options
            </CardTitle>
          </div>

          {/* Mode Switcher */}
          <div className="flex rounded-lg border bg-muted/40 p-1">
            <button
              type="button"
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                variantMode === 'simple'
                  ? 'bg-background text-foreground shadow-xs font-semibold'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => onVariantModeChange('simple')}
            >
              Single Item (Simple)
            </button>
            <button
              type="button"
              className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                variantMode === 'variants'
                  ? 'bg-background text-foreground shadow-xs font-semibold'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => onVariantModeChange('variants')}
            >
              Multi-Variant Matrix
            </button>
          </div>
        </div>
        <CardDescription>
          Choose whether this product has a single SKU or multiple sellable combinations (e.g. Color, Size).
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        {variantMode === 'simple' ? (
          /* Single SKU Configuration */
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              {/* SKU */}
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <Label htmlFor="sku-input" className="font-medium text-xs sm:text-sm">
                    SKU Code <span className="text-destructive">*</span>
                  </Label>
                  <Tooltip>
                    <TooltipTrigger render={<span tabIndex={0} className="inline-flex cursor-help" />}>
                      <HelpCircle className="size-3.5 text-muted-foreground" aria-hidden="true" />
                    </TooltipTrigger>
                    <TooltipContent>
                      Stock Keeping Unit. Unique identifier used for warehouse inventory and picking.
                    </TooltipContent>
                  </Tooltip>
                </div>
                <Input
                  id="sku-input"
                  value={sku}
                  placeholder="PANJ-001"
                  className="font-mono text-xs uppercase"
                  onChange={(e) => onSkuChange(e.target.value)}
                />
                {fieldErrors.sku && (
                  <p className="text-xs text-destructive">{fieldErrors.sku}</p>
                )}
              </div>

              {/* Barcode */}
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <Label htmlFor="barcode-input" className="font-medium text-xs sm:text-sm">
                    Barcode / EAN / GTIN (Optional)
                  </Label>
                  <Tooltip>
                    <TooltipTrigger render={<span tabIndex={0} className="inline-flex cursor-help" />}>
                      <HelpCircle className="size-3.5 text-muted-foreground" aria-hidden="true" />
                    </TooltipTrigger>
                    <TooltipContent>
                      Scannable barcode code for POS and logistics.
                    </TooltipContent>
                  </Tooltip>
                </div>
                <Input
                  id="barcode-input"
                  value={barcode}
                  placeholder="890123456789"
                  className="font-mono text-xs"
                  onChange={(e) => onBarcodeChange(e.target.value)}
                />
              </div>
            </div>

            {/* Estimated Unit Cost & Margin */}
            <div className="grid gap-4 sm:grid-cols-2 pt-2 border-t">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Label htmlFor="simple-estimated-cost" className="font-medium text-xs sm:text-sm">
                      Estimated Unit Cost (BDT)
                    </Label>
                    <Tooltip>
                      <TooltipTrigger render={<span tabIndex={0} className="inline-flex cursor-help" />}>
                        <HelpCircle className="size-3.5 text-muted-foreground" aria-hidden="true" />
                      </TooltipTrigger>
                      <TooltipContent>
                        Estimated production/purchase cost for live gross margin calculations. Kept distinct from accounting FIFO valuation.
                      </TooltipContent>
                    </Tooltip>
                  </div>
                  {simpleMargin !== null && (
                    <Badge
                      variant="outline"
                      className={`text-[11px] font-mono font-medium ${
                        simpleMargin.margin >= 40
                          ? 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300'
                          : simpleMargin.margin >= 20
                            ? 'border-amber-300 bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300'
                            : 'border-red-300 bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-300'
                      }`}
                    >
                      {simpleMargin.margin}% margin (+৳{simpleMargin.profit.toLocaleString('en-BD')})
                    </Badge>
                  )}
                </div>
                <Input
                  id="simple-estimated-cost"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="e.g. 1200.00"
                  value={estimatedCostAmount || costAmount}
                  onChange={(e) => onEstimatedCostChange?.(e.target.value)}
                  className="font-mono text-xs"
                />
              </div>

              {/* Multi-Location Opening Stock */}
              {locations.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <Label className="font-medium text-xs sm:text-sm">
                      Opening Inventory by Warehouse
                    </Label>
                    <Tooltip>
                      <TooltipTrigger render={<span tabIndex={0} className="inline-flex cursor-help" />}>
                        <HelpCircle className="size-3.5 text-muted-foreground" aria-hidden="true" />
                      </TooltipTrigger>
                      <TooltipContent>
                        Record initial opening stock during product creation. Movements are logged atomically with OPENING_BALANCE.
                      </TooltipContent>
                    </Tooltip>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    {locations.slice(0, 4).map((loc) => {
                      const entry = simpleInitialStock.find((s) => s.locationId === loc.id);
                      return (
                        <div key={loc.id} className="flex items-center gap-2 rounded-md border bg-muted/20 px-2.5 py-1.5">
                          <Package className="size-3.5 text-muted-foreground shrink-0" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[11px] font-medium text-foreground">{loc.name}</p>
                            <p className="text-[10px] text-muted-foreground">{loc.code}</p>
                          </div>
                          <Input
                            type="number"
                            min="0"
                            placeholder="0"
                            value={entry?.quantity ?? ''}
                            onChange={(e) => onSimpleInitialStockChange?.(loc.id, e.target.value)}
                            className="h-7 w-16 text-center font-mono text-xs"
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Multi-Variant Mode Configurator & Matrix Table */
          <div className="space-y-5">
            {/* Quick Presets Bar */}
            <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/25 px-3 py-2 text-xs">
              <span className="font-medium text-muted-foreground flex items-center gap-1">
                <Sparkles className="size-3.5 text-amber-500" />
                Quick Presets:
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={() => onApplyPresetStructure?.('color-size')}
              >
                <Palette className="size-3 text-primary" />
                <span>Color + Size (Standard Apparel)</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={() => onApplyPresetStructure?.('size-only')}
              >
                <Layers className="size-3 text-primary" />
                <span>Size Only (Shared Photos)</span>
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-muted-foreground"
                onClick={() => onVariantModeChange('simple')}
              >
                <span>Single SKU</span>
              </Button>
            </div>

            {/* Option Axes Configurator */}
            <div className="rounded-lg border bg-muted/20 p-4 space-y-4">
              <div className="flex items-center justify-between border-b pb-2">
                <div>
                  <p className="text-xs font-semibold text-foreground">
                    Configure Option Axes & Visual Grouping
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Define option axes. Exactly one axis (typically Color) can drive visual photography on the storefront.
                  </p>
                </div>

                {!showAddAxis && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1 text-xs"
                    onClick={() => setShowAddAxis(true)}
                  >
                    <Plus className="size-3" />
                    <span>Add Custom Axis</span>
                  </Button>
                )}
              </div>

              {/* Custom Axis Form */}
              {showAddAxis && (
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 rounded-md border bg-background p-3">
                  <Input
                    placeholder="Axis Name (e.g. Sleeve, Material, Fit)"
                    value={newAxisName}
                    onChange={(e) => setNewAxisName(e.target.value)}
                    className="h-8 text-xs max-w-xs"
                  />
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={newAxisIsVisual}
                      onChange={(e) => setNewAxisIsVisual(e.target.checked)}
                      className="rounded border-input text-primary focus:ring-primary size-3.5"
                    />
                    <span>Visual presentation axis (drives photos)</span>
                  </label>
                  <div className="flex items-center gap-1 sm:ml-auto">
                    <Button
                      type="button"
                      size="sm"
                      className="h-8 text-xs"
                      onClick={handleAddCustomAxis}
                    >
                      Create Axis
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs"
                      onClick={() => setShowAddAxis(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}

              {/* List of Configured Axes */}
              <div className="space-y-4">
                {optionAxes.map((axis) => {
                  const isColor = axis.name.toLowerCase() === 'color';
                  const isSize = axis.name.toLowerCase() === 'size';

                  return (
                    <div
                      key={axis.id || axis.name}
                      className={`rounded-md border p-3 space-y-3 transition-colors ${
                        axis.isVisual
                          ? 'border-primary/40 bg-primary/5 dark:bg-primary/10'
                          : 'bg-background'
                      }`}
                    >
                      {/* Axis Header */}
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b pb-2">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-xs text-foreground">
                            {axis.name}
                          </span>
                          {axis.isVisual ? (
                            <Badge variant="default" className="text-[10px] gap-1 py-0 px-2 bg-primary/90 text-primary-foreground">
                              <Camera className="size-3" />
                              Visual Presentation Axis
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] text-muted-foreground">
                              Specification Axis
                            </Badge>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          {/* Visual Axis Toggle Button */}
                          <Button
                            type="button"
                            variant={axis.isVisual ? 'secondary' : 'outline'}
                            size="sm"
                            className="h-6 text-[11px] gap-1 px-2"
                            onClick={() => onToggleAxisVisual?.(axis.id)}
                          >
                            <Eye className="size-3" />
                            {axis.isVisual ? 'Visual Active' : 'Make Visual Axis'}
                          </Button>

                          {/* Sizing System 1-click import */}
                          {isSize && sizeSystemId && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-6 gap-1 px-1.5 text-[11px] text-primary hover:bg-primary/10"
                              onClick={() => onImportSizesFromSystem(sizeSystemId)}
                            >
                              <Sparkles className="size-3" />
                              <span>Import from Size System</span>
                            </Button>
                          )}

                          {/* Delete Axis (if not color/size or if customized) */}
                          {!isColor && !isSize && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="h-6 size-6 p-0 text-muted-foreground hover:text-destructive"
                              onClick={() => onRemoveOptionAxis?.(axis.id)}
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          )}
                        </div>
                      </div>

                      {/* Selected Values with Primary Cover Badge */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] text-muted-foreground">
                            {axis.isVisual
                              ? 'Values drive color swatches & photo galleries. Click ★ on a value to set it as Primary Cover.'
                              : 'Values generate variant SKUs.'}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5">
                          {axis.values.map((val: OptionValueState) => {
                            const matchedColor = isColor
                              ? colors.find((c) => c.name.toLowerCase() === val.label.toLowerCase())
                              : null;

                            return (
                              <Badge
                                key={val.id || val.label}
                                variant={val.isPrimary ? 'default' : 'secondary'}
                                className={`gap-1.5 py-1 pl-2 pr-1.5 text-xs font-medium ${
                                  val.isPrimary ? 'ring-1 ring-primary shadow-xs' : ''
                                }`}
                              >
                                {matchedColor?.hexValue && (
                                  <span
                                    className="size-2.5 rounded-full border border-black/20 shrink-0"
                                    style={{ backgroundColor: matchedColor.hexValue }}
                                  />
                                )}
                                <span>{val.label}</span>

                                {/* Primary Cover Selector Button (Visual Axis only) */}
                                {axis.isVisual && (
                                  <Tooltip>
                                    <TooltipTrigger
                                      render={
                                        <button
                                          type="button"
                                          className={`rounded-full p-0.5 transition-colors ${
                                            val.isPrimary
                                              ? 'text-amber-400 hover:text-amber-300'
                                              : 'text-muted-foreground hover:text-amber-500'
                                          }`}
                                          onClick={() => onSetPrimaryVisualValue?.(axis.id, val.id)}
                                        />
                                      }
                                    >
                                      <Star
                                        className={`size-3 ${val.isPrimary ? 'fill-amber-400' : ''}`}
                                      />
                                    </TooltipTrigger>
                                    <TooltipContent>
                                      {val.isPrimary
                                        ? 'Primary Cover presentation for catalog listings & storefront cards'
                                        : 'Click to make this the Primary Cover value'}
                                    </TooltipContent>
                                  </Tooltip>
                                )}

                                <button
                                  type="button"
                                  className="ml-0.5 rounded-full hover:bg-muted p-0.5"
                                  onClick={() => onRemoveOptionValue(axis.name, val.label)}
                                >
                                  <X className="size-3 text-muted-foreground hover:text-foreground" />
                                </button>
                              </Badge>
                            );
                          })}

                          {axis.values.length === 0 && (
                            <span className="text-xs text-muted-foreground italic">
                              No values added yet.
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Quick Swatch Presets for Color Axis */}
                      {isColor && colors.length > 0 && (
                        <div className="space-y-1 pt-1">
                          <span className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">
                            Catalog Swatches:
                          </span>
                          <div className="flex flex-wrap gap-1">
                            {colors.slice(0, 14).map((c) => {
                              const isAdded = axis.values.some(
                                (v) => v.label.toLowerCase() === c.name.toLowerCase(),
                              );
                              return (
                                <button
                                  key={c.id}
                                  type="button"
                                  disabled={isAdded}
                                  className={`flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs transition-colors ${
                                    isAdded
                                      ? 'opacity-40 border-dashed cursor-not-allowed bg-muted'
                                      : 'hover:border-primary/50 bg-background hover:bg-muted/40 cursor-pointer'
                                  }`}
                                  onClick={() => onAddOptionValue('Color', c.name)}
                                >
                                  {c.hexValue && (
                                    <span
                                      className="size-2.5 rounded-full border border-black/20"
                                      style={{ backgroundColor: c.hexValue }}
                                    />
                                  )}
                                  <span className="text-[11px]">{c.name}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Add Value Input */}
                      <div className="flex items-center gap-2 pt-1">
                        {isColor ? (
                          <Input
                            placeholder="Type color (e.g. Navy Blue, Maroon) and press Enter…"
                            value={newColorInput}
                            onChange={(e) => setNewColorInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleAddColor();
                              }
                            }}
                            className="h-8 max-w-xs text-xs"
                          />
                        ) : isSize ? (
                          <Input
                            placeholder="Type size (e.g. 38, 40, 42 or M, L, XL) and press Enter…"
                            value={newSizeInput}
                            onChange={(e) => setNewSizeInput(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleAddSize();
                              }
                            }}
                            className="h-8 max-w-xs text-xs"
                          />
                        ) : (
                          <Input
                            placeholder={`Type new ${axis.name} value and press Enter…`}
                            value={customAxisInputs[axis.name] ?? ''}
                            onChange={(e) =>
                              setCustomAxisInputs((prev) => ({
                                ...prev,
                                [axis.name]: e.target.value,
                              }))
                            }
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleAddCustomValue(axis.name);
                              }
                            }}
                            className="h-8 max-w-xs text-xs"
                          />
                        )}

                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs"
                          onClick={() => {
                            if (isColor) handleAddColor();
                            else if (isSize) handleAddSize();
                            else handleAddCustomValue(axis.name);
                          }}
                        >
                          Add Value
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Cartesian Variant Matrix Table */}
            {matrixRows.length > 0 ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <span className="text-xs font-semibold text-foreground">
                      Generated Variant Matrix ({matrixRows.length} combinations)
                    </span>
                    <p className="text-[11px] text-muted-foreground">
                      Configure SKUs, individual prices, estimated cost margins, and initial stock locations.
                    </p>
                  </div>
                </div>

                <VariantMatrixTable
                  matrix={matrixRows}
                  onUpdateRow={onUpdateMatrixRow}
                  onBulkUpdate={onBulkUpdateMatrix}
                  onToggleAll={onToggleAllVariants}
                  basePrice={priceAmount}
                  baseCompareAt={compareAtAmount}
                  baseCost={costAmount}
                  baseEstimatedCost={estimatedCostAmount}
                  colors={colors}
                  locations={locations}
                  onRegenerateSkus={onRegenerateAllSkus}
                />
              </div>
            ) : (
              <div className="rounded-lg border border-dashed p-6 text-center text-xs text-muted-foreground space-y-2">
                <Layers className="size-6 mx-auto text-muted-foreground/60" />
                <p className="font-medium">No variant combinations generated</p>
                <p className="text-[11px]">
                  Add values to at least one option axis above to generate product variant combinations.
                </p>
              </div>
            )}

            {fieldErrors.variants && (
              <p className="text-xs text-destructive">{fieldErrors.variants}</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
