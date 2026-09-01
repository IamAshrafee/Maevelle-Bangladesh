'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Search, MapPin } from 'lucide-react';
import Link from 'next/link';

import type { WarehouseLocationDto } from '@maevelle/contracts';

import { inventoryRequest } from '@/lib/inventory/api';
import { InventoryFeedback, InventoryEmptyState } from './inventory-page-ui';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export function LocationOverview() {
  const router = useRouter();
  const [locations, setLocations] = useState<WarehouseLocationDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    inventoryRequest<{ data: WarehouseLocationDto[] }>('/warehouse/locations')
      .then((res) => {
        setLocations(res.data);
        setError(null);
      })
      .catch((err) => setError(err instanceof Error ? err : new Error(String(err))))
      .finally(() => setIsLoading(false));
  }, []);

  const filteredLocations = locations.filter((loc) => 
    loc.name.toLowerCase().includes(search.toLowerCase()) || 
    loc.code.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Locations</h2>
          <p className="text-muted-foreground">Manage your warehouses, stores, and fulfillment centers.</p>
        </div>
        <Button onClick={() => router.push('/inventory/warehouses/new')}>
          <Plus className="mr-2 h-4 w-4" />
          Add Location
        </Button>
      </div>

      <div className="flex items-center gap-2 max-w-sm">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search locations..."
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <InventoryFeedback isError message={error instanceof Error ? error.message : ''} />

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse bg-muted/50">
              <CardHeader className="h-24"></CardHeader>
              <CardContent className="h-24"></CardContent>
            </Card>
          ))}
        </div>
      ) : filteredLocations.length === 0 ? (
        <InventoryEmptyState
          title="No locations found"
          description={search ? "Try adjusting your search query." : "You haven't created any locations yet."}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredLocations.map((location) => (
            <Link key={location.id} href={`/inventory/warehouses/${location.id}`}>
              <Card className="hover:border-primary/50 transition-colors cursor-pointer h-full">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-muted-foreground" />
                      {location.name}
                    </CardTitle>
                    <Badge variant={location.status === 'ACTIVE' ? 'default' : 'secondary'}>
                      {location.status}
                    </Badge>
                  </div>
                  <CardDescription className="font-mono text-xs">{location.code}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {location.capabilities.map((cap) => (
                      <Badge key={cap} variant="outline" className="text-[10px] bg-background">
                        {cap.replace(/_/g, ' ')}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
