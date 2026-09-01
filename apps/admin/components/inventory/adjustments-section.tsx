'use client';

import { useState } from 'react';
import { Save, Calculator, RefreshCcw } from 'lucide-react';

import { inventoryRequest } from '@/lib/inventory/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export function AdjustmentsSection() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Stock Adjustment State
  const [adjItemId, setAdjItemId] = useState('');
  const [adjLocationId, setAdjLocationId] = useState('');
  const [adjCondition, setAdjCondition] = useState('SELLABLE');
  const [adjDelta, setAdjDelta] = useState('');
  const [adjReason, setAdjReason] = useState('CORRECTION');
  const [adjNote, setAdjNote] = useState('');

  // Condition Movement State
  const [condItemId, setCondItemId] = useState('');
  const [condLocationId, setCondLocationId] = useState('');
  const [condFrom, setCondFrom] = useState('SELLABLE');
  const [condTo, setCondTo] = useState('DAMAGED');
  const [condQty, setCondQty] = useState('');
  const [condReason, setCondReason] = useState('');

  const handleAdjustmentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    setSuccessMessage(null);

    try {
      await inventoryRequest('/inventory/adjustments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inventoryItemId: adjItemId,
          locationId: adjLocationId,
          condition: adjCondition,
          quantityDelta: adjDelta,
          reasonCategory: adjReason,
          reasonDetails: adjNote,
        }),
      });
      
      setSuccessMessage('Inventory adjusted successfully.');
      setAdjItemId('');
      setAdjDelta('');
      setAdjNote('');
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConditionSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    setSuccessMessage(null);

    try {
      await inventoryRequest('/inventory/condition-movements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inventoryItemId: condItemId,
          locationId: condLocationId,
          fromCondition: condFrom,
          toCondition: condTo,
          quantity: condQty,
          reason: condReason,
        }),
      });
      
      setSuccessMessage('Inventory condition updated successfully.');
      setCondItemId('');
      setCondQty('');
      setCondReason('');
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Manual Adjustments</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Directly correct inventory levels or move items between states (e.g. Sellable to Damaged).
        </p>
      </div>

      {error && (
        <div className="p-4 bg-destructive/10 text-destructive rounded-md text-sm">
          {error.message}
        </div>
      )}

      {successMessage && (
        <div className="p-4 bg-green-50 text-green-700 rounded-md text-sm">
          {successMessage}
        </div>
      )}

      <Tabs defaultValue="adjustment">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="adjustment">
            <Calculator className="h-4 w-4 mr-2" />
            Stock Adjustment
          </TabsTrigger>
          <TabsTrigger value="condition">
            <RefreshCcw className="h-4 w-4 mr-2" />
            Condition Move
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="adjustment" className="mt-4">
          <form onSubmit={handleAdjustmentSubmit}>
            <Card>
              <CardHeader>
                <CardTitle>Adjust Stock Quantity</CardTitle>
                <CardDescription>Increase or decrease the quantity of an item. Requires justification.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="adj-item">Item ID <span className="text-destructive">*</span></Label>
                    <Input id="adj-item" value={adjItemId} onChange={(e) => setAdjItemId(e.target.value)} required />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="adj-loc">Location ID <span className="text-destructive">*</span></Label>
                    <Input id="adj-loc" value={adjLocationId} onChange={(e) => setAdjLocationId(e.target.value)} required />
                  </div>
                </div>
                
                <div className="grid grid-cols-3 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="adj-cond">Condition</Label>
                    <Select value={adjCondition} onValueChange={(v) => setAdjCondition(v || '')}>
                      <SelectTrigger id="adj-cond"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="SELLABLE">Sellable</SelectItem>
                        <SelectItem value="DAMAGED">Damaged</SelectItem>
                        <SelectItem value="QUARANTINE">Quarantine</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="adj-delta">Quantity (+ or -) <span className="text-destructive">*</span></Label>
                    <Input id="adj-delta" type="number" value={adjDelta} onChange={(e) => setAdjDelta(e.target.value)} required placeholder="e.g. 5 or -2" />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="adj-reason">Reason Category</Label>
                    <Select value={adjReason} onValueChange={(v) => setAdjReason(v || '')}>
                      <SelectTrigger id="adj-reason"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="OPENING_BALANCE">Opening Balance</SelectItem>
                        <SelectItem value="CORRECTION">Correction (Cycle Count)</SelectItem>
                        <SelectItem value="DAMAGE">Damage/Shrinkage</SelectItem>
                        <SelectItem value="FOUND_STOCK">Found Stock</SelectItem>
                        <SelectItem value="OTHER">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="adj-note">Reason Details / Note</Label>
                  <Textarea id="adj-note" value={adjNote} onChange={(e) => setAdjNote(e.target.value)} rows={2} />
                </div>
                
                <div className="pt-4 flex justify-end">
                  <Button type="submit" disabled={isSubmitting || !adjItemId || !adjLocationId || !adjDelta}>
                    <Save className="mr-2 h-4 w-4" />
                    Post Adjustment
                  </Button>
                </div>
              </CardContent>
            </Card>
          </form>
        </TabsContent>
        
        <TabsContent value="condition" className="mt-4">
          <form onSubmit={handleConditionSubmit}>
            <Card>
              <CardHeader>
                <CardTitle>Change Item Condition</CardTitle>
                <CardDescription>Move stock from one condition to another (e.g., mark as damaged) without changing total on-hand quantity.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="cond-item">Item ID <span className="text-destructive">*</span></Label>
                    <Input id="cond-item" value={condItemId} onChange={(e) => setCondItemId(e.target.value)} required />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="cond-loc">Location ID <span className="text-destructive">*</span></Label>
                    <Input id="cond-loc" value={condLocationId} onChange={(e) => setCondLocationId(e.target.value)} required />
                  </div>
                </div>
                
                <div className="grid grid-cols-3 gap-4">
                  <div className="grid gap-2">
                    <Label htmlFor="cond-from">From Condition</Label>
                    <Select value={condFrom} onValueChange={(v) => setCondFrom(v || '')}>
                      <SelectTrigger id="cond-from"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="SELLABLE">Sellable</SelectItem>
                        <SelectItem value="DAMAGED">Damaged</SelectItem>
                        <SelectItem value="QUARANTINE">Quarantine</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="cond-to">To Condition</Label>
                    <Select value={condTo} onValueChange={(v) => setCondTo(v || '')}>
                      <SelectTrigger id="cond-to"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="SELLABLE">Sellable</SelectItem>
                        <SelectItem value="DAMAGED">Damaged</SelectItem>
                        <SelectItem value="QUARANTINE">Quarantine</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="cond-qty">Quantity <span className="text-destructive">*</span></Label>
                    <Input id="cond-qty" type="number" min="1" value={condQty} onChange={(e) => setCondQty(e.target.value)} required />
                  </div>
                </div>

                <div className="grid gap-2">
                  <Label htmlFor="cond-reason">Reason</Label>
                  <Input id="cond-reason" value={condReason} onChange={(e) => setCondReason(e.target.value)} />
                </div>
                
                <div className="pt-4 flex justify-end">
                  <Button type="submit" disabled={isSubmitting || !condItemId || !condLocationId || !condQty || condFrom === condTo}>
                    <RefreshCcw className="mr-2 h-4 w-4" />
                    Move Condition
                  </Button>
                </div>
              </CardContent>
            </Card>
          </form>
        </TabsContent>
      </Tabs>
    </div>
  );
}
