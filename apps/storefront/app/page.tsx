import Link from 'next/link';
import { CatalogBrowser } from '@/components/catalog-browser';

export default function StorefrontHomePage() {
  return (
    <main>
      <section className="home-hero">
        <div className="home-hero-copy">
          <p className="eyebrow">The Maevelle edit</p>
          <h1>Pieces that feel like you, only more considered.</h1>
          <p>
            Discover versatile fashion with clear fit guidance, honest availability, and a checkout
            designed for Bangladesh.
          </p>
          <div className="hero-actions">
            <Link className="button-link" href="/categories">
              Shop the collection
            </Link>
            <Link className="text-link" href="/search?sort=NEWEST">
              See what is new <span aria-hidden="true">→</span>
            </Link>
          </div>
        </div>
        <div className="hero-art" aria-hidden="true">
          <span>Maevelle</span>
          <small>New season / everyday ease</small>
        </div>
      </section>
      <section className="trust-strip" aria-label="Why shop Maevelle">
        <div>
          <strong>Fit made clearer</strong>
          <span>Product-specific size guides</span>
        </div>
        <div>
          <strong>Secure guest checkout</strong>
          <span>No account required</span>
        </div>
        <div>
          <strong>Order visibility</strong>
          <span>Track every meaningful step</span>
        </div>
      </section>
      <section className="home-section shell wide">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Just in</p>
            <h2>New arrivals</h2>
          </div>
          <Link href="/search?sort=NEWEST">
            View all <span aria-hidden="true">→</span>
          </Link>
        </div>
        <CatalogBrowser featured />
      </section>
      <section className="editorial-split">
        <div className="editorial-art" aria-hidden="true">
          <span>01</span>
        </div>
        <div>
          <p className="eyebrow">Designed for real wardrobes</p>
          <h2>Choose the piece, then make the fit yours.</h2>
          <p>
            Explore colors, canonical size combinations, product measurements, and verified customer
            feedback before you commit.
          </p>
          <Link className="button-link dark" href="/categories">
            Explore every category
          </Link>
        </div>
      </section>
      <section className="home-section shell wide centered">
        <p className="eyebrow">Confidence at every step</p>
        <h2>From first look to delivery</h2>
        <p className="section-intro">
          Authoritative price and stock checks, practical payment choices, and secure tracking keep
          the whole journey clear.
        </p>
        <div className="journey-grid">
          <article>
            <span>01</span>
            <h3>Discover</h3>
            <p>
              Search by product, SKU, or category and narrow the collection to what is actually
              available.
            </p>
          </article>
          <article>
            <span>02</span>
            <h3>Choose</h3>
            <p>
              See real variants, fit information, pricing, and customer reviews in one considered
              product view.
            </p>
          </article>
          <article>
            <span>03</span>
            <h3>Order</h3>
            <p>
              Check out as a guest with COD or configured manual mobile payment, then track
              securely.
            </p>
          </article>
        </div>
      </section>
    </main>
  );
}
