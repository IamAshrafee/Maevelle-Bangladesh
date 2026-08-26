export const metadata = { title: 'Returns and refunds' };

export default function ReturnsPolicyPage() {
  return (
    <main>
      <section className="policy-page">
        <p className="eyebrow">Customer care</p>
        <h1>Returns & refunds</h1>
        <article>
          <p>
            Return eligibility is checked against the original order and item. A secure order or
            return link is required; an order number alone is not enough.
          </p>
          <h2>Starting a return</h2>
          <p>
            Use the secure customer flow supplied for an eligible purchase. Maevelle records the
            requested quantity and reason before operations review the return.
          </p>
          <h2>Receiving and inspection</h2>
          <p>
            A requested return is not automatically a completed refund. Returned items are received
            and assessed through the authoritative operations workflow.
          </p>
          <h2>Refund progress</h2>
          <p>
            Where a refund applies, its status remains separate from physical receipt and can be
            tracked through the secure customer context.
          </p>
        </article>
      </section>
    </main>
  );
}
