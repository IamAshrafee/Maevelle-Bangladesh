import Link from 'next/link';

export default function StorefrontHomePage() {
  return (
    <main>
      <section className="shell">
        <h1>Maevelle Storefront</h1>
        <p>
          The first public catalog slice is ready. Published product pages are served exclusively by
          the API.
        </p>
        <p>
          Open a product at{' '}
          <code>/products/&lt;handle&gt;?organizationId=&lt;organization-id&gt;</code>.
        </p>
        <Link href="/">Browse Maevelle</Link>
      </section>
    </main>
  );
}
