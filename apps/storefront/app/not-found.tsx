import Link from 'next/link';
export default function NotFound() {
  return (
    <main>
      <section className="catalog-message missing-state">
        <p className="eyebrow">404 · Not found</p>
        <h1>This page has moved on</h1>
        <p>The product, collection, or page does not exist or is no longer public.</p>
        <div>
          <Link className="button-link dark" href="/categories">
            Browse the collection
          </Link>
          <Link className="button-secondary button-link" href="/">
            Return home
          </Link>
        </div>
      </section>
    </main>
  );
}
