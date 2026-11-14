'use client';

import { useEffect, useState } from 'react';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { cx } from '@/components/ui/classnames';
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CheckIcon,
  ClockIcon,
  FlameIcon,
  RotateCcwIcon,
  SparklesIcon,
  StarIcon,
} from '@/components/ui/icons';

export type SortOption = 'featured' | 'newest' | 'popular' | 'price_asc' | 'price_desc' | 'rating';

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
    subtitle: 'Curated highlights & staff favorites',
    icon: SparklesIcon,
  },
  {
    id: 'newest' as SortOption,
    title: 'Newest Arrivals',
    subtitle: 'Latest additions to our collection',
    icon: ClockIcon,
  },
  {
    id: 'popular' as SortOption,
    title: 'Most Popular',
    subtitle: 'Most loved by our customers across Bangladesh',
    badge: 'Trending',
    icon: FlameIcon,
  },
  {
    id: 'price_asc' as SortOption,
    title: 'Price: Low to High',
    subtitle: 'Affordable finds first',
    icon: ArrowUpIcon,
  },
  {
    id: 'price_desc' as SortOption,
    title: 'Price: High to Low',
    subtitle: 'Fine statement pieces first',
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
  vaultSubtitle = 'Curated Collection',
}: SortDrawerProps) {
  const [activeSort, setActiveSort] = useState<SortOption>(selectedSort);

  // Sync state when opened
  useEffect(() => {
    setActiveSort(selectedSort);
  }, [selectedSort, isOpen]);

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

  return (
    <BottomSheet
      className="sm:max-w-lg"
      footer={
        <button
          className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-surface-container-low font-label-md text-label-md font-medium text-on-surface transition-colors hover:bg-surface-container active:scale-98 cursor-pointer"
          onClick={handleReset}
          type="button"
        >
          <RotateCcwIcon className="text-on-surface-variant" size={16} />
          <span>Reset to Default</span>
        </button>
      }
      isOpen={isOpen}
      onClose={onClose}
      subtitle={`${itemCount} Items · ${vaultSubtitle}`}
      title="Sort Collection"
    >
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
    </BottomSheet>
  );
}
