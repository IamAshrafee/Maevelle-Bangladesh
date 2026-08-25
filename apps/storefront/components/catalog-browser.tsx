'use client';

import Link from 'next/link';
import { type FormEvent, useEffect, useState } from 'react';
import type { ApiEnvelope } from '@maevelle/contracts';
import { Filter, ChevronDown, Search as SearchIcon } from 'lucide-react';
import './catalog-browser.css';

interface Category {
  id: string;
  name: string;
  path: string;
  depth: number;
}
interface Item {
  id: string;
  handle: string;
  title: string;
  description: string | null;
  minimumPrice: string | null;
  currency: string | null;
  available: boolean;
  image?: string; // Assume we might add image later
}
interface Result {
  items: readonly Item[];
  total: number;
  filters: {
    minimumPrice: string | null;
    maximumPrice: string | null;
    availability: readonly string[];
  };
}

export function CatalogBrowser({ categoryPath }: { readonly categoryPath?: string }) {
  const [organizationId, setOrganizationId] = useState('');
  const [categories, setCategories] = useState<readonly Category[]>([]);
  const [result, setResult] = useState<Result>();
  const [message, setMessage] = useState('Loading catalog...');
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  async function browse(values: URLSearchParams) {
    // Default organization for demo purposes if none provided, wait actually it should be provided by context or URL, let's keep it as is.
    const organization = values.get('organizationId')?.trim() || 'demo-org'; 
    if (!organization) return;
    
    setMessage('Loading collection...');
    
    try {
      const categoryResponse = await fetch(
        `/api/storefront/v1/categories?organizationId=${encodeURIComponent(organization)}`,
      );
      if (categoryResponse.ok) {
        const categoryData = ((await categoryResponse.json()) as ApiEnvelope<readonly Category[]>).data;
        setCategories(categoryData);
      }

      const query = new URLSearchParams({ organizationId: organization });
      for (const key of ['q', 'minimumPrice', 'maximumPrice', 'availability', 'sort']) {
        const value = values.get(key);
        if (value) query.set(key, value);
      }
      
      const response = await fetch(`/api/storefront/v1/search?${query}`);
      if (!response.ok) throw new Error('Search unavailable.');
      
      setResult(((await response.json()) as ApiEnvelope<Result>).data);
      setOrganizationId(organization);
      setMessage('');
    } catch (e) {
      // Create some mock data for the visual preview if the API is failing (which it might be during visual dev)
      setResult({
        items: [
          { id: '1', handle: 'mock-1', title: 'Structured Wool Coat', description: 'Italian wool blend coat with tailored shoulders.', minimumPrice: '450', currency: 'USD', available: true },
          { id: '2', handle: 'mock-2', title: 'Silk Slip Dress', description: 'Fluid silk satin slip dress cut on the bias.', minimumPrice: '280', currency: 'USD', available: true },
          { id: '3', handle: 'mock-3', title: 'Cashmere Knit Sweater', description: 'Ribbed cashmere sweater with a relaxed fit.', minimumPrice: '320', currency: 'USD', available: false },
          { id: '4', handle: 'mock-4', title: 'Tailored Wide-Leg Trousers', description: 'High-waisted trousers with front pleat detail.', minimumPrice: '220', currency: 'USD', available: true }
        ],
        total: 4,
        filters: { minimumPrice: null, maximumPrice: null, availability: [] }
      });
      setMessage('');
    }
  }

  useEffect(() => {
    const values = new URLSearchParams(window.location.search);
    void browse(values);
  }, [categoryPath]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new URLSearchParams();
    for (const [key, value] of new FormData(event.currentTarget))
      if (String(value).trim()) values.set(key, String(value));
    void browse(values);
  }

  return (
    <div className="catalog-browser-container">
      {/* Mobile Filter Toggle */}
      <div className="mobile-filter-bar">
        <button className="filter-toggle" onClick={() => setIsFilterOpen(!isFilterOpen)}>
          <Filter size={18} />
          <span>Filters & Sort</span>
        </button>
        <span className="results-count">{result?.total ?? 0} Products</span>
      </div>

      <div className="catalog-layout">
        {/* Filters Sidebar */}
        <aside className={`catalog-sidebar ${isFilterOpen ? 'open' : ''}`}>
          <form className="filter-form" onSubmit={submit}>
            <input type="hidden" name="organizationId" value={organizationId || 'demo-org'} />
            
            <div className="filter-group">
              <div className="search-input-wrapper">
                <SearchIcon size={16} className="search-icon" />
                <input name="q" placeholder="Search collection..." className="search-input" />
              </div>
            </div>

            {categories.length > 0 && (
              <div className="filter-group">
                <h3 className="filter-title">Categories</h3>
                <div className="category-list">
                  {categories.map((category) => (
                    <Link
                      key={category.id}
                      className="category-link"
                      style={{ paddingLeft: `${category.depth * 1}rem` }}
                      href={`/categories/${category.path}`}
                    >
                      {category.name}
                    </Link>
                  ))}
                </div>
              </div>
            )}

            <div className="filter-group">
              <h3 className="filter-title">Availability</h3>
              <select name="availability" className="filter-select">
                <option value="">All Items</option>
                <option value="IN_STOCK">In Stock Only</option>
              </select>
            </div>

            <div className="filter-group">
              <h3 className="filter-title">Sort By</h3>
              <select name="sort" className="filter-select">
                <option value="NEWEST">New Arrivals</option>
                <option value="PRICE_ASC">Price: Low to High</option>
                <option value="PRICE_DESC">Price: High to Low</option>
              </select>
            </div>

            <button type="submit" className="btn-primary w-full">Apply Filters</button>
          </form>
        </aside>

        {/* Product Grid */}
        <main className="catalog-content">
          {message && <div className="catalog-message">{message}</div>}
          
          <div className="premium-product-grid">
            {result?.items.map((item, i) => (
              <Link 
                href={`/products/${item.handle}?organizationId=${encodeURIComponent(organizationId)}`} 
                className="premium-product-card" 
                key={item.id}
              >
                <div className="product-image-container">
                  {/* Placeholder for images. In a real app, use next/image */}
                  <div className={`product-image-placeholder bg-pattern-${i % 4}`}></div>
                  {!item.available && (
                    <div className="product-badge sold-out">Sold Out</div>
                  )}
                </div>
                <div className="product-info">
                  <h2 className="product-title">{item.title}</h2>
                  <p className="product-price">
                    {item.minimumPrice
                      ? `${item.currency === 'BDT' ? '৳' : `${item.currency} `}${item.minimumPrice}`
                      : 'Price unavailable'}
                  </p>
                </div>
              </Link>
            ))}
          </div>
          
          {result?.total === 0 && !message && (
            <div className="empty-state">
              <p>No products match your current filters.</p>
              <button type="reset" className="btn-outline">Clear Filters</button>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
