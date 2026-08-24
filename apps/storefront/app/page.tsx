import Link from 'next/link';
import { CatalogBrowser } from '@/components/catalog-browser';

const sections = [
  {
    eyebrow: 'New arrivals',
    title: 'Discover what is newly published',
    body: 'Browse current products with live price and availability.',
  },
  {
    eyebrow: 'Thoughtful fit',
    title: 'Choose with confidence',
    body: 'Variant details and product-specific size guides support every selection.',
  },
  {
    eyebrow: 'Secure checkout',
    title: 'Commerce truth stays server-authoritative',
    body: 'Promotions, stock, payment choices, and totals are confirmed before Order creation.',
  },
] as const;

export default function StorefrontHomePage() {
  return (
    <main>
      <section className="hero">
        <p className="eyebrow">Maevelle</p>
        <h1>Thoughtful everyday commerce</h1>
        <p>
          Published products, transparent pricing, secure checkout, and dependable order tracking.
        </p>
        <Link className="button-link" href="/search">
          Browse the collection
        </Link>
      </section>
      <section className="feature-grid" aria-label="Storefront highlights">
        {sections.map((section) => (
          <article key={section.title}>
            <p className="eyebrow">{section.eyebrow}</p>
            <h2>{section.title}</h2>
            <p>{section.body}</p>
          </article>
        ))}
      </section>
      <section className="shell wide">
        <h2>Featured products</h2>
        <CatalogBrowser />
      </section>
    </main>
  );
}
