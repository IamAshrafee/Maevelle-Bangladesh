'use client';

import type { CatalogVariantChoiceDto } from '@maevelle/contracts';
import { Check, Package, Plus, RefreshCw, Search } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

type StocktakeFoundItemDialogProps = {
  open: boolean;
  variants: readonly CatalogVariantChoiceDto[];
  query: string;
  selectedVariantId: string;
  loading: boolean;
  submitting: boolean;
  onOpenChange: (open: boolean) => void;
  onQueryChange: (query: string) => void;
  onSelect: (variantId: string) => void;
  onSubmit: () => void;
};

export function StocktakeFoundItemDialog({
  open,
  variants,
  query,
  selectedVariantId,
  loading,
  submitting,
  onOpenChange,
  onQueryChange,
  onSelect,
  onSubmit,
}: StocktakeFoundItemDialogProps) {
  return (
    <Sheet open={open} onOpenChange={(next) => !submitting && onOpenChange(next)}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col p-6">
        <SheetHeader className="p-0 pb-4 border-b border-border/60">
          <SheetTitle className="flex items-center gap-2">
            <Plus className="size-5 text-primary" />
            Add found SKU
          </SheetTitle>
          <SheetDescription>
            Add stock physically present at this Location but absent from the snapshot. Its expected
            quantity starts at zero.
          </SheetDescription>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-3 py-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search title, SKU, or barcode…"
              className="pl-9"
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              autoComplete="off"
              aria-label="Search catalog variants"
            />
          </div>

          <div className="min-h-48 flex-1 divide-y divide-border/60 overflow-y-auto rounded-lg border">
            {loading ? (
              <div className="flex items-center justify-center gap-2 p-6 text-xs text-muted-foreground">
                <RefreshCw className="size-4 animate-spin" /> Loading catalog variants…
              </div>
            ) : variants.length === 0 ? (
              <div className="p-6 text-center text-xs text-muted-foreground">
                {query
                  ? `No catalog variants match “${query}”.`
                  : 'All active catalog variants are already included in this count.'}
              </div>
            ) : (
              variants.map((variant) => {
                const selected = selectedVariantId === variant.id;
                return (
                  <button
                    key={variant.id}
                    type="button"
                    onClick={() => onSelect(variant.id)}
                    aria-pressed={selected}
                    className={cn(
                      'flex min-h-14 w-full items-start gap-3 p-3 text-left text-sm transition-colors duration-150 hover:bg-muted/50',
                      selected && 'border-l-4 border-primary bg-primary/10',
                    )}
                  >
                    <Package className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-foreground">{variant.productTitle}</p>
                      <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span className="rounded bg-muted px-1.5 py-0.5 font-mono tabular-nums text-foreground">
                          {variant.sku}
                        </span>
                        {variant.optionSummary ? <span>{variant.optionSummary}</span> : null}
                      </div>
                    </div>
                    {selected ? <Check className="mt-1 size-4 shrink-0 text-primary" /> : null}
                  </button>
                );
              })
            )}
          </div>
        </div>

        <SheetFooter className="p-0 pt-2 sm:flex-row sm:justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={onSubmit} disabled={!selectedVariantId || submitting}>
            {submitting ? (
              <>
                <RefreshCw className="size-3.5 animate-spin" /> Adding…
              </>
            ) : (
              <>
                <Plus className="size-3.5" /> Add to count sheet
              </>
            )}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
