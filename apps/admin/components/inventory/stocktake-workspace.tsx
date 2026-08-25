'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CheckCircle2, AlertTriangle, PackageMinus, PackagePlus, ArrowRight, Play, ArrowRightLeft } from 'lucide-react';
const toast = { success: console.log, error: console.error, promise: console.log, info: console.log };
const request = async (url: string, opts?: any) => fetch(url, opts).then(r => r.json());
import type { ApiEnvelope } from '@maevelle/contracts';

type StocktakeWorkspaceData = {
  id: string;
  status: string;
  version: number;
  lines: readonly {
    inventoryItemId: string;
    expectedQuantity: string;
    countedQuantity: string | null;
  }[];
};

export function StocktakeWorkspace({ locations }: { locations: any[] }) {
  const [step, setStep] = useState<'create' | 'count' | 'review'>('create');
  
  const [locationId, setLocationId] = useState('');
  const [stocktakeId, setStocktakeId] = useState('');
  const [workspace, setWorkspace] = useState<StocktakeWorkspaceData | null>(null);

  // Active counting state
  const [countItemId, setCountItemId] = useState('');
  const [countQuantity, setCountQuantity] = useState('');

  const beginStocktake = async () => {
    if (!locationId) { toast.error('Select a location.'); return; }
    try {
      const result = await request<ApiEnvelope<{ stocktakeId: string }>>('/api/admin/inventory/stocktakes', {
        method: 'POST',
        body: JSON.stringify({ locationId }),
      });
      setStocktakeId(result.data.stocktakeId);
      await loadStocktake(result.data.stocktakeId);
      toast.success(`Stocktake started for location.`);
      setStep('count');
    } catch {
      toast.error('Stocktake could not be started.');
    }
  };

  const loadStocktake = async (id: string = stocktakeId) => {
    const ws = await request<ApiEnvelope<StocktakeWorkspaceData>>(`/api/admin/inventory/stocktakes/${id}`);
    setWorkspace(ws.data);
    return ws.data;
  };

  const submitCount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!workspace) return;
    try {
      if (!workspace.lines.some((line) => line.inventoryItemId === countItemId))
        throw new Error('Unknown stocktake line.');

      await request(`/api/admin/inventory/stocktakes/${stocktakeId}/lines/${countItemId}/count`, {
        method: 'POST',
        body: JSON.stringify({
          countedQuantity: countQuantity,
          version: workspace.version,
        }),
      });
      
      setCountItemId('');
      setCountQuantity('');
      await loadStocktake();
      toast.success('Count saved.');
    } catch {
      toast.error('Count could not be saved. Verify the Item ID.');
    }
  };

  const postStocktake = async () => {
    if (!stocktakeId) return;
    try {
      await request(`/api/admin/inventory/stocktakes/${stocktakeId}/post`, {
        method: 'POST',
        headers: { 'idempotency-key': crypto.randomUUID() },
      });
      toast.success('Stocktake posted. Adjustments recorded in immutable ledger.');
      await loadStocktake();
      setStep('create'); // Reset
      setStocktakeId('');
      setWorkspace(null);
    } catch {
      toast.error('Stocktake could not be posted. Every snapshot line must be counted first.');
    }
  };

  const handleResume = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stocktakeId) return;
    try {
      await loadStocktake(stocktakeId);
      setStep('count');
    } catch {
      toast.error('Could not resume. Check the Stocktake ID.');
    }
  };

  const allCounted = workspace?.lines.every(l => l.countedQuantity !== null) ?? false;

  return (
    <Card className="w-full max-w-4xl mx-auto">
      <CardHeader>
        <CardTitle>Stocktake Workflow</CardTitle>
        <CardDescription>
          Snapshot stock, record physical counts, and post immutable variance adjustments.
        </CardDescription>
        
        <div className="flex gap-2 items-center mt-6 border-b pb-4">
          <div className={`text-sm font-medium px-3 py-1.5 rounded-full transition-colors ${step === 'create' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
            1. Create & Scope
          </div>
          <ArrowRight className="w-4 h-4 text-muted-foreground" />
          <div className={`text-sm font-medium px-3 py-1.5 rounded-full transition-colors ${step === 'count' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
            2. Count Inventory
          </div>
          <ArrowRight className="w-4 h-4 text-muted-foreground" />
          <div className={`text-sm font-medium px-3 py-1.5 rounded-full transition-colors ${step === 'review' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
            3. Variance Review & Post
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-6 min-h-[400px]">
        {step === 'create' && (
          <div className="space-y-8 animate-in fade-in slide-in-from-right-4">
            <div className="space-y-4 max-w-md">
              <h3 className="text-lg font-medium">Start New Stocktake</h3>
              <p className="text-sm text-muted-foreground">Select a location to freeze a snapshot of expected stock levels.</p>
              <div className="space-y-2">
                <Label>Location</Label>
                <Select value={locationId} onValueChange={setLocationId}>
                  <SelectTrigger><SelectValue placeholder="Choose Location" /></SelectTrigger>
                  <SelectContent>
                    {locations.map((loc) => <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={beginStocktake} disabled={!locationId} className="w-full">
                <Play className="w-4 h-4 mr-2" /> Start New Stocktake
              </Button>
            </div>

            <div className="relative">
              <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
              <div className="relative flex justify-center text-xs uppercase"><span className="bg-card px-2 text-muted-foreground">Or</span></div>
            </div>

            <div className="space-y-4 max-w-md">
              <h3 className="text-lg font-medium">Resume Existing Stocktake</h3>
              <form onSubmit={handleResume} className="flex gap-2">
                <Input placeholder="Stocktake ID" value={stocktakeId} onChange={e => setStocktakeId(e.target.value)} required />
                <Button type="submit" variant="secondary">Resume</Button>
              </form>
            </div>
          </div>
        )}

        {step === 'count' && workspace && (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
            <div className="flex justify-between items-center bg-muted/20 p-4 rounded-lg border">
              <div>
                <p className="text-sm text-muted-foreground">Active Stocktake ID</p>
                <p className="font-mono font-medium">{stocktakeId}</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-muted-foreground">Progress</p>
                <p className="font-medium">
                  {workspace.lines.filter(l => l.countedQuantity !== null).length} / {workspace.lines.length} lines counted
                </p>
              </div>
            </div>

            <form onSubmit={submitCount} className="flex items-end gap-3 p-4 bg-primary/5 rounded-lg border border-primary/20">
              <div className="flex-1 space-y-2">
                <Label>Inventory Item ID</Label>
                <Input autoFocus placeholder="Scan or type ID" value={countItemId} onChange={e => setCountItemId(e.target.value)} required />
              </div>
              <div className="w-32 space-y-2">
                <Label>Physical Count</Label>
                <Input type="number" min="0" placeholder="Qty" value={countQuantity} onChange={e => setCountQuantity(e.target.value)} required />
              </div>
              <Button type="submit">Save Count</Button>
            </form>

            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Inventory Item</TableHead>
                    <TableHead className="text-right">Expected</TableHead>
                    <TableHead className="text-right">Counted</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {workspace.lines.map(line => {
                    const isCounted = line.countedQuantity !== null;
                    const diff = isCounted ? Number(line.countedQuantity) - Number(line.expectedQuantity) : 0;
                    return (
                      <TableRow key={line.inventoryItemId} className={countItemId === line.inventoryItemId ? 'bg-primary/10' : ''}>
                        <TableCell className="font-mono text-xs">{line.inventoryItemId}</TableCell>
                        <TableCell className="text-right">{line.expectedQuantity}</TableCell>
                        <TableCell className="text-right font-medium">
                          {isCounted ? line.countedQuantity : <span className="text-muted-foreground/50">—</span>}
                        </TableCell>
                        <TableCell className="text-center">
                          {isCounted ? (
                            diff === 0 
                              ? <CheckCircle2 className="w-4 h-4 text-success mx-auto" />
                              : <AlertTriangle className="w-4 h-4 text-warning mx-auto" />
                          ) : <span className="text-xs text-muted-foreground">Pending</span>}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            
            <div className="flex justify-end pt-4">
              <Button onClick={() => setStep('review')}>
                Proceed to Review <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </div>
        )}

        {step === 'review' && workspace && (
          <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
            {!allCounted && (
              <div className="bg-destructive/10 text-destructive p-4 rounded-lg flex gap-3 items-start border border-destructive/20">
                <AlertTriangle className="w-5 h-5 shrink-0" />
                <div>
                  <p className="font-medium">Incomplete Stocktake</p>
                  <p className="text-sm mt-1">Not all lines have been counted. You must count every snapshot line (even if the count is 0) before posting.</p>
                </div>
              </div>
            )}

            <div className="rounded-md border bg-card">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Inventory Item</TableHead>
                    <TableHead className="text-right">Expected</TableHead>
                    <TableHead className="text-right">Counted</TableHead>
                    <TableHead className="text-right">Variance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {workspace.lines.map(line => {
                    const isCounted = line.countedQuantity !== null;
                    const diff = isCounted ? Number(line.countedQuantity) - Number(line.expectedQuantity) : 0;
                    return (
                      <TableRow key={line.inventoryItemId}>
                        <TableCell className="font-mono text-xs">{line.inventoryItemId}</TableCell>
                        <TableCell className="text-right">{line.expectedQuantity}</TableCell>
                        <TableCell className="text-right">{isCounted ? line.countedQuantity : '—'}</TableCell>
                        <TableCell className="text-right">
                          {!isCounted ? '—' : diff === 0 ? '0' : (
                            <div className={`flex items-center justify-end gap-1 font-medium ${diff > 0 ? 'text-success' : 'text-destructive'}`}>
                              {diff > 0 ? <PackagePlus className="w-3 h-3" /> : <PackageMinus className="w-3 h-3" />}
                              {diff > 0 ? '+' : ''}{diff}
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            <div className="flex justify-between pt-4">
              <Button variant="outline" onClick={() => setStep('count')}>Back to Counting</Button>
              <Button onClick={postStocktake} disabled={!allCounted}>
                <ArrowRightLeft className="w-4 h-4 mr-2" /> Post Variances & Close Stocktake
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
