'use client';

import React, { useState } from 'react';
import { Worklist, WorklistToolbar } from '@/components/ui/worklist';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { XCircle, ShoppingCart, Plus, CheckCircle2, ArrowRight } from 'lucide-react';
const request = async (url: string, opts?: any) => fetch(url, opts).then(r => r.json());
const toast = { success: console.log, error: console.error, promise: console.log, info: console.log };

interface Purchase {
  id: string;
  purchaseNumber: string;
  supplierName: string;
  currencyCode: string;
  status: string;
  version: number;
  lines: readonly { id: string; sku: string; quantity: string; unitPrice: string }[];
}

export function PurchaseWorklist({ purchases, reload }: { purchases: readonly Purchase[], reload: () => Promise<void> }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  
  const [supplierId, setSupplierId] = useState('');
  const [currencyCode, setCurrencyCode] = useState('BDT');

  const [newLineVariantId, setNewLineVariantId] = useState('');
  const [newLineQty, setNewLineQty] = useState('1');
  const [newLinePrice, setNewLinePrice] = useState('0');

  const selected = purchases.find(p => p.id === selectedId);

  const handleCreateDraft = async () => {
    if (!supplierId) { toast.error('Supplier ID is required'); return; }
    try {
      await request('/api/admin/purchases', {
        method: 'POST',
        body: JSON.stringify({ supplierId, currencyCode }),
      });
      toast.success('Draft Purchase created.');
      setIsCreating(false);
      setSupplierId('');
      await reload();
    } catch {
      toast.error('Draft Purchase could not be created.');
    }
  };

  const addLine = async () => {
    if (!selected) return;
    if (!newLineVariantId || !newLineQty || !newLinePrice) { toast.error('Fill in all line details'); return; }
    try {
      await request(`/api/admin/purchases/${selected.id}/lines`, {
        method: 'POST',
        body: JSON.stringify({
          variantId: newLineVariantId,
          quantity: newLineQty,
          unitPrice: newLinePrice,
        }),
      });
      toast.success('Purchase line added.');
      setNewLineVariantId('');
      setNewLineQty('1');
      setNewLinePrice('0');
      await reload();
    } catch {
      toast.error('Failed to add line.');
    }
  };

  const placePurchase = async () => {
    if (!selected) return;
    try {
      await request(`/api/admin/purchases/${selected.id}/place`, {
        method: 'POST',
        body: JSON.stringify({ version: selected.version }),
      });
      toast.success('Purchase placed.');
      await reload();
    } catch {
      toast.error('Could not place purchase. Ensure it has lines.');
    }
  };

  const getStatusColor = (status: string) => {
    if (status === 'DRAFT') return 'secondary';
    if (status === 'PLACED') return 'default';
    if (status === 'PARTIALLY_RECEIVED') return 'warning';
    if (status === 'RECEIVED') return 'success';
    return 'outline';
  };

  return (
    <div className="flex h-full min-h-[600px]">
      <div className={`flex-1 flex flex-col min-w-0 transition-all ${selectedId || isCreating ? 'mr-[500px]' : ''}`}>
        <WorklistProvider>
          <div className="flex items-center justify-between mb-4">
            <WorklistToolbar>
              <WorklistSearch placeholder="Search PO number or supplier..." />
              <WorklistFilters options={['DRAFT', 'PLACED', 'PARTIALLY_RECEIVED', 'RECEIVED']} />
            </WorklistToolbar>
            <Button onClick={() => { setIsCreating(true); setSelectedId(null); }}>
              <Plus className="w-4 h-4 mr-2" /> New Purchase Order
            </Button>
          </div>

          <div className="rounded-md border bg-card">
            <table className="w-full text-sm text-left">
              <thead className="text-xs uppercase bg-muted/50 border-b">
                <tr>
                  <th className="px-6 py-3 font-medium">PO Number</th>
                  <th className="px-6 py-3 font-medium">Supplier</th>
                  <th className="px-6 py-3 font-medium">Status</th>
                  <th className="px-6 py-3 font-medium text-right">Lines</th>
                  <th className="px-6 py-3 font-medium text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {purchases.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-muted-foreground">
                      No purchases found.
                    </td>
                  </tr>
                ) : (
                  purchases.map((p) => {
                    const total = p.lines.reduce((acc, l) => acc + (Number(l.quantity) * Number(l.unitPrice)), 0);
                    return (
                      <tr 
                        key={p.id} 
                        className={`cursor-pointer transition-colors hover:bg-muted/50 ${selectedId === p.id ? 'bg-muted/50' : ''}`}
                        onClick={() => { setSelectedId(p.id); setIsCreating(false); }}
                      >
                        <td className="px-6 py-4 font-medium">{p.purchaseNumber}</td>
                        <td className="px-6 py-4">{p.supplierName}</td>
                        <td className="px-6 py-4">
                          <Badge variant={getStatusColor(p.status) as any}>{p.status}</Badge>
                        </td>
                        <td className="px-6 py-4 text-right">{p.lines.length}</td>
                        <td className="px-6 py-4 text-right font-mono text-xs">
                          {total.toFixed(2)} {p.currencyCode}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </WorklistProvider>
      </div>

      {isCreating && (
        <aside className="fixed top-16 right-0 w-[500px] h-[calc(100vh-4rem)] bg-card border-l flex flex-col shadow-xl z-20 animate-in slide-in-from-right overflow-y-auto">
          <div className="p-6 border-b flex items-start justify-between bg-card sticky top-0 z-10">
            <div>
              <h3 className="font-semibold text-xl">Draft Purchase Order</h3>
              <p className="text-sm text-muted-foreground mt-1">Start a PO, then add lines.</p>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setIsCreating(false)}>
              <XCircle className="h-5 w-5" />
            </Button>
          </div>
          <div className="p-6 space-y-4 flex-1">
            <div className="space-y-2">
              <label className="text-sm font-medium">Supplier ID</label>
              <Input placeholder="Enter Supplier ID" value={supplierId} onChange={e => setSupplierId(e.target.value)} />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Currency</label>
              <Select value={currencyCode} onValueChange={setCurrencyCode}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="BDT">BDT</SelectItem>
                  <SelectItem value="CNY">CNY</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="p-4 border-t bg-muted/10">
            <Button className="w-full" onClick={handleCreateDraft}>Create Draft PO</Button>
          </div>
        </aside>
      )}

      {selected && !isCreating && (
        <aside className="fixed top-16 right-0 w-[500px] h-[calc(100vh-4rem)] bg-card border-l flex flex-col shadow-xl z-20 animate-in slide-in-from-right overflow-y-auto">
          <div className="p-6 border-b flex items-start justify-between bg-card sticky top-0 z-10">
            <div>
              <h3 className="font-semibold text-xl">{selected.purchaseNumber}</h3>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-sm text-muted-foreground">{selected.supplierName}</span>
                <Badge variant={getStatusColor(selected.status) as any}>{selected.status}</Badge>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setSelectedId(null)}>
              <XCircle className="h-5 w-5" />
            </Button>
          </div>

          <div className="p-6 space-y-6 flex-1">
            
            <div className="space-y-4">
              <h4 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground border-b pb-2">Purchase Lines</h4>
              
              <div className="space-y-3">
                {selected.lines.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4 bg-muted/20 rounded-md">No lines added yet.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-muted-foreground border-b">
                        <th className="text-left font-medium pb-2">SKU</th>
                        <th className="text-right font-medium pb-2">Qty</th>
                        <th className="text-right font-medium pb-2">Unit</th>
                        <th className="text-right font-medium pb-2">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {selected.lines.map(line => {
                        const lineTotal = Number(line.quantity) * Number(line.unitPrice);
                        return (
                          <tr key={line.id}>
                            <td className="py-3 font-mono text-xs">{line.sku}</td>
                            <td className="py-3 text-right">{line.quantity}</td>
                            <td className="py-3 text-right">{line.unitPrice}</td>
                            <td className="py-3 text-right font-medium">{lineTotal.toFixed(2)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t font-semibold">
                        <td colSpan={3} className="py-3 text-right">Total ({selected.currencyCode}):</td>
                        <td className="py-3 text-right">
                          {selected.lines.reduce((acc, l) => acc + (Number(l.quantity) * Number(l.unitPrice)), 0).toFixed(2)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                )}
              </div>
            </div>

            {selected.status === 'DRAFT' && (
              <div className="bg-muted/30 p-4 rounded-lg border border-dashed space-y-4">
                <h5 className="font-medium text-sm flex items-center gap-2">
                  <ShoppingCart className="w-4 h-4" /> Add Item
                </h5>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2 space-y-1">
                    <label className="text-xs text-muted-foreground">Catalog Variant ID</label>
                    <Input placeholder="e.g. VAR-123" value={newLineVariantId} onChange={e => setNewLineVariantId(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Quantity</label>
                    <Input type="number" min="1" value={newLineQty} onChange={e => setNewLineQty(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Unit Price</label>
                    <Input type="number" min="0" step="0.01" value={newLinePrice} onChange={e => setNewLinePrice(e.target.value)} />
                  </div>
                </div>
                <Button variant="secondary" className="w-full" onClick={addLine}>Add Line</Button>
              </div>
            )}

            {selected.status !== 'DRAFT' && (
              <div className="bg-muted/10 p-4 rounded-lg border text-sm space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Shipments</span>
                  <span className="font-medium text-primary cursor-pointer hover:underline">View Allocations <ArrowRight className="inline w-3 h-3" /></span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Receipts</span>
                  <span className="font-medium text-primary cursor-pointer hover:underline">View Receipts <ArrowRight className="inline w-3 h-3" /></span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Landed Cost</span>
                  <span className="font-medium text-muted-foreground">Pending receipts</span>
                </div>
              </div>
            )}
            
          </div>

          <div className="p-4 border-t bg-muted/10 sticky bottom-0">
            {selected.status === 'DRAFT' ? (
              <Button className="w-full" onClick={placePurchase} disabled={selected.lines.length === 0}>
                Place Purchase Order
              </Button>
            ) : selected.status === 'PLACED' ? (
              <Button className="w-full" variant="outline" onClick={() => toast.info('Navigate to Shipments to plan arrival.')}>
                Plan Shipment
              </Button>
            ) : (
              <Button className="w-full" variant="secondary" disabled>
                <CheckCircle2 className="w-4 h-4 mr-2" /> Placed & In Progress
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
