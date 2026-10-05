import Link from 'next/link';

export function StorefrontFooter() {
  return (
    <footer className="site-footer">
      <div>
        <div className="footer-brand">
          <strong>Maevelle</strong>
          <p>Considered fashion, authoritative pricing, and a secure checkout experience.</p>
        </div>
        <nav aria-label="Customer care">
          <strong>Customer care</strong>
          <Link href="/orders/track">Track your order</Link>
          <Link href="/policies/shipping">Shipping</Link>
          <Link href="/policies/returns">Returns</Link>
        </nav>
        <nav aria-label="Legal">
          <strong>Information</strong>
          <Link href="/policies/privacy">Privacy</Link>
          <Link href="/policies/terms">Terms</Link>
          <Link href="/reviews/submit">Write a review</Link>
        </nav>
      </div>
      <p className="footer-note">
        © {new Date().getFullYear()} Maevelle Bangladesh. Prices and availability are confirmed at
        checkout.
      </p>
    </footer>
  );
}
