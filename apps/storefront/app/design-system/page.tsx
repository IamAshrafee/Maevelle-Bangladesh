'use client';

import { useState } from 'react';
import Link from 'next/link';

import {
  ArrowRightIcon,
  BoltIcon,
  CheckCircleIcon,
  CloseIcon,
  FilterIcon,
  HeartIcon,
  LockClockIcon,
  SearchIcon,
  ShareIcon,
  ShieldCheckIcon,
  ShoppingBagIcon,
  SparklesIcon,
  StorefrontIcon,
  TranslateIcon,
  TruckIcon,
} from '@/components/ui/icons';
import { CommerceBadge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CategoryPill, FilterChip } from '@/components/ui/chip';
import { Field } from '@/components/ui/field';
import { IconButton } from '@/components/ui/icon-button';
import { Input } from '@/components/ui/input';
import { Notice } from '@/components/ui/notice';
import { PhoneInput } from '@/components/ui/phone-input';
import { Select } from '@/components/ui/select';
import { Checkbox, RadioCard } from '@/components/ui/selection-control';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { Surface } from '@/components/ui/surface';
import { Textarea } from '@/components/ui/textarea';
import { Toggle } from '@/components/ui/toggle';
import { Price } from '@/components/commerce/price';
import {
  DesktopProductCard,
  MobileProductCard,
} from '@/components/commerce/product-card';
import { QuantityStepper } from '@/components/commerce/quantity-stepper';
import { WishlistButton } from '@/components/commerce/wishlist-button';
import { CartDrawer } from '@/components/commerce/cart-drawer';
import { SortDrawer, type SortOption } from '@/components/commerce/sort-drawer';
import {
  FilterDrawer,
  FilterTriggerButton,
  type FilterValues,
  DEFAULT_FILTER_VALUES,
} from '@/components/commerce/filter-drawer';
import { TrustBadges } from '@/components/layout/trust-badges';
import { AnnouncementBar } from '@/components/layout/announcement-bar';
import { MobileNavbar } from '@/components/layout/mobile-navbar';
import { DesktopNavbar } from '@/components/layout/desktop-navbar';
import { MobileFooter } from '@/components/layout/mobile-footer';
import { DesktopFooter } from '@/components/layout/desktop-footer';
import { WishlistPageShell } from '@/features/wishlist/components/wishlist-page-shell';
import { CheckoutPageShell } from '@/features/checkout';

export default function StorefrontDesignSystemPage() {
  // Interactive UI State
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isHeartFilled, setIsHeartFilled] = useState(false);
  const [activeTabPill, setActiveTabPill] = useState('pearls');
  const [stepperVal, setStepperVal] = useState(1);
  const [giftWrapChecked, setGiftWrapChecked] = useState(true);
  const [saveWalletChecked, setSaveWalletChecked] = useState(true);
  const [demoSearchVal, setDemoSearchVal] = useState('Freshwater pearl drop');
  const [demoPasswordVal, setDemoPasswordVal] = useState('SecretMaevelle2026!');
  const [demoDistrict, setDemoDistrict] = useState('dhaka-city');
  const [demoTextareaVal, setDemoTextareaVal] = useState(
    'Please wrap this with a crimson ribbon and include the note: Happy Anniversary, Priya!',
  );
  const [demoCalligraphyChecked, setDemoCalligraphyChecked] = useState(false);
  const [selectedDeliveryCard, setSelectedDeliveryCard] = useState<'express' | 'standard'>('express');
  const [selectedPaymentCard, setSelectedPaymentCard] = useState<'bkash' | 'cod'>('bkash');
  const [activeFilters, setActiveFilters] = useState<string[]>([
    'In Stock in Gulshan',
    'Under ৳2,500',
    'Freshwater Pearl',
  ]);
  const [selectedSort, setSelectedSort] = useState<SortOption>('popular');
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isSortOpen, setIsSortOpen] = useState(false);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [drawerFilters, setDrawerFilters] = useState<FilterValues>(DEFAULT_FILTER_VALUES);
  const [cartCount, setCartCount] = useState(2);

  const activeFilterCount =
    (drawerFilters.maxPrice < 5000 || drawerFilters.minPrice > 500 ? 1 : 0) +
    drawerFilters.colors.length +
    drawerFilters.materials.length +
    (drawerFilters.expressDelivery ? 1 : 0) +
    (drawerFilters.inStockOnly ? 1 : 0);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 2800);
  };

  const copyToken = (name: string, hex: string) => {
    navigator.clipboard?.writeText(hex);
    showToast(`Copied ${name}: ${hex}`);
  };

  const removeFilter = (filter: string) => {
    setActiveFilters((prev) => prev.filter((f) => f !== filter));
    showToast(`Removed filter: ${filter}`);
  };

  return (
    <div className="relative min-h-screen bg-surface font-body-md text-on-surface antialiased pb-28">
      {/* Toast Spec Feedback */}
      {toastMessage && (
        <div
          aria-live="polite"
          className="fixed top-20 left-4 right-4 z-50 mx-auto flex max-w-sm items-center justify-between gap-3 rounded-xl bg-inverse-surface p-3.5 text-inverse-on-surface shadow-2xl transition-all"
        >
          <div className="flex items-center gap-2.5">
            <span className="text-primary-fixed">
              <CheckCircleIcon size={20} />
            </span>
            <div className="flex flex-col">
              <span className="font-headline-sm text-xs font-semibold text-inverse-on-surface">
                Design Spec System
              </span>
              <span className="text-body-sm text-[12px] text-inverse-on-surface/80">
                {toastMessage}
              </span>
            </div>
          </div>
          <button
            className="flex size-7 items-center justify-center rounded-full text-inverse-on-surface/70 hover:text-inverse-on-surface"
            onClick={() => setToastMessage(null)}
            type="button"
          >
            <CloseIcon size={16} />
          </button>
        </div>
      )}

      {/* Floating Quick Action Nav to open Drawers */}
      <div className="sticky top-0 z-30 flex items-center justify-between border-b border-border/40 bg-surface/85 px-4 py-2.5 backdrop-blur-xl">
        <div className="flex items-center gap-2">
          <span className="size-2 rounded-full bg-primary animate-pulse" />
          <span className="font-label-sm text-xs font-bold tracking-wider text-primary uppercase">
            Maevelle Dhaka UI Lab
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="flex items-center gap-1.5 rounded-lg bg-surface-container-low px-2.5 py-1 text-label-sm font-semibold text-primary transition-colors hover:bg-surface-container cursor-pointer"
            onClick={() => setIsFilterOpen(true)}
            type="button"
          >
            <FilterIcon size={14} />
            <span>Filter</span>
            {activeFilterCount > 0 && (
              <span className="flex size-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-white">
                {activeFilterCount}
              </span>
            )}
          </button>
          <button
            className="flex items-center gap-1.5 rounded-lg bg-surface-container-low px-2.5 py-1 text-label-sm font-semibold text-primary transition-colors hover:bg-surface-container cursor-pointer"
            onClick={() => setIsSortOpen(true)}
            type="button"
          >
            <ArrowRightIcon className="rotate-90" size={14} />
            <span>Sort</span>
          </button>
          <button
            className="flex items-center gap-1.5 rounded-lg bg-primary px-2.5 py-1 text-label-sm font-semibold text-on-primary shadow-xs transition-colors hover:bg-primary-hover cursor-pointer"
            onClick={() => setIsCartOpen(true)}
            type="button"
          >
            <ShoppingBagIcon size={14} />
            <span>Bag ({cartCount})</span>
          </button>
        </div>
      </div>

      <div className="mx-auto max-w-xl px-4 pt-4 sm:max-w-2xl lg:max-w-4xl space-y-8">
        {/* SECTION 1: HEADER & INTRO SPEC */}
        <header className="pt-2 pb-4">
          <div className="mb-2 flex items-center justify-between">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-primary-fixed px-2.5 py-1 text-on-primary-fixed">
              <SparklesIcon size={14} />
              <span className="font-label-sm text-[11px] font-bold tracking-wide">
                DESIGN SYSTEM SPEC SHEET
              </span>
            </div>
            <span className="rounded-full bg-surface-container-high px-2.5 py-1 font-label-sm text-[11px] font-bold text-on-surface-variant">
              v1.2.0 PRODUCTION
            </span>
          </div>

          <h1 className="font-display-hero-mobile text-display-hero-mobile font-semibold leading-tight text-primary">
            Maevelle UI Kit &amp; Component Vault
          </h1>
          <p className="mt-1.5 text-body-md text-on-surface-variant">
            Single source of truth for the Maevelle Dhaka iOS, Android &amp; Web client. Viewport
            baseline: 390px (Mobile-First Ergonomics).
          </p>

          {/* Design Philosophy Card */}
          <div className="mt-4 space-y-3 rounded-2xl bg-surface-container-low p-4 shadow-sm">
            <div className="flex items-center gap-2">
              <span className="text-primary">
                <SparklesIcon size={20} />
              </span>
              <span className="font-headline-sm text-sm font-bold text-on-surface">
                Philosophy: Curated • Feminine • High-Contrast
              </span>
            </div>
            <p className="text-body-sm text-[13px] text-on-surface-variant leading-relaxed">
              Engineered for Bangladesh’s mobile network conditions (EDGE to 4G handshakes). Zero heavy
              client dependencies, strict WCAG AA 4.5:1+ contrast resilience under direct tropical
              daylight, and micro-animations calibrated under 2KB per spec.
            </p>
            <div className="grid grid-cols-2 gap-2 pt-1">
              <div className="flex flex-col rounded-xl bg-surface-container-lowest p-3 shadow-xs">
                <span className="font-label-sm text-[10px] uppercase tracking-wider text-on-surface-variant">
                  Touch Envelope
                </span>
                <span className="mt-0.5 font-headline-sm font-bold text-primary">
                  48px x 48px Min
                </span>
              </div>
              <div className="flex flex-col rounded-xl bg-surface-container-lowest p-3 shadow-xs">
                <span className="font-label-sm text-[10px] uppercase tracking-wider text-on-surface-variant">
                  Canvas Standard
                </span>
                <span className="mt-0.5 font-headline-sm font-bold text-secondary">
                  390 x 844 CSS px
                </span>
              </div>
            </div>
          </div>
        </header>

        {/* SECTION 2: COLOR TOKENS & CONTRAST MATRIX */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="h-5 w-2 rounded-full bg-primary" />
              <h2 className="font-headline-lg-mobile text-headline-lg-mobile font-semibold text-on-surface">
                01. Color &amp; Contrast Matrix
              </h2>
            </div>
            <span className="font-label-sm text-xs font-semibold text-on-surface-variant">
              WCAG 2.1 AA
            </span>
          </div>
          <p className="text-body-sm text-on-surface-variant">
            Tap any color swatch to copy the token reference directly into your IDE clipboard.
          </p>

          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {/* Primary CTA */}
            <button
              className="flex w-full items-center justify-between rounded-xl bg-surface-container-lowest p-3 text-left shadow-xs transition-all active:scale-98 hover:shadow-sm"
              onClick={() => copyToken('Primary CTA', '#9E2A4B')}
              type="button"
            >
              <div className="flex items-center gap-3">
                <div className="flex size-12 items-center justify-center rounded-lg bg-primary-container text-on-primary shadow-inner">
                  <ShoppingBagIcon size={20} />
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-headline-sm text-sm font-semibold text-on-surface">
                      Primary CTA
                    </span>
                    <span className="rounded bg-surface-container-high px-1.5 py-0.2 font-label-sm text-[10px] text-on-surface-variant">
                      #9E2A4B
                    </span>
                  </div>
                  <span className="text-body-sm text-[11px] text-on-surface-variant">
                    Deep Berry Rose • 4.8:1 on White
                  </span>
                </div>
              </div>
              <span className="font-label-sm text-xs font-bold text-primary">4.8:1 AA</span>
            </button>

            {/* Primary Pressed */}
            <button
              className="flex w-full items-center justify-between rounded-xl bg-surface-container-lowest p-3 text-left shadow-xs transition-all active:scale-98 hover:shadow-sm"
              onClick={() => copyToken('Primary Pressed', '#7E0E35')}
              type="button"
            >
              <div className="flex items-center gap-3">
                <div className="flex size-12 items-center justify-center rounded-lg bg-primary text-on-primary shadow-inner">
                  <BoltIcon size={20} />
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="font-headline-sm text-sm font-semibold text-on-surface">
                      Primary Pressed
                    </span>
                    <span className="rounded bg-surface-container-high px-1.5 py-0.2 font-label-sm text-[10px] text-on-surface-variant">
                      #7E0E35
                    </span>
                  </div>
                  <span className="text-body-sm text-[11px] text-on-surface-variant">
                    Deep Pressed • 7.2:1 Editorial
                  </span>
                </div>
              </div>
              <span className="font-label-sm text-xs font-bold text-primary">7.2:1 AAA</span>
            </button>

            {/* Secondary Accent */}
            <button
              className="flex w-full items-center justify-between rounded-xl bg-surface-container-lowest p-3 text-left shadow-xs transition-all active:scale-98 hover:shadow-sm"
              onClick={() => copyToken('Secondary Accent', '#A63359')}
              type="button"
            >
              <div className="flex size-12 items-center justify-center rounded-lg bg-secondary text-on-secondary shadow-inner">
                <HeartIcon filled size={20} />
              </div>
              <div className="ml-3 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="font-headline-sm text-sm font-semibold text-on-surface">
                    Secondary Accent
                  </span>
                  <span className="rounded bg-surface-container-high px-1.5 py-0.2 font-label-sm text-[10px] text-on-surface-variant">
                    #A63359
                  </span>
                </div>
                <span className="text-body-sm text-[11px] text-on-surface-variant">
                  Heritage Rose • Active Wishlist
                </span>
              </div>
              <span className="font-label-sm text-xs font-bold text-secondary">4.6:1 AA</span>
            </button>

            {/* Surface Alabaster */}
            <button
              className="flex w-full items-center justify-between rounded-xl bg-surface-container-lowest p-3 text-left shadow-xs transition-all active:scale-98 hover:shadow-sm"
              onClick={() => copyToken('Surface Alabaster', '#FFF8F5')}
              type="button"
            >
              <div className="flex size-12 items-center justify-center rounded-lg bg-surface text-on-surface-variant border border-border shadow-inner">
                <StorefrontIcon size={20} />
              </div>
              <div className="ml-3 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="font-headline-sm text-sm font-semibold text-on-surface">
                    Surface Alabaster
                  </span>
                  <span className="rounded bg-surface-container-high px-1.5 py-0.2 font-label-sm text-[10px] text-on-surface-variant">
                    #FFF8F5
                  </span>
                </div>
                <span className="text-body-sm text-[11px] text-on-surface-variant">
                  Viewport Canvas Background
                </span>
              </div>
              <span className="font-label-sm text-xs font-bold text-on-surface-variant">CANVAS</span>
            </button>
          </div>

          {/* Commerce Validation Multi-Row */}
          <div className="space-y-2 rounded-xl bg-surface-container-lowest p-3.5 shadow-xs">
            <span className="block font-label-sm text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">
              Commerce Validation &amp; Alerts
            </span>
            <div className="grid grid-cols-3 gap-2">
              <button
                className="flex flex-col items-center rounded-lg bg-surface-container-low p-2 text-center transition-all active:scale-95"
                onClick={() => copyToken('Dhaka Deliv', '#FFD9E0')}
                type="button"
              >
                <div className="mb-1 flex size-6 items-center justify-center rounded-full bg-secondary-fixed text-on-secondary-fixed">
                  <TruckIcon size={14} />
                </div>
                <span className="font-label-sm text-xs font-bold text-on-surface">Dhaka Deliv</span>
                <span className="font-label-sm text-[10px] text-on-surface-variant">#FFD9E0</span>
              </button>

              <button
                className="flex flex-col items-center rounded-lg bg-surface-container-low p-2 text-center transition-all active:scale-95"
                onClick={() => copyToken('Flash Deal', '#FFB2BF')}
                type="button"
              >
                <div className="mb-1 flex size-6 items-center justify-center rounded-full bg-primary-fixed-dim text-primary">
                  <BoltIcon size={14} />
                </div>
                <span className="font-label-sm text-xs font-bold text-on-surface">Flash Deal</span>
                <span className="font-label-sm text-[10px] text-on-surface-variant">#FFB2BF</span>
              </button>

              <button
                className="flex flex-col items-center rounded-lg bg-surface-container-low p-2 text-center transition-all active:scale-95"
                onClick={() => copyToken('Critical Error', '#BA1A1A')}
                type="button"
              >
                <div className="mb-1 flex size-6 items-center justify-center rounded-full bg-error-container text-on-error-container">
                  <CloseIcon size={14} />
                </div>
                <span className="font-label-sm text-xs font-bold text-error">Critical</span>
                <span className="font-label-sm text-[10px] text-error">#BA1A1A</span>
              </button>
            </div>
          </div>
        </section>

        {/* SECTION 3: TYPOGRAPHY & BANGLADESH CURRENCY SYSTEM */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <span className="h-5 w-2 rounded-full bg-primary" />
            <h2 className="font-headline-lg-mobile text-headline-lg-mobile font-semibold text-on-surface">
              02. Typography &amp; Currency (BDT)
            </h2>
          </div>
          <p className="text-body-sm text-on-surface-variant">
            Editorial Playfair Serif balanced with utilitarian Plus Jakarta Sans for rapid mobile reading.
          </p>

          <div className="space-y-3">
            {/* Display Hero */}
            <div className="space-y-1 rounded-xl bg-surface-container-lowest p-3.5 shadow-xs">
              <div className="flex items-center justify-between text-on-surface-variant">
                <span className="font-label-sm text-xs">
                  font-display-hero-mobile • Playfair Display 28/34
                </span>
                <span className="rounded bg-surface-container-low px-1.5 py-0.5 font-label-sm text-[10px]">
                  600 Semi
                </span>
              </div>
              <div className="font-display-hero-mobile text-display-hero-mobile font-semibold text-primary">
                Artisanal Jamdani &amp; Freshwater Pearls
              </div>
            </div>

            {/* Headline */}
            <div className="space-y-1 rounded-xl bg-surface-container-lowest p-3.5 shadow-xs">
              <div className="flex items-center justify-between text-on-surface-variant">
                <span className="font-label-sm text-xs">
                  font-headline-lg-mobile • Playfair Display 22/28
                </span>
                <span className="rounded bg-surface-container-low px-1.5 py-0.5 font-label-sm text-[10px]">
                  500 Med
                </span>
              </div>
              <div className="font-headline-lg-mobile text-headline-lg-mobile font-medium text-on-surface">
                Crafted for Gulshan &amp; Banani Evenings
              </div>
            </div>

            {/* Body & Micro UI */}
            <div className="space-y-2 rounded-xl bg-surface-container-lowest p-3.5 shadow-xs">
              <div className="flex items-center justify-between text-on-surface-variant">
                <span className="font-label-sm text-xs">font-body-md • Plus Jakarta Sans 14/20</span>
                <span className="rounded bg-surface-container-low px-1.5 py-0.5 font-label-sm text-[10px]">
                  400 Reg
                </span>
              </div>
              <p className="font-body-md text-body-md text-on-surface-variant leading-relaxed">
                Each heirloom jewelry ornament is individually hand-molded and dipped in 18-karat
                micro-gold vermeil in our Dhanmondi studio.
              </p>
              <div className="flex items-center justify-between pt-2 text-on-surface-variant">
                <span className="font-label-sm text-[11px]">
                  font-label-sm • Plus Jakarta Sans 11/14
                </span>
                <span className="font-label-sm text-[11px] font-bold text-primary">
                  TRACKING +0.04em
                </span>
              </div>
              <span className="block font-label-sm text-[11px] font-bold uppercase tracking-wider text-on-surface">
                SKU: MV-DH-2024-GLD • 100% RECYCLED VERMEIL
              </span>
            </div>

            {/* BDT Currency Display Spec */}
            <div className="space-y-3 rounded-xl bg-surface-container-low p-4 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="font-headline-sm text-sm font-bold text-on-surface">
                  BDT &quot;৳&quot; Formatting Rules
                </span>
                <span className="rounded-full bg-primary px-2 py-0.5 font-label-sm text-[10px] font-bold text-on-primary">
                  Commerce Rule
                </span>
              </div>
              <p className="text-body-sm text-[13px] text-on-surface-variant leading-relaxed">
                Never write &quot;Tk.&quot; or &quot;BDT&quot;. Always prepend the official unicode &quot;৳&quot;
                without trailing decimals (৳2,450 not ৳2,450.00). Use Bangladesh comma grouping (Lakh
                format when &gt; 99,999).
              </p>

              {/* Live Specimen */}
              <div className="flex items-baseline justify-between rounded-lg bg-surface-container-lowest p-3 shadow-xs">
                <Price amount={2450} originalAmount={3200} size="lg" />
              </div>

              {/* Bilingual Support */}
              <div className="flex items-center gap-2 rounded-lg bg-surface-container-high/60 p-2.5">
                <TranslateIcon className="text-primary" size={18} />
                <span className="text-body-sm text-[13px] text-on-surface">
                  বাংলা সাপোর্ট:{' '}
                  <span className="font-semibold text-primary" lang="bn">
                    ৳ ২,৪৫০ (২৩% ছাড়)
                  </span>{' '}
                  — Baseline unified for Latin numerals.
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 4: BUTTON SYSTEM & ARCHITECTURE MATRIX */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <span className="h-5 w-2 rounded-full bg-primary" />
            <h2 className="font-headline-lg-mobile text-headline-lg-mobile font-semibold text-on-surface">
              03. Button Architecture Matrix
            </h2>
          </div>
          <p className="text-body-sm text-on-surface-variant">
            Live states with micro-feedback, tactile tap scaling (active:scale-98), and minimum 48px
            hitboxes.
          </p>

          <div className="space-y-4">
            {/* Primary Solid Sticky Button (52px height) */}
            <div className="space-y-2 rounded-xl bg-surface-container-lowest p-3.5 shadow-xs">
              <div className="flex items-center justify-between">
                <span className="font-label-sm text-xs font-bold uppercase tracking-wider text-on-surface">
                  Primary Sticky CTA (h-52px Tier)
                </span>
                <span className="font-label-sm text-[10px] text-on-surface-variant">
                  Default + Price
                </span>
              </div>
              <Button
                className="justify-between px-4 font-headline-sm"
                fullWidth
                onClick={() => showToast('Triggered: Continue to Checkout')}
                size="lg"
                variant="primary"
              >
                <span className="font-price-md font-bold">৳2,450</span>
                <span className="flex items-center gap-1.5">
                  <span>Continue to Secure Checkout</span>
                  <ArrowRightIcon size={18} />
                </span>
              </Button>
            </div>

            {/* State Variations */}
            <div className="space-y-3 rounded-xl bg-surface-container-lowest p-3.5 shadow-xs">
              <span className="block font-label-sm text-xs font-bold uppercase tracking-wider text-on-surface">
                State Variations (h-48px Standard)
              </span>

              {/* Default CTA */}
              <div className="space-y-1">
                <span className="font-label-sm text-[10px] text-on-surface-variant">
                  State: Default CTA
                </span>
                <Button
                  fullWidth
                  onClick={() => {
                    setCartCount((c) => c + 1);
                    showToast('Added item to bag!');
                  }}
                  variant="primary-cta"
                >
                  <ShoppingBagIcon size={18} />
                  <span>Add to Shopping Bag</span>
                </Button>
              </div>

              {/* Active Pressed Simulation */}
              <div className="space-y-1">
                <span className="font-label-sm text-[10px] text-on-surface-variant">
                  State: Active Pressed (scale-98 + #7E0E35)
                </span>
                <Button
                  className="scale-98 shadow-inner"
                  fullWidth
                  variant="primary"
                >
                  <ShoppingBagIcon size={18} />
                  <span>Adding to Bag...</span>
                </Button>
              </div>

              {/* Loading Async Spinner */}
              <div className="space-y-1">
                <span className="font-label-sm text-[10px] text-on-surface-variant">
                  State: Loading Async
                </span>
                <Button
                  disabled
                  fullWidth
                  loading
                  loadingLabel="Verifying bKash Transaction…"
                  variant="primary"
                >
                  Verifying bKash Transaction…
                </Button>
              </div>

              {/* Disabled / Waitlist */}
              <div className="space-y-1">
                <span className="font-label-sm text-[10px] text-on-surface-variant">
                  State: Disabled / Waitlist
                </span>
                <button
                  className="flex h-12 w-full cursor-not-allowed items-center justify-center gap-2 rounded-xl bg-surface-container text-label-md font-semibold text-outline"
                  disabled
                  type="button"
                >
                  <LockClockIcon size={18} />
                  <span>Sold Out • Join Dhanmondi Waitlist</span>
                </button>
              </div>
            </div>

            {/* Hierarchy Tiers */}
            <div className="space-y-2.5 rounded-xl bg-surface-container-lowest p-3.5 shadow-xs">
              <span className="block font-label-sm text-xs font-bold uppercase tracking-wider text-on-surface">
                Hierarchy Tiers
              </span>

              {/* Soft Tonal */}
              <Button
                fullWidth
                onClick={() => showToast('Saved to wishlist')}
                variant="tonal"
              >
                <HeartIcon size={18} />
                <span>Save Item for Later (Wishlist)</span>
              </Button>

              {/* Express COD */}
              <Button
                fullWidth
                onClick={() => showToast('Selected: Instant COD Checkout')}
                variant="express"
              >
                <BoltIcon size={18} />
                <span>⚡ Instant Buy via Cash-on-Delivery</span>
              </Button>

              {/* Destructive */}
              <Button
                fullWidth
                onClick={() => showToast('Item removed from cart')}
                variant="danger"
              >
                <CloseIcon size={18} />
                <span>Remove Item from Bag</span>
              </Button>
            </div>
          </div>
        </section>

        {/* SECTION 5: ICON BUTTONS & STEPPERS */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <span className="h-5 w-2 rounded-full bg-primary" />
            <h2 className="font-headline-lg-mobile text-headline-lg-mobile font-semibold text-on-surface">
              04. Icon Buttons &amp; Steppers
            </h2>
          </div>
          <p className="text-body-sm text-on-surface-variant">
            Enforces minimum 48px touch hitbox padding. Interactive: tap items to toggle states.
          </p>

          <div className="space-y-4 rounded-xl bg-surface-container-lowest p-3.5 shadow-xs">
            <div className="grid grid-cols-4 gap-2 text-center">
              {/* Wishlist Toggle */}
              <div className="flex flex-col items-center gap-1">
                <WishlistButton
                  active={isHeartFilled}
                  onToggle={(active) => {
                    setIsHeartFilled(active);
                    showToast(active ? 'Wishlist: Active Filled' : 'Wishlist: Removed');
                  }}
                  size="lg"
                  variant="surface"
                />
                <span className="font-label-sm text-[10px] text-on-surface-variant">Wishlist</span>
              </div>

              {/* Bag Anchor */}
              <div className="flex flex-col items-center gap-1">
                <IconButton
                  aria-label="View shopping bag"
                  badge={cartCount}
                  onClick={() => setIsCartOpen(true)}
                  size="lg"
                  variant="surface"
                >
                  <ShoppingBagIcon size={20} />
                </IconButton>
                <span className="font-label-sm text-[10px] text-on-surface-variant">Bag Anchor</span>
              </div>

              {/* Filter with Pip */}
              <div className="flex flex-col items-center gap-1">
                <IconButton
                  activeIndicator={activeFilterCount > 0}
                  aria-label="Filter collection"
                  onClick={() => setIsFilterOpen(true)}
                  size="lg"
                  variant="surface"
                >
                  <FilterIcon size={20} />
                </IconButton>
                <span className="font-label-sm text-[10px] text-on-surface-variant">
                  Filter ({activeFilterCount})
                </span>
              </div>

              {/* Share */}
              <div className="flex flex-col items-center gap-1">
                <IconButton
                  aria-label="Share product"
                  onClick={() => showToast('Share link copied to clipboard')}
                  size="lg"
                  variant="surface"
                >
                  <ShareIcon size={20} />
                </IconButton>
                <span className="font-label-sm text-[10px] text-on-surface-variant">Share</span>
              </div>
            </div>

            {/* Quantity Stepper Specimen */}
            <div className="flex items-center justify-between border-t border-surface-container pt-3">
              <div>
                <span className="block font-headline-sm text-sm font-semibold text-on-surface">
                  Quantity Stepper
                </span>
                <span className="text-body-sm text-[11px] text-on-surface-variant">
                  Prevents decrements below 1
                </span>
              </div>
              <QuantityStepper onChange={setStepperVal} value={stepperVal} />
            </div>
          </div>
        </section>

        {/* SECTION 6: CHIPS, FILTER PILLS & TAGS */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <span className="h-5 w-2 rounded-full bg-primary" />
            <h2 className="font-headline-lg-mobile text-headline-lg-mobile font-semibold text-on-surface">
              05. Chips, Pills &amp; Local Badges
            </h2>
          </div>
          <p className="text-body-sm text-on-surface-variant">
            Localized status pills engineered for Bangladesh quick-commerce expectations.
          </p>

          <div className="space-y-3">
            {/* Category Pills */}
            <div className="space-y-2 rounded-xl bg-surface-container-lowest p-3.5 shadow-xs">
              <span className="block font-label-sm text-xs font-bold uppercase tracking-wider text-on-surface">
                Category Selection Pills
              </span>
              <div className="flex flex-wrap gap-2">
                <CategoryPill
                  active={activeTabPill === 'pearls'}
                  count={48}
                  onClick={() => setActiveTabPill('pearls')}
                >
                  Pearl Drops
                </CategoryPill>
                <CategoryPill
                  active={activeTabPill === 'velvet'}
                  count={19}
                  onClick={() => setActiveTabPill('velvet')}
                >
                  Velvet Ribbons
                </CategoryPill>
                <CategoryPill
                  active={activeTabPill === 'gold'}
                  count={32}
                  onClick={() => setActiveTabPill('gold')}
                >
                  Gold Vermeil
                </CategoryPill>
              </div>
            </div>

            {/* Dismissible Filters */}
            <div className="space-y-2 rounded-xl bg-surface-container-lowest p-3.5 shadow-xs">
              <span className="block font-label-sm text-xs font-bold uppercase tracking-wider text-on-surface">
                Dismissible Applied Filters
              </span>
              <div className="flex flex-wrap gap-2">
                {activeFilters.length === 0 ? (
                  <button
                    className="text-body-sm text-xs font-semibold text-primary underline"
                    onClick={() =>
                      setActiveFilters([
                        'In Stock in Gulshan',
                        'Under ৳2,500',
                        'Freshwater Pearl',
                      ])
                    }
                    type="button"
                  >
                    Reset all filters
                  </button>
                ) : (
                  activeFilters.map((filter) => (
                    <FilterChip
                      key={filter}
                      label={filter}
                      onDismiss={() => removeFilter(filter)}
                    />
                  ))
                )}
              </div>
            </div>

            {/* Urgency & MFS Badges */}
            <div className="space-y-2 rounded-xl bg-surface-container-low p-3.5 shadow-xs">
              <span className="block font-label-sm text-xs font-bold uppercase tracking-wider text-on-surface">
                Commerce Badges &amp; MFS Callouts
              </span>
              <div className="flex flex-wrap gap-2">
                <CommerceBadge variant="scarcity">🔥 Only 2 Left in Stock</CommerceBadge>
                <CommerceBadge icon={<BoltIcon size={14} />} variant="express">
                  24h Dhaka Express
                </CommerceBadge>
                <CommerceBadge icon={<SparklesIcon size={14} />} variant="craft">
                  Dhanmondi Atelier Handcrafted
                </CommerceBadge>
                <CommerceBadge variant="mfs">৳ 5% bKash Instant Cashback</CommerceBadge>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 7: FORM CONTROLS & LUXURY SELECTION SUITE */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <span className="h-5 w-2 rounded-full bg-primary" />
            <h2 className="font-headline-lg-mobile text-headline-lg-mobile font-semibold text-on-surface">
              06. Form Controls &amp; BD Inputs
            </h2>
          </div>
          <p className="text-body-sm text-on-surface-variant">
            Precision engineered with 44px/48px touch standards, Bangladesh MFS &amp; Courier verifications, and warm linen surfaces.
          </p>

          <div className="space-y-6">
            {/* CARD 1: INPUT CONTROLS & FIELD WRAPPERS */}
            <div className="space-y-4 rounded-2xl bg-surface-container-lowest p-4 sm:p-5 shadow-xs border border-border/40">
              <span className="block font-label-sm text-xs font-bold uppercase tracking-wider text-on-surface">
                Text Inputs &amp; Field Wrappers
              </span>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Full Name with Success Verification */}
                <Field
                  id="specimen-fullname"
                  label="Customer Full Name"
                  required
                >
                  <Input
                    defaultValue="Tahmina Chowdhury"
                    id="specimen-fullname"
                    rightIcon={<CheckCircleIcon className="text-primary" size={18} />}
                  />
                </Field>

                {/* Bangladesh Courier Phone Input */}
                <div className="space-y-1.5">
                  <label
                    className="block font-label-md text-xs font-semibold text-on-surface tracking-wide"
                    htmlFor="demo-phone"
                  >
                    <span>Courier Mobile Number</span>
                    <span className="ml-1 text-primary font-bold">*</span>
                  </label>
                  <PhoneInput id="demo-phone" />
                </div>

                {/* Search Input with Clear Button */}
                <Field
                  description="Press Esc to clear or click the clear button."
                  hint="Catalog Query"
                  id="specimen-search"
                  label="Search Atelier Pieces"
                  optional
                >
                  <Input
                    clearable
                    id="specimen-search"
                    leftIcon={<SearchIcon size={18} />}
                    onChange={(e) => setDemoSearchVal(e.target.value)}
                    onClear={() => {
                      setDemoSearchVal('');
                      showToast('Cleared search input');
                    }}
                    placeholder="Search jewelry, scarves, bows…"
                    value={demoSearchVal}
                  />
                </Field>

                {/* Password with Reveal Toggle */}
                <Field
                  hint="Encrypted Vault"
                  id="specimen-password"
                  label="Patron Atelier Passkey"
                >
                  <Input
                    id="specimen-password"
                    onChange={(e) => setDemoPasswordVal(e.target.value)}
                    showPasswordToggle
                    type="password"
                    value={demoPasswordVal}
                  />
                </Field>

                {/* Field with Validation Error */}
                <Field
                  error="Promo voucher 'SUMMER-VOUCHER-99' has expired or is invalid for Dhaka express."
                  id="specimen-promo"
                  label="Voucher &amp; Promo Code"
                >
                  <Input
                    defaultValue="SUMMER-VOUCHER-99"
                    hasError
                    id="specimen-promo"
                  />
                </Field>

                {/* Disabled Input */}
                <Field
                  description="Verified via Bangladesh Election Commission NID database."
                  id="specimen-nid"
                  label="National ID / Tax Token (Verified)"
                >
                  <Input
                    defaultValue="1992-2692-0482-1048"
                    disabled
                    id="specimen-nid"
                  />
                </Field>
              </div>

              {/* Input Size Variations */}
              <div className="pt-2 border-t border-border/30">
                <span className="block font-label-sm text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant mb-2">
                  Input Size Hierarchy (sm: 36px, md: 44px, lg: 48px standard)
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <Input placeholder="Compact (sm: 36px)" sizeVariant="sm" />
                  <Input placeholder="Standard (md: 44px)" sizeVariant="md" />
                  <Input placeholder="Touch Hero (lg: 48px)" sizeVariant="lg" />
                </div>
              </div>
            </div>

            {/* CARD 2: DROPDOWNS & TEXTAREAS */}
            <div className="space-y-4 rounded-2xl bg-surface-container-lowest p-4 sm:p-5 shadow-xs border border-border/40">
              <span className="block font-label-sm text-xs font-bold uppercase tracking-wider text-on-surface">
                Dropdowns &amp; Multi-Line Textareas
              </span>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* District Select */}
                <Field
                  hint="Bangladesh Hub"
                  id="specimen-district"
                  label="Delivery District / City"
                  required
                >
                  <Select
                    id="specimen-district"
                    onChange={(e) => {
                      setDemoDistrict(e.target.value);
                      showToast(`Selected district: ${e.target.value}`);
                    }}
                    value={demoDistrict}
                  >
                    <option value="dhaka-city">Dhaka City (24h Express Available)</option>
                    <option value="chittagong">Chittagong (48h Express)</option>
                    <option value="sylhet">Sylhet (48h Express)</option>
                    <option value="rajshahi">Rajshahi (Standard Courier)</option>
                    <option value="khulna">Khulna (Standard Courier)</option>
                    <option value="all-64">All Other 59 Districts</option>
                  </Select>
                </Field>

                {/* Gift Calligraphy Textarea with Live Counter */}
                <Field
                  description="Handwritten with Japanese archival sumi ink on handmade cotton rag paper."
                  hint="Calligraphy Note"
                  id="specimen-textarea"
                  label="Atelier Gift Note"
                  optional
                >
                  <Textarea
                    id="specimen-textarea"
                    maxCharacters={160}
                    onChange={(e) => setDemoTextareaVal(e.target.value)}
                    showCharacterCount
                    value={demoTextareaVal}
                  />
                </Field>
              </div>
            </div>

            {/* CARD 3: SELECTION CONTROLS & CHECKOUT TILES */}
            <div className="space-y-4 rounded-2xl bg-surface-container-lowest p-4 sm:p-5 shadow-xs border border-border/40">
              <span className="block font-label-sm text-xs font-bold uppercase tracking-wider text-on-surface">
                Selection Controls &amp; Checkout Radio Cards
              </span>

              {/* Luxury Checkboxes */}
              <div className="space-y-2 border-b border-border/30 pb-4">
                <span className="block font-label-sm text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">
                  Interactive Checkboxes
                </span>
                <div className="space-y-1">
                  <Checkbox
                    checked={giftWrapChecked}
                    description="Deep crimson velvet ribbon with gold wax seal."
                    label="Signature Gift Wrapping with Velvet Satin Ribbon (+৳120)"
                    onChange={(e) => {
                      setGiftWrapChecked(e.target.checked);
                      showToast(e.target.checked ? 'Added gift wrapping' : 'Removed gift wrapping');
                    }}
                  />
                  <Checkbox
                    checked={demoCalligraphyChecked}
                    description="Personalized handwritten message card tucked inside the jewelry box."
                    label="Include Handwritten Calligraphy Card (+৳80)"
                    onChange={(e) => setDemoCalligraphyChecked(e.target.checked)}
                  />
                  <Checkbox
                    description="Restocking next week in Gulshan Flagship Studio."
                    disabled
                    label="Silk Preservation Dust Bag (Waitlist Closed)"
                  />
                </div>
              </div>

              {/* Delivery Method Radio Cards */}
              <div className="space-y-2.5 border-b border-border/30 pb-4">
                <span className="block font-label-sm text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">
                  Delivery Option Tiles (RadioCard)
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <RadioCard
                    badge="Fastest"
                    checked={selectedDeliveryCard === 'express'}
                    description="Guaranteed delivery to your doorstep within 24 hours via Maevelle white-glove rider."
                    icon={<BoltIcon size={20} />}
                    label="Dhaka 24h Express Dispatch"
                    name="delivery-demo"
                    onChange={() => {
                      setSelectedDeliveryCard('express');
                      showToast('Selected Dhaka 24h Express Dispatch');
                    }}
                    price="৳120"
                  />
                  <RadioCard
                    badge="All 64 Districts"
                    checked={selectedDeliveryCard === 'standard'}
                    description="Steadfast / Pathao courier delivery with doorstep inspection before payment."
                    icon={<TruckIcon size={20} />}
                    label="Standard Nationwide Courier"
                    name="delivery-demo"
                    onChange={() => {
                      setSelectedDeliveryCard('standard');
                      showToast('Selected Standard Courier Delivery');
                    }}
                    price="৳70"
                  />
                </div>
              </div>

              {/* Payment Method Radio Cards */}
              <div className="space-y-2.5 border-b border-border/30 pb-4">
                <span className="block font-label-sm text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">
                  Payment Method Tiles (RadioCard)
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <RadioCard
                    badge="5% Instant Cashback"
                    checked={selectedPaymentCard === 'bkash'}
                    description="Instant payment verification via bKash / Nagad PGW with zero merchant surcharges."
                    icon={<SparklesIcon size={20} />}
                    label="bKash / Nagad MFS Gateway"
                    name="payment-demo"
                    onChange={() => {
                      setSelectedPaymentCard('bkash');
                      showToast('Selected bKash / Nagad Instant Gateway');
                    }}
                  />
                  <RadioCard
                    badge="Inspection First"
                    checked={selectedPaymentCard === 'cod'}
                    description="Open the parcel and verify your jewelry before paying cash to the delivery rider."
                    icon={<ShieldCheckIcon size={20} />}
                    label="Cash on Delivery (Doorstep COD)"
                    name="payment-demo"
                    onChange={() => {
                      setSelectedPaymentCard('cod');
                      showToast('Selected Cash on Delivery');
                    }}
                  />
                </div>
              </div>

              {/* bKash 1-Tap Toggle Switch */}
              <div className="pt-1">
                <Toggle
                  checked={saveWalletChecked}
                  description="Encrypted tokenization via bKash PGW for instantaneous 1-tap checkout on next visit."
                  label="Save bKash Wallet for 1-Tap Checkout"
                  onChange={setSaveWalletChecked}
                />
              </div>

              {/* Steppers Component Specimen */}
              <div className="space-y-3 border-t border-border/30 pt-4">
                <div className="flex items-center justify-between">
                  <span className="block font-label-sm text-xs font-bold uppercase tracking-wider text-on-surface">
                    Commerce Steppers ({stepperVal} selected)
                  </span>
                  <span className="text-[11px] font-medium text-on-surface-variant font-mono">
                    Stitch Tier Geometry
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-4 rounded-xl border border-border/40 bg-surface-container-low/60 p-3.5">
                  <div className="flex flex-col gap-1">
                    <span className="font-label-sm text-[10px] font-semibold text-on-surface-variant">
                      Compact (In-Cart 28px)
                    </span>
                    <QuantityStepper onChange={setStepperVal} size="sm" value={stepperVal} />
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="font-label-sm text-[10px] font-semibold text-on-surface-variant">
                      Standard (PDP/Listing 36px)
                    </span>
                    <QuantityStepper onChange={setStepperVal} size="md" value={stepperVal} />
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="font-label-sm text-[10px] font-semibold text-on-surface-variant">
                      Prominent (Hero PDP 44px)
                    </span>
                    <QuantityStepper onChange={setStepperVal} size="lg" value={stepperVal} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 8: RADIUS & SHAPE SCALE */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <span className="h-5 w-2 rounded-full bg-primary" />
            <h2 className="font-headline-lg-mobile text-headline-lg-mobile font-semibold text-on-surface">
              07. Radius, Spacing &amp; Depth
            </h2>
          </div>
          <p className="text-body-sm text-on-surface-variant">
            Tactile soft curves paired with ambient blush diffusion (rgba(158, 42, 75, 0.06)).
          </p>

          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <div className="flex flex-col items-center rounded-xl bg-surface-container-lowest p-3 text-center shadow-xs">
              <div className="mb-1.5 flex h-10 w-12 items-center justify-center rounded-sm bg-primary-fixed font-label-sm text-[10px] font-bold text-on-primary-fixed">
                4px
              </div>
              <span className="font-headline-sm text-[13px] font-bold text-on-surface">rounded-sm</span>
              <span className="text-body-sm text-[11px] text-on-surface-variant">Micro badges, tags</span>
            </div>

            <div className="flex flex-col items-center rounded-xl bg-surface-container-lowest p-3 text-center shadow-xs">
              <div className="mb-1.5 flex h-10 w-12 items-center justify-center rounded-md bg-primary-fixed font-label-sm text-[10px] font-bold text-on-primary-fixed">
                8px
              </div>
              <span className="font-headline-sm text-[13px] font-bold text-on-surface">rounded-md</span>
              <span className="text-body-sm text-[11px] text-on-surface-variant">Inputs, swatches</span>
            </div>

            <div className="flex flex-col items-center rounded-xl bg-surface-container-lowest p-3 text-center shadow-xs">
              <div className="mb-1.5 flex h-10 w-12 items-center justify-center rounded-xl bg-primary-fixed font-label-sm text-[10px] font-bold text-on-primary-fixed">
                12px
              </div>
              <span className="font-headline-sm text-[13px] font-bold text-on-surface">rounded-xl</span>
              <span className="text-body-sm text-[11px] text-on-surface-variant">Cards, container blocks</span>
            </div>

            <div className="flex flex-col items-center rounded-xl bg-surface-container-lowest p-3 text-center shadow-xs">
              <div className="mb-1.5 flex h-10 w-12 items-center justify-center rounded-full bg-primary-fixed font-label-sm text-[10px] font-bold text-on-primary-fixed">
                9999px
              </div>
              <span className="font-headline-sm text-[13px] font-bold text-on-surface">rounded-full</span>
              <span className="text-body-sm text-[11px] text-on-surface-variant">Pills, icon buttons</span>
            </div>
          </div>
        </section>

        {/* SECTION 9: FEEDBACK, NOTICES, SKELETONS & SURFACES */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <span className="h-5 w-2 rounded-full bg-primary" />
            <h2 className="font-headline-lg-mobile text-headline-lg-mobile font-semibold text-on-surface">
              08. Feedback, Notices &amp; Elevation
            </h2>
          </div>
          <p className="text-body-sm text-on-surface-variant">
            Authoritative luxury notices, shimmer placeholders, spinners, hairline dividers, and 3-tier elevation surfaces.
          </p>

          <div className="space-y-6">
            {/* NOTICES SUITE */}
            <div className="space-y-3.5 rounded-2xl bg-surface-container-lowest p-4 sm:p-5 shadow-xs border border-border/40">
              <span className="block font-label-sm text-xs font-bold uppercase tracking-wider text-on-surface">
                Luxury Notice &amp; Banner Suite (6 Variants)
              </span>

              {/* Brand Atelier Notice */}
              <Notice
                action={
                  <Button
                    onClick={() => showToast('Opening velvet packaging preview…')}
                    size="sm"
                    variant="outline"
                  >
                    <span>View Packaging Details</span>
                    <ArrowRightIcon size={14} />
                  </Button>
                }
                title="Atelier Dispatches • Complimentary Velvet Gift Box"
                variant="brand"
              >
                All orders over ৳2,000 within Dhaka City receive Maevelle signature crimson velvet preservation pouch with wax-sealed authenticity certificate.
              </Notice>

              {/* Success Notice */}
              <Notice
                title="Dhaka Express Order Confirmed"
                variant="success"
              >
                Your heirloom freshwater pearl necklace was inspected by our Banani master jeweler and dispatched with Pathao courier (OTP: 4928).
              </Notice>

              {/* Warning Notice */}
              <Notice
                title="Studio Drop Low Stock"
                variant="warning"
              >
                Only 2 units of 18K Micro-Gold Vermeil drop earrings remain in stock at the Dhanmondi atelier.
              </Notice>

              {/* Danger / Error Notice */}
              <Notice
                action={
                  <Button
                    onClick={() => showToast('Retrying payment gateway…')}
                    size="sm"
                    variant="danger"
                  >
                    <span>Retry Gateway</span>
                  </Button>
                }
                title="bKash Payment Verification Timeout"
                variant="danger"
              >
                Transaction was timed out by bank gateway. Please verify your bKash wallet PIN or switch to Cash on Delivery.
              </Notice>

              {/* Info Notice with Dismiss Button */}
              <Notice
                dismissible
                onDismiss={() => showToast('Dismissed inspection notice')}
                title="White Glove Doorstep Inspection"
                variant="info"
              >
                Patrons across all 64 districts in Bangladesh are welcome to open the parcel and inspect the jewelry before releasing cash to the rider.
              </Notice>
            </div>

            {/* SKELETONS & SPINNERS */}
            <div className="space-y-4 rounded-2xl bg-surface-container-lowest p-4 sm:p-5 shadow-xs border border-border/40">
              <span className="block font-label-sm text-xs font-bold uppercase tracking-wider text-on-surface">
                Shimmer Skeletons &amp; Spinners
              </span>

              {/* Skeleton Preset Showcase */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Product Card Placeholder Skeleton */}
                <div className="space-y-3 rounded-xl border border-border/40 bg-surface-container-low/40 p-3.5">
                  <span className="font-label-sm text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">
                    Product Card Shimmer
                  </span>
                  <div className="space-y-2.5">
                    <Skeleton className="h-44 w-full" variant="card" />
                    <Skeleton className="h-4 w-3/4" variant="text" />
                    <Skeleton className="h-3.5 w-1/2" variant="text" />
                    <div className="flex items-center justify-between pt-1">
                      <Skeleton className="h-4 w-20" variant="text" />
                      <Skeleton className="h-9 w-24" variant="button" />
                    </div>
                  </div>
                </div>

                {/* Profile / Atelier Specimen Skeleton */}
                <div className="space-y-3 rounded-xl border border-border/40 bg-surface-container-low/40 p-3.5">
                  <span className="font-label-sm text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">
                    Atelier Concierge Shimmer
                  </span>
                  <div className="flex items-center gap-3">
                    <Skeleton className="size-12" variant="circular" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-3/5" variant="text" />
                      <Skeleton className="h-3 w-4/5" variant="text" />
                    </div>
                  </div>
                  <div className="space-y-2 pt-2">
                    <Skeleton className="h-3.5 w-full" variant="text" />
                    <Skeleton className="h-3.5 w-5/6" variant="text" />
                  </div>
                </div>
              </div>

              {/* Spinners Showcase */}
              <div className="pt-2 border-t border-border/30">
                <span className="block font-label-sm text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant mb-2">
                  Editorial Spinners (xs, sm, md, lg)
                </span>
                <div className="flex flex-wrap items-center gap-6 rounded-xl border border-border/40 bg-surface-container-low/60 p-3.5">
                  <div className="flex items-center gap-2">
                    <Spinner size="xs" variant="primary" />
                    <span className="font-label-sm text-xs text-on-surface-variant">xs (14px)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Spinner size="sm" variant="primary" />
                    <span className="font-label-sm text-xs text-on-surface-variant">sm (16px)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Spinner size="md" variant="primary" />
                    <span className="font-label-sm text-xs text-on-surface-variant">md (20px standard)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Spinner size="lg" variant="primary" />
                    <span className="font-label-sm text-xs text-on-surface-variant">lg (28px hero)</span>
                  </div>
                </div>
              </div>
            </div>

            {/* SURFACES & SEPARATORS */}
            <div className="space-y-4 rounded-2xl bg-surface-container-lowest p-4 sm:p-5 shadow-xs border border-border/40">
              <span className="block font-label-sm text-xs font-bold uppercase tracking-wider text-on-surface">
                3-Tier Elevation Surfaces &amp; Dividers
              </span>

              {/* Surface Tiers Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Surface className="p-4 text-center" variant="flat">
                  <span className="block font-headline-sm text-xs font-bold text-on-surface">Tier 1: Flat</span>
                  <span className="text-[11px] text-on-surface-variant/80">Hairline border, no shadow</span>
                </Surface>
                <Surface interactive className="p-4 text-center" variant="raised">
                  <span className="block font-headline-sm text-xs font-bold text-on-surface">Tier 2: Raised (Interactive)</span>
                  <span className="text-[11px] text-on-surface-variant/80">shadow-2xs, tap to press</span>
                </Surface>
                <Surface interactive className="p-4 text-center" variant="floating">
                  <span className="block font-headline-sm text-xs font-bold text-on-surface">Tier 3: Floating</span>
                  <span className="text-[11px] text-on-surface-variant/80">shadow-lg, high elevation</span>
                </Surface>
                <Surface className="p-4 text-center" variant="glass">
                  <span className="block font-headline-sm text-xs font-bold text-on-surface">Frosted Liquid Glass</span>
                  <span className="text-[11px] text-on-surface-variant/80">backdrop-blur-xl chrome</span>
                </Surface>
                <Surface className="p-4 text-center" variant="sunken">
                  <span className="block font-headline-sm text-xs font-bold text-on-surface">Sunken Well</span>
                  <span className="text-[11px] text-on-surface-variant/80">container-low subtle inset</span>
                </Surface>
                <Surface className="p-4 text-center" variant="inverse">
                  <span className="block font-headline-sm text-xs font-bold text-inverse-on-surface">Inverse Noir</span>
                  <span className="text-[11px] text-inverse-on-surface/80">dark canvas toast/overlay</span>
                </Surface>
              </div>

              {/* Separators Showcase */}
              <div className="space-y-3 pt-3 border-t border-border/30">
                <span className="block font-label-sm text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">
                  Hairline &amp; Labeled Separators
                </span>
                <Separator />
                <Separator label="Or continue with instant bKash" />
                <Separator label="Dhaka Atelier Concierge" />
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 09: EXTRACTED STITCH PRODUCT CARD SPECIMENS */}
        <section className="space-y-6">
          <div className="flex items-center gap-2">
            <span className="h-5 w-2 rounded-full bg-primary" />
            <h2 className="font-headline-lg-mobile text-headline-lg-mobile font-semibold text-on-surface">
              09. Product Card Architecture (Mobile &amp; Desktop)
            </h2>
          </div>
          <p className="text-body-sm text-on-surface-variant max-w-3xl">
            Extracted faithfully from the Warm Editorial Atelier shop design. Borderless
            outer silhouette, 3:4 image hero, frosted glass capsule badges, floating delivery/rating pills,
            and finish swatches. Dual responsive modes: <strong>Mobile &amp; Tablet</strong> touch-optimized
            cards and <strong>Desktop</strong> expanded cards with slide-up &quot;Quick Add to Bag&quot; and secondary angle hover crossfade.
          </p>

          {/* PART 1: MOBILE & TABLET 2-COLUMN CATALOG GRID SPECIMEN (1:1 STITCH FIDELITY) */}
          <div className="space-y-3 rounded-2xl border border-border/60 bg-surface-container-lowest p-4 sm:p-6 shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/40 pb-3">
              <div>
                <span className="block font-label-sm text-xs font-bold uppercase tracking-wider text-on-surface">
                  Mobile &amp; Tablet Product Cards (2-Column Grid)
                </span>
                <span className="text-[12px] text-on-surface-variant">
                  Exact 1:1 extraction from Stitch shop design. Demonstrating all 6 unique states.
                </span>
              </div>
              <span className="rounded-full bg-surface-container-high px-2.5 py-1 font-label-sm text-[10px] font-bold text-on-surface">
                Viewport &lt; 1024px Touch Paradigm
              </span>
            </div>

            {/* Mobile 2-Column Catalog Container */}
            <div className="mx-auto max-w-md sm:max-w-xl rounded-2xl bg-surface p-4 sm:p-5 border border-border/40">
              <div className="mb-3 flex items-center justify-between">
                <span className="font-label-sm text-xs font-semibold uppercase tracking-wider text-primary">
                  Curated Adornments (6 Pieces)
                </span>
                <span className="font-label-sm text-[11px] text-on-surface-variant">
                  2-Column Grid
                </span>
              </div>

              <div className="grid grid-cols-2 gap-x-3 gap-y-5 sm:gap-x-4 sm:gap-y-6">
                {/* 1. Editor's Pick with Dhaka Delivery Pill & 2 Finishes */}
                <MobileProductCard
                  badge="Editor's Pick"
                  deliveryPill="Dhaka 24-48h Delivery"
                  finishes={[
                    { name: 'Warm Gold', color: '#E5C158' },
                    { name: 'Rose Gold', color: '#E5A8A0' },
                  ]}
                  finishesCountLabel="2 Finishes"
                  id="stitch-prod-1"
                  imageUrl="https://lh3.googleusercontent.com/aida-public/AB6AXuAU8kN5Vdd-XFeUvL46CjxHeMIuqVlvOhzkxBeqEZbQrpiAvJAiT-7KIfOiRtN8aHnlzi4hl7xu93DUKF1LuLzY7_QV3v_7C9HV326W7qStkQMjNbSV9416GdaPdUvNT05egHsMOPWx_l2v_-w_bwM1u73AHYoiOqof4dI9HA21x3AGn1cFuS-IR6lPC7KsnlSwjexBjU1nzxRYx9mekEi6tr1w1Gj7NRsuBBgaH2bJjAiRGixv7mxx"
                  initialWishlist={true}
                  onAddToCart={() => {
                    setCartCount((c) => c + 1);
                    setIsCartOpen(true);
                    showToast('Added Aurelia Baroque Pearl Drop to Bag');
                  }}
                  onWishlistToggle={(active) => {
                    showToast(active ? 'Added to Wishlist' : 'Removed from Wishlist');
                  }}
                  originalPrice={2200}
                  price={1850}
                  title="Aurelia Baroque Pearl Drop"
                />

                {/* 2. New In with 3 Hues Swatches */}
                <MobileProductCard
                  badge="New In"
                  badgeType="secondary"
                  finishes={[
                    { name: 'Blush Rose', color: '#D48C9E' },
                    { name: 'Champagne Silk', color: '#E8DCB8' },
                    { name: 'Sage Green', color: '#A3B899' },
                  ]}
                  finishesCountLabel="3 Hues"
                  id="stitch-prod-2"
                  imageUrl="https://lh3.googleusercontent.com/aida-public/AB6AXuBriZLHUAW-Pg3zLW9cE_rBZtV0SqvGUafafUEFxOAncBYL5ptTPvBL2Spk0txh8m-fHvQE2MzkI0P4sEl7c5RgperMyPdkA8BVZCOTW4jnXQqZU3OTUktQ1jZ5ZCzH_EMe-dMKJrvhrlO7RaTRxW5lqGf2O1oynFzb1KXIPtTtt7IlBbkYqCi8SWI5HY7D1nbqLIocdx3ApTOZSZeFIOu2qO5Vm5oohqB2kPA3cKJvWvrqgAvQwLPB"
                  onAddToCart={() => {
                    setCartCount((c) => c + 1);
                    setIsCartOpen(true);
                    showToast('Added Flora Silk Ribbon Scrunchie to Bag');
                  }}
                  onWishlistToggle={(active) => {
                    showToast(active ? 'Added to Wishlist' : 'Removed from Wishlist');
                  }}
                  price={950}
                  title="Flora Mulberry Ribbon Scrunchie"
                />

                {/* 3. Star Rating Pill & Attribute Tag */}
                <MobileProductCard
                  attributeTag="Adjustable Fit"
                  id="stitch-prod-3"
                  imageUrl="https://lh3.googleusercontent.com/aida-public/AB6AXuDlXSzSUg8so6DEwL_2eG7tIwZGz9AYlmms4E8MbmUUdo5y-D2AsXlVpVTi3eHSV8ESQpfssau0YRF6sS488353qvSOsqYsyaKClKHjjF_dH0LKIrlAQrRDEQDOBh7xNfG1tMonQEHjAPl5BeZNZCUW-aPX6zqoCqCZqzsMnwcIu7gtGp4wzXvYUibLPqnCDH2DsPgkNfDil-9l8utbxJvcocxw_a7P1sRMwEf95hJpm1a-C5ycg7pQ"
                  onAddToCart={() => {
                    setCartCount((c) => c + 1);
                    setIsCartOpen(true);
                    showToast('Added Vesper Sculpted Wave Cuff to Bag');
                  }}
                  onWishlistToggle={(active) => {
                    showToast(active ? 'Added to Wishlist' : 'Removed from Wishlist');
                  }}
                  price={2450}
                  rating={{ count: 34, score: 4.9 }}
                  title="Vesper Sculpted Wave Cuff"
                />

                {/* 4. Low Stock Scarcity Badge & 2 Tones */}
                <MobileProductCard
                  badge="Low Stock (3 left)"
                  badgeType="scarcity"
                  finishes={[
                    { name: 'Almond Milk', color: '#EADFD4' },
                    { name: 'Dark Espresso', color: '#482E25' },
                  ]}
                  finishesCountLabel="2 Tones"
                  id="stitch-prod-4"
                  imageUrl="https://lh3.googleusercontent.com/aida-public/AB6AXuDzxz-tccGm8hO7y-Pgp37tM19XWFHqj96UCxubUgMvv9VyWBLKfhzOde8xqiw7x8bpP5kS4q_SSm0mZlahVLleUSDvCD5fC5B5s7a7JiFou9API8A96U0EwfuQMIAUxcn8LV0XAI2eV_ntMHokMidVOPALimgRDTHD4F9_H3trkULYiYePNIwU-FBTtko9H4YCibsld_wGNDOh7wPATscJOm5um6fTjB-4e0yKl9iR1hYSZIBOP76v"
                  onAddToCart={() => {
                    setCartCount((c) => c + 1);
                    setIsCartOpen(true);
                    showToast('Added Sélene Crescent Mini Bag to Bag');
                  }}
                  onWishlistToggle={(active) => {
                    showToast(active ? 'Added to Wishlist' : 'Removed from Wishlist');
                  }}
                  price={3650}
                  title="Sélene Crescent Mini Bag"
                />

                {/* 5. Best Seller & Craft Attribute Tag */}
                <MobileProductCard
                  attributeTag="18k Gold Plated"
                  badge="Best Seller"
                  id="stitch-prod-5"
                  imageUrl="https://lh3.googleusercontent.com/aida-public/AB6AXuDEUyRSuchis8BrTrm6hVfHLJmVB51osJUN3VLL_fO9a7H5ytUja8bKPCRpXbM-GflhN8JHlowUPzbXC30LghN4iOzUwM5qG2ZE-JlwbSKFFoDSU7I1UHARutYIBUb1OIWcX81NIuMAYdGA12nw9tAPBShLnsomuMUlEw_3omWA5lnKVphK9aI0-JRBYntuAf0O3_uvsPKghVTekCV3CJUUHHMjk0TG0huZHwtJdG-7CEAhtnqeCTYF"
                  onAddToCart={() => {
                    setCartCount((c) => c + 1);
                    setIsCartOpen(true);
                    showToast('Added Petal & Dewdrop Layered Choker to Bag');
                  }}
                  onWishlistToggle={(active) => {
                    showToast(active ? 'Added to Wishlist' : 'Removed from Wishlist');
                  }}
                  price={1950}
                  title="Petal & Dewdrop Layered Choker"
                />

                {/* 6. Sold Out State with Scrim & Notify Action */}
                <MobileProductCard
                  attributeTag="Restocking Soon"
                  id="stitch-prod-6"
                  imageUrl="https://lh3.googleusercontent.com/aida-public/AB6AXuCcp0kQtKWyXQxXORp6oMlIv7kruGPkvNnmsn098HT7XfEDFyw15_3W-Ro2wuptp3x5VO4luMShLM4FICmjRw1vbTx2CmVRurQuL_52s0L8eEN5yHe5JMyBdlErRobAsMSr9pEXrX4DV3AUMyNkrVVhT_WUC2T5BCjB_dC_3xk6HAMNSwhqc0EjqjeDjE6-RVuqhFbzcxl_NaG8xdjEFskQalqMaG4nsvwbd969TBtxQOqaXzOYBNDx"
                  isSoldOut={true}
                  onNotifyMe={() => {
                    showToast("We will notify you via SMS/Email as soon as Adeline Pleated Scarf restocks!");
                  }}
                  onWishlistToggle={(active) => {
                    showToast(active ? 'Added to Wishlist' : 'Removed from Wishlist');
                  }}
                  price={1250}
                  title="Adeline Pleated Rose Scarf"
                />
              </div>
            </div>
          </div>

          {/* PART 2: DESKTOP PRODUCT CARD SPECIMEN (EXPANDED WITH HOVER INTERACTIONS) */}
          <div className="space-y-3 rounded-2xl border border-border/60 bg-surface-container-lowest p-4 sm:p-6 shadow-xs">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/40 pb-3">
              <div>
                <span className="block font-label-sm text-xs font-bold uppercase tracking-wider text-on-surface">
                  Desktop Product Cards (Expanded Viewport Experience)
                </span>
                <span className="text-[12px] text-on-surface-variant">
                  Enhanced for cursor pointer ergonomics: Slide-up &quot;Quick Add to Bag&quot; on image hover, secondary angle crossfade, multi-line typography, and subtitle specifications.
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-primary-fixed px-2.5 py-1 font-label-sm text-[10px] font-bold text-on-primary-fixed">
                  Hover for Quick Add &amp; Angle Flip
                </span>
              </div>
            </div>

            {/* Desktop 4-Column Shelf Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 pt-2">
              {/* Desktop Card 1: Hover for Quick Add & Secondary Angle Crossfade */}
              <DesktopProductCard
                badge="Editor's Pick"
                deliveryPill="Dhaka 24-48h Delivery"
                finishes={[
                  { name: 'Warm Gold Vermeil', color: '#E5C158' },
                  { name: 'Rose Gold Plated', color: '#E5A8A0' },
                ]}
                finishesCountLabel="2 Finishes"
                id="desktop-prod-1"
                imageUrl="https://lh3.googleusercontent.com/aida-public/AB6AXuAU8kN5Vdd-XFeUvL46CjxHeMIuqVlvOhzkxBeqEZbQrpiAvJAiT-7KIfOiRtN8aHnlzi4hl7xu93DUKF1LuLzY7_QV3v_7C9HV326W7qStkQMjNbSV9416GdaPdUvNT05egHsMOPWx_l2v_-w_bwM1u73AHYoiOqof4dI9HA21x3AGn1cFuS-IR6lPC7KsnlSwjexBjU1nzxRYx9mekEi6tr1w1Gj7NRsuBBgaH2bJjAiRGixv7mxx"
                initialWishlist={true}
                onAddToCart={() => {
                  setCartCount((c) => c + 1);
                  setIsCartOpen(true);
                  showToast('Quick-added Aurelia Baroque Pearl Drop to Bag');
                }}
                onWishlistToggle={(active) => {
                  showToast(active ? 'Added Aurelia Earrings to Wishlist' : 'Removed from Wishlist');
                }}
                originalPrice={2200}
                price={1850}
                rating={{ count: 38, score: 4.9 }}
                secondaryImageUrl="https://lh3.googleusercontent.com/aida-public/AB6AXuDEUyRSuchis8BrTrm6hVfHLJmVB51osJUN3VLL_fO9a7H5ytUja8bKPCRpXbM-GflhN8JHlowUPzbXC30LghN4iOzUwM5qG2ZE-JlwbSKFFoDSU7I1UHARutYIBUb1OIWcX81NIuMAYdGA12nw9tAPBShLnsomuMUlEw_3omWA5lnKVphK9aI0-JRBYntuAf0O3_uvsPKghVTekCV3CJUUHHMjk0TG0huZHwtJdG-7CEAhtnqeCTYF"
                subtitle="Hand-strung Freshwater Pearls • 18K Micro-Gold Vermeil"
                title="Aurelia Baroque Pearl Drop Earrings"
              />

              {/* Desktop Card 2: Low Stock Scarcity & Swatches */}
              <DesktopProductCard
                badge="Low Stock (3 left)"
                badgeType="scarcity"
                finishes={[
                  { name: 'Almond Milk', color: '#EADFD4' },
                  { name: 'Dark Espresso', color: '#482E25' },
                ]}
                finishesCountLabel="2 Tones"
                id="desktop-prod-2"
                imageUrl="https://lh3.googleusercontent.com/aida-public/AB6AXuDzxz-tccGm8hO7y-Pgp37tM19XWFHqj96UCxubUgMvv9VyWBLKfhzOde8xqiw7x8bpP5kS4q_SSm0mZlahVLleUSDvCD5fC5B5s7a7JiFou9API8A96U0EwfuQMIAUxcn8LV0XAI2eV_ntMHokMidVOPALimgRDTHD4F9_H3trkULYiYePNIwU-FBTtko9H4YCibsld_wGNDOh7wPATscJOm5um6fTjB-4e0yKl9iR1hYSZIBOP76v"
                onAddToCart={() => {
                  setCartCount((c) => c + 1);
                  setIsCartOpen(true);
                  showToast('Quick-added Sélene Mini Bag to Bag');
                }}
                onWishlistToggle={(active) => {
                  showToast(active ? 'Added Sélene Bag to Wishlist' : 'Removed from Wishlist');
                }}
                price={3650}
                subtitle="Almond Milk Vegan Leather • Brushed Gold Hardware"
                title="Sélene Crescent Architectural Mini Bag"
              />

              {/* Desktop Card 3: Best Seller & Rating */}
              <DesktopProductCard
                attributeTag="18k Gold Plated"
                badge="Best Seller"
                id="desktop-prod-3"
                imageUrl="https://lh3.googleusercontent.com/aida-public/AB6AXuDEUyRSuchis8BrTrm6hVfHLJmVB51osJUN3VLL_fO9a7H5ytUja8bKPCRpXbM-GflhN8JHlowUPzbXC30LghN4iOzUwM5qG2ZE-JlwbSKFFoDSU7I1UHARutYIBUb1OIWcX81NIuMAYdGA12nw9tAPBShLnsomuMUlEw_3omWA5lnKVphK9aI0-JRBYntuAf0O3_uvsPKghVTekCV3CJUUHHMjk0TG0huZHwtJdG-7CEAhtnqeCTYF"
                onAddToCart={() => {
                  setCartCount((c) => c + 1);
                  setIsCartOpen(true);
                  showToast('Quick-added Petal & Dewdrop Choker to Bag');
                }}
                onWishlistToggle={(active) => {
                  showToast(active ? 'Added Choker to Wishlist' : 'Removed from Wishlist');
                }}
                price={1950}
                rating={{ count: 42, score: 5.0 }}
                subtitle="Handcrafted Iridescent Mother of Pearl • Layered Fit"
                title="Petal &amp; Dewdrop Layered Choker"
              />

              {/* Desktop Card 4: Sold Out Overlay */}
              <DesktopProductCard
                attributeTag="Restocking Soon"
                id="desktop-prod-4"
                imageUrl="https://lh3.googleusercontent.com/aida-public/AB6AXuCcp0kQtKWyXQxXORp6oMlIv7kruGPkvNnmsn098HT7XfEDFyw15_3W-Ro2wuptp3x5VO4luMShLM4FICmjRw1vbTx2CmVRurQuL_52s0L8eEN5yHe5JMyBdlErRobAsMSr9pEXrX4DV3AUMyNkrVVhT_WUC2T5BCjB_dC_3xk6HAMNSwhqc0EjqjeDjE6-RVuqhFbzcxl_NaG8xdjEFskQalqMaG4nsvwbd969TBtxQOqaXzOYBNDx"
                isSoldOut={true}
                onNotifyMe={() => {
                  showToast("We will notify you via SMS/Email as soon as Adeline Pleated Scarf restocks!");
                }}
                onWishlistToggle={(active) => {
                  showToast(active ? 'Added Scarf to Wishlist' : 'Removed from Wishlist');
                }}
                price={1250}
                subtitle="Chiffon Micro-Pleated Weave • Delicate Scalloped Edges"
                title="Adeline Pleated Rose Scarf"
              />
            </div>
          </div>
        </section>

        {/* SECTION 11: TRUST BADGES SPECIMEN */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <span className="h-5 w-2 rounded-full bg-primary" />
            <h2 className="font-headline-lg-mobile text-headline-lg-mobile font-semibold text-on-surface">
              10. Trust &amp; Local Reassurance
            </h2>
          </div>
          <TrustBadges />
        </section>

        {/* SECTION 12: MODAL SHEETS & DRAWERS PREVIEW */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <span className="h-5 w-2 rounded-full bg-primary" />
            <h2 className="font-headline-lg-mobile text-headline-lg-mobile font-semibold text-on-surface">
              11. Slide-Up Overlays &amp; Drawers
            </h2>
          </div>
          <p className="text-body-sm text-on-surface-variant">
            Interactive bottom sheet dialogs crafted for mobile ergonomics with safe-area inset support.
          </p>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-surface-container-lowest p-4 shadow-xs space-y-2">
              <h3 className="font-headline-sm text-sm font-semibold text-on-surface">
                Shopping Bag Drawer (Cart)
              </h3>
              <p className="text-body-sm text-xs text-on-surface-variant">
                Includes shipping progress bar to ৳3,000 threshold, quantity steppers, and dual checkout actions.
              </p>
              <Button
                className="w-full"
                onClick={() => setIsCartOpen(true)}
                variant="primary"
              >
                <ShoppingBagIcon size={18} />
                <span>Open Shopping Bag Drawer</span>
              </Button>
            </div>

            <div className="rounded-xl bg-surface-container-lowest p-4 shadow-xs space-y-2">
              <h3 className="font-headline-sm text-sm font-semibold text-on-surface">
                Sort Collection Bottom Sheet
              </h3>
              <p className="text-body-sm text-xs text-on-surface-variant">
                Heirloom curation sorting with Dhaka vault labels, trending pills, and custom radio controls.
              </p>
              <Button
                className="w-full"
                onClick={() => setIsSortOpen(true)}
                variant="tonal"
              >
                <ArrowRightIcon className="rotate-90" size={18} />
                <span>Open Sort Bottom Sheet</span>
              </Button>
            </div>

            <div className="rounded-xl bg-surface-container-lowest p-4 shadow-xs space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="font-headline-sm text-sm font-semibold text-on-surface">
                  Filter Drawer (Refine Selection)
                </h3>
                {activeFilterCount > 0 && (
                  <span className="rounded-full bg-primary-fixed px-2 py-0.5 font-label-sm text-[10px] font-bold text-on-primary-fixed">
                    {activeFilterCount} Active
                  </span>
                )}
              </div>
              <p className="text-body-sm text-xs text-on-surface-variant">
                Price budget slider, palette swatches, material chips, and Dhaka express availability.
              </p>
              <div className="flex flex-col gap-2 pt-1">
                <Button
                  className="w-full"
                  onClick={() => setIsFilterOpen(true)}
                  variant="primary"
                >
                  <FilterIcon size={18} />
                  <span>Open Refine Selection Drawer</span>
                </Button>
                <div className="flex items-center justify-between rounded-lg bg-surface-container-low px-3 py-1.5">
                  <span className="font-label-sm text-xs text-on-surface-variant">
                    Catalog Bar Trigger:
                  </span>
                  <FilterTriggerButton
                    activeCount={activeFilterCount}
                    onClick={() => setIsFilterOpen(true)}
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 13: STOREFRONT NAVBAR ARCHITECTURE */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <span className="h-5 w-2 rounded-full bg-primary" />
            <h2 className="font-headline-lg-mobile text-headline-lg-mobile font-semibold text-on-surface">
              12. Storefront Navbars (Mobile &amp; Desktop 2-Row)
            </h2>
          </div>
          <p className="text-body-sm text-on-surface-variant">
            Dual-viewport navbar system. Mobile/Tablet focuses on pure brand logo, search expander, and cart badge (no hamburger, no account). Desktop expands to a luxury 2-row header with prominent search, express courier reassurance, badged utilities, and an interactive category mega-menu.
          </p>

          <div className="space-y-6">
            {/* Announcement Bar Specimen */}
            <div className="overflow-hidden rounded-2xl border border-border/60 bg-surface-container-lowest shadow-xs">
              <div className="border-b border-border/40 bg-surface-container-low px-4 py-2">
                <span className="font-label-sm text-xs font-bold uppercase tracking-wider text-on-surface">
                  Announcement Header Bar
                </span>
              </div>
              <AnnouncementBar dismissible={false} />
            </div>

            {/* Mobile & Tablet Specimen */}
            <div className="overflow-hidden rounded-2xl border border-border/60 bg-surface-container-lowest shadow-xs">
              <div className="border-b border-border/40 bg-surface-container-low px-4 py-2 flex items-center justify-between">
                <span className="font-label-sm text-xs font-bold uppercase tracking-wider text-on-surface">
                  Mobile &amp; Tablet Navbar Specimen (Viewport &lt; lg)
                </span>
                <span className="rounded-full bg-primary-fixed px-2 py-0.5 font-label-sm text-[10px] font-bold text-on-primary-fixed">
                  Stitch 1:1 Mobile Fidelity
                </span>
              </div>
              <div className="bg-surface/50 p-2">
                <MobileNavbar
                  cartCount={cartCount}
                  onOpenCart={() => setIsCartOpen(true)}
                  responsive={false}
                  storeName="Maevelle"
                />
              </div>
            </div>

            {/* Desktop Specimen */}
            <div className="overflow-hidden rounded-2xl border border-border/60 bg-surface-container-lowest shadow-xs">
              <div className="border-b border-border/40 bg-surface-container-low px-4 py-2 flex items-center justify-between">
                <span className="font-label-sm text-xs font-bold uppercase tracking-wider text-on-surface">
                  Desktop 2-Row Navbar Specimen (Viewport lg+)
                </span>
                <span className="rounded-full bg-primary px-2 py-0.5 font-label-sm text-[10px] font-bold text-white">
                  2-Row Luxury Architecture
                </span>
              </div>
              <div className="bg-surface/50 p-2 overflow-x-auto">
                <div className="min-w-[960px]">
                  <DesktopNavbar
                    cartCount={cartCount}
                    onOpenCart={() => setIsCartOpen(true)}
                    responsive={false}
                    storeName="Maevelle"
                    wishlistCount={5}
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 14: STOREFRONT FOOTER ARCHITECTURE */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <span className="h-5 w-2 rounded-full bg-primary" />
            <h2 className="font-headline-lg-mobile text-headline-lg-mobile font-semibold text-on-surface">
              13. Storefront Footers (Mobile &amp; Desktop Dual Architecture)
            </h2>
          </div>
          <p className="text-body-sm text-on-surface-variant">
            Dual-viewport footer system. Mobile &amp; Tablet maintains an ultra-minimal, clean footprint with a tactile Back to top scroller, safe-area bottom clearance so it never collides with fixed bottom navigation on phones, and an elegant 3-column spread on tablets. Desktop embraces a serene, airy warm-linen aesthetic with a quiet single-line newsletter signup, 3 spacious link columns, and understated payment notes.
          </p>

          <div className="space-y-6">
            {/* Mobile Footer Specimen */}
            <div className="overflow-hidden rounded-2xl border border-border/60 bg-surface-container-lowest shadow-xs">
              <div className="border-b border-border/40 bg-surface-container-low px-4 py-2 flex items-center justify-between">
                <span className="font-label-sm text-xs font-bold uppercase tracking-wider text-on-surface">
                  Mobile &amp; Tablet Footer Specimen (Viewport &lt; lg)
                </span>
                <span className="rounded-full bg-primary-fixed px-2 py-0.5 font-label-sm text-[10px] font-bold text-on-primary-fixed">
                  Minimal • Tablet-Optimized • BottomNav Safe
                </span>
              </div>
              <MobileFooter responsive={false} storeName="Maevelle" />
            </div>

            {/* Desktop Footer Specimen */}
            <div className="overflow-hidden rounded-2xl border border-border/60 bg-surface-container-lowest shadow-xs">
              <div className="border-b border-border/40 bg-surface-container-low px-4 py-2 flex items-center justify-between">
                <span className="font-label-sm text-xs font-bold uppercase tracking-wider text-on-surface">
                  Desktop Footer Specimen (Viewport lg+)
                </span>
                <span className="rounded-full bg-primary-fixed px-2 py-0.5 font-label-sm text-[10px] font-bold text-on-primary-fixed">
                  Serene &amp; Airy Linen Aesthetic
                </span>
              </div>
              <div className="overflow-x-auto">
                <div className="min-w-[960px]">
                  <DesktopFooter responsive={false} storeName="Maevelle" />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 14: REAL CUSTOMER PAGE - WISHLIST ARCHITECTURE */}
        <section className="space-y-6">
          <div className="flex items-center gap-2">
            <span className="h-5 w-2 rounded-full bg-primary" />
            <h2 className="font-headline-lg-mobile text-headline-lg-mobile font-semibold text-on-surface">
              14. Customer Page: Your Wishlist (Mobile Stitch 1:1 &amp; Desktop Atelier Split)
            </h2>
          </div>
          <p className="text-body-sm text-on-surface-variant max-w-3xl">
            First full customer workflow screen. Mobile view is an exact 1:1 implementation of the Stitch design system (horizontal thumbnail cards, category filter pills, stock scarcity tags, Banani studio private fitting note, and progressive Dhaka delivery bar). Desktop view elevates the experience with an editorial 2-column split, sticky order value sidebar, and direct cart transfers.
          </p>

          <div className="flex items-center gap-3">
            <Link
              className="inline-flex items-center gap-2 h-10 px-5 rounded-xl bg-primary text-on-primary font-label-md text-xs font-semibold shadow-xs hover:bg-primary-hover active:scale-98 transition-transform"
              href="/wishlist"
            >
              <span>Visit Live /wishlist Page</span>
              <ArrowRightIcon size={14} />
            </Link>
          </div>

          <div className="space-y-6">
            {/* Mobile Wishlist Specimen (Phone Shell) */}
            <div className="overflow-hidden rounded-2xl border border-border/60 bg-surface-container-lowest shadow-xs">
              <div className="border-b border-border/40 bg-surface-container-low px-4 py-2 flex items-center justify-between">
                <span className="font-label-sm text-xs font-bold uppercase tracking-wider text-on-surface">
                  Mobile &amp; Tablet Wishlist Specimen (Stitch 1:1 Extraction)
                </span>
                <span className="rounded-full bg-primary-fixed px-2 py-0.5 font-label-sm text-[10px] font-bold text-on-primary-fixed">
                  Viewport &lt; lg Touch Optimized
                </span>
              </div>
              <div className="p-4 sm:p-6 bg-surface/50">
                <div className="max-w-md mx-auto rounded-3xl bg-surface border border-border/60 overflow-hidden shadow-sm">
                  <WishlistPageShell mode="mobile" />
                </div>
              </div>
            </div>

            {/* Desktop Wishlist Specimen (Expanded Atelier Split) */}
            <div className="overflow-hidden rounded-2xl border border-border/60 bg-surface-container-lowest shadow-xs">
              <div className="border-b border-border/40 bg-surface-container-low px-4 py-2 flex items-center justify-between">
                <span className="font-label-sm text-xs font-bold uppercase tracking-wider text-on-surface">
                  Desktop Wishlist Specimen (Expanded 2-Column Split &amp; Sticky Sidebar)
                </span>
                <span className="rounded-full bg-primary-fixed px-2 py-0.5 font-label-sm text-[10px] font-bold text-on-primary-fixed">
                  Viewport lg+ Pointer Architecture
                </span>
              </div>
              <div className="bg-surface p-2 sm:p-4">
                <WishlistPageShell mode="desktop" />
              </div>
            </div>
          </div>
        </section>

        {/* 15. EXPRESS CHECKOUT SPECIMEN */}
        <section className="space-y-4 pt-8 border-t border-border/60">
          <div className="flex flex-col gap-1">
            <span className="font-label-sm text-xs font-bold uppercase tracking-wider text-secondary">
              15. Complete Checkout Experience
            </span>
            <h2 className="font-headline-md text-headline-md text-on-surface">
              Express Checkout (Stitch 1:1 Mobile &amp; 2-Column Desktop Atelier)
            </h2>
          </div>
          <p className="text-body-sm text-on-surface-variant max-w-3xl">
            High-conversion luxury checkout flow. Mobile view is a 1:1 extraction of the Stitch mobile design system featuring 3-step indicator, collapsible order summary accordion, 🇧🇩 +880 mobile verification, Dhaka Express vs Nationwide courier toggle, official bKash/Nagad &amp; COD payment selectors, Maevelle Bangladesh guarantee badges, and persistent bottom purchase bar. Desktop view expands into a 2-column atelier layout with a sticky order value sidebar.
          </p>

          <div className="flex items-center gap-3">
            <Link
              className="inline-flex items-center gap-2 h-10 px-5 rounded-xl bg-primary text-on-primary font-label-md text-xs font-semibold shadow-xs hover:bg-primary-hover active:scale-98 transition-transform"
              href="/checkout"
            >
              <span>Visit Live /checkout Page</span>
              <ArrowRightIcon size={14} />
            </Link>
          </div>

          <div className="space-y-6">
            {/* Mobile Checkout Specimen (Phone Shell) */}
            <div className="overflow-hidden rounded-2xl border border-border/60 bg-surface-container-lowest shadow-xs">
              <div className="border-b border-border/40 bg-surface-container-low px-4 py-2 flex items-center justify-between">
                <span className="font-label-sm text-xs font-bold uppercase tracking-wider text-on-surface">
                  Mobile Checkout Specimen (Stitch 1:1 Design Extraction)
                </span>
                <span className="rounded-full bg-primary-fixed px-2 py-0.5 font-label-sm text-[10px] font-bold text-on-primary-fixed">
                  Viewport &lt; lg Touch Enclosed
                </span>
              </div>
              <div className="p-4 sm:p-6 bg-surface/50">
                <div className="max-w-md mx-auto rounded-3xl bg-surface border border-border/60 overflow-hidden shadow-sm">
                  <CheckoutPageShell mode="mobile" />
                </div>
              </div>
            </div>

            {/* Desktop Checkout Specimen (Expanded 2-Column Split) */}
            <div className="overflow-hidden rounded-2xl border border-border/60 bg-surface-container-lowest shadow-xs">
              <div className="border-b border-border/40 bg-surface-container-low px-4 py-2 flex items-center justify-between">
                <span className="font-label-sm text-xs font-bold uppercase tracking-wider text-on-surface">
                  Desktop Checkout Specimen (Expanded 2-Column Atelier &amp; Sticky Summary)
                </span>
                <span className="rounded-full bg-primary-fixed px-2 py-0.5 font-label-sm text-[10px] font-bold text-on-primary-fixed">
                  Viewport lg+ Pointer Architecture
                </span>
              </div>
              <div className="bg-surface p-2 sm:p-4">
                <CheckoutPageShell mode="desktop" />
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* DRAWERS */}
      <CartDrawer
        isOpen={isCartOpen}
        onCheckout={() => {
          setIsCartOpen(false);
          showToast('Navigating to Secure Checkout…');
        }}
        onClose={() => setIsCartOpen(false)}
        onViewCart={() => {
          setIsCartOpen(false);
          showToast('Navigating to full cart page…');
        }}
      />

      <SortDrawer
        isOpen={isSortOpen}
        onClose={() => setIsSortOpen(false)}
        onSelectSort={(sort) => {
          setSelectedSort(sort);
          showToast(`Applied sort: ${sort}`);
        }}
        selectedSort={selectedSort}
      />

      <FilterDrawer
        initialFilters={drawerFilters}
        isOpen={isFilterOpen}
        onApply={(applied) => {
          setDrawerFilters(applied);
          const count =
            (applied.maxPrice < 5000 || applied.minPrice > 500 ? 1 : 0) +
            applied.colors.length +
            applied.materials.length +
            (applied.expressDelivery ? 1 : 0) +
            (applied.inStockOnly ? 1 : 0);
          showToast(`Applied filters (${count} active criteria)`);
        }}
        onClose={() => setIsFilterOpen(false)}
        resultCount={24}
      />

    </div>
  );
}
