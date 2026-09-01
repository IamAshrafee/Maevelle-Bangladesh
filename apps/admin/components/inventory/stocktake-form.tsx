'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Save, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

import { inventoryRequest } from '@/lib/inventory/api';
import type { WarehouseLocationDto } from '@maevelle/contracts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export function StocktakeForm() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingLocations, setIsLoadingLocations] = useState(true);
  const [locations, setLocations] = useState<WarehouseLocationDto[]>([]);
  const [error, setError] = useState<Error | null>(null);

  const [locationId, setLocationId] = useState('');

  useEffect(() => {
    let mounted = true;
    const fetchLocations = async () => {
      try {
        const response = await inventoryRequest<{ data: WarehouseLocationDto[] }>('/warehouse/locations');
        if (mounted) {
          setLocations(response.data || []);
          setIsLoadingLocations(false);
        }
      } catch (err) {
        if (mounted) {
          setError(err instanceof Error ? err : new Error(String(err)));
          setIsLoadingLocations(false);
        }
      }
    };
    fetchLocations();
    return () => { mounted = false; };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const result = await inventoryRequest<{ data: { stocktakeId: string } }>('/inventory/stocktakes', {
        method: 'POST',
        body: JSON.stringify({
          locationId,
        }),
      });
      
      router.push(`/inventory/stocktakes/${result.data.stocktakeId}`);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div className="flex items-center gap-4">
        <Button variant="outline" size="icon" type="button" onClick={() => router.push('/inventory/stocktakes')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h2 className="text-2xl font-bold tracking-tight">Start Stocktake</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Begin a physical count of inventory at a location.
          </p>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-destructive/10 text-destructive rounded-md text-sm">
          {error.message}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <CardTitle>Stocktake Scope</CardTitle>
            <CardDescription>Select the location you are counting.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="location">Location <span className="text-destructive">*</span></Label>
              <Select value={locationId} onValueChange={(val) => setLocationId(val || '')} disabled={isLoadingLocations}>
                <SelectTrigger id="location">
                  <SelectValue placeholder={isLoadingLocations ? "Loading locations..." : "Select a location"}>
                    {locationId ? locations.find(l => l.id === locationId)?.name : undefined}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {locations.map((loc) => (
                    <SelectItem key={loc.id} value={loc.id}>
                      {loc.name} ({loc.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">This will capture a snapshot of all current system balances for this location.</p>
            </div>
            
            <div className="pt-4 flex justify-end">
              <Button type="submit" disabled={isSubmitting || isLoadingLocations || !locationId}>
                <Save className="mr-2 h-4 w-4" />
                {isSubmitting ? 'Starting...' : 'Start Stocktake'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
