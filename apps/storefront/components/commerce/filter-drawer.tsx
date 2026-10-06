'use client';

import { useEffect, useState } from 'react';

import { cx } from '@/components/ui/classnames';
import {
  CheckIcon,
  CloseIcon,
  FilterIcon,
  InventoryIcon,
  RotateCcwIcon,
  SpeedIcon,
} from '@/components/ui/icons';

export type FilterValues = {
  colors: string[];
  expressDelivery: boolean;
  inStockOnly: boolean;
  materials: string[];
  maxPrice: number;
  minPrice: number;
};

export const DEFAULT_FILTER_VALUES: FilterValues = {
  colors: ['Crimson'],
  expressDelivery: true,
  inStockOnly: true,
  materials: ['Mulberry Silk'],
  maxPrice: 3400,
  minPrice: 500,
};

export const COLOR_SWATCHES = [
  { id: 'Crimson', name: 'Crimson', hex: '#7E0E35', textColor: 'text-white' },
  { id: 'Gold', name: 'Gold', hex: '#E5D3B3', textColor: 'text-on-surface' },
  { id: 'Pearl', name: 'Pearl', hex: '#FAF2EE', textColor: 'text-on-surface', hasBorder: true },
  { id: 'Noir', name: 'Noir', hex: '#1E1B19', textColor: 'text-white' },
  { id: 'Blush', name: 'Blush', hex: '#D4A3AE', textColor: 'text-on-surface' },
];

export const MATERIAL_OPTIONS = [
  'Freshwater Pearl',
  'Mulberry Silk',
  'Gold Vermeil',
  'Plush Velvet',
];

export type FilterDrawerProps = {
  initialFilters?: Partial<FilterValues>;
  isOpen: boolean;
  onApply: (filters: FilterValues) => void;
  onClose: () => void;
  resultCount?: number;
};

export function FilterDrawer({
  initialFilters,
  isOpen,
  onApply,
  onClose,
  resultCount = 24,
}: FilterDrawerProps) {
  const [filters, setFilters] = useState<FilterValues>({
    ...DEFAULT_FILTER_VALUES,
    ...initialFilters,
  });

  // Sync state when opened or initialFilters change
  useEffect(() => {
    if (isOpen) {
      setFilters({
        ...DEFAULT_FILTER_VALUES,
        ...initialFilters,
      });
    }
  }, [isOpen, initialFilters]);

  // Lock body scroll when open
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

  // Escape key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Count active filters
  const activeCount =
    (filters.maxPrice < 5000 || filters.minPrice > 500 ? 1 : 0) +
    filters.colors.length +
    filters.materials.length +
    (filters.expressDelivery ? 1 : 0) +
    (filters.inStockOnly ? 1 : 0);

  const toggleColor = (colorId: string) => {
    setFilters((prev) => {
      const exists = prev.colors.includes(colorId);
      return {
        ...prev,
        colors: exists ? prev.colors.filter((c) => c !== colorId) : [...prev.colors, colorId],
      };
    });
  };

  const toggleMaterial = (material: string) => {
    setFilters((prev) => {
      const exists = prev.materials.includes(material);
      return {
        ...prev,
        materials: exists
          ? prev.materials.filter((m) => m !== material)
          : [...prev.materials, material],
      };
    });
  };

  const handleReset = () => {
    const resetState: FilterValues = {
      minPrice: 500,
      maxPrice: 5000,
      colors: [],
      materials: [],
      expressDelivery: false,
      inStockOnly: false,
    };
    setFilters(resetState);
  };

  const handleApply = () => {
    onApply(filters);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      aria-label="Refine Selection"
      aria-modal="true"
      className="fixed inset-0 z-50 flex flex-col justify-end"
      role="dialog"
    >
      {/* Backdrop Scrim */}
      <div
        aria-hidden="true"
        className="fixed inset-0 bg-[#1E1B19]/50 backdrop-blur-xs transition-opacity duration-300"
        onClick={onClose}
      />

      {/* Drawer Content Sheet */}
      <div className="relative z-10 flex max-h-[85vh] w-full flex-col overflow-hidden rounded-t-3xl bg-surface-container-lowest shadow-2xl transition-transform duration-300 ease-out sm:mx-auto sm:max-w-lg">
        {/* Drag Bar Handle */}
        <div className="flex w-full cursor-grab items-center justify-center pt-3 pb-2">
          <div className="h-1.5 w-12 rounded-full bg-surface-container-highest" />
        </div>

        {/* Sheet Header */}
        <div className="flex items-center justify-between px-4 py-2">
          <div className="flex items-center gap-2">
            <h2 className="font-headline-md text-headline-md font-semibold text-on-surface">
              Refine Selection
            </h2>
            <span className="rounded-full bg-primary-fixed px-2 py-0.5 font-label-sm text-label-sm font-bold text-on-primary-fixed">
              {activeCount} active
            </span>
          </div>
          <button
            aria-label="Close filters"
            className="flex h-9 w-9 shrink-0 aspect-square items-center justify-center rounded-full bg-surface-container-low text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface active:scale-95"
            onClick={onClose}
            type="button"
          >
            <CloseIcon size={18} />
          </button>
        </div>

        {/* Scrollable Filter Body */}
        <div className="flex-1 space-y-5 overflow-y-auto px-4 py-2">
          {/* Price Range Slider */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="font-headline-sm text-headline-sm font-semibold text-on-surface">
                Price Budget
              </span>
              <span className="font-price-md text-price-md font-bold font-mono tabular-nums text-primary">
                ৳{filters.minPrice.toLocaleString()} – ৳{filters.maxPrice.toLocaleString()}
              </span>
            </div>
            <div className="relative w-full py-2">
              <input
                aria-label="Filter by maximum price"
                className="h-2 w-full cursor-pointer rounded-lg bg-surface-container accent-primary"
                max={5000}
                min={500}
                onChange={(e) =>
                  setFilters((prev) => ({
                    ...prev,
                    maxPrice: Number(e.target.value),
                  }))
                }
                step={100}
                type="range"
                value={filters.maxPrice}
              />
              <div className="mt-1.5 flex justify-between font-label-sm text-[11px] font-mono tabular-nums text-on-surface-variant">
                <span>৳500</span>
                <span>৳2,500</span>
                <span>৳5,000+</span>
              </div>
            </div>
          </div>

          {/* Color Palette Swatches */}
          <div>
            <span className="mb-2 block font-headline-sm text-headline-sm font-semibold text-on-surface">
              Palette &amp; Tones
            </span>
            <div className="grid grid-cols-5 gap-2.5">
              {COLOR_SWATCHES.map((swatch) => {
                const isSelected = filters.colors.includes(swatch.id);

                return (
                  <button
                    aria-label={`Filter by ${swatch.name}`}
                    aria-pressed={isSelected}
                    className="group flex flex-col items-center gap-1 cursor-pointer"
                    key={swatch.id}
                    onClick={() => toggleColor(swatch.id)}
                    type="button"
                  >
                    <span
                      className={cx(
                        'flex h-10 w-10 shrink-0 aspect-square items-center justify-center rounded-full shadow-xs transition-[box-shadow,transform]',
                        isSelected
                          ? 'ring-2 ring-primary ring-offset-2 ring-offset-surface-container-lowest'
                          : 'hover:scale-105',
                        swatch.hasBorder && 'border border-surface-container-high',
                        swatch.textColor,
                      )}
                      style={{ backgroundColor: swatch.hex }}
                    >
                      {isSelected && <CheckIcon size={16} strokeWidth="3" />}
                    </span>
                    <span
                      className={cx(
                        'font-label-sm text-[10px] transition-colors',
                        isSelected
                          ? 'font-semibold text-on-surface'
                          : 'text-on-surface-variant group-hover:text-on-surface',
                      )}
                    >
                      {swatch.name}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Material Category Chips */}
          <div>
            <span className="mb-2 block font-headline-sm text-headline-sm font-semibold text-on-surface">
              Primary Material
            </span>
            <div className="flex flex-wrap gap-2">
              {MATERIAL_OPTIONS.map((material) => {
                const isSelected = filters.materials.includes(material);

                return (
                  <button
                    aria-pressed={isSelected}
                    className={cx(
                      'h-9 rounded-lg px-3.5 font-label-md text-label-md transition-[background-color,color,transform] active:scale-95 cursor-pointer',
                      isSelected
                        ? 'bg-primary-fixed font-semibold text-on-primary-fixed'
                        : 'bg-surface-container text-on-surface hover:bg-surface-container-high',
                    )}
                    key={material}
                    onClick={() => toggleMaterial(material)}
                    type="button"
                  >
                    {material}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Delivery & Availability Toggles */}
          <div>
            <span className="mb-2 block font-headline-sm text-headline-sm font-semibold text-on-surface">
              Delivery &amp; Availability
            </span>
            <div className="space-y-2">
              {/* Dhaka 24-Hour Express */}
              <label className="flex cursor-pointer items-center justify-between rounded-xl bg-surface-container-low p-3 transition-colors hover:bg-surface-container/70 select-none">
                <div className="flex items-center gap-2.5">
                  <SpeedIcon className="text-primary" size={20} />
                  <div>
                    <div className="font-label-md text-label-md font-semibold text-on-surface">
                      Dhaka 24-Hour Express
                    </div>
                    <div className="font-body-sm text-[11px] text-on-surface-variant">
                      Guaranteed fast dispatch
                    </div>
                  </div>
                </div>
                <input
                  checked={filters.expressDelivery}
                  className="h-5 w-5 cursor-pointer rounded accent-primary"
                  onChange={(e) =>
                    setFilters((prev) => ({
                      ...prev,
                      expressDelivery: e.target.checked,
                    }))
                  }
                  type="checkbox"
                />
              </label>

              {/* In Stock Only */}
              <label className="flex cursor-pointer items-center justify-between rounded-xl bg-surface-container-low p-3 transition-colors hover:bg-surface-container/70 select-none">
                <div className="flex items-center gap-2.5">
                  <InventoryIcon className="text-on-surface-variant" size={20} />
                  <div>
                    <div className="font-label-md text-label-md font-semibold text-on-surface">
                      In Stock Only
                    </div>
                    <div className="font-body-sm text-[11px] text-on-surface-variant">
                      Exclude pre-orders
                    </div>
                  </div>
                </div>
                <input
                  checked={filters.inStockOnly}
                  className="h-5 w-5 cursor-pointer rounded accent-primary"
                  onChange={(e) =>
                    setFilters((prev) => ({
                      ...prev,
                      inStockOnly: e.target.checked,
                    }))
                  }
                  type="checkbox"
                />
              </label>
            </div>
          </div>
        </div>

        {/* Action Footer */}
        <div className="flex items-center gap-2 border-t border-surface-container bg-surface-container-lowest p-4 pb-safe shadow-lg">
          <button
            className="flex h-12 items-center justify-center gap-1.5 rounded-xl bg-surface-container-low px-5 font-label-md text-label-md font-medium text-on-surface transition-colors hover:bg-surface-container active:scale-98 cursor-pointer"
            onClick={handleReset}
            type="button"
          >
            <RotateCcwIcon className="text-on-surface-variant" size={16} />
            <span>Reset</span>
          </button>
          <button
            className="flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 font-headline-sm text-headline-sm font-semibold text-white shadow-md transition-[background-color,transform] hover:bg-primary-hover active:scale-98 cursor-pointer"
            onClick={handleApply}
            type="button"
          >
            <span>Apply Filters</span>
            <span className="rounded-full bg-primary-container px-2 py-0.5 text-xs font-bold text-white">
              {resultCount} Pieces
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}

export type FilterTriggerButtonProps = {
  activeCount?: number;
  className?: string;
  onClick: () => void;
};

export function FilterTriggerButton({
  activeCount = 0,
  className,
  onClick,
}: FilterTriggerButtonProps) {
  return (
    <button
      aria-label={`Open filters${activeCount > 0 ? ` (${activeCount} active)` : ''}`}
      className={cx(
        'flex h-11 items-center gap-2 rounded-xl bg-surface-container-low px-3.5 font-label-md text-label-md text-on-surface shadow-xs transition-[background-color,transform] hover:bg-surface-container active:scale-95 cursor-pointer',
        className,
      )}
      onClick={onClick}
      type="button"
    >
      <FilterIcon className="text-primary" size={18} />
      <span className="font-semibold">Filter</span>
      {activeCount > 0 && (
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary font-label-sm text-[10px] font-bold text-white">
          {activeCount}
        </span>
      )}
    </button>
  );
}
