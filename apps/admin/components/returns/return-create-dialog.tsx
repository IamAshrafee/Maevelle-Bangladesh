'use client';

import {
  AlertCircle,
  Boxes,
  CheckCircle2,
  ChevronRight,
  Loader2,
  Plus,
  RotateCcw,
  Search,
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
import { Textarea } from '@/components/ui/textarea';
import { fetchApiData } from '@/lib/api';
import type { OrderDetailDto, OrderLineDto } from '@maevelle/contracts';

interface OrderSummary {
  id: string;
  orderNumber: string;
  customerName: string;
  status: string;
  totalAmount: string;
}

interface ReturnCreateDialogProps {
  initialOrderId?: string | undefined;
  onSuccess: (newReturnId?: string) => Promise<void> | void;
}

export function ReturnCreateDialog({
  initialOrderId,
  onSuccess,
}: ReturnCreateDialogProps) {
  const [open, setOpen] = useState(false);
  const [orders, setOrders] = useState<readonly OrderSummary[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [orderSearch, setOrderSearch] = useState('');
  const [selectedOrderId, setSelectedOrderId] = useState<string>(initialOrderId ?? '');
  const [orderDetail, setOrderDetail] = useState<OrderDetailDto | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [reasonCode, setReasonCode] = useState('CUSTOMER_CHANGED_MIND');
  const [reasonText, setReasonText] = useState('');
  const [lineQuantities, setLineQuantities] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const loadOrders = useCallback(async () => {
    setOrdersLoading(true);
    try {
      const res = await fetchApiData<{ items: readonly OrderSummary[] }>('/admin/orders?pageSize=50');
      setOrders(res?.items ?? []);
    } catch {
      setOrders([]);
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
      const initial: Record<string, number> = {};
      data.lines.forEach((l) => {
        initial[l.id] = 0;
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
      if (initialOrderId) {
        setSelectedOrderId(initialOrderId);
        void loadOrderDetail(initialOrderId);
      } else {
        void loadOrders();
      }
    }
  }, [open, initialOrderId, loadOrders, loadOrderDetail]);

  const handleOrderSelect = (orderId: string) => {
    setSelectedOrderId(orderId);
    void loadOrderDetail(orderId);
  };

  const filteredOrders = orders.filter((order) => {
    if (!orderSearch.trim()) return true;
    const term = orderSearch.toLowerCase();
    return (
      order.orderNumber.toLowerCase().includes(term) ||
      (order.customerName && order.customerName.toLowerCase().includes(term))
    );
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderDetail || busy) return;

    setError('');
    const linesToReturn = orderDetail.lines
      .map((line) => {
        const qty = lineQuantities[line.id] ?? 0;
        const max = Number(line.quantity);
        const effective = Math.min(max, Math.max(0, qty));
        return {
          orderLineId: line.id,
          quantity: String(effective),
        };
      })
      .filter((l) => Number(l.quantity) > 0);

    if (linesToReturn.length === 0) {
      setError('Please select at least one item quantity to return.');
      return;
    }

    setBusy(true);
    try {
      const res = await fetchApiData<{ id: string }>('/admin/returns', {
        method: 'POST',
        headers: { 'idempotency-key': crypto.randomUUID() },
        body: JSON.stringify({
          orderId: orderDetail.id,
          reasonCode,
          reasonText: reasonText.trim() || undefined,
          lines: linesToReturn,
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      setOpen(false);
      await onSuccess(res?.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create Customer Return.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button className="gap-1.5" />}>
        <RotateCcw className="size-4" /> New Customer Return
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <RotateCcw className="size-5 text-primary" /> Create Customer Return Request
          </DialogTitle>
          <DialogDescription>
            Register a return request from a customer. Authorization and reverse shipment are managed afterward.
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive flex items-start gap-2">
            <AlertCircle className="size-4 shrink-0 mt-0.5" />
            <p>{error}</p>
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          {/* Step 1: Select Order */}
          {!initialOrderId ? (
            <div className="space-y-2">
              <Label className="text-xs font-medium">Select Order</Label>
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
                  <Loader2 className="size-4 animate-spin mr-2" /> Loading orders…
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
                <p className="text-xs text-muted-foreground italic py-1">No orders found matching your search.</p>
              )}
            </div>
          ) : null}

          {/* Reason Configuration */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="reasonSelect" className="text-xs font-medium">Return Reason</Label>
              <select
                id="reasonSelect"
                className="w-full rounded-md border bg-background px-3 py-2 text-xs focus:ring-2 focus:ring-primary"
                value={reasonCode}
                onChange={(e) => setReasonCode(e.target.value)}
              >
                <option value="CUSTOMER_CHANGED_MIND">Customer Changed Mind</option>
                <option value="DAMAGED_ON_ARRIVAL">Damaged on Arrival</option>
                <option value="WRONG_ITEM_SENT">Wrong Item Sent</option>
                <option value="WRONG_SIZE">Wrong Size / Fit Issue</option>
                <option value="DEFECTIVE_PRODUCT">Defective / Quality Problem</option>
                <option value="OTHER">Other Reason</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reasonNotes" className="text-xs font-medium">Customer Context / Notes</Label>
              <Input
                id="reasonNotes"
                placeholder="e.g. Buyer requested size exchange for XL"
                value={reasonText}
                onChange={(e) => setReasonText(e.target.value)}
                className="text-xs h-8"
              />
            </div>
          </div>

          {/* Order Lines Selection */}
          {detailLoading ? (
            <div className="flex items-center justify-center p-8 text-muted-foreground">
              <Loader2 className="size-4 animate-spin mr-2" /> Loading order items…
            </div>
          ) : orderDetail ? (
            <div className="space-y-2 pt-2 border-t">
              <h4 className="font-semibold text-foreground text-xs">
                Select Items to Return for {orderDetail.orderNumber}
              </h4>

              <div className="rounded-lg border overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50 border-b">
                    <tr>
                      <th className="text-left font-medium p-2.5">Item / SKU</th>
                      <th className="text-center font-medium p-2.5">Purchased</th>
                      <th className="text-right font-medium p-2.5 w-28">Return Qty</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {orderDetail.lines.map((line) => {
                      const maxQty = Number(line.quantity);
                      const currentVal = lineQuantities[line.id] ?? 0;

                      return (
                        <tr key={line.id} className="hover:bg-muted/20">
                          <td className="p-2.5">
                            <p className="font-medium text-foreground">{line.productTitle}</p>
                            <p className="text-[10px] font-mono text-muted-foreground">{line.sku}</p>
                          </td>
                          <td className="p-2.5 text-center font-semibold text-muted-foreground">
                            {maxQty}
                          </td>
                          <td className="p-2.5 text-right">
                            <Input
                              type="number"
                              min="0"
                              max={maxQty}
                              step="1"
                              value={currentVal}
                              onChange={(e) => {
                                const val = Math.max(0, Math.min(maxQty, Number(e.target.value)));
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
              disabled={busy || !orderDetail}
              className="gap-1.5"
            >
              {busy ? (
                <>
                  <Loader2 className="size-3.5 animate-spin mr-1" /> Submitting…
                </>
              ) : (
                'Create Return Request'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
