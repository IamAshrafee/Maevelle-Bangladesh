export const metadata = { title: 'Shipping and delivery' };

export default function ShippingPolicyPage() {
  return (
    <main>
      <section className="policy-page">
        <p className="eyebrow">Customer care</p>
        <h1>Shipping & delivery</h1>
        <article>
          <p>
            Delivery availability, timing, and any charge are confirmed for your order. Maevelle
            does not show a courier promise until it is supported by the configured delivery flow.
          </p>
          <h2>After you order</h2>
          <p>
            Your secure order link shows meaningful progress such as preparation, dispatch, transit,
            and delivery when those events apply.
          </p>
          <h2>Address and contact details</h2>
          <p>
            Check your recipient name, mobile number, and delivery address before placing the order.
            Contact Maevelle operations if a correction is needed after confirmation.
          </p>
          <h2>Delivery issues</h2>
          <p>
            If a delivery attempt cannot be completed, the order’s secure tracking view will reflect
            the latest supported status.
          </p>
        </article>
      </section>
    </main>
  );
}
