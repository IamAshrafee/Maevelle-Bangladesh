'use client';

import { FileText, HelpCircle, Lock, Unlock } from 'lucide-react';
import type {
  CatalogAttributeDefinitionDto,
  CatalogProductTypeDefinitionDto,
} from '@maevelle/contracts';

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
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface BasicInfoCardProps {
  readonly title: string;
  readonly handle: string;
  readonly isHandleLocked: boolean;
  readonly productTypeId: string;
  readonly description: string;
  readonly types: readonly CatalogProductTypeDefinitionDto[];
  readonly selectedProductType?: CatalogProductTypeDefinitionDto | undefined;
  readonly activeAttributes: readonly CatalogAttributeDefinitionDto[];
  readonly attributeValues: Record<string, string | boolean>;
  readonly fieldErrors: Record<string, string>;
  readonly onTitleChange: (val: string) => void;
  readonly onHandleChange: (val: string) => void;
  readonly onToggleHandleLock: () => void;
  readonly onProductTypeChange: (typeId: string) => void;
  readonly onAttributeChange: (attrId: string, val: string | boolean) => void;
  readonly onDescriptionChange: (desc: string) => void;
}

export function BasicInfoCard({
  title,
  handle,
  isHandleLocked,
  productTypeId,
  description,
  types,
  selectedProductType,
  activeAttributes,
  attributeValues,
  fieldErrors,
  onTitleChange,
  onHandleChange,
  onToggleHandleLock,
  onProductTypeChange,
  onAttributeChange,
  onDescriptionChange,
}: BasicInfoCardProps) {
  return (
    <Card className="shadow-xs">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="size-4 text-primary" aria-hidden="true" />
            <CardTitle className="text-base font-semibold">
              Basic Information
            </CardTitle>
          </div>
          <Badge variant="secondary" className="text-xs">
            Required
          </Badge>
        </div>
        <CardDescription>
          Title, storefront URL slug, product classification, and narrative description.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Title */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="product-title" className="font-medium text-xs sm:text-sm">
              Product Title <span className="text-destructive">*</span>
            </Label>
            <span className="text-[11px] text-muted-foreground">
              {title.length}/180
            </span>
          </div>
          <Input
            id="product-title"
            placeholder="e.g. Royal Silk Festive Panjabi - Maroon & Gold"
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            className="text-sm font-medium"
          />
          {fieldErrors.title && (
            <p className="text-xs text-destructive">{fieldErrors.title}</p>
          )}
        </div>

        {/* Handle / URL Slug */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Label htmlFor="product-handle" className="font-medium text-xs sm:text-sm">
                Storefront URL Slug <span className="text-destructive">*</span>
              </Label>
              <Tooltip>
                <TooltipTrigger render={<span tabIndex={0} className="inline-flex cursor-help" />}>
                  <HelpCircle className="size-3.5 text-muted-foreground" aria-hidden="true" />
                </TooltipTrigger>
                <TooltipContent>
                  The unique web address for this product on the public storefront.
                </TooltipContent>
              </Tooltip>
            </div>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 gap-1 px-1.5 text-[11px] text-muted-foreground hover:text-foreground"
              onClick={onToggleHandleLock}
            >
              {isHandleLocked ? (
                <>
                  <Lock className="size-3 text-emerald-600" />
                  <span>Synced with Title</span>
                </>
              ) : (
                <>
                  <Unlock className="size-3 text-amber-600" />
                  <span>Custom Slug</span>
                </>
              )}
            </Button>
          </div>

          <div className="flex items-center rounded-md border bg-muted/20 px-3 py-1.5 text-xs text-muted-foreground focus-within:ring-1 focus-within:ring-ring">
            <span className="select-none text-muted-foreground">
              maevelle.com/products/
            </span>
            <input
              id="product-handle"
              type="text"
              readOnly={isHandleLocked}
              value={handle}
              onChange={(e) => onHandleChange(e.target.value)}
              className="ml-1 w-full bg-transparent font-mono text-xs text-foreground outline-none disabled:cursor-not-allowed"
              placeholder="royal-silk-festive-panjabi"
            />
          </div>
          {fieldErrors.handle && (
            <p className="text-xs text-destructive">{fieldErrors.handle}</p>
          )}
        </div>

        {/* Product Type */}
        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <Label htmlFor="product-type-select" className="font-medium text-xs sm:text-sm">
              Product Classification (Type) <span className="text-destructive">*</span>
            </Label>
            <Tooltip>
              <TooltipTrigger render={<span tabIndex={0} className="inline-flex cursor-help" />}>
                <HelpCircle className="size-3.5 text-muted-foreground" aria-hidden="true" />
              </TooltipTrigger>
              <TooltipContent>
                Defines the merchandise taxonomy, default categories, and custom specification attributes.
              </TooltipContent>
            </Tooltip>
          </div>

          <NativeSelect
            id="product-type-select"
            value={productTypeId}
            onChange={(e) => onProductTypeChange(e.target.value)}
            className="text-xs sm:text-sm"
          >
            <NativeSelectOption value="">
              Select a product type…
            </NativeSelectOption>
            {types.map((type) => (
              <NativeSelectOption key={type.id} value={type.id}>
                {type.name} {type.code ? `(${type.code})` : ''}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          {fieldErrors.productTypeId && (
            <p className="text-xs text-destructive">{fieldErrors.productTypeId}</p>
          )}
        </div>

        {/* Dynamic Attributes (Rendered based on selected Product Type) */}
        {activeAttributes.length > 0 && (
          <div className="space-y-3 rounded-lg border bg-muted/20 p-4">
            <div className="flex items-center justify-between border-b pb-2">
              <span className="text-xs font-semibold text-foreground">
                {selectedProductType?.name} Attributes
              </span>
              <span className="text-[11px] text-muted-foreground">
                Custom specifications for this product type
              </span>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {activeAttributes.map((attr) => (
                <div key={attr.id} className="space-y-1.5">
                  <Label className="text-xs font-medium">
                    {attr.name}
                    {attr.required && (
                      <span className="text-destructive ml-0.5">*</span>
                    )}
                  </Label>

                  {/* BOOLEAN */}
                  {attr.valueType === 'BOOLEAN' ? (
                    <div className="flex items-center gap-2 pt-1">
                      <Switch
                        checked={Boolean(attributeValues[attr.id])}
                        onCheckedChange={(checked) =>
                          onAttributeChange(attr.id, checked)
                        }
                      />
                      <span className="text-xs text-muted-foreground">
                        {attributeValues[attr.id] ? 'Yes' : 'No'}
                      </span>
                    </div>
                  ) : attr.valueType === 'REFERENCE' && attr.referenceOptions ? (
                    /* REFERENCE (Dropdown) */
                    <NativeSelect
                      value={String(attributeValues[attr.id] || '')}
                      onChange={(e) =>
                        onAttributeChange(attr.id, e.target.value)
                      }
                      className="text-xs h-8"
                    >
                      <NativeSelectOption value="">
                        Select {attr.name}…
                      </NativeSelectOption>
                      {attr.referenceOptions.map((opt) => (
                        <NativeSelectOption key={opt.id} value={opt.id}>
                          {opt.label}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                  ) : (
                    /* TEXT or NUMBER */
                    <Input
                      type={
                        attr.valueType === 'INTEGER' || attr.valueType === 'DECIMAL'
                          ? 'number'
                          : 'text'
                      }
                      step={attr.valueType === 'DECIMAL' ? 'any' : undefined}
                      placeholder={`Enter ${attr.name.toLowerCase()}…`}
                      value={String(attributeValues[attr.id] || '')}
                      onChange={(e) =>
                        onAttributeChange(attr.id, e.target.value)
                      }
                      className="text-xs h-8"
                    />
                  )}

                  {fieldErrors[`attr_${attr.id}`] && (
                    <p className="text-[11px] text-destructive">
                      {fieldErrors[`attr_${attr.id}`]}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Description */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="product-description" className="font-medium text-xs sm:text-sm">
              Product Story & Details
            </Label>
            <span className="text-[11px] text-muted-foreground">
              Fabric, craftsmanship, fit, care instructions
            </span>
          </div>
          <Textarea
            id="product-description"
            rows={4}
            placeholder="Crafted with pure mulberry silk, this tailored panjabi features intricate hand-embroidered collars and mother-of-pearl buttons. Ideal for celebratory gatherings and Eid festivities…"
            value={description}
            onChange={(e) => onDescriptionChange(e.target.value)}
          />
        </div>
      </CardContent>
    </Card>
  );
}
