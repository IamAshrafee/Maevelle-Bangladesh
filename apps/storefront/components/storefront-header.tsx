'use client';

import Link from 'next/link';
import { ShoppingBag, Search, User, Menu } from 'lucide-react';
import { useState, useEffect } from 'react';
import './header.css';

export function StorefrontHeader() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <header className={`site-header glass ${scrolled ? 'scrolled' : ''}`}>
      <div className="header-container container">
        <div className="header-left">
          <button className="menu-btn" aria-label="Menu">
            <Menu size={24} />
          </button>
          <Link className="brand" href="/">
            MAEVELLE
          </Link>
        </div>

        <nav aria-label="Primary navigation" className="desktop-nav">
          <Link href="/collections/new">New Arrivals</Link>
          <Link href="/collections/ready-to-wear">Ready to Wear</Link>
          <Link href="/collections/accessories">Accessories</Link>
          <Link href="/editorial">Editorial</Link>
        </nav>

        <div className="header-right">
          <Link href="/search" aria-label="Search">
            <Search size={20} />
          </Link>
          <Link href="/account" aria-label="Account">
            <User size={20} />
          </Link>
          <Link href="/cart" aria-label="Cart" className="cart-link">
            <ShoppingBag size={20} />
            <span className="cart-badge">0</span>
          </Link>
        </div>
      </div>
    </header>
  );
}

export function StorefrontFooter() {
  return (
    <footer className="site-footer">
      <div className="footer-container container">
        <div className="footer-grid">
          <div className="footer-brand">
            <Link className="brand" href="/">MAEVELLE</Link>
            <p>Elevating everyday essentials into extraordinary experiences.</p>
          </div>
          
          <div className="footer-links">
            <h3>Shop</h3>
            <Link href="/collections/new">New In</Link>
            <Link href="/collections/ready-to-wear">Ready to Wear</Link>
            <Link href="/collections/accessories">Accessories</Link>
            <Link href="/gift-cards">Gift Cards</Link>
          </div>

          <div className="footer-links">
            <h3>Support</h3>
            <Link href="/policies/shipping">Shipping & Delivery</Link>
            <Link href="/policies/returns">Returns & Exchanges</Link>
            <Link href="/contact">Contact Us</Link>
            <Link href="/faq">FAQ</Link>
          </div>

          <div className="footer-links">
            <h3>Legal</h3>
            <Link href="/policies/privacy">Privacy Policy</Link>
            <Link href="/policies/terms">Terms of Service</Link>
          </div>
        </div>
        
        <div className="footer-bottom">
          <p>&copy; {new Date().getFullYear()} Maevelle. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
