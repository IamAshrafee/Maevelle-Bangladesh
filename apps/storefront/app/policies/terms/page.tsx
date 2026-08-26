export const metadata = { title: 'Terms' };

export default function TermsPolicyPage() {
  return (
    <main>
      <section className="policy-page">
        <p className="eyebrow">Information</p>
        <h1>Terms of purchase</h1>
        <article>
          <p>
            Authoritative product price, promotion, availability, payment choice, and order total
            are confirmed before an order is placed.
          </p>
          <h2>Product information</h2>
          <p>
            Maevelle publishes the current product details, available canonical variants, and
            customer-facing size information held by the commerce system.
          </p>
          <h2>Payment</h2>
          <p>
            Cash on delivery and manual mobile payment behave differently. Checkout and confirmation
            explain when payment is due and what information is required.
          </p>
          <h2>Order changes</h2>
          <p>
            If stock, price, or promotion truth changes before submission, checkout asks you to
            review the updated order rather than silently accepting stale information.
          </p>
        </article>
      </section>
    </main>
  );
}
