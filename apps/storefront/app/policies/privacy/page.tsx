import { PrivacyChoices } from '@/components/layout/privacy-choices';

export const metadata = { title: 'Privacy', alternates: { canonical: '/policies/privacy' } };

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
          <h2>Optional analytics</h2>
          <p>
            If you allow analytics, Maevelle counts interactions such as opening your bag or
            attempting to add an item. Bag observations record the type of interaction and
            whether you were using a guest or account bag. They carry no account or bag identifier,
            product selection, or coupon code. You can change your choice at any time.
          </p>
          <PrivacyChoices />
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
