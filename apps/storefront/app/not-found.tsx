import Link from 'next/link';
export default function NotFound() {
  return (
    <main>
      <section className="shell">
        <h1>Page unavailable</h1>
        <p>The requested public resource does not exist or is no longer published.</p>
        <Link href="/">Return to Storefront</Link>
      </section>
    </main>
  );
}
