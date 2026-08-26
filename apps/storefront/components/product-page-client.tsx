'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';

import type { ApiEnvelope, PublicSizeGuideDto, StorefrontProductDto } from '@maevelle/contracts';
import { ProductReviews } from '@/components/product-reviews';
import { notifyCartChanged, useStorefrontContext } from '@/components/storefront-context';

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

function measurement(value: PublicSizeGuideDto['rows'][number]['measurements'][number]) {
  return `${value.exact ?? `${value.min}–${value.max}`} ${value.unit}${value.approximate ? ' approx.' : ''}`;
}

export function ProductPageClient() {
  const parameters = useParams<{ handle: string }>();
  const { context, loading: contextLoading } = useStorefrontContext();
  const [product, setProduct] = useState<StorefrontProductDto>();
  const [guide, setGuide] = useState<PublicSizeGuideDto | null>();
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [activeMedia, setActiveMedia] = useState(0);
  const [cart, setCart] = useState<CartView>();
  const [cartMessage, setCartMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading');
  const sizeDialog = useRef<HTMLDialogElement>(null);
  const galleryDialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (!context || !parameters.handle) return;
    const controller = new AbortController();
    const query = `organizationId=${encodeURIComponent(context.organizationId)}`;
    setState('loading');
    void Promise.all([
      fetch(`/api/storefront/v1/products/${encodeURIComponent(parameters.handle)}?${query}`, {
        signal: controller.signal,
      }),
      fetch(
        `/api/storefront/v1/products/${encodeURIComponent(parameters.handle)}/size-guide?${query}`,
        { signal: controller.signal },
      ),
    ])
      .then(async ([catalogResponse, guideResponse]) => {
        if (catalogResponse.status === 404) return setState('missing');
        if (!catalogResponse.ok) throw new Error('catalog');
        const catalog = (await catalogResponse.json()) as ApiEnvelope<StorefrontProductDto>;
        setProduct(catalog.data);
        setGuide(
          guideResponse.ok
            ? ((await guideResponse.json()) as ApiEnvelope<PublicSizeGuideDto | null>).data
            : null,
        );
        const first =
          catalog.data.variants.find((variant) => variant.available && variant.price) ??
          catalog.data.variants.find((variant) => variant.price) ??
          catalog.data.variants[0];
        if (first) {
          const initial: Record<string, string> = {};
          for (const axis of catalog.data.options) {
            const value = axis.values.find((candidate) =>
              first.optionValueIds.includes(candidate.id),
            );
            if (value) initial[axis.id] = value.id;
          }
          setSelected(initial);
        }
        setState('ready');
      })
      .catch(() => {
        if (!controller.signal.aborted) setState('error');
      });
    return () => controller.abort();
  }, [context, parameters.handle]);

  const selectedVariant = useMemo(
    () =>
      product?.variants.find((variant) =>
        product.options.every((axis) => variant.optionValueIds.includes(selected[axis.id] ?? '')),
      ),
    [product, selected],
  );
  const shownMedia = useMemo(() => {
    if (!product) return [];
    const matched = selectedVariant
      ? product.media.filter((asset) => asset.variantId === selectedVariant.id)
      : [];
    const general = product.media.filter((asset) => asset.variantId === null);
    return [
      ...matched,
      ...general.filter((asset) => !matched.some((candidate) => candidate.id === asset.id)),
    ];
  }, [product, selectedVariant]);
  useEffect(() => setActiveMedia(0), [selectedVariant?.id]);

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
    const exact = product.variants.find((variant) =>
      product.options.every((axis) => variant.optionValueIds.includes(next[axis.id] ?? '')),
    );
    if (exact) return setSelected(next);
    const compatible = product.variants.find((variant) => variant.optionValueIds.includes(valueId));
    if (!compatible) return;
    const corrected: Record<string, string> = {};
    for (const axis of product.options) {
      const match = axis.values.find((value) => compatible.optionValueIds.includes(value.id));
      if (match) corrected[axis.id] = match.id;
    }
    setSelected(corrected);
  }
  async function loadOrCreateCart(): Promise<CartView> {
    const current = await fetch('/api/storefront/v1/carts/current', { credentials: 'include' });
    if (current.ok) return ((await current.json()) as ApiEnvelope<CartView>).data;
    const created = await fetch('/api/storefront/v1/carts', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        organizationId: context?.organizationId,
        currency: context?.currency ?? 'BDT',
      }),
    });
    if (!created.ok) throw new Error('Your cart could not be started. Please try again.');
    return ((await created.json()) as ApiEnvelope<CartView>).data;
  }
  async function addToCart() {
    if (!selectedVariant?.price || !selectedVariant.available) return;
    setBusy(true);
    setCartMessage('');
    try {
      const current = cart ?? (await loadOrCreateCart());
      const response = await fetch('/api/storefront/v1/carts/current/lines', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          variantId: selectedVariant.id,
          quantity: '1',
          version: current.version,
        }),
      });
      if (!response.ok)
        throw new Error('This option is no longer available. Please choose another.');
      const next = ((await response.json()) as ApiEnvelope<CartView>).data;
      setCart(next);
      notifyCartChanged();
      setCartMessage('Added to your bag.');
    } catch (error) {
      setCartMessage(error instanceof Error ? error.message : 'Your bag could not be updated.');
    } finally {
      setBusy(false);
    }
  }

  if (contextLoading || state === 'loading')
    return (
      <main>
        <section className="pdp-shell">
          <div className="pdp-loading" aria-label="Loading product" aria-busy="true">
            <span />
            <span />
          </div>
        </section>
      </main>
    );
  if (state === 'missing')
    return (
      <main>
        <section className="catalog-message missing-state">
          <p className="eyebrow">No longer available</p>
          <h1>This product cannot be found</h1>
          <p>It may be unpublished or its address may have changed.</p>
          <Link className="button-link dark" href="/categories">
            Continue shopping
          </Link>
        </section>
      </main>
    );
  if (state === 'error' || !product || !context)
    return (
      <main>
        <section className="catalog-message error-state">
          <h1>We could not load this product</h1>
          <p>Please try again or return to the collection.</p>
          <button type="button" onClick={() => window.location.reload()}>
            Try again
          </button>
        </section>
      </main>
    );

  const currentMedia = shownMedia[activeMedia];
  const price = selectedVariant?.price;
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
                  src={`/api/media/public/${currentMedia.id}`}
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
                    <img alt="" src={`/api/media/public/${asset.id}`} width="96" height="128" />
                  </button>
                ))}
              </div>
            ) : null}
          </section>
          <section className="pdp-information">
            <p className="eyebrow">Maevelle collection</p>
            <h1>{product.title}</h1>
            <p className="pdp-rating-link">
              <a href="#reviews">Verified customer reviews</a>
            </p>
            <div className="pdp-price" aria-live="polite">
              {price ? (
                <>
                  {price.compareAtAmount ? (
                    <del>{money(price.compareAtAmount, price.currency)}</del>
                  ) : null}
                  <strong>{money(price.amount, price.currency)}</strong>
                  {price.compareAtAmount && Number(price.compareAtAmount) > Number(price.amount) ? (
                    <span>
                      Save{' '}
                      {money(
                        String(Number(price.compareAtAmount) - Number(price.amount)),
                        price.currency,
                      )}
                    </span>
                  ) : null}
                </>
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
              className={`availability ${selectedVariant?.available ? 'available' : 'unavailable'}`}
            >
              {selectedVariant
                ? selectedVariant.available
                  ? 'In stock and ready to order'
                  : 'This option is currently out of stock'
                : 'Choose your options'}
            </p>
            <button
              className="add-to-cart"
              type="button"
              disabled={busy || !price || !selectedVariant?.available}
              onClick={() => void addToCart()}
            >
              {busy ? 'Adding…' : selectedVariant?.available ? 'Add to bag' : 'Unavailable'}
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
          <ProductReviews productId={product.id} organizationId={context.organizationId} />
        </div>
      </article>
      <dialog className="size-guide-dialog" ref={sizeDialog}>
        <header>
          <div>
            <p className="eyebrow">Find your fit</p>
            <h2>{guide?.name ?? 'Size guide'}</h2>
          </div>
          <button
            type="button"
            aria-label="Close size guide"
            onClick={() => sizeDialog.current?.close()}
          >
            ✕
          </button>
        </header>
        {guide?.instructions ? <p>{guide.instructions}</p> : null}
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Size</th>
                <th>Measurements</th>
              </tr>
            </thead>
            <tbody>
              {guide?.rows.map((row) => (
                <tr key={row.label}>
                  <th scope="row">{row.label}</th>
                  <td>
                    {row.measurements
                      .map((item) => `${item.name}: ${measurement(item)}`)
                      .join(' · ')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="dialog-note">
          Measurements are product-specific. Choose the closest fit for your preferred ease.
        </p>
      </dialog>
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
            src={`/api/media/public/${currentMedia.id}`}
            alt={currentMedia.altText ?? product.title}
            width="1200"
            height="1600"
          />
        ) : null}
      </dialog>
    </main>
  );
}
