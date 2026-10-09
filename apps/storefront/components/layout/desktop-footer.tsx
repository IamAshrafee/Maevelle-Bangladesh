'use client';

import Link from 'next/link';
import { type FormEvent, useState } from 'react';

import { cx } from '@/components/ui/classnames';
import { ArrowRightIcon, ArrowUpIcon, CheckIcon } from '@/components/ui/icons';

export type DesktopFooterProps = {
  className?: string | undefined;
  responsive?: boolean | undefined;
  storeName?: string | undefined;
};

export function DesktopFooter({
  className,
  responsive = true,
  storeName = 'Maevelle',
}: DesktopFooterProps) {
  const [email, setEmail] = useState('');
  const [subscribed, setSubscribed] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubscribe = (e: FormEvent) => {
    e.preventDefault();
    if (!email.trim() || isSubmitting) return;

    setIsSubmitting(true);
    // Simulate brief luxury response transition
    setTimeout(() => {
      setIsSubmitting(false);
      setSubscribed(true);
      setEmail('');
    }, 400);
  };

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <footer
      aria-label="Desktop site footer"
      className={cx(
        'border-t border-border/40 bg-surface text-on-surface transition-colors duration-150',
        responsive && 'hidden lg:block',
        className,
      )}
    >
      <div className="mx-auto max-w-7xl px-6 lg:px-8 pt-16 pb-12">
        {/* UPPER ROW: BRAND ESSENCE & MINIMAL ATELIER NEWSLETTER */}
        <div className="flex flex-col lg:flex-row items-start justify-between gap-10 pb-14 border-b border-border/30">
          {/* Brand Intro */}
          <div className="max-w-md space-y-2.5">
            <Link
              aria-label={`${storeName} Home`}
              className="inline-flex flex-col group select-none cursor-pointer"
              href="/"
            >
              <span className="font-serif text-2xl font-semibold leading-none tracking-tight text-primary transition-colors duration-150 group-hover:text-primary-hover">
                {storeName}
              </span>
              <span className="font-label-sm text-[9.5px] font-medium tracking-[0.28em] text-on-surface-variant/75 uppercase mt-1">
                Bangladesh
              </span>
            </Link>
            <p className="text-body-sm text-xs leading-relaxed text-on-surface-variant">
              Heirloom jewelry, freshwater pearls, and fine mulberry silk handcrafted with contemporary South Asian editorial grace.
            </p>
          </div>

          {/* Minimal Newsletter (Single clean line, zero clutter) */}
          <div className="w-full max-w-sm space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-label-sm text-xs font-semibold uppercase tracking-wider text-on-surface">
                Maevelle Dispatches
              </span>
              <span className="text-[11px] text-on-surface-variant/70 font-mono">
                Curated &amp; Private
              </span>
            </div>
            <p className="text-body-sm text-xs text-on-surface-variant">
              Invitations to new drops, care guides, and seasonal previews.
            </p>

            {subscribed ? (
              <div className="flex items-center gap-2 py-2 text-xs font-medium text-primary animate-in fade-in duration-200">
                <CheckIcon size={14} />
                <span>Thank you. Your invitation has been noted.</span>
              </div>
            ) : (
              <form className="relative flex items-center pt-1" onSubmit={handleSubscribe}>
                <input
                  aria-label="Email address for newsletter"
                  className="h-10 w-full border-b border-border bg-transparent pr-20 text-xs text-on-surface placeholder:text-on-surface-variant/50 transition-[border-color,box-shadow] duration-200 focus:border-primary focus:ring-1 focus:ring-primary/20 focus:outline-none"
                  disabled={isSubmitting}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email address…"
                  required
                  type="email"
                  value={email}
                />
                <button
                  aria-label="Subscribe to newsletter"
                  className="group absolute right-0 flex items-center gap-1 font-label-md text-xs font-semibold text-primary hover:text-primary-hover active:scale-95 transition-[color,transform] duration-150 disabled:opacity-50 cursor-pointer"
                  disabled={isSubmitting}
                  type="submit"
                >
                  <span>{isSubmitting ? 'Joining…' : 'Join'}</span>
                  <ArrowRightIcon className="transition-transform duration-150 group-hover:translate-x-0.5" size={13} />
                </button>
              </form>
            )}
          </div>
        </div>

        {/* MIDDLE ROW: 3 SPACIOUS MINIMAL LINK GROUPS */}
        <div className="grid grid-cols-12 gap-8 py-12">
          {/* Column 1: Collections */}
          <div className="col-span-4 space-y-3">
            <span className="block font-label-sm text-xs font-bold uppercase tracking-wider text-on-surface">
              Collections
            </span>
            <ul className="space-y-2 text-xs font-label-md text-on-surface-variant">
              <li>
                <Link className="transition-colors duration-150 hover:text-primary" href="/categories/fine-jewelry">
                  Freshwater Pearl Jewelry
                </Link>
              </li>
              <li>
                <Link className="transition-colors duration-150 hover:text-primary" href="/categories/fine-jewelry">
                  18K Micro-Gold Vermeil
                </Link>
              </li>
              <li>
                <Link className="transition-colors duration-150 hover:text-primary" href="/categories/silk-scarves">
                  Mulberry Silk Scarves
                </Link>
              </li>
              <li>
                <Link className="transition-colors duration-150 hover:text-primary" href="/categories/hair-accents">
                  Plush Velvet Hair Ribbons
                </Link>
              </li>
              <li>
                <Link className="transition-colors duration-150 hover:text-primary" href="/categories/handbags">
                  Travertine &amp; Crossbody Bags
                </Link>
              </li>
            </ul>
          </div>

          {/* Column 2: Patron Services */}
          <div className="col-span-4 space-y-3">
            <span className="block font-label-sm text-xs font-bold uppercase tracking-wider text-on-surface">
              Patron Services
            </span>
            <ul className="space-y-2 text-xs font-label-md text-on-surface-variant">
              <li>
                <Link className="transition-colors duration-150 hover:text-primary" href="/orders/track">
                  Track Your Order
                </Link>
              </li>
              <li>
                <Link className="transition-colors duration-150 hover:text-primary" href="/policies/shipping">
                  Dhaka 24-Hour Express Shipping
                </Link>
              </li>
              <li>
                <Link className="transition-colors duration-150 hover:text-primary" href="/policies/returns">
                  7-Day Returns &amp; Exchanges
                </Link>
              </li>
              <li>
                <Link className="transition-colors duration-150 hover:text-primary" href="/policies/terms">
                  Care Guide &amp; Authenticity
                </Link>
              </li>
              <li>
                <Link className="transition-colors duration-150 hover:text-primary" href="/reviews/submit">
                  Write a Review
                </Link>
              </li>
            </ul>
          </div>

          {/* Column 3: Customer Care & Boutique */}
          <div className="col-span-4 space-y-3">
            <span className="block font-label-sm text-xs font-bold uppercase tracking-wider text-on-surface">
              Customer Care
            </span>
            <div className="space-y-2 text-xs leading-relaxed text-on-surface-variant font-label-md">
              <p>
                <strong className="text-on-surface font-semibold">Online Boutique:</strong> 100% Online E-commerce Store
              </p>
              <p>
                <strong className="text-on-surface font-semibold">Client Concierge:</strong>{' '}
                <a
                  className="font-mono tabular-nums text-primary hover:underline transition-colors duration-150"
                  href="tel:+8801700623835"
                >
                  +880 1700-MAEVELLE
                </a>
              </p>
              <p>
                <strong className="text-on-surface font-semibold">Doorstep Inspection:</strong> Doorstep inspection before payment across all 64 districts in Bangladesh.
              </p>
            </div>
          </div>
        </div>

        {/* BOTTOM ROW: COPYRIGHT, REFINED PAYMENTS, LEGAL, & BACK TO TOP */}
        <div className="flex flex-wrap items-center justify-between gap-4 pt-8 border-t border-border/30 text-xs text-on-surface-variant/80 font-label-sm">
          {/* Copyright & Region */}
          <div className="flex items-center gap-2">
            <span>© {new Date().getFullYear()} {storeName} Bangladesh Ltd.</span>
            <span>•</span>
            <span className="inline-flex items-center gap-1 text-[11px] text-on-surface-variant/70">
              <span>🇧🇩 Bangladesh (৳ BDT)</span>
            </span>
          </div>

          {/* Quiet Payment Badges */}
          <div className="flex items-center gap-1.5 text-[10.5px]">
            <span className="rounded-md border border-border/40 bg-surface-container-low px-2 py-0.5 text-on-surface-variant transition-[border-color,background-color] duration-150 hover:border-border hover:bg-surface-container">
              Cash on Delivery
            </span>
            <span className="rounded-md border border-border/40 bg-surface-container-low px-2 py-0.5 font-medium text-primary transition-[border-color,background-color] duration-150 hover:border-border hover:bg-surface-container">
              bKash
            </span>
            <span className="rounded-md border border-border/40 bg-surface-container-low px-2 py-0.5 text-on-surface-variant transition-[border-color,background-color] duration-150 hover:border-border hover:bg-surface-container">
              Nagad
            </span>
            <span className="rounded-md border border-border/40 bg-surface-container-low px-2 py-0.5 text-on-surface-variant transition-[border-color,background-color] duration-150 hover:border-border hover:bg-surface-container">
              Cards Accepted
            </span>
          </div>

          {/* Legal Links & Back To Top */}
          <div className="flex items-center gap-5">
            <nav aria-label="Legal policies" className="flex items-center gap-3.5 text-xs font-label-md">
              <Link className="transition-colors duration-150 hover:text-primary" href="/policies/privacy">
                Privacy
              </Link>
              <Link className="transition-colors duration-150 hover:text-primary" href="/policies/terms">
                Terms
              </Link>
              <Link className="transition-colors duration-150 hover:text-primary" href="/policies/shipping">
                Shipping
              </Link>
              <Link className="transition-colors duration-150 hover:text-primary" href="/policies/returns">
                Returns
              </Link>
            </nav>

            <span className="h-3 w-px bg-border/60" />

            <button
              aria-label="Scroll back to top of page"
              className="group flex items-center gap-1 text-xs font-medium text-on-surface-variant hover:text-primary active:scale-95 transition-[color,transform] duration-150 cursor-pointer"
              onClick={scrollToTop}
              type="button"
            >
              <span>Back to top</span>
              <ArrowUpIcon className="transition-transform duration-200 ease-out group-hover:-translate-y-1" size={12} />
            </button>
          </div>
        </div>
      </div>
    </footer>
  );
}
