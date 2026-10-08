'use client';

import { useRef, useState } from 'react';
import { CloseIcon, HeartIcon, ZoomInIcon } from '@/components/ui/icons';
import { publicMediaPath } from '@/lib/media/url';

interface MediaAsset {
  readonly id: string;
  readonly altText: string | null;
  readonly isPrimary: boolean;
  readonly variantId: string | null;
  readonly optionValueId: string | null;
}

export interface PdpGalleryProps {
  readonly media: readonly MediaAsset[];
  readonly productTitle: string;
  readonly activeIndex: number;
  readonly onSelect: (index: number) => void;
  readonly wishlisted?: boolean;
  readonly onWishlistToggle?: () => void;
}

export function PdpGallery({
  media,
  productTitle,
  activeIndex,
  onSelect,
  wishlisted = false,
  onWishlistToggle,
}: PdpGalleryProps) {
  const lightboxRef = useRef<HTMLDialogElement>(null);
  const [fading, setFading] = useState(false);

  const current = media[activeIndex];
  const total = media.length;

  function switchTo(index: number) {
    if (index === activeIndex) return;
    setFading(true);
    setTimeout(() => {
      onSelect(index);
      setFading(false);
    }, 150);
  }

  return (
    <section aria-label="Product images" className="w-full flex flex-col bg-[#faf2ee]">
      {/* Hero image */}
      <div className="relative w-full aspect-square overflow-hidden bg-[#f4ece8]">
        {current ? (
          <img
            src={publicMediaPath(current.id, 'pdp')}
            alt={current.altText ?? productTitle}
            width={960}
            height={960}
            className={[
              'w-full h-full object-cover transition-opacity duration-150',
              fading ? 'opacity-40' : 'opacity-100',
            ].join(' ')}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-[#eee7e3]">
            <span className="text-6xl text-[#ddbfc3] font-serif select-none">M</span>
          </div>
        )}

        {/* Curated Atelier Edition badge */}
        <div className="absolute top-4 left-4 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/95 shadow-sm backdrop-blur-md">
          <span className="w-1.5 h-1.5 rounded-full bg-[#9e2a4b] animate-pulse" />
          <span className="text-[11px] font-semibold uppercase tracking-widest text-[#9e2a4b]">
            Curated Atelier Edition
          </span>
        </div>

        {/* Floating pills – wishlist + zoom */}
        <div className="absolute top-4 right-4 flex flex-col gap-2">
          {onWishlistToggle ? (
            <button
              type="button"
              aria-label={wishlisted ? 'Remove from wishlist' : 'Save to wishlist'}
              onClick={onWishlistToggle}
              className="w-10 h-10 rounded-full bg-white/90 backdrop-blur-md shadow-sm flex items-center justify-center text-[#1e1b19] hover:text-[#9e2a4b] active:scale-90 transition-transform duration-150"
            >
              <HeartIcon size={20} filled={wishlisted} className={wishlisted ? 'text-[#9e2a4b]' : ''} />
            </button>
          ) : null}
          <button
            type="button"
            aria-label="Inspect close-up"
            onClick={() => lightboxRef.current?.showModal()}
            className="w-10 h-10 rounded-full bg-white/90 backdrop-blur-md shadow-sm flex items-center justify-center text-[#1e1b19] hover:text-[#9e2a4b] active:scale-90 transition-transform duration-150"
          >
            <ZoomInIcon size={19} />
          </button>
        </div>

        {/* Slide counter */}
        {total > 1 && (
          <div className="absolute bottom-4 right-4 px-2.5 py-1 rounded-full bg-[#33302d]/75 text-[#f7efeb] text-[11px] font-semibold tracking-wide backdrop-blur-sm">
            {activeIndex + 1} / {total}
          </div>
        )}
      </div>

      {/* Thumbnail scroller */}
      {total > 1 && (
        <div className="flex items-center gap-2.5 px-4 py-3 overflow-x-auto no-scrollbar">
          {media.map((asset, index) => (
            <button
              key={asset.id}
              type="button"
              aria-label={`View image ${index + 1}`}
              aria-pressed={activeIndex === index}
              onClick={() => switchTo(index)}
              className={[
                'shrink-0 w-14 h-14 rounded-lg overflow-hidden transition-all duration-200',
                activeIndex === index
                  ? 'ring-2 ring-[#9e2a4b] opacity-100'
                  : 'opacity-70 hover:opacity-100 ring-0',
              ].join(' ')}
            >
              <img
                src={publicMediaPath(asset.id, 'thumbnail')}
                alt=""
                width={96}
                height={96}
                className="w-full h-full object-cover"
              />
            </button>
          ))}
        </div>
      )}

      {/* Lightbox dialog */}
      <dialog
        ref={lightboxRef}
        className="fixed inset-0 m-auto w-full max-w-2xl max-h-screen bg-transparent backdrop:bg-[#1c1917]/70 rounded-xl overflow-hidden shadow-2xl p-0"
        onClick={(e) => {
          if (e.target === e.currentTarget) lightboxRef.current?.close();
        }}
      >
        <div className="relative bg-[#1e1b19] flex items-center justify-center min-h-[50dvh]">
          <button
            type="button"
            aria-label="Close expanded image"
            onClick={() => lightboxRef.current?.close()}
            className="absolute top-3 right-3 z-10 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-colors duration-150"
          >
            <CloseIcon size={20} />
          </button>
          {current ? (
            <img
              src={publicMediaPath(current.id, 'zoom')}
              alt={current.altText ?? productTitle}
              width={1200}
              height={1200}
              className="w-full h-full object-contain max-h-[90dvh]"
            />
          ) : null}
        </div>
      </dialog>
    </section>
  );
}
