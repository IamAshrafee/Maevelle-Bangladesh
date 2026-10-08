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
    <section aria-label="Product images" className="w-full flex flex-col bg-surface-container-low">
      {/* Hero image container */}
      <div className="relative w-full aspect-square overflow-hidden bg-surface-container">
        {current ? (
          <>
            <img
              key={current.id}
              src={publicMediaPath(current.id, 'pdp')}
              alt=""
              width={960}
              height={960}
              onError={(e) => {
                e.currentTarget.style.display = 'none';
                const fallback = e.currentTarget.parentElement?.querySelector('[data-gallery-fallback]');
                if (fallback) (fallback as HTMLElement).style.display = 'flex';
              }}
              className={[
                'w-full h-full object-cover transition-opacity duration-150',
                fading ? 'opacity-40' : 'opacity-100',
              ].join(' ')}
            />
            <div
              data-gallery-fallback
              className="w-full h-full hidden flex-col items-center justify-center bg-gradient-to-br from-[#faf2ee] to-[#eee7e3] text-center p-6 select-none"
            >
              <div className="w-20 h-20 rounded-full bg-white/80 shadow-xs flex items-center justify-center mb-3">
                <span className="text-4xl text-primary font-serif font-semibold">M</span>
              </div>
              <p className="text-[15px] font-serif font-semibold text-on-surface max-w-xs line-clamp-2 px-4 leading-snug">
                {productTitle}
              </p>
              <span className="text-[11px] font-semibold text-outline uppercase tracking-widest mt-1.5">
                Maevelle Atelier Edition
              </span>
            </div>
          </>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-[#faf2ee] to-[#eee7e3] text-center p-6 select-none">
            <div className="w-20 h-20 rounded-full bg-white/80 shadow-xs flex items-center justify-center mb-3">
              <span className="text-4xl text-primary font-serif font-semibold">M</span>
            </div>
            <p className="text-[15px] font-serif font-semibold text-on-surface max-w-xs line-clamp-2 px-4 leading-snug">
              {productTitle}
            </p>
            <span className="text-[11px] font-semibold text-outline uppercase tracking-widest mt-1.5">
              Maevelle Atelier Edition
            </span>
          </div>
        )}

        {/* Curated Atelier Edition badge */}
        <div className="absolute top-4 left-4 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface-bright/95 shadow-sm backdrop-blur-md pointer-events-none">
          <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
          <span className="text-[11px] font-semibold uppercase tracking-widest text-primary">
            Curated Atelier Edition
          </span>
        </div>

        {/* Floating pills – wishlist + zoom */}
        <div className="absolute top-4 right-4 flex flex-col gap-2 z-10">
          {onWishlistToggle ? (
            <button
              type="button"
              aria-label={wishlisted ? 'Remove from wishlist' : 'Save to wishlist'}
              onClick={onWishlistToggle}
              className="w-10 h-10 rounded-full bg-surface-bright/90 backdrop-blur-md shadow-sm flex items-center justify-center text-on-surface hover:text-primary active:scale-90 transition-transform duration-150 border-0 cursor-pointer"
            >
              <HeartIcon size={20} filled={wishlisted} className={wishlisted ? 'text-primary' : ''} />
            </button>
          ) : null}
          <button
            type="button"
            aria-label="Inspect close-up"
            onClick={() => lightboxRef.current?.showModal()}
            className="w-10 h-10 rounded-full bg-surface-bright/90 backdrop-blur-md shadow-sm flex items-center justify-center text-on-surface hover:text-primary active:scale-90 transition-transform duration-150 border-0 cursor-pointer"
          >
            <ZoomInIcon size={19} />
          </button>
        </div>

        {/* Slide counter */}
        {total > 1 && (
          <div className="absolute bottom-4 right-4 px-2.5 py-1 rounded-full bg-inverse-surface/75 text-inverse-on-surface text-[11px] font-semibold tracking-wide backdrop-blur-sm pointer-events-none">
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
                'relative shrink-0 w-14 h-14 rounded-lg overflow-hidden transition-all duration-200 border-0 p-0 cursor-pointer bg-surface-container-high',
                activeIndex === index
                  ? 'ring-2 ring-primary opacity-100'
                  : 'opacity-70 hover:opacity-100 ring-0',
              ].join(' ')}
            >
              <img
                src={publicMediaPath(asset.id, 'thumbnail')}
                alt=""
                width={96}
                height={96}
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                  const fallback = e.currentTarget.parentElement?.querySelector('[data-thumb-fallback]');
                  if (fallback) (fallback as HTMLElement).style.display = 'flex';
                }}
                className="w-full h-full object-cover"
              />
              <div
                data-thumb-fallback
                className="w-full h-full hidden items-center justify-center bg-surface-container-high text-primary font-serif font-bold text-sm"
              >
                M
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Lightbox dialog */}
      <dialog
        ref={lightboxRef}
        className="fixed inset-0 m-auto w-full max-w-2xl max-h-screen bg-transparent backdrop:bg-inverse-surface/80 rounded-xl overflow-hidden shadow-2xl p-0"
        onClick={(e) => {
          if (e.target === e.currentTarget) lightboxRef.current?.close();
        }}
      >
        <div className="relative bg-inverse-surface flex items-center justify-center min-h-[50dvh]">
          <button
            type="button"
            aria-label="Close expanded image"
            onClick={() => lightboxRef.current?.close()}
            className="absolute top-3 right-3 z-10 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-colors duration-150 border-0 cursor-pointer"
          >
            <CloseIcon size={20} />
          </button>
          {current ? (
            <>
              <img
                src={publicMediaPath(current.id, 'zoom')}
                alt=""
                width={1200}
                height={1200}
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                  const fallback = e.currentTarget.parentElement?.querySelector('[data-lightbox-fallback]');
                  if (fallback) (fallback as HTMLElement).style.display = 'flex';
                }}
                className="w-full h-full object-contain max-h-[90dvh]"
              />
              <div
                data-lightbox-fallback
                className="p-12 text-center text-inverse-on-surface hidden flex-col items-center justify-center"
              >
                <span className="text-5xl font-serif text-primary-fixed mb-3 block">M</span>
                <p className="text-base font-semibold">{productTitle}</p>
              </div>
            </>
          ) : (
            <div className="p-12 text-center text-inverse-on-surface">
              <span className="text-5xl font-serif text-primary-fixed mb-3 block">M</span>
              <p className="text-base font-semibold">{productTitle}</p>
            </div>
          )}
        </div>
      </dialog>
    </section>
  );
}
