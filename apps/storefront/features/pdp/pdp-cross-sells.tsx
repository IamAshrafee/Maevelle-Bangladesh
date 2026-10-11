'use client';

import { ProductCard } from '@/components/commerce/product-card';

export interface CrossSellProduct {
  readonly id: string;
  readonly handle: string;
  readonly title: string;
  readonly price: string;
  readonly currency: string;
  readonly imageUrl: string;
  readonly imageAlt: string;
  readonly badge?: string;
}

export interface PdpCrossSellsProps {
  readonly products?: readonly CrossSellProduct[] | undefined;
  readonly title?: string;
  readonly subtitle?: string;
}

const DEFAULT_ENSEMBLE: readonly CrossSellProduct[] = [
  {
    id: 'ensemble-1',
    handle: 'aurelia-pearl-drops',
    title: 'Aurelia Pearl Drops',
    price: '1650',
    currency: 'BDT',
    imageUrl:
      'https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?auto=format&fit=crop&w=600&q=80',
    imageAlt: 'Baroque freshwater pearl dangling drop earrings with gold filigree',
    badge: 'Editor’s Pick',
  },
  {
    id: 'ensemble-2',
    handle: 'gilded-pearl-pins',
    title: 'Gilded Pearl Pins (Set)',
    price: '720',
    currency: 'BDT',
    imageUrl:
      'https://images.unsplash.com/photo-1588880331179-bc9b93a8cb5e?auto=format&fit=crop&w=600&q=80',
    imageAlt: 'Delicate rose gold hair pins encrusted with petite crystal cluster accents',
    badge: 'Curated Drop',
  },
  {
    id: 'ensemble-3',
    handle: 'french-acetate-oversized-floral-claw-clip',
    title: 'Mulberry Silk Scrunchie',
    price: '850',
    currency: 'BDT',
    imageUrl:
      'https://images.unsplash.com/photo-1606760227091-3dd870d97f1d?auto=format&fit=crop&w=600&q=80',
    imageAlt: 'French plush velvet ribbon hair accessory in dusty rose',
    badge: 'Atelier Favorite',
  },
  {
    id: 'ensemble-4',
    handle: 'monsoon-garden-silk-scarf',
    title: 'Monsoon Garden Silk Scarf',
    price: '2450',
    currency: 'BDT',
    imageUrl:
      'https://images.unsplash.com/photo-1601924994987-69e26d50dc26?auto=format&fit=crop&w=600&q=80',
    imageAlt: 'Fluid pure mulberry silk scarf with hand-painted botanical lotus foliage',
    badge: 'New Season',
  },
  {
    id: 'ensemble-5',
    handle: 'celestial-solitaire-velvet-choker',
    title: 'Celestial Velvet Choker',
    price: '1280',
    currency: 'BDT',
    imageUrl:
      'https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?auto=format&fit=crop&w=600&q=80',
    imageAlt: 'Plush midnight black velvet ribbon with solitaire crystal charm',
    badge: 'Bestseller',
  },
  {
    id: 'ensemble-6',
    handle: 'artisan-filigree-bangle',
    title: 'Artisan Filigree Bangle',
    price: '1950',
    currency: 'BDT',
    imageUrl:
      'https://images.unsplash.com/photo-1611591475152-4c09a1e35d48?auto=format&fit=crop&w=600&q=80',
    imageAlt: 'Intricate 18k gold vermeil filigree cuff bracelet',
    badge: 'Signature',
  },
];

export function PdpCrossSells({
  products,
  title = 'Complete Your Look',
  subtitle = 'Curated Recommendations',
}: PdpCrossSellsProps) {
  const items = products && products.length > 0 ? products : DEFAULT_ENSEMBLE;

  return (
    <section aria-label="Product recommendations" className="w-full pt-8 pb-4 flex flex-col gap-6">
      <div className="text-center flex flex-col gap-1 px-4">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-primary">
          {subtitle}
        </p>
        <h2 className="text-[22px] sm:text-[26px] font-serif font-semibold text-on-surface tracking-tight">
          {title}
        </h2>
      </div>

      {/* Multi-Column Product Cards Grid (4, 5, 6 cards in a row on larger screens) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4 lg:gap-5 w-full">
        {items.map((p) => (
          <ProductCard
            key={p.id}
            id={p.id}
            title={p.title}
            price={p.price}
            imageUrl={p.imageUrl}
            imageAlt={p.imageAlt}
            href={`/products/${p.handle}`}
            badge={p.badge}
            deliveryPill="Dhaka Next-Day"
            variant="auto"
            className="w-full"
          />
        ))}
      </div>
    </section>
  );
}
