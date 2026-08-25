'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
const request = async (url: string, opts?: any) => fetch(url, opts).then(r => r.json());
const toast = { success: console.log, error: console.error, promise: console.log, info: console.log };
import { Calculator, CheckCircle2, Lock, FileSpreadsheet, Anchor, Plus } from 'lucide-react';

export function LandedCostWorkspace({ worksheets, shipments, reload }: { worksheets: any[], shipments: any[], reload: () => Promise<void> }) {
  const [selectedId, setSelectedId] = useState<string | null>(worksheets[0]?.id || null);
  const [isCreating, setIsCreating] = useState(false);
  const [newShipmentId, setNewShipmentId] = useState('');
  const [newCurrency, setNewCurrency] = useState('BDT');

  const [preview, setPreview] = useState<any>(null);
  
  // Component draft
  const [costType, setCostType] = useState('FREIGHT');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('BDT');
  const [method, setMethod] = useState('QUANTITY');

  const selected = worksheets.find(w => w.id === selectedId);
  const shipment = shipments.find(s => s.id === selected?.shipment_id);

  const createWorksheet = async () => {
    if (!newShipmentId) return;
    try {
      const res = await request<any>('/api/admin/landed-cost/worksheets', {
        method: 'POST',
        body: JSON.stringify({ shipmentId: newShipmentId, baseCurrencyCode: newCurrency }),
      });
      toast.success('Worksheet created');
      setIsCreating(false);
      await reload();
      setSelectedId(res.data.id);
    } catch {
      toast.error('Could not create worksheet. One might already exist.');
    }
  };

  const addComponent = async () => {
    if (!selected) return;
    if (!amount) return toast.error('Enter amount');
    try {
      await request(`/api/admin/landed-cost/worksheets/${selected.id}/revisions/${selected.current_revision_id}/components`, {
        method: 'POST',
        body: JSON.stringify({
          costType,
          amount,
          currencyCode: currency,
          allocationMethod: method,
        }),
      });
      toast.success('Cost component added');
      setAmount('');
      await reload();
      setPreview(null);
    } catch {
      toast.error('Failed to add component');
    }
  };

  const fetchPreview = async () => {
    if (!selected) return;
    try {
      const res = await request<any>(`/api/admin/landed-cost/worksheets/${selected.id}/revisions/${selected.current_revision_id}/preview`);
      setPreview(res.data);
      toast.success('Preview generated');
    } catch {
      toast.error('Could not generate preview');
    }
  };

  const finalize = async () => {
    if (!selected) return;
    try {
      await request(`/api/admin/landed-cost/worksheets/${selected.id}/revisions/${selected.current_revision_id}/finalize`, {
        method: 'POST',
        headers: { 'idempotency-key': crypto.randomUUID() },
      });
      toast.success('Worksheet finalized. Costs allocated to inventory.');
      await reload();
      setPreview(null);
    } catch {
      toast.error('Failed to finalize worksheet');
    }
  };

  const getMethodLabel = (val: string) => {
    const map: Record<string, string> = {
      EQUAL: 'Equal',
      QUANTITY: 'Quantity',
      PURCHASE_VALUE: 'Purchase Value',
      WEIGHT: 'Weight',
      VOLUME: 'Volume',
      CHARGEABLE_WEIGHT: 'Chargeable Weight',
      PERCENTAGE: 'Percentage',
      MANUAL: 'Manual',
      DIRECT: 'Direct'
    };
    return map[val] || val;
  };

  return (
    <div className="flex gap-6 h-full min-h-[600px]">
      <div className="w-[300px] flex-shrink-0 flex flex-col gap-4">
        <Button onClick={() => setIsCreating(true)} variant="outline" className="w-full justify-start">
          <Plus className="w-4 h-4 mr-2" /> New Worksheet
        </Button>
        <div className="flex-1 overflow-y-auto rounded-md border bg-card divide-y">
          {worksheets.map(w => (
            <div 
              key={w.id} 
              className={`p-3 cursor-pointer hover:bg-muted/50 transition-colors ${selectedId === w.id ? 'bg-muted border-l-2 border-l-primary' : 'border-l-2 border-l-transparent'}`}
              onClick={() => { setSelectedId(w.id); setIsCreating(false); setPreview(null); }}
            >
              <div className="flex justify-between items-start mb-1">
                <span className="font-medium text-sm">{w.worksheet_number}</span>
                <Badge variant={w.status === 'DRAFT' ? 'secondary' : 'default'} className="text-[10px]">{w.status}</Badge>
              </div>
              <div className="text-xs text-muted-foreground flex items-center gap-1">
                <Anchor className="w-3 h-3" /> Shipment: {shipments.find(s => s.id === w.shipment_id)?.shipmentNumber || 'Unknown'}
              </div>
            </div>
          ))}
          {worksheets.length === 0 && (
            <div className="p-4 text-center text-sm text-muted-foreground">No worksheets found.</div>
          )}
        </div>
      </div>

      <div className="flex-1 flex flex-col gap-4">
        {isCreating ? (
          <Card className="animate-in fade-in slide-in-from-right-4">
            <CardHeader>
              <CardTitle>Create Landed Cost Worksheet</CardTitle>
              <CardDescription>Allocate freight, duties, and insurance to an inbound shipment.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 max-w-md">
              <div className="space-y-2">
                <label className="text-sm font-medium">Shipment</label>
                <Select value={newShipmentId} onValueChange={setNewShipmentId}>
                  <SelectTrigger><SelectValue placeholder="Select shipment" /></SelectTrigger>
                  <SelectContent>
                    {shipments.map(s => <SelectItem key={s.id} value={s.id}>{s.shipmentNumber}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Base Currency</label>
                <Select value={newCurrency} onValueChange={setNewCurrency}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BDT">BDT</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={createWorksheet} className="w-full">Create</Button>
            </CardContent>
          </Card>
        ) : selected ? (
          <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-right-4">
            <div className="flex gap-4">
              <Card className="flex-1 bg-card border">
                <CardHeader className="pb-3 border-b bg-muted/20">
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="text-xl flex items-center gap-2">
                        <FileSpreadsheet className="w-5 h-5 text-primary" /> {selected.worksheet_number}
                      </CardTitle>
                      <CardDescription className="mt-1 flex items-center gap-2">
                        <span>Shipment: {shipment?.shipmentNumber}</span>
                        <span>•</span>
                        <span>Base: {selected.base_currency_code}</span>
                      </CardDescription>
                    </div>
                    {selected.status === 'FINALIZED' ? (
                      <Badge variant="default" className="bg-success"><Lock className="w-3 h-3 mr-1" /> Finalized</Badge>
                    ) : (
                      <Badge variant="secondary">Draft</Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader className="bg-muted/50">
                      <TableRow>
                        <TableHead>Cost Type</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead>Method</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selected.components.map(c => (
                        <TableRow key={c.id}>
                          <TableCell className="font-medium text-sm">{c.cost_type}</TableCell>
                          <TableCell className="text-right font-mono text-sm">{c.original_amount} {c.original_currency_code}</TableCell>
                          <TableCell className="text-sm">{getMethodLabel(c.allocation_method)}</TableCell>
                          <TableCell><Badge variant="outline" className="text-[10px]">{c.value_status}</Badge></TableCell>
                        </TableRow>
                      ))}
                      {selected.components.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center py-6 text-muted-foreground text-sm">No cost components added.</TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              {selected.status === 'DRAFT' && (
                <Card className="w-[300px] flex-shrink-0 bg-muted/10 border-dashed">
                  <CardHeader className="pb-4">
                    <CardTitle className="text-sm">Add Cost Component</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">Type</label>
                      <Select value={costType} onValueChange={setCostType}>
                        <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="FREIGHT">Freight</SelectItem>
                          <SelectItem value="DUTY">Duty / Customs</SelectItem>
                          <SelectItem value="INSURANCE">Insurance</SelectItem>
                          <SelectItem value="HANDLING">Handling</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex gap-2">
                      <div className="space-y-1 flex-1">
                        <label className="text-xs font-medium text-muted-foreground">Amount</label>
                        <Input type="number" className="h-8" value={amount} onChange={e => setAmount(e.target.value)} />
                      </div>
                      <div className="space-y-1 w-20">
                        <label className="text-xs font-medium text-muted-foreground">Cur</label>
                        <Select value={currency} onValueChange={setCurrency}>
                          <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="BDT">BDT</SelectItem>
                            <SelectItem value="USD">USD</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">Allocation Method</label>
                      <Select value={method} onValueChange={setMethod}>
                        <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="QUANTITY">Quantity</SelectItem>
                          <SelectItem value="PURCHASE_VALUE">Purchase Value</SelectItem>
                          <SelectItem value="EQUAL">Equal</SelectItem>
                          <SelectItem value="WEIGHT">Weight</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <Button size="sm" className="w-full mt-2" onClick={addComponent}>Add Component</Button>
                  </CardContent>
                </Card>
              )}
            </div>

            {selected.status === 'DRAFT' && selected.components.length > 0 && !preview && (
              <div className="flex justify-center p-6 border rounded-md border-dashed bg-card mt-2">
                <Button onClick={fetchPreview} variant="secondary">
                  <Calculator className="w-4 h-4 mr-2" /> Calculate Allocations
                </Button>
              </div>
            )}

            {preview && selected.status === 'DRAFT' && (
              <Card className="border-primary/20 shadow-md">
                <CardHeader className="bg-primary/5 border-b pb-4 flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="text-primary flex items-center gap-2">
                      <CheckCircle2 className="w-5 h-5" /> Cost Allocation Preview
                    </CardTitle>
                    <CardDescription className="mt-1">Review the resulting unit costs before finalizing.</CardDescription>
                  </div>
                  <Button onClick={finalize} className="bg-primary text-primary-foreground shadow-lg">
                    <Lock className="w-4 h-4 mr-2" /> Finalize & Post to Ledger
                  </Button>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow className="text-xs bg-muted/10">
                        <TableHead>SKU</TableHead>
                        <TableHead className="text-right">Purchase Unit Cost</TableHead>
                        <TableHead className="text-right">Landed Addition</TableHead>
                        <TableHead className="text-right text-primary font-bold">Final Unit Cost</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {/* Mapping preview logic based on server response */}
                      {selected.results?.map((res: any) => (
                        <TableRow key={res.sku}>
                          <TableCell className="font-mono text-xs">{res.sku}</TableCell>
                          <TableCell className="text-right font-mono text-xs">{res.purchase_cost} {res.currency_code}</TableCell>
                          <TableCell className="text-right font-mono text-xs text-muted-foreground">+{res.additional_cost} {res.currency_code}</TableCell>
                          <TableCell className="text-right font-mono text-sm font-bold text-primary">{res.unit_acquisition_cost} {res.currency_code}</TableCell>
                        </TableRow>
                      ))}
                      {(!selected.results || selected.results.length === 0) && (
                        <TableRow>
                          <TableCell colSpan={4} className="text-center py-6 text-muted-foreground text-sm">Preview generated. See server details.</TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}

            {selected.status === 'FINALIZED' && (
              <Card className="border-success/20">
                <CardHeader className="bg-success/5 border-b pb-3">
                  <CardTitle className="text-sm flex items-center gap-2 text-success">
                    <CheckCircle2 className="w-4 h-4" /> Final Results
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow className="text-xs bg-muted/10">
                        <TableHead>SKU</TableHead>
                        <TableHead className="text-right">Final Unit Cost ({selected.base_currency_code})</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selected.results.map((res: any) => (
                        <TableRow key={res.sku}>
                          <TableCell className="font-mono text-xs">{res.sku}</TableCell>
                          <TableCell className="text-right font-mono text-sm font-bold">{res.unit_acquisition_cost}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
