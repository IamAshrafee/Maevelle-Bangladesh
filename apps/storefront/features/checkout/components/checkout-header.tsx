'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { ArrowLeftIcon, LockIcon, ShieldCheckIcon } from '@/components/ui/icons';

export interface CheckoutHeaderProps {
  readonly isDesktop?: boolean | undefined;
  readonly onBack?: (() => void) | undefined;
  readonly title?: string | undefined;
}

export function CheckoutHeader({ isDesktop = false, onBack, title }: CheckoutHeaderProps) {
  const router = useRouter();

  const handleBack = () => {
    if (onBack) {
      onBack();
      return;
    }
    if (window.history.length > 1) {
      router.back();
    } else {
      router.push('/cart');
    }
  };

  const defaultTitle = isDesktop ? 'Secure Express Checkout' : 'Shipping Address';
  const displayTitle = title ?? defaultTitle;

  return (
    <header className="sticky top-0 z-50 w-full bg-surface/85 backdrop-blur-xl border-b border-border-subtle shadow-[0_1px_8px_rgba(158,42,75,0.04)]">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Left Side: Back action & Brand Identity */}
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            aria-label="Back"
            className="-ml-2 flex h-11 w-11 items-center justify-center rounded-full text-on-surface hover:text-primary transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
            onClick={handleBack}
            type="button"
          >
            <ArrowLeftIcon size={22} />
          </button>

          {/* Maevelle Atelier Brand Mark */}
          <Link
            className="flex items-center gap-2.5 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 rounded-lg p-1"
            href="/"
          >
            <div className="flex size-8 items-center justify-center rounded-full bg-primary text-on-primary font-serif font-bold text-sm tracking-tighter shadow-xs group-hover:scale-105 transition-transform duration-150">
              M
            </div>
            <div className="flex flex-col justify-center">
              <span className="font-sans text-[10px] font-bold uppercase tracking-widest text-secondary leading-none">
                Maevelle BD
              </span>
              <h1 className="font-serif text-base font-semibold tracking-tight text-on-surface leading-tight">
                {displayTitle}
              </h1>
            </div>
          </Link>
        </div>

        {/* Center / Desktop Breadcrumbs */}
        {isDesktop ? (
          <nav aria-label="Checkout steps breadcrumb" className="hidden md:flex items-center gap-2 text-xs font-medium text-on-surface-variant">
            <Link className="hover:text-primary transition-colors" href="/cart">
              Shopping Bag
            </Link>
            <span className="text-outline-variant">/</span>
            <span className="text-primary font-semibold">Express Checkout</span>
            <span className="text-outline-variant">/</span>
            <span className="text-outline">Order Confirmation</span>
          </nav>
        ) : null}

        {/* Right Side: Trust & Security Indicators */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* SSL Badge */}
          <div className="flex items-center gap-1.5 rounded-full bg-surface-container-low px-2.5 py-1 text-on-surface-variant border border-border-subtle">
            <LockIcon className="text-primary" size={13} />
            <span className="text-[11px] font-semibold tracking-tight text-on-surface-variant">
              256-Bit SSL Secured
            </span>
          </div>

          {/* Concierge Hotline */}
          <div className="hidden sm:flex items-center gap-1 text-[11px] font-medium text-on-surface-variant">
            <span>Concierge:</span>
            <a
              className="font-semibold text-primary hover:underline"
              href="https://wa.me/8801894623835"
              rel="noreferrer"
              target="_blank"
            >
              +880 1894-MAEVELLE
            </a>
          </div>
        </div>
      </div>
    </header>
  );
}
