'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import type {
  ProductRatingSummaryDto,
  PublicReviewDto,
  PublicSizeGuideDto,
  StorefrontProductDto,
} from '@maevelle/contracts';
import { ProductReviews } from '@/components/product-reviews';
import { SizeGuideDialog } from '@/components/size-guide-dialog';
import { StarIcon, ShoppingBagIcon, TruckIcon } from '@/components/ui/icons';
import { PdpGallery } from './pdp-gallery';
import { PdpCommercialHeader } from './pdp-commercial-header';
import { PdpVariantSelector } from './pdp-variant-selector';
import { PdpTrustGrid } from './pdp-trust-grid';
import { PdpEditorialAccordions } from './pdp-editorial-accordions';
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
  wishlisted = false,
  onWishlistToggle,
  onAddToCart,
  busy,
  cartMessage,
}: PdpViewProps) {
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

  const [activeMedia, setActiveMedia] = useState(0);
  const [quantity, setQuantity] = useState(1);
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

  const shownMedia = useMemo(() => {
    const visualAxis = product.options.find((opt) => opt.isVisual);
    const selectedVisualValueId = visualAxis ? selected[visualAxis.id] : null;

    if (selectedVariant) {
      const exact = product.media.filter((a) => a.variantId === selectedVariant.id);
      if (exact.length > 0) return exact.toSorted((a, b) => Number(b.isPrimary) - Number(a.isPrimary));
    }
    if (selectedVisualValueId) {
      const optionMedia = product.media.filter(
        (a) => a.optionValueId === selectedVisualValueId && a.variantId === null,
      );
      if (optionMedia.length > 0) return optionMedia.toSorted((a, b) => Number(b.isPrimary) - Number(a.isPrimary));
    }
    const general = product.media.filter((a) => a.variantId === null && a.optionValueId === null);
    if (general.length > 0) return general.toSorted((a, b) => Number(b.isPrimary) - Number(a.isPrimary));
    return product.media.toSorted((a, b) => Number(b.isPrimary) - Number(a.isPrimary));
  }, [product, selected, selectedVariant]);

  const visualSelectionKey = useMemo(() => {
    const visualAxis = product.options.find((opt) => opt.isVisual);
    return visualAxis ? (selected[visualAxis.id] ?? '') : '';
  }, [product, selected]);

  useEffect(() => {
    setActiveMedia(0);
  }, [visualSelectionKey, selectedVariant?.id]);

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
    const visualAxis = product.options.find((a) => a.isVisual);
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

  const sizeAxis = product.options.find(
    (a) => a.code.toLowerCase().includes('size') || a.name.toLowerCase().includes('size'),
  );

  const avg = Number(
    product.ratingSummary?.formattedAverage ?? product.ratingSummary?.averageRating ?? 0,
  ).toFixed(1);
  const ratingCount = product.ratingSummary?.ratingCount ?? 0;

  // ─────────────────────────────────────────────────────────────────────────
  // Desktop right-column actions (inline, not sticky)
  // ─────────────────────────────────────────────────────────────────────────
  const DesktopActions = (
    <div className="flex flex-col gap-4">
      {/* Trust grid desktop */}
      <div className="p-4 rounded-2xl bg-[#faf2ee] flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <div className="w-7 h-7 rounded-full bg-[#eee7e3] flex items-center justify-center text-[#9e2a4b] shrink-0">
            <TruckIcon size={14} />
          </div>
          <div>
            <p className="text-[13px] font-semibold text-[#1e1b19] mb-0.5">Swift City Delivery</p>
            <p className="text-[12px] text-[#574144]">Dhaka ৳70 (Next-day) · Outside Dhaka ৳130 (2–3 days)</p>
          </div>
        </div>
        <div className="flex items-start gap-3">
          <div className="w-7 h-7 rounded-full bg-[#eee7e3] flex items-center justify-center text-[#9e2a4b] shrink-0">
            <ShoppingBagIcon size={14} />
          </div>
          <div>
            <p className="text-[13px] font-semibold text-[#1e1b19] mb-0.5">Cash on Delivery &amp; bKash/Nagad</p>
            <p className="text-[12px] text-[#574144]">COD across 64 districts · Instant mobile payments accepted</p>
          </div>
        </div>
      </div>

      {/* Quantity + Add to Bag desktop */}
      <div className="flex gap-3 items-center">
        <div className="flex items-center bg-[#f4ece8] rounded-full px-3 py-2 gap-3 shrink-0">
          <button
            type="button"
            onClick={() => setQuantity((q) => Math.max(1, q - 1))}
            className="w-8 h-8 flex items-center justify-center text-[#1e1b19] border-0 bg-transparent cursor-pointer text-xl leading-none"
          >
            −
          </button>
          <span className="w-5 text-center text-[14px] font-semibold text-[#1e1b19]">{quantity}</span>
          <button
            type="button"
            onClick={() => setQuantity((q) => Math.min(10, q + 1))}
            className="w-8 h-8 flex items-center justify-center text-[#1e1b19] border-0 bg-transparent cursor-pointer text-xl leading-none"
          >
            +
          </button>
        </div>
        <button
          type="button"
          id="pdp-desktop-add-to-bag"
          disabled={
            busy ||
            unselectedAxes.length > 0 ||
            !selectedVariant?.price ||
            !selectedVariant.available
          }
          onClick={() => void onAddToCart(selectedVariant!.id, quantity)}
          className={[
            'flex-1 h-12 rounded-full flex items-center justify-between px-5 font-semibold transition-all duration-150 active:scale-[0.98] border-0',
            unselectedAxes.length === 0 && selectedVariant?.available && !busy
              ? 'bg-[#9e2a4b] hover:bg-[#8b2340] text-white cursor-pointer'
              : 'bg-[#9e2a4b]/60 text-white/80 cursor-not-allowed',
          ].join(' ')}
        >
          <span className="text-[14px]">
            {busy
              ? 'Adding…'
              : cartMessage?.includes('Added')
                ? 'Added to Bag ✓'
                : unselectedAxes.length > 0
                  ? `Select ${unselectedAxes[0]?.name ?? 'Option'}`
                  : !selectedVariant?.available
                    ? 'Out of Stock'
                    : 'Add to Bag'}
          </span>
          {priceDisplay?.amount && unselectedAxes.length === 0 && selectedVariant?.available && (
            <span className="text-[15px] font-bold tabular-nums">
              {formatTaka(Number(priceDisplay.amount) * quantity, priceDisplay.currency)}
            </span>
          )}
        </button>
      </div>

      {cartMessage ? (
        <p
          role="status"
          className={[
            'text-[13px] px-3 py-2 rounded-lg',
            cartMessage.includes('Added')
              ? 'bg-green-50 text-green-700'
              : 'bg-red-50 text-red-700',
          ].join(' ')}
        >
          {cartMessage}
          {cartMessage.includes('Added') && (
            <Link href="/cart" className="ml-2 underline font-semibold">
              View Bag
            </Link>
          )}
        </p>
      ) : null}
    </div>
  );

  return (
    <>
      {/* ═══════════════ MOBILE LAYOUT (< lg) ═══════════════ */}
      <div className="lg:hidden flex flex-col w-full pb-28 bg-[#fff8f5] min-h-screen">
        {/* Gallery */}
        <PdpGallery
          media={shownMedia}
          productTitle={product.title}
          activeIndex={activeMedia}
          onSelect={setActiveMedia}
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
          onFittingGuide={() => sizeDialogRef.current?.showModal()}
        />

        {/* Trust grid */}
        <PdpTrustGrid />

        {/* Editorial accordions */}
        <PdpEditorialAccordions
          productDetails={product.details}
          productFaqs={product.faqs}
        />

        {/* Reviews */}
        <section id="reviews" className="px-4 pt-5 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-[18px] font-semibold text-[#1e1b19]">Patron Reviews</h2>
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
          />
        </section>

        {/* Cross-sells */}
        <PdpCrossSells products={crossSells} />

        {/* Sticky bottom bar */}
        <PdpStickyBar
          price={priceDisplay?.amount ?? null}
          currency={priceDisplay?.currency ?? currency}
          quantity={quantity}
          onQuantityChange={(delta) => setQuantity((q) => Math.max(1, Math.min(10, q + delta)))}
          onAddToCart={() => {
            if (selectedVariant) void onAddToCart(selectedVariant.id, quantity);
          }}
          busy={busy}
          available={selectedVariant?.available ?? false}
          cartMessage={cartMessage}
          unselectedAxesCount={unselectedAxes.length}
          unselectedAxisName={unselectedAxes[0]?.name ?? ''}
        />
      </div>

      {/* ═══════════════ DESKTOP LAYOUT (lg+) ═══════════════ */}
      <div className="hidden lg:block w-full bg-[#fff8f5] min-h-screen">
        <div className="max-w-[1200px] mx-auto px-8 py-10">
          <div className="grid grid-cols-12 gap-12 items-start">
            {/* Left column – Gallery + Accordions + Reviews */}
            <div className="col-span-7 flex flex-col gap-8">
              {/* Gallery */}
              <div className="rounded-2xl overflow-hidden">
                <PdpGallery
                  media={shownMedia}
                  productTitle={product.title}
                  activeIndex={activeMedia}
                  onSelect={setActiveMedia}
                  wishlisted={wishlisted}
                  {...(onWishlistToggle ? { onWishlistToggle } : {})}
                />
              </div>

              {/* Accordions */}
              <PdpEditorialAccordions
                productDetails={product.details}
                productFaqs={product.faqs}
              />

              {/* Reviews */}
              <section id="reviews" className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-[#9e2a4b] mb-1">
                      Verified Patrons
                    </p>
                    <h2 className="text-[24px] font-serif font-semibold text-[#1e1b19]">
                      Patron Reviews
                    </h2>
                  </div>
                  {ratingCount > 0 && (
                    <div className="flex items-center gap-2 bg-[#faf2ee] px-4 py-2 rounded-full">
                      <StarIcon size={16} className="text-[#9e2a4b]" />
                      <span className="text-[16px] font-bold text-[#1e1b19]">{avg}</span>
                      <span className="text-[13px] text-[#574144]">({ratingCount} reviews)</span>
                    </div>
                  )}
                </div>
                <ProductReviews
                  productId={product.id}
                  organizationId={organizationId}
                  initialReviews={initialReviews}
                  initialSummary={initialSummary}
                />
              </section>
            </div>

            {/* Right column – sticky product info + actions */}
            <div className="col-span-5">
              <div className="sticky top-24 flex flex-col gap-6">
                {/* Brand + rating */}
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-widest text-[#8a7174]">
                    Maevelle Atelier&nbsp;•&nbsp;Dhaka
                  </span>
                  {ratingCount > 0 && (
                    <a
                      href="#reviews"
                      className="flex items-center gap-1 bg-[#eee7e3] px-2.5 py-1 rounded-full no-underline"
                    >
                      <StarIcon size={14} className="text-[#9e2a4b]" />
                      <span className="text-[13px] font-semibold text-[#1e1b19]">{avg}</span>
                      <span className="text-[12px] text-[#574144]">({ratingCount})</span>
                    </a>
                  )}
                </div>

                {/* Title */}
                <h1 className="text-[28px] leading-tight font-serif font-semibold text-[#1e1b19] tracking-tight">
                  {product.title}
                </h1>

                {/* Price */}
                {priceDisplay?.type === 'exact' && (
                  <div className="flex items-baseline gap-3 flex-wrap">
                    <span className="text-[24px] font-bold text-primary tabular-nums">
                      {formatTaka(priceDisplay.amount, priceDisplay.currency)}
                    </span>
                    {priceDisplay.compareAtAmount &&
                      Number(priceDisplay.compareAtAmount) > Number(priceDisplay.amount) && (
                        <>
                          <span className="text-[18px] font-bold text-outline line-through tabular-nums">
                            {formatTaka(priceDisplay.compareAtAmount, priceDisplay.currency)}
                          </span>
                          <span className="text-[12px] font-semibold px-2 py-0.5 rounded-full bg-secondary-fixed text-on-secondary-container">
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
                    <span className="text-[12px] text-on-surface-variant ml-auto">Tax &amp; VAT incl.</span>
                  </div>
                )}

                {/* Variant selector */}
                <div className="px-0">
                  <PdpVariantSelector
                    options={product.options}
                    selected={selected}
                    onChoose={choose}
                    valuePossible={valuePossible}
                    onFittingGuide={() => sizeDialogRef.current?.showModal()}
                  />
                </div>

                {/* Desktop actions */}
                {DesktopActions}
              </div>
            </div>
          </div>

          {/* Full-width cross-sells */}
          <div className="mt-12">
            <PdpCrossSells products={crossSells} />
          </div>
        </div>
      </div>

      {/* Size guide dialog */}
      <SizeGuideDialog
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
