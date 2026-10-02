'use client';

import { RotateCcw, Search, SlidersHorizontal, X } from 'lucide-react';
import type { AssetConditionDto, AssetOptionsDto, AssetStatusDto } from '@maevelle/contracts';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { humanizeAssetCode } from '@/lib/assets/format';
import type { AssetFilterState } from '../types';
import { useState } from 'react';

const allStatuses: readonly (AssetStatusDto | 'ALL')[] = [
  'ALL',
  'ACTIVE',
  'IN_STORAGE',
  'UNDER_REPAIR',
  'DAMAGED',
  'LOST',
  'SOLD',
  'DISPOSED',
];

const allConditions: readonly (AssetConditionDto | 'ALL')[] = [
  'ALL',
  'GOOD',
  'FAIR',
  'NEEDS_REPAIR',
  'DAMAGED',
];

interface AssetFiltersProps {
  filters: AssetFilterState;
  options: AssetOptionsDto | undefined;
  onChange: (updater: (prev: AssetFilterState) => AssetFilterState) => void;
  onRefresh: () => void;
}

export function AssetFilters({ filters, options, onChange, onRefresh }: AssetFiltersProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  const hasActiveFilters =
    Boolean(filters.search.trim()) ||
    filters.status !== 'ALL' ||
    filters.condition !== 'ALL' ||
    Boolean(filters.categoryId) ||
    Boolean(filters.locationId) ||
    Boolean(filters.custodianId);

  function resetFilters() {
    onChange((prev) => ({
      ...prev,
      search: '',
      status: 'ALL',
      condition: 'ALL',
      categoryId: '',
      locationId: '',
      custodianId: '',
      page: 1,
    }));
  }

  return (
    <Card>
      <CardContent className="grid gap-3 p-4">
        {/* Top search & primary filters */}
        <div className="grid gap-2.5 sm:grid-cols-[minmax(14rem,1fr)_auto_auto] lg:grid-cols-[minmax(16rem,1fr)_12rem_13rem_auto_auto]">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground pointer-events-none" />
            <Input
              className="pl-9 pr-8"
              value={filters.search}
              onChange={(e) => {
                const val = e.target.value;
                onChange((prev) => ({ ...prev, search: val, page: 1 }));
              }}
              placeholder="Search code (AST-…), name, serial, or model"
              aria-label="Search Assets"
            />
            {filters.search ? (
              <button
                type="button"
                onClick={() => onChange((prev) => ({ ...prev, search: '', page: 1 }))}
                className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
                aria-label="Clear search"
              >
                <X className="size-4" />
              </button>
            ) : null}
          </div>

          <NativeSelect
            value={filters.status}
            onChange={(e) =>
              onChange((prev) => ({
                ...prev,
                status: e.target.value as AssetStatusDto | 'ALL',
                page: 1,
              }))
            }
            aria-label="Filter by status"
          >
            {allStatuses.map((value) => (
              <option key={value} value={value}>
                {value === 'ALL' ? 'All statuses' : humanizeAssetCode(value)}
              </option>
            ))}
          </NativeSelect>

          <NativeSelect
            value={filters.categoryId}
            onChange={(e) => onChange((prev) => ({ ...prev, categoryId: e.target.value, page: 1 }))}
            aria-label="Filter by category"
          >
            <option value="">All categories</option>
            {options?.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </NativeSelect>

          <Button
            variant={showAdvanced ? 'secondary' : 'outline'}
            onClick={() => setShowAdvanced((v) => !v)}
            className="flex items-center gap-1.5"
          >
            <SlidersHorizontal className="size-4" />
            <span>More filters</span>
            {filters.condition !== 'ALL' || filters.locationId || filters.custodianId ? (
              <span className="ml-1 size-2 rounded-full bg-primary" />
            ) : null}
          </Button>

          <div className="flex gap-2">
            {hasActiveFilters ? (
              <Button variant="ghost" size="sm" onClick={resetFilters} title="Reset filters">
                <X className="size-4 mr-1" />
                Reset
              </Button>
            ) : null}
            <Button variant="outline" size="sm" onClick={onRefresh} title="Refresh data">
              <RotateCcw className="size-4" />
            </Button>
          </div>
        </div>

        {/* Advanced secondary filters */}
        {showAdvanced ? (
          <div className="grid gap-3 pt-3 border-t sm:grid-cols-3">
            <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
              Condition
              <NativeSelect
                value={filters.condition}
                onChange={(e) =>
                  onChange((prev) => ({
                    ...prev,
                    condition: e.target.value as AssetConditionDto | 'ALL',
                    page: 1,
                  }))
                }
              >
                {allConditions.map((cond) => (
                  <option key={cond} value={cond}>
                    {cond === 'ALL' ? 'Any condition' : humanizeAssetCode(cond)}
                  </option>
                ))}
              </NativeSelect>
            </label>

            <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
              Business Location
              <NativeSelect
                value={filters.locationId}
                onChange={(e) =>
                  onChange((prev) => ({ ...prev, locationId: e.target.value, page: 1 }))
                }
              >
                <option value="">All locations</option>
                {options?.locations.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.name} ({loc.code})
                  </option>
                ))}
              </NativeSelect>
            </label>

            <label className="grid gap-1.5 text-xs font-medium text-muted-foreground">
              Custodian / Assigned to
              <NativeSelect
                value={filters.custodianId}
                onChange={(e) =>
                  onChange((prev) => ({ ...prev, custodianId: e.target.value, page: 1 }))
                }
              >
                <option value="">All custodians</option>
                {options?.custodians.map((cust) => (
                  <option key={cust.id} value={cust.id}>
                    {cust.name}
                  </option>
                ))}
              </NativeSelect>
            </label>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
