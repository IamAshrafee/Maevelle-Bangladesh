'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  MapPin,
  Package,
  Settings,
  Truck,
  CheckCircle2,
  Clock,
  ShieldAlert,
  Search,
  Check,
  RotateCcw,
} from 'lucide-react';
import Link from 'next/link';

import type {
  WarehouseLocationDetailDto,
  InventoryBalanceDto,
  PaginatedDto,
} from '@maevelle/contracts';

import { inventoryRequest, formatInventoryNumber } from '@/lib/inventory/api';
import { InventoryEmptyState, InventoryFeedback, InventoryPager } from './inventory-page-ui';
import { StockTable } from './stock-table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

const ALL_CAPABILITIES = [
  { code: 'STOCK_HOLDING', label: 'Stock Holding', desc: 'Can store physical inventory' },
  { code: 'PURCHASE_RECEIVING', label: 'Purchase Receiving', desc: 'Can receive purchase orders from suppliers' },
  { code: 'TRANSFER_SEND', label: 'Transfer Send', desc: 'Can dispatch inter-warehouse transfers' },
  { code: 'TRANSFER_RECEIVE', label: 'Transfer Receive', desc: 'Can receive transfers from other locations' },
  { code: 'ORDER_FULFILLMENT', label: 'Order Fulfillment', desc: 'Can pick, pack and ship customer orders' },
  { code: 'RETURN_RECEIVING', label: 'Return Receiving', desc: 'Can accept customer order returns' },
  { code: 'CUSTOMER_PICKUP', label: 'Customer Pickup', desc: 'Supports in-store customer collection' },
  { code: 'INTERNAL_STORAGE', label: 'Internal Storage', desc: 'Dedicated reserve / staging warehouse' },
];

export function LocationDetail({ locationId }: { locationId: string }) {
  const router = useRouter();
  const [location, setLocation] = useState<WarehouseLocationDetailDto | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [feedback, setFeedback] = useState<string>('');

  // Stock list state
  const [stock, setStock] = useState<(InventoryBalanceDto & { variantId: string; sku: string; productTitle: string; locationName: string })[]>([]);
  const [stockLoading, setStockLoading] = useState(true);
  const [stockSearch, setStockSearch] = useState('');
  const [stockCondition, setStockCondition] = useState('all');
  const [stockPage, setStockPage] = useState(1);
  const [stockHasNext, setStockHasNext] = useState(false);

  // Edit Settings Sheet state
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editStatus, setEditStatus] = useState<'ACTIVE' | 'INACTIVE' | 'ARCHIVED'>('ACTIVE');
  const [editCapabilities, setEditCapabilities] = useState<string[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [editError, setEditError] = useState<string>('');

  const fetchLocation = async () => {
    try {
      const res = await inventoryRequest<{ data: WarehouseLocationDetailDto }>(
        `/warehouse/locations/${locationId}`,
      );
      setLocation(res.data);
      setEditName(res.data.name);
      setEditStatus(res.data.status as any);
      setEditCapabilities([...res.data.capabilities]);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
    }
  };

  const fetchStock = async () => {
    setStockLoading(true);
    const params = new URLSearchParams();
    params.set('locationId', locationId);
    params.set('page', stockPage.toString());
    params.set('limit', '25');
    if (stockSearch) params.set('search', stockSearch);
    if (stockCondition !== 'all') params.set('condition', stockCondition);

    try {
      const res = await inventoryRequest<{
        data: PaginatedDto<InventoryBalanceDto & { variantId: string; sku: string; productTitle: string; locationName: string }>;
      }>(`/inventory/stock?${params.toString()}`);
      setStock(res.data.items as any);
      setStockHasNext(res.data.items.length === 25);
    } catch (err) {
      console.error(err);
    } finally {
      setStockLoading(false);
    }
  };

  useEffect(() => {
    fetchLocation();
  }, [locationId]);

  useEffect(() => {
    fetchStock();
  }, [locationId, stockPage, stockCondition]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setStockPage(1);
    fetchStock();
  };

  const handleToggleCapability = (capCode: string) => {
    if (editCapabilities.includes(capCode)) {
      if (editCapabilities.length === 1) {
        setEditError('A location must maintain at least one operational capability.');
        return;
      }
      setEditCapabilities(editCapabilities.filter((c) => c !== capCode));
    } else {
      setEditCapabilities([...editCapabilities, capCode]);
    }
  };

  const handleSaveLocation = async () => {
    if (!location) return;
    setIsSaving(true);
    setEditError('');

    try {
      const res = await inventoryRequest<{ data: WarehouseLocationDetailDto }>(
        `/warehouse/locations/${locationId}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            version: location.version,
            name: editName.trim(),
            status: editStatus,
            capabilities: editCapabilities,
          }),
        },
      );

      setFeedback('Location settings and capabilities updated successfully.');
      setIsEditOpen(false);
      fetchLocation();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-12 w-1/3 animate-pulse bg-muted rounded-md" />
        <div className="grid gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 w-full animate-pulse bg-muted rounded-md" />
          ))}
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
      {/* Top Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon" onClick={() => router.push('/inventory/warehouses')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-muted-foreground" />
              <h1 className="text-2xl font-bold tracking-tight">{location.name}</h1>
              <Badge variant={location.status === 'ACTIVE' ? 'default' : 'secondary'}>
                {location.status}
              </Badge>
              <Badge variant="outline" className="font-mono text-xs">
                {location.code}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 capitalize">
              Type: {location.locationType.toLowerCase()} • Version {location.version}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setIsEditOpen(true)}>
            <Settings className="mr-1.5 h-4 w-4" />
            Edit Location
          </Button>
          <Button size="sm" onClick={() => router.push(`/inventory/transfers/new?sourceLocationId=${locationId}`)}>
            <Truck className="mr-1.5 h-4 w-4" />
            Transfer Stock
          </Button>
        </div>
      </div>

      {feedback && <InventoryFeedback message={feedback} />}

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Total On Hand</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatInventoryNumber(location.inventorySummary?.totalOnHand ?? '0')}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">Physical stock units at facility</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Available to Sell</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">
              {formatInventoryNumber(location.inventorySummary?.totalAvailable ?? '0')}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">Ready for allocation</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Reserved</CardTitle>
            <Clock className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">
              {formatInventoryNumber(location.inventorySummary?.totalReserved ?? '0')}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">Held for orders & transfers</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">Damaged / Hold</CardTitle>
            <ShieldAlert className="h-4 w-4 text-rose-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-rose-600">
              {formatInventoryNumber(location.inventorySummary?.totalDamaged ?? '0')}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">Non-sellable condition</p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="stock">
        <TabsList>
          <TabsTrigger value="stock">Current Stock Balances</TabsTrigger>
          <TabsTrigger value="capabilities">Capabilities & Facility Info</TabsTrigger>
        </TabsList>

        {/* Live Stock Tab */}
        <TabsContent value="stock" className="mt-4 space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between bg-card p-3 rounded-lg border">
            <form onSubmit={handleSearchSubmit} className="flex items-center gap-2 flex-1 max-w-sm">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="Filter stock by SKU or title…"
                  className="pl-8 text-xs h-9"
                  value={stockSearch}
                  onChange={(e) => setStockSearch(e.target.value)}
                />
              </div>
              <Button type="submit" variant="secondary" size="sm" className="h-9 text-xs">
                Search
              </Button>
            </form>

            <div className="flex items-center gap-2">
              <Select
                value={stockCondition}
                onValueChange={(v) => {
                  setStockCondition(v || 'all');
                  setStockPage(1);
                }}
              >
                <SelectTrigger className="w-[150px] text-xs h-9">
                  <SelectValue placeholder="Condition" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Conditions</SelectItem>
                  <SelectItem value="SELLABLE">Sellable</SelectItem>
                  <SelectItem value="DAMAGED">Damaged</SelectItem>
                  <SelectItem value="QUARANTINE">Quarantine</SelectItem>
                  <SelectItem value="INSPECTION">Inspection</SelectItem>
                </SelectContent>
              </Select>

              {(stockSearch || stockCondition !== 'all') && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setStockSearch('');
                    setStockCondition('all');
                    setStockPage(1);
                  }}
                  className="text-xs h-9"
                >
                  <RotateCcw className="mr-1 h-3.5 w-3.5" />
                  Reset
                </Button>
              )}
            </div>
          </div>

          <Card>
            <CardContent className="p-0">
              <StockTable balances={stock} isLoading={stockLoading} hideLocation={true} />
            </CardContent>
          </Card>

          {(stockHasNext || stockPage > 1) && (
            <InventoryPager
              page={stockPage}
              hasNext={stockHasNext}
              onPageChange={setStockPage}
            />
          )}
        </TabsContent>

        {/* Capabilities & Info Tab */}
        <TabsContent value="capabilities" className="mt-4 space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-semibold">Active Operational Capabilities</CardTitle>
                <CardDescription>
                  Governs which inventory, purchasing, and fulfillment actions are permitted at this location.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {ALL_CAPABILITIES.map((cap) => {
                    const isEnabled = location.capabilities.includes(cap.code);
                    return (
                      <div
                        key={cap.code}
                        className={`flex items-start justify-between p-3 rounded-lg border transition-colors ${
                          isEnabled ? 'bg-primary/5 border-primary/20' : 'bg-muted/20 opacity-60'
                        }`}
                      >
                        <div>
                          <div className="font-medium text-sm flex items-center gap-1.5">
                            {isEnabled && <Check className="h-4 w-4 text-primary shrink-0" />}
                            {cap.label}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">{cap.desc}</p>
                        </div>
                        <Badge variant={isEnabled ? 'default' : 'secondary'} className="text-[10px]">
                          {isEnabled ? 'Enabled' : 'Disabled'}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base font-semibold">Location Details</CardTitle>
                <CardDescription>System metadata and addressing info</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <div className="grid grid-cols-2 gap-2 border-b pb-3">
                  <span className="text-muted-foreground text-xs">Facility Code</span>
                  <span className="font-mono font-medium text-xs text-right">{location.code}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 border-b pb-3">
                  <span className="text-muted-foreground text-xs">Facility Type</span>
                  <span className="font-medium text-xs text-right capitalize">{location.locationType.toLowerCase()}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 border-b pb-3">
                  <span className="text-muted-foreground text-xs">Operating Status</span>
                  <span className="font-medium text-xs text-right">{location.status}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 border-b pb-3">
                  <span className="text-muted-foreground text-xs">Concurrency Version</span>
                  <span className="font-mono text-xs text-right">{location.version}</span>
                </div>
                <div>
                  <span className="text-muted-foreground text-xs block mb-1">Physical Address</span>
                  <p className="text-xs bg-muted/40 p-2.5 rounded-md border font-mono">
                    {(location.address as any)?.fullAddress || 'No physical address recorded.'}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Edit Location Sheet */}
      <Sheet open={isEditOpen} onOpenChange={setIsEditOpen}>
        <SheetContent className="sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Edit Location Settings</SheetTitle>
            <SheetDescription>
              Update name, operational status, and workflow capabilities for {location.name}.
            </SheetDescription>
          </SheetHeader>

          {editError && (
            <div className="p-3 bg-destructive/10 text-destructive rounded-md text-xs mt-3">
              {editError}
            </div>
          )}

          <div className="space-y-4 py-4">
            <div className="space-y-1.5">
              <Label htmlFor="loc-name">Location Name</Label>
              <Input
                id="loc-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Warehouse name"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="loc-status">Operational Status</Label>
              <Select
                value={editStatus}
                onValueChange={(v) => setEditStatus((v || 'ACTIVE') as any)}
              >
                <SelectTrigger id="loc-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ACTIVE">ACTIVE (Operational)</SelectItem>
                  <SelectItem value="INACTIVE">INACTIVE (Temporarily Closed)</SelectItem>
                  <SelectItem value="ARCHIVED">ARCHIVED (Decommissioned)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 pt-2">
              <Label>Capabilities ({editCapabilities.length} selected)</Label>
              <p className="text-xs text-muted-foreground mb-2">
                Enable only capabilities supported by this physical site.
              </p>
              <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                {ALL_CAPABILITIES.map((cap) => {
                  const isChecked = editCapabilities.includes(cap.code);
                  return (
                    <button
                      type="button"
                      key={cap.code}
                      onClick={() => handleToggleCapability(cap.code)}
                      className={`w-full text-left p-2.5 rounded-lg border text-xs flex items-start justify-between transition-colors ${
                        isChecked
                          ? 'border-primary bg-primary/10 text-foreground'
                          : 'border-border bg-background hover:bg-muted text-muted-foreground'
                      }`}
                    >
                      <div className="pr-2">
                        <div className="font-semibold">{cap.label}</div>
                        <div className="text-[11px] text-muted-foreground mt-0.5">{cap.desc}</div>
                      </div>
                      <div
                        className={`h-4 w-4 rounded-sm border flex items-center justify-center shrink-0 mt-0.5 ${
                          isChecked ? 'bg-primary text-primary-foreground border-primary' : 'border-muted-foreground/40'
                        }`}
                      >
                        {isChecked && <Check className="h-3 w-3" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <SheetFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setIsEditOpen(false)} disabled={isSaving}>
              Cancel
            </Button>
            <Button onClick={handleSaveLocation} disabled={isSaving || !editName.trim()}>
              {isSaving ? 'Saving…' : 'Save Changes'}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
