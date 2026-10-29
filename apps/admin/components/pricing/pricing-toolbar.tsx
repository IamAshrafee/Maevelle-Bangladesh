'use client';

import * as React from 'react';
import { AlignJustify, RotateCcw, Rows2 } from 'lucide-react';

import { SearchInput } from '@/components/ui/search-input';
import { NativeSelect } from '@/components/ui/native-select';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export type PricingFilterTab = 'ALL' | 'LIVE_ACTIVE' | 'UPCOMING' | 'DRAFT' | 'ARCHIVED';

interface PricingToolbarProps {
  readonly query: string;
  readonly onQueryChange: (query: string) => void;
  readonly activeTab: PricingFilterTab;
  readonly onTabChange: (tab: PricingFilterTab) => void;
  readonly currency: string;
  readonly onCurrencyChange: (currency: string) => void;
  readonly density: 'comfortable' | 'compact';
  readonly onDensityChange: (density: 'comfortable' | 'compact') => void;
  readonly totalCount: number;
  readonly filteredCount: number;
  readonly tabCounts: Record<PricingFilterTab, number>;
}

export function PricingToolbar({
  query,
  onQueryChange,
  activeTab,
  onTabChange,
  currency,
  onCurrencyChange,
  density,
  onDensityChange,
  totalCount,
  filteredCount,
  tabCounts,
}: PricingToolbarProps) {
  const hasActiveFilters = query.trim() !== '' || currency !== 'ALL' || activeTab !== 'ALL';

  function handleReset() {
    onQueryChange('');
    onCurrencyChange('ALL');
    onTabChange('ALL');
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3 sm:p-4 shadow-2xs">
      {/* Top Row: Tab Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-3">
        <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto">
          {(
            [
              { key: 'ALL', label: 'All Definitions' },
              { key: 'LIVE_ACTIVE', label: 'Live Active' },
              { key: 'UPCOMING', label: 'Scheduled Campaigns' },
              { key: 'DRAFT', label: 'Drafts' },
              { key: 'ARCHIVED', label: 'Archived' },
            ] as const
          ).map((tab) => {
            const isSelected = activeTab === tab.key;
            const count = tabCounts[tab.key] ?? 0;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => onTabChange(tab.key)}
                className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors cursor-pointer select-none ${
                  isSelected
                    ? 'bg-primary text-primary-foreground shadow-2xs'
                    : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`inline-flex items-center justify-center rounded-full px-1.5 py-0.2 text-[10px] font-mono tabular-nums ${
                    isSelected
                      ? 'bg-primary-foreground/20 text-primary-foreground'
                      : 'bg-background/80 text-muted-foreground'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* View density toggle */}
        <div className="flex items-center gap-1 shrink-0">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant={density === 'comfortable' ? 'secondary' : 'ghost'}
                  size="sm"
                  className="h-8 px-2"
                  onClick={() => onDensityChange('comfortable')}
                  aria-label="Comfortable density"
                />
              }
            >
              <AlignJustify className="size-3.5" aria-hidden="true" />
            </TooltipTrigger>
            <TooltipContent>Comfortable row density</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant={density === 'compact' ? 'secondary' : 'ghost'}
                  size="sm"
                  className="h-8 px-2"
                  onClick={() => onDensityChange('compact')}
                  aria-label="Compact density"
                />
              }
            >
              <Rows2 className="size-3.5" aria-hidden="true" />
            </TooltipTrigger>
            <TooltipContent>Compact high-volume density</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Bottom Row: Search & Dropdown Filters */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
        <div className="flex-1 min-w-0 max-w-md">
          <SearchInput
            value={query}
            onChange={onQueryChange}
            onClear={() => onQueryChange('')}
            placeholder="Search by product, SKU, or currency…"
            shortcut="/"
            aria-label="Search prices"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Currency Filter */}
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span>Currency:</span>
            <NativeSelect
              size="sm"
              value={currency}
              onChange={(e) => onCurrencyChange(e.target.value)}
              aria-label="Filter by currency"
            >
              <option value="ALL">All Currencies</option>
              <option value="BDT">BDT (৳ Bangladeshi Taka)</option>
              <option value="USD">USD ($ US Dollar)</option>
              <option value="CNY">CNY (¥ Chinese Yuan)</option>
            </NativeSelect>
          </div>

          {/* Reset Filters Button */}
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleReset}
              className="h-8 text-xs text-muted-foreground hover:text-foreground gap-1"
            >
              <RotateCcw className="size-3" aria-hidden="true" />
              Reset
            </Button>
          )}

          {/* Counter info */}
          <div className="text-xs text-muted-foreground pl-1">
            <span className="font-mono tabular-nums font-semibold text-foreground">
              {filteredCount}
            </span>
            {filteredCount !== totalCount ? (
              <span> of {totalCount}</span>
            ) : null}{' '}
            <span>{filteredCount === 1 ? 'price' : 'prices'}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

