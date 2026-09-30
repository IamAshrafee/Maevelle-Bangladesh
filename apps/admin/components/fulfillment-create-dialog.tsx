'use client';

import { CircleAlert, Loader2, PackagePlus, Search } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

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
import type { ApiEnvelope, OrderLineDto, WarehouseLocationDto } from '@maevelle/contracts';

interface EligibleOrder {
  id: string;
  orderNumber: string;
  customerName: string;
  status: string;
  fulfillmentStatus: string;
  totalAmount: string;
  createdAt: string;
}

interface OrderDetailResponse {
  id: string;
  orderNumber: string;
  version: number;
  lines: readonly OrderLineDto[];
}

interface FulfillmentCreateDialogProps {
  locations: readonly WarehouseLocationDto[];
  onSuccess: (fulfillmentId?: string) => Promise<void> | void;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    credentials: 'include',
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as {
      error?: string | { message?: string };
    };
    throw new Error(
      typeof payload.error === 'string'
        ? payload.error
        : (payload.error?.message ?? 'The fulfillment request was rejected.'),
    );
  }
  return response.json() as Promise<T>;
}

export function FulfillmentCreateDialog({ locations, onSuccess }: FulfillmentCreateDialogProps) {
  const [open, setOpen] = useState(false);
  const [eligibleOrders, setEligibleOrders] = useState<readonly EligibleOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<string>('');
  const [orderDetail, setOrderDetail] = useState<OrderDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [orderSearch, setOrderSearch] = useState('');
  const [selectedLocationId, setSelectedLocationId] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const loadEligibleOrders = useCallback(async () => {
    setOrdersLoading(true);
    try {
      const res = await request<ApiEnvelope<{ items: readonly EligibleOrder[] }>>(
        '/admin/orders?fulfillmentStatus=UNFULFILLED&pageSize=50',
      );
      setEligibleOrders(res.data.items);
    } catch {
      // Fallback to general order list if filter is not supported
      try {
        const fallbackRes = await request<ApiEnvelope<{ items: readonly EligibleOrder[] }>>(
          '/admin/orders?pageSize=50',
        );
        setEligibleOrders(
          fallbackRes.data.items.filter((o) =>
            ['CONFIRMED', 'PAID', 'PENDING'].includes(o.status) &&
            o.fulfillmentStatus !== 'FULFILLED' &&
            o.fulfillmentStatus !== 'CANCELLED',
          ),
        );
      } catch {
        setEligibleOrders([]);
      }
    } finally {
      setOrdersLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      void loadEligibleOrders();
      setSelectedOrderId('');
      setOrderDetail(null);
      setMessage('');
      if (locations.length > 0) {
        setSelectedLocationId(locations[0]?.id ?? '');
      }
    }
  }, [open, loadEligibleOrders, locations]);

  const loadOrderDetail = useCallback(async (orderId: string) => {
    if (!orderId) {
      setOrderDetail(null);
      return;
    }
    setDetailLoading(true);
    setMessage('');
    try {
      const res = await request<ApiEnvelope<OrderDetailResponse>>(`/admin/orders/${orderId}`);
      setOrderDetail(res.data);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Unable to load order details.');
      setOrderDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const handleOrderChange = (orderId: string) => {
    setSelectedOrderId(orderId);
    void loadOrderDetail(orderId);
  };

  const filteredOrders = eligibleOrders.filter((order) => {
    if (!orderSearch.trim()) return true;
    const term = orderSearch.toLowerCase();
    return (
      order.orderNumber.toLowerCase().includes(term) ||
      (order.customerName && order.customerName.toLowerCase().includes(term))
    );
  });

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!orderDetail || !selectedLocationId || busy) return;

    setBusy(true);
    setMessage('');

    const formData = new FormData(e.currentTarget);
    const activeLines = orderDetail.lines.filter((l) => l.status === 'ACTIVE' || !l.status);

    const fulfillLines = activeLines
      .map((line) => {
        const remaining = Number(line.remainingFulfillableQuantity ?? line.quantity);
        const inputQty = Number(formData.get(`qty-${line.id}`));
        const effectiveQty = Math.min(remaining, Math.max(0, inputQty));
        return {
          orderLineId: line.id,
          quantity: String(effectiveQty),
        };
      })
      .filter((l) => Number(l.quantity) > 0);

    if (fulfillLines.length === 0) {
      setMessage('At least one item must have a fulfillment quantity greater than 0.');
      setBusy(false);
      return;
    }

    try {
      const res = await request<ApiEnvelope<{ id: string }>>(
        `/admin/orders/${orderDetail.id}/fulfillments`,
        {
          method: 'POST',
          headers: {
            'idempotency-key': crypto.randomUUID(),
          },
          body: JSON.stringify({
            locationId: selectedLocationId,
            lines: fulfillLines,
          }),
        },
      );

      setOpen(false);
      await onSuccess(res.data?.id);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Fulfillment creation failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button className="button primary inline-flex items-center gap-1.5" />}>
        <PackagePlus className="size-4" aria-hidden="true" />
        New fulfillment
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create fulfillment</DialogTitle>
          <DialogDescription>
            Allocate stock from a warehouse location to fulfill eligible order items.
          </DialogDescription>
        </DialogHeader>

        {message && (
          <div className="flex items-start gap-2 rounded-lg border border-red-300/70 bg-red-50 p-3 text-sm text-red-950">
            <CircleAlert className="mt-0.5 size-4 shrink-0 text-red-600" />
            <p className="leading-tight">{message}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Order Selection */}
          <div className="space-y-1.5">
            <Label htmlFor="order-selection">Select order requiring fulfillment</Label>
            <div className="relative">
              <input
                type="text"
                placeholder="Search by order number or customer name..."
                value={orderSearch}
                onChange={(e) => setOrderSearch(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
              <Search className="absolute right-2.5 top-2.5 size-4 text-muted-foreground pointer-events-none" />
            </div>

            <select
              id="order-selection"
              value={selectedOrderId}
              onChange={(e) => handleOrderChange(e.target.value)}
              disabled={ordersLoading || busy}
              required
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="">
                {ordersLoading ? 'Loading orders...' : 'Choose an unfulfilled order'}
              </option>
              {filteredOrders.map((order) => (
                <option key={order.id} value={order.id}>
                  {order.orderNumber} • {order.customerName || 'Customer'} • ৳{order.totalAmount} ({order.fulfillmentStatus})
                </option>
              ))}
            </select>
          </div>

          {/* Location Selection */}
          <div className="space-y-1.5">
            <Label htmlFor="warehouse-location">Fulfillment warehouse</Label>
            <select
              id="warehouse-location"
              value={selectedLocationId}
              onChange={(e) => setSelectedLocationId(e.target.value)}
              disabled={busy || locations.length === 0}
              required
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            >
              {locations.length === 0 ? (
                <option value="">No stock-holding warehouses configured</option>
              ) : (
                locations.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.name} ({loc.code})
                  </option>
                ))
              )}
            </select>
          </div>

          {/* Order Lines */}
          {detailLoading && (
            <div className="flex items-center justify-center py-6 text-sm text-muted-foreground gap-2">
              <Loader2 className="size-4 animate-spin" />
              Loading order items...
            </div>
          )}

          {orderDetail && !detailLoading && (
            <div className="space-y-2 border-t pt-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Items to fulfill</Label>
                <span className="text-xs text-muted-foreground">
                  Order {orderDetail.orderNumber}
                </span>
              </div>
              <div className="rounded-md border divide-y max-h-56 overflow-y-auto">
                {orderDetail.lines
                  .filter((line) => line.status === 'ACTIVE' || !line.status)
                  .map((line) => {
                    const remaining = Number(line.remainingFulfillableQuantity ?? line.quantity);
                    const isFullyFulfilled = remaining <= 0;

                    return (
                      <div
                        key={line.id}
                        className={`flex items-center justify-between p-3 ${
                          isFullyFulfilled ? 'bg-muted/40 opacity-70' : ''
                        }`}
                      >
                        <div className="flex flex-col min-w-0 pr-2">
                          <span className="text-sm font-medium truncate">
                            {line.productTitle}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            SKU: {line.sku} • Ordered: {line.quantity}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-xs text-muted-foreground">
                            {isFullyFulfilled ? 'Fulfilled' : `Eligible: ${remaining}`}
                          </span>
                          <Input
                            name={`qty-${line.id}`}
                            type="number"
                            min="0"
                            max={remaining}
                            defaultValue={remaining}
                            disabled={isFullyFulfilled || busy}
                            className="w-20 h-8 text-center"
                          />
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          <DialogFooter className="pt-2">
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
              disabled={busy || !orderDetail || detailLoading || locations.length === 0}
            >
              {busy && <Loader2 className="mr-2 size-4 animate-spin" />}
              Create fulfillment
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
