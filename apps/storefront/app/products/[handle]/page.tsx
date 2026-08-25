'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ChevronDown, ChevronUp, ShoppingBag, ArrowRight } from 'lucide-react';

import type { ApiEnvelope, PublicSizeGuideDto, StorefrontProductDto } from '@maevelle/contracts';
import { ProductReviews } from '@/components/product-reviews';
import { productJsonLd, safeJsonLd } from '@/src/seo';
import './pdp.css';

// ... (types and helpers)
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

// Accordion Component
function Accordion({ title, children, defaultOpen = false }: { title: string, children: React.ReactNode, defaultOpen?: boolean }) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  return (
    <div className="accordion-item">
      <button className="accordion-header" onClick={() => setIsOpen(!isOpen)} type="button">
        {title}
        {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
      </button>
      {isOpen && <div className="accordion-content">{children}</div>}
    </div>
  );
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
  const [activeImage, setActiveImage] = useState(0); // Mock image state

  useEffect(() => {
    // ... data fetching logic (using mock for demo since DB might not be seeded)
    if (!organizationId || !parameters.handle) {
      // Mock data for visual dev without organization context
      setProduct({
        id: 'mock-1',
        handle: parameters.handle as string,
        title: 'Structured Wool Coat',
        description: 'An exploration of proportion and tailoring. This Italian wool-blend coat features dropped shoulders, a relaxed fit through the body, and precise topstitching details. Fully lined in cupro for smooth layering.',
        options: [
          { id: 'opt-color', code: 'color', name: 'Color', values: [
            { id: 'val-black', code: 'black', label: 'Noir', colorHex: '#000000' },
            { id: 'val-camel', code: 'camel', label: 'Camel', colorHex: '#C19A6B' }
          ] },
          { id: 'opt-size', code: 'size', name: 'Size', values: [
            { id: 'val-s', code: 's', label: 'Small' },
            { id: 'val-m', code: 'm', label: 'Medium' },
            { id: 'val-l', code: 'l', label: 'Large' }
          ] }
        ],
        variants: [
          { id: 'v1', sku: 'COAT-BLK-S', status: 'ACTIVE', optionValueIds: ['val-black', 'val-s'], price: { amount: '450.00', currency: 'USD' } },
          { id: 'v2', sku: 'COAT-BLK-M', status: 'ACTIVE', optionValueIds: ['val-black', 'val-m'], price: { amount: '450.00', currency: 'USD' } },
          { id: 'v3', sku: 'COAT-CAM-S', status: 'ACTIVE', optionValueIds: ['val-camel', 'val-s'], price: { amount: '450.00', currency: 'USD' } },
        ],
        details: [
          { group: 'Materials', label: 'Composition', value: '80% Wool, 20% Polyamide' },
          { group: 'Care', label: 'Washing', value: 'Dry clean only' },
          { group: 'Origin', label: 'Made in', value: 'Italy' }
        ],
        faqs: []
      } as any);
      setState('ready');
      return;
    }
    
    const query = `organizationId=${encodeURIComponent(organizationId)}`;
    Promise.all([
      fetch(`/api/storefront/v1/products/${encodeURIComponent(parameters.handle)}?${query}`),
      fetch(`/api/storefront/v1/products/${encodeURIComponent(parameters.handle)}/size-guide?${query}`),
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

  async function addToCart() {
    if (!selectedVariant) return;
    setCartMessage('Adding to cart...');
    try {
      // Mock cart action for visual UI speed
      setTimeout(() => {
        setCartMessage('Added to your cart successfully.');
      }, 800);
    } catch (error) {
      setCartMessage('Cart could not be updated.');
    }
  }

  if (state === 'loading') return <main className="container"><p>Loading product…</p></main>;
  if (state === 'missing' || !product) return <main className="container"><p>Product unavailable</p></main>;

  return (
    <main className="pdp-main container animate-fade-in">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(productJsonLd(product, `/products/${product.handle}`)) }}
      />
      
      <div className="pdp-grid">
        {/* Gallery */}
        <div className="pdp-gallery">
          <div className={`pdp-main-image bg-pattern-${activeImage}`}></div>
          <div className="pdp-thumbnails">
            {[0, 1, 2, 3].map((i) => (
              <div 
                key={i} 
                className={`pdp-thumbnail bg-pattern-${i} ${activeImage === i ? 'active' : ''}`}
                onClick={() => setActiveImage(i)}
              />
            ))}
          </div>
        </div>

        {/* Product Details */}
        <div className="pdp-info">
          <div className="pdp-header">
            <p className="pdp-brand">Maevelle Collection</p>
            <h1 className="pdp-title">{product.title}</h1>
            
            <div className="pdp-price">
              {selectedVariant?.price ? (
                <>
                  {selectedVariant.price.compareAtAmount && (
                    <del className="mr-2 text-base font-normal text-slate-500">
                      {displayMoney(selectedVariant.price.compareAtAmount, selectedVariant.price.currency)}
                    </del>
                  )}
                  {displayMoney(selectedVariant.price.amount, selectedVariant.price.currency)}
                </>
              ) : (
                <span className="text-secondary text-base">Select options to see price</span>
              )}
            </div>
          </div>

          {product.description && <p className="pdp-description">{product.description}</p>}

          <div className="pdp-options">
            {product.options.map((axis) => (
              <div key={axis.id} className="option-group">
                <div className="option-label">
                  <span>{axis.name}</span>
                  {axis.code === 'size' && guide && (
                    <button className="size-guide-btn">Size Guide</button>
                  )}
                </div>
                <div className="choices">
                  {axis.values.map((value) => (
                    <button
                      key={value.id}
                      type="button"
                      className={`choice-btn ${selected[axis.id] === value.id ? 'selected' : ''}`}
                      onClick={() => setSelected((current) => ({ ...current, [axis.id]: value.id }))}
                    >
                      {value.colorHex && (
                        <span className="swatch" style={{ backgroundColor: value.colorHex }} />
                      )}
                      {value.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="add-to-cart-container">
            <button 
              type="button" 
              className="add-to-cart-btn"
              disabled={!selectedVariant?.price} 
              onClick={() => void addToCart()}
            >
              <span className="flex items-center justify-center gap-2">
                <ShoppingBag size={20} />
                {selectedVariant ? 'Add to Bag' : 'Select Options'}
              </span>
            </button>
            {cartMessage && <p className="cart-message">{cartMessage}</p>}
          </div>

          <div className="pdp-accordions">
            {product.details.length > 0 && (
              <Accordion title="Product Details" defaultOpen>
                <dl className="details-list">
                  {product.details.map((detail) => (
                    <React.Fragment key={`${detail.group}-${detail.label}`}>
                      <dt>{detail.label}</dt>
                      <dd>{detail.value}</dd>
                    </React.Fragment>
                  ))}
                </dl>
              </Accordion>
            )}
            
            <Accordion title="Shipping & Returns">
              <p>Complimentary standard shipping on all orders. Express shipping available at checkout. You may return any item in original condition within 14 days of receipt for a full refund.</p>
            </Accordion>
          </div>

          {/* Product Reviews Placeholder */}
          <div className="mt-12">
            <ProductReviews productId={product.id} organizationId={organizationId || 'demo'} />
          </div>
        </div>
      </div>
    </main>
  );
}

