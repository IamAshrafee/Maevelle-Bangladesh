'use client';

import {
  AlertCircle,
  Boxes,
  CheckCircle2,
  ChevronRight,
  Loader2,
  PackagePlus,
  RefreshCw,
  Search,
  Warehouse,
} from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { fetchApiData } from '@/lib/api';
import type { ApiEnvelope, OrderDetailDto, OrderLineDto, WarehouseLocationDto } from '@maevelle/contracts';

interface EligibleOrderSummary {
  id: string;
  orderNumber: string;
  customerName: string;
  status: string;
  fulfillmentStatus: string;
  totalAmount: string;
  createdAt: string;
}

interface FulfillmentCreateDialogProps {
  locations: readonly WarehouseLocationDto[];
  initialOrderId?: string | undefined;
  onSuccess: (newFulfillmentId?: string) => Promise<void> | void;
}

export function FulfillmentCreateDialog({
  locations,
  initialOrderId,
  onSuccess,
}: FulfillmentCreateDialogProps) {
  const [open, setOpen] = useState(false);
  const [eligibleOrders, setEligibleOrders] = useState<readonly EligibleOrderSummary[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [orderSearch, setOrderSearch] = useState('');
  const [selectedOrderId, setSelectedOrderId] = useState<string>(initialOrderId ?? '');
  const [orderDetail, setOrderDetail] = useState<OrderDetailDto | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [selectedLocationId, setSelectedLocationId] = useState('');
  const [lineQuantities, setLineQuantities] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const loadEligibleOrders = useCallback(async () => {
    setOrdersLoading(true);
    try {
      const res = await fetchApiData<{ items: readonly EligibleOrderSummary[] }>(
        '/admin/orders?fulfillmentStatus=UNFULFILLED&pageSize=50',
      );
      setEligibleOrders(res?.items ?? []);
    } catch {
      try {
        const fallbackRes = await fetchApiData<{ items: readonly EligibleOrderSummary[] }>(
          '/admin/orders?pageSize=50',
        );
        const filtered = (fallbackRes?.items ?? []).filter(
          (o) =>
            ['CONFIRMED', 'PAID', 'PENDING'].includes(o.status) &&
            o.fulfillmentStatus !== 'FULFILLED' &&
            o.fulfillmentStatus !== 'CANCELLED',
        );
        setEligibleOrders(filtered);
      } catch {
        setEligibleOrders([]);
      }
    } finally {
      setOrdersLoading(false);
    }
  }, []);

  const loadOrderDetail = useCallback(async (orderId: string) => {
    if (!orderId) {
      setOrderDetail(null);
      setLineQuantities({});
      return;
    }
    setDetailLoading(true);
    setError('');
    try {
      const data = await fetchApiData<OrderDetailDto>(`/admin/orders/${orderId}`);
      setOrderDetail(data);
      // Auto-populate default fulfillable quantities
      const initial: Record<string, number> = {};
      data.lines.forEach((line) => {
        if (line.status === 'ACTIVE') {
          const remaining = Number(line.remainingFulfillableQuantity ?? line.quantity);
          initial[line.id] = Math.max(0, remaining);
        }
      });
      setLineQuantities(initial);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load order lines.');
      setOrderDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      setError('');
      if (locations.length > 0 && !selectedLocationId) {
        setSelectedLocationId(locations[0]?.id ?? '');
      }
      if (initialOrderId) {
        setSelectedOrderId(initialOrderId);
        void loadOrderDetail(initialOrderId);
      } else {
        void loadEligibleOrders();
      }
    }
  }, [open, locations, initialOrderId, loadEligibleOrders, loadOrderDetail, selectedLocationId]);

  const handleOrderSelect = (orderId: string) => {
    setSelectedOrderId(orderId);
    void loadOrderDetail(orderId);
  };

  const handleSetAllMax = () => {
    if (!orderDetail) return;
    const updated: Record<string, number> = {};
    orderDetail.lines.forEach((line) => {
      if (line.status === 'ACTIVE') {
        const remaining = Number(line.remainingFulfillableQuantity ?? line.quantity);
        updated[line.id] = Math.max(0, remaining);
      }
    });
    setLineQuantities(updated);
  };

  const handleResetQuantities = () => {
    if (!orderDetail) return;
    const updated: Record<string, number> = {};
    orderDetail.lines.forEach((line) => {
      updated[line.id] = 0;
    });
    setLineQuantities(updated);
  };

  const filteredOrders = eligibleOrders.filter((order) => {
    if (!orderSearch.trim()) return true;
    const term = orderSearch.toLowerCase();
    return (
      order.orderNumber.toLowerCase().includes(term) ||
      (order.customerName && order.customerName.toLowerCase().includes(term))
    );
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderDetail || !selectedLocationId || busy) return;

    setError('');
    const activeLines = orderDetail.lines.filter((l) => l.status === 'ACTIVE');

    const linesToFulfill = activeLines
      .map((line) => {
        const requested = lineQuantities[line.id] ?? 0;
        const remaining = Number(line.remainingFulfillableQuantity ?? line.quantity);
        const effective = Math.min(remaining, Math.max(0, requested));
        return {
          orderLineId: line.id,
          quantity: String(effective),
        };
      })
      .filter((l) => Number(l.quantity) > 0);

    if (linesToFulfill.length === 0) {
      setError('Please specify at least one item quantity greater than 0.');
      return;
    }

    setBusy(true);
    try {
      const res = await fetchApiData<{ id: string }>(
        `/admin/orders/${orderDetail.id}/fulfillments`,
        {
          method: 'POST',
          headers: { 'idempotency-key': crypto.randomUUID() },
          body: JSON.stringify({
            locationId: selectedLocationId,
            lines: linesToFulfill,
          }),
        },
      );
      setOpen(false);
      await onSuccess(res?.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fulfillment creation was rejected.');
    } finally {
      setBusy(false);
    }
  };

  const activeLines = orderDetail?.lines.filter((l) => l.status === 'ACTIVE') ?? [];

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button className="gap-1.5" />}>
        <PackagePlus className="size-4" /> Create Fulfillment
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Boxes className="size-5 text-primary" /> Create Order Fulfillment
          </DialogTitle>
          <DialogDescription>
            Allocate stock from a warehouse location for pick, pack, and delivery preparation.
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive flex items-start gap-2">
            <AlertCircle className="size-4 shrink-0 mt-0.5" />
            <p>{error}</p>
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          {/* Step 1: Order Selection (if not preselected) */}
          {!initialOrderId ? (
            <div className="space-y-2">
              <Label className="text-xs font-medium">Select Order to Fulfill</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search order # or customer name…"
                  value={orderSearch}
                  onChange={(e) => setOrderSearch(e.target.value)}
                  className="pl-8 text-xs h-8"
                />
              </div>

              {ordersLoading ? (
                <div className="flex items-center justify-center p-4 text-muted-foreground">
                  <Loader2 className="size-4 animate-spin mr-2" /> Loading orders awaiting fulfillment…
                </div>
              ) : filteredOrders.length > 0 ? (
                <div className="max-h-36 overflow-y-auto rounded-lg border divide-y">
                  {filteredOrders.map((ord) => (
                    <button
                      key={ord.id}
                      type="button"
                      onClick={() => handleOrderSelect(ord.id)}
                      className={`w-full text-left p-2.5 flex items-center justify-between text-xs transition-colors hover:bg-muted ${
                        selectedOrderId === ord.id ? 'bg-primary/10 font-semibold text-primary' : ''
                      }`}
                    >
                      <div>
                        <span>{ord.orderNumber}</span> · <span className="text-muted-foreground">{ord.customerName}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-muted-foreground">{ord.totalAmount} ৳</span>
                        <ChevronRight className="size-3 text-muted-foreground" />
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground italic py-1">No unfulfilled orders found matching your search.</p>
              )}
            </div>
          ) : null}

          {/* Step 2: Location Selection */}
          <div className="space-y-1.5">
            <Label htmlFor="locationSelect" className="text-xs font-medium flex items-center gap-1.5">
              <Warehouse className="size-3.5 text-primary" /> Source Warehouse Location
            </Label>
            {locations.length === 0 ? (
              <p className="text-xs text-destructive bg-destructive/10 p-2.5 rounded border border-destructive/20">
                No active stock-holding warehouses available. Create an eligible warehouse in Inventory first.
              </p>
            ) : (
              <select
                id="locationSelect"
                className="w-full rounded-md border bg-background px-3 py-2 text-xs focus:ring-2 focus:ring-primary"
                value={selectedLocationId}
                onChange={(e) => setSelectedLocationId(e.target.value)}
                required
              >
                {locations.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.name} ({loc.code})
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Step 3: Partial Fulfillment Line Breakdown */}
          {detailLoading ? (
            <div className="flex items-center justify-center p-8 text-muted-foreground">
              <Loader2 className="size-4 animate-spin mr-2" /> Loading order items…
            </div>
          ) : orderDetail ? (
            <div className="space-y-2 pt-2 border-t">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-semibold text-foreground text-xs">
                    Order Lines for {orderDetail.orderNumber}
                  </h4>
                  <p className="text-[11px] text-muted-foreground">
                    Specify quantity to fulfill. Remaining quantities remain available for subsequent fulfillments.
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleSetAllMax}
                    className="text-[10px] text-primary hover:underline font-medium"
                  >
                    Fulfill all remaining
                  </button>
                  <span className="text-muted-foreground">·</span>
                  <button
                    type="button"
                    onClick={handleResetQuantities}
                    className="text-[10px] text-muted-foreground hover:underline"
                  >
                    Clear
                  </button>
                </div>
              </div>

              <div className="rounded-lg border overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50 border-b">
                    <tr>
                      <th className="text-left font-medium p-2.5">Item / SKU</th>
                      <th className="text-center font-medium p-2.5">Ordered</th>
                      <th className="text-center font-medium p-2.5">Fulfilled</th>
                      <th className="text-center font-medium p-2.5">Remaining</th>
                      <th className="text-right font-medium p-2.5 w-28">Fulfill Now</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {activeLines.map((line) => {
                      const orderedQty = Number(line.quantity);
                      const fulfilledQty = Number(line.fulfilledQuantity ?? 0);
                      const remainingQty = Number(line.remainingFulfillableQuantity ?? (orderedQty - fulfilledQty));
                      const currentVal = lineQuantities[line.id] ?? 0;

                      return (
                        <tr key={line.id} className="hover:bg-muted/20">
                          <td className="p-2.5">
                            <p className="font-medium text-foreground">{line.productTitle}</p>
                            <p className="text-[10px] font-mono text-muted-foreground">{line.sku}</p>
                          </td>
                          <td className="p-2.5 text-center text-muted-foreground">{orderedQty}</td>
                          <td className="p-2.5 text-center text-muted-foreground">{fulfilledQty}</td>
                          <td className="p-2.5 text-center font-semibold text-foreground">
                            {remainingQty}
                          </td>
                          <td className="p-2.5 text-right">
                            <Input
                              type="number"
                              min="0"
                              max={remainingQty}
                              step="1"
                              value={currentVal}
                              disabled={remainingQty <= 0}
                              onChange={(e) => {
                                const val = Math.max(0, Math.min(remainingQty, Number(e.target.value)));
                                setLineQuantities((prev) => ({ ...prev, [line.id]: val }));
                              }}
                              className="w-20 text-right text-xs h-7 ml-auto"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          <DialogFooter className="pt-2 gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={busy || !orderDetail || !selectedLocationId || locations.length === 0}
              className="gap-1.5"
            >
              {busy ? (
                <>
                  <Loader2 className="size-3.5 animate-spin mr-1" /> Creating…
                </>
              ) : (
                <>
                  <Boxes className="size-3.5" /> Create Fulfillment
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
