'use client';

import * as React from 'react';
import { Search, Eye, Sparkles, Package } from 'lucide-react';
import type {
  RecommendationPlacementCodeDto,
  RecommendationPlacementSettingsDto,
  RecommendationPreviewDto,
} from '@maevelle/contracts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Badge } from '@/components/ui/badge';

import { EmptyState, LoadingState } from '@/components/ui/page-shell';
import { fetchApiData } from '@/lib/api';
import type { ProductPickerItem } from '../recommendations-types';
import { PLACEMENT_LABELS } from '../recommendations-types';

interface PreviewInspectorTabProps {
  initialProductId?: string;
  placements: RecommendationPlacementSettingsDto[];
}

export function PreviewInspectorTab({
  initialProductId = '',
  placements,
}: PreviewInspectorTabProps) {
  const [productId, setProductId] = React.useState(initialProductId);
  const [placement, setPlacement] =
    React.useState<RecommendationPlacementCodeDto>('pdp_similar');
  const [searchQuery, setSearchQuery] = React.useState('');
  const [searchResults, setSearchResults] = React.useState<ProductPickerItem[]>([]);
  const [selectedProduct, setSelectedProduct] = React.useState<ProductPickerItem | null>(null);

  const [, setSearching] = React.useState(false);
  const [evaluating, setEvaluating] = React.useState(false);
  const [previewData, setPreviewData] = React.useState<RecommendationPreviewDto | null>(null);
  const [error, setError] = React.useState('');

  // Sync initialProductId if passed from parent
  React.useEffect(() => {
    if (initialProductId && initialProductId !== productId) {
      setProductId(initialProductId);
    }
  }, [initialProductId]);

  // Load product picker search
  React.useEffect(() => {
    let live = true;
    setSearching(true);
    const timer = setTimeout(() => {
      const params = new URLSearchParams({ q: searchQuery, pageSize: '20' });
      fetchApiData<{ items: ProductPickerItem[] }>(`/admin/recommendations/product-picker?${params}`)
        .then((res) => {
          if (live) {
            setSearchResults(res.items);
            // If we have a productId and no selectedProduct, find it
            if (productId && !selectedProduct) {
              const matched = res.items.find((i) => i.id === productId);
              if (matched) setSelectedProduct(matched);
            }
          }
        })
        .catch(() => {
          if (live) setSearchResults([]);
        })
        .finally(() => {
          if (live) setSearching(false);
        });
    }, 250);

    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [searchQuery, productId, selectedProduct]);

  // Evaluate preview
  const runPreview = React.useCallback(async () => {
    if (!productId) return;
    setEvaluating(true);
    setError('');
    try {
      const placementSettings = placements.find((p) => p.code === placement);
      const data = await fetchApiData<RecommendationPreviewDto>('/admin/recommendations/preview', {
        method: 'POST',
        body: JSON.stringify({
          productId,
          currency: 'BDT',
          placementSettings,
        }),
      });
      setPreviewData(data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to evaluate recommendations.');
      setPreviewData(null);
    } finally {
      setEvaluating(false);
    }
  }, [productId, placement, placements]);

  // Auto-run preview when productId or placement changes and product exists
  React.useEffect(() => {
    if (productId) {
      void runPreview();
    }
  }, [productId, placement, runPreview]);

  const activeSection = previewData?.sections.find((s) => s.placement === placement);
  const explanations = previewData?.explanations.filter((e) => e.placement === placement) ?? [];

  return (
    <div className="space-y-6">
      {/* Header & Product Picker */}
      <div className="rounded-xl border border-border bg-card p-4 sm:p-5 shadow-2xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-border/60 pb-3">
          <div>
            <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
              <Eye className="size-4 text-primary" />
              Storefront Preview & Merchandising Inspector
            </h2>
            <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
              Simulate customer discovery on any product to verify eligible candidates and algorithmic scoring.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <NativeSelect
              value={placement}
              onChange={(e) =>
                setPlacement(e.target.value as RecommendationPlacementCodeDto)
              }
              className="h-9 text-xs"
            >
              <option value="pdp_similar">You May Also Like (Similar)</option>
              <option value="pdp_complementary">Complete Your Look (Complementary)</option>
            </NativeSelect>

            <Button
              type="button"
              size="sm"
              disabled={!productId || evaluating}
              onClick={() => void runPreview()}
              className="h-9 text-xs shadow-sm"
            >
              {evaluating ? 'Evaluating…' : 'Re-evaluate'}
            </Button>
          </div>
        </div>

        {/* Product Search & Select */}
        <div className="space-y-2">
          <label className="text-xs font-semibold text-foreground">
            Select Product to Simulate Customer PDP
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 size-3.5 text-muted-foreground" />
              <Input
                placeholder="Search catalog products…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 text-xs h-9"
              />
            </div>

            <NativeSelect
              value={productId}
              onChange={(e) => {
                const id = e.target.value;
                setProductId(id);
                const matched = searchResults.find((p) => p.id === id);
                if (matched) setSelectedProduct(matched);
              }}
              className="text-xs h-9"
            >
              <option value="">Choose a product from search results</option>
              {searchResults.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title} ({p.publication_status})
                </option>
              ))}
            </NativeSelect>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
          {error}
        </div>
      )}

      {/* Main Preview Area */}
      {evaluating ? (
        <LoadingState message="Running contextual recommendation evaluation engine…" />
      ) : !productId ? (
        <EmptyState
          icon={Package}
          title="Select a Product to Inspect Recommendations"
          description="Pick any published or draft product above to simulate how our recommendation algorithms populate its storefront carousels."
        />
      ) : (
        <div className="space-y-6">
          {/* 1. Storefront Visual Mockup */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                <h3 className="text-sm font-semibold text-foreground">
                  Storefront Carousel Mockup · {PLACEMENT_LABELS[placement]}
                </h3>
              </div>
              <span className="text-xs font-mono tabular-nums text-muted-foreground">
                {activeSection?.items.length ?? 0} cards selected
              </span>
            </div>

            {activeSection?.items.length ? (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {activeSection.items.map((card) => (
                  <div
                    key={card.productId}
                    className="flex flex-col justify-between rounded-xl border border-border bg-card p-3 shadow-2xs transition-colors hover:border-primary/40 space-y-3"
                  >
                    <div className="space-y-2">
                      {/* Image Placeholder with Position Tag */}
                      <div className="relative aspect-square w-full rounded-lg bg-muted/40 border border-border/60 flex items-center justify-center overflow-hidden">
                        <Package className="size-8 text-muted-foreground/40" />
                        <span className="absolute top-2 left-2 rounded-md bg-foreground/80 backdrop-blur-xs text-background font-mono text-[10px] font-bold px-1.5 py-0.5 shadow-xs">
                          #{card.position}
                        </span>
                      </div>

                      {/* Title & Price */}
                      <div className="min-w-0">
                        <h4 className="text-xs font-semibold text-foreground truncate">
                          {card.title}
                        </h4>
                        <p className="text-[11px] text-muted-foreground font-mono">/{card.handle}</p>
                      </div>
                    </div>

                    <div className="border-t border-border/60 pt-2 flex items-center justify-between">
                      <span className="font-mono text-xs font-bold tabular-nums text-foreground">
                        ৳{Number(card.price.amount).toLocaleString()} {card.price.currency}
                      </span>
                      {card.reason && (
                        <Badge variant="outline" className="text-[10px] py-0 px-1.5">
                          {card.reason}
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-border bg-muted/20 p-8 text-center text-xs text-muted-foreground">
                No eligible recommendation cards generated for this placement. Check minimum score, stock levels, or compatibility rules.
              </div>
            )}
          </div>

          {/* 2. Algorithmic Explainability & Scoring Inspector */}
          <div className="rounded-xl border border-border bg-card p-5 shadow-2xs space-y-4">
            <div className="flex items-center justify-between border-b border-border/60 pb-3">
              <div>
                <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                  <Sparkles className="size-4 text-primary" />
                  Algorithm Explainability & Candidate Decision Log
                </h3>
                <p className="text-xs text-muted-foreground">
                  Complete candidate evaluation breakdown showing final match scores and filtering outcomes.
                </p>
              </div>
              <span className="text-xs font-mono tabular-nums text-muted-foreground">
                {explanations.length} evaluated
              </span>
            </div>

            {explanations.length ? (
              <div className="divide-y divide-border/60 rounded-lg border border-border/80 overflow-hidden">
                {explanations.map((exp) => {
                  const isSelected = exp.outcome === 'SELECTED';
                  const isExcluded = exp.outcome === 'EXCLUDED';
                  const isLow = exp.outcome === 'LOW_RELEVANCE';

                  return (
                    <div
                      key={exp.productId}
                      className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 p-3 text-xs bg-card hover:bg-muted/30 transition-colors"
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[11px] text-muted-foreground">
                            {exp.productId}
                          </span>
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                              isSelected
                                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400'
                                : isExcluded
                                  ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400'
                                  : isLow
                                    ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400'
                                    : 'bg-muted text-muted-foreground'
                            }`}
                          >
                            {exp.outcome}
                          </span>
                        </div>

                        {/* Reasons tags */}
                        <div className="flex flex-wrap gap-1.5 pt-0.5">
                          {exp.reasons.map((r, i) => (
                            <span
                              key={i}
                              className="inline-flex items-center text-[11px] rounded bg-muted/60 px-2 py-0.5 border border-border/50 text-muted-foreground"
                            >
                              {r}
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* Score Meter */}
                      <div className="flex items-center gap-3 self-end sm:self-center shrink-0">
                        <div className="w-20 h-2 rounded-full bg-muted overflow-hidden">
                          <div
                            className={`h-full rounded-full ${
                              isSelected ? 'bg-primary' : 'bg-muted-foreground/40'
                            }`}
                            style={{ width: `${Math.min(100, Math.max(0, exp.score))}%` }}
                          />
                        </div>
                        <span className="font-mono font-bold tabular-nums text-foreground">
                          {exp.score} pts
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground text-center py-4">
                No explanation logs available for this product.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

