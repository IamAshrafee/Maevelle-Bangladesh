import Link from 'next/link';

export function StorefrontHeader() {
  return (
    <header className="site-header">
      <Link className="brand" href="/">
        Maevelle
      </Link>
      <nav aria-label="Primary navigation">
        <Link href="/categories">Categories</Link>
        <Link href="/search">Search</Link>
        <Link href="/cart">Cart</Link>
        <Link href="/orders/track">Track Order</Link>
      </nav>
    </header>
  );
}

export function StorefrontFooter() {
  return (
    <footer className="site-footer">
      <nav aria-label="Policies">
        <Link href="/policies/shipping">Shipping</Link>
        <Link href="/policies/returns">Returns</Link>
        <Link href="/policies/privacy">Privacy</Link>
        <Link href="/policies/terms">Terms</Link>
      </nav>
      <p>Authoritative prices and availability are confirmed by Maevelle at checkout.</p>
    </footer>
  );
}
