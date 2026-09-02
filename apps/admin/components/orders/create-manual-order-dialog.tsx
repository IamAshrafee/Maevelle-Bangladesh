'use client';

import { useState, useEffect } from 'react';
import { Box, CircleAlert, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { fetchApiData } from '@/lib/api';
import type { OrderDetailDto, WarehouseLocationDto, CatalogVariantChoiceDto } from '@maevelle/contracts';

export function CreateManualOrderDialog() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  
  const [locations, setLocations] = useState<WarehouseLocationDto[]>([]);
  const [variants, setVariants] = useState<CatalogVariantChoiceDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const [locsData, varsData] = await Promise.all([
          fetchApiData<WarehouseLocationDto[]>('/admin/warehouse/locations'),
          fetchApiData<CatalogVariantChoiceDto[]>('/admin/catalog/variants')
        ]);
        if (mounted) {
          setLocations(locsData || []);
          setVariants(varsData || []);
          setIsLoading(false);
        }
      } catch (err) {
        if (mounted) {
          console.error(err);
          setIsLoading(false);
        }
      }
    }
    load();
    return () => { mounted = false; };
  }, []);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy || isLoading) return;
    setBusy(true);
    
    const formData = new FormData(e.currentTarget);
    const payload = {
      locationId: formData.get('locationId') as string,
      paymentMethod: formData.get('paymentMethod') as string,
      deliveryAddress: {
        addressLine1: formData.get('addressLine1') as string,
        city: formData.get('city') as string,
        countryCode: 'BD',
      },
      lines: [
        {
          variantId: formData.get('variantId') as string,
          quantity: Number(formData.get('quantity')),
        }
      ]
    };

    try {
      const data = await fetchApiData<{ order: OrderDetailDto }>('/admin/orders', {
        method: 'POST',
        body: JSON.stringify(payload),
        headers: {
          'idempotency-key': crypto.randomUUID(),
        },
      });
      router.push(`/orders/${data.order.id}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Order could not be created.');
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="border-b pb-4">
        <h2 className="text-xl font-semibold tracking-tight">Create Manual Order</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Bypass the storefront checkout to place an order on behalf of a customer.
        </p>
      </div>

      {message && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-300/70 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          <CircleAlert className="mt-0.5 size-4 shrink-0" />
          <p className="leading-tight">{message}</p>
        </div>
      )}

      <form onSubmit={submit} className="space-y-6">
        <div className="space-y-4">
          <h3 className="text-sm font-medium">Order Items</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="variantId">Variant ID</Label>
              <select
                id="variantId"
                name="variantId"
                required
                disabled={isLoading || busy}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="">{isLoading ? 'Loading variants...' : 'Select a variant'}</option>
                {variants.map(v => (
                  <option key={v.id} value={v.id}>{v.productTitle} - {v.optionSummary} ({v.sku})</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="quantity">Quantity</Label>
              <Input id="quantity" name="quantity" type="number" min="1" required defaultValue="1" />
            </div>
          </div>
        </div>

        <div className="space-y-4 border-t pt-4">
          <h3 className="text-sm font-medium">Fulfillment & Payment</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="locationId">Fulfillment Location ID</Label>
              <select
                id="locationId"
                name="locationId"
                required
                disabled={isLoading || busy}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="">{isLoading ? 'Loading locations...' : 'Select a location'}</option>
                {locations.map(l => (
                  <option key={l.id} value={l.id}>{l.name} ({l.code})</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="paymentMethod">Payment Method</Label>
              <select 
                id="paymentMethod" 
                name="paymentMethod" 
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                required
              >
                <option value="COD">Cash on Delivery (COD)</option>
                <option value="BKASH">bKash</option>
              </select>
            </div>
          </div>
        </div>

        <div className="space-y-4 border-t pt-4">
          <h3 className="text-sm font-medium">Delivery Address</h3>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="addressLine1">Address Line 1</Label>
              <Input id="addressLine1" name="addressLine1" required placeholder="123 Main St" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="city">City</Label>
              <Input id="city" name="city" required placeholder="Dhaka" />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 border-t pt-4">
          <Button type="button" variant="outline" onClick={() => router.back()}>Cancel</Button>
          <Button type="submit" disabled={busy}>
            {busy && <Loader2 className="mr-2 size-4 animate-spin" />}
            Create Order
          </Button>
        </div>
      </form>
    </div>
  );
}
