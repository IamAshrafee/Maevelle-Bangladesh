export const metadata = { title: 'Privacy' };

export default function PrivacyPolicyPage() {
  return (
    <main>
      <section className="policy-page">
        <p className="eyebrow">Information</p>
        <h1>Privacy</h1>
        <article>
          <p>
            Maevelle uses customer information to operate, deliver, secure, and support customer
            orders and related customer services.
          </p>
          <h2>Information you provide</h2>
          <p>
            Checkout can include your name, mobile number, email, delivery address, and payment
            reference where a configured manual payment method requires one.
          </p>
          <h2>Secure customer access</h2>
          <p>
            Order confirmation, tracking, reviews, and returns use secure credentials. Do not share
            a secure link with someone who should not access the order.
          </p>
          <h2>Operational records</h2>
          <p>
            Maevelle keeps authoritative commerce and audit records according to its operational and
            legal responsibilities.
          </p>
        </article>
      </section>
    </main>
  );
}
