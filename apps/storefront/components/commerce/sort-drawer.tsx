'use client';

import { useEffect, useState } from 'react';

import { cx } from '@/components/ui/classnames';
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CheckIcon,
  ClockIcon,
  CloseIcon,
  FlameIcon,
  RotateCcwIcon,
  SparklesIcon,
  StarIcon,
} from '@/components/ui/icons';

export type SortOption =
  | 'featured'
  | 'newest'
  | 'popular'
  | 'price_asc'
  | 'price_desc'
  | 'rating';

export type SortDrawerProps = {
  isOpen: boolean;
  itemCount?: number;
  onClose: () => void;
  onSelectSort: (option: SortOption) => void;
  selectedSort: SortOption;
  vaultSubtitle?: string;
};

const sortOptions = [
  {
    id: 'featured' as SortOption,
    title: 'Featured & Curated',
    subtitle: 'Handpicked heritage picks for Dhaka',
    icon: SparklesIcon,
  },
  {
    id: 'newest' as SortOption,
    title: 'Newest Arrivals',
    subtitle: 'Freshly dispatched heirloom studio drops',
    icon: ClockIcon,
  },
  {
    id: 'popular' as SortOption,
    title: 'Most Popular',
    subtitle: 'Most loved by our Dhaka patrons',
    badge: 'Trending',
    icon: FlameIcon,
  },
  {
    id: 'price_asc' as SortOption,
    title: 'Price: Low to High',
    subtitle: 'Starts from ৳550',
    icon: ArrowUpIcon,
  },
  {
    id: 'price_desc' as SortOption,
    title: 'Price: High to Low',
    subtitle: 'Luxurious fine statement pieces first',
    icon: ArrowDownIcon,
  },
  {
    id: 'rating' as SortOption,
    title: 'Customer Rating',
    subtitle: 'Top-reviewed with 4.8★ and above',
    icon: StarIcon,
  },
];

export function SortDrawer({
  isOpen,
  itemCount = 48,
  onClose,
  onSelectSort,
  selectedSort = 'popular',
  vaultSubtitle = 'Dhaka Vault',
}: SortDrawerProps) {
  const [activeSort, setActiveSort] = useState<SortOption>(selectedSort);

  // Sync state when opened
  useEffect(() => {
    setActiveSort(selectedSort);
  }, [selectedSort, isOpen]);

  // Lock body scroll
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  const handleSelect = (optionId: SortOption) => {
    setActiveSort(optionId);
    onSelectSort(optionId);
    // Tactile auto-close after 200ms so the user sees the visual selection confirmation
    setTimeout(() => {
      onClose();
    }, 200);
  };

  const handleReset = () => {
    setActiveSort('featured');
    onSelectSort('featured');
    setTimeout(() => {
      onClose();
    }, 200);
  };

  if (!isOpen) return null;

  return (
    <div
      aria-label="Sort Collection"
      aria-modal="true"
      className="fixed inset-0 z-50 flex flex-col justify-end"
      role="dialog"
    >
      {/* Scrim Backdrop */}
      <div
        className="fixed inset-0 bg-[#1E1B19]/50 backdrop-blur-sm transition-opacity duration-300"
        onClick={onClose}
      />

      {/* Drawer Content Sheet */}
      <div className="relative z-10 flex max-h-[85vh] w-full flex-col overflow-hidden rounded-t-3xl bg-surface-container-lowest shadow-2xl transition-transform duration-300 ease-out sm:mx-auto sm:max-w-lg">
        {/* Top Grab Handle Bar */}
        <div className="flex w-full cursor-grab items-center justify-center pt-3 pb-1">
          <div className="h-1.5 w-12 rounded-full bg-surface-container-highest" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between border-b border-surface-container px-4 pt-2 pb-3">
          <div className="flex flex-col">
            <h2 className="font-serif text-[22px] font-semibold leading-tight text-on-surface">
              Sort Collection
            </h2>
            <span className="mt-0.5 font-label-sm text-[12px] font-normal text-on-surface-variant">
              {itemCount} Heirloom Pieces • {vaultSubtitle}
            </span>
          </div>
          <button
            aria-label="Close sort menu"
            className="flex h-9 w-9 shrink-0 aspect-square items-center justify-center rounded-full bg-surface-container-low text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface active:scale-95"
            onClick={onClose}
            type="button"
          >
            <CloseIcon size={18} />
          </button>
        </div>

        {/* Scrollable Options List */}
        <div className="divide-y divide-surface-container/60 overflow-y-auto py-2">
          {sortOptions.map((opt) => {
            const isSelected = activeSort === opt.id;
            const Icon = opt.icon;

            return (
              <label
                className={cx(
                  'group flex cursor-pointer items-center justify-between px-4 py-3.5 transition-colors select-none',
                  isSelected
                    ? 'bg-primary-fixed/20 hover:bg-primary-fixed/30'
                    : 'hover:bg-surface-container-low',
                )}
                key={opt.id}
                onClick={() => handleSelect(opt.id)}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={cx(
                      'flex size-9 shrink-0 items-center justify-center rounded-full transition-colors',
                      isSelected
                        ? 'bg-primary/10 text-primary'
                        : 'bg-surface-container text-on-surface-variant group-hover:text-primary',
                    )}
                  >
                    <Icon size={18} />
                  </div>
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                      <span
                        className={cx(
                          'font-headline-sm text-body-md transition-colors',
                          isSelected
                            ? 'font-semibold text-primary'
                            : 'font-medium text-on-surface group-hover:text-primary',
                        )}
                      >
                        {opt.title}
                      </span>
                      {opt.badge && (
                        <span className="rounded-full bg-primary px-1.5 py-0.5 font-label-sm text-[9px] font-bold tracking-wider text-white uppercase shadow-xs">
                          {opt.badge}
                        </span>
                      )}
                    </div>
                    <span className="text-body-sm text-[11px] text-on-surface-variant">
                      {opt.subtitle}
                    </span>
                  </div>
                </div>

                {/* Radio Selector */}
                {isSelected ? (
                  <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-white shadow-xs">
                    <CheckIcon className="text-white" size={14} strokeWidth="3" />
                  </div>
                ) : (
                  <div className="flex size-5 shrink-0 items-center justify-center rounded-full border border-outline-variant bg-transparent transition-colors group-hover:border-primary/40" />
                )}
              </label>
            );
          })}
        </div>

        {/* Bottom Action Footer with Reset Only */}
        <div className="border-t border-surface-container bg-surface-container-lowest p-4 pb-safe shadow-lg">
          <button
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-surface-container-low font-label-md text-label-md font-medium text-on-surface transition-colors hover:bg-surface-container active:scale-98"
            onClick={handleReset}
            type="button"
          >
            <RotateCcwIcon className="text-on-surface-variant" size={16} />
            <span>Reset to Default</span>
          </button>
        </div>
      </div>
    </div>
  );
}
