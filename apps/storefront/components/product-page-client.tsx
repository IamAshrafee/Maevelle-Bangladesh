'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';

import type {
  ProductRatingSummaryDto,
  PublicReviewDto,
  PublicSizeGuideDto,
  StorefrontProductDto,
} from '@maevelle/contracts';
import { ProductReviews } from '@/components/product-reviews';
import { StarRating } from '@/components/reviews/star-rating';
import { SizeGuideDialog } from '@/components/size-guide-dialog';
import { notifyCartChanged } from '@/features/cart/cart-events';
import { requestStorefrontClient, StorefrontClientApiError } from '@/lib/api/client/http';

interface CartView {
  version: number;
  merchandiseNet: string;
  lines: readonly { id: string }[];
}

function money(amount: string, currency = 'BDT') {
  return new Intl.NumberFormat('en-BD', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(Number(amount));
}

export interface ProductPageClientProps {
  readonly initialProduct: StorefrontProductDto;
  readonly initialGuide: PublicSizeGuideDto | null;
  readonly organizationId: string;
  readonly currency: string;
  readonly initialReviews?: readonly PublicReviewDto[] | undefined;
  readonly initialSummary?: ProductRatingSummaryDto | undefined;
}

export function ProductPageClient({
  initialProduct,
  initialGuide,
  organizationId,
  currency,
  initialReviews,
  initialSummary,
}: ProductPageClientProps) {
  const product = initialProduct;
  const guide = initialGuide;
  const [selected, setSelected] = useState<Record<string, string>>(() => {
    const visualAxis = initialProduct.options.find((opt) => opt.isVisual);
    if (!visualAxis) return {};
    const primaryVal =
      visualAxis.values.find((val) => val.isPrimary) ||
      visualAxis.values.find((val) =>
        initialProduct.variants.some((v) => v.optionValueIds.includes(val.id) && v.available),
      ) ||
      visualAxis.values[0];
    return primaryVal ? { [visualAxis.id]: primaryVal.id } : {};
  });
  const [activeMedia, setActiveMedia] = useState(0);
  const [cart, setCart] = useState<CartView>();
  const [cartMessage, setCartMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const sizeDialog = useRef<HTMLDialogElement>(null);
  const galleryDialog = useRef<HTMLDialogElement>(null);

  const selectedVariant = useMemo(() => {
    if (!product) return undefined;
    const allSelected = product.options.every((axis) => Boolean(selected[axis.id]));
    if (!allSelected) return undefined;
    return product.variants.find((variant) =>
      product.options.every((axis) => variant.optionValueIds.includes(selected[axis.id]!)),
    );
  }, [product, selected]);

  const matchingVariants = useMemo(() => {
    if (!product) return [];
    return product.variants.filter((variant) =>
      product.options.every(
        (axis) => !selected[axis.id] || variant.optionValueIds.includes(selected[axis.id]!),
      ),
    );
  }, [product, selected]);

  const priceDisplay = useMemo(() => {
    if (selectedVariant?.price) {
      return {
        type: 'exact' as const,
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
        const max = Math.max(...prices);
        const currency = matchingVariants.find((v) => v.price)?.price?.currency ?? 'BDT';
        return {
          type: 'range' as const,
          min: String(min),
          max: String(max),
          currency,
          isSinglePrice: min === max,
        };
      }
    }
    return null;
  }, [selectedVariant, matchingVariants]);

  const unselectedAxes = useMemo(() => {
    if (!product) return [];
    return product.options.filter((axis) => !selected[axis.id]);
  }, [product, selected]);

  const shownMedia = useMemo(() => {
    if (!product) return [];
    const visualAxis = product.options.find((opt) => opt.isVisual);
    const selectedVisualValueId = visualAxis ? selected[visualAxis.id] : null;

    // 1. Exact SKU override if variant selected
    if (selectedVariant) {
      const exact = product.media.filter((asset) => asset.variantId === selectedVariant.id);
      if (exact.length > 0) {
        return exact.toSorted((a, b) => Number(b.isPrimary) - Number(a.isPrimary));
      }
    }

    // 2. Visual presentation value gallery (e.g. Color)
    if (selectedVisualValueId) {
      const optionMedia = product.media.filter(
        (asset) => asset.optionValueId === selectedVisualValueId && asset.variantId === null,
      );
      if (optionMedia.length > 0) {
        return optionMedia.toSorted((a, b) => Number(b.isPrimary) - Number(a.isPrimary));
      }
    }

    // 3. General product gallery (for uniform photography or size-only products)
    const general = product.media.filter(
      (asset) => asset.variantId === null && asset.optionValueId === null,
    );
    if (general.length > 0) {
      return general.toSorted((a, b) => Number(b.isPrimary) - Number(a.isPrimary));
    }

    // 4. Fallback to all media
    return product.media.toSorted((a, b) => Number(b.isPrimary) - Number(a.isPrimary));
  }, [product, selected, selectedVariant]);

  const visualSelectionKey = useMemo(() => {
    const visualAxis = product?.options.find((opt) => opt.isVisual);
    return visualAxis ? (selected[visualAxis.id] ?? '') : '';
  }, [product, selected]);

  useEffect(() => {
    setActiveMedia(0);
  }, [visualSelectionKey, selectedVariant?.id]);

  function valuePossible(axisId: string, valueId: string) {
    if (!product) return false;
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
    if (!product) return;
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

    // If newly selected value conflicts with other axes, keep current value and visual axis if compatible
    const visualAxis = product.options.find((a) => a.isVisual);
    const fallback: Record<string, string> = { [axisId]: valueId };
    if (visualAxis && axisId !== visualAxis.id && selected[visualAxis.id]) {
      const matchesVisual = product.variants.some(
        (v) =>
          v.optionValueIds.includes(valueId) && v.optionValueIds.includes(selected[visualAxis.id]!),
      );
      if (matchesVisual) {
        fallback[visualAxis.id] = selected[visualAxis.id]!;
      }
    }
    setSelected(fallback);
  }
  async function loadOrCreateCart(): Promise<CartView> {
    try {
      return await requestStorefrontClient<CartView>('/api/storefront/v1/carts/current');
    } catch (error) {
      if (!(error instanceof StorefrontClientApiError) || error.status !== 404) throw error;
      return requestStorefrontClient<CartView>('/api/storefront/v1/carts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ organizationId, currency }),
      });
    }
  }
  async function addToCart() {
    if (!selectedVariant?.price || !selectedVariant.available) return;
    setBusy(true);
    setCartMessage('');
    try {
      const current = cart ?? (await loadOrCreateCart());
      const next = await requestStorefrontClient<CartView>(
        '/api/storefront/v1/carts/current/lines',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            variantId: selectedVariant.id,
            quantity: '1',
            version: current.version,
          }),
        },
      );
      setCart(next);
      notifyCartChanged();
      setCartMessage('Added to your bag.');
    } catch (error) {
      setCartMessage(error instanceof Error ? error.message : 'Your bag could not be updated.');
    } finally {
      setBusy(false);
    }
  }

  const currentMedia = shownMedia[activeMedia];
  return (
    <main>
      <article className="pdp-shell">
        <nav className="breadcrumbs" aria-label="Breadcrumb">
          <Link href="/">Home</Link>
          <span aria-hidden="true">/</span>
          <Link href="/categories">Shop</Link>
          <span aria-hidden="true">/</span>
          <span>{product.title}</span>
        </nav>
        <div className="pdp-grid">
          <section className="product-gallery" aria-label="Product images">
            <button
              className="gallery-main"
              type="button"
              disabled={!currentMedia}
              onClick={() => galleryDialog.current?.showModal()}
              aria-label="Open expanded product image"
            >
              {currentMedia ? (
                <img
                  src={`/api/media/public/${currentMedia.id}?rendition=pdp`}
                  alt={currentMedia.altText ?? product.title}
                  width="960"
                  height="1280"
                />
              ) : (
                <span className="product-image-fallback" aria-hidden="true">
                  M
                </span>
              )}
            </button>
            {shownMedia.length > 1 ? (
              <div className="gallery-thumbnails">
                {shownMedia.map((asset, index) => (
                  <button
                    key={`${asset.id}-${index}`}
                    className={activeMedia === index ? 'selected' : ''}
                    type="button"
                    aria-label={`View image ${index + 1}`}
                    aria-pressed={activeMedia === index}
                    onClick={() => setActiveMedia(index)}
                  >
                    <img
                      alt=""
                      src={`/api/media/public/${asset.id}?rendition=thumbnail`}
                      width="96"
                      height="128"
                    />
                  </button>
                ))}
              </div>
            ) : null}
          </section>
          <section className="pdp-information">
            <p className="eyebrow">Maevelle collection</p>
            <h1>{product.title}</h1>
            <div className="pdp-rating-link">
              {product.ratingSummary && product.ratingSummary.ratingCount > 0 ? (
                <a
                  href="#reviews"
                  className="pdp-rating-pill"
                  aria-label={`Rated ${Number(product.ratingSummary.formattedAverage ?? product.ratingSummary.averageRating ?? 0).toFixed(1)} out of 5 stars from ${product.ratingSummary.ratingCount} reviews. Jump to reviews section.`}
                >
                  <StarRating
                    value={Number(
                      product.ratingSummary.formattedAverage ??
                        product.ratingSummary.averageRating ??
                        0,
                    )}
                    size="xs"
                  />
                  <span className="pdp-rating-score">
                    {Number(
                      product.ratingSummary.formattedAverage ??
                        product.ratingSummary.averageRating ??
                        0,
                    ).toFixed(1)}
                  </span>
                  <span className="pdp-rating-count">({product.ratingSummary.ratingCount})</span>
                </a>
              ) : (
                <a href="#reviews" className="pdp-rating-pill is-empty">
                  <StarRating value={0} size="xs" />
                  <span className="pdp-rating-count">Be the first to review</span>
                </a>
              )}
            </div>

            <div className="pdp-price" aria-live="polite">
              {priceDisplay?.type === 'exact' ? (
                <>
                  {priceDisplay.compareAtAmount ? (
                    <del>{money(priceDisplay.compareAtAmount, priceDisplay.currency)}</del>
                  ) : null}
                  <strong>{money(priceDisplay.amount, priceDisplay.currency)}</strong>
                  {priceDisplay.compareAtAmount &&
                  Number(priceDisplay.compareAtAmount) > Number(priceDisplay.amount) ? (
                    <span>
                      Save{' '}
                      {money(
                        String(Number(priceDisplay.compareAtAmount) - Number(priceDisplay.amount)),
                        priceDisplay.currency,
                      )}
                    </span>
                  ) : null}
                </>
              ) : priceDisplay?.type === 'range' ? (
                priceDisplay.isSinglePrice ? (
                  <strong>{money(priceDisplay.min, priceDisplay.currency)}</strong>
                ) : (
                  <div className="flex items-baseline gap-2">
                    <strong>
                      {money(priceDisplay.min, priceDisplay.currency)} –{' '}
                      {money(priceDisplay.max, priceDisplay.currency)}
                    </strong>
                    {unselectedAxes.length > 0 && (
                      <span className="text-xs text-muted-foreground font-normal">
                        (Select {unselectedAxes[0]?.name.toLowerCase()} for price)
                      </span>
                    )}
                  </div>
                )
              ) : (
                <strong>Choose an option to see price</strong>
              )}
            </div>
            {product.description ? <p className="pdp-description">{product.description}</p> : null}
            <div className="variant-options">
              {product.options.map((axis) => (
                <fieldset key={axis.id}>
                  <legend>
                    <span>{axis.name}</span>
                    {axis.code.toLowerCase().includes('size') && guide ? (
                      <button type="button" onClick={() => sizeDialog.current?.showModal()}>
                        Size guide
                      </button>
                    ) : null}
                  </legend>
                  <div
                    className={`option-values ${axis.values.some((value) => value.colorHex) ? 'color-options' : ''}`}
                  >
                    {axis.values.map((value) => {
                      const possible = valuePossible(axis.id, value.id);
                      const active = selected[axis.id] === value.id;
                      return (
                        <button
                          key={value.id}
                          type="button"
                          className={active ? 'selected' : ''}
                          disabled={!possible}
                          aria-pressed={active}
                          onClick={() => choose(axis.id, value.id)}
                        >
                          {value.colorHex ? (
                            <span
                              className="swatch"
                              style={{ backgroundColor: value.colorHex }}
                              aria-hidden="true"
                            />
                          ) : null}
                          <span>{value.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
              ))}
            </div>
            <p
              className={`availability ${
                unselectedAxes.length > 0
                  ? 'unavailable'
                  : selectedVariant?.available
                    ? 'available'
                    : 'unavailable'
              }`}
            >
              {unselectedAxes.length > 0
                ? `Please select your ${unselectedAxes.map((a) => a.name.toLowerCase()).join(' and ')}`
                : selectedVariant
                  ? selectedVariant.available
                    ? 'In stock and ready to order'
                    : 'This option is currently out of stock'
                  : 'Choose your options'}
            </p>
            <button
              className="add-to-cart"
              type="button"
              disabled={
                busy ||
                unselectedAxes.length > 0 ||
                !selectedVariant?.price ||
                !selectedVariant.available
              }
              onClick={() => void addToCart()}
            >
              {busy
                ? 'Adding…'
                : unselectedAxes.length > 0
                  ? `Select ${unselectedAxes[0]?.name ?? 'Option'}`
                  : selectedVariant?.available
                    ? 'Add to bag'
                    : 'Unavailable'}
            </button>
            {cartMessage ? (
              <div className="cart-feedback" role="status">
                <span>{cartMessage}</span>
                {cart ? <Link href="/cart">View bag ({cart.lines.length})</Link> : null}
              </div>
            ) : null}
            <div className="pdp-assurances">
              <p>
                <strong>Secure guest checkout</strong>
                <span>No account required.</span>
              </p>
              <p>
                <strong>Order tracking</strong>
                <span>Follow meaningful delivery milestones.</span>
              </p>
              <p>
                <strong>Clear return context</strong>
                <span>Eligibility is confirmed against your order.</span>
              </p>
            </div>
            <div className="product-accordions">
              {product.details.length ? (
                <details open>
                  <summary>Product details</summary>
                  <dl>
                    {product.details.map((detail) => (
                      <div key={`${detail.group}-${detail.label}`}>
                        <dt>{detail.label}</dt>
                        <dd>{detail.value}</dd>
                      </div>
                    ))}
                  </dl>
                </details>
              ) : null}
              <details>
                <summary>Shipping & returns</summary>
                <p>
                  Delivery choices and charges are confirmed during checkout. Return eligibility is
                  checked securely against your order.
                </p>
                <p>
                  <Link href="/policies/shipping">Shipping information</Link> ·{' '}
                  <Link href="/policies/returns">Returns information</Link>
                </p>
              </details>
              {product.faqs.length ? (
                <details>
                  <summary>Questions & answers</summary>
                  {product.faqs.map((faq) => (
                    <div key={faq.question}>
                      <h3>{faq.question}</h3>
                      <p>{faq.answer}</p>
                    </div>
                  ))}
                </details>
              ) : null}
            </div>
          </section>
        </div>
        <div id="reviews">
          <ProductReviews
            productId={product.id}
            organizationId={organizationId}
            initialReviews={initialReviews}
            initialSummary={initialSummary}
          />
        </div>
      </article>
      <SizeGuideDialog
        guide={guide}
        dialogRef={sizeDialog}
        productTitle={product.title}
        selectedSizeLabel={
          product.options
            .find(
              (a) => a.code.toLowerCase().includes('size') || a.name.toLowerCase().includes('size'),
            )
            ?.values.find(
              (v) =>
                v.id ===
                selected[
                  product.options.find(
                    (a) =>
                      a.code.toLowerCase().includes('size') ||
                      a.name.toLowerCase().includes('size'),
                  )?.id ?? ''
                ],
            )?.label
        }
        onSelectSize={(label) => {
          const axis = product.options.find(
            (a) => a.code.toLowerCase().includes('size') || a.name.toLowerCase().includes('size'),
          );
          if (!axis) return;
          const match = axis.values.find(
            (v) =>
              v.label.trim().toLowerCase() === label.trim().toLowerCase() ||
              v.code.trim().toLowerCase() === label.trim().toLowerCase(),
          );
          if (match) {
            setSelected((prev) => ({ ...prev, [axis.id]: match.id }));
          }
        }}
      />
      <dialog className="gallery-dialog" ref={galleryDialog}>
        <button
          type="button"
          aria-label="Close expanded image"
          onClick={() => galleryDialog.current?.close()}
        >
          ✕
        </button>
        {currentMedia ? (
          <img
            src={`/api/media/public/${currentMedia.id}?rendition=zoom`}
            alt={currentMedia.altText ?? product.title}
            width="1200"
            height="1600"
          />
        ) : null}
      </dialog>
    </main>
  );
}
