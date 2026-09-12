'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Calculator, CheckCircle2, RefreshCcw, Search, X } from 'lucide-react';
import { z } from 'zod';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import { inventoryRequest } from '@/lib/inventory/api';
import type { WarehouseLocationDto } from '@maevelle/contracts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// ─── Types ───────────────────────────────────────────────────────────────────

interface StockSearchResult {
  inventoryItemId: string;
  variantId: string;
  sku: string;
  productTitle: string;
  locationId: string;
  locationName: string;
  availableToSell: string;
  onHand: string;
  condition: string;
}

// ─── Schemas ─────────────────────────────────────────────────────────────────

const adjustSchema = z.object({
  variantId: z.string().min(1, 'Select a product variant'),
  locationId: z.string().min(1, 'Select a location'),
  condition: z.enum(['SELLABLE', 'DAMAGED', 'QUARANTINE', 'INSPECTION']),
  quantityDelta: z.string().regex(/^-?\d+(?:\.\d{1,6})?$/, 'Enter a valid quantity (e.g. 5 or -2)'),
  reasonCode: z.enum(['OPENING_BALANCE', 'CORRECTION', 'DAMAGE', 'FOUND_STOCK', 'OTHER']),
  note: z.string().optional(),
});

const conditionSchema = z.object({
  variantId: z.string().min(1, 'Select a product variant'),
  locationId: z.string().min(1, 'Select a location'),
  fromCondition: z.enum(['SELLABLE', 'DAMAGED', 'QUARANTINE', 'INSPECTION']),
  toCondition: z.enum(['SELLABLE', 'DAMAGED', 'QUARANTINE', 'INSPECTION']),
  quantity: z.string().regex(/^\d+(?:\.\d{1,6})?$/, 'Enter a positive quantity'),
  reason: z.string().optional(),
}).refine((d) => d.fromCondition !== d.toCondition, {
  message: 'From and To conditions must differ',
  path: ['toCondition'],
});

type AdjustForm = z.infer<typeof adjustSchema>;
type ConditionForm = z.infer<typeof conditionSchema>;

// ─── Variant search typeahead ─────────────────────────────────────────────────

interface VariantSearchProps {
  onSelect: (variantId: string, sku: string, title: string) => void;
  selectedLabel: string;
  onClear: () => void;
  error?: string | undefined;
}

function VariantSearch({ onSelect, selectedLabel, onClear, error }: VariantSearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<StockSearchResult[]>([]);
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
      const res = await inventoryRequest<{ data: { items: StockSearchResult[]; totalCount: number } }>(
        `/inventory/stock?search=${encodeURIComponent(term)}&limit=20`,
      );
      // Deduplicate by variantId — stock shows one row per condition×location
      const seen = new Set<string>();
      const unique = (res.data.items ?? []).filter((r) => {
        if (seen.has(r.variantId)) return false;
        seen.add(r.variantId);
        return true;
      });
      setResults(unique);
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
    timerRef.current = setTimeout(() => search(value), 320);
  };

  // Close dropdown on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  if (selectedLabel) {
    return (
      <div className="flex items-center gap-2 h-9 rounded-lg border border-input bg-background px-3 text-sm">
        <span className="flex-1 truncate">{selectedLabel}</span>
        <button type="button" onClick={onClear} className="text-muted-foreground hover:text-foreground">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          placeholder="Search by SKU or product name…"
          className="pl-8"
          value={query}
          onChange={(e) => handleInput(e.target.value)}
          autoComplete="off"
        />
      </div>
      {error && <p className="mt-1 text-sm text-destructive">{error}</p>}
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border bg-popover shadow-md max-h-60 overflow-auto">
          {searching && (
            <p className="px-3 py-2 text-sm text-muted-foreground">Searching…</p>
          )}
          {!searching && results.length === 0 && (
            <p className="px-3 py-2 text-sm text-muted-foreground">No matching variants found.</p>
          )}
          {!searching && results.map((r) => (
            <button
              key={r.variantId}
              type="button"
              className="w-full flex items-start gap-3 px-3 py-2.5 text-left text-sm hover:bg-muted"
              onClick={() => {
                onSelect(r.variantId, r.sku, r.productTitle);
                setQuery('');
                setOpen(false);
              }}
            >
              <span className="flex-1 min-w-0">
                <span className="block font-medium truncate">{r.productTitle}</span>
                <span className="block text-xs text-muted-foreground font-mono">{r.sku}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Location selector ────────────────────────────────────────────────────────

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
    <div className="space-y-1.5">
      <Select value={value} onValueChange={(v) => onChange(v ?? '')} disabled={loading}>
        <SelectTrigger id={id}>
          <SelectValue placeholder={loading ? 'Loading locations…' : 'Select location'} />
        </SelectTrigger>
        <SelectContent>
          {locations.map((loc) => (
            <SelectItem key={loc.id} value={loc.id}>
              {loc.name}
              <span className="ml-1.5 text-xs text-muted-foreground font-mono">({loc.code})</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

// ─── Condition constants ──────────────────────────────────────────────────────

const CONDITIONS = [
  { value: 'SELLABLE', label: 'Sellable' },
  { value: 'DAMAGED', label: 'Damaged' },
  { value: 'QUARANTINE', label: 'Quarantine' },
  { value: 'INSPECTION', label: 'Inspection' },
] as const;

const REASON_CODES = [
  { value: 'OPENING_BALANCE', label: 'Opening Balance' },
  { value: 'CORRECTION', label: 'Correction (Cycle Count)' },
  { value: 'DAMAGE', label: 'Damage / Shrinkage' },
  { value: 'FOUND_STOCK', label: 'Found Stock' },
  { value: 'OTHER', label: 'Other' },
] as const;

// ─── Main component ───────────────────────────────────────────────────────────

export function AdjustmentsSection() {
  const [locations, setLocations] = useState<WarehouseLocationDto[]>([]);
  const [loadingLocations, setLoadingLocations] = useState(true);
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    let active = true;
    inventoryRequest<{ data: WarehouseLocationDto[] }>('/warehouse/locations')
      .then((res) => { if (active) setLocations(res.data ?? []); })
      .catch(console.error)
      .finally(() => { if (active) setLoadingLocations(false); });
    return () => { active = false; };
  }, []);

  // ── Adjustment form ──────────────────────────────────────────────────────
  const [adjLabel, setAdjLabel] = useState('');
  const adjForm = useForm<AdjustForm>({
    resolver: zodResolver(adjustSchema),
    defaultValues: {
      variantId: '',
      locationId: '',
      condition: 'SELLABLE',
      quantityDelta: '',
      reasonCode: 'CORRECTION',
      note: '',
    },
  });

  const onAdjust = adjForm.handleSubmit(async (values) => {
    setSuccessMessage('');
    try {
      await inventoryRequest('/inventory/adjustments', {
        method: 'POST',
        headers: { 'idempotency-key': `adj-${Date.now()}-${Math.random().toString(36).slice(2)}` },
        body: JSON.stringify({
          variantId: values.variantId,
          locationId: values.locationId,
          condition: values.condition,
          quantityDelta: values.quantityDelta,
          reasonCode: values.reasonCode,
          ...(values.note ? { note: values.note } : {}),
        }),
      });
      setSuccessMessage('Adjustment posted. Inventory balance updated.');
      adjForm.reset();
      setAdjLabel('');
    } catch (err) {
      adjForm.setError('root', {
        message: err instanceof Error ? err.message : 'Adjustment could not be posted.',
      });
    }
  });

  // ── Condition-move form ──────────────────────────────────────────────────
  const [condLabel, setCondLabel] = useState('');
  const condForm = useForm<ConditionForm>({
    resolver: zodResolver(conditionSchema),
    defaultValues: {
      variantId: '',
      locationId: '',
      fromCondition: 'SELLABLE',
      toCondition: 'DAMAGED',
      quantity: '',
      reason: '',
    },
  });

  const onConditionMove = condForm.handleSubmit(async (values) => {
    setSuccessMessage('');
    try {
      await inventoryRequest('/inventory/condition-movements', {
        method: 'POST',
        headers: { 'idempotency-key': `cond-${Date.now()}-${Math.random().toString(36).slice(2)}` },
        body: JSON.stringify({
          variantId: values.variantId,
          locationId: values.locationId,
          fromCondition: values.fromCondition,
          toCondition: values.toCondition,
          quantity: values.quantity,
          ...(values.reason ? { reason: values.reason } : {}),
        }),
      });
      setSuccessMessage('Condition move posted. Stock reallocated.');
      condForm.reset();
      setCondLabel('');
    } catch (err) {
      condForm.setError('root', {
        message: err instanceof Error ? err.message : 'Condition move could not be posted.',
      });
    }
  });

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Manual Adjustments</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Correct inventory levels or move items between conditions. Every action is recorded in the
          movement ledger.
        </p>
      </div>

      {successMessage && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {successMessage}
        </div>
      )}

      <Tabs defaultValue="adjustment">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="adjustment">
            <Calculator className="h-4 w-4 mr-2" />
            Stock Adjustment
          </TabsTrigger>
          <TabsTrigger value="condition">
            <RefreshCcw className="h-4 w-4 mr-2" />
            Condition Move
          </TabsTrigger>
        </TabsList>

        {/* ── Stock Adjustment ─────────────────────────────── */}
        <TabsContent value="adjustment" className="mt-4">
          <form onSubmit={onAdjust}>
            <Card>
              <CardHeader>
                <CardTitle>Adjust Stock Quantity</CardTitle>
                <CardDescription>
                  Increase or decrease inventory at a specific location. Requires a justification.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                {adjForm.formState.errors.root && (
                  <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {adjForm.formState.errors.root.message}
                  </p>
                )}

                <div className="space-y-1.5">
                  <Label>
                    Product Variant <span className="text-destructive">*</span>
                  </Label>
                  <VariantSearch
                    selectedLabel={adjLabel}
                    onSelect={(variantId, sku, title) => {
                      adjForm.setValue('variantId', variantId, { shouldValidate: true });
                      setAdjLabel(`${title} — ${sku}`);
                    }}
                    onClear={() => {
                      adjForm.setValue('variantId', '');
                      setAdjLabel('');
                    }}
                    error={adjForm.formState.errors.variantId?.message}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="adj-location">
                    Location <span className="text-destructive">*</span>
                  </Label>
                  <Controller
                    control={adjForm.control}
                    name="locationId"
                    render={({ field, fieldState }) => (
                      <LocationSelect
                        id="adj-location"
                        value={field.value}
                        onChange={field.onChange}
                        locations={locations}
                        loading={loadingLocations}
                        error={fieldState.error?.message}
                      />
                    )}
                  />
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="adj-condition">Condition</Label>
                    <Controller
                      control={adjForm.control}
                      name="condition"
                      render={({ field }) => (
                        <Select value={field.value} onValueChange={field.onChange}>
                          <SelectTrigger id="adj-condition"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {CONDITIONS.map((c) => (
                              <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="adj-delta">
                      Qty (+ or −) <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="adj-delta"
                      placeholder="e.g. 5 or -2"
                      {...adjForm.register('quantityDelta')}
                    />
                    {adjForm.formState.errors.quantityDelta && (
                      <p className="text-sm text-destructive">
                        {adjForm.formState.errors.quantityDelta.message}
                      </p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="adj-reason">Reason</Label>
                    <Controller
                      control={adjForm.control}
                      name="reasonCode"
                      render={({ field }) => (
                        <Select value={field.value} onValueChange={field.onChange}>
                          <SelectTrigger id="adj-reason"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {REASON_CODES.map((r) => (
                              <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="adj-note">Note</Label>
                  <Textarea
                    id="adj-note"
                    rows={2}
                    placeholder="Describe why you are making this adjustment…"
                    {...adjForm.register('note')}
                  />
                </div>

                <div className="flex justify-end pt-2">
                  <Button type="submit" disabled={adjForm.formState.isSubmitting}>
                    {adjForm.formState.isSubmitting ? 'Posting…' : 'Post Adjustment'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </form>
        </TabsContent>

        {/* ── Condition Move ───────────────────────────────── */}
        <TabsContent value="condition" className="mt-4">
          <form onSubmit={onConditionMove}>
            <Card>
              <CardHeader>
                <CardTitle>Move Item Condition</CardTitle>
                <CardDescription>
                  Reclassify stock without changing total on-hand quantity (e.g. Sellable → Damaged).
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                {condForm.formState.errors.root && (
                  <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {condForm.formState.errors.root.message}
                  </p>
                )}

                <div className="space-y-1.5">
                  <Label>
                    Product Variant <span className="text-destructive">*</span>
                  </Label>
                  <VariantSearch
                    selectedLabel={condLabel}
                    onSelect={(variantId, sku, title) => {
                      condForm.setValue('variantId', variantId, { shouldValidate: true });
                      setCondLabel(`${title} — ${sku}`);
                    }}
                    onClear={() => {
                      condForm.setValue('variantId', '');
                      setCondLabel('');
                    }}
                    error={condForm.formState.errors.variantId?.message}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="cond-location">
                    Location <span className="text-destructive">*</span>
                  </Label>
                  <Controller
                    control={condForm.control}
                    name="locationId"
                    render={({ field, fieldState }) => (
                      <LocationSelect
                        id="cond-location"
                        value={field.value}
                        onChange={field.onChange}
                        locations={locations}
                        loading={loadingLocations}
                        error={fieldState.error?.message}
                      />
                    )}
                  />
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="cond-from">From Condition</Label>
                    <Controller
                      control={condForm.control}
                      name="fromCondition"
                      render={({ field }) => (
                        <Select value={field.value} onValueChange={field.onChange}>
                          <SelectTrigger id="cond-from"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {CONDITIONS.map((c) => (
                              <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="cond-to">To Condition</Label>
                    <Controller
                      control={condForm.control}
                      name="toCondition"
                      render={({ field, fieldState }) => (
                        <>
                          <Select value={field.value} onValueChange={field.onChange}>
                            <SelectTrigger id="cond-to"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {CONDITIONS.map((c) => (
                                <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {fieldState.error && (
                            <p className="text-sm text-destructive">{fieldState.error.message}</p>
                          )}
                        </>
                      )}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="cond-qty">
                      Quantity <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="cond-qty"
                      type="number"
                      min="0.000001"
                      step="any"
                      placeholder="e.g. 3"
                      {...condForm.register('quantity')}
                    />
                    {condForm.formState.errors.quantity && (
                      <p className="text-sm text-destructive">
                        {condForm.formState.errors.quantity.message}
                      </p>
                    )}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="cond-reason">Reason</Label>
                  <Input
                    id="cond-reason"
                    placeholder="Optional — describe why stock is being reclassified"
                    {...condForm.register('reason')}
                  />
                </div>

                <div className="flex justify-end pt-2">
                  <Button type="submit" disabled={condForm.formState.isSubmitting}>
                    {condForm.formState.isSubmitting ? 'Posting…' : 'Move Condition'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </form>
        </TabsContent>
      </Tabs>
    </div>
  );
}
