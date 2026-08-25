import Link from 'next/link';
import { CatalogBrowser } from '@/components/catalog-browser';
import './home.css';

export default function StorefrontHomePage() {
  return (
    <main className="home-main">
      {/* Hero Section */}
      <section className="hero-section">
        <div className="hero-background"></div>
        <div className="container hero-content animate-fade-in">
          <p className="hero-eyebrow">Autumn/Winter 2026</p>
          <h1 className="hero-title">The Art of<br/>Restraint</h1>
          <p className="hero-subtitle">
            Minimalist silhouettes designed for everyday elegance. Discover the new collection.
          </p>
          <div className="hero-actions">
            <Link className="btn-primary hero-btn" href="/search">
              Shop the Collection
            </Link>
            <Link className="btn-outline hero-btn" href="/collections/editorial">
              View Editorial
            </Link>
          </div>
        </div>
      </section>

      {/* Featured Categories */}
      <section className="categories-section container">
        <div className="category-card category-ready-to-wear">
          <div className="category-content">
            <h2>Ready to Wear</h2>
            <Link href="/collections/ready-to-wear" className="category-link">Explore →</Link>
          </div>
        </div>
        <div className="category-card category-accessories">
          <div className="category-content">
            <h2>Accessories</h2>
            <Link href="/collections/accessories" className="category-link">Explore →</Link>
          </div>
        </div>
        <div className="category-card category-new">
          <div className="category-content">
            <h2>New Arrivals</h2>
            <Link href="/collections/new" className="category-link">Explore →</Link>
          </div>
        </div>
      </section>

      {/* Featured Products */}
      <section className="featured-section container">
        <div className="section-header">
          <h2 className="section-title">Curated Essentials</h2>
          <Link href="/search" className="section-link">View All Products</Link>
        </div>
        <CatalogBrowser />
      </section>
      
      {/* Brand Values */}
      <section className="values-section">
        <div className="container values-grid">
          <div className="value-card">
            <h3>Timeless Design</h3>
            <p>Pieces crafted to transcend seasonal trends, forming the foundation of a lasting wardrobe.</p>
          </div>
          <div className="value-card">
            <h3>Exceptional Quality</h3>
            <p>Sourced from the finest materials and constructed with meticulous attention to detail.</p>
          </div>
          <div className="value-card">
            <h3>Sustainable Practice</h3>
            <p>Committed to ethical production and minimizing our environmental footprint at every step.</p>
          </div>
        </div>
      </section>
    </main>
  );
}
