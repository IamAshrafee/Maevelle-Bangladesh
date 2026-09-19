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
  Lock,
  AlertTriangle,
  Boxes,
  ArrowDownLeft,
  Building2,
  RefreshCw,
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
import { Textarea } from '@/components/ui/textarea';
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const CAPABILITY_GROUPS = [
  {
    group: 'Inventory & Storage',
    description: 'Physical storage and staging areas',
    icon: Boxes,
    items: [
      { code: 'STOCK_HOLDING', label: 'Stock Holding', desc: 'Can store physical inventory units' },
      {
        code: 'INTERNAL_STORAGE',
        label: 'Internal Storage',
        desc: 'Dedicated reserve / staging warehouse',
      },
    ],
  },
  {
    group: 'Inbound & Receiving',
    description: 'Inbound intake from vendors and returns',
    icon: ArrowDownLeft,
    items: [
      {
        code: 'PURCHASE_RECEIVING',
        label: 'Purchase Receiving',
        desc: 'Can receive purchase orders from suppliers',
      },
      {
        code: 'RETURN_RECEIVING',
        label: 'Return Receiving',
        desc: 'Can accept customer order returns',
      },
    ],
  },
  {
    group: 'Fulfillment & Outbound',
    description: 'Customer order picking, packing, and collection',
    icon: Building2,
    items: [
      {
        code: 'ORDER_FULFILLMENT',
        label: 'Order Fulfillment',
        desc: 'Can pick, pack and ship customer orders',
      },
      {
        code: 'CUSTOMER_PICKUP',
        label: 'Customer Pickup',
        desc: 'Supports in-store customer collection',
      },
    ],
  },
  {
    group: 'Inter-Warehouse Transfers',
    description: 'Movement between company facilities',
    icon: Truck,
    items: [
      {
        code: 'TRANSFER_SEND',
        label: 'Transfer Send',
        desc: 'Can dispatch inter-warehouse transfers',
      },
      {
        code: 'TRANSFER_RECEIVE',
        label: 'Transfer Receive',
        desc: 'Can receive transfers from other locations',
      },
    ],
  },
];

const ALL_CAPABILITIES = CAPABILITY_GROUPS.flatMap((g) => g.items);

export function LocationDetail({ locationId }: { locationId: string }) {
  const router = useRouter();
  const [location, setLocation] = useState<WarehouseLocationDetailDto | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [feedback, setFeedback] = useState<string>('');

  // Stock list state
  const [stock, setStock] = useState<
    (InventoryBalanceDto & {
      variantId: string;
      sku: string;
      productTitle: string;
      locationName: string;
    })[]
  >([]);
  const [stockLoading, setStockLoading] = useState(true);
  const [stockSearch, setStockSearch] = useState('');
  const [stockCondition, setStockCondition] = useState('all');
  const [stockPage, setStockPage] = useState(1);
  const [stockHasNext, setStockHasNext] = useState(false);

  // Edit Settings Dialog popup state
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [editName, setEditName] = useState('');
  const [editStatus, setEditStatus] = useState<'ACTIVE' | 'INACTIVE' | 'ARCHIVED'>('ACTIVE');
  const [editCapabilities, setEditCapabilities] = useState<string[]>([]);
  const [editFullAddress, setEditFullAddress] = useState('');
  const [editCity, setEditCity] = useState('');
  const [editPostalCode, setEditPostalCode] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [editError, setEditError] = useState<string>('');

  const resetEditForm = (loc: WarehouseLocationDetailDto) => {
    setEditName(loc.name);
    setEditStatus(loc.status as any);
    setEditCapabilities([...loc.capabilities]);
    const addr = (loc.address as any) || {};
    setEditFullAddress(addr.fullAddress || '');
    setEditCity(addr.city || '');
    setEditPostalCode(addr.postalCode || '');
    setEditError('');
  };

  const handleOpenEdit = () => {
    if (location) resetEditForm(location);
    setIsEditOpen(true);
  };

  const fetchLocation = async () => {
    try {
      const res = await inventoryRequest<{ data: WarehouseLocationDetailDto }>(
        `/warehouse/locations/${locationId}`,
      );
      setLocation(res.data);
      resetEditForm(res.data);
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
        data: PaginatedDto<
          InventoryBalanceDto & {
            variantId: string;
            sku: string;
            productTitle: string;
            locationName: string;
          }
        >;
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

  const currentAddressObj = (location?.address as any) || {};
  const isDirty =
    Boolean(location) &&
    (editName.trim() !== location!.name ||
      editStatus !== location!.status ||
      editFullAddress.trim() !== (currentAddressObj.fullAddress || '') ||
      editCity.trim() !== (currentAddressObj.city || '') ||
      editPostalCode.trim() !== (currentAddressObj.postalCode || '') ||
      editCapabilities.length !== location!.capabilities.length ||
      !editCapabilities.every((c) => location!.capabilities.includes(c)));

  const totalOnHandUnits = Number(location?.inventorySummary?.totalOnHand ?? '0');
  const totalReservedUnits = Number(location?.inventorySummary?.totalReserved ?? '0');
  const totalDamagedUnits = Number(location?.inventorySummary?.totalDamaged ?? '0');
  const hasActiveStockOrHolds =
    totalOnHandUnits > 0 || totalReservedUnits > 0 || totalDamagedUnits > 0;

  const handleToggleCapability = (capCode: string) => {
    setEditError('');
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

  const handleSelectStandardCapabilities = () => {
    setEditCapabilities([
      'STOCK_HOLDING',
      'PURCHASE_RECEIVING',
      'ORDER_FULFILLMENT',
      'TRANSFER_SEND',
      'TRANSFER_RECEIVE',
    ]);
    setEditError('');
  };

  const handleSelectAllCapabilities = () => {
    const allCodes = CAPABILITY_GROUPS.flatMap((g) => g.items.map((i) => i.code));
    setEditCapabilities(allCodes);
    setEditError('');
  };

  const handleSaveLocation = async () => {
    if (!location) return;

    const trimmedName = editName.trim();
    if (trimmedName.length < 2) {
      setEditError('Location name must be at least 2 characters long.');
      return;
    }
    if (editCapabilities.length === 0) {
      setEditError('A location must maintain at least one operational capability.');
      return;
    }
    if (editStatus !== 'ACTIVE' && hasActiveStockOrHolds) {
      setEditError(
        'Cannot deactivate or archive a location while it holds physical inventory or reserved stock.',
      );
      return;
    }

    setIsSaving(true);
    setEditError('');

    const currentAddr = (location.address as any) || {};
    const addressPayload = {
      ...currentAddr,
      fullAddress: editFullAddress.trim() || undefined,
      city: editCity.trim() || undefined,
      postalCode: editPostalCode.trim() || undefined,
      countryCode: currentAddr.countryCode || 'BD',
    };

    try {
      await inventoryRequest<{ data: WarehouseLocationDetailDto }>(
        `/warehouse/locations/${locationId}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            version: location.version,
            name: trimmedName,
            status: editStatus,
            capabilities: editCapabilities,
            address: addressPayload,
          }),
        },
      );

      setFeedback('Location settings, capabilities, and facility details updated successfully.');
      setIsEditOpen(false);
      await fetchLocation();
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
          <Button
            variant="outline"
            size="icon"
            onClick={() => router.push('/inventory/warehouses')}
          >
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
          <Button variant="outline" size="sm" onClick={handleOpenEdit}>
            <Settings className="mr-1.5 h-4 w-4" />
            Edit Location
          </Button>
          <Button
            size="sm"
            onClick={() => router.push(`/inventory/transfers/new?sourceLocationId=${locationId}`)}
          >
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
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Total On Hand
            </CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatInventoryNumber(location.inventorySummary?.totalOnHand ?? '0')}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              Physical stock units at facility
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Available to Sell
            </CardTitle>
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
            <CardTitle className="text-xs font-medium text-muted-foreground">
              Damaged / Hold
            </CardTitle>
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
            <InventoryPager page={stockPage} hasNext={stockHasNext} onPageChange={setStockPage} />
          )}
        </TabsContent>

        {/* Capabilities & Info Tab */}
        <TabsContent value="capabilities" className="mt-4 space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base font-semibold">
                  Active Operational Capabilities
                </CardTitle>
                <CardDescription>
                  Governs which inventory, purchasing, and fulfillment actions are permitted at this
                  location.
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
                        <Badge
                          variant={isEnabled ? 'default' : 'secondary'}
                          className="text-[10px]"
                        >
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
                  <span className="font-medium text-xs text-right capitalize">
                    {location.locationType.toLowerCase()}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 border-b pb-3">
                  <span className="text-muted-foreground text-xs">Operating Status</span>
                  <span className="font-medium text-xs text-right">{location.status}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 border-b pb-3">
                  <span className="text-muted-foreground text-xs">Concurrency Version</span>
                  <span className="font-mono text-xs text-right">{location.version}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 border-b pb-3">
                  <span className="text-muted-foreground text-xs">City / District</span>
                  <span className="font-medium text-xs text-right">
                    {(location.address as any)?.city || '—'}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2 border-b pb-3">
                  <span className="text-muted-foreground text-xs">Postal Code</span>
                  <span className="font-mono text-xs text-right">
                    {(location.address as any)?.postalCode || '—'}
                  </span>
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

      {/* Edit Location Dialog (Popup) */}
      <Dialog
        open={isEditOpen}
        onOpenChange={(open) => {
          if (!open && location) resetEditForm(location);
          setIsEditOpen(open);
        }}
      >
        <DialogContent className="sm:max-w-2xl max-h-[88vh] flex flex-col p-0 gap-0 overflow-hidden">
          <DialogHeader className="p-5 border-b bg-muted/20">
            <div className="flex flex-wrap items-center gap-2 pr-6">
              <Building2 className="h-5 w-5 text-primary shrink-0" />
              <DialogTitle className="text-lg font-semibold">Edit Location Settings</DialogTitle>
              <Badge variant="outline" className="font-mono text-xs">
                {location.code}
              </Badge>
              <Badge variant="secondary" className="text-xs capitalize">
                {location.locationType.toLowerCase()}
              </Badge>
              <Badge
                variant="outline"
                className="text-[11px] font-mono text-muted-foreground ml-auto"
              >
                v{location.version}
              </Badge>
            </div>
            <DialogDescription className="text-xs text-muted-foreground">
              Configure operational status, workflow capabilities, and facility address for{' '}
              {location.name}.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            {editError && (
              <div className="p-3 bg-destructive/10 border border-destructive/20 text-destructive rounded-lg text-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  <span>{editError}</span>
                </div>
                {(editError.toLowerCase().includes('reload') ||
                  editError.toLowerCase().includes('version')) && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs shrink-0 self-start sm:self-auto"
                    onClick={async () => {
                      await fetchLocation();
                      setEditError('');
                    }}
                  >
                    <RefreshCw className="mr-1.5 h-3 w-3" />
                    Reload Latest Data
                  </Button>
                )}
              </div>
            )}

            {hasActiveStockOrHolds && (
              <div className="p-3 bg-amber-500/10 border border-amber-500/20 text-amber-800 dark:text-amber-300 rounded-lg text-xs flex items-start gap-2.5">
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
                <div className="space-y-0.5">
                  <span className="font-semibold">Stock Invariant Guard:</span>
                  <p className="text-[11px] text-muted-foreground">
                    This location currently holds{' '}
                    <span className="font-medium text-foreground">
                      {formatInventoryNumber(location.inventorySummary?.totalOnHand ?? '0')}
                    </span>{' '}
                    physical units on hand and{' '}
                    <span className="font-medium text-foreground">
                      {formatInventoryNumber(location.inventorySummary?.totalReserved ?? '0')}
                    </span>{' '}
                    reserved units. It cannot be set to INACTIVE or ARCHIVED until all inventory
                    balances are transferred or cleared.
                  </p>
                </div>
              </div>
            )}

            {/* General Information */}
            <div className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                General Settings
              </h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="loc-name" className="text-xs font-medium">
                    Location Name <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="loc-name"
                    value={editName}
                    onChange={(e) => {
                      setEditName(e.target.value);
                      if (editError) setEditError('');
                    }}
                    placeholder="e.g. Dhaka Central Fulfillment"
                    className="h-9 text-xs"
                  />
                  {editName.trim().length > 0 && editName.trim().length < 2 && (
                    <p className="text-[11px] text-destructive">
                      Location name must be at least 2 characters.
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="loc-status" className="text-xs font-medium">
                      Operating Status
                    </Label>
                    {hasActiveStockOrHolds && (
                      <span className="text-[10px] text-amber-600 font-medium flex items-center gap-1">
                        <Lock className="h-3 w-3" /> Locked to ACTIVE
                      </span>
                    )}
                  </div>
                  <Select
                    value={editStatus}
                    onValueChange={(v) => {
                      setEditStatus((v || 'ACTIVE') as any);
                      if (editError) setEditError('');
                    }}
                  >
                    <SelectTrigger id="loc-status" className="h-9 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ACTIVE">ACTIVE (Operational)</SelectItem>
                      <SelectItem value="INACTIVE" disabled={hasActiveStockOrHolds}>
                        INACTIVE (Temporarily Closed)
                        {hasActiveStockOrHolds ? ' — Blocked: Holds stock' : ''}
                      </SelectItem>
                      <SelectItem value="ARCHIVED" disabled={hasActiveStockOrHolds}>
                        ARCHIVED (Decommissioned)
                        {hasActiveStockOrHolds ? ' — Blocked: Holds stock' : ''}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Address & Facility Information */}
            <div className="space-y-3 pt-2 border-t">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Facility Address & Location Details
              </h3>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="loc-address" className="text-xs font-medium">
                    Street Address
                  </Label>
                  <Textarea
                    id="loc-address"
                    value={editFullAddress}
                    onChange={(e) => setEditFullAddress(e.target.value)}
                    placeholder="e.g. Plot 14, Sector 7, Uttara Commercial Area"
                    rows={2}
                    className="text-xs min-h-[60px]"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="loc-city" className="text-xs font-medium">
                      City / District
                    </Label>
                    <Input
                      id="loc-city"
                      value={editCity}
                      onChange={(e) => setEditCity(e.target.value)}
                      placeholder="e.g. Dhaka"
                      className="h-9 text-xs"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="loc-postal" className="text-xs font-medium">
                      Postal Code
                    </Label>
                    <Input
                      id="loc-postal"
                      value={editPostalCode}
                      onChange={(e) => setEditPostalCode(e.target.value)}
                      placeholder="e.g. 1230"
                      className="h-9 text-xs font-mono"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Capabilities */}
            <div className="space-y-3 pt-2 border-t">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Operational Capabilities
                    </h3>
                    <Badge variant="outline" className="text-[11px] font-mono">
                      {editCapabilities.length} selected
                    </Badge>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Governs permissible stock, fulfillment, and movement workflows at this facility.
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-[11px] px-2"
                    onClick={handleSelectStandardCapabilities}
                  >
                    Standard Set
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 text-[11px] px-2"
                    onClick={handleSelectAllCapabilities}
                  >
                    Select All
                  </Button>
                </div>
              </div>

              <div className="space-y-3">
                {CAPABILITY_GROUPS.map((group) => {
                  const GroupIcon = group.icon;
                  return (
                    <div key={group.group} className="rounded-lg border bg-card p-3 space-y-2">
                      <div className="flex items-center gap-2 pb-1 border-b">
                        <GroupIcon className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-xs font-medium">{group.group}</span>
                        <span className="text-[11px] text-muted-foreground hidden sm:inline">
                          — {group.description}
                        </span>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {group.items.map((cap) => {
                          const isChecked = editCapabilities.includes(cap.code);
                          const isOnlySelected = isChecked && editCapabilities.length === 1;
                          return (
                            <button
                              type="button"
                              key={cap.code}
                              onClick={() => handleToggleCapability(cap.code)}
                              disabled={isOnlySelected}
                              className={`w-full text-left p-2.5 rounded-md border text-xs flex items-start justify-between gap-2 transition-colors ${
                                isChecked
                                  ? 'border-primary/50 bg-primary/5 text-foreground ring-1 ring-primary/20'
                                  : 'border-border/60 bg-background hover:bg-muted/50 text-muted-foreground'
                              } ${isOnlySelected ? 'opacity-90 cursor-not-allowed' : 'cursor-pointer'}`}
                            >
                              <div className="min-w-0 pr-1">
                                <div className="font-medium flex items-center gap-1.5">
                                  <span>{cap.label}</span>
                                  {isOnlySelected && (
                                    <Badge
                                      variant="outline"
                                      className="text-[9px] px-1 py-0 h-4 border-amber-400 text-amber-700 dark:text-amber-300 bg-amber-500/10"
                                    >
                                      Required
                                    </Badge>
                                  )}
                                </div>
                                <div className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">
                                  {cap.desc}
                                </div>
                              </div>
                              <div
                                className={`h-4 w-4 rounded-sm border flex items-center justify-center shrink-0 mt-0.5 ${
                                  isChecked
                                    ? 'bg-primary text-primary-foreground border-primary'
                                    : 'border-muted-foreground/40'
                                }`}
                              >
                                {isChecked && <Check className="h-3 w-3" />}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <DialogFooter className="border-t bg-muted/40 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="flex items-center gap-2">
              {isDirty ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => location && resetEditForm(location)}
                  className="text-xs h-8 text-muted-foreground hover:text-foreground"
                >
                  <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                  Reset Changes
                </Button>
              ) : (
                <span className="text-[11px] text-muted-foreground px-2">No unsaved changes</span>
              )}
            </div>

            <div className="flex items-center gap-2 justify-end">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  if (location) resetEditForm(location);
                  setIsEditOpen(false);
                }}
                disabled={isSaving}
                className="text-xs h-8"
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleSaveLocation}
                disabled={
                  isSaving ||
                  !editName.trim() ||
                  editName.trim().length < 2 ||
                  editCapabilities.length === 0 ||
                  !isDirty ||
                  (editStatus !== 'ACTIVE' && hasActiveStockOrHolds)
                }
                className="text-xs h-8"
              >
                {isSaving ? (
                  <>
                    <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    Saving…
                  </>
                ) : (
                  'Save Changes'
                )}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
