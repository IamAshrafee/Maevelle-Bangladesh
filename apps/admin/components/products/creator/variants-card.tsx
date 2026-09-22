'use client';

import { useState } from 'react';
import {
  HelpCircle,
  Layers,
  Palette,
  Plus,
  Sparkles,
  X,
} from 'lucide-react';
import type { CatalogColorDto } from '@maevelle/contracts';

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

import type { OptionAxisState, VariantMatrixRow } from './types';
import { VariantMatrixTable } from './variant-matrix-table';

interface VariantsCardProps {
  readonly variantMode: 'simple' | 'variants';
  readonly sku: string;
  readonly barcode: string;
  readonly optionAxes: readonly OptionAxisState[];
  readonly matrixRows: readonly VariantMatrixRow[];
  readonly colors: readonly CatalogColorDto[];
  readonly sizeSystemId: string;
  readonly priceAmount: string;
  readonly compareAtAmount: string;
  readonly costAmount: string;
  readonly fieldErrors: Record<string, string>;
  readonly onVariantModeChange: (mode: 'simple' | 'variants') => void;
  readonly onSkuChange: (val: string) => void;
  readonly onBarcodeChange: (val: string) => void;
  readonly onAddOptionValue: (axisName: string, val: string) => void;
  readonly onRemoveOptionValue: (axisName: string, val: string) => void;
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
  sizeSystemId,
  priceAmount,
  compareAtAmount,
  costAmount,
  fieldErrors,
  onVariantModeChange,
  onSkuChange,
  onBarcodeChange,
  onAddOptionValue,
  onRemoveOptionValue,
  onImportSizesFromSystem,
  onUpdateMatrixRow,
  onBulkUpdateMatrix,
  onToggleAllVariants,
  onRegenerateAllSkus,
}: VariantsCardProps) {
  const [newColorInput, setNewColorInput] = useState('');
  const [newSizeInput, setNewSizeInput] = useState('');
  const [customAxisName, setCustomAxisName] = useState('');
  const [customAxisValue, setCustomAxisValue] = useState('');
  const [showAddAxis, setShowAddAxis] = useState(false);

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
    if (customAxisName.trim() && customAxisValue.trim()) {
      onAddOptionValue(customAxisName.trim(), customAxisValue.trim());
      setCustomAxisName('');
      setCustomAxisValue('');
      setShowAddAxis(false);
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
          Choose whether this product has a single SKU or multiple options (e.g. Color, Size).
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
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
          </div>
        ) : (
          /* Multi-Variant Mode Configurator & Matrix Table */
          <div className="space-y-5">
            {/* Option Axes Configurator */}
            <div className="rounded-lg border bg-muted/20 p-4 space-y-4">
              <div className="flex items-center justify-between border-b pb-2">
                <div>
                  <p className="text-xs font-semibold text-foreground">
                    Configure Option Axes
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Add values for Colors and Sizes to generate all product variant combinations.
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
                    <span>Add Custom Option</span>
                  </Button>
                )}
              </div>

              {/* Custom Axis Form */}
              {showAddAxis && (
                <div className="flex items-center gap-2 rounded-md border bg-background p-2.5">
                  <Input
                    placeholder="Option Name (e.g. Sleeve, Material)"
                    value={customAxisName}
                    onChange={(e) => setCustomAxisName(e.target.value)}
                    className="h-8 text-xs"
                  />
                  <Input
                    placeholder="First Value (e.g. Full Sleeve)"
                    value={customAxisValue}
                    onChange={(e) => setCustomAxisValue(e.target.value)}
                    className="h-8 text-xs"
                  />
                  <Button
                    type="button"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={handleAddCustomAxis}
                  >
                    Add
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
              )}

              {/* Color Axis */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-medium">Colors</Label>
                  <span className="text-[11px] text-muted-foreground">
                    Click preset color swatches or type custom
                  </span>
                </div>

                {/* Selected Color Badges */}
                <div className="flex flex-wrap items-center gap-1.5">
                  {optionAxes
                    .find((a) => a.name === 'Color')
                    ?.values.map((val) => {
                      const matchedColor = colors.find(
                        (c) => c.name.toLowerCase() === val.toLowerCase(),
                      );
                      return (
                        <Badge
                          key={val}
                          variant="secondary"
                          className="gap-1.5 py-1 pl-2 pr-1.5 text-xs font-medium"
                        >
                          {matchedColor?.hexValue && (
                            <span
                              className="size-2.5 rounded-full border border-black/20"
                              style={{ backgroundColor: matchedColor.hexValue }}
                            />
                          )}
                          <span>{val}</span>
                          <button
                            type="button"
                            className="ml-0.5 rounded-full hover:bg-muted p-0.5"
                            onClick={() => onRemoveOptionValue('Color', val)}
                          >
                            <X className="size-3 text-muted-foreground hover:text-foreground" />
                          </button>
                        </Badge>
                      );
                    })}
                </div>

                {/* Quick Add Preset Swatches from Catalog Colors */}
                {colors.length > 0 && (
                  <div className="space-y-1 pt-1">
                    <span className="text-[10px] uppercase font-semibold text-muted-foreground tracking-wider">
                      Catalog Swatches:
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {colors.slice(0, 14).map((c) => {
                        const isAdded = optionAxes
                          .find((a) => a.name === 'Color')
                          ?.values.some(
                            (v) => v.toLowerCase() === c.name.toLowerCase(),
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

                {/* Custom Color Input */}
                <div className="flex items-center gap-2 pt-1">
                  <Input
                    placeholder="Type custom color and press Enter…"
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
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={handleAddColor}
                  >
                    Add Color
                  </Button>
                </div>
              </div>

              {/* Size Axis */}
              <div className="space-y-2 pt-1">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-medium">Sizes</Label>

                  {/* 1-Click Import from Sizing System */}
                  {sizeSystemId && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 gap-1 px-1.5 text-[11px] text-primary hover:bg-primary/10"
                      onClick={() => onImportSizesFromSystem(sizeSystemId)}
                    >
                      <Sparkles className="size-3" />
                      <span>Import sizes from Size System</span>
                    </Button>
                  )}
                </div>

                {/* Selected Size Badges */}
                <div className="flex flex-wrap items-center gap-1.5">
                  {optionAxes
                    .find((a) => a.name === 'Size')
                    ?.values.map((val) => (
                      <Badge
                        key={val}
                        variant="secondary"
                        className="gap-1.5 py-1 pl-2.5 pr-1.5 text-xs font-medium"
                      >
                        <span>{val}</span>
                        <button
                          type="button"
                          className="ml-0.5 rounded-full hover:bg-muted p-0.5"
                          onClick={() => onRemoveOptionValue('Size', val)}
                        >
                          <X className="size-3 text-muted-foreground hover:text-foreground" />
                        </button>
                      </Badge>
                    ))}
                </div>

                {/* Custom Size Input */}
                <div className="flex items-center gap-2 pt-1">
                  <Input
                    placeholder="e.g. 38, 40, 42 or M, L, XL…"
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
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={handleAddSize}
                  >
                    Add Size
                  </Button>
                </div>
              </div>

              {/* Other Custom Axes */}
              {optionAxes
                .filter((a) => a.name !== 'Color' && a.name !== 'Size')
                .map((axis) => (
                  <div key={axis.name} className="space-y-2 border-t pt-3">
                    <Label className="text-xs font-medium">{axis.name}</Label>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {axis.values.map((val) => (
                        <Badge
                          key={val}
                          variant="secondary"
                          className="gap-1.5 py-1 pl-2.5 pr-1.5 text-xs font-medium"
                        >
                          <span>{val}</span>
                          <button
                            type="button"
                            className="ml-0.5 rounded-full hover:bg-muted p-0.5"
                            onClick={() =>
                              onRemoveOptionValue(axis.name, val)
                            }
                          >
                            <X className="size-3 text-muted-foreground hover:text-foreground" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  </div>
                ))}
            </div>

            {/* Cartesian Variant Matrix Table */}
            {matrixRows.length > 0 ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-foreground">
                    Generated Variant Matrix
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    Configure individual prices, SKUs, and swatches per combination
                  </span>
                </div>

                <VariantMatrixTable
                  matrix={matrixRows}
                  onUpdateRow={onUpdateMatrixRow}
                  onBulkUpdate={onBulkUpdateMatrix}
                  onToggleAll={onToggleAllVariants}
                  basePrice={priceAmount}
                  baseCompareAt={compareAtAmount}
                  baseCost={costAmount}
                  colors={colors}
                  onRegenerateSkus={onRegenerateAllSkus}
                />
              </div>
            ) : (
              <div className="rounded-lg border border-dashed p-6 text-center text-xs text-muted-foreground">
                Add at least one color or size above to generate product variant combinations.
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
