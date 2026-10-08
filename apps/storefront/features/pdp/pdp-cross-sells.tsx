'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRightIcon } from '@/components/ui/icons';
import { formatTaka } from './pdp-money';

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
}

const DEFAULT_ENSEMBLE: readonly CrossSellProduct[] = [
  {
    id: 'ensemble-1',
    handle: 'aurelia-pearl-drops',
    title: 'Aurelia Pearl Drops',
    price: '1650',
    currency: 'BDT',
    imageUrl:
      'https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?auto=format&fit=crop&w=400&q=80',
    imageAlt: 'Baroque freshwater pearl dangling drop earrings with gold filigree',
    badge: 'Earrings',
  },
  {
    id: 'ensemble-2',
    handle: 'gilded-pearl-pins',
    title: 'Gilded Pearl Pins (Set)',
    price: '720',
    currency: 'BDT',
    imageUrl:
      'https://images.unsplash.com/photo-1588880331179-bc9b93a8cb5e?auto=format&fit=crop&w=400&q=80',
    imageAlt: 'Delicate rose gold hair pins encrusted with petite crystal cluster accents',
    badge: 'Pins',
  },
  {
    id: 'ensemble-3',
    handle: 'french-acetate-oversized-floral-claw-clip',
    title: 'Mulberry Silk Ribbon Scrunchie',
    price: '850',
    currency: 'BDT',
    imageUrl:
      'https://images.unsplash.com/photo-1606760227091-3dd870d97f1d?auto=format&fit=crop&w=400&q=80',
    imageAlt: 'French plush velvet ribbon hair accessory in dusty rose',
    badge: 'Atelier',
  },
];

export function PdpCrossSells({ products }: PdpCrossSellsProps) {
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});
  const items = products && products.length > 0 ? products : DEFAULT_ENSEMBLE;

  return (
    <section className="pt-6 flex flex-col gap-3">
      <div className="px-4 flex items-center justify-between">
        <h2 className="text-[18px] font-semibold text-on-surface">Pairs Elegantly With</h2>
        <span className="text-[11px] font-semibold text-outline">Curated Ensemble</span>
      </div>
      <div className="flex items-stretch gap-3 px-4 overflow-x-auto no-scrollbar pb-2">
        {items.map((p) => {
          const isFailed = Boolean(failedImages[p.id]) || !p.imageUrl;
          return (
            <div
              key={p.id}
              className="shrink-0 w-44 rounded-xl bg-surface-container-lowest shadow-sm overflow-hidden flex flex-col border border-border/40"
            >
              <Link href={`/products/${p.handle}`} className="block">
                <div className="w-full aspect-square bg-surface-container-high relative overflow-hidden">
                  {!isFailed ? (
                    <img
                      src={p.imageUrl}
                      alt={p.imageAlt}
                      className="w-full h-full object-cover"
                      onError={() => setFailedImages((prev) => ({ ...prev, [p.id]: true }))}
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center bg-surface-container-low text-primary p-2">
                      <span className="text-2xl font-serif font-bold">M</span>
                      <span className="text-[10px] text-outline text-center mt-1 uppercase tracking-wider">
                        Atelier
                      </span>
                    </div>
                  )}
                  {p.badge && (
                    <span className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-surface-bright/90 backdrop-blur-xs text-[10px] font-semibold text-primary">
                      {p.badge}
                    </span>
                  )}
                </div>
              </Link>
              <div className="p-3 flex flex-col gap-1 flex-1">
                <h3 className="text-[13px] font-semibold text-on-surface truncate">{p.title}</h3>
                <span className="text-[15px] font-bold text-on-surface tabular-nums">
                  {formatTaka(p.price, p.currency)}
                </span>
                <Link
                  href={`/products/${p.handle}`}
                  className="mt-1 w-full py-1.5 rounded-lg bg-surface-container-low hover:bg-surface-container-high text-primary text-[11px] font-semibold text-center transition-colors duration-150 flex items-center justify-center gap-1 no-underline"
                >
                  <span>View Piece</span>
                  <ArrowRightIcon size={12} />
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
