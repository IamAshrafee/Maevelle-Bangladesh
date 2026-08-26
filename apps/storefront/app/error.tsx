'use client';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main>
      <section className="catalog-message error-state">
        <h1>Storefront temporarily unavailable</h1>
        <p>We could not load this page. Your information is safe; please try again.</p>
        <button type="button" onClick={reset}>
          Try again
        </button>
      </section>
    </main>
  );
}
