'use client';

import React, { useState } from 'react';
import { Worklist, WorklistToolbar } from '@/components/ui/worklist';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { XCircle, Plus, CheckCircle2, Package, Truck, ArrowRight, Anchor } from 'lucide-react';
const request = async (url: string, opts?: any) => fetch(url, opts).then(r => r.json());
const toast = { success: console.log, error: console.error, promise: console.log, info: console.log };

interface Shipment {
  id: string;
  shipmentNumber: string;
  receivingLocationName: string;
  status: string;
  receivingStatus: string;
  version: number;
  allocations: readonly {
    id: string;
    sku: string;
    supplierName: string;
    allocatedQuantity: string;
    receivedQuantity: string;
  }[];
}

export function ShipmentWorklist({ shipments, reload }: { shipments: readonly Shipment[], reload: () => Promise<void> }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  
  const [locationId, setLocationId] = useState('');
  const [transportMode, setTransportMode] = useState('SEA');
  const [purchaseLineId, setPurchaseLineId] = useState('');
  const [quantity, setQuantity] = useState('1');

  // Receiving State
  const [receiveMode, setReceiveMode] = useState(false);
  const [receiveData, setReceiveData] = useState<Record<string, { qty: string, condition: string }>>({});

  const selected = shipments.find(s => s.id === selectedId);

  const handleCreate = async () => {
    if (!locationId || !purchaseLineId || !quantity) { toast.error('Fill in all required fields'); return; }
    try {
      await request('/api/admin/inbound-shipments', {
        method: 'POST',
        body: JSON.stringify({
          receivingLocationId: locationId,
          transportMode,
          allocations: [{ purchaseLineId, quantity }],
        }),
      });
      toast.success('Inbound Shipment planned.');
      setIsCreating(false);
      setLocationId('');
      setPurchaseLineId('');
      setQuantity('1');
      await reload();
    } catch {
      toast.error('Could not plan shipment.');
    }
  };

  const markArrived = async () => {
    if (!selected) return;
    try {
      await request(`/api/admin/inbound-shipments/${selected.id}/arrive`, {
        method: 'POST',
        headers: { 'idempotency-key': crypto.randomUUID() },
        body: JSON.stringify({ version: selected.version }),
      });
      toast.success('Shipment marked as Arrived. Ready for physical receiving.');
      await reload();
    } catch {
      toast.error('Could not mark as arrived.');
    }
  };

  const postReceipt = async () => {
    if (!selected) return;
    const linesToPost = Object.entries(receiveData).map(([allocationId, data]) => ({
      shipmentAllocationId: allocationId,
      condition: data.condition,
      quantity: data.qty,
    })).filter(l => Number(l.quantity) > 0);

    if (linesToPost.length === 0) {
      toast.error('No quantities specified for receiving.');
      return;
    }

    try {
      await request(`/api/admin/inbound-shipments/${selected.id}/receipts`, {
        method: 'POST',
        headers: { 'idempotency-key': crypto.randomUUID() },
        body: JSON.stringify({ lines: linesToPost }),
      });
      toast.success('Receipt posted to the immutable inventory ledger.');
      setReceiveMode(false);
      setReceiveData({});
      await reload();
    } catch {
      toast.error('Receipt could not be posted.');
    }
  };

  const getStatusColor = (status: string) => {
    if (status === 'PLANNED') return 'secondary';
    if (status === 'IN_TRANSIT') return 'warning';
    if (status === 'ARRIVED') return 'success';
    return 'outline';
  };

  const startReceiving = () => {
    if (!selected) return;
    const initialData: Record<string, { qty: string, condition: string }> = {};
    selected.allocations.forEach(alloc => {
      const remaining = Number(alloc.allocatedQuantity) - Number(alloc.receivedQuantity);
      if (remaining > 0) {
        initialData[alloc.id] = { qty: String(remaining), condition: 'SELLABLE' };
      }
    });
    setReceiveData(initialData);
    setReceiveMode(true);
  };

  return (
    <div className="flex h-full min-h-[600px]">
      <div className={`flex-1 flex flex-col min-w-0 transition-all ${selectedId || isCreating ? 'mr-[600px]' : ''}`}>
        <WorklistProvider>
          <div className="flex items-center justify-between mb-4">
            <WorklistToolbar>
              <WorklistSearch placeholder="Search shipment number..." />
              <WorklistFilters options={['PLANNED', 'IN_TRANSIT', 'ARRIVED']} />
            </WorklistToolbar>
            <Button onClick={() => { setIsCreating(true); setSelectedId(null); setReceiveMode(false); }}>
              <Plus className="w-4 h-4 mr-2" /> Plan Shipment
            </Button>
          </div>

          <div className="rounded-md border bg-card">
            <table className="w-full text-sm text-left">
              <thead className="text-xs uppercase bg-muted/50 border-b">
                <tr>
                  <th className="px-6 py-3 font-medium">Shipment #</th>
                  <th className="px-6 py-3 font-medium">Destination</th>
                  <th className="px-6 py-3 font-medium">Transport Status</th>
                  <th className="px-6 py-3 font-medium">Receiving</th>
                  <th className="px-6 py-3 font-medium text-right">Items</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {shipments.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-muted-foreground">
                      No inbound shipments found.
                    </td>
                  </tr>
                ) : (
                  shipments.map((s) => (
                    <tr 
                      key={s.id} 
                      className={`cursor-pointer transition-colors hover:bg-muted/50 ${selectedId === s.id ? 'bg-muted/50' : ''}`}
                      onClick={() => { setSelectedId(s.id); setIsCreating(false); setReceiveMode(false); }}
                    >
                      <td className="px-6 py-4 font-medium">{s.shipmentNumber}</td>
                      <td className="px-6 py-4">{s.receivingLocationName}</td>
                      <td className="px-6 py-4">
                        <Badge variant={getStatusColor(s.status) as any}>{s.status}</Badge>
                      </td>
                      <td className="px-6 py-4">
                        <Badge variant={s.receivingStatus === 'COMPLETE' ? 'success' as any : 'secondary'}>{s.receivingStatus.replace(/_/g, ' ')}</Badge>
                      </td>
                      <td className="px-6 py-4 text-right">{s.allocations.length}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </WorklistProvider>
      </div>

      {isCreating && (
        <aside className="fixed top-16 right-0 w-[600px] h-[calc(100vh-4rem)] bg-card border-l flex flex-col shadow-xl z-20 animate-in slide-in-from-right overflow-y-auto">
          <div className="p-6 border-b flex items-start justify-between bg-card sticky top-0 z-10">
            <div>
              <h3 className="font-semibold text-xl">Plan Inbound Shipment</h3>
              <p className="text-sm text-muted-foreground mt-1">Allocate purchase lines to a physical delivery.</p>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setIsCreating(false)}>
              <XCircle className="h-5 w-5" />
            </Button>
          </div>
          <div className="p-6 space-y-4 flex-1">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Destination Location ID</label>
                <Input placeholder="Location ID" value={locationId} onChange={e => setLocationId(e.target.value)} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Transport Mode</label>
                <Select value={transportMode} onValueChange={setTransportMode}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SEA">Sea Freight</SelectItem>
                    <SelectItem value="AIR">Air Freight</SelectItem>
                    <SelectItem value="ROAD">Road</SelectItem>
                    <SelectItem value="RAIL">Rail</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="bg-muted/20 p-4 rounded-lg border border-dashed space-y-4 mt-6">
              <h5 className="font-medium text-sm flex items-center gap-2 border-b pb-2">
                <Package className="w-4 h-4" /> Initial Allocation
              </h5>
              <div className="space-y-2">
                <label className="text-sm font-medium">Purchase Line ID</label>
                <Input placeholder="Purchase Line ID" value={purchaseLineId} onChange={e => setPurchaseLineId(e.target.value)} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Allocated Quantity</label>
                <Input type="number" min="1" value={quantity} onChange={e => setQuantity(e.target.value)} />
              </div>
            </div>
          </div>
          <div className="p-4 border-t bg-muted/10">
            <Button className="w-full" onClick={handleCreate}>Plan Shipment</Button>
          </div>
        </aside>
      )}

      {selected && !isCreating && !receiveMode && (
        <aside className="fixed top-16 right-0 w-[600px] h-[calc(100vh-4rem)] bg-card border-l flex flex-col shadow-xl z-20 animate-in slide-in-from-right overflow-y-auto">
          <div className="p-6 border-b flex items-start justify-between bg-card sticky top-0 z-10">
            <div>
              <h3 className="font-semibold text-xl">{selected.shipmentNumber}</h3>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-sm text-muted-foreground flex items-center gap-1"><Anchor className="w-3 h-3"/> {selected.receivingLocationName}</span>
                <Badge variant={getStatusColor(selected.status) as any}>{selected.status}</Badge>
                <Badge variant={selected.receivingStatus === 'COMPLETE' ? 'success' as any : 'secondary'}>{selected.receivingStatus.replace(/_/g, ' ')}</Badge>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setSelectedId(null)}>
              <XCircle className="h-5 w-5" />
            </Button>
          </div>

          <div className="p-6 space-y-6 flex-1">
            <div className="space-y-4">
              <h4 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground border-b pb-2">Allocations</h4>
              
              <div className="space-y-3">
                {selected.allocations.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4 bg-muted/20 rounded-md">No items allocated.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-muted-foreground border-b">
                        <th className="text-left font-medium pb-2">SKU</th>
                        <th className="text-left font-medium pb-2">Supplier</th>
                        <th className="text-right font-medium pb-2">Expected</th>
                        <th className="text-right font-medium pb-2">Received</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {selected.allocations.map(alloc => (
                        <tr key={alloc.id}>
                          <td className="py-3 font-mono text-xs">{alloc.sku}</td>
                          <td className="py-3 text-muted-foreground text-xs">{alloc.supplierName}</td>
                          <td className="py-3 text-right font-medium">{alloc.allocatedQuantity}</td>
                          <td className="py-3 text-right">
                            <span className={Number(alloc.receivedQuantity) > 0 ? 'text-success font-medium' : 'text-muted-foreground'}>
                              {alloc.receivedQuantity}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
            
            <div className="bg-muted/10 p-4 rounded-lg border text-sm space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Landed Cost Readiness</span>
                {selected.receivingStatus === 'COMPLETE' ? (
                  <span className="font-medium text-primary cursor-pointer hover:underline">Distribute Costs <ArrowRight className="inline w-3 h-3" /></span>
                ) : (
                  <span className="font-medium text-muted-foreground">Requires full receipt</span>
                )}
              </div>
            </div>
          </div>

          <div className="p-4 border-t bg-muted/10 sticky bottom-0 space-y-2">
            {selected.status !== 'ARRIVED' && (
              <Button className="w-full" variant="outline" onClick={markArrived}>
                <Truck className="w-4 h-4 mr-2" /> Mark Arrived at Destination
              </Button>
            )}
            <Button 
              className="w-full" 
              onClick={startReceiving} 
              disabled={selected.receivingStatus === 'COMPLETE' || selected.status !== 'ARRIVED'}
            >
              Receive Items
            </Button>
          </div>
        </aside>
      )}

      {selected && receiveMode && (
        <aside className="fixed top-16 right-0 w-[600px] h-[calc(100vh-4rem)] bg-card border-l flex flex-col shadow-xl z-20 animate-in slide-in-from-right overflow-y-auto">
          <div className="p-6 border-b flex items-start justify-between bg-primary/5 sticky top-0 z-10 border-primary/20">
            <div>
              <h3 className="font-semibold text-xl text-primary flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5" /> Receive against {selected.shipmentNumber}
              </h3>
              <p className="text-sm text-muted-foreground mt-1">Specify condition and quantity. This posts to the immutable ledger.</p>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setReceiveMode(false)}>
              <XCircle className="h-5 w-5" />
            </Button>
          </div>

          <div className="p-6 space-y-6 flex-1 bg-muted/5">
            <div className="space-y-4">
              {selected.allocations.map(alloc => {
                const expected = Number(alloc.allocatedQuantity);
                const received = Number(alloc.receivedQuantity);
                const remaining = expected - received;
                const isComplete = remaining <= 0;

                return (
                  <div key={alloc.id} className={`p-4 border rounded-lg ${isComplete ? 'bg-muted/30 opacity-50' : 'bg-card'}`}>
                    <div className="flex justify-between items-start mb-3 border-b pb-3">
                      <div>
                        <p className="font-mono text-sm font-medium">{alloc.sku}</p>
                        <p className="text-xs text-muted-foreground">{alloc.supplierName}</p>
                      </div>
                      <div className="text-right text-xs">
                        <p>Expected: <strong>{expected}</strong></p>
                        <p>Received: <strong className="text-success">{received}</strong></p>
                      </div>
                    </div>
                    
                    {!isComplete && (
                      <div className="flex gap-3 items-end">
                        <div className="flex-1 space-y-1">
                          <label className="text-xs font-medium text-muted-foreground">Receive Qty</label>
                          <Input 
                            type="number" 
                            min="0" 
                            max={remaining}
                            value={receiveData[alloc.id]?.qty ?? ''}
                            onChange={e => setReceiveData({
                              ...receiveData,
                              [alloc.id]: { ...receiveData[alloc.id], qty: e.target.value }
                            })}
                          />
                        </div>
                        <div className="flex-1 space-y-1">
                          <label className="text-xs font-medium text-muted-foreground">Condition</label>
                          <Select 
                            value={receiveData[alloc.id]?.condition ?? 'SELLABLE'}
                            onValueChange={v => setReceiveData({
                              ...receiveData,
                              [alloc.id]: { ...receiveData[alloc.id], condition: v }
                            })}
                          >
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="SELLABLE">Sellable</SelectItem>
                              <SelectItem value="DAMAGED">Damaged</SelectItem>
                              <SelectItem value="QUARANTINE">Quarantine</SelectItem>
                              <SelectItem value="INSPECTION">Inspection</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="p-4 border-t bg-card sticky bottom-0 flex justify-between gap-4">
            <Button variant="outline" className="flex-1" onClick={() => setReceiveMode(false)}>Cancel</Button>
            <Button className="flex-1" onClick={postReceipt}>Post Receipt to Ledger</Button>
          </div>
        </aside>
      )}
    </div>
  );
}

function WorklistProvider({ children }: { children: React.ReactNode }) {
  return <div className="space-y-4">{children}</div>;
}
