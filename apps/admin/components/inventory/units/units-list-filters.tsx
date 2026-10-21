import { RefreshCw, Search, X } from 'lucide-react';
import type { UnitConditionDto, UnitStatusDto, WarehouseLocationDto } from '@maevelle/contracts';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';

export interface UnitsListFiltersProps {
  readonly search: string;
  readonly contextSku: string;
  readonly status: UnitStatusDto | '';
  readonly condition: UnitConditionDto | '';
  readonly locationId: string;
  readonly locations: readonly WarehouseLocationDto[];
  readonly shownCount: number;
  readonly totalCount: number;
  readonly loading: boolean;
  readonly hasActiveFilters: boolean;
  readonly onSearchChange: (value: string) => void;
  readonly onStatusChange: (value: UnitStatusDto | '') => void;
  readonly onConditionChange: (value: UnitConditionDto | '') => void;
  readonly onLocationChange: (value: string) => void;
  readonly onClearContextSku: () => void;
  readonly onReset: () => void;
  readonly onRefresh: () => void;
}

export function UnitsListFilters({
  search,
  contextSku,
  status,
  condition,
  locationId,
  locations,
  shownCount,
  totalCount,
  loading,
  hasActiveFilters,
  onSearchChange,
  onStatusChange,
  onConditionChange,
  onLocationChange,
  onClearContextSku,
  onReset,
  onRefresh,
}: UnitsListFiltersProps) {
  return (
    <div className="space-y-3 rounded-xl border bg-card p-4 shadow-2xs">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <label
            htmlFor="unit-search"
            className="mb-1 block text-[11px] font-medium text-muted-foreground"
          >
            Unit ID, barcode, SKU, or product
          </label>
          <div className="relative">
            <Search
              className="absolute left-2.5 top-2.5 size-4 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              id="unit-search"
              type="search"
              placeholder="MVU-000101, SKU, or product title"
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              className="h-9 pl-8 font-sans text-xs"
            />
          </div>
        </div>

        <div>
          <label
            htmlFor="unit-status-filter"
            className="mb-1 block text-[11px] font-medium text-muted-foreground"
          >
            Operational status
          </label>
          <NativeSelect
            id="unit-status-filter"
            value={status}
            onChange={(event) => onStatusChange(event.target.value as UnitStatusDto | '')}
            className="h-9 w-full text-xs"
          >
            <option value="">All statuses</option>
            <option value="AWAITING_QC">Awaiting QC</option>
            <option value="AVAILABLE">Available for sale</option>
            <option value="ON_HOLD">On hold</option>
            <option value="RESERVED">Reserved for order</option>
            <option value="IN_FULFILLMENT">In fulfillment</option>
            <option value="IN_TRANSFER">In transfer</option>
            <option value="DISPATCHED">Dispatched</option>
            <option value="RETURNED">Returned</option>
            <option value="WRITTEN_OFF">Written off</option>
          </NativeSelect>
        </div>

        <div>
          <label
            htmlFor="unit-condition-filter"
            className="mb-1 block text-[11px] font-medium text-muted-foreground"
          >
            Physical condition
          </label>
          <NativeSelect
            id="unit-condition-filter"
            value={condition}
            onChange={(event) => onConditionChange(event.target.value as UnitConditionDto | '')}
            className="h-9 w-full text-xs"
          >
            <option value="">All conditions</option>
            <option value="GRADE_A">Grade A</option>
            <option value="GRADE_B">Grade B</option>
            <option value="REPAIR_REQUIRED">Repair required</option>
            <option value="DAMAGED_UNSELLABLE">Damaged / unsellable</option>
          </NativeSelect>
        </div>

        <div>
          <label
            htmlFor="unit-location-filter"
            className="mb-1 block text-[11px] font-medium text-muted-foreground"
          >
            Location
          </label>
          <NativeSelect
            id="unit-location-filter"
            value={locationId}
            onChange={(event) => onLocationChange(event.target.value)}
            className="h-9 w-full text-xs"
          >
            <option value="">All permitted locations</option>
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name} ({location.code})
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-2">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>
            Showing <strong className="font-mono tabular-nums text-foreground">{shownCount}</strong>{' '}
            of <strong className="font-mono tabular-nums text-foreground">{totalCount}</strong>{' '}
            units
          </span>
          {contextSku ? (
            <Button variant="secondary" size="xs" onClick={onClearContextSku}>
              SKU <span className="font-mono">{contextSku}</span>
              <X aria-hidden="true" />
            </Button>
          ) : null}
          {hasActiveFilters ? (
            <Button variant="ghost" size="xs" onClick={onReset}>
              <X aria-hidden="true" /> Reset filters
            </Button>
          ) : null}
        </div>

        <Button variant="outline" size="xs" onClick={onRefresh} disabled={loading}>
          <RefreshCw className={loading ? 'animate-spin' : undefined} aria-hidden="true" />
          Refresh
        </Button>
      </div>
    </div>
  );
}
