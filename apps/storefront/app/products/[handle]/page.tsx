'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';

import type { ApiEnvelope, PublicSizeGuideDto, StorefrontProductDto } from '@maevelle/contracts';
import { ProductReviews } from '@/components/product-reviews';
import { productJsonLd, safeJsonLd } from '@/src/seo';

interface CartView {
  version: number;
  merchandiseGross: string;
  discountTotal: string;
  merchandiseNet: string;
  lines: readonly {
    id: string;
    sku: string;
    quantity: string;
    gross: string;
    availability: string;
  }[];
  appliedCoupons: readonly string[];
}

function displayMoney(amount: string, currency = 'BDT'): string {
  return `${currency === 'BDT' ? '৳' : `${currency} `}${amount}`;
}

function formatMeasurement(
  measurement: PublicSizeGuideDto['rows'][number]['measurements'][number],
): string {
  const value = measurement.exact ?? `${measurement.min}–${measurement.max}`;
  return `${value} ${measurement.unit}${measurement.approximate ? ' (approx.)' : ''}`;
}

export default function ProductPage() {
  const parameters = useParams<{ handle: string }>();
  const search = useSearchParams();
  const organizationId = search.get('organizationId');
  const [product, setProduct] = useState<StorefrontProductDto>();
  const [guide, setGuide] = useState<PublicSizeGuideDto | null>();
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [cart, setCart] = useState<CartView>();
  const [cartMessage, setCartMessage] = useState('');
  const [state, setState] = useState<'loading' | 'ready' | 'missing'>('loading');
  useEffect(() => {
    if (!organizationId || !parameters.handle) {
      setState('missing');
      return;
    }
    const query = `organizationId=${encodeURIComponent(organizationId)}`;
    Promise.all([
      fetch(`/api/storefront/v1/products/${encodeURIComponent(parameters.handle)}?${query}`),
      fetch(
        `/api/storefront/v1/products/${encodeURIComponent(parameters.handle)}/size-guide?${query}`,
      ),
    ])
      .then(async ([catalogResponse, guideResponse]) => {
        if (!catalogResponse.ok) throw new Error('not-found');
        const catalog = (await catalogResponse.json()) as ApiEnvelope<StorefrontProductDto>;
        setProduct(catalog.data);
        setGuide(
          guideResponse.ok
            ? ((await guideResponse.json()) as ApiEnvelope<PublicSizeGuideDto | null>).data
            : null,
        );
        setState('ready');
      })
      .catch(() => setState('missing'));
  }, [organizationId, parameters.handle]);
  const selectedVariant = useMemo(
    () =>
      product?.variants.find(
        (variant) =>
          Object.values(selected).length === product.options.length &&
          product.options.every((axis) => variant.optionValueIds.includes(selected[axis.id] ?? '')),
      ),
    [product, selected],
  );
  async function loadOrCreateCart(): Promise<CartView> {
    const current = await fetch('/api/storefront/v1/carts/current', { credentials: 'include' });
    if (current.ok) return ((await current.json()) as ApiEnvelope<CartView>).data;
    const created = await fetch('/api/storefront/v1/carts', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ organizationId, currency: 'BDT' }),
    });
    if (!created.ok) throw new Error('Cart could not be created.');
    return ((await created.json()) as ApiEnvelope<CartView>).data;
  }
  async function addToCart() {
    if (!selectedVariant) return;
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
        throw new Error('This Variant could not be added at its current availability.');
      const next = ((await response.json()) as ApiEnvelope<CartView>).data;
      setCart(next);
      setCartMessage('Added to your cart. Inventory is not reserved until checkout.');
    } catch (error) {
      setCartMessage(error instanceof Error ? error.message : 'Cart could not be updated.');
    }
  }
  if (state === 'loading')
    return (
      <main>
        <p>Loading product…</p>
      </main>
    );
  if (state === 'missing' || !product)
    return (
      <main>
        <section className="shell">
          <h1>Product unavailable</h1>
          <p>
            This product is unpublished, missing, or the Storefront organization context was not
            supplied.
          </p>
        </section>
      </main>
    );
  return (
    <main>
      <article className="shell">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: safeJsonLd(productJsonLd(product, `/products/${product.handle}`)),
          }}
        />
        <p className="eyebrow">Maevelle collection</p>
        <h1>{product.title}</h1>
        {product.description ? <p>{product.description}</p> : null}
        <section>
          <h2>Choose options</h2>
          {product.options.map((axis) => (
            <fieldset key={axis.id}>
              <legend>{axis.name}</legend>
              <div className="choices">
                {axis.values.map((value) => (
                  <button
                    key={value.id}
                    type="button"
                    className={selected[axis.id] === value.id ? 'selected' : ''}
                    aria-pressed={selected[axis.id] === value.id}
                    onClick={() => setSelected((current) => ({ ...current, [axis.id]: value.id }))}
                  >
                    {value.colorHex ? (
                      <span className="swatch" style={{ backgroundColor: value.colorHex }} />
                    ) : null}
                    {value.label}
                  </button>
                ))}
              </div>
            </fieldset>
          ))}
        </section>
        <p aria-live="polite">
          {selectedVariant
            ? `Selected SKU: ${selectedVariant.sku}`
            : 'Choose every option to select an available variant.'}
        </p>
        {selectedVariant?.price ? (
          <p className="text-xl font-semibold" aria-live="polite">
            {selectedVariant.price.compareAtAmount ? (
              <del className="mr-2 text-base font-normal text-slate-500">
                {displayMoney(
                  selectedVariant.price.compareAtAmount,
                  selectedVariant.price.currency,
                )}
              </del>
            ) : null}
            {displayMoney(selectedVariant.price.amount, selectedVariant.price.currency)}
          </p>
        ) : selectedVariant ? (
          <p>This Variant is currently unpriced.</p>
        ) : null}
        <button type="button" disabled={!selectedVariant?.price} onClick={() => void addToCart()}>
          Add to cart
        </button>
        {cartMessage ? <p role="status">{cartMessage}</p> : null}
        {cart ? (
          <section aria-label="Cart summary">
            <h2>Cart</h2>
            <p>
              {cart.lines.length} line(s) · {displayMoney(cart.merchandiseNet)}
            </p>
            {cart.discountTotal !== '0.0000' ? (
              <p>Discount: {displayMoney(cart.discountTotal)}</p>
            ) : null}
          </section>
        ) : null}
        <p>
          <Link href="/cart">View cart</Link>
        </p>
        {guide ? (
          <section>
            <h2>{guide.name}</h2>
            {guide.instructions ? <p>{guide.instructions}</p> : null}
            <table>
              <thead>
                <tr>
                  <th>Size</th>
                  <th>Measurements</th>
                </tr>
              </thead>
              <tbody>
                {guide.rows.map((row) => (
                  <tr key={row.label}>
                    <td>{row.label}</td>
                    <td>
                      {row.measurements
                        .map(
                          (measurement) => `${measurement.name}: ${formatMeasurement(measurement)}`,
                        )
                        .join(', ')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ) : null}
        {product.details.length ? (
          <section>
            <h2>Details</h2>
            <dl>
              {product.details.map((detail) => (
                <div key={`${detail.group}-${detail.label}`}>
                  <dt>{detail.label}</dt>
                  <dd>{detail.value}</dd>
                </div>
              ))}
            </dl>
          </section>
        ) : null}
        {product.faqs.length ? (
          <section>
            <h2>FAQ</h2>
            {product.faqs.map((faq) => (
              <details key={faq.question}>
                <summary>{faq.question}</summary>
                <p>{faq.answer}</p>
              </details>
            ))}
          </section>
        ) : null}
        <ProductReviews productId={product.id} organizationId={organizationId!} />
      </article>
    </main>
  );
}
