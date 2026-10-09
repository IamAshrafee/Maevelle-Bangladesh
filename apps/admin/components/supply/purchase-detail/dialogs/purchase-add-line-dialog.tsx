'use client';

import {
  AlertCircle,
  ArrowLeft,
  Barcode,
  Check,
  CheckCircle2,
  ChevronRight,
  Filter,
  Image as ImageIcon,
  Loader2,
  Minus,
  Package,
  Plus,
  PlusCircle,
  Search,
  Sparkles,
  X,
  ZoomIn,
} from 'lucide-react';
import {
  type FormEvent,
  type KeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { CatalogVariantChoiceDto, PurchaseDto } from '@maevelle/contracts';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { formatSupplyMoney } from '@/lib/supply/api';
import { cn } from '@/lib/utils';

export interface PurchaseAddLineDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly purchase: PurchaseDto;
  readonly variants: readonly CatalogVariantChoiceDto[];
  readonly busy: boolean;
  readonly onAddLine: (
    data: { variantId: string; quantity: string; unitPrice: string },
    keepOpen?: boolean,
  ) => void;
}

export function PurchaseAddLineDialog({
  open,
  onOpenChange,
  purchase,
  variants,
  busy,
  onAddLine,
}: PurchaseAddLineDialogProps) {
  // Discovery & Filtering state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [stockFilter, setStockFilter] = useState<'ALL' | 'OUT_OF_STOCK' | 'IN_PO'>('ALL');

  // Procurement form state
  const [selectedVariantId, setSelectedVariantId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [unitPrice, setUnitPrice] = useState('0');

  // Responsive mobile workflow: 'browse' (variant list) | 'configure' (quantity/price inputs)
  const [mobileStep, setMobileStep] = useState<'browse' | 'configure'>('browse');

  // UI state
  const [transientFeedback, setTransientFeedback] = useState<string | null>(null);
  const [previewImage, setPreviewImage] = useState<{ url: string; title: string } | null>(null);

  // Focus management refs
  const searchInputRef = useRef<HTMLInputElement>(null);
  const quantityInputRef = useRef<HTMLInputElement>(null);

  // Active variants filter
  const activeVariants = useMemo(
    () => variants.filter((v) => v.status === 'ACTIVE'),
    [variants],
  );

  // Map of existing variants already on this purchase order
  const poLinesMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const line of purchase.lines) {
      const current = map.get(line.variantId) ?? 0;
      map.set(line.variantId, current + Number(line.quantity));
    }
    return map;
  }, [purchase.lines]);

  // Distinct category list
  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const v of activeVariants) {
      if (v.categoryName?.trim()) {
        set.add(v.categoryName.trim());
      }
    }
    return Array.from(set).sort();
  }, [activeVariants]);

  // Selected variant snapshot
  const selectedVariant = useMemo(
    () => activeVariants.find((v) => v.id === selectedVariantId),
    [activeVariants, selectedVariantId],
  );

  // Auto-focus search input when dialog opens (on desktop/tablet)
  useEffect(() => {
    if (open) {
      const timer = setTimeout(() => {
        searchInputRef.current?.focus();
      }, 80);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [open]);

  // Auto-fill price with estimated cost when selecting a variant
  function selectVariant(variant: CatalogVariantChoiceDto) {
    setSelectedVariantId(variant.id);
    if (variant.estimatedCostAmount && Number(variant.estimatedCostAmount) > 0) {
      setUnitPrice(variant.estimatedCostAmount);
    } else if (Number(unitPrice || 0) === 0) {
      setUnitPrice('0');
    }

    // Switch mobile view to configuration step
    setMobileStep('configure');

    // Automatically focus quantity input
    setTimeout(() => {
      quantityInputRef.current?.focus();
      quantityInputRef.current?.select();
    }, 50);
  }

  // Filtered variants
  const filteredVariants = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    return activeVariants.filter((item) => {
      // Category filter
      if (selectedCategory !== 'ALL' && item.categoryName !== selectedCategory) {
        return false;
      }

      // Stock status filter
      if (stockFilter === 'OUT_OF_STOCK') {
        const stock = item.inventoryOnHand ?? 0;
        if (stock > 0) return false;
      } else if (stockFilter === 'IN_PO') {
        if (!poLinesMap.has(item.id)) return false;
      }

      // Query filter
      if (!q) return true;

      const titleMatch = item.productTitle.toLowerCase().includes(q);
      const skuMatch = item.sku.toLowerCase().includes(q);
      const barcodeMatch = Boolean(item.barcode?.toLowerCase().includes(q));
      const optionsMatch = Boolean(item.optionSummary?.toLowerCase().includes(q));
      const categoryMatch = Boolean(item.categoryName?.toLowerCase().includes(q));

      return titleMatch || skuMatch || barcodeMatch || optionsMatch || categoryMatch;
    });
  }, [activeVariants, searchQuery, selectedCategory, stockFilter, poLinesMap]);

  // Handle barcode scanner exact hit (sub-second rapid workflow)
  function handleSearchKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault();
      const q = searchQuery.trim().toLowerCase();
      if (!q) return;

      // Check exact barcode or SKU match
      const exactMatch = activeVariants.find(
        (v) =>
          v.sku.toLowerCase() === q ||
          (v.barcode && v.barcode.toLowerCase() === q),
      );

      if (exactMatch) {
        selectVariant(exactMatch);
      } else if (filteredVariants.length === 1 && filteredVariants[0]) {
        selectVariant(filteredVariants[0]);
      }
    }
  }

  // Live subtotal calculation
  const subtotal = Math.max(0, Number(quantity || 0) * Number(unitPrice || 0));

  function resetSelection() {
    setSelectedVariantId('');
    setQuantity('1');
    setUnitPrice('0');
    setTransientFeedback(null);
    setMobileStep('browse');
  }

  function handleFullReset() {
    resetSelection();
    setSearchQuery('');
    setSelectedCategory('ALL');
    setStockFilter('ALL');
    setMobileStep('browse');
  }

  function submitAddLine(keepOpen: boolean) {
    if (!selectedVariantId) return;
    const qtyNum = Number(quantity);
    if (!qtyNum || qtyNum <= 0) return;

    const variantName = selectedVariant
      ? `${selectedVariant.productTitle} (${selectedVariant.sku})`
      : 'Item';

    onAddLine(
      {
        variantId: selectedVariantId,
        quantity,
        unitPrice,
      },
      keepOpen,
    );

    if (keepOpen) {
      setTransientFeedback(`Added ${quantity} units of ${variantName} to PO`);
      setSelectedVariantId('');
      setQuantity('1');
      setUnitPrice('0');
      // On mobile, switch back to browse step so purchaser can pick next variant
      setMobileStep('browse');
      // Re-focus search input
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 100);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    submitAddLine(false);
  }

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) handleFullReset();
          onOpenChange(next);
        }}
      >
        <DialogContent
          className={cn(
            'fixed z-50 flex flex-col p-0 overflow-hidden bg-background shadow-xl duration-100',
            // Mobile: Full screen adaptive viewport
            'inset-0 top-0 left-0 w-full h-[100dvh] max-w-full rounded-none translate-x-0 translate-y-0 border-0',
            // Tablet & Desktop: Centered responsive card
            'sm:inset-auto sm:top-1/2 sm:left-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:w-full sm:max-w-4xl lg:max-w-5xl sm:h-auto sm:max-h-[92vh] sm:rounded-2xl sm:border border-border',
          )}
        >
          {/* Header */}
          <DialogHeader className="border-b px-4 py-3 sm:px-6 sm:py-4 bg-card shrink-0">
            <div className="flex flex-wrap items-center justify-between gap-2.5 pr-8 sm:pr-10">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <DialogTitle className="text-base sm:text-lg font-heading font-semibold text-foreground">
                    Add Purchase Item
                  </DialogTitle>
                  <Badge variant="outline" className="font-mono text-[11px] sm:text-xs tabular-nums">
                    PO #{purchase.id.slice(0, 8)}
                  </Badge>
                  <Badge variant="secondary" className="font-mono text-[11px] sm:text-xs font-semibold">
                    {purchase.currencyCode}
                  </Badge>
                </div>
                <DialogDescription className="mt-0.5 text-xs text-muted-foreground truncate">
                  Search catalog variants, check stock, and set procurement cost.
                </DialogDescription>
              </div>

              {/* Transient feedback banner when adding sequentially */}
              {transientFeedback && (
                <div className="flex items-center gap-1.5 rounded-md border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 sm:px-2.5 sm:py-1 text-xs text-emerald-700 dark:text-emerald-400 shrink-0">
                  <CheckCircle2 className="size-3.5 shrink-0" />
                  <span className="font-medium truncate max-w-[200px] sm:max-w-xs">{transientFeedback}</span>
                </div>
              )}
            </div>

            {/* Mobile Segmented Step Pill Indicator */}
            <div className="flex items-center gap-1 pt-2 md:hidden">
              <button
                type="button"
                onClick={() => setMobileStep('browse')}
                className={cn(
                  'flex-1 py-1 text-xs font-medium rounded-md text-center transition-colors',
                  mobileStep === 'browse'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground',
                )}
              >
                1. Browse Variants ({activeVariants.length})
              </button>
              <button
                type="button"
                disabled={!selectedVariant}
                onClick={() => setMobileStep('configure')}
                className={cn(
                  'flex-1 py-1 text-xs font-medium rounded-md text-center transition-colors',
                  mobileStep === 'configure'
                    ? 'bg-primary text-primary-foreground'
                    : selectedVariant
                      ? 'bg-muted text-foreground'
                      : 'bg-muted/40 text-muted-foreground/40 cursor-not-allowed',
                )}
              >
                2. Configure Quantity & Cost {selectedVariant ? '✓' : ''}
              </button>
            </div>
          </DialogHeader>

          {/* Main Workspace: 2-column on desktop, adaptive step on mobile */}
          <div className="grid grid-cols-1 md:grid-cols-12 flex-1 overflow-hidden min-h-0 bg-background divide-y md:divide-y-0 md:divide-x divide-border">
            {/* Left Column: Variant Discovery & Gallery (Desktop: 7 cols; Mobile: shown when mobileStep === 'browse') */}
            <div
              className={cn(
                'flex flex-col min-h-0 overflow-hidden bg-card/40 md:col-span-7',
                mobileStep === 'configure' ? 'hidden md:flex' : 'flex',
              )}
            >
              {/* Search & Filter Bar */}
              <div className="p-3 sm:p-4 border-b space-y-2.5 sm:space-y-3 shrink-0 bg-card">
                {/* Search Input with Scanner Support */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                  <Input
                    ref={searchInputRef}
                    type="text"
                    placeholder="Search title, SKU, barcode, color, size..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={handleSearchKeyDown}
                    className="h-10 pl-9 pr-9 text-base sm:text-sm rounded-lg bg-background"
                  />
                  {searchQuery ? (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      aria-label="Clear search"
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-1"
                    >
                      <X className="size-4" />
                    </button>
                  ) : (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 text-[10px] text-muted-foreground font-mono">
                      <Barcode className="size-3.5" />
                      <span className="hidden sm:inline">Scanner</span>
                    </div>
                  )}
                </div>

                {/* Filter Controls: Category & Stock Filter Chips (Horizontal Scroll on Mobile) */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs">
                  {/* Category Pills (Touch scrollable) */}
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 [scrollbar-width:none] [-ms-overflow-style:none]">
                    <button
                      type="button"
                      onClick={() => setSelectedCategory('ALL')}
                      className={cn(
                        'h-7 sm:h-6 px-2.5 sm:px-2 rounded-md font-medium transition-colors text-xs shrink-0',
                        selectedCategory === 'ALL'
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted hover:bg-muted/80 text-muted-foreground',
                      )}
                    >
                      All ({activeVariants.length})
                    </button>
                    {categories.map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setSelectedCategory(cat)}
                        className={cn(
                          'h-7 sm:h-6 px-2.5 sm:px-2 rounded-md transition-colors text-xs shrink-0',
                          selectedCategory === cat
                            ? 'bg-primary text-primary-foreground font-medium'
                            : 'bg-muted hover:bg-muted/80 text-muted-foreground',
                        )}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>

                  {/* Stock Quick Filters */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() =>
                        setStockFilter((prev) => (prev === 'OUT_OF_STOCK' ? 'ALL' : 'OUT_OF_STOCK'))
                      }
                      className={cn(
                        'h-7 sm:h-6 px-2.5 sm:px-2 rounded-md text-[11px] font-medium border transition-colors flex items-center gap-1 shrink-0',
                        stockFilter === 'OUT_OF_STOCK'
                          ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30'
                          : 'border-border text-muted-foreground hover:bg-muted',
                      )}
                    >
                      <AlertCircle className="size-3" />
                      <span>Out of Stock</span>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        setStockFilter((prev) => (prev === 'IN_PO' ? 'ALL' : 'IN_PO'))
                      }
                      className={cn(
                        'h-7 sm:h-6 px-2.5 sm:px-2 rounded-md text-[11px] font-medium border transition-colors shrink-0',
                        stockFilter === 'IN_PO'
                          ? 'bg-primary-subtle text-primary border-primary'
                          : 'border-border text-muted-foreground hover:bg-muted',
                      )}
                    >
                      In this PO
                    </button>
                  </div>
                </div>
              </div>

              {/* Scrollable Variant Cards List */}
              <div className="flex-1 overflow-y-auto p-2.5 sm:p-3 space-y-2">
                {filteredVariants.length === 0 ? (
                  <div className="flex flex-col items-center justify-center p-8 sm:p-12 text-center text-muted-foreground">
                    <Package className="size-8 opacity-40 mb-2" />
                    <p className="text-sm font-medium">No catalog variants found</p>
                    <p className="text-xs text-muted-foreground/80 mt-1 max-w-xs">
                      Try relaxing your search query or reset the category/stock filters.
                    </p>
                    {(searchQuery || selectedCategory !== 'ALL' || stockFilter !== 'ALL') && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-3 text-xs"
                        onClick={() => {
                          setSearchQuery('');
                          setSelectedCategory('ALL');
                          setStockFilter('ALL');
                        }}
                      >
                        Reset filters
                      </Button>
                    )}
                  </div>
                ) : (
                  filteredVariants.map((item) => {
                    const isSelected = item.id === selectedVariantId;
                    const onHandStock = item.inventoryOnHand ?? 0;
                    const poQuantity = poLinesMap.get(item.id);

                    return (
                      <div
                        key={item.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => selectVariant(item)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            selectVariant(item);
                          }
                        }}
                        className={cn(
                          'group flex items-center gap-3 p-2.5 sm:p-3 rounded-xl border text-left cursor-pointer transition-colors active:scale-[0.99]',
                          isSelected
                            ? 'border-primary bg-primary-subtle/30 ring-1 ring-primary shadow-xs'
                            : 'border-border/70 bg-card hover:border-primary/50 hover:bg-card/90',
                        )}
                      >
                        {/* High-Priority Variant Image Thumbnail */}
                        <div className="relative size-14 sm:size-15 shrink-0 overflow-hidden rounded-lg border border-border bg-muted/40">
                          {item.primaryImageUrl ? (
                            <img
                              src={item.primaryImageUrl}
                              alt={item.productTitle}
                              className="size-full object-cover"
                              loading="lazy"
                              onError={(e) => {
                                (e.currentTarget as HTMLElement).style.display = 'none';
                              }}
                            />
                          ) : (
                            <div className="flex size-full items-center justify-center text-muted-foreground/50">
                              <ImageIcon className="size-6" />
                            </div>
                          )}

                          {/* Quick Zoom Trigger */}
                          {item.primaryImageUrl && (
                            <button
                              type="button"
                              aria-label={`Enlarge image for ${item.productTitle}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                setPreviewImage({
                                  url: item.primaryImageUrl!,
                                  title: `${item.productTitle} · ${item.sku}`,
                                });
                              }}
                              className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity text-white"
                            >
                              <ZoomIn className="size-4" />
                            </button>
                          )}
                        </div>

                        {/* Middle Details: Title, SKU, Attributes */}
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-center gap-1.5">
                            <span className="font-medium text-sm text-foreground truncate">
                              {item.productTitle}
                            </span>
                            {item.categoryName && (
                              <span className="text-[10px] text-muted-foreground/75 truncate shrink-0 hidden sm:inline">
                                · {item.categoryName}
                              </span>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-mono text-xs text-muted-foreground font-medium">
                              {item.sku}
                            </span>

                            {item.barcode && (
                              <span className="inline-flex items-center gap-0.5 rounded bg-muted/60 px-1 py-0.2 text-[10px] font-mono text-muted-foreground">
                                <Barcode className="size-2.5 text-muted-foreground/60" />
                                {item.barcode}
                              </span>
                            )}

                            {item.optionSummary && (
                              <Badge variant="secondary" className="text-[10px] py-0 px-1.5 font-normal">
                                {item.optionSummary}
                              </Badge>
                            )}
                          </div>
                        </div>

                        {/* Right Operational Badges: Stock & PO Status */}
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          {/* Stock Pill */}
                          {onHandStock <= 0 ? (
                            <Badge
                              variant="outline"
                              className="text-[10px] px-1.5 py-0 font-medium text-amber-700 dark:text-amber-400 bg-amber-500/10 border-amber-500/30"
                            >
                              0 in stock
                            </Badge>
                          ) : (
                            <Badge
                              variant="secondary"
                              className="text-[10px] px-1.5 py-0 font-mono text-muted-foreground"
                            >
                              {onHandStock} in stock
                            </Badge>
                          )}

                          {/* Reference Cost */}
                          {item.estimatedCostAmount && (
                            <span className="text-[10px] sm:text-[11px] font-mono text-muted-foreground hidden sm:inline">
                              Est: {formatSupplyMoney(item.estimatedCostAmount, purchase.currencyCode)}
                            </span>
                          )}

                          {/* Already in PO indicator */}
                          {poQuantity ? (
                            <Badge className="text-[9px] py-0 px-1.5 bg-primary/15 text-primary border-primary/20 font-medium">
                              In PO ({poQuantity})
                            </Badge>
                          ) : null}
                        </div>

                        {/* Mobile tap Chevron or Desktop Checkmark */}
                        <div className="md:hidden text-muted-foreground">
                          <ChevronRight className="size-4" />
                        </div>

                        <div
                          className={cn(
                            'hidden md:flex size-5 rounded-full items-center justify-center border shrink-0 transition-colors',
                            isSelected
                              ? 'border-primary bg-primary text-primary-foreground'
                              : 'border-border/60 text-transparent',
                          )}
                        >
                          <Check className="size-3 stroke-3" />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {/* Bottom List Footer / Count */}
              <div className="px-3 sm:px-4 py-2 border-t bg-card text-[11px] text-muted-foreground flex items-center justify-between shrink-0">
                <span>
                  Showing {filteredVariants.length} of {activeVariants.length} variants
                </span>
                <span className="font-mono">
                  {purchase.lines.length} items in PO
                </span>
              </div>
            </div>

            {/* Right Column: Procurement Order Workspace (Desktop: 5 cols; Mobile: shown when mobileStep === 'configure') */}
            <div
              className={cn(
                'flex flex-col justify-between p-4 sm:p-5 bg-card overflow-y-auto md:col-span-5',
                mobileStep === 'browse' ? 'hidden md:flex' : 'flex',
              )}
            >
              {selectedVariant ? (
                <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5">
                  {/* Mobile Back-to-browse Header */}
                  <div className="flex items-center justify-between pb-2 border-b md:hidden">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setMobileStep('browse')}
                      className="h-8 px-2 -ml-2 text-xs font-medium text-primary flex items-center gap-1"
                    >
                      <ArrowLeft className="size-3.5" />
                      <span>Back to variant list</span>
                    </Button>
                    <span className="text-[11px] font-mono text-muted-foreground">
                      Step 2 of 2
                    </span>
                  </div>

                  {/* Selected Hero Card */}
                  <div className="rounded-xl border border-border bg-muted/20 p-3.5 sm:p-4 space-y-3">
                    <div className="flex items-start gap-3 sm:gap-3.5">
                      {/* Large Hero Image */}
                      <div className="relative size-16 sm:size-18 shrink-0 overflow-hidden rounded-lg border border-border bg-card shadow-2xs">
                        {selectedVariant.primaryImageUrl ? (
                          <img
                            src={selectedVariant.primaryImageUrl}
                            alt={selectedVariant.productTitle}
                            className="size-full object-cover"
                          />
                        ) : (
                          <div className="flex size-full items-center justify-center text-muted-foreground/40">
                            <Package className="size-8" />
                          </div>
                        )}
                      </div>

                      {/* Variant Identity */}
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-[10px] sm:text-[11px] font-semibold text-primary uppercase tracking-wide">
                            Selected Variant
                          </span>
                          <button
                            type="button"
                            onClick={resetSelection}
                            className="text-[11px] text-muted-foreground hover:text-foreground hover:underline p-1"
                          >
                            Change
                          </button>
                        </div>

                        <h4 className="font-medium text-sm text-foreground line-clamp-1">
                          {selectedVariant.productTitle}
                        </h4>

                        <div className="flex flex-wrap items-center gap-1.5 font-mono text-xs text-muted-foreground">
                          <span className="font-semibold text-foreground">{selectedVariant.sku}</span>
                          {selectedVariant.barcode && (
                            <span className="text-[10px] text-muted-foreground">
                              · Barcode: {selectedVariant.barcode}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Attributes and Inventory Pill Details */}
                    <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-border/50 text-xs">
                      {selectedVariant.optionSummary ? (
                        <Badge variant="secondary" className="text-[10px] font-normal">
                          {selectedVariant.optionSummary}
                        </Badge>
                      ) : null}

                      <span className="text-[11px] text-muted-foreground">
                        Warehouse On-Hand:{' '}
                        <strong className="font-mono text-foreground">
                          {selectedVariant.inventoryOnHand ?? 0} units
                        </strong>
                      </span>

                      {poLinesMap.has(selectedVariant.id) && (
                        <span className="text-[11px] text-primary font-medium">
                          (Already {poLinesMap.get(selectedVariant.id)} in PO)
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Quantity Input with Stepper and Quick Presets */}
                  <Field>
                    <div className="flex items-center justify-between">
                      <FieldLabel htmlFor="procure-quantity" className="text-xs font-medium">
                        Order Quantity
                      </FieldLabel>
                      <span className="text-[11px] text-muted-foreground">Units to order</span>
                    </div>

                    <div className="flex items-center gap-2 mt-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="size-10 sm:size-9 shrink-0"
                        disabled={busy || Number(quantity) <= 1}
                        onClick={() =>
                          setQuantity((prev) => String(Math.max(1, Number(prev || 1) - 1)))
                        }
                      >
                        <Minus className="size-4" />
                      </Button>

                      <Input
                        id="procure-quantity"
                        ref={quantityInputRef}
                        type="number"
                        inputMode="decimal"
                        min="0.000001"
                        step="any"
                        required
                        disabled={busy}
                        value={quantity}
                        onChange={(e) => setQuantity(e.target.value)}
                        className="h-10 sm:h-9 text-center font-mono font-semibold text-base sm:text-sm"
                      />

                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="size-10 sm:size-9 shrink-0"
                        disabled={busy}
                        onClick={() =>
                          setQuantity((prev) => String(Number(prev || 0) + 1))
                        }
                      >
                        <Plus className="size-4" />
                      </Button>
                    </div>

                    {/* Bulk Fast Presets (Large touch targets for mobile) */}
                    <div className="flex flex-wrap items-center gap-1.5 mt-2">
                      <span className="text-[10px] text-muted-foreground">Quick add:</span>
                      {[5, 10, 25, 50, 100].map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            setQuantity((prev) => String(Number(prev || 0) + preset))
                          }
                          className="h-7 sm:h-5 px-2.5 sm:px-1.5 rounded-md border border-border bg-muted/40 hover:bg-muted text-xs sm:text-[10px] font-mono text-muted-foreground hover:text-foreground transition-colors active:scale-95"
                        >
                          +{preset}
                        </button>
                      ))}
                    </div>
                  </Field>

                  {/* Supplier Unit Cost */}
                  <Field>
                    <div className="flex items-center justify-between">
                      <FieldLabel htmlFor="procure-price" className="text-xs font-medium">
                        Unit Cost ({purchase.currencyCode})
                      </FieldLabel>
                      {selectedVariant.estimatedCostAmount && (
                        <button
                          type="button"
                          onClick={() => setUnitPrice(selectedVariant.estimatedCostAmount!)}
                          className="text-[11px] text-primary hover:underline transition-colors flex items-center gap-0.5 p-0.5"
                        >
                          <Sparkles className="size-3" />
                          <span>Use Est ({selectedVariant.estimatedCostAmount})</span>
                        </button>
                      )}
                    </div>

                    <div className="relative mt-1">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-xs text-muted-foreground font-semibold">
                        {purchase.currencyCode}
                      </span>
                      <Input
                        id="procure-price"
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="any"
                        required
                        disabled={busy}
                        value={unitPrice}
                        onChange={(e) => setUnitPrice(e.target.value)}
                        className="h-10 sm:h-9 pl-12 font-mono font-semibold text-base sm:text-sm"
                      />
                    </div>
                    <FieldDescription className="text-[11px]">
                      Agreed purchase price per unit from supplier.
                    </FieldDescription>
                  </Field>

                  {/* Estimated Line Subtotal Box */}
                  <div className="rounded-xl border border-border bg-card p-3.5 sm:p-4 space-y-1">
                    <div className="flex items-baseline justify-between text-xs text-muted-foreground">
                      <span>Calculation preview:</span>
                      <span className="font-mono">
                        {quantity || 0} × {formatSupplyMoney(unitPrice || '0', purchase.currencyCode)}
                      </span>
                    </div>
                    <div className="flex items-baseline justify-between pt-1 border-t border-border/40">
                      <span className="font-medium text-foreground text-sm">Line Total:</span>
                      <span className="font-mono text-lg font-bold text-foreground">
                        {formatSupplyMoney(String(subtotal), purchase.currencyCode)}
                      </span>
                    </div>
                  </div>

                  {/* Submit Actions */}
                  <div className="space-y-2 pt-2">
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                      <Button
                        type="submit"
                        disabled={busy || !selectedVariantId || Number(quantity) <= 0}
                        className="h-10 sm:h-9 flex-1"
                      >
                        {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
                        <span>Add item</span>
                      </Button>

                      <Button
                        type="button"
                        variant="outline"
                        disabled={busy || !selectedVariantId || Number(quantity) <= 0}
                        onClick={() => submitAddLine(true)}
                        className="h-10 sm:h-9 flex-1"
                      >
                        <PlusCircle className="size-4" />
                        <span>Add & continue</span>
                      </Button>
                    </div>

                    <p className="text-[11px] text-center text-muted-foreground">
                      Press <strong>Add & continue</strong> to quickly add multiple items in sequence.
                    </p>
                  </div>
                </form>
              ) : (
                /* Empty state when no variant is selected */
                <div className="flex flex-col items-center justify-center flex-1 p-6 text-center text-muted-foreground my-auto">
                  <div className="flex size-14 items-center justify-center rounded-2xl border border-dashed border-border bg-muted/30">
                    <Package className="size-7 text-muted-foreground/60" />
                  </div>
                  <h4 className="mt-3.5 font-medium text-sm text-foreground">
                    No variant selected
                  </h4>
                  <p className="mt-1 text-xs text-muted-foreground max-w-xs leading-relaxed">
                    Pick a product variant from the catalog on the left to configure quantity and supplier price.
                  </p>

                  <div className="mt-6 rounded-lg border border-border/60 bg-muted/20 p-3 text-left text-xs space-y-1.5 max-w-xs">
                    <p className="font-semibold text-foreground flex items-center gap-1.5">
                      <Sparkles className="size-3.5 text-primary" />
                      <span>Pro Tips</span>
                    </p>
                    <ul className="list-disc pl-4 space-y-1 text-muted-foreground text-[11px]">
                      <li>Scan a physical barcode to automatically select and jump to quantity.</li>
                      <li>Filter by <strong>Out of Stock</strong> to quickly find items that need reordering.</li>
                      <li>Use <strong>Add & continue</strong> to populate purchase orders without closing the popup.</li>
                    </ul>
                  </div>
                </div>
              )}

              {/* Bottom Cancel Button */}
              <div className="pt-3 sm:pt-4 border-t mt-4 flex justify-end">
                <DialogClose render={<Button variant="ghost" size="sm" type="button" disabled={busy} />}>
                  Close
                </DialogClose>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Lightbox / Zoom Dialog for high-resolution visual inspection */}
      {previewImage && (
        <Dialog open={Boolean(previewImage)} onOpenChange={() => setPreviewImage(null)}>
          <DialogContent className="sm:max-w-md p-4 text-center space-y-3">
            <div className="relative aspect-square w-full overflow-hidden rounded-lg bg-black/5">
              <img
                src={previewImage.url}
                alt={previewImage.title}
                className="size-full object-contain"
              />
            </div>
            <p className="text-xs font-mono text-muted-foreground truncate">
              {previewImage.title}
            </p>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
