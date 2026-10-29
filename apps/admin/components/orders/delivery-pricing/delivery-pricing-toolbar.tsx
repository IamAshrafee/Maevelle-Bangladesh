'use client';

import * as React from 'react';
import { AlignJustify, RotateCcw, Rows2, SlidersHorizontal } from 'lucide-react';

import { SearchInput } from '@/components/ui/search-input';
import { NativeSelect } from '@/components/ui/native-select';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

import type {
  DeliveryPricingScopeFilter,
  DeliveryPricingSortOption,
  DeliveryPricingStatusTab,
} from './types';

interface DeliveryPricingToolbarProps {
  readonly query: string;
  readonly onQueryChange: (query: string) => void;
  readonly activeTab: DeliveryPricingStatusTab;
  readonly onTabChange: (tab: DeliveryPricingStatusTab) => void;
  readonly scopeFilter: DeliveryPricingScopeFilter;
  readonly onScopeFilterChange: (scope: DeliveryPricingScopeFilter) => void;
  readonly sortOption: DeliveryPricingSortOption;
  readonly onSortOptionChange: (sort: DeliveryPricingSortOption) => void;
  readonly density: 'comfortable' | 'compact';
  readonly onDensityChange: (density: 'comfortable' | 'compact') => void;
  readonly totalCount: number;
  readonly filteredCount: number;
  readonly tabCounts: Record<DeliveryPricingStatusTab, number>;
}

export function DeliveryPricingToolbar({
  query,
  onQueryChange,
  activeTab,
  onTabChange,
  scopeFilter,
  onScopeFilterChange,
  sortOption,
  onSortOptionChange,
  density,
  onDensityChange,
  totalCount,
  filteredCount,
  tabCounts,
}: DeliveryPricingToolbarProps) {
  const hasActiveFilters =
    query.trim() !== '' || activeTab !== 'ALL' || scopeFilter !== 'ALL' || sortOption !== 'PRIORITY_DESC';

  function handleReset() {
    onQueryChange('');
    onTabChange('ALL');
    onScopeFilterChange('ALL');
    onSortOptionChange('PRIORITY_DESC');
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3 sm:p-4 shadow-2xs">
      {/* Top Row: Status Tabs + Density Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-3">
        <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto">
          {(
            [
              { key: 'ALL', label: 'All rules' },
              { key: 'ACTIVE', label: 'Active' },
              { key: 'INACTIVE', label: 'Inactive' },
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
                  className={`inline-flex items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-mono tabular-nums ${
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
            <TooltipContent>Compact row density</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Bottom Row: Search + Scope Filter + Sort + Reset */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
        <div className="flex-1 min-w-0">
          <SearchInput
            placeholder="Search by rule name, division, district, or country code…"
            value={query}
            onChange={onQueryChange}
            onClear={() => onQueryChange('')}
            className="w-full"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Scope Filter */}
          <div className="w-36 sm:w-40 shrink-0">
            <NativeSelect
              aria-label="Geographic scope"
              value={scopeFilter}
              onChange={(e) => onScopeFilterChange(e.target.value as DeliveryPricingScopeFilter)}
              className="h-9 text-xs"
            >
              <option value="ALL">All scopes</option>
              <option value="NATIONWIDE">Nationwide BD only</option>
              <option value="GEOGRAPHIC">Geographic overrides</option>
            </NativeSelect>
          </div>

          {/* Sort Option */}
          <div className="w-44 sm:w-48 shrink-0">
            <NativeSelect
              aria-label="Sort delivery pricing rules"
              value={sortOption}
              onChange={(e) => onSortOptionChange(e.target.value as DeliveryPricingSortOption)}
              className="h-9 text-xs"
            >
              <option value="PRIORITY_DESC">Priority: Highest first (Precedence)</option>
              <option value="AMOUNT_ASC">Rate: Low to high</option>
              <option value="AMOUNT_DESC">Rate: High to low</option>
              <option value="NAME_ASC">Rule name (A–Z)</option>
            </NativeSelect>
          </div>

          {/* Reset Filters */}
          {hasActiveFilters ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleReset}
              className="h-9 gap-1 text-xs text-muted-foreground hover:text-foreground shrink-0"
            >
              <RotateCcw className="size-3.5" />
              <span>Reset</span>
            </Button>
          ) : null}
        </div>
      </div>

      {/* Results Count Line */}
      {totalCount > 0 && (
        <div className="flex items-center justify-between text-xs text-muted-foreground pt-0.5">
          <span>
            Showing <strong className="text-foreground font-mono tabular-nums">{filteredCount}</strong> of{' '}
            <strong className="text-foreground font-mono tabular-nums">{totalCount}</strong> rules
          </span>
          {hasActiveFilters && (
            <span className="text-[11px] text-muted-foreground italic">Filtered results</span>
          )}
        </div>
      )}
    </div>
  );
}

