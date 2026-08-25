'use client';

import React, { useEffect, useState } from 'react';
import type { ApiEnvelope, WarehouseLocationDto } from '@maevelle/contracts';
import { Worklist, WorklistToolbar } from '@/components/ui/worklist';
const request = async (url: string, opts?: any) => fetch(url, opts).then(r => r.json());
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Box, Check, Printer, ScanBarcode, CheckCircle2, Play, Package, Truck, Ban } from 'lucide-react';
const toast = { success: console.log, error: console.error, promise: console.log, info: console.log };
import { Input } from '@/components/ui/input';

interface Fulfillment {
  id: string;
  version: number;
  fulfillmentNumber: string;
  orderNumber: string;
  locationName: string;
  status: 'DRAFT' | 'READY' | 'PICKING' | 'PACKED' | 'DISPATCHED' | 'CANCELLED';
  lines: readonly { sku: string; productTitle: string; quantity: string; consumed: string }[];
}

export function FulfillmentConsole() {
  const [fulfillments, setFulfillments] = useState<readonly Fulfillment[]>([]);
  const [locations, setLocations] = useState<readonly WarehouseLocationDto[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [scanInput, setScanInput] = useState('');

  const reload = async () => {
    try {
      const [fulfillmentResult, locationResult] = await Promise.all([
        request<ApiEnvelope<readonly Fulfillment[]>>('/admin/fulfillments'),
        request<ApiEnvelope<readonly WarehouseLocationDto[]>>('/admin/warehouse/locations'),
      ]);
      setFulfillments(fulfillmentResult.data);
      setLocations(locationResult.data.filter((location) => location.capabilities.includes('STOCK_HOLDING')));
    } catch (error) {
      toast.error('Unable to load fulfillment operations.');
    }
  };

  useEffect(() => {
    void reload();
  }, []);

  const action = async (
    fulfillment: Fulfillment,
    actionName: 'ready' | 'start-picking' | 'pack' | 'dispatch' | 'cancel',
  ) => {
    try {
      if (
        actionName === 'dispatch' &&
        !window.confirm('Dispatch will physically deduct the reserved inventory. Continue?')
      )
        return;
      await request(`/api/admin/fulfillments/${fulfillment.id}/${actionName}`, {
        method: 'POST',
        ...(actionName === 'dispatch' || actionName === 'cancel'
          ? { headers: { 'idempotency-key': crypto.randomUUID() } }
          : {}),
        body: JSON.stringify({ version: fulfillment.version }),
      });
      toast.success(`Fulfillment ${actionName.replace('-', ' ')} completed.`);
      await reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'The fulfillment command was rejected.');
    }
  };

  const createDelivery = async (fulfillment: Fulfillment) => {
    try {
      await request(`/api/admin/fulfillments/${fulfillment.id}/deliveries`, {
        method: 'POST',
        headers: { 'idempotency-key': crypto.randomUUID() },
        body: JSON.stringify({}),
      });
      toast.success('Delivery created. Continue in Operations → Deliveries.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Delivery could not be created.');
    }
  };

  const selectedFulfillment = fulfillments.find(f => f.id === selectedId);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'DRAFT': return 'secondary';
      case 'READY': return 'default';
      case 'PICKING': return 'warning';
      case 'PACKED': return 'default';
      case 'DISPATCHED': return 'success';
      case 'CANCELLED': return 'destructive';
      default: return 'outline';
    }
  };

  const handlePrintPackingSlip = () => {
    if (!selectedFulfillment) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const html = `
      <html>
        <head>
          <title>Packing Slip - ${selectedFulfillment.fulfillmentNumber}</title>
          <style>
            body { font-family: system-ui, sans-serif; padding: 40px; color: #111; }
            .header { border-bottom: 2px solid #eee; padding-bottom: 20px; margin-bottom: 30px; display: flex; justify-content: space-between; }
            .title { font-size: 24px; font-weight: bold; }
            .meta { color: #555; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { text-align: left; padding: 12px; border-bottom: 1px solid #eee; }
            th { background: #f9f9f9; font-weight: 600; }
            .footer { margin-top: 50px; font-size: 12px; color: #777; text-align: center; }
          </style>
        </head>
        <body>
          <div class="header">
            <div>
              <div class="title">PACKING SLIP</div>
              <div class="meta">#${selectedFulfillment.fulfillmentNumber}</div>
            </div>
            <div style="text-align: right;">
              <div><strong>Order:</strong> ${selectedFulfillment.orderNumber}</div>
              <div><strong>Location:</strong> ${selectedFulfillment.locationName}</div>
            </div>
          </div>
          <table>
            <thead>
              <tr>
                <th>SKU</th>
                <th>Product</th>
                <th style="text-align: right;">Qty</th>
                <th style="text-align: center;">Picked</th>
              </tr>
            </thead>
            <tbody>
              ${selectedFulfillment.lines.map(line => `
                <tr>
                  <td style="font-family: monospace;">${line.sku}</td>
                  <td>${line.productTitle}</td>
                  <td style="text-align: right;">${line.quantity}</td>
                  <td style="text-align: center;"><div style="width: 20px; height: 20px; border: 1px solid #000; margin: 0 auto;"></div></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          <div class="footer">
            Generated by Maevelle Admin System
          </div>
        </body>
      </html>
    `;
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.print();
  };

  return (
    <main className="flex h-[calc(100vh-4rem)]">
      <div className={`flex-1 flex flex-col min-w-0 transition-all ${selectedId ? 'mr-[400px]' : ''}`}>
        <div className="p-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight mb-2">Fulfillments</h1>
            <p className="text-muted-foreground mb-6">Manage warehouse picking, packing, and dispatch operations.</p>
          </div>
          
          <WorklistProvider>
            <WorklistToolbar>
              <WorklistSearch placeholder="Search fulfillment or order number..." />
              <WorklistFilters options={['DRAFT', 'READY', 'PICKING', 'PACKED', 'DISPATCHED', 'CANCELLED']} />
            </WorklistToolbar>
            
            <div className="mt-4 rounded-md border bg-card">
              <table className="w-full text-sm text-left">
                <thead className="text-xs uppercase bg-muted/50 border-b">
                  <tr>
                    <th className="px-6 py-3 font-medium">Fulfillment #</th>
                    <th className="px-6 py-3 font-medium">Order</th>
                    <th className="px-6 py-3 font-medium">Location</th>
                    <th className="px-6 py-3 font-medium">Status</th>
                    <th className="px-6 py-3 font-medium text-right">Items</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {fulfillments.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-8 text-center text-muted-foreground">
                        No fulfillments found.
                      </td>
                    </tr>
                  ) : (
                    fulfillments.map((f) => (
                      <tr 
                        key={f.id} 
                        className={`cursor-pointer transition-colors hover:bg-muted/50 ${selectedId === f.id ? 'bg-muted/50' : ''}`}
                        onClick={() => setSelectedId(f.id)}
                      >
                        <td className="px-6 py-4 font-medium">{f.fulfillmentNumber}</td>
                        <td className="px-6 py-4 text-muted-foreground">{f.orderNumber}</td>
                        <td className="px-6 py-4">{f.locationName}</td>
                        <td className="px-6 py-4">
                          <Badge variant={getStatusColor(f.status) as any}>{f.status}</Badge>
                        </td>
                        <td className="px-6 py-4 text-right">{f.lines.length} lines</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </WorklistProvider>
        </div>
      </div>

      {selectedFulfillment && (
        <aside className="fixed top-16 right-0 w-[400px] h-[calc(100vh-4rem)] bg-card border-l flex flex-col shadow-xl z-20 animate-in slide-in-from-right">
          <div className="p-4 border-b flex items-center justify-between sticky top-0 bg-card">
            <div>
              <h3 className="font-semibold text-lg">{selectedFulfillment.fulfillmentNumber}</h3>
              <p className="text-xs text-muted-foreground">Order {selectedFulfillment.orderNumber}</p>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setSelectedId(null)}>
              <Ban className="h-4 w-4" />
            </Button>
          </div>

          <div className="flex-1 overflow-auto p-4 space-y-6">
            <div className="flex items-center justify-between">
              <Badge variant={getStatusColor(selectedFulfillment.status) as any} className="text-sm">
                {selectedFulfillment.status}
              </Badge>
              <Button variant="outline" size="sm" onClick={handlePrintPackingSlip}>
                <Printer className="mr-2 h-4 w-4" /> Print Slip
              </Button>
            </div>

            <div className="space-y-4">
              <h4 className="text-sm font-semibold flex items-center gap-2">
                <Box className="h-4 w-4 text-muted-foreground" /> Picking List
              </h4>
              
              {selectedFulfillment.status === 'PICKING' && (
                <div className="flex gap-2">
                  <Input 
                    placeholder="Scan SKU barcode..." 
                    value={scanInput}
                    onChange={(e) => setScanInput(e.target.value)}
                    className="font-mono text-xs"
                    autoFocus
                  />
                  <Button variant="secondary" size="icon">
                    <ScanBarcode className="h-4 w-4" />
                  </Button>
                </div>
              )}

              <div className="space-y-3">
                {selectedFulfillment.lines.map((line) => (
                  <div key={line.sku} className="p-3 border rounded-md bg-muted/20 flex flex-col gap-2">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <p className="font-medium text-sm leading-tight">{line.productTitle}</p>
                        <p className="text-xs text-muted-foreground font-mono mt-1">{line.sku}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold">Qty {line.quantity}</p>
                        {selectedFulfillment.status === 'DISPATCHED' && (
                          <p className="text-xs text-success">Consumed {line.consumed}</p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="p-4 border-t bg-muted/10 space-y-2 sticky bottom-0">
             {selectedFulfillment.status === 'DRAFT' && (
                <Button className="w-full" onClick={() => action(selectedFulfillment, 'ready')}>
                  <CheckCircle2 className="mr-2 h-4 w-4" /> Mark as Ready
                </Button>
              )}
              {selectedFulfillment.status === 'READY' && (
                <Button className="w-full" onClick={() => action(selectedFulfillment, 'start-picking')}>
                  <Play className="mr-2 h-4 w-4" /> Start Picking Workflow
                </Button>
              )}
              {selectedFulfillment.status === 'PICKING' && (
                <Button className="w-full" onClick={() => action(selectedFulfillment, 'pack')}>
                  <Package className="mr-2 h-4 w-4" /> Complete Packing
                </Button>
              )}
              {selectedFulfillment.status === 'PACKED' && (
                <Button className="w-full" variant="default" onClick={() => action(selectedFulfillment, 'dispatch')}>
                  <Truck className="mr-2 h-4 w-4" /> Dispatch & Consume Stock
                </Button>
              )}
              {selectedFulfillment.status === 'DISPATCHED' && (
                <Button className="w-full" onClick={() => createDelivery(selectedFulfillment)}>
                  <Truck className="mr-2 h-4 w-4" /> Create Delivery
                </Button>
              )}
              {['DRAFT', 'READY', 'PICKING', 'PACKED'].includes(selectedFulfillment.status) && (
                <Button variant="destructive" className="w-full" onClick={() => action(selectedFulfillment, 'cancel')}>
                  Cancel Fulfillment
                </Button>
              )}
          </div>
        </aside>
      )}
    </main>
  );
}

function WorklistProvider({ children }: { children: React.ReactNode }) {
  return <div className="space-y-4">{children}</div>;
}
