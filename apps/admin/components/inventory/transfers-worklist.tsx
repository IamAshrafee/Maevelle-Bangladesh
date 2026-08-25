'use client';

import React, { useState } from 'react';
import { Worklist, WorklistToolbar } from '@/components/ui/worklist';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowRight, Package, Truck, CheckCircle2, XCircle, FileText } from 'lucide-react';
const request = async (url: string, opts?: any) => fetch(url, opts).then(r => r.json());
const toast = { success: console.log, error: console.error, promise: console.log, info: console.log };

type WarehouseTransfer = {
  id: string;
  transferNumber: string;
  status: string;
  version: number;
  lines: readonly {
    id: string;
    requestedQuantity: string;
    dispatchedQuantity: string;
    receivedQuantity: string;
  }[];
};

export function TransfersWorklist({ transfers, locations, reload }: { transfers: readonly WarehouseTransfer[], locations: any[], reload: () => Promise<void> }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  
  // Create state
  const [isCreating, setIsCreating] = useState(false);
  const [sourceLocationId, setSourceLocationId] = useState('');
  const [destinationLocationId, setDestinationLocationId] = useState('');
  const [variantId, setVariantId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [notes, setNotes] = useState('');

  // Receiving state
  const [receiveQuantities, setReceiveQuantities] = useState<Record<string, string>>({});

  const selected = transfers.find(t => t.id === selectedId);

  const handleCreate = async () => {
    if (!sourceLocationId || !destinationLocationId || !variantId || !quantity) {
      toast.error('Fill in all required fields.');
      return;
    }
    if (sourceLocationId === destinationLocationId) {
      toast.error('Source and destination cannot be the same.');
      return;
    }

    try {
      await request('/api/admin/warehouse/transfers', {
        method: 'POST',
        body: JSON.stringify({
          sourceLocationId,
          destinationLocationId,
          lines: [{ variantId, quantity }],
          notes: notes || undefined,
        }),
      });
      toast.success('Draft Transfer created successfully.');
      setIsCreating(false);
      setSourceLocationId('');
      setDestinationLocationId('');
      setVariantId('');
      setQuantity('');
      setNotes('');
      await reload();
    } catch {
      toast.error('Transfer could not be created. Check the locations, variant, and quantity.');
    }
  };

  const progressTransfer = async (transfer: WarehouseTransfer) => {
    try {
      if (transfer.status === 'DRAFT') {
        await request(`/api/admin/warehouse/transfers/${transfer.id}/approve`, {
          method: 'POST',
          body: JSON.stringify({ version: transfer.version }),
        });
        toast.success('Transfer Approved. Ready for dispatch.');
      } else if (transfer.status === 'READY') {
        await request(`/api/admin/warehouse/transfers/${transfer.id}/dispatch`, {
          method: 'POST',
          headers: { 'idempotency-key': crypto.randomUUID() },
        });
        toast.success('Transfer Dispatched. Stock removed from source.');
      } else if (transfer.status === 'IN_TRANSIT' || transfer.status === 'PARTIALLY_RECEIVED') {
        const linesToReceive = transfer.lines
          .filter(line => Number(line.dispatchedQuantity) > Number(line.receivedQuantity))
          .map(line => ({
            transferLineId: line.id,
            sellableQuantity: receiveQuantities[line.id] || String(Number(line.dispatchedQuantity) - Number(line.receivedQuantity)),
          }))
          .filter(l => Number(l.sellableQuantity) > 0);

        if (linesToReceive.length === 0) {
          toast.error('Specify quantities to receive.');
          return;
        }

        await request(`/api/admin/warehouse/transfers/${transfer.id}/receive`, {
          method: 'POST',
          headers: { 'idempotency-key': crypto.randomUUID() },
          body: JSON.stringify({ lines: linesToReceive }),
        });
        toast.success('Transfer received into destination stock.');
        setReceiveQuantities({});
      }
      await reload();
    } catch {
      toast.error('Transfer could not progress. Refresh and verify its current state.');
    }
  };

  const cancelTransfer = async (transfer: WarehouseTransfer) => {
    try {
      await request(`/api/admin/warehouse/transfers/${transfer.id}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ version: transfer.version }),
      });
      toast.success('Draft Transfer cancelled.');
      await reload();
      setSelectedId(null);
    } catch {
      toast.error('Only Draft Transfers can be cancelled.');
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'DRAFT': return 'secondary';
      case 'READY': return 'default';
      case 'IN_TRANSIT': return 'warning';
      case 'PARTIALLY_RECEIVED': return 'warning';
      case 'RECEIVED': return 'success';
      case 'CANCELLED': return 'outline';
      default: return 'outline';
    }
  };

  const renderStepper = (status: string) => {
    const steps = [
      { id: 'DRAFT', label: 'Draft', icon: FileText },
      { id: 'READY', label: 'Ready', icon: Package },
      { id: 'IN_TRANSIT', label: 'In Transit', icon: Truck },
      { id: 'RECEIVED', label: 'Received', icon: CheckCircle2 },
    ];

    let currentIndex = steps.findIndex(s => s.id === status);
    if (status === 'PARTIALLY_RECEIVED') currentIndex = 2; // Keep at transit roughly
    if (status === 'CANCELLED') currentIndex = 0; // Show failed at start

    return (
      <div className="flex items-center justify-between w-full mt-4 mb-8 relative">
        <div className="absolute top-1/2 left-0 w-full h-1 bg-muted -z-10 -translate-y-1/2 rounded"></div>
        <div 
          className="absolute top-1/2 left-0 h-1 bg-primary -z-10 -translate-y-1/2 transition-all rounded" 
          style={{ width: `${(currentIndex / (steps.length - 1)) * 100}%` }}
        ></div>
        
        {steps.map((step, index) => {
          const isActive = index <= currentIndex;
          const isError = index === currentIndex && status === 'CANCELLED';
          const Icon = isError ? XCircle : step.icon;
          
          return (
            <div key={step.id} className="flex flex-col items-center bg-card px-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-colors ${
                isActive 
                  ? (isError ? 'bg-destructive border-destructive text-destructive-foreground' : 'bg-primary border-primary text-primary-foreground') 
                  : 'bg-background border-muted text-muted-foreground'
              }`}>
                <Icon className="w-4 h-4" />
              </div>
              <span className={`text-xs mt-2 font-medium ${isActive ? (isError ? 'text-destructive' : 'text-foreground') : 'text-muted-foreground'}`}>
                {isError ? status : step.label}
              </span>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="flex h-full min-h-[500px]">
      <div className={`flex-1 flex flex-col min-w-0 transition-all ${selectedId || isCreating ? 'mr-[450px]' : ''}`}>
        
        <WorklistProvider>
          <div className="flex items-center justify-between mb-4">
            <WorklistToolbar>
              <WorklistSearch placeholder="Search transfer number..." />
              <WorklistFilters options={['DRAFT', 'READY', 'IN_TRANSIT', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED']} />
            </WorklistToolbar>
            <Button onClick={() => { setIsCreating(true); setSelectedId(null); }}>
              New Transfer
            </Button>
          </div>
          
          <div className="rounded-md border bg-card">
            <table className="w-full text-sm text-left">
              <thead className="text-xs uppercase bg-muted/50 border-b">
                <tr>
                  <th className="px-6 py-3 font-medium">Transfer #</th>
                  <th className="px-6 py-3 font-medium">Status</th>
                  <th className="px-6 py-3 font-medium text-right">Lines</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {transfers.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-6 py-8 text-center text-muted-foreground">
                      No transfers found.
                    </td>
                  </tr>
                ) : (
                  transfers.map((t) => (
                    <tr 
                      key={t.id} 
                      className={`cursor-pointer transition-colors hover:bg-muted/50 ${selectedId === t.id ? 'bg-muted/50' : ''}`}
                      onClick={() => { setSelectedId(t.id); setIsCreating(false); }}
                    >
                      <td className="px-6 py-4 font-medium">{t.transferNumber}</td>
                      <td className="px-6 py-4">
                        <Badge variant={getStatusColor(t.status) as any}>{t.status}</Badge>
                      </td>
                      <td className="px-6 py-4 text-right">{t.lines.length}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </WorklistProvider>
      </div>

      {isCreating && (
        <aside className="fixed top-16 right-0 w-[450px] h-[calc(100vh-4rem)] bg-card border-l flex flex-col shadow-xl z-20 animate-in slide-in-from-right overflow-y-auto">
          <div className="p-6 border-b flex items-start justify-between bg-card sticky top-0 z-10">
            <div>
              <h3 className="font-semibold text-xl">Create Draft Transfer</h3>
              <p className="text-sm text-muted-foreground mt-1">Approval and dispatch are explicit lifecycle steps.</p>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setIsCreating(false)}>
              <XCircle className="h-5 w-5" />
            </Button>
          </div>
          <div className="p-6 space-y-4 flex-1">
            <div className="space-y-2">
              <label className="text-sm font-medium">Source Location</label>
              <Select value={sourceLocationId} onValueChange={setSourceLocationId}>
                <SelectTrigger><SelectValue placeholder="Choose source" /></SelectTrigger>
                <SelectContent>
                  {locations.map((loc) => <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Destination Location</label>
              <Select value={destinationLocationId} onValueChange={setDestinationLocationId}>
                <SelectTrigger><SelectValue placeholder="Choose destination" /></SelectTrigger>
                <SelectContent>
                  {locations.map((loc) => <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Variant ID</label>
              <Input placeholder="e.g. VAR-123" value={variantId} onChange={e => setVariantId(e.target.value)} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Quantity</label>
              <Input type="number" placeholder="e.g. 50" value={quantity} onChange={e => setQuantity(e.target.value)} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Notes (Optional)</label>
              <Input placeholder="Reason for transfer" value={notes} onChange={e => setNotes(e.target.value)} />
            </div>
          </div>
          <div className="p-4 border-t bg-muted/10">
            <Button className="w-full" onClick={handleCreate}>Create Draft</Button>
          </div>
        </aside>
      )}

      {selected && !isCreating && (
        <aside className="fixed top-16 right-0 w-[450px] h-[calc(100vh-4rem)] bg-card border-l flex flex-col shadow-xl z-20 animate-in slide-in-from-right overflow-y-auto">
          <div className="p-6 border-b flex items-start justify-between bg-card sticky top-0 z-10">
            <div>
              <h3 className="font-semibold text-xl">{selected.transferNumber}</h3>
              <div className="flex gap-2 mt-1">
                <Badge variant={getStatusColor(selected.status) as any}>{selected.status}</Badge>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setSelectedId(null)}>
              <XCircle className="h-5 w-5" />
            </Button>
          </div>

          <div className="p-6 space-y-8 flex-1">
            <div>
              {renderStepper(selected.status)}
            </div>

            <div className="space-y-4">
              <h4 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Items</h4>
              <div className="space-y-3">
                {selected.lines.map(line => {
                  const req = Number(line.requestedQuantity);
                  const disp = Number(line.dispatchedQuantity);
                  const rcv = Number(line.receivedQuantity);
                  const canReceive = (selected.status === 'IN_TRANSIT' || selected.status === 'PARTIALLY_RECEIVED') && disp > rcv;

                  return (
                    <div key={line.id} className="border rounded-md p-4 bg-muted/20">
                      <div className="flex justify-between items-start mb-2">
                        <p className="font-medium text-sm font-mono">{line.id}</p>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-sm text-center mb-4 border-t pt-2 mt-2">
                        <div>
                          <p className="text-muted-foreground text-xs">Requested</p>
                          <p className="font-semibold">{req}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground text-xs">Dispatched</p>
                          <p className="font-semibold">{disp}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground text-xs">Received</p>
                          <p className="font-semibold text-success">{rcv}</p>
                        </div>
                      </div>

                      {canReceive && (
                        <div className="pt-3 border-t flex gap-2 items-end">
                          <div className="flex-1 space-y-1">
                            <label className="text-xs font-medium">Receive Qty</label>
                            <Input 
                              type="number" 
                              min="0" 
                              max={disp - rcv}
                              placeholder={String(disp - rcv)}
                              value={receiveQuantities[line.id] !== undefined ? receiveQuantities[line.id] : ''}
                              onChange={e => setReceiveQuantities({...receiveQuantities, [line.id]: e.target.value})}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="p-4 border-t bg-muted/10 space-y-2 sticky bottom-0">
            {selected.status === 'DRAFT' && (
              <div className="flex gap-2">
                <Button className="flex-1" variant="outline" onClick={() => cancelTransfer(selected)}>Cancel</Button>
                <Button className="flex-1" onClick={() => progressTransfer(selected)}>Approve</Button>
              </div>
            )}
            {selected.status === 'READY' && (
              <Button className="w-full" onClick={() => progressTransfer(selected)}>Dispatch Inventory</Button>
            )}
            {(selected.status === 'IN_TRANSIT' || selected.status === 'PARTIALLY_RECEIVED') && (
              <Button className="w-full text-success" onClick={() => progressTransfer(selected)}>
                Receive Selected Quantities
              </Button>
            )}
          </div>
        </aside>
      )}
    </div>
  );
}

function WorklistProvider({ children }: { children: React.ReactNode }) {
  return <div className="space-y-4">{children}</div>;
}
