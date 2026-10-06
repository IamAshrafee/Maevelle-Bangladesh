'use client';

import Link from 'next/link';

import { cx } from '@/components/ui/classnames';
import { ArrowUpIcon } from '@/components/ui/icons';

export type MobileFooterProps = {
  className?: string | undefined;
  responsive?: boolean | undefined;
  storeName?: string | undefined;
};

export function MobileFooter({
  className,
  responsive = true,
  storeName = 'Maevelle',
}: MobileFooterProps) {
  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <footer
      aria-label="Mobile and tablet site footer"
      className={cx(
        'border-t border-border/30 bg-surface text-on-surface select-none transition-colors duration-150',
        // Phone: 112px bottom padding clears fixed BottomNav (h-16 + safe area).
        // Tablet: 40px bottom padding as BottomNav is hidden (sm:hidden).
        'px-4 pt-6 pb-28 sm:px-6 sm:pt-8 sm:pb-10',
        responsive && 'lg:hidden',
        className,
      )}
    >
      <div className="mx-auto max-w-sm sm:max-w-2xl space-y-6">
        {/* BACK TO TOP TACTILE BUTTON */}
        <div className="flex justify-center">
          <button
            aria-label="Scroll back to top of page"
            className="group inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-surface-container-low px-4 py-1.5 text-[11px] font-label-md font-medium text-on-surface-variant hover:text-primary hover:border-primary/40 active:scale-95 transition-[color,border-color,transform] duration-150 cursor-pointer"
            onClick={scrollToTop}
            type="button"
          >
            <span>Back to top</span>
            <ArrowUpIcon
              className="transition-transform duration-200 ease-out group-hover:-translate-y-0.5"
              size={12}
            />
          </button>
        </div>

        {/* MOBILE VIEW (< 640px): CLEAN MINIMAL ATELIER ESSENCE */}
        <div className="space-y-4 text-center sm:hidden">
          {/* Brand Wordmark */}
          <div className="flex flex-col items-center">
            <Link
              aria-label={`${storeName} Home`}
              className="font-serif text-2xl font-semibold tracking-tight text-primary transition-colors duration-150 hover:text-primary-hover active:scale-98 cursor-pointer"
              href="/"
            >
              {storeName}
            </Link>
            <span className="font-label-sm text-[9px] font-medium tracking-[0.28em] text-on-surface-variant/75 uppercase mt-0.5">
              Dhaka • Atelier
            </span>
            <p className="mt-1.5 text-xs text-on-surface-variant/80 max-w-xs">
              Heirloom jewelry, freshwater pearls, and fine mulberry silk.
            </p>
          </div>

          {/* Touch-Friendly Horizontal Nav Links (comfortable tap targets) */}
          <nav
            aria-label="Mobile footer links"
            className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs font-label-md text-on-surface-variant"
          >
            <Link
              className="px-2 py-1.5 transition-colors duration-150 hover:text-primary active:scale-95"
              href="/orders/track"
            >
              Track Order
            </Link>
            <span aria-hidden="true" className="text-border/60 text-[10px] select-none">•</span>
            <Link
              className="px-2 py-1.5 transition-colors duration-150 hover:text-primary active:scale-95"
              href="/policies/shipping"
            >
              Shipping
            </Link>
            <span aria-hidden="true" className="text-border/60 text-[10px] select-none">•</span>
            <Link
              className="px-2 py-1.5 transition-colors duration-150 hover:text-primary active:scale-95"
              href="/policies/returns"
            >
              Returns
            </Link>
            <span aria-hidden="true" className="text-border/60 text-[10px] select-none">•</span>
            <Link
              className="px-2 py-1.5 transition-colors duration-150 hover:text-primary active:scale-95"
              href="/policies/privacy"
            >
              Privacy
            </Link>
            <span aria-hidden="true" className="text-border/60 text-[10px] select-none">•</span>
            <Link
              className="px-2 py-1.5 transition-colors duration-150 hover:text-primary active:scale-95"
              href="/policies/terms"
            >
              Terms
            </Link>
          </nav>

          {/* Muted Payment Line & Copyright */}
          <div className="space-y-1 pt-1 text-[11px] text-on-surface-variant/70">
            <p>Cash on Delivery • bKash • Nagad • Cards</p>
            <p className="text-[10px] text-on-surface-variant/60 font-label-sm">
              © {new Date().getFullYear()} {storeName} Bangladesh Ltd.
            </p>
          </div>
        </div>

        {/* TABLET VIEW (640px to 1023px, sm: & md:): 3-COLUMN REFINED SPREAD */}
        <div className="hidden sm:grid sm:grid-cols-3 gap-6 text-left pt-2 pb-2">
          {/* Column 1: Brand Essence & Contact */}
          <div className="space-y-2">
            <Link
              aria-label={`${storeName} Home`}
              className="inline-flex flex-col group cursor-pointer"
              href="/"
            >
              <span className="font-serif text-xl font-semibold leading-none text-primary transition-colors duration-150 group-hover:text-primary-hover">
                {storeName}
              </span>
              <span className="font-label-sm text-[9px] font-medium tracking-[0.26em] text-on-surface-variant/75 uppercase mt-1">
                Dhaka • Atelier
              </span>
            </Link>
            <p className="text-xs text-on-surface-variant leading-relaxed">
              Heirloom craft, freshwater pearls &amp; fine mulberry silk.
            </p>
            <p className="text-[11px] text-on-surface-variant font-mono tabular-nums pt-1">
              Tel:{' '}
              <a
                className="text-primary hover:underline"
                href="tel:+8801700623835"
              >
                +880 1700-MAEVELLE
              </a>
            </p>
          </div>

          {/* Column 2: Patron Services */}
          <div className="space-y-2">
            <span className="block font-label-sm text-xs font-bold uppercase tracking-wider text-on-surface">
              Patron Services
            </span>
            <ul className="space-y-1.5 text-xs font-label-md text-on-surface-variant">
              <li>
                <Link
                  className="transition-colors duration-150 hover:text-primary"
                  href="/orders/track"
                >
                  Track Order
                </Link>
              </li>
              <li>
                <Link
                  className="transition-colors duration-150 hover:text-primary"
                  href="/policies/shipping"
                >
                  Dhaka 24h Express
                </Link>
              </li>
              <li>
                <Link
                  className="transition-colors duration-150 hover:text-primary"
                  href="/policies/returns"
                >
                  7-Day Returns
                </Link>
              </li>
              <li>
                <Link
                  className="transition-colors duration-150 hover:text-primary"
                  href="/policies/terms"
                >
                  Care &amp; Authenticity
                </Link>
              </li>
            </ul>
          </div>

          {/* Column 3: Trust & Payments */}
          <div className="space-y-2">
            <span className="block font-label-sm text-xs font-bold uppercase tracking-wider text-on-surface">
              White Glove Trust
            </span>
            <p className="text-xs text-on-surface-variant leading-relaxed">
              Doorstep inspection across all 64 districts in Bangladesh before payment.
            </p>
            <div className="flex flex-wrap gap-1 pt-1 text-[10px]">
              <span className="rounded bg-surface-container px-1.5 py-0.5 text-on-surface-variant">
                COD
              </span>
              <span className="rounded bg-surface-container px-1.5 py-0.5 font-medium text-primary">
                bKash
              </span>
              <span className="rounded bg-surface-container px-1.5 py-0.5 text-on-surface-variant">
                Nagad
              </span>
              <span className="rounded bg-surface-container px-1.5 py-0.5 text-on-surface-variant">
                Cards
              </span>
            </div>
          </div>
        </div>

        {/* TABLET BOTTOM BAR */}
        <div className="hidden sm:flex items-center justify-between border-t border-border/30 pt-4 text-xs text-on-surface-variant/75 font-label-sm">
          <span>© {new Date().getFullYear()} {storeName} Bangladesh Ltd.</span>
          <div className="flex items-center gap-3">
            <Link className="hover:text-primary transition-colors duration-150" href="/policies/privacy">
              Privacy
            </Link>
            <span>•</span>
            <Link className="hover:text-primary transition-colors duration-150" href="/policies/terms">
              Terms
            </Link>
            <span>•</span>
            <span>🇧🇩 Dhaka, BD</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
