'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type {
  ProductRatingSummaryDto,
  PublicReviewDto,
  PublicSizeGuideDto,
  StorefrontProductDto,
} from '@maevelle/contracts';
import { ProductReviews } from '@/components/product-reviews';
import { SizeGuideDialog } from '@/components/size-guide-dialog';
import {
  ShoppingBagIcon,
  StarIcon,
  TruckIcon,
} from '@/components/ui/icons';
import { Breadcrumb, type BreadcrumbItemDef } from '@/components/ui/breadcrumb';
import { cx } from '@/components/ui/classnames';
import { ChatProductContext } from '@/features/chat/page-context';
import { PdpGallery } from './pdp-gallery';
import { PdpCommercialHeader } from './pdp-commercial-header';
import { PdpVariantSelector } from './pdp-variant-selector';
import { PdpTrustGrid } from './pdp-trust-grid';
import { PdpProductDetails } from './pdp-product-details';
import { PdpStickyBar } from './pdp-sticky-bar';
import { PdpCrossSells } from './pdp-cross-sells';
import type { CrossSellProduct } from './pdp-cross-sells';
import type { PriceDisplay } from './pdp-commercial-header';
import { formatTaka } from './pdp-money';

export interface PdpViewProps {
  readonly product: StorefrontProductDto;
  readonly guide: PublicSizeGuideDto | null;
  readonly organizationId: string;
  readonly currency: string;
  readonly initialReviews?: readonly PublicReviewDto[] | undefined;
  readonly initialSummary?: ProductRatingSummaryDto | undefined;
  readonly crossSells?: readonly CrossSellProduct[] | undefined;
  readonly breadcrumbs?: readonly BreadcrumbItemDef[] | undefined;
  readonly wishlisted?: boolean;
  readonly onWishlistToggle?: () => void;
  readonly onAddToCart: (variantId: string, quantity: number) => Promise<void>;
  readonly busy: boolean;
  readonly cartMessage: string;
}

export function PdpView({
  product,
  guide,
  organizationId,
  currency,
  initialReviews,
  initialSummary,
  crossSells,
  breadcrumbs,
  wishlisted = false,
  onWishlistToggle,
  onAddToCart,
  busy,
  cartMessage,
}: PdpViewProps) {
  const fallbackBreadcrumbs = useMemo((): readonly BreadcrumbItemDef[] => {
    const items: BreadcrumbItemDef[] = [
      { label: 'Shop', href: '/categories' },
    ];
    if (product.primaryCategory) {
      items.push({
        label: product.primaryCategory.name,
        href: `/categories/${product.primaryCategory.path}`,
      });
    }
    items.push({ label: product.title, current: true });
    return items;
  }, [product]);

  const effectiveBreadcrumbs = breadcrumbs ?? fallbackBreadcrumbs;

  const [selected, setSelected] = useState<Record<string, string>>(() => {
    const visualAxis = product.options.find((opt) => opt.isVisual);
    if (!visualAxis) return {};
    const primaryVal =
      visualAxis.values.find((val) => val.isPrimary) ||
      visualAxis.values.find((val) =>
        product.variants.some((v) => v.optionValueIds.includes(val.id) && v.available),
      ) ||
      visualAxis.values[0];
    return primaryVal ? { [visualAxis.id]: primaryVal.id } : {};
  });

  const router = useRouter();
  const [activeMedia, setActiveMedia] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const [isSizeGuideOpen, setIsSizeGuideOpen] = useState(false);
  const sizeDialogRef = useRef<HTMLDialogElement>(null);

  const selectedVariant = useMemo(() => {
    const allSelected = product.options.every((axis) => Boolean(selected[axis.id]));
    if (!allSelected) return undefined;
    return product.variants.find((variant) =>
      product.options.every((axis) => variant.optionValueIds.includes(selected[axis.id]!)),
    );
  }, [product, selected]);

  const matchingVariants = useMemo(() => {
    return product.variants.filter((variant) =>
      product.options.every(
        (axis) => !selected[axis.id] || variant.optionValueIds.includes(selected[axis.id]!),
      ),
    );
  }, [product, selected]);

  const priceDisplay = useMemo((): PriceDisplay | null => {
    if (selectedVariant?.price) {
      return {
        type: 'exact',
        amount: selectedVariant.price.amount,
        compareAtAmount: selectedVariant.price.compareAtAmount,
        currency: selectedVariant.price.currency,
      };
    }
    if (matchingVariants.length > 0) {
      const prices = matchingVariants
        .map((v) => (v.price ? parseFloat(v.price.amount) : null))
        .filter((p): p is number => p !== null && !isNaN(p));
      if (prices.length > 0) {
        const min = Math.min(...prices);
        const cur = matchingVariants.find((v) => v.price)?.price?.currency ?? currency;
        return { type: 'exact', amount: String(min), compareAtAmount: null, currency: cur };
      }
    }
    return null;
  }, [selectedVariant, matchingVariants, currency]);

  const unselectedAxes = useMemo(
    () => product.options.filter((axis) => !selected[axis.id]),
    [product, selected],
  );

  const [hasInteractedWithVisual, setHasInteractedWithVisual] = useState(false);

  const visualAxis = useMemo(
    () => product.options.find((opt) => opt.isVisual),
    [product.options],
  );

  const sharedCoverMedia = useMemo(
    () =>
      product.media.find(
        (m) =>
          m.variantId === null &&
          m.optionValueId === null &&
          m.isPrimary &&
          m.role !== 'SIZE_DIAGRAM',
      ),
    [product.media],
  );

  const shownMedia = useMemo(() => {
    const selectedVisualValueId = visualAxis ? selected[visualAxis.id] : null;

    const generalMedia = product.media
      .filter((a) => a.variantId === null && a.optionValueId === null && a.role !== 'SIZE_DIAGRAM')
      .toSorted((a, b) => Number(b.isPrimary) - Number(a.isPrimary));

    // Case 1: Initial view with designated Product Cover before shopper clicks an option
    if (sharedCoverMedia && !hasInteractedWithVisual) {
      const remainingMedia = product.media.filter(
        (a) => a.id !== sharedCoverMedia.id && a.role !== 'SIZE_DIAGRAM',
      );
      return [sharedCoverMedia, ...remainingMedia];
    }

    // Case 2: Variant-exact override
    if (selectedVariant) {
      const exact = product.media.filter((a) => a.variantId === selectedVariant.id);
      if (exact.length > 0) {
        return [
          ...exact.toSorted((a, b) => Number(b.isPrimary) - Number(a.isPrimary)),
          ...generalMedia,
        ];
      }
    }

    // Case 3: Visual option gallery (Pattern 1, Pattern 2, Color, etc.)
    if (selectedVisualValueId) {
      const optionMedia = product.media.filter(
        (a) => a.optionValueId === selectedVisualValueId && a.variantId === null,
      );
      if (optionMedia.length > 0) {
        return [
          ...optionMedia.toSorted((a, b) => Number(b.isPrimary) - Number(a.isPrimary)),
          ...generalMedia,
        ];
      }
    }

    // Case 4: General media or fallback
    if (generalMedia.length > 0) return generalMedia;
    return product.media
      .filter((a) => a.role !== 'SIZE_DIAGRAM')
      .toSorted((a, b) => Number(b.isPrimary) - Number(a.isPrimary));
  }, [
    product.media,
    visualAxis,
    selected,
    selectedVariant,
    sharedCoverMedia,
    hasInteractedWithVisual,
  ]);

  const visualSelectionKey = useMemo(() => {
    return visualAxis ? (selected[visualAxis.id] ?? '') : '';
  }, [visualAxis, selected]);

  useEffect(() => {
    setActiveMedia(0);
  }, [visualSelectionKey, selectedVariant?.id, hasInteractedWithVisual]);

  function valuePossible(axisId: string, valueId: string) {
    return product.variants.some(
      (variant) =>
        variant.optionValueIds.includes(valueId) &&
        product.options.every(
          (axis) =>
            axis.id === axisId ||
            !selected[axis.id] ||
            variant.optionValueIds.includes(selected[axis.id]!),
        ),
    );
  }

  function choose(axisId: string, valueId: string) {
    if (visualAxis && axisId === visualAxis.id) {
      setHasInteractedWithVisual(true);
    }
    const next = { ...selected, [axisId]: valueId };
    const compatible = product.variants.some((variant) =>
      product.options.every(
        (axis) => !next[axis.id] || variant.optionValueIds.includes(next[axis.id]!),
      ),
    );
    if (compatible) {
      setSelected(next);
      return;
    }
    const fallback: Record<string, string> = { [axisId]: valueId };
    if (visualAxis && axisId !== visualAxis.id && selected[visualAxis.id]) {
      const matchesVisual = product.variants.some(
        (v) =>
          v.optionValueIds.includes(valueId) && v.optionValueIds.includes(selected[visualAxis.id]!),
      );
      if (matchesVisual) fallback[visualAxis.id] = selected[visualAxis.id]!;
    }
    setSelected(fallback);
  }

  function handleMediaSelect(index: number) {
    setActiveMedia(index);
    const mediaItem = shownMedia[index];
    if (
      mediaItem?.optionValueId &&
      visualAxis &&
      selected[visualAxis.id] !== mediaItem.optionValueId
    ) {
      choose(visualAxis.id, mediaItem.optionValueId);
    }
  }

  const sizeAxis = product.options.find(
    (a) => a.code.toLowerCase().includes('size') || a.name.toLowerCase().includes('size'),
  );

  const avg = Number(
    product.ratingSummary?.formattedAverage ?? product.ratingSummary?.averageRating ?? 0,
  ).toFixed(1);
  const ratingCount = product.ratingSummary?.ratingCount ?? 0;

  const handleAddToCartClick = async () => {
    if (unselectedAxes.length > 0) {
      setActionFeedback(`Please select ${unselectedAxes[0]?.name ?? 'option'}`);
      setTimeout(() => setActionFeedback(null), 3000);
      return;
    }
    if (!selectedVariant || !selectedVariant.available) return;

    try {
      await onAddToCart(selectedVariant.id, quantity);
      setActionFeedback('Added to your bag');
      setTimeout(() => setActionFeedback(null), 3000);
    } catch {
      // Error is surfaced by parent cartMessage
    }
  };

  const handleBuyNowClick = async () => {
    if (unselectedAxes.length > 0) {
      setActionFeedback(`Please select ${unselectedAxes[0]?.name ?? 'option'}`);
      setTimeout(() => setActionFeedback(null), 3000);
      return;
    }
    if (!selectedVariant || !selectedVariant.available) return;

    try {
      await onAddToCart(selectedVariant.id, quantity);
      router.push('/checkout');
    } catch {
      router.push('/checkout');
    }
  };

  return (
    <>
      <ChatProductContext
        productId={product.id}
        productTitle={product.title}
        variantId={selectedVariant?.id ?? null}
      />
      {/* ═══════════════ MOBILE LAYOUT (< lg) ═══════════════ */}
      <div className="lg:hidden flex flex-col w-full pb-32 bg-[#fff8f5] min-h-screen">
        {/* Mobile breadcrumb */}
        <div className="px-4 pt-3 pb-2 bg-[#fff8f5]">
          <Breadcrumb items={effectiveBreadcrumbs} />
        </div>

        {/* Gallery */}
        <PdpGallery
          media={shownMedia}
          productTitle={product.title}
          activeIndex={activeMedia}
          onSelect={handleMediaSelect}
          wishlisted={wishlisted}
          {...(onWishlistToggle ? { onWishlistToggle } : {})}
        />

        {/* Commercial header */}
        <PdpCommercialHeader
          title={product.title}
          price={priceDisplay}
          ratingSummary={product.ratingSummary ?? null}
          isAvailable={selectedVariant?.available ?? true}
          unselectedAxesCount={unselectedAxes.length}
        />

        {/* Variant selector */}
        <PdpVariantSelector
          options={product.options}
          selected={selected}
          onChoose={choose}
          valuePossible={valuePossible}
          {...(guide ? { onFittingGuide: () => setIsSizeGuideOpen(true) } : {})}
          className="px-4 pt-4"
        />

        {/* Inline Mobile Action Buttons (Stepper + Add to Bag + Buy Now) */}
        <div className="px-4 pt-4 flex flex-col gap-2.5">
          <div className="flex items-center gap-2.5 w-full">
            {/* Stepper */}
            <div className="flex items-center bg-[#f4ece8] rounded-full px-3 py-2 gap-2.5 shrink-0 h-12">
              <button
                type="button"
                aria-label="Decrease quantity"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                className="w-8 h-8 flex items-center justify-center text-[#1e1b19] border-0 bg-transparent cursor-pointer text-xl leading-none select-none active:scale-90 transition-transform"
              >
                −
              </button>
              <span className="w-5 text-center text-[14px] font-semibold text-[#1e1b19] tabular-nums font-mono">
                {quantity}
              </span>
              <button
                type="button"
                aria-label="Increase quantity"
                onClick={() => setQuantity((q) => Math.min(10, q + 1))}
                className="w-8 h-8 flex items-center justify-center text-[#1e1b19] border-0 bg-transparent cursor-pointer text-xl leading-none select-none active:scale-90 transition-transform"
              >
                +
              </button>
            </div>

            {/* Add to Bag button */}
            <button
              type="button"
              id="pdp-mobile-inline-add-to-cart"
              disabled={busy || unselectedAxes.length > 0 || !selectedVariant?.available}
              onClick={handleAddToCartClick}
              className={cx(
                'flex-1 h-12 rounded-full flex items-center justify-center px-4 font-semibold text-[13.5px] transition-[background-color,transform] duration-150 active:scale-[0.98] border-0 shadow-xs cursor-pointer',
                unselectedAxes.length === 0 && selectedVariant?.available && !busy
                  ? 'bg-[#9e2a4b] hover:bg-[#8b2340] text-white'
                  : 'bg-[#9e2a4b]/60 text-white/80 cursor-not-allowed',
              )}
            >
              <span>
                {busy
                  ? 'Adding…'
                  : cartMessage?.includes('Added') || actionFeedback?.includes('Added')
                    ? 'Added to Bag ✓'
                    : unselectedAxes.length > 0
                      ? `Select ${unselectedAxes[0]?.name ?? 'Option'}`
                      : !selectedVariant?.available
                        ? 'Out of Stock'
                        : 'Add to Bag'}
              </span>
            </button>
          </div>

          {/* Buy Now button */}
          <button
            type="button"
            id="pdp-mobile-inline-buy-now"
            disabled={busy || unselectedAxes.length > 0 || !selectedVariant?.available}
            onClick={handleBuyNowClick}
            className={cx(
              'w-full h-12 rounded-full flex items-center justify-center px-4 font-semibold text-[14px] transition-[background-color,transform] duration-150 active:scale-[0.98] border-0 shadow-xs cursor-pointer',
              unselectedAxes.length === 0 && selectedVariant?.available && !busy
                ? 'bg-[#1e1b19] hover:bg-[#332e2c] text-white'
                : 'bg-[#1e1b19]/60 text-white/80 cursor-not-allowed',
            )}
          >
            <span>Buy Now</span>
          </button>

          {(actionFeedback || cartMessage) && (
            <p
              role="status"
              className={cx(
                'text-[12px] font-medium py-1 px-2.5 rounded-lg transition-opacity animate-in fade-in',
                actionFeedback?.includes('Added') || cartMessage?.includes('Added')
                  ? 'bg-green-50 text-green-700'
                  : 'bg-red-50 text-red-700',
              )}
            >
              {actionFeedback ?? cartMessage}
              {(actionFeedback?.includes('Added') || cartMessage?.includes('Added')) && (
                <Link href="/cart" className="ml-2 underline font-semibold">
                  View Bag
                </Link>
              )}
            </p>
          )}
        </div>

        {/* Trust grid */}
        <PdpTrustGrid />

        {/* Product Details, Specs & FAQs */}
        <PdpProductDetails
          description={product.description}
          productDetails={product.details}
          productFaqs={product.faqs}
          {...(guide ? { onFittingGuide: () => setIsSizeGuideOpen(true) } : {})}
          className="px-4 pt-6"
        />

        {/* Reviews */}
        <section id="reviews-mobile" className="px-4 pt-8 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-widest text-[#9e2a4b] mb-0.5">
                Verified Customer Feedback
              </p>
              <h2 className="text-[20px] font-serif font-semibold text-[#1e1b19]">Customer Reviews</h2>
              {ratingCount > 0 && (
                <p className="text-[12px] text-[#574144] mt-0.5">
                  {avg} stars from {ratingCount} verified orders
                </p>
              )}
            </div>
          </div>
          <ProductReviews
            productId={product.id}
            organizationId={organizationId}
            initialReviews={initialReviews}
            initialSummary={initialSummary}
            hideHeader={true}
          />
        </section>

        {/* Cross-sells (Mobile) */}
        <div className="px-4 pt-10 pb-6 border-t border-border/40">
          <PdpCrossSells products={crossSells} title="Complete Your Look" subtitle="Curated Recommendations" />
        </div>

        {/* Sticky bottom bar */}
        <PdpStickyBar
          price={priceDisplay?.amount ?? null}
          currency={priceDisplay?.currency ?? currency}
          quantity={quantity}
          onQuantityChange={(delta) => setQuantity((q) => Math.max(1, Math.min(10, q + delta)))}
          onAddToCart={handleAddToCartClick}
          onBuyNow={handleBuyNowClick}
          busy={busy}
          available={selectedVariant?.available ?? false}
          cartMessage={actionFeedback ?? cartMessage}
          unselectedAxesCount={unselectedAxes.length}
          unselectedAxisName={unselectedAxes[0]?.name ?? ''}
        />
      </div>

      {/* ═══════════════ DESKTOP LAYOUT (lg+) ═══════════════ */}
      <div className="hidden lg:block w-full bg-[#fff8f5] min-h-screen">
        <div className="max-w-[1240px] mx-auto px-6 lg:px-8 pt-6 pb-16">
          {/* Top Breadcrumb */}
          <div className="mb-6">
            <Breadcrumb items={effectiveBreadcrumbs} />
          </div>

          {/* TWO-COLUMN LAYOUT: Left (Gallery + Story/Specs/FAQ) & Right (Sticky Core Info + Actions) */}
          <div className="grid grid-cols-12 gap-10 xl:gap-14 items-start">
            {/* ─── LEFT COLUMN (col-span-7) ─── */}
            <div className="col-span-7 flex flex-col gap-10">
              {/* Product Gallery */}
              <div className="rounded-2xl overflow-hidden bg-surface-container-low border border-border/40 shadow-xs">
                <PdpGallery
                  media={shownMedia}
                  productTitle={product.title}
                  activeIndex={activeMedia}
                  onSelect={handleMediaSelect}
                  wishlisted={wishlisted}
                  {...(onWishlistToggle ? { onWishlistToggle } : {})}
                />
              </div>

              {/* Product Details, Specs & FAQs */}
              <PdpProductDetails
                description={product.description}
                productDetails={product.details}
                productFaqs={product.faqs}
                {...(guide ? { onFittingGuide: () => setIsSizeGuideOpen(true) } : {})}
              />
            </div>

            {/* ─── RIGHT COLUMN (col-span-5) ─── */}
            {/* Sticky all the way through the end of the left column's FAQ - Unboxed, independent elements */}
            <div className="col-span-5">
              <div className="sticky top-24 self-start flex flex-col gap-6">
                {/* 1 & 2. Reviews indicator at the top & Product Title closely beneath it */}
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    {ratingCount > 0 ? (
                      <a
                        href="#reviews"
                        className="inline-flex items-center gap-1.5 py-1 px-3 rounded-full bg-[#faf2ee] hover:bg-[#eee7e3] text-on-surface transition-colors no-underline"
                      >
                        <StarIcon size={14} className="text-[#9e2a4b] fill-current" />
                        <span className="text-[13px] font-bold text-[#1e1b19]">{avg}</span>
                        <span className="text-[12px] text-[#574144]">({ratingCount} reviews)</span>
                      </a>
                    ) : (
                      <a
                        href="#reviews"
                        className="inline-flex items-center gap-1.5 py-1 px-3 rounded-full bg-[#faf2ee] hover:bg-[#eee7e3] text-primary transition-colors no-underline"
                      >
                        <StarIcon size={14} className="text-[#9e2a4b]" />
                        <span className="text-[12px] font-semibold">Be the first reviewer</span>
                      </a>
                    )}
                  </div>

                  <h1 className="text-[28px] xl:text-[32px] leading-tight font-serif font-semibold text-[#1e1b19] tracking-tight">
                    {product.title}
                  </h1>
                </div>

                {/* 3. Price (Price, Compare-at, Save %, strictly no tax/vat) */}
                {priceDisplay?.amount && (
                  <div className="flex items-baseline gap-3 flex-wrap">
                    <span className="text-[26px] font-bold text-primary tabular-nums font-mono">
                      {formatTaka(priceDisplay.amount, priceDisplay.currency)}
                    </span>
                    {priceDisplay.compareAtAmount &&
                      Number(priceDisplay.compareAtAmount) > Number(priceDisplay.amount) && (
                        <>
                          <span className="text-[17px] font-bold text-[#8a7174] line-through tabular-nums font-mono">
                            {formatTaka(priceDisplay.compareAtAmount, priceDisplay.currency)}
                          </span>
                          <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-secondary-fixed text-on-secondary-fixed">
                            SAVE{' '}
                            {Math.round(
                              ((Number(priceDisplay.compareAtAmount) - Number(priceDisplay.amount)) /
                                Number(priceDisplay.compareAtAmount)) *
                                100,
                            )}
                            %
                          </span>
                        </>
                      )}
                  </div>
                )}

                {/* 4. Options (Color first, then Size, Material, etc.) */}
                <PdpVariantSelector
                  options={product.options}
                  selected={selected}
                  onChoose={choose}
                  valuePossible={valuePossible}
                  {...(guide ? { onFittingGuide: () => setIsSizeGuideOpen(true) } : {})}
                  className="px-0 pt-0"
                />

                {/* 5. Information cards (Nationwide Delivery, COD & Mobile Banking) */}
                <div className="p-4 rounded-xl bg-[#faf2ee] border border-border/40 flex flex-col gap-3">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-[#eee7e3] flex items-center justify-center text-primary shrink-0 mt-0.5">
                      <TruckIcon size={15} />
                    </div>
                    <div className="flex flex-col">
                      <p className="text-[13px] font-semibold text-[#1e1b19] leading-tight">Nationwide Express Delivery</p>
                      <p className="text-[12px] text-[#574144] mt-0.5 leading-relaxed">
                        Inside Dhaka ৳60 (Next Day) · Outside Dhaka ৳120 (2–3 Days)
                      </p>
                    </div>
                  </div>

                  <div className="h-px bg-border/40" />

                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-[#eee7e3] flex items-center justify-center text-primary shrink-0 mt-0.5">
                      <ShoppingBagIcon size={15} />
                    </div>
                    <div className="flex flex-col">
                      <p className="text-[13px] font-semibold text-[#1e1b19] leading-tight">
                        Cash on Delivery &amp; Mobile Banking
                      </p>
                      <p className="text-[12px] text-[#574144] mt-0.5 leading-relaxed">
                        Cash on Delivery across all 64 districts · bKash, Nagad &amp; Cards accepted.
                      </p>
                    </div>
                  </div>
                </div>

                {/* 6. Action buttons (Previous stepper + previous exact button style for both buttons) */}
                <div className="flex flex-col gap-2.5 pt-1">
                  <div className="flex items-center gap-2.5 xl:gap-3 w-full">
                    {/* Previous stepper */}
                    <div className="flex items-center bg-[#f4ece8] rounded-full px-3 py-2 gap-3 shrink-0">
                      <button
                        type="button"
                        aria-label="Decrease quantity"
                        onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                        className="w-8 h-8 flex items-center justify-center text-[#1e1b19] border-0 bg-transparent cursor-pointer text-xl leading-none select-none active:scale-90 transition-transform"
                      >
                        −
                      </button>
                      <span className="w-5 text-center text-[14px] font-semibold text-[#1e1b19] tabular-nums font-mono">
                        {quantity}
                      </span>
                      <button
                        type="button"
                        aria-label="Increase quantity"
                        onClick={() => setQuantity((q) => Math.min(10, q + 1))}
                        className="w-8 h-8 flex items-center justify-center text-[#1e1b19] border-0 bg-transparent cursor-pointer text-xl leading-none select-none active:scale-90 transition-transform"
                      >
                        +
                      </button>
                    </div>

                    {/* Add to Bag button */}
                    <button
                      type="button"
                      id="pdp-desktop-add-to-cart"
                      disabled={busy || unselectedAxes.length > 0 || !selectedVariant?.available}
                      onClick={handleAddToCartClick}
                      className={cx(
                        'flex-1 h-12 rounded-full flex items-center justify-center px-4 font-semibold text-[14px] transition-[background-color,transform] duration-150 active:scale-[0.98] border-0 shadow-xs cursor-pointer',
                        unselectedAxes.length === 0 && selectedVariant?.available && !busy
                          ? 'bg-[#9e2a4b] hover:bg-[#8b2340] text-white'
                          : 'bg-[#9e2a4b]/60 text-white/80 cursor-not-allowed',
                      )}
                    >
                      <span>
                        {busy
                          ? 'Adding…'
                          : cartMessage?.includes('Added') || actionFeedback?.includes('Added')
                            ? 'Added to Bag ✓'
                            : unselectedAxes.length > 0
                              ? `Select ${unselectedAxes[0]?.name ?? 'Option'}`
                              : !selectedVariant?.available
                                ? 'Out of Stock'
                                : 'Add to Bag'}
                      </span>
                    </button>

                    {/* Buy Now button */}
                    <button
                      type="button"
                      id="pdp-desktop-buy-now"
                      disabled={busy || unselectedAxes.length > 0 || !selectedVariant?.available}
                      onClick={handleBuyNowClick}
                      className={cx(
                        'flex-1 h-12 rounded-full flex items-center justify-center px-4 font-semibold text-[14px] transition-[background-color,transform] duration-150 active:scale-[0.98] border-0 shadow-xs cursor-pointer',
                        unselectedAxes.length === 0 && selectedVariant?.available && !busy
                          ? 'bg-[#1e1b19] hover:bg-[#332e2c] text-white'
                          : 'bg-[#1e1b19]/60 text-white/80 cursor-not-allowed',
                      )}
                    >
                      <span>Buy Now</span>
                    </button>
                  </div>

                  {(actionFeedback || cartMessage) && (
                    <p
                      role="status"
                      className={cx(
                        'text-[12px] font-medium py-1 px-2.5 rounded-lg transition-opacity animate-in fade-in',
                        actionFeedback?.includes('Added') || cartMessage?.includes('Added')
                          ? 'bg-green-50 text-green-700'
                          : 'bg-red-50 text-red-700',
                      )}
                    >
                      {actionFeedback ?? cartMessage}
                      {(actionFeedback?.includes('Added') || cartMessage?.includes('Added')) && (
                        <Link href="/cart" className="ml-2 underline font-semibold">
                          View Bag
                        </Link>
                      )}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
          {/* Here the two column layout ends! */}

          {/* ─── CENTER CONTENT LAYOUT: REVIEWS SECTION ─── */}
          <section id="reviews" className="w-full max-w-4xl mx-auto pt-20 pb-16 border-t border-border/40 mt-16">
            <div className="text-center mb-10">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-primary mb-1.5">
                Verified Customer Feedback
              </p>
              <h2 className="text-[28px] sm:text-[32px] font-serif font-semibold text-[#1e1b19] tracking-tight">
                Customer Reviews
              </h2>
              <p className="text-[13px] text-[#574144] mt-2 max-w-md mx-auto">
                Real ratings and experiences from verified buyers across Bangladesh
              </p>
            </div>

            <ProductReviews
              productId={product.id}
              organizationId={organizationId}
              initialReviews={initialReviews}
              initialSummary={initialSummary}
              hideHeader={true}
            />
          </section>
          {/* Core of the product details page ends here */}

          {/* ─── RECOMMENDATIONS SECTION (Full Width Multi-Column) ─── */}
          <div className="w-full pt-16 pb-16 border-t border-border/40 mt-14">
            <PdpCrossSells products={crossSells} title="Complete Your Look" subtitle="Curated Recommendations" />
          </div>
        </div>
      </div>

      {/* Size guide drawer / modal */}
      <SizeGuideDialog
        isOpen={isSizeGuideOpen}
        onClose={() => setIsSizeGuideOpen(false)}
        guide={guide}
        dialogRef={sizeDialogRef}
        productTitle={product.title}
        selectedSizeLabel={
          sizeAxis?.values.find((v) => v.id === selected[sizeAxis?.id ?? ''])?.label
        }
        onSelectSize={(label) => {
          if (!sizeAxis) return;
          const match = sizeAxis.values.find(
            (v) =>
              v.label.trim().toLowerCase() === label.trim().toLowerCase() ||
              v.code.trim().toLowerCase() === label.trim().toLowerCase(),
          );
          if (match) setSelected((prev) => ({ ...prev, [sizeAxis.id]: match.id }));
        }}
      />
    </>
  );
}
