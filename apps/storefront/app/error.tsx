'use client';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main>
      <section className="shell">
        <h1>Storefront temporarily unavailable</h1>
        <p>No private system detail has been exposed. Try the request again.</p>
        <button type="button" onClick={reset}>
          Try again
        </button>
      </section>
    </main>
  );
}
