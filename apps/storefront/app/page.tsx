'use client';

import Link from 'next/link';
import { type FormEvent, useEffect, useState } from 'react';

import type { ApiEnvelope } from '@maevelle/contracts';

type Product = { id: string; handle: string; title: string; description: string | null };

export default function StorefrontHomePage() {
  const [products, setProducts] = useState<readonly Product[]>([]);
  const [organizationId, setOrganizationId] = useState('');
  const [message, setMessage] = useState(
    'Enter your store organization to browse published products.',
  );
  const browse = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const org = String(form.get('organizationId') ?? '');
    const q = String(form.get('q') ?? '');
    try {
      const response = await fetch(
        `/api/storefront/v1/products?organizationId=${encodeURIComponent(org)}${q ? `&q=${encodeURIComponent(q)}` : ''}`,
      );
      if (!response.ok) throw new Error('Catalog search is unavailable.');
      setProducts(((await response.json()) as ApiEnvelope<readonly Product[]>).data);
      setOrganizationId(org);
      setMessage('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to load published products.');
    }
  };
  useEffect(() => {
    const org = new URLSearchParams(window.location.search).get('organizationId');
    if (!org) return;
    const form = document.getElementById('catalog-search') as HTMLFormElement | null;
    form?.requestSubmit();
  }, []);
  return (
    <main>
      <section className="shell">
        <p className="eyebrow">Maevelle</p>
        <h1>Thoughtful everyday commerce</h1>
        <p>
          Browse only currently published products. Price and availability remain API-authoritative.
        </p>
        <form id="catalog-search" onSubmit={(event) => void browse(event)}>
          <label>
            Store organization
            <input
              defaultValue={
                new URLSearchParams(
                  typeof window === 'undefined' ? '' : window.location.search,
                ).get('organizationId') ?? ''
              }
              name="organizationId"
              required
            />
          </label>
          <label>
            Search catalog <input name="q" placeholder="Product title or description" />
          </label>
          <button type="submit">Browse</button>
        </form>
        <p role="status">{message}</p>
        <nav>
          <Link href="/cart">Cart</Link> · <Link href="/checkout">Checkout</Link> ·{' '}
          <Link href="/policies/shipping">Shipping</Link> ·{' '}
          <Link href="/policies/returns">Returns</Link>
        </nav>
        <section aria-label="Published products">
          {products.map((product) => (
            <article key={product.id}>
              <h2>
                <Link
                  href={`/products/${product.handle}?organizationId=${encodeURIComponent(organizationId)}`}
                >
                  {product.title}
                </Link>
              </h2>
              <p>{product.description ?? 'See product details.'}</p>
            </article>
          ))}
        </section>
      </section>
    </main>
  );
}
