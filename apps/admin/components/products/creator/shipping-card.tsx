'use client';

import { Truck, Package, HelpCircle, Sparkles } from 'lucide-react';
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
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { ShippingPreset } from './types';

const BANGLADESH_SHIPPING_PRESETS: readonly ShippingPreset[] = [
  {
    label: 'Light Apparel',
    description: 'Saree, Shirt, Panjabi (400g)',
    weightValue: '400',
    weightUnit: 'G',
    length: '30',
    width: '25',
    height: '4',
    dimensionUnit: 'CM',
  },
  {
    label: 'Heavy Fashion',
    description: 'Sherwani, Coat, Winter (1.2kg)',
    weightValue: '1200',
    weightUnit: 'G',
    length: '40',
    width: '30',
    height: '8',
    dimensionUnit: 'CM',
  },
  {
    label: 'Footwear',
    description: 'Boxed Shoes / Mojari (800g)',
    weightValue: '800',
    weightUnit: 'G',
    length: '32',
    width: '20',
    height: '12',
    dimensionUnit: 'CM',
  },
  {
    label: 'Jewelry & Accessories',
    description: 'Small Box / Pouch (150g)',
    weightValue: '150',
    weightUnit: 'G',
    length: '15',
    width: '10',
    height: '3',
    dimensionUnit: 'CM',
  },
];

interface ShippingCardProps {
  readonly weightValue: string;
  readonly onWeightValueChange: (v: string) => void;
  readonly weightUnit: 'G' | 'KG';
  readonly onWeightUnitChange: (u: 'G' | 'KG') => void;
  readonly lengthValue: string;
  readonly onLengthValueChange: (v: string) => void;
  readonly widthValue: string;
  readonly onWidthValueChange: (v: string) => void;
  readonly heightValue: string;
  readonly onHeightValueChange: (v: string) => void;
  readonly dimensionUnit: 'CM' | 'MM' | 'IN';
  readonly onDimensionUnitChange: (u: 'CM' | 'MM' | 'IN') => void;
}

export function ShippingCard({
  weightValue,
  onWeightValueChange,
  weightUnit,
  onWeightUnitChange,
  lengthValue,
  onLengthValueChange,
  widthValue,
  onWidthValueChange,
  heightValue,
  onHeightValueChange,
  dimensionUnit,
  onDimensionUnitChange,
}: ShippingCardProps) {
  const handleApplyPreset = (preset: ShippingPreset) => {
    onWeightValueChange(preset.weightValue);
    onWeightUnitChange(preset.weightUnit);
    onLengthValueChange(preset.length);
    onWidthValueChange(preset.width);
    onHeightValueChange(preset.height);
    onDimensionUnitChange(preset.dimensionUnit);
  };

  return (
    <Card className="shadow-xs">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Truck className="size-4 text-primary" aria-hidden="true" />
            <CardTitle className="text-base font-semibold">Shipping & Logistics</CardTitle>
          </div>
          <Tooltip>
            <TooltipTrigger render={<span tabIndex={0} className="inline-flex cursor-help" />}>
              <HelpCircle className="size-4 text-muted-foreground" aria-hidden="true" />
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              Physical package weight and dimensions are used to calculate automated courier delivery rates
              (Pathao, Steadfast, RedX) and volumetric charges.
            </TooltipContent>
          </Tooltip>
        </div>
        <CardDescription>
          Package specifications for domestic Bangladesh courier delivery and warehouse fulfillment.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Quick Presets */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Sparkles className="size-3 text-amber-500" />
            <span>Quick Courier Presets (Bangladesh)</span>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {BANGLADESH_SHIPPING_PRESETS.map((preset) => (
              <Button
                key={preset.label}
                type="button"
                variant="outline"
                size="sm"
                className="h-auto flex-col items-start p-2 text-left"
                onClick={() => handleApplyPreset(preset)}
              >
                <span className="text-xs font-semibold text-foreground">{preset.label}</span>
                <span className="text-[10px] text-muted-foreground line-clamp-1">
                  {preset.description}
                </span>
              </Button>
            ))}
          </div>
        </div>

        {/* Weight & Dimension Inputs */}
        <div className="grid gap-4 sm:grid-cols-2">
          {/* Weight */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <Label htmlFor="package-weight" className="text-xs sm:text-sm font-medium">
                Package Weight
              </Label>
              <Tooltip>
                <TooltipTrigger render={<span tabIndex={0} className="inline-flex cursor-help" />}>
                  <HelpCircle className="size-3.5 text-muted-foreground" aria-hidden="true" />
                </TooltipTrigger>
                <TooltipContent>
                  Standard domestic shipping charges apply up to 1000g (1kg). Heavy items incur incremental rates.
                </TooltipContent>
              </Tooltip>
            </div>
            <div className="flex items-center gap-2">
              <Input
                id="package-weight"
                type="number"
                step="any"
                min="0"
                placeholder="400"
                value={weightValue}
                onChange={(e) => onWeightValueChange(e.target.value)}
                className="text-xs sm:text-sm"
              />
              <NativeSelect
                value={weightUnit}
                onChange={(e) => onWeightUnitChange(e.target.value as 'G' | 'KG')}
                className="w-24 text-xs"
              >
                <NativeSelectOption value="G">G (grams)</NativeSelectOption>
                <NativeSelectOption value="KG">KG (kilos)</NativeSelectOption>
              </NativeSelect>
            </div>
          </div>

          {/* Dimensions */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <Label className="text-xs sm:text-sm font-medium">
                Dimensions (L × W × H)
              </Label>
              <Tooltip>
                <TooltipTrigger render={<span tabIndex={0} className="inline-flex cursor-help" />}>
                  <HelpCircle className="size-3.5 text-muted-foreground" aria-hidden="true" />
                </TooltipTrigger>
                <TooltipContent>
                  Couriers calculate Volumetric Weight as (L × W × H in cm) / 5000.
                </TooltipContent>
              </Tooltip>
            </div>
            <div className="flex items-center gap-1.5">
              <Input
                type="number"
                step="any"
                min="0"
                placeholder="L"
                value={lengthValue}
                onChange={(e) => onLengthValueChange(e.target.value)}
                className="text-xs"
              />
              <span className="text-muted-foreground text-xs">×</span>
              <Input
                type="number"
                step="any"
                min="0"
                placeholder="W"
                value={widthValue}
                onChange={(e) => onWidthValueChange(e.target.value)}
                className="text-xs"
              />
              <span className="text-muted-foreground text-xs">×</span>
              <Input
                type="number"
                step="any"
                min="0"
                placeholder="H"
                value={heightValue}
                onChange={(e) => onHeightValueChange(e.target.value)}
                className="text-xs"
              />
              <NativeSelect
                value={dimensionUnit}
                onChange={(e) => onDimensionUnitChange(e.target.value as 'CM' | 'MM' | 'IN')}
                className="w-20 text-xs"
              >
                <NativeSelectOption value="CM">CM</NativeSelectOption>
                <NativeSelectOption value="MM">MM</NativeSelectOption>
                <NativeSelectOption value="IN">IN</NativeSelectOption>
              </NativeSelect>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
