'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, MapPin, Package, Settings, Truck, ArrowRight, CheckCircle, FileText, Ban } from 'lucide-react';
import Link from 'next/link';

import { inventoryRequest, formatInventoryDate, formatInventoryNumber } from '@/lib/inventory/api';
import { InventoryEmptyState } from './inventory-page-ui';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

export function TransferDetail({ transferId }: { transferId: string }) {
  const router = useRouter();
  const [transfer, setTransfer] = useState<any | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    inventoryRequest<{ data: any }>(`/warehouse/transfers/${transferId}`)
      .then((res) => {
        setTransfer(res.data);
        setError(null);
      })
      .catch((err) => setError(err instanceof Error ? err : new Error(String(err))))
      .finally(() => setIsLoading(false));
  }, [transferId]);

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

  if (error || !transfer) {
    return (
      <InventoryEmptyState
        title="Transfer not found"
        description="The requested transfer could not be found or you don't have permission to view it."
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="outline" size="icon" onClick={() => router.push('/inventory/transfers')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-bold tracking-tight">Transfer {transfer.transferNumber}</h2>
            <Badge variant={transfer.status === 'RECEIVED' ? 'default' : 'secondary'}>{transfer.status}</Badge>
          </div>
          <p className="text-muted-foreground mt-1 flex items-center gap-2 text-sm">
            Created on {formatInventoryDate(transfer.createdAt)}
          </p>
        </div>
        <div className="flex gap-2">
          {transfer.status === 'DRAFT' && (
            <>
              <Button variant="destructive" onClick={() => {}}>Cancel Transfer</Button>
              <Button onClick={() => {}}>Approve Transfer</Button>
            </>
          )}
          {transfer.status === 'READY' && (
            <Button onClick={() => {}}>Dispatch Transfer</Button>
          )}
          {transfer.status === 'DISPATCHED' || transfer.status === 'IN_TRANSIT' ? (
            <Button onClick={() => {}}>Receive Transfer</Button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <MapPin className="h-4 w-4 text-muted-foreground" /> Route Details
            </CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-1">Source</p>
              <Link href={`/inventory/warehouses/${transfer.sourceLocationId}`} className="font-medium hover:underline">
                {transfer.sourceLocationName || transfer.sourceLocationId}
              </Link>
            </div>
            <ArrowRight className="h-5 w-5 text-muted-foreground mx-4" />
            <div className="text-right">
              <p className="text-sm font-medium text-muted-foreground mb-1">Destination</p>
              <Link href={`/inventory/warehouses/${transfer.destinationLocationId}`} className="font-medium hover:underline">
                {transfer.destinationLocationName || transfer.destinationLocationId}
              </Link>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" /> Transfer Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-2xl font-bold">{transfer.totalRequested}</p>
                <p className="text-xs text-muted-foreground">Requested</p>
              </div>
              <div>
                <p className="text-2xl font-bold">{transfer.totalDispatched}</p>
                <p className="text-xs text-muted-foreground">Dispatched</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-green-600">{transfer.totalReceived}</p>
                <p className="text-xs text-muted-foreground">Received</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {transfer.notes && (
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground"><span className="font-medium text-foreground">Notes:</span> {transfer.notes}</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Transfer Lines</CardTitle>
          <CardDescription>Items included in this transfer</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {transfer.lines.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">No items added to this transfer yet.</div>
          ) : (
            <div className="relative w-full overflow-auto">
              <table className="w-full caption-bottom text-sm">
                <thead className="[&_tr]:border-b">
                  <tr className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                    <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">Product</th>
                    <th className="h-12 px-4 text-left align-middle font-medium text-muted-foreground">SKU</th>
                    <th className="h-12 px-4 text-right align-middle font-medium text-muted-foreground">Requested</th>
                    <th className="h-12 px-4 text-right align-middle font-medium text-muted-foreground">Dispatched</th>
                    <th className="h-12 px-4 text-right align-middle font-medium text-muted-foreground">Received</th>
                  </tr>
                </thead>
                <tbody className="[&_tr:last-child]:border-0">
                  {transfer.lines.map((line: any) => (
                    <tr key={line.id} className="border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted">
                      <td className="p-4 align-middle font-medium">
                        <Link href={`/inventory/stock/${line.inventoryItemId}`} className="hover:underline">
                          {line.productTitle}
                        </Link>
                      </td>
                      <td className="p-4 align-middle">
                        <Badge variant="outline" className="font-mono text-xs">{line.sku}</Badge>
                      </td>
                      <td className="p-4 text-right align-middle tabular-nums">{formatInventoryNumber(line.requestedQuantity)}</td>
                      <td className="p-4 text-right align-middle tabular-nums">{formatInventoryNumber(line.dispatchedQuantity)}</td>
                      <td className="p-4 text-right align-middle tabular-nums font-medium text-green-600">{formatInventoryNumber(line.receivedQuantity)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
