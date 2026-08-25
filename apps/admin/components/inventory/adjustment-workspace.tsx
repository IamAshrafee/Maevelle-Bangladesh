'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PackageMinus, PackagePlus, Info, CheckCircle2, AlertTriangle, ArrowRight } from 'lucide-react';
const toast = { success: console.log, error: console.error, promise: console.log, info: console.log };
const request = async (url: string, opts?: any) => fetch(url, opts).then(r => r.json());

interface AdjustmentWorkspaceProps {
  locations: any[];
  onSuccess: () => void;
}

type Step = 'variant' | 'warehouse' | 'condition' | 'delta' | 'reason' | 'review';

export function AdjustmentWorkspace({ locations, onSuccess }: AdjustmentWorkspaceProps) {
  const [step, setStep] = useState<Step>('variant');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [variantId, setVariantId] = useState('');
  const [locationId, setLocationId] = useState('');
  const [condition, setCondition] = useState('SELLABLE');
  const [quantityDelta, setQuantityDelta] = useState('');
  const [reasonCode, setReasonCode] = useState('OPENING_BALANCE');
  const [note, setNote] = useState('');

  const handleNext = (nextStep: Step) => {
    if (step === 'variant' && !variantId) { toast.error('Enter a Variant ID.'); return; }
    if (step === 'warehouse' && !locationId) { toast.error('Select a Location.'); return; }
    if (step === 'condition' && !condition) { toast.error('Select a condition.'); return; }
    if (step === 'delta' && (!quantityDelta || isNaN(Number(quantityDelta)))) { toast.error('Enter a valid numerical delta.'); return; }
    
    setStep(nextStep);
  };

  const submitAdjustment = async () => {
    setIsSubmitting(true);
    try {
      await request('/api/admin/inventory/adjustments', {
        method: 'POST',
        headers: { 'idempotency-key': crypto.randomUUID() },
        body: JSON.stringify({
          variantId,
          locationId,
          condition,
          quantityDelta,
          reasonCode,
          note: note || undefined,
        }),
      });
      toast.success('Inventory adjustment posted to the immutable ledger.');
      
      // Reset form
      setVariantId('');
      setLocationId('');
      setCondition('SELLABLE');
      setQuantityDelta('');
      setReasonCode('OPENING_BALANCE');
      setNote('');
      setStep('variant');
      
      onSuccess();
    } catch {
      toast.error('Adjustment was rejected. Check availability limits and valid reasons.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const steps: { id: Step, label: string }[] = [
    { id: 'variant', label: 'Variant' },
    { id: 'warehouse', label: 'Warehouse' },
    { id: 'condition', label: 'Condition' },
    { id: 'delta', label: 'Quantity' },
    { id: 'reason', label: 'Reason' },
    { id: 'review', label: 'Review' }
  ];

  const currentStepIndex = steps.findIndex(s => s.id === step);

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle>Inventory Adjustment</CardTitle>
        <CardDescription>
          Record physical stock discrepancies securely to the immutable ledger.
        </CardDescription>
        <div className="flex gap-2 items-center mt-4">
          {steps.map((s, i) => (
            <React.Fragment key={s.id}>
              <div className={`text-xs font-medium px-2 py-1 rounded-md transition-colors ${
                i === currentStepIndex 
                  ? 'bg-primary text-primary-foreground' 
                  : i < currentStepIndex 
                    ? 'bg-primary/20 text-foreground' 
                    : 'bg-muted text-muted-foreground'
              }`}>
                {s.label}
              </div>
              {i < steps.length - 1 && <ArrowRight className="w-3 h-3 text-muted-foreground" />}
            </React.Fragment>
          ))}
        </div>
      </CardHeader>
      
      <CardContent className="pt-6 min-h-[250px]">
        {step === 'variant' && (
          <div className="space-y-4 animate-in fade-in slide-in-from-right-4">
            <h3 className="text-lg font-medium">1. Identify the Variant</h3>
            <p className="text-sm text-muted-foreground mb-4">Enter the exact system ID or barcode for the variant you wish to adjust.</p>
            <div className="space-y-2 max-w-md">
              <Input 
                autoFocus
                placeholder="Variant ID (e.g. VAR-123)" 
                value={variantId} 
                onChange={e => setVariantId(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleNext('warehouse')}
              />
            </div>
          </div>
        )}

        {step === 'warehouse' && (
          <div className="space-y-4 animate-in fade-in slide-in-from-right-4">
            <h3 className="text-lg font-medium">2. Select the Warehouse</h3>
            <p className="text-sm text-muted-foreground mb-4">Where is this stock physically located?</p>
            <div className="space-y-2 max-w-md">
              <Select value={locationId} onValueChange={v => { setLocationId(v); setTimeout(() => handleNext('condition'), 300); }}>
                <SelectTrigger>
                  <SelectValue placeholder="Select location" />
                </SelectTrigger>
                <SelectContent>
                  {locations.map(loc => (
                    <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {step === 'condition' && (
          <div className="space-y-4 animate-in fade-in slide-in-from-right-4">
            <h3 className="text-lg font-medium">3. State the Condition</h3>
            <p className="text-sm text-muted-foreground mb-4">What state is the physical stock in?</p>
            <div className="space-y-2 max-w-md">
              <Select value={condition} onValueChange={v => { setCondition(v); setTimeout(() => handleNext('delta'), 300); }}>
                <SelectTrigger>
                  <SelectValue placeholder="Select condition" />
                </SelectTrigger>
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

        {step === 'delta' && (
          <div className="space-y-4 animate-in fade-in slide-in-from-right-4">
            <h3 className="text-lg font-medium">4. Specify the Delta</h3>
            <div className="bg-warning/10 p-3 rounded-md text-sm text-warning-foreground border border-warning/20 mb-4 flex gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <p>Enter the <strong>change</strong> (+ or -), not the new total count. Negative adjustments cannot exceed currently available stock.</p>
            </div>
            <div className="space-y-2 max-w-md">
              <Input 
                autoFocus
                type="number"
                placeholder="e.g. 5 or -2" 
                value={quantityDelta} 
                onChange={e => setQuantityDelta(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleNext('reason')}
              />
            </div>
          </div>
        )}

        {step === 'reason' && (
          <div className="space-y-4 animate-in fade-in slide-in-from-right-4">
            <h3 className="text-lg font-medium">5. Justification</h3>
            <p className="text-sm text-muted-foreground mb-4">Why is this adjustment necessary?</p>
            <div className="space-y-4 max-w-md">
              <Select value={reasonCode} onValueChange={setReasonCode}>
                <SelectTrigger>
                  <SelectValue placeholder="Select reason" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="OPENING_BALANCE">Opening Balance</SelectItem>
                  <SelectItem value="SHRINKAGE">Shrinkage / Loss</SelectItem>
                  <SelectItem value="FOUND_STOCK">Found Stock</SelectItem>
                  <SelectItem value="DAMAGE">Damaged / Write-off</SelectItem>
                </SelectContent>
              </Select>
              
              <Input 
                placeholder="Reference / Notes (optional)" 
                value={note} 
                onChange={e => setNote(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleNext('review')}
              />
            </div>
          </div>
        )}

        {step === 'review' && (
          <div className="space-y-4 animate-in fade-in slide-in-from-right-4">
            <h3 className="text-lg font-medium flex items-center gap-2">
              <Info className="w-5 h-5 text-primary" /> Review Adjustment
            </h3>
            <p className="text-sm text-muted-foreground mb-4">Please verify the details. This action creates a permanent ledger entry.</p>
            
            <div className="grid grid-cols-2 gap-4 bg-muted/30 p-4 rounded-lg border">
              <div>
                <p className="text-xs text-muted-foreground uppercase">Variant ID</p>
                <p className="font-medium font-mono">{variantId}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase">Location</p>
                <p className="font-medium">{locations.find(l => l.id === locationId)?.name || locationId}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase">Condition</p>
                <Badge variant={condition === 'SELLABLE' ? 'default' : 'secondary'}>{condition}</Badge>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase">Quantity Change</p>
                <div className="flex items-center gap-2 font-bold text-lg">
                  {Number(quantityDelta) > 0 ? <PackagePlus className="w-5 h-5 text-success" /> : <PackageMinus className="w-5 h-5 text-destructive" />}
                  <span className={Number(quantityDelta) > 0 ? 'text-success' : 'text-destructive'}>
                    {Number(quantityDelta) > 0 ? '+' : ''}{quantityDelta}
                  </span>
                </div>
              </div>
              <div className="col-span-2 pt-2 border-t mt-2">
                <p className="text-xs text-muted-foreground uppercase">Reason Code & Notes</p>
                <p className="font-medium">{reasonCode}</p>
                {note && <p className="text-sm text-muted-foreground mt-1">"{note}"</p>}
              </div>
            </div>
          </div>
        )}
      </CardContent>

      <CardFooter className="flex justify-between border-t p-6">
        <Button 
          variant="outline" 
          onClick={() => setStep(steps[Math.max(0, currentStepIndex - 1)].id)}
          disabled={step === 'variant' || isSubmitting}
        >
          Back
        </Button>
        
        {step !== 'review' ? (
          <Button onClick={() => handleNext(steps[currentStepIndex + 1].id)}>
            Continue <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        ) : (
          <Button onClick={submitAdjustment} disabled={isSubmitting} variant="default" className="bg-primary text-primary-foreground">
            <CheckCircle2 className="w-4 h-4 mr-2" /> Confirm Adjustment
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
