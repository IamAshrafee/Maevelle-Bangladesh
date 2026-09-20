'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Save,
  ArrowLeft,
  Loader2,
  Building2,
  AlertTriangle,
  ClipboardList,
  Package,
  Layers,
  ArrowRight,
  ShieldAlert,
  Info,
} from 'lucide-react';
import { z } from 'zod';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import { inventoryRequest } from '@/lib/inventory/api';
import type {
  WarehouseLocationDto,
  StocktakeSessionDto,
  PaginatedDto,
  InventoryBalanceDto,
} from '@maevelle/contracts';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { OperationalFeedback } from '@/components/operational-worklist';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const stocktakeSchema = z.object({
  locationId: z.string().min(1, 'Please select a warehouse facility to count'),
});

type FormValues = z.infer<typeof stocktakeSchema>;

export function StocktakeForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialLocationParam = searchParams.get('locationId') || '';

  const [isLoadingLocations, setIsLoadingLocations] = useState(true);
  const [locations, setLocations] = useState<WarehouseLocationDto[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Active stocktake conflict detection state
  const [isCheckingConflict, setIsCheckingConflict] = useState(false);
  const [activeConflict, setActiveConflict] = useState<StocktakeSessionDto | null>(null);

  // Facility stock footprint preview state
  const [isLoadingFootprint, setIsLoadingFootprint] = useState(false);
  const [itemCount, setItemCount] = useState<number | null>(null);

  const commandKey = useRef(crypto.randomUUID());

  const form = useForm<FormValues>({
    resolver: zodResolver(stocktakeSchema),
    defaultValues: {
      locationId: initialLocationParam,
    },
  });

  const selectedLocationId = form.watch('locationId');

  // Filter for active stock-holding facilities
  const stockHoldingLocations = useMemo(
    () =>
      locations.filter(
        (loc) => loc.status === 'ACTIVE' && loc.capabilities.includes('STOCK_HOLDING'),
      ),
    [locations],
  );

  const selectedLocation = useMemo(
    () => stockHoldingLocations.find((l) => l.id === selectedLocationId) ?? null,
    [stockHoldingLocations, selectedLocationId],
  );

  // Fetch warehouse facilities on mount
  useEffect(() => {
    let mounted = true;
    const fetchLocations = async () => {
      try {
        const response = await inventoryRequest<{ data: WarehouseLocationDto[] }>(
          '/warehouse/locations',
        );
        if (mounted) {
          const list = response.data || [];
          setLocations(list);

          // Apply initial location from query parameter if valid
          if (
            initialLocationParam &&
            list.some(
              (l) =>
                l.id === initialLocationParam &&
                l.status === 'ACTIVE' &&
                l.capabilities.includes('STOCK_HOLDING'),
            )
          ) {
            form.setValue('locationId', initialLocationParam, { shouldValidate: true });
          }
          setIsLoadingLocations(false);
        }
      } catch (err) {
        if (mounted) {
          setErrorMessage(err instanceof Error ? err.message : String(err));
          setIsLoadingLocations(false);
        }
      }
    };
    fetchLocations();
    return () => {
      mounted = false;
    };
  }, [form, initialLocationParam]);

  // Check for active stocktakes and item footprint when location changes
  useEffect(() => {
    if (!selectedLocationId) {
      setActiveConflict(null);
      setItemCount(null);
      return;
    }

    let active = true;
    setIsCheckingConflict(true);
    setIsLoadingFootprint(true);

    // 1. Query for active/ongoing stocktakes
    inventoryRequest<{ data: PaginatedDto<StocktakeSessionDto> }>(
      `/inventory/stocktakes?locationId=${selectedLocationId}&limit=5`,
    )
      .then((res) => {
        if (!active) return;
        const sessions = res.data?.items || [];
        const ongoing = sessions.find(
          (s) => s.status === 'COUNTING' || s.status === 'REVIEW',
        );
        setActiveConflict(ongoing ?? null);
      })
      .catch((err) => {
        if (active) console.error('Failed to check active stocktake conflict:', err);
      })
      .finally(() => {
        if (active) setIsCheckingConflict(false);
      });

    // 2. Query inventory footprint count
    inventoryRequest<{ data: PaginatedDto<InventoryBalanceDto> }>(
      `/inventory/stock?locationId=${selectedLocationId}&limit=1`,
    )
      .then((res) => {
        if (!active) return;
        setItemCount(res.data?.totalCount ?? 0);
      })
      .catch((err) => {
        if (active) console.error('Failed to fetch stock footprint:', err);
      })
      .finally(() => {
        if (active) setIsLoadingFootprint(false);
      });

    return () => {
      active = false;
    };
  }, [selectedLocationId]);

  const onSubmit = async (values: FormValues) => {
    setErrorMessage(null);

    try {
      const result = await inventoryRequest<{ data: { stocktakeId: string; version: number } }>(
        '/inventory/stocktakes',
        {
          method: 'POST',
          headers: { 'idempotency-key': commandKey.current },
          body: JSON.stringify({
            locationId: values.locationId,
          }),
        },
      );

      router.push(`/inventory/stocktakes/${result.data.stocktakeId}`);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <main className="mx-auto min-w-0 max-w-3xl space-y-6 px-4 py-6 sm:px-6">
      <Breadcrumb
        mobileMode="back"
        items={[
          { label: 'Inventory', href: '/inventory' },
          { label: 'Stocktakes', href: '/inventory/stocktakes' },
          { label: 'Start Stocktake', current: true },
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
            render={<Link href="/inventory/stocktakes" />}
            title="Back to stocktakes"
          >
            <ArrowLeft className="size-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold tracking-tight">Start Physical Stocktake</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Initialize a physical cycle count and capture a baseline snapshot of facility balances.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 self-end sm:self-auto">
          <Button
            variant="outline"
            size="sm"
            type="button"
            render={<Link href="/inventory/stocktakes" />}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            size="sm"
            form="stocktake-form"
            disabled={form.formState.isSubmitting || isLoadingLocations || !selectedLocationId}
            className="min-w-32"
          >
            {form.formState.isSubmitting ? (
              <>
                <Loader2 className="mr-1.5 size-3.5 animate-spin" /> Starting…
              </>
            ) : (
              <>
                <ClipboardList className="mr-1.5 size-3.5" /> Start Stocktake
              </>
            )}
          </Button>
        </div>
      </header>

      {/* Error Feedback */}
      {errorMessage ? (
        <OperationalFeedback tone="danger">{errorMessage}</OperationalFeedback>
      ) : null}

      {/* Capability Warning if no stock-holding facilities exist */}
      {!isLoadingLocations && stockHoldingLocations.length === 0 ? (
        <div className="flex items-start gap-3 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3.5 text-xs text-amber-900 dark:text-amber-200">
          <AlertTriangle className="size-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
          <div>
            <p className="font-semibold leading-none">No Stock-Holding Warehouses Available</p>
            <p className="mt-1 text-muted-foreground leading-relaxed">
              Stocktakes require an active warehouse location configured with the{' '}
              <strong className="text-foreground font-mono text-[11px]">STOCK_HOLDING</strong> capability.
              Visit{' '}
              <Link href="/inventory/warehouses" className="text-primary underline font-medium">
                Warehouse Locations
              </Link>{' '}
              to configure facility capabilities.
            </p>
          </div>
        </div>
      ) : null}

      {/* Active Stocktake Conflict Notice */}
      {activeConflict ? (
        <div className="flex items-start justify-between gap-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-900 dark:text-amber-200">
          <div className="flex items-start gap-3">
            <AlertTriangle className="size-5 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
            <div className="space-y-1">
              <p className="font-semibold text-sm leading-none">Active Stocktake in Progress</p>
              <p className="text-muted-foreground leading-relaxed">
                Facility <strong className="text-foreground">{selectedLocation?.name}</strong> already has an active
                stocktake session (<span className="font-mono font-semibold text-foreground">{activeConflict.stocktakeNumber}</span>) in{' '}
                <Badge variant="secondary" className="text-[10px] uppercase font-mono px-1.5 py-0">
                  {activeConflict.status}
                </Badge>{' '}
                status.
              </p>
              <p className="text-[11px] text-muted-foreground">
                To prevent duplicate physical count sheets, it is recommended to resume the existing session.
              </p>
            </div>
          </div>
          <Button
            size="sm"
            variant="default"
            render={<Link href={`/inventory/stocktakes/${activeConflict.id}`} />}
            className="shrink-0 text-xs"
          >
            Resume Count <ArrowRight className="ml-1.5 size-3.5" />
          </Button>
        </div>
      ) : null}

      <form id="stocktake-form" onSubmit={form.handleSubmit(onSubmit)} className="space-y-5" noValidate>
        <Card className="shadow-xs">
          <CardHeader className="p-4 sm:p-5 pb-3 sm:pb-3">
            <CardTitle className="text-base font-semibold">Counting Facility Scope</CardTitle>
            <CardDescription className="text-xs">
              Select the storage depot or warehouse where the physical count will take place.
            </CardDescription>
          </CardHeader>

          <CardContent className="p-4 sm:p-5 pt-0 space-y-4">
            {/* Location Selector */}
            <div className="space-y-1.5">
              <Label htmlFor="stocktake-location" className="text-xs font-medium">
                Warehouse Location <span className="text-destructive">*</span>
              </Label>
              <Controller
                control={form.control}
                name="locationId"
                render={({ field }) => (
                  <Select
                    value={field.value}
                    onValueChange={(val) => field.onChange(val || '')}
                    disabled={isLoadingLocations}
                  >
                    <SelectTrigger id="stocktake-location" className="h-9 text-sm">
                      <SelectValue
                        placeholder={
                          isLoadingLocations ? 'Loading locations…' : 'Select a storage facility'
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      {stockHoldingLocations.map((loc) => (
                        <SelectItem
                          key={loc.id}
                          value={loc.id}
                          label={`${loc.name} (${loc.code})`}
                          description={`${loc.locationType.replace('_', ' ')} · Active`}
                        >
                          {loc.name}{' '}
                          <span className="text-muted-foreground ml-1 font-mono text-xs">
                            ({loc.code})
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {form.formState.errors.locationId ? (
                <p className="text-[11px] font-medium text-destructive">
                  {form.formState.errors.locationId.message}
                </p>
              ) : null}
            </div>

            {/* Facility Footprint Preview Card */}
            {selectedLocation ? (
              <div className="rounded-lg border bg-muted/30 p-3.5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2.5">
                  <div className="flex items-center gap-2 text-xs font-semibold">
                    <Building2 className="size-4 text-muted-foreground" />
                    <span>{selectedLocation.name}</span>
                    <span className="font-mono text-muted-foreground font-normal">
                      ({selectedLocation.code})
                    </span>
                  </div>
                  <Badge variant="outline" className="text-[11px] capitalize font-normal">
                    {selectedLocation.locationType.replace('_', ' ').toLowerCase()}
                  </Badge>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="flex items-start gap-2.5 rounded-md border bg-background p-2.5">
                    <Package className="size-4 text-primary shrink-0 mt-0.5" />
                    <div>
                      <div className="font-medium text-foreground">Active Item Footprint</div>
                      <div className="text-muted-foreground text-[11px] mt-0.5">
                        {isLoadingFootprint ? (
                          <span className="flex items-center gap-1">
                            <Loader2 className="size-3 animate-spin" /> Querying catalog levels…
                          </span>
                        ) : (
                          <span className="font-mono font-semibold text-foreground">
                            {itemCount} distinct {itemCount === 1 ? 'variant' : 'variants'} in stock
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5 rounded-md border bg-background p-2.5">
                    <Layers className="size-4 text-primary shrink-0 mt-0.5" />
                    <div>
                      <div className="font-medium text-foreground">Condition Snapshots</div>
                      <div className="text-muted-foreground text-[11px] mt-0.5">
                        Captures Sellable, Damaged, Quarantine, and Inspection levels
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-md border border-primary/20 bg-primary/5 p-2.5 text-[11px] text-muted-foreground leading-relaxed flex items-start gap-2">
                  <Info className="size-3.5 shrink-0 text-primary mt-0.5" />
                  <span>
                    Starting a stocktake freezes an instantaneous snapshot of system expected balances.
                    Any movements or order dispatches that occur during counting will be reconciled
                    against this baseline during the review phase.
                  </span>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>

        {/* Bottom Submission Bar */}
        <div className="flex items-center justify-between border-t pt-4">
          <p className="text-xs text-muted-foreground">
            {selectedLocation
              ? `Ready to initialize stocktake at ${selectedLocation.name}`
              : 'Select a warehouse location to proceed'}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              type="button"
              render={<Link href="/inventory/stocktakes" />}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={form.formState.isSubmitting || isLoadingLocations || !selectedLocationId}
              className="min-w-32"
            >
              {form.formState.isSubmitting ? (
                <>
                  <Loader2 className="mr-1.5 size-3.5 animate-spin" /> Starting…
                </>
              ) : (
                <>
                  <ClipboardList className="mr-1.5 size-3.5" /> Start Stocktake
                </>
              )}
            </Button>
          </div>
        </div>
      </form>
    </main>
  );
}
