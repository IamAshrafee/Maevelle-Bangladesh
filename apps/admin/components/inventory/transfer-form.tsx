'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Save, ArrowLeft, Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';

import { inventoryRequest } from '@/lib/inventory/api';
import type { WarehouseLocationDto, InventoryBalanceDto, PaginatedDto } from '@maevelle/contracts';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export function TransferForm() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Data fetching state
  const [isLoadingLocations, setIsLoadingLocations] = useState(true);
  const [locations, setLocations] = useState<WarehouseLocationDto[]>([]);
  const [isLoadingStock, setIsLoadingStock] = useState(false);
  const [availableStock, setAvailableStock] = useState<InventoryBalanceDto[]>([]);

  const [sourceLocationId, setSourceLocationId] = useState('');
  const [destinationLocationId, setDestinationLocationId] = useState('');
  const [notes, setNotes] = useState('');
  
  const [lines, setLines] = useState<{ id: string; inventoryItemId: string; quantity: string }[]>([
    { id: '1', inventoryItemId: '', quantity: '1' }
  ]);

  // Fetch locations on mount
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

  // Fetch available stock when source location changes
  useEffect(() => {
    let mounted = true;
    if (!sourceLocationId) {
      setAvailableStock([]);
      return;
    }

    const fetchStock = async () => {
      setIsLoadingStock(true);
      try {
        const response = await inventoryRequest<{ data: PaginatedDto<InventoryBalanceDto> }>(
          `/inventory/stock?locationId=${sourceLocationId}&limit=100`
        );
        if (mounted) {
          // Only show items that actually have physical stock available to transfer
          const transferableStock = (response.data?.items || []).filter(item => Number(item.availableToSell) > 0);
          setAvailableStock(transferableStock);
          setIsLoadingStock(false);
        }
      } catch (err) {
        if (mounted) {
          console.error('Failed to fetch source stock:', err);
          setIsLoadingStock(false);
        }
      }
    };
    fetchStock();
    return () => { mounted = false; };
  }, [sourceLocationId]);

  const handleAddLine = () => {
    setLines([...lines, { id: Math.random().toString(), inventoryItemId: '', quantity: '1' }]);
  };

  const handleRemoveLine = (id: string) => {
    if (lines.length > 1) {
      setLines(lines.filter(l => l.id !== id));
    }
  };

  const handleLineChange = (id: string, field: 'inventoryItemId' | 'quantity', value: string) => {
    setLines(lines.map(l => l.id === id ? { ...l, [field]: value } : l));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Basic validation
    if (sourceLocationId === destinationLocationId) {
      setError(new Error('Source and destination locations cannot be the same.'));
      return;
    }
    
    const validLines = lines.filter(l => l.inventoryItemId && l.quantity && Number(l.quantity) > 0);
    if (validLines.length === 0) {
      setError(new Error('You must add at least one valid line item.'));
      return;
    }

    // Validate quantities against available stock
    for (const line of validLines) {
      const stockItem = availableStock.find(s => s.inventoryItemId === line.inventoryItemId);
      if (stockItem && Number(line.quantity) > Number(stockItem.availableToSell)) {
        setError(new Error(`Cannot transfer ${line.quantity} of ${stockItem.sku || 'item'}. Only ${stockItem.availableToSell} available at source.`));
        return;
      }
    }

    setIsSubmitting(true);
    setError(null);

    try {
      // Create new transfer
      const result = await inventoryRequest<{ data: { id: string } }>('/warehouse/transfers', {
        method: 'POST',
        body: JSON.stringify({
          sourceLocationId,
          destinationLocationId,
          notes,
          lines: validLines.map(l => ({
            inventoryItemId: l.inventoryItemId,
            requestedQuantity: l.quantity
          })),
        }),
      });
      
      router.push(`/inventory/transfers/${result.data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-4">
        <Button variant="outline" size="icon" type="button" onClick={() => router.push('/inventory/transfers')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h2 className="text-2xl font-bold tracking-tight">Create Transfer</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Move stock between warehouse locations.
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
            <CardTitle>Transfer Details</CardTitle>
            <CardDescription>Select the source and destination for this transfer.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="source">Source Location <span className="text-destructive">*</span></Label>
                <Select value={sourceLocationId} onValueChange={(val) => {
                  setSourceLocationId(val || '');
                  // Reset lines when source changes
                  setLines([{ id: Math.random().toString(), inventoryItemId: '', quantity: '1' }]);
                }} disabled={isLoadingLocations}>
                  <SelectTrigger id="source">
                    <SelectValue placeholder={isLoadingLocations ? "Loading..." : "Select source location"}>
                      {sourceLocationId ? locations.find(l => l.id === sourceLocationId)?.name : undefined}
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
              </div>
              <div className="grid gap-2">
                <Label htmlFor="destination">Destination Location <span className="text-destructive">*</span></Label>
                <Select value={destinationLocationId} onValueChange={(val) => setDestinationLocationId(val || '')} disabled={isLoadingLocations}>
                  <SelectTrigger id="destination">
                    <SelectValue placeholder={isLoadingLocations ? "Loading..." : "Select destination location"}>
                      {destinationLocationId ? locations.find(l => l.id === destinationLocationId)?.name : undefined}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {locations.filter(l => l.id !== sourceLocationId).map((loc) => (
                      <SelectItem key={loc.id} value={loc.id}>
                        {loc.name} ({loc.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <div className="grid gap-2 pt-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea 
                id="notes" 
                value={notes} 
                onChange={(e) => setNotes(e.target.value)} 
                placeholder="Optional notes for this transfer" 
                rows={3}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>Line Items</CardTitle>
              <CardDescription className="mt-1">Select items currently available at the source location.</CardDescription>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={handleAddLine} disabled={!sourceLocationId || isLoadingStock}>
              <Plus className="mr-2 h-4 w-4" /> Add Line
            </Button>
          </CardHeader>
          <CardContent>
            {!sourceLocationId ? (
              <div className="text-center py-6 text-muted-foreground border border-dashed rounded-md">
                Please select a source location first to view available stock.
              </div>
            ) : (
              <div className="space-y-4">
                {lines.map((line, index) => {
                  const selectedStockItem = availableStock.find(s => s.inventoryItemId === line.inventoryItemId);
                  
                  return (
                    <div key={line.id} className="flex gap-4 items-start">
                      <div className="flex-1 grid gap-2">
                        {index === 0 && <Label>Item <span className="text-destructive">*</span></Label>}
                        <Select 
                          value={line.inventoryItemId} 
                          onValueChange={(val) => handleLineChange(line.id, 'inventoryItemId', val || '')}
                          disabled={isLoadingStock}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder={isLoadingStock ? "Loading stock..." : "Select item to transfer"}>
                              {line.inventoryItemId 
                                ? (availableStock.find(s => s.inventoryItemId === line.inventoryItemId)?.productTitle || 
                                   availableStock.find(s => s.inventoryItemId === line.inventoryItemId)?.sku || 
                                   'Selected Item')
                                : undefined}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            {availableStock.length === 0 ? (
                              <SelectItem value="empty" disabled>No stock available at source</SelectItem>
                            ) : (
                              availableStock.map((stock) => {
                                const displayName = stock.productTitle || stock.sku || stock.inventoryItemId;
                                return (
                                  <SelectItem key={stock.inventoryItemId} value={stock.inventoryItemId}>
                                    {displayName} 
                                    <span className="text-muted-foreground ml-2">
                                      (Available: {stock.availableToSell})
                                    </span>
                                  </SelectItem>
                                );
                              })
                            )}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="w-32 grid gap-2">
                        {index === 0 && <Label>Quantity <span className="text-destructive">*</span></Label>}
                        <Input 
                          type="number"
                          min="1"
                          max={selectedStockItem ? selectedStockItem.availableToSell : undefined}
                          value={line.quantity} 
                          onChange={(e) => handleLineChange(line.id, 'quantity', e.target.value)} 
                          required 
                          disabled={!line.inventoryItemId}
                        />
                      </div>
                      <div className={`pt-${index === 0 ? '7' : '0'}`}>
                        <Button 
                          type="button" 
                          variant="ghost" 
                          size="icon" 
                          onClick={() => handleRemoveLine(line.id)}
                          disabled={lines.length === 1}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            
            <div className="pt-8 flex justify-end">
              <Button type="submit" disabled={isSubmitting || !sourceLocationId || !destinationLocationId || lines.every(l => !l.inventoryItemId)}>
                <Save className="mr-2 h-4 w-4" />
                {isSubmitting ? 'Creating...' : 'Create Transfer'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
