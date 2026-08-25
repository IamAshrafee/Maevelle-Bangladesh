'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, SplitSquareHorizontal } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
const toast = { success: console.log, error: console.error, promise: console.log, info: console.log };

interface FulfillmentCreationWorkspaceProps {
  orderId: string;
  lines: any[];
  locations: any[];
  onCreated: () => void;
}

export function FulfillmentCreationWorkspace({ orderId, lines, locations, onCreated }: FulfillmentCreationWorkspaceProps) {
  const [locationId, setLocationId] = useState<string>('');
  const [quantities, setQuantities] = useState<Record<string, string>>(
    lines.reduce((acc, line) => ({ ...acc, [line.id]: line.quantity }), {})
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isPartial = lines.some(line => Number(quantities[line.id] || 0) < Number(line.quantity));

  const handleSubmit = async () => {
    if (!locationId) {
      toast.error('Please select a stock location first.');
      return;
    }

    setIsSubmitting(true);
    try {
      const payloadLines = lines
        .map(line => ({
          orderLineId: line.id,
          quantity: quantities[line.id] || '0'
        }))
        .filter(line => Number(line.quantity) > 0);

      const response = await fetch(`/api/admin/orders/${orderId}/fulfillments`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json', 'idempotency-key': crypto.randomUUID() },
        body: JSON.stringify({ locationId, lines: payloadLines }),
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }

      toast.success('Fulfillment created successfully.');
      onCreated();
    } catch (error) {
      toast.error('Failed to create fulfillment: ' + (error as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card className="mt-8 border-primary/20 bg-primary/5">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          Create Fulfillment
          {isPartial && <Badge variant="secondary" className="bg-primary/20"><SplitSquareHorizontal className="w-3 h-3 mr-1"/> Partial Split</Badge>}
        </CardTitle>
        <CardDescription>
          Assign warehouse location and specify quantities to pack.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Stock Location</Label>
          <Select value={locationId} onValueChange={setLocationId}>
            <SelectTrigger>
              <SelectValue placeholder="Select warehouse location" />
            </SelectTrigger>
            <SelectContent>
              {locations.map(loc => (
                <SelectItem key={loc.id} value={loc.id}>{loc.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="rounded-md border bg-card divide-y">
          {lines.map((line) => (
            <div key={line.id} className="p-3 flex items-center justify-between gap-4">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{line.productTitle}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Ordered: {line.quantity}</p>
              </div>
              <div className="flex items-center gap-2 w-32">
                <Input
                  type="number"
                  min="0"
                  max={line.quantity}
                  step="0.000001"
                  className="text-right"
                  value={quantities[line.id] || ''}
                  onChange={(e) => setQuantities({ ...quantities, [line.id]: e.target.value })}
                />
              </div>
            </div>
          ))}
        </div>
      </CardContent>
      <CardFooter>
        <Button className="w-full" onClick={handleSubmit} disabled={isSubmitting || !locationId}>
          <CheckCircle2 className="w-4 h-4 mr-2" />
          {isPartial ? 'Create Split Fulfillment' : 'Create Complete Fulfillment'}
        </Button>
      </CardFooter>
    </Card>
  );
}
