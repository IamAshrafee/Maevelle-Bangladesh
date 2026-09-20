'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  Calculator,
  CheckCircle2,
  RefreshCcw,
  Search,
  X,
  Package,
  ArrowRight,
  History,
  AlertTriangle,
  Loader2,
  Building2,
  ArrowLeft,
  Layers,
} from 'lucide-react';
import { z } from 'zod';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import { inventoryRequest } from '@/lib/inventory/api';
import type {
  InventoryItemChoiceDto,
  InventoryBalanceDto,
  PaginatedDto,
  WarehouseLocationDto,
} from '@maevelle/contracts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { OperationalFeedback } from '@/components/operational-worklist';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// ─── Constants ───────────────────────────────────────────────────────────────

type ConditionKey = 'SELLABLE' | 'DAMAGED' | 'QUARANTINE' | 'INSPECTION';

const CONDITIONS = [
  {
    value: 'SELLABLE',
    label: 'Sellable',
    description: 'Available for order fulfillment and stock reservation',
  },
  {
    value: 'DAMAGED',
    label: 'Damaged',
    description: 'Defective or broken stock, excluded from sale',
  },
  {
    value: 'QUARANTINE',
    label: 'Quarantine',
    description: 'Held pending quality, safety, or compliance review',
  },
  {
    value: 'INSPECTION',
    label: 'Inspection',
    description: 'Awaiting intake examination or QA testing',
  },
] as const;

const REASON_CODES = [
  {
    value: 'CORRECTION',
    label: 'Correction (Cycle Count)',
    description: 'Variance discovered during physical cycle count',
  },
  {
    value: 'DAMAGE',
    label: 'Damage / Shrinkage',
    description: 'Spoilage, broken items, or transit damage',
  },
  {
    value: 'FOUND_STOCK',
    label: 'Found Stock',
    description: 'Unaccounted physical stock recovered in warehouse',
  },
  {
    value: 'OPENING_BALANCE',
    label: 'Opening Balance',
    description: 'Initial intake during warehouse onboarding',
  },
  {
    value: 'OTHER',
    label: 'Other Adjustment',
    description: 'Miscellaneous operational adjustment with note',
  },
] as const;

// ─── Schemas ─────────────────────────────────────────────────────────────────

const adjustSchema = z.object({
  variantId: z.string().min(1, 'Select a product variant'),
  locationId: z.string().min(1, 'Select an active warehouse location'),
  condition: z.enum(['SELLABLE', 'DAMAGED', 'QUARANTINE', 'INSPECTION']),
  quantityDelta: z
    .string()
    .trim()
    .regex(/^-?\d+(?:\.\d{1,6})?$/, 'Enter a valid whole or decimal number (e.g. 5 or -2)')
    .refine((val) => {
      const n = Number(val);
      return Number.isFinite(n) && n !== 0;
    }, 'Adjustment cannot be zero'),
  reasonCode: z.enum(['OPENING_BALANCE', 'CORRECTION', 'DAMAGE', 'FOUND_STOCK', 'OTHER']),
  note: z.string().optional(),
});

const conditionSchema = z
  .object({
    variantId: z.string().min(1, 'Select a product variant'),
    locationId: z.string().min(1, 'Select an active warehouse location'),
    fromCondition: z.enum(['SELLABLE', 'DAMAGED', 'QUARANTINE', 'INSPECTION']),
    toCondition: z.enum(['SELLABLE', 'DAMAGED', 'QUARANTINE', 'INSPECTION']),
    quantity: z
      .string()
      .trim()
      .regex(/^\d+(?:\.\d{1,6})?$/, 'Enter a valid positive number (e.g. 3)')
      .refine((val) => {
        const n = Number(val);
        return Number.isFinite(n) && n > 0;
      }, 'Quantity must be greater than zero'),
    reason: z.string().optional(),
  })
  .refine((d) => d.fromCondition !== d.toCondition, {
    message: 'From and To conditions must be different',
    path: ['toCondition'],
  });

type AdjustForm = z.infer<typeof adjustSchema>;
type ConditionForm = z.infer<typeof conditionSchema>;

interface ConditionBalances {
  SELLABLE: number;
  DAMAGED: number;
  QUARANTINE: number;
  INSPECTION: number;
  reserved: number;
  availableToSell: number;
}

const DEFAULT_BALANCES: ConditionBalances = {
  SELLABLE: 0,
  DAMAGED: 0,
  QUARANTINE: 0,
  INSPECTION: 0,
  reserved: 0,
  availableToSell: 0,
};

// ─── Enhanced Variant Search Typeahead ─────────────────────────────────────────

interface VariantSearchProps {
  onSelect: (variant: InventoryItemChoiceDto) => void;
  selectedVariant: InventoryItemChoiceDto | null;
  onClear: () => void;
  error?: string | undefined;
}

function VariantSearch({ onSelect, selectedVariant, onClear, error }: VariantSearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<readonly InventoryItemChoiceDto[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const search = useCallback(async (term: string) => {
    if (!term.trim()) {
      setResults([]);
      setOpen(false);
      return;
    }
    setSearching(true);
    try {
      const res = await inventoryRequest<{ data: PaginatedDto<InventoryItemChoiceDto> }>(
        `/inventory/items?search=${encodeURIComponent(term)}&catalogStatus=ACTIVE&limit=20`,
      );
      setResults(res.data.items ?? []);
      setOpen(true);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  const handleInput = (value: string) => {
    setQuery(value);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => search(value), 300);
  };

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  if (selectedVariant) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/40 p-2.5 sm:p-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="size-8 rounded-md bg-primary/10 flex items-center justify-center shrink-0 text-primary">
            <Package className="size-4" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-sm truncate">{selectedVariant.productTitle}</span>
              <span className="font-mono text-xs text-muted-foreground">({selectedVariant.sku})</span>
            </div>
            {selectedVariant.optionSummary ? (
              <p className="text-xs text-muted-foreground truncate">{selectedVariant.optionSummary}</p>
            ) : null}
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onClear}
          className="size-8 p-0 text-muted-foreground hover:text-destructive shrink-0"
          title="Change variant"
        >
          <X className="size-4" />
        </Button>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground pointer-events-none" />
        <Input
          placeholder="Search product by title, SKU, or option..."
          className="pl-9 text-sm h-9"
          value={query}
          onChange={(e) => handleInput(e.target.value)}
          onFocus={() => {
            if (results.length > 0) setOpen(true);
          }}
          autoComplete="off"
        />
        {searching ? (
          <Loader2 className="absolute right-3 top-2.5 size-4 animate-spin text-muted-foreground" />
        ) : null}
      </div>
      {error ? <p className="mt-1 text-xs font-medium text-destructive">{error}</p> : null}

      {open ? (
        <div className="absolute z-50 mt-1 w-full rounded-lg border bg-popover shadow-lg max-h-64 overflow-auto divide-y divide-border/60">
          {searching ? (
            <p className="px-3 py-2.5 text-xs text-muted-foreground flex items-center gap-2">
              <Loader2 className="size-3.5 animate-spin" /> Searching inventory catalog…
            </p>
          ) : results.length === 0 ? (
            <p className="px-3 py-3 text-xs text-muted-foreground text-center">
              No active product variants found matching &ldquo;{query}&rdquo;.
            </p>
          ) : (
            results.map((r) => (
              <button
                key={r.variantId}
                type="button"
                className="w-full flex items-start gap-3 px-3 py-2.5 text-left text-sm hover:bg-muted/70 transition-colors"
                onClick={() => {
                  onSelect(r);
                  setQuery('');
                  setOpen(false);
                }}
              >
                <Package className="size-4 text-muted-foreground mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-sm truncate">{r.productTitle}</span>
                    <span className="font-mono text-xs text-muted-foreground shrink-0">{r.sku}</span>
                  </div>
                  {r.optionSummary ? (
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{r.optionSummary}</p>
                  ) : null}
                </div>
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

// ─── Location Selector ────────────────────────────────────────────────────────

function LocationSelect({
  value,
  onChange,
  locations,
  loading,
  error,
  id,
}: {
  value: string;
  onChange: (v: string) => void;
  locations: WarehouseLocationDto[];
  loading: boolean;
  error?: string | undefined;
  id: string;
}) {
  return (
    <div className="space-y-1">
      <Select value={value} onValueChange={(v) => onChange(v ?? '')} disabled={loading}>
        <SelectTrigger id={id} className="h-9 text-sm">
          <SelectValue placeholder={loading ? 'Loading locations…' : 'Select warehouse facility'} />
        </SelectTrigger>
        <SelectContent>
          {locations.map((loc) => (
            <SelectItem
              key={loc.id}
              value={loc.id}
              label={`${loc.name} (${loc.code})`}
              description={`${loc.locationType.replace('_', ' ')} · Active`}
            >
              {loc.name}
              <span className="ml-1.5 text-xs text-muted-foreground font-mono">({loc.code})</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error ? <p className="text-xs font-medium text-destructive">{error}</p> : null}
    </div>
  );
}

// ─── Live Condition Balances Panel ────────────────────────────────────────────

function StockBalancePanel({
  balances,
  loading,
  variant,
  location,
}: {
  balances: ConditionBalances;
  loading: boolean;
  variant: InventoryItemChoiceDto | null;
  location: WarehouseLocationDto | null;
}) {
  if (!variant || !location) return null;

  const totalOnHand =
    balances.SELLABLE + balances.DAMAGED + balances.QUARANTINE + balances.INSPECTION;

  return (
    <div className="rounded-lg border bg-muted/20 p-3 sm:p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2.5">
        <div className="flex items-center gap-2 text-xs font-medium">
          <Building2 className="size-3.5 text-muted-foreground" />
          <span>{location.name}</span>
          <span className="font-mono text-muted-foreground">({location.code})</span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">Total On-Hand:</span>
          {loading ? (
            <Loader2 className="size-3 animate-spin text-muted-foreground" />
          ) : (
            <span className="font-mono font-semibold">{totalOnHand} units</span>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-2 text-xs text-muted-foreground">
          <Loader2 className="mr-1.5 size-3.5 animate-spin text-primary" /> Fetching live facility
          stock…
        </div>
      ) : totalOnHand === 0 ? (
        <p className="text-xs text-muted-foreground py-1">
          Zero recorded units at this facility. Introduce stock using a positive adjustment or Opening
          Balance.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 text-xs">
          {/* Sellable */}
          <div className="rounded-md border bg-background p-2">
            <div className="text-muted-foreground text-[11px] font-medium">Sellable</div>
            <div className="font-mono font-bold text-base mt-0.5 text-foreground">
              {balances.SELLABLE}
            </div>
            <div className="text-[10px] text-muted-foreground mt-0.5">
              {balances.availableToSell} avail. · {balances.reserved} reserved
            </div>
          </div>

          {/* Damaged */}
          <div className="rounded-md border bg-background p-2">
            <div className="text-muted-foreground text-[11px] font-medium">Damaged</div>
            <div
              className={`font-mono font-bold text-base mt-0.5 ${
                balances.DAMAGED > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'
              }`}
            >
              {balances.DAMAGED}
            </div>
            <div className="text-[10px] text-muted-foreground mt-0.5">Unsellable stock</div>
          </div>

          {/* Quarantine */}
          <div className="rounded-md border bg-background p-2">
            <div className="text-muted-foreground text-[11px] font-medium">Quarantine</div>
            <div
              className={`font-mono font-bold text-base mt-0.5 ${
                balances.QUARANTINE > 0 ? 'text-purple-600 dark:text-purple-400' : 'text-muted-foreground'
              }`}
            >
              {balances.QUARANTINE}
            </div>
            <div className="text-[10px] text-muted-foreground mt-0.5">Under review</div>
          </div>

          {/* Inspection */}
          <div className="rounded-md border bg-background p-2">
            <div className="text-muted-foreground text-[11px] font-medium">Inspection</div>
            <div
              className={`font-mono font-bold text-base mt-0.5 ${
                balances.INSPECTION > 0 ? 'text-blue-600 dark:text-blue-400' : 'text-muted-foreground'
              }`}
            >
              {balances.INSPECTION}
            </div>
            <div className="text-[10px] text-muted-foreground mt-0.5">Pending intake QA</div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function AdjustmentsSection() {
  const router = useRouter();
  const searchParameters = useSearchParams();
  const initialVariantId = searchParameters.get('variantId');
  const initialSku = searchParameters.get('sku');
  const initialLocationId = searchParameters.get('locationId');
  const initialTab = searchParameters.get('tab') === 'condition' ? 'condition' : 'adjustment';

  const [activeTab, setActiveTab] = useState<'adjustment' | 'condition'>(initialTab);
  const [locations, setLocations] = useState<WarehouseLocationDto[]>([]);
  const [loadingLocations, setLoadingLocations] = useState(true);

  // Shared selection context across both tabs
  const [selectedVariant, setSelectedVariant] = useState<InventoryItemChoiceDto | null>(null);
  const [selectedLocationId, setSelectedLocationId] = useState<string>(initialLocationId || '');
  const [balances, setBalances] = useState<ConditionBalances>(DEFAULT_BALANCES);
  const [loadingBalances, setLoadingBalances] = useState(false);

  // Success result tracking
  const [successInfo, setSuccessInfo] = useState<{
    message: string;
    transactionId?: string | undefined;
    sku?: string | undefined;
  } | null>(null);

  // Idempotency keys per form
  const adjKey = useRef(crypto.randomUUID());
  const condKey = useRef(crypto.randomUUID());

  // Filter locations strictly to active stock-holding facilities
  const stockLocations = useMemo(
    () =>
      locations.filter(
        (loc) => loc.status === 'ACTIVE' && loc.capabilities.includes('STOCK_HOLDING'),
      ),
    [locations],
  );

  const selectedLocation = useMemo(
    () => stockLocations.find((l) => l.id === selectedLocationId) ?? null,
    [stockLocations, selectedLocationId],
  );

  // Fetch warehouse facilities
  useEffect(() => {
    let active = true;
    inventoryRequest<{ data: WarehouseLocationDto[] }>('/warehouse/locations')
      .then((res) => {
        if (!active) return;
        const list = res.data ?? [];
        setLocations(list);
        if (
          initialLocationId &&
          list.some(
            (l) =>
              l.id === initialLocationId &&
              l.status === 'ACTIVE' &&
              l.capabilities.includes('STOCK_HOLDING'),
          )
        ) {
          setSelectedLocationId(initialLocationId);
        }
      })
      .catch(console.error)
      .finally(() => {
        if (active) setLoadingLocations(false);
      });
    return () => {
      active = false;
    };
  }, [initialLocationId]);

  // Pre-load variant if specified in URL query
  useEffect(() => {
    const query = initialVariantId
      ? `variantId=${encodeURIComponent(initialVariantId)}`
      : initialSku
        ? `sku=${encodeURIComponent(initialSku)}`
        : '';
    if (!query) return;

    const controller = new AbortController();
    inventoryRequest<{ data: PaginatedDto<InventoryItemChoiceDto> }>(
      `/inventory/items?${query}&catalogStatus=ACTIVE&limit=1`,
      { signal: controller.signal },
    )
      .then(({ data }) => {
        const item = data.items[0];
        if (item) {
          setSelectedVariant(item);
        }
      })
      .catch((err) => {
        if (!(err instanceof DOMException && err.name === 'AbortError')) {
          console.error('Failed to pre-load variant:', err);
        }
      });

    return () => controller.abort();
  }, [initialSku, initialVariantId]);

  // Fetch real-time balances whenever variant + location are selected
  useEffect(() => {
    if (!selectedVariant || !selectedLocationId) {
      setBalances(DEFAULT_BALANCES);
      return;
    }

    let active = true;
    setLoadingBalances(true);

    inventoryRequest<{ data: PaginatedDto<InventoryBalanceDto> }>(
      `/inventory/stock?locationId=${selectedLocationId}&search=${encodeURIComponent(
        selectedVariant.sku,
      )}&limit=10`,
    )
      .then((res) => {
        if (!active) return;
        const matching = (res.data?.items || []).filter(
          (b) => b.variantId === selectedVariant.variantId,
        );

        const agg: ConditionBalances = {
          SELLABLE: 0,
          DAMAGED: 0,
          QUARANTINE: 0,
          INSPECTION: 0,
          reserved: 0,
          availableToSell: 0,
        };

        for (const item of matching) {
          const qty = Number(item.onHand) || 0;
          if (item.condition in agg) {
            agg[item.condition as ConditionKey] = qty;
          }
          if (item.condition === 'SELLABLE') {
            agg.reserved = Number(item.reserved) || 0;
            agg.availableToSell = Number(item.availableToSell) || 0;
          }
        }

        setBalances(agg);
      })
      .catch((err) => {
        if (active) console.error('Failed to fetch live balances:', err);
      })
      .finally(() => {
        if (active) setLoadingBalances(false);
      });

    return () => {
      active = false;
    };
  }, [selectedLocationId, selectedVariant]);

  // ── Stock Adjustment Form ──────────────────────────────────────────────────

  const adjForm = useForm<AdjustForm>({
    resolver: zodResolver(adjustSchema),
    defaultValues: {
      variantId: selectedVariant?.variantId || '',
      locationId: selectedLocationId || '',
      condition: 'SELLABLE',
      quantityDelta: '',
      reasonCode: 'CORRECTION',
      note: '',
    },
  });

  // Keep adjForm in sync with shared selection
  useEffect(() => {
    adjForm.setValue('variantId', selectedVariant?.variantId || '', { shouldValidate: true });
  }, [adjForm, selectedVariant]);

  useEffect(() => {
    adjForm.setValue('locationId', selectedLocationId || '', { shouldValidate: true });
  }, [adjForm, selectedLocationId]);

  const watchAdjCondition = adjForm.watch('condition') as ConditionKey;
  const watchAdjDelta = adjForm.watch('quantityDelta');

  // Compute live projected adjustment balance
  const adjCurrentStock = balances[watchAdjCondition] ?? 0;
  const adjDeltaNumber = Number(watchAdjDelta);
  const adjHasDelta = !Number.isNaN(adjDeltaNumber) && watchAdjDelta.trim() !== '';
  const adjProjected = adjCurrentStock + (adjHasDelta ? adjDeltaNumber : 0);
  const adjWouldBeNegative = adjHasDelta && adjProjected < 0;
  const adjReservedViolation =
    adjHasDelta &&
    watchAdjCondition === 'SELLABLE' &&
    adjCurrentStock + adjDeltaNumber - balances.reserved < 0;

  const onAdjust = adjForm.handleSubmit(async (values) => {
    setSuccessInfo(null);

    // Dynamic stock validation: cannot reduce condition below zero
    const curStock = balances[values.condition as ConditionKey] ?? 0;
    const delta = Number(values.quantityDelta);
    if (curStock + delta < 0) {
      adjForm.setError('quantityDelta', {
        type: 'manual',
        message: `Adjustment of ${delta} exceeds current on-hand ${values.condition.toLowerCase()} stock (${curStock}).`,
      });
      return;
    }

    if (values.condition === 'SELLABLE' && curStock + delta - balances.reserved < 0) {
      adjForm.setError('quantityDelta', {
        type: 'manual',
        message: `Cannot reduce sellable stock below active reservations (${balances.reserved} reserved).`,
      });
      return;
    }

    try {
      const res = await inventoryRequest<{ data: { transactionId: string; inventoryItemId: string } }>(
        '/inventory/adjustments',
        {
          method: 'POST',
          headers: { 'idempotency-key': adjKey.current },
          body: JSON.stringify({
            variantId: values.variantId,
            locationId: values.locationId,
            condition: values.condition,
            quantityDelta: values.quantityDelta,
            reasonCode: values.reasonCode,
            ...(values.note ? { note: values.note.trim() } : {}),
          }),
        },
      );

      // Refresh balances after posting
      setBalances((prev) => ({
        ...prev,
        [values.condition]: prev[values.condition as ConditionKey] + delta,
        ...(values.condition === 'SELLABLE'
          ? { availableToSell: prev.availableToSell + delta }
          : {}),
      }));

      setSuccessInfo({
        message: `Adjustment of ${delta > 0 ? `+${delta}` : delta} ${values.condition.toLowerCase()} units posted successfully.`,
        transactionId: res.data.transactionId,
        sku: selectedVariant?.sku,
      });

      adjKey.current = crypto.randomUUID();
      adjForm.reset({
        variantId: selectedVariant?.variantId || '',
        locationId: selectedLocationId || '',
        condition: values.condition,
        quantityDelta: '',
        reasonCode: 'CORRECTION',
        note: '',
      });
    } catch (err) {
      adjForm.setError('root', {
        message: err instanceof Error ? err.message : 'Adjustment could not be posted.',
      });
    }
  });

  // ── Condition Move Form ──────────────────────────────────────────────────

  const condForm = useForm<ConditionForm>({
    resolver: zodResolver(conditionSchema),
    defaultValues: {
      variantId: selectedVariant?.variantId || '',
      locationId: selectedLocationId || '',
      fromCondition: 'SELLABLE',
      toCondition: 'DAMAGED',
      quantity: '',
      reason: '',
    },
  });

  // Keep condForm in sync with shared selection
  useEffect(() => {
    condForm.setValue('variantId', selectedVariant?.variantId || '', { shouldValidate: true });
  }, [condForm, selectedVariant]);

  useEffect(() => {
    condForm.setValue('locationId', selectedLocationId || '', { shouldValidate: true });
  }, [condForm, selectedLocationId]);

  const watchFromCondition = condForm.watch('fromCondition') as ConditionKey;
  const watchToCondition = condForm.watch('toCondition') as ConditionKey;
  const watchCondQty = condForm.watch('quantity');

  // Compute live projected condition movement balances
  const fromStock = balances[watchFromCondition] ?? 0;
  const toStock = balances[watchToCondition] ?? 0;
  const condQtyNumber = Number(watchCondQty);
  const condHasQty = !Number.isNaN(condQtyNumber) && watchCondQty.trim() !== '' && condQtyNumber > 0;
  const condFromProjected = fromStock - (condHasQty ? condQtyNumber : 0);
  const condToProjected = toStock + (condHasQty ? condQtyNumber : 0);
  const condExceedsFrom = condHasQty && condQtyNumber > fromStock;

  const onConditionMove = condForm.handleSubmit(async (values) => {
    setSuccessInfo(null);

    const availableToMove = balances[values.fromCondition as ConditionKey] ?? 0;
    const moveQty = Number(values.quantity);

    if (moveQty > availableToMove) {
      condForm.setError('quantity', {
        type: 'manual',
        message: `Cannot move ${moveQty} units; only ${availableToMove} units currently in ${values.fromCondition.toLowerCase()}.`,
      });
      return;
    }

    if (
      values.fromCondition === 'SELLABLE' &&
      availableToMove - moveQty < balances.reserved
    ) {
      condForm.setError('quantity', {
        type: 'manual',
        message: `Cannot move sellable stock below active reservations (${balances.reserved} reserved).`,
      });
      return;
    }

    try {
      const res = await inventoryRequest<{ data: { transactionId: string; inventoryItemId: string } }>(
        '/inventory/condition-movements',
        {
          method: 'POST',
          headers: { 'idempotency-key': condKey.current },
          body: JSON.stringify({
            variantId: values.variantId,
            locationId: values.locationId,
            fromCondition: values.fromCondition,
            toCondition: values.toCondition,
            quantity: values.quantity,
            ...(values.reason ? { reason: values.reason.trim() } : {}),
          }),
        },
      );

      // Refresh balances after posting
      setBalances((prev) => ({
        ...prev,
        [values.fromCondition]: prev[values.fromCondition as ConditionKey] - moveQty,
        [values.toCondition]: prev[values.toCondition as ConditionKey] + moveQty,
        ...(values.fromCondition === 'SELLABLE'
          ? { availableToSell: prev.availableToSell - moveQty }
          : {}),
      }));

      setSuccessInfo({
        message: `Successfully reclassified ${moveQty} units from ${values.fromCondition.toLowerCase()} to ${values.toCondition.toLowerCase()}.`,
        transactionId: res.data.transactionId,
        sku: selectedVariant?.sku,
      });

      condKey.current = crypto.randomUUID();
      condForm.reset({
        variantId: selectedVariant?.variantId || '',
        locationId: selectedLocationId || '',
        fromCondition: values.fromCondition,
        toCondition: values.toCondition,
        quantity: '',
        reason: '',
      });
    } catch (err) {
      condForm.setError('root', {
        message: err instanceof Error ? err.message : 'Condition movement could not be posted.',
      });
    }
  });

  return (
    <main className="mx-auto min-w-0 max-w-4xl space-y-6 px-4 py-6 sm:px-6">
      <Breadcrumb
        mobileMode="back"
        items={[
          { label: 'Inventory', href: '/inventory' },
          { label: 'Adjustments & Reclassifications', current: true },
        ]}
      />

      {/* Header Bar */}
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b pb-4">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="icon"
            type="button"
            className="size-8 shrink-0"
            render={<Link href="/inventory" />}
            title="Back to inventory"
          >
            <ArrowLeft className="size-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Manual Inventory Adjustments</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Reconcile cycle counts, log damages, or reclassify items between condition pools.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 self-end sm:self-auto">
          <Button
            variant="outline"
            size="sm"
            render={
              <Link
                href={
                  selectedVariant?.sku
                    ? `/inventory/history?q=${encodeURIComponent(selectedVariant.sku)}`
                    : '/inventory/history'
                }
              />
            }
          >
            <History className="mr-1.5 size-3.5" /> Movement Ledger
          </Button>
        </div>
      </header>

      {/* Success Notification with Ledger Deep-link */}
      {successInfo ? (
        <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3.5 text-xs text-emerald-900 dark:text-emerald-200 space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2 font-semibold">
              <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>{successInfo.message}</span>
            </div>
            <button
              type="button"
              onClick={() => setSuccessInfo(null)}
              className="text-emerald-700 hover:text-emerald-900 dark:text-emerald-300"
            >
              <X className="size-3.5" />
            </button>
          </div>
          {successInfo.transactionId && successInfo.sku ? (
            <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-emerald-500/20 text-[11px]">
              <span className="text-muted-foreground">Transaction ID:</span>
              <span className="font-mono font-medium">{successInfo.transactionId.slice(0, 13)}…</span>
              <Link
                href={`/inventory/history?q=${encodeURIComponent(successInfo.sku)}`}
                className="text-primary font-medium hover:underline ml-auto flex items-center gap-1"
              >
                View in Movement History <ArrowRight className="size-3" />
              </Link>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Capability notice if no stock-holding facilities exist */}
      {!loadingLocations && stockLocations.length === 0 ? (
        <div className="flex items-start gap-3 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3.5 text-xs text-amber-900 dark:text-amber-200">
          <AlertTriangle className="size-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
          <div>
            <p className="font-semibold leading-none">No Stock-Holding Facilities Found</p>
            <p className="mt-1 text-muted-foreground leading-relaxed">
              Manual inventory adjustments require active warehouse locations configured with the{' '}
              <strong className="text-foreground font-mono text-[11px]">STOCK_HOLDING</strong>{' '}
              capability. Visit{' '}
              <Link href="/inventory/warehouses" className="text-primary underline font-medium">
                Warehouse Locations
              </Link>{' '}
              to configure storage depots.
            </p>
          </div>
        </div>
      ) : null}

      {/* Tabs Layout */}
      <Tabs
        value={activeTab}
        onValueChange={(val) => setActiveTab(val as 'adjustment' | 'condition')}
        className="space-y-4"
      >
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="adjustment" className="gap-2">
            <Calculator className="size-4" />
            <span>Stock Adjustment</span>
          </TabsTrigger>
          <TabsTrigger value="condition" className="gap-2">
            <RefreshCcw className="size-4" />
            <span>Condition Move</span>
          </TabsTrigger>
        </TabsList>

        {/* ── Tab 1: Stock Adjustment ──────────────────────── */}
        <TabsContent value="adjustment" className="space-y-4 mt-2">
          <form onSubmit={onAdjust} className="space-y-5" noValidate>
            <Card className="shadow-xs">
              <CardHeader className="p-4 sm:p-5 pb-3 sm:pb-3">
                <CardTitle className="text-base font-semibold">Adjust Stock Level</CardTitle>
                <CardDescription className="text-xs">
                  Increase or decrease physical on-hand inventory for a specific condition pool. Every
                  adjustment creates an immutable ledger transaction.
                </CardDescription>
              </CardHeader>

              <CardContent className="p-4 sm:p-5 pt-0 space-y-4">
                {adjForm.formState.errors.root ? (
                  <OperationalFeedback tone="danger">
                    {adjForm.formState.errors.root.message}
                  </OperationalFeedback>
                ) : null}

                {/* Variant & Location Selectors */}
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">
                      Product Variant <span className="text-destructive">*</span>
                    </Label>
                    <VariantSearch
                      selectedVariant={selectedVariant}
                      onSelect={(variant) => {
                        setSelectedVariant(variant);
                        adjForm.setValue('variantId', variant.variantId, { shouldValidate: true });
                      }}
                      onClear={() => {
                        setSelectedVariant(null);
                        adjForm.setValue('variantId', '');
                      }}
                      error={adjForm.formState.errors.variantId?.message}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="adj-location" className="text-xs font-medium">
                      Warehouse Location <span className="text-destructive">*</span>
                    </Label>
                    <LocationSelect
                      id="adj-location"
                      value={selectedLocationId}
                      onChange={(id) => {
                        setSelectedLocationId(id);
                        adjForm.setValue('locationId', id, { shouldValidate: true });
                      }}
                      locations={stockLocations}
                      loading={loadingLocations}
                      error={adjForm.formState.errors.locationId?.message}
                    />
                  </div>
                </div>

                {/* Live Stock Balances Panel */}
                <StockBalancePanel
                  balances={balances}
                  loading={loadingBalances}
                  variant={selectedVariant}
                  location={selectedLocation}
                />

                {/* Adjustment Details Fields (Responsive Grid) */}
                <div className="grid gap-3 grid-cols-1 sm:grid-cols-3">
                  {/* Condition Selector */}
                  <div className="space-y-1.5">
                    <Label htmlFor="adj-condition" className="text-xs font-medium">
                      Condition Pool <span className="text-destructive">*</span>
                    </Label>
                    <Controller
                      control={adjForm.control}
                      name="condition"
                      render={({ field }) => (
                        <Select value={field.value} onValueChange={field.onChange}>
                          <SelectTrigger id="adj-condition" className="h-9 text-xs">
                            <SelectValue placeholder="Condition" />
                          </SelectTrigger>
                          <SelectContent>
                            {CONDITIONS.map((c) => (
                              <SelectItem
                                key={c.value}
                                value={c.value}
                                label={c.label}
                                description={c.description}
                              >
                                {c.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                  </div>

                  {/* Quantity Delta */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="adj-delta" className="text-xs font-medium">
                        Qty Delta (+ or −) <span className="text-destructive">*</span>
                      </Label>
                      {selectedVariant && selectedLocationId ? (
                        <span className="text-[11px] text-muted-foreground">
                          Current: {adjCurrentStock}
                        </span>
                      ) : null}
                    </div>
                    <Input
                      id="adj-delta"
                      placeholder="e.g. 5 or -2"
                      className={`h-9 text-xs font-mono ${
                        adjWouldBeNegative || adjReservedViolation ? 'border-destructive focus-visible:ring-destructive' : ''
                      }`}
                      {...adjForm.register('quantityDelta')}
                    />
                    {adjForm.formState.errors.quantityDelta ? (
                      <p className="text-[11px] font-medium text-destructive">
                        {adjForm.formState.errors.quantityDelta.message}
                      </p>
                    ) : null}
                  </div>

                  {/* Reason Code */}
                  <div className="space-y-1.5">
                    <Label htmlFor="adj-reason" className="text-xs font-medium">
                      Justification Reason <span className="text-destructive">*</span>
                    </Label>
                    <Controller
                      control={adjForm.control}
                      name="reasonCode"
                      render={({ field }) => (
                        <Select value={field.value} onValueChange={field.onChange}>
                          <SelectTrigger id="adj-reason" className="h-9 text-xs">
                            <SelectValue placeholder="Select reason" />
                          </SelectTrigger>
                          <SelectContent>
                            {REASON_CODES.map((r) => (
                              <SelectItem
                                key={r.value}
                                value={r.value}
                                label={r.label}
                                description={r.description}
                              >
                                {r.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                  </div>
                </div>

                {/* Projected Balance Preview Banner */}
                {selectedVariant && selectedLocationId && adjHasDelta ? (
                  <div
                    className={`rounded-lg border p-2.5 text-xs flex items-center justify-between gap-3 ${
                      adjWouldBeNegative || adjReservedViolation
                        ? 'border-destructive/30 bg-destructive/5 text-destructive'
                        : 'border-primary/20 bg-primary/5 text-foreground'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Layers className="size-3.5 shrink-0" />
                      <span>
                        Projected {watchAdjCondition.toLowerCase()} balance:{' '}
                        <strong className="font-mono">
                          {adjCurrentStock} {adjDeltaNumber > 0 ? `+ ${adjDeltaNumber}` : adjDeltaNumber}{' '}
                          = {adjProjected} units
                        </strong>
                      </span>
                    </div>
                    {adjWouldBeNegative ? (
                      <span className="font-medium text-[11px]">Cannot reduce stock below 0</span>
                    ) : adjReservedViolation ? (
                      <span className="font-medium text-[11px]">
                        Violates {balances.reserved} reserved units
                      </span>
                    ) : (
                      <span className="text-muted-foreground text-[11px]">Valid calculation</span>
                    )}
                  </div>
                ) : null}

                {/* Reason Note */}
                <div className="space-y-1.5">
                  <Label htmlFor="adj-note" className="text-xs font-medium">
                    Operational Note & Context
                  </Label>
                  <Textarea
                    id="adj-note"
                    rows={2}
                    placeholder="Describe audit count reference, discrepancy cause, or authorization note..."
                    className="text-xs"
                    {...adjForm.register('note')}
                  />
                </div>

                {/* Action Bar */}
                <div className="flex items-center justify-end gap-2 pt-2 border-t">
                  <Button
                    type="submit"
                    size="sm"
                    disabled={
                      adjForm.formState.isSubmitting ||
                      !selectedVariant ||
                      !selectedLocationId ||
                      adjWouldBeNegative ||
                      adjReservedViolation
                    }
                    className="min-w-32"
                  >
                    {adjForm.formState.isSubmitting ? (
                      <>
                        <Loader2 className="mr-1.5 size-3.5 animate-spin" /> Posting…
                      </>
                    ) : (
                      <>
                        <Calculator className="mr-1.5 size-3.5" /> Post Adjustment
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </form>
        </TabsContent>

        {/* ── Tab 2: Condition Move ────────────────────────── */}
        <TabsContent value="condition" className="space-y-4 mt-2">
          <form onSubmit={onConditionMove} className="space-y-5" noValidate>
            <Card className="shadow-xs">
              <CardHeader className="p-4 sm:p-5 pb-3 sm:pb-3">
                <CardTitle className="text-base font-semibold">Reclassify Stock Condition</CardTitle>
                <CardDescription className="text-xs">
                  Move stock between conditions (e.g. Sellable → Damaged, or Inspection → Sellable)
                  without altering total physical quantity at the facility.
                </CardDescription>
              </CardHeader>

              <CardContent className="p-4 sm:p-5 pt-0 space-y-4">
                {condForm.formState.errors.root ? (
                  <OperationalFeedback tone="danger">
                    {condForm.formState.errors.root.message}
                  </OperationalFeedback>
                ) : null}

                {/* Variant & Location Selectors */}
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">
                      Product Variant <span className="text-destructive">*</span>
                    </Label>
                    <VariantSearch
                      selectedVariant={selectedVariant}
                      onSelect={(variant) => {
                        setSelectedVariant(variant);
                        condForm.setValue('variantId', variant.variantId, { shouldValidate: true });
                      }}
                      onClear={() => {
                        setSelectedVariant(null);
                        condForm.setValue('variantId', '');
                      }}
                      error={condForm.formState.errors.variantId?.message}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="cond-location" className="text-xs font-medium">
                      Warehouse Location <span className="text-destructive">*</span>
                    </Label>
                    <LocationSelect
                      id="cond-location"
                      value={selectedLocationId}
                      onChange={(id) => {
                        setSelectedLocationId(id);
                        condForm.setValue('locationId', id, { shouldValidate: true });
                      }}
                      locations={stockLocations}
                      loading={loadingLocations}
                      error={condForm.formState.errors.locationId?.message}
                    />
                  </div>
                </div>

                {/* Live Stock Balances Panel */}
                <StockBalancePanel
                  balances={balances}
                  loading={loadingBalances}
                  variant={selectedVariant}
                  location={selectedLocation}
                />

                {/* Condition Movement Fields (Responsive Grid) */}
                <div className="grid gap-3 grid-cols-1 sm:grid-cols-3">
                  {/* From Condition */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="cond-from" className="text-xs font-medium">
                        From Condition <span className="text-destructive">*</span>
                      </Label>
                      {selectedVariant && selectedLocationId ? (
                        <span className="text-[11px] text-muted-foreground font-mono">
                          {fromStock} avail.
                        </span>
                      ) : null}
                    </div>
                    <Controller
                      control={condForm.control}
                      name="fromCondition"
                      render={({ field }) => (
                        <Select value={field.value} onValueChange={field.onChange}>
                          <SelectTrigger id="cond-from" className="h-9 text-xs">
                            <SelectValue placeholder="From Condition" />
                          </SelectTrigger>
                          <SelectContent>
                            {CONDITIONS.map((c) => (
                              <SelectItem
                                key={c.value}
                                value={c.value}
                                label={c.label}
                                description={c.description}
                              >
                                {c.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                  </div>

                  {/* To Condition */}
                  <div className="space-y-1.5">
                    <Label htmlFor="cond-to" className="text-xs font-medium">
                      To Condition <span className="text-destructive">*</span>
                    </Label>
                    <Controller
                      control={condForm.control}
                      name="toCondition"
                      render={({ field, fieldState }) => (
                        <>
                          <Select value={field.value} onValueChange={field.onChange}>
                            <SelectTrigger id="cond-to" className="h-9 text-xs">
                              <SelectValue placeholder="To Condition" />
                            </SelectTrigger>
                            <SelectContent>
                              {CONDITIONS.map((c) => (
                                <SelectItem
                                  key={c.value}
                                  value={c.value}
                                  label={c.label}
                                  description={c.description}
                                  disabled={c.value === watchFromCondition}
                                >
                                  {c.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {fieldState.error ? (
                            <p className="text-[11px] font-medium text-destructive">
                              {fieldState.error.message}
                            </p>
                          ) : null}
                        </>
                      )}
                    />
                  </div>

                  {/* Quantity */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="cond-qty" className="text-xs font-medium">
                        Units to Move <span className="text-destructive">*</span>
                      </Label>
                      {selectedVariant && selectedLocationId && fromStock > 0 ? (
                        <button
                          type="button"
                          onClick={() =>
                            condForm.setValue('quantity', String(fromStock), {
                              shouldValidate: true,
                            })
                          }
                          className="text-[11px] text-primary font-medium hover:underline"
                        >
                          Max ({fromStock})
                        </button>
                      ) : null}
                    </div>
                    <Input
                      id="cond-qty"
                      type="number"
                      min="0.000001"
                      step="any"
                      placeholder="e.g. 3"
                      className={`h-9 text-xs font-mono ${
                        condExceedsFrom ? 'border-destructive focus-visible:ring-destructive' : ''
                      }`}
                      {...condForm.register('quantity')}
                    />
                    {condForm.formState.errors.quantity ? (
                      <p className="text-[11px] font-medium text-destructive">
                        {condForm.formState.errors.quantity.message}
                      </p>
                    ) : null}
                  </div>
                </div>

                {/* Projected Movement Preview Banner */}
                {selectedVariant && selectedLocationId && condHasQty ? (
                  <div
                    className={`rounded-lg border p-2.5 text-xs flex items-center justify-between gap-3 ${
                      condExceedsFrom
                        ? 'border-destructive/30 bg-destructive/5 text-destructive'
                        : 'border-primary/20 bg-primary/5 text-foreground'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <RefreshCcw className="size-3.5 shrink-0" />
                      <span>
                        Projected reallocation:{' '}
                        <strong className="font-mono">
                          {watchFromCondition} ({fromStock} → {condFromProjected})
                        </strong>{' '}
                        <ArrowRight className="inline size-3 mx-1" />
                        <strong className="font-mono">
                          {watchToCondition} ({toStock} → {condToProjected})
                        </strong>
                      </span>
                    </div>
                    {condExceedsFrom ? (
                      <span className="font-medium text-[11px]">
                        Exceeds {fromStock} available units
                      </span>
                    ) : (
                      <span className="text-muted-foreground text-[11px]">Net balance: ±0</span>
                    )}
                  </div>
                ) : null}

                {/* Optional Reason */}
                <div className="space-y-1.5">
                  <Label htmlFor="cond-reason" className="text-xs font-medium">
                    Reclassification Reason
                  </Label>
                  <Input
                    id="cond-reason"
                    placeholder="e.g. Damaged in transit, QA inspection passed, or batch quarantined..."
                    className="h-9 text-xs"
                    {...condForm.register('reason')}
                  />
                </div>

                {/* Action Bar */}
                <div className="flex items-center justify-end gap-2 pt-2 border-t">
                  <Button
                    type="submit"
                    size="sm"
                    disabled={
                      condForm.formState.isSubmitting ||
                      !selectedVariant ||
                      !selectedLocationId ||
                      condExceedsFrom
                    }
                    className="min-w-32"
                  >
                    {condForm.formState.isSubmitting ? (
                      <>
                        <Loader2 className="mr-1.5 size-3.5 animate-spin" /> Moving…
                      </>
                    ) : (
                      <>
                        <RefreshCcw className="mr-1.5 size-3.5" /> Move Condition
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </form>
        </TabsContent>
      </Tabs>
    </main>
  );
}
