'use client';

import { FileText, HelpCircle } from 'lucide-react';
import type {
  CatalogAttributeDefinitionDto,
  CatalogProductTypeDefinitionDto,
} from '@maevelle/contracts';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { TriStateToggle } from '@/components/ui/tri-state-toggle';

import { ProductIdentityFields } from './product-identity-fields';

interface BasicInfoCardProps {
  readonly title: string;
  readonly handle: string;
  readonly isHandleLocked: boolean;
  readonly productTypeId: string;
  readonly description: string;
  readonly types: readonly CatalogProductTypeDefinitionDto[];
  readonly selectedProductType?: CatalogProductTypeDefinitionDto | undefined;
  readonly activeAttributes: readonly CatalogAttributeDefinitionDto[];
  readonly attributeValues: Record<string, string | boolean | null>;
  readonly fieldErrors: Record<string, string>;
  readonly onTitleChange: (val: string) => void;
  readonly onHandleChange: (val: string) => void;
  readonly onToggleHandleLock: () => void;
  readonly onProductTypeChange: (typeId: string) => void;
  readonly onAttributeChange: (attrId: string, val: string | boolean | null) => void;
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
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <FileText className="size-4 text-primary" aria-hidden="true" />
            <CardTitle className="text-base font-semibold">Product identity &amp; story</CardTitle>
          </div>
          <Badge variant="secondary" className="text-xs">
            Required
          </Badge>
        </div>
        <CardDescription>
          Name the product, confirm its storefront URL, and tell the customer story first.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        <ProductIdentityFields
          title={title}
          handle={handle}
          isHandleLocked={isHandleLocked}
          titleError={fieldErrors.title}
          handleError={fieldErrors.handle}
          onTitleChange={onTitleChange}
          onHandleChange={onHandleChange}
          onToggleHandleLock={onToggleHandleLock}
        />

        <div className="space-y-2">
          <div className="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:justify-between">
            <Label htmlFor="product-description" className="text-xs font-medium sm:text-sm">
              Product details &amp; story
            </Label>
            <span className="text-[11px] text-muted-foreground">
              Materials, craftsmanship, fit, use and care
            </span>
          </div>
          <Textarea
            id="product-description"
            rows={5}
            placeholder="Explain what makes this product special and give customers the practical details they need…"
            value={description}
            onChange={(event) => onDescriptionChange(event.target.value)}
          />
        </div>

        <section className="space-y-4 rounded-xl border border-border bg-muted/20 p-4">
          <div className="space-y-1">
            <div className="flex items-center gap-1.5">
              <Label htmlFor="product-type-select" className="text-xs font-semibold sm:text-sm">
                Product classification <span className="text-destructive">*</span>
              </Label>
              <Tooltip>
                <TooltipTrigger render={<span tabIndex={0} className="inline-flex cursor-help" />}>
                  <HelpCircle className="size-3.5 text-muted-foreground" aria-hidden="true" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  Classification controls the structured attributes shown below. It does not
                  silently assign a category.
                </TooltipContent>
              </Tooltip>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Choose the closest merchandise type. Nothing is selected automatically.
            </p>
          </div>

          <NativeSelect
            id="product-type-select"
            value={productTypeId}
            onChange={(event) => onProductTypeChange(event.target.value)}
          >
            <NativeSelectOption value="">Select a product type…</NativeSelectOption>
            {types.map((type) => (
              <NativeSelectOption key={type.id} value={type.id}>
                {type.name} {type.code ? `(${type.code})` : ''}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          {fieldErrors.productTypeId ? (
            <p className="text-xs text-destructive">{fieldErrors.productTypeId}</p>
          ) : null}

          {productTypeId && activeAttributes.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
              This classification has no active product attributes. You can continue without adding
              specifications here.
            </div>
          ) : null}

          {activeAttributes.length > 0 ? (
            <div className="space-y-3 border-t border-border pt-4">
              <div className="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-xs font-semibold text-foreground">
                  {selectedProductType?.name} key attributes
                </span>
                <span className="text-[11px] text-muted-foreground">
                  Published in the Key Attributes group.
                </span>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                {activeAttributes.map((attribute) => {
                  const value = attributeValues[attribute.id] ?? null;
                  return (
                    <div key={attribute.id} className="space-y-1.5">
                      <Label className="text-xs font-medium">
                        {attribute.name}
                        {attribute.required ? (
                          <span className="ml-0.5 text-destructive">*</span>
                        ) : null}
                      </Label>
                      {attribute.valueType === 'BOOLEAN' ? (
                        <TriStateToggle
                          ariaLabel={attribute.name}
                          value={typeof value === 'boolean' ? value : null}
                          onValueChange={(next) => onAttributeChange(attribute.id, next)}
                        />
                      ) : attribute.valueType === 'REFERENCE' ? (
                        <NativeSelect
                          value={typeof value === 'string' ? value : ''}
                          onChange={(event) =>
                            onAttributeChange(attribute.id, event.target.value || null)
                          }
                          className="text-xs"
                        >
                          <NativeSelectOption value="">Not provided</NativeSelectOption>
                          {attribute.referenceOptions.map((option) => (
                            <NativeSelectOption key={option.id} value={option.id}>
                              {option.label}
                            </NativeSelectOption>
                          ))}
                        </NativeSelect>
                      ) : (
                        <Input
                          type={
                            attribute.valueType === 'INTEGER' || attribute.valueType === 'DECIMAL'
                              ? 'number'
                              : attribute.valueType === 'DATE'
                                ? 'date'
                                : 'text'
                          }
                          step={attribute.valueType === 'DECIMAL' ? 'any' : undefined}
                          placeholder={`Enter ${attribute.name.toLowerCase()}…`}
                          value={typeof value === 'string' ? value : ''}
                          onChange={(event) =>
                            onAttributeChange(attribute.id, event.target.value || null)
                          }
                          className="text-xs"
                        />
                      )}
                      {value === null && attribute.valueType === 'BOOLEAN' ? (
                        <p className="text-[11px] text-muted-foreground">
                          Not provided — no yes/no claim will be published.
                        </p>
                      ) : null}
                      {fieldErrors[`attr_${attribute.id}`] ? (
                        <p className="text-[11px] text-destructive">
                          {fieldErrors[`attr_${attribute.id}`]}
                        </p>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
        </section>
      </CardContent>
    </Card>
  );
}
