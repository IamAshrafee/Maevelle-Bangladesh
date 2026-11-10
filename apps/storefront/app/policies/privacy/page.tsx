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
          <h2>Optional privacy choices</h2>
          <p>
            Analytics and advertising are separate choices. Unknown or declined choices do not
            permit optional measurement. You can save or change your choices below. Essential
            security, shopping and Order support continue when you decline.
          </p>
          <p>
            When you permit analytics, Maevelle can count allowlisted site interactions such as
            opening your bag. These observations are linked to a private preference context so the
            server can enforce your current choice. They do not contain contact details, delivery
            addresses, payment references or Order-access credentials.
          </p>
          <p>
            Signed-in account and browser choices work together; a stricter choice keeps optional
            measurement off. A new browser or account asks for confirmation. Anonymous preferences
            do not automatically carry across devices. Current preference expiry is shown in the
            preference panel.
          </p>
          <p>
            Third-party advertising exports and advanced matching are currently inactive. Saving an
            advertising choice does not activate them. Withdrawal pauses optional collection under
            our control, while necessary Order, payment and audit records remain. A choice change
            does not promise deletion from a system that already received information.
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
