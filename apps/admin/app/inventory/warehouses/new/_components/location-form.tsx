'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Save, ArrowLeft } from 'lucide-react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

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

const formSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  code: z.string().min(1, 'Location code is required'),
  locationType: z.string().min(1, 'Location type is required'),
  fullAddress: z.string().optional(),
});

type FormValues = z.infer<typeof formSchema>;

export function LocationForm() {
  const router = useRouter();
  const [error, setError] = useState<Error | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      code: '',
      locationType: 'WAREHOUSE',
      fullAddress: '',
    },
  });

  const onSubmit = async (values: FormValues) => {
    setError(null);

    try {
      // Create new location
      const result = await inventoryRequest<{ data: { id: string } }>('/warehouse/locations', {
        method: 'POST',
        body: JSON.stringify({
          name: values.name,
          code: values.code,
          locationType: values.locationType,
          capabilities: ['STOCK_HOLDING', 'TRANSFER_SEND', 'TRANSFER_RECEIVE', 'INTERNAL_STORAGE'],
          address: {
            fullAddress: values.fullAddress || undefined,
            countryCode: 'BD', // default for Maevelle Bangladesh
          },
        }),
      });
      
      router.push(`/inventory/warehouses/${result.data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
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

      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
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
                placeholder="e.g. Main Warehouse Dhaka" 
                {...form.register('name')} 
              />
              {form.formState.errors.name && (
                <p className="text-sm font-medium text-destructive">{form.formState.errors.name.message}</p>
              )}
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="code">Location Code <span className="text-destructive">*</span></Label>
                <Input 
                  id="code" 
                  placeholder="e.g. WH-DHAKA-01" 
                  {...form.register('code')} 
                />
                {form.formState.errors.code && (
                  <p className="text-sm font-medium text-destructive">{form.formState.errors.code.message}</p>
                )}
              </div>
              
              <div className="grid gap-2">
                <Label htmlFor="type">Location Type</Label>
                <Select 
                  onValueChange={(val) => form.setValue('locationType', val || '', { shouldValidate: true })}
                  value={form.watch('locationType')}
                >
                  <SelectTrigger id="type">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="WAREHOUSE">Warehouse</SelectItem>
                    <SelectItem value="FULFILLMENT_CENTER">Fulfillment Center</SelectItem>
                    <SelectItem value="STORE">Retail Store</SelectItem>
                    <SelectItem value="DROPSHIPPER">Dropshipper</SelectItem>
                  </SelectContent>
                </Select>
                {form.formState.errors.locationType && (
                  <p className="text-sm font-medium text-destructive">{form.formState.errors.locationType.message}</p>
                )}
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
                placeholder="e.g. 123 Logistics Way, Dhaka 1200, Bangladesh" 
                {...form.register('fullAddress')} 
              />
              {form.formState.errors.fullAddress && (
                <p className="text-sm font-medium text-destructive">{form.formState.errors.fullAddress.message}</p>
              )}
            </div>

            <div className="pt-6 flex justify-end">
              <Button type="submit" disabled={form.formState.isSubmitting}>
                <Save className="mr-2 h-4 w-4" />
                {form.formState.isSubmitting ? 'Creating...' : 'Create Location'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
