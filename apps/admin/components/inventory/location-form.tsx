'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Save, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

import { inventoryRequest } from '@/lib/inventory/api';
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

export function LocationForm() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [locationType, setLocationType] = useState('WAREHOUSE');

  const [fullAddress, setFullAddress] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      // Create new location
      const result = await inventoryRequest<{ data: { id: string } }>('/warehouse/locations', {
        method: 'POST',
        body: JSON.stringify({
          name,
          code,
          locationType,
          capabilities: ['STOCK_HOLDING', 'TRANSFER_SEND', 'TRANSFER_RECEIVE', 'INTERNAL_STORAGE'],
          address: {
            fullAddress: fullAddress || undefined,
            countryCode: 'BD', // default for Maevelle Bangladesh
          },
        }),
      });
      
      router.push(`/inventory/warehouses/${result.data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-4">
        <Button variant="outline" size="icon" type="button" onClick={() => router.push('/inventory/warehouses')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h2 className="text-2xl font-bold tracking-tight">Create Location</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Add a new warehouse, fulfillment center, or retail store.
          </p>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-destructive/10 text-destructive rounded-md text-sm">
          {error.message}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>General Information</CardTitle>
            <CardDescription>Basic details about this location.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Name <span className="text-destructive">*</span></Label>
              <Input 
                id="name" 
                value={name} 
                onChange={(e) => setName(e.target.value)} 
                required 
                placeholder="e.g. Main Warehouse Dhaka" 
              />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="code">Location Code <span className="text-destructive">*</span></Label>
                <Input 
                  id="code" 
                  value={code} 
                  onChange={(e) => setCode(e.target.value)} 
                  required 
                  placeholder="e.g. WH-DHAKA-01" 
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="type">Location Type</Label>
                <Select value={locationType} onValueChange={(v) => setLocationType(v || '')}>
                  <SelectTrigger id="type">
                    <SelectValue placeholder="Select type">
                      {locationType === 'WAREHOUSE' ? 'Warehouse' :
                       locationType === 'FULFILLMENT_CENTER' ? 'Fulfillment Center' :
                       locationType === 'STORE' ? 'Retail Store' :
                       locationType === 'DROPSHIPPER' ? 'Dropshipper' : undefined}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="WAREHOUSE">Warehouse</SelectItem>
                    <SelectItem value="FULFILLMENT_CENTER">Fulfillment Center</SelectItem>
                    <SelectItem value="STORE">Retail Store</SelectItem>
                    <SelectItem value="DROPSHIPPER">Dropshipper</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Address Details</CardTitle>
            <CardDescription>Where this location is physically situated.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="fullAddress">Full Address</Label>
              <Input 
                id="fullAddress" 
                value={fullAddress} 
                onChange={(e) => setFullAddress(e.target.value)} 
                placeholder="e.g. 123 Logistics Way, Dhaka 1200, Bangladesh" 
              />
            </div>

            <div className="pt-6 flex justify-end">
              <Button type="submit" disabled={isSubmitting || !name || !code}>
                <Save className="mr-2 h-4 w-4" />
                {isSubmitting ? 'Creating...' : 'Create Location'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
