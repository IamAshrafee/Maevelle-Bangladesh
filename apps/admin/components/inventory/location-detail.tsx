'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, MapPin, Package, Settings, Truck } from 'lucide-react';
import Link from 'next/link';

import type { WarehouseLocationDto } from '@maevelle/contracts';

import { inventoryRequest } from '@/lib/inventory/api';
import { InventoryEmptyState } from './inventory-page-ui';
import { StockTable } from './stock-table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export function LocationDetail({ locationId }: { locationId: string }) {
  const router = useRouter();
  const [location, setLocation] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  // We fetch stock for this specific location to display in the stock table tab
  const [stock, setStock] = useState<any[]>([]);
  const [stockLoading, setStockLoading] = useState(true);

  useEffect(() => {
    // Fetch Location Details
    inventoryRequest<{ data: any }>(`/warehouse/locations/${locationId}`)
      .then((res) => {
        setLocation(res.data);
        setError(null);
      })
      .catch((err) => setError(err instanceof Error ? err : new Error(String(err))))
      .finally(() => setIsLoading(false));
      
    // Fetch Stock for this location
    inventoryRequest<{ data: any }>(`/inventory/stock?locationId=${locationId}&limit=100`)
      .then((res) => {
        setStock(res.data.items);
      })
      .catch(console.error)
      .finally(() => setStockLoading(false));
  }, [locationId]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-12 w-1/3 animate-pulse bg-muted rounded-md" />
        <div className="grid gap-4 md:grid-cols-4">
          <div className="h-[120px] w-full animate-pulse bg-muted rounded-md" />
          <div className="h-[120px] w-full animate-pulse bg-muted rounded-md" />
          <div className="h-[120px] w-full animate-pulse bg-muted rounded-md" />
          <div className="h-[120px] w-full animate-pulse bg-muted rounded-md" />
        </div>
      </div>
    );
  }

  if (error || !location) {
    return (
      <InventoryEmptyState
        title="Location not found"
        description="The requested location could not be found or you don't have permission to view it."
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="outline" size="icon" onClick={() => router.push('/inventory/warehouses')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <MapPin className="h-6 w-6 text-muted-foreground" />
            <h2 className="text-2xl font-bold tracking-tight">{location.name}</h2>
            <Badge variant={location.status === 'ACTIVE' ? 'default' : 'secondary'}>{location.status}</Badge>
            <Badge variant="outline" className="font-mono">{location.code}</Badge>
          </div>
          <p className="text-muted-foreground mt-1 flex items-center gap-2">
            Type: {location.locationType}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => router.push(`/inventory/warehouses/${locationId}/edit`)}>
            <Settings className="mr-2 h-4 w-4" />
            Settings
          </Button>
          <Button onClick={() => router.push(`/inventory/transfers/new?sourceId=${locationId}`)}>
            <Truck className="mr-2 h-4 w-4" />
            Transfer Stock
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total On Hand</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{location.inventorySummary?.totalOnHand || '0'}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Available to Sell</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{location.inventorySummary?.totalAvailable || '0'}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Reserved</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{location.inventorySummary?.totalReserved || '0'}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Capabilities</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{location.capabilities.length}</div>
            <p className="text-xs text-muted-foreground">Active capabilities</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="stock">
        <TabsList>
          <TabsTrigger value="stock">Current Stock</TabsTrigger>
          <TabsTrigger value="capabilities">Capabilities & Settings</TabsTrigger>
        </TabsList>
        <TabsContent value="stock" className="mt-4">
          <Card>
            <CardContent className="p-0">
              <StockTable 
                balances={stock} 
                isLoading={stockLoading} 
                hideLocation={true} 
              />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="capabilities" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Location Capabilities</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {location.capabilities.map((cap: string) => (
                  <Badge key={cap} variant="secondary" className="px-3 py-1">
                    {cap.replace(/_/g, ' ')}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
