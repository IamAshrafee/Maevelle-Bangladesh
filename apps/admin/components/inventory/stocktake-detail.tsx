'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, MapPin, Package, CheckCircle, Clock } from 'lucide-react';
import Link from 'next/link';

import { inventoryRequest, formatInventoryDate, formatInventoryNumber } from '@/lib/inventory/api';
import { InventoryEmptyState } from './inventory-page-ui';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

export function StocktakeDetail({ stocktakeId }: { stocktakeId: string }) {
  const router = useRouter();
  const [stocktake, setStocktake] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [counts, setCounts] = useState<Record<string, string>>({});

  useEffect(() => {
    inventoryRequest<{ data: any }>(`/inventory/stocktakes/${stocktakeId}`)
      .then((res) => {
        setStocktake(res.data);
        setError(null);
        // Initialize counts
        const initialCounts: Record<string, string> = {};
        res.data.lines.forEach((line: any) => {
          if (line.countedQuantity) initialCounts[line.id] = line.countedQuantity;
        });
        setCounts(initialCounts);
      })
      .catch((err) => setError(err instanceof Error ? err : new Error(String(err))))
      .finally(() => setIsLoading(false));
  }, [stocktakeId]);

  const handleSaveCount = async (lineId: string, quantity: string) => {
    // In a real app, we'd make a request here
    console.log(`Saving count for line ${lineId}: ${quantity}`);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-12 w-1/3 animate-pulse bg-muted rounded-md" />
        <div className="grid gap-4 md:grid-cols-3">
          <div className="h-[120px] w-full animate-pulse bg-muted rounded-md" />
          <div className="h-[120px] w-full animate-pulse bg-muted rounded-md" />
          <div className="h-[120px] w-full animate-pulse bg-muted rounded-md" />
        </div>
      </div>
    );
  }

  if (error || !stocktake) {
    return (
      <InventoryEmptyState
        title="Stocktake not found"
        description="The requested stocktake could not be found or you don't have permission to view it."
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="outline" size="icon" onClick={() => router.push('/inventory/stocktakes')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-bold tracking-tight">Stocktake #{stocktake.id.slice(0, 8)}</h2>
            <Badge variant={stocktake.status === 'POSTED' ? 'default' : 'secondary'}>{stocktake.status}</Badge>
          </div>
          <p className="text-muted-foreground mt-1 flex items-center gap-2 text-sm">
            <MapPin className="h-4 w-4" /> Location: {stocktake.locationId}
          </p>
        </div>
        <div className="flex gap-2">
          {stocktake.status === 'COUNTING' && (
            <>
              <Button variant="destructive" onClick={() => {}}>Cancel</Button>
              <Button onClick={() => {}}>Review & Post</Button>
            </>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Started At</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatInventoryDate(stocktake.snapshotAt)}</div>
            <p className="text-xs text-muted-foreground">By {stocktake.createdByActorId}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Items to Count</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stocktake.lines.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Counted Items</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stocktake.lines.filter((l: any) => l.countedQuantity != null).length}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Count Lines</CardTitle>
          <CardDescription>Enter physical counts for each item.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="relative w-full overflow-auto">
            <table className="w-full caption-bottom text-sm">
              <thead className="[&_tr]:border-b">
                <tr className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                  <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Item ID</th>
                  <th className="h-12 px-4 text-right align-middle font-medium text-muted-foreground">Expected</th>
                  <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Counted Quantity</th>
                  <th className="h-12 px-4 text-right align-middle font-medium text-muted-foreground">Variance</th>
                </tr>
              </thead>
              <tbody className="[&_tr:last-child]:border-0">
                {stocktake.lines.map((line: any) => {
                  const variance = counts[line.id] 
                    ? Number(counts[line.id]) - Number(line.expectedQuantityAtSnapshot)
                    : null;
                  
                  return (
                    <tr key={line.id} className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                      <td className="p-4 align-middle font-mono text-xs">
                        {line.inventoryItemId}
                      </td>
                      <td className="p-4 text-right align-middle tabular-nums text-muted-foreground">
                        {formatInventoryNumber(line.expectedQuantityAtSnapshot)}
                      </td>
                      <td className="p-4 align-middle">
                        <div className="max-w-[120px]">
                          <Input 
                            type="number"
                            value={counts[line.id] || ''}
                            onChange={(e) => setCounts({...counts, [line.id]: e.target.value})}
                            onBlur={() => handleSaveCount(line.id, counts[line.id] || '')}
                            disabled={stocktake.status !== 'COUNTING'}
                            placeholder="Enter count"
                          />
                        </div>
                      </td>
                      <td className={`p-4 text-right align-middle tabular-nums font-medium ${variance !== null && variance > 0 ? 'text-green-600' : variance !== null && variance < 0 ? 'text-destructive' : ''}`}>
                        {variance !== null ? (variance > 0 ? `+${variance}` : variance) : '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
