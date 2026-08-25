'use client';

import React, { useEffect, useState } from 'react';
import type { ApiEnvelope } from '@maevelle/contracts';
import { Worklist, WorklistToolbar } from '@/components/ui/worklist';
const request = async (url: string, opts?: any) => fetch(url, opts).then(r => r.json());
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RotateCcw, AlertTriangle, CheckCircle2, XCircle, ArrowRightLeft, DollarSign } from 'lucide-react';
const toast = { success: console.log, error: console.error, promise: console.log, info: console.log };

type ReturnCase = {
  id: string;
  return_number: string;
  case_type: string;
  case_status: string;
  authorization_status: string;
  receipt_status: string;
  version: string;
  created_at: string;
  reason?: string;
  age_days?: number;
};

type ReturnDetail = ReturnCase & {
  lines: readonly {
    id: string;
    sku: string;
    product_title: string;
    requested_quantity: string;
    authorized_quantity: string;
    received_quantity: string;
  }[];
  receipts: readonly { id: string; receipt_number: string; status: string; posted_at: string }[];
  refunds: readonly { id: string; refund_id: string; created_at: string }[];
  cogsRecovery: { total_cost: string; currency_code: string } | undefined;
};

export function ReturnsConsole({ rto = false }: { rto?: boolean }) {
  const [cases, setCases] = useState<readonly ReturnCase[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selected, setSelected] = useState<ReturnDetail | null>(null);

  const [receiveQuantities, setReceiveQuantities] = useState<Record<string, string>>({});
  const [receiveConditions, setReceiveConditions] = useState<Record<string, string>>({});
  const [receiveLocationId, setReceiveLocationId] = useState<string>('');

  const [locations, setLocations] = useState<any[]>([]);
  const [applyRestockingFee, setApplyRestockingFee] = useState(false);

  const reload = async () => {
    try {
      setCases((await request<ApiEnvelope<readonly ReturnCase[]>>('/api/admin/returns')).data);
      const locRes = await request<ApiEnvelope<any[]>>('/api/admin/warehouse/locations');
      setLocations(locRes.data.filter(l => l.capabilities.includes('STOCK_HOLDING')));
    } catch {
      toast.error('Unable to load reverse logistics.');
    }
  };

  useEffect(() => {
    void reload();
  }, []);

  const open = async (id: string) => {
    try {
      const data = (await request<ApiEnvelope<ReturnDetail>>(`/api/admin/returns/${id}`)).data;
      setSelected(data);
      
      const initQties: Record<string, string> = {};
      const initConds: Record<string, string> = {};
      data.lines.forEach(line => {
        initQties[line.id] = String(Number(line.authorized_quantity) - Number(line.received_quantity));
        initConds[line.id] = 'SELLABLE';
      });
      setReceiveQuantities(initQties);
      setReceiveConditions(initConds);
    } catch {
      toast.error('Unable to open this reverse logistics case.');
    }
  };

  useEffect(() => {
    if (selectedId) void open(selectedId);
    else setSelected(null);
  }, [selectedId]);

  const authorizeReturn = async (returnCase: ReturnCase) => {
    try {
      await request(`/api/admin/returns/${returnCase.id}/authorize`, {
        method: 'POST',
        body: JSON.stringify({
          expectedVersion: Number(returnCase.version),
          idempotencyKey: crypto.randomUUID(),
        }),
      });
      toast.success('Return authorized.');
      await reload();
      if (selectedId === returnCase.id) await open(returnCase.id);
    } catch {
      toast.error('Authorization was rejected. Reload before retrying.');
    }
  };

  const receiveReturn = async () => {
    if (!selected) return;
    if (!receiveLocationId) {
      toast.error('Select a receiving location first.');
      return;
    }
    
    const linesToReceive = selected.lines
      .map(line => ({
        returnLineId: line.id,
        quantity: receiveQuantities[line.id] || '0',
        condition: receiveConditions[line.id] || 'SELLABLE'
      }))
      .filter(line => Number(line.quantity) > 0);

    if (linesToReceive.length === 0) {
      toast.error('Specify quantities to receive.');
      return;
    }

    try {
      await request(`/api/admin/returns/${selected.id}/receive`, {
        method: 'POST',
        headers: { 'idempotency-key': crypto.randomUUID() },
        body: JSON.stringify({
          locationId: receiveLocationId,
          lines: linesToReceive
        }),
      });
      toast.success('Return items received into stock.');
      await reload();
      await open(selected.id);
    } catch (e: any) {
      toast.error('Failed to process receipt: ' + e.message);
    }
  };

  const processRefund = async () => {
    if (!selected) return;
    try {
      await request(`/api/admin/returns/${selected.id}/refunds`, {
        method: 'POST',
        headers: { 'idempotency-key': crypto.randomUUID() },
        body: JSON.stringify({ applyRestockingFee }),
      });
      toast.success(applyRestockingFee ? 'Refund processed less restocking fee.' : 'Full refund processed.');
      await reload();
      await open(selected.id);
    } catch (e: any) {
      toast.error('Failed to process refund: ' + e.message);
    }
  };

  const filteredCases = cases.filter((x) => (rto ? x.case_type === 'RTO' : x.case_type === 'CUSTOMER_RETURN'));

  return (
    <main className="flex h-[calc(100vh-4rem)]">
      <div className={`flex-1 flex flex-col min-w-0 transition-all ${selectedId ? 'mr-[500px]' : ''}`}>
        <div className="p-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight mb-2">{rto ? 'Return to Origin (RTO)' : 'Customer Returns'}</h1>
            <p className="text-muted-foreground mb-6">
              Commercial return intent, physical reverse receipt, refund, and cost recovery.
            </p>
          </div>
          
          <WorklistProvider>
            <WorklistToolbar>
              <WorklistSearch placeholder="Search return number..." />
              <WorklistFilters options={['OPEN', 'CLOSED', 'PENDING', 'AUTHORIZED', 'REJECTED']} />
            </WorklistToolbar>
            
            <div className="mt-4 rounded-md border bg-card">
              <table className="w-full text-sm text-left">
                <thead className="text-xs uppercase bg-muted/50 border-b">
                  <tr>
                    <th className="px-6 py-3 font-medium">Return #</th>
                    <th className="px-6 py-3 font-medium">Reason</th>
                    <th className="px-6 py-3 font-medium">Status</th>
                    <th className="px-6 py-3 font-medium">Authorization</th>
                    <th className="px-6 py-3 font-medium">Receipt</th>
                    <th className="px-6 py-3 font-medium text-right">Age</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredCases.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-6 py-8 text-center text-muted-foreground">
                        No {rto ? 'RTO' : 'returns'} found.
                      </td>
                    </tr>
                  ) : (
                    filteredCases.map((c) => (
                      <tr 
                        key={c.id} 
                        className={`cursor-pointer transition-colors hover:bg-muted/50 ${selectedId === c.id ? 'bg-muted/50' : ''}`}
                        onClick={() => setSelectedId(c.id)}
                      >
                        <td className="px-6 py-4 font-medium">{c.return_number}</td>
                        <td className="px-6 py-4 text-muted-foreground">{c.reason || (rto ? 'Delivery Failure' : 'No Reason')}</td>
                        <td className="px-6 py-4">
                          <Badge variant={c.case_status === 'CLOSED' ? 'secondary' : 'default'}>{c.case_status}</Badge>
                        </td>
                        <td className="px-6 py-4">
                          <Badge variant={c.authorization_status === 'AUTHORIZED' ? 'success' : c.authorization_status === 'REJECTED' ? 'destructive' : 'warning' as any}>
                            {c.authorization_status}
                          </Badge>
                        </td>
                        <td className="px-6 py-4">
                          <Badge variant={c.receipt_status === 'COMPLETED' ? 'success' : c.receipt_status === 'PARTIAL' ? 'warning' : 'secondary' as any}>
                            {c.receipt_status}
                          </Badge>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <span className={c.age_days && c.age_days > 14 ? 'text-destructive font-bold' : 'text-muted-foreground'}>
                            {c.age_days ? `${c.age_days}d` : new Date(c.created_at).toLocaleDateString()}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </WorklistProvider>
        </div>
      </div>

      {selected && (
        <aside className="fixed top-16 right-0 w-[500px] h-[calc(100vh-4rem)] bg-card border-l flex flex-col shadow-xl z-20 animate-in slide-in-from-right overflow-y-auto">
          <div className="p-6 border-b flex items-start justify-between bg-card sticky top-0 z-10">
            <div>
              <h3 className="font-semibold text-xl">{selected.return_number}</h3>
              <div className="flex gap-2 mt-2">
                <Badge variant="outline">{selected.case_status}</Badge>
                {!rto && <Badge variant={selected.authorization_status === 'AUTHORIZED' ? 'success' : 'secondary' as any}>{selected.authorization_status}</Badge>}
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={() => setSelectedId(null)}>
              <XCircle className="h-5 w-5" />
            </Button>
          </div>

          <div className="p-6 space-y-8 flex-1">
            {!rto && selected.authorization_status === 'PENDING' && (
              <div className="bg-warning/10 p-4 rounded-lg border border-warning/20">
                <h4 className="font-medium text-warning flex items-center gap-2 mb-2">
                  <AlertTriangle className="h-4 w-4" /> Authorization Required
                </h4>
                <p className="text-sm text-muted-foreground mb-4">
                  Review the return request before allowing physical items to be sent back.
                </p>
                <Button className="w-full bg-warning text-warning-foreground hover:bg-warning/90" onClick={() => authorizeReturn(selected)}>
                  Authorize Return
                </Button>
              </div>
            )}

            <div className="space-y-4">
              <h4 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Items</h4>
              <div className="space-y-3">
                {selected.lines.map(line => (
                  <div key={line.id} className="border rounded-md p-4 bg-muted/20">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <p className="font-medium text-sm">{line.product_title}</p>
                        <p className="text-xs font-mono text-muted-foreground">{line.sku}</p>
                      </div>
                      <div className="text-right text-sm">
                        <p>Auth: <strong>{line.authorized_quantity}</strong></p>
                        <p className="text-success">Rcv: <strong>{line.received_quantity}</strong></p>
                      </div>
                    </div>
                    
                    {(!rto && selected.authorization_status === 'AUTHORIZED' && selected.case_status !== 'CLOSED' && Number(line.authorized_quantity) > Number(line.received_quantity)) && (
                      <div className="pt-3 border-t flex gap-2 items-end">
                        <div className="flex-1 space-y-1">
                          <label className="text-xs">Receive Qty</label>
                          <Input 
                            type="number" 
                            min="0" 
                            max={Number(line.authorized_quantity) - Number(line.received_quantity)}
                            value={receiveQuantities[line.id] || ''}
                            onChange={e => setReceiveQuantities({...receiveQuantities, [line.id]: e.target.value})}
                          />
                        </div>
                        <div className="flex-[2] space-y-1">
                          <label className="text-xs">Condition</label>
                          <Select value={receiveConditions[line.id]} onValueChange={v => setReceiveConditions({...receiveConditions, [line.id]: v})}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="SELLABLE">Sellable</SelectItem>
                              <SelectItem value="DAMAGED">Damaged</SelectItem>
                              <SelectItem value="QUARANTINE">Quarantine</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {((!rto && selected.authorization_status === 'AUTHORIZED') || rto) && selected.case_status !== 'CLOSED' && selected.receipt_status !== 'COMPLETED' && (
              <div className="space-y-4 bg-primary/5 p-4 rounded-lg border border-primary/20">
                <h4 className="text-sm font-semibold flex items-center gap-2">
                  <ArrowRightLeft className="w-4 h-4" /> {rto ? 'Unconditional RTO Receipt' : 'Physical Receipt'}
                </h4>
                {rto && (
                  <p className="text-xs text-muted-foreground">
                    RTO items were never opened by the customer. Receiving places them directly back into Sellable stock.
                  </p>
                )}
                <div className="space-y-2">
                  <label className="text-xs font-medium">Destination Location</label>
                  <Select value={receiveLocationId} onValueChange={setReceiveLocationId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select warehouse..." />
                    </SelectTrigger>
                    <SelectContent>
                      {locations.map(loc => (
                        <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button className="w-full" onClick={receiveReturn}>
                  {rto ? 'Receive RTO to Inventory' : 'Receive Selected Quantities'}
                </Button>
              </div>
            )}

            {!rto && selected.refunds.length === 0 && selected.receipt_status !== 'PENDING' && selected.case_status !== 'CLOSED' && (
              <div className="space-y-4 border p-4 rounded-lg bg-muted/10">
                <h4 className="text-sm font-semibold flex items-center gap-2">
                  <DollarSign className="w-4 h-4" /> Refund Authorization
                </h4>
                <div className="flex items-center gap-2 py-2">
                  <input type="checkbox" id="restockingFee" checked={applyRestockingFee} onChange={e => setApplyRestockingFee(e.target.checked)} />
                  <label htmlFor="restockingFee" className="text-sm font-medium">Apply Restocking Fee (deduct from refund)</label>
                </div>
                <Button variant="default" className="w-full" onClick={processRefund}>
                  Authorize Refund
                </Button>
              </div>
            )}

            {selected.receipts.length > 0 && (
              <div className="space-y-4">
                <h4 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Receipts</h4>
                <div className="space-y-2">
                  {selected.receipts.map(r => (
                    <div key={r.id} className="flex justify-between text-sm p-2 border rounded">
                      <span>{r.receipt_number}</span>
                      <span className="text-muted-foreground">{new Date(r.posted_at).toLocaleDateString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {selected.refunds.length > 0 && (
              <div className="space-y-4">
                <h4 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Refunds</h4>
                <div className="space-y-2">
                  {selected.refunds.map(r => (
                    <div key={r.id} className="flex justify-between text-sm p-2 border rounded bg-success/10 text-success">
                      <span>Refund Processed</span>
                      <span>{new Date(r.created_at).toLocaleDateString()}</span>
                    </div>
                  ))}
                </div>
              </div>
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
