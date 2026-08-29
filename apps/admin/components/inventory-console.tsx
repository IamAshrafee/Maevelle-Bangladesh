'use client';

import { type FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';

import type {
  ApiEnvelope,
  CatalogVariantChoiceDto,
  InventoryBalanceDto,
  InventoryHistoryDto,
  WarehouseLocationDto,
} from '@maevelle/contracts';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

type WarehouseTransfer = {
  id: string;
  transferNumber: string;
  status: string;
  version: number;
  lines: readonly {
    id: string;
    requestedQuantity: string;
    dispatchedQuantity: string;
    receivedQuantity: string;
  }[];
};

type StocktakeWorkspace = {
  id: string;
  status: string;
  version: number;
  lines: readonly {
    inventoryItemId: string;
    expectedQuantity: string;
    countedQuantity: string | null;
  }[];
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    credentials: 'include',
    ...init,
    headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!response.ok) throw new Error('The inventory operation could not be completed.');
  return response.json() as Promise<T>;
}

export function InventoryConsole({
  section = 'stock',
}: {
  section?: 'stock' | 'warehouses' | 'transfers' | 'stocktakes' | 'history';
}) {
  const [locations, setLocations] = useState<readonly WarehouseLocationDto[]>([]);
  const [variants, setVariants] = useState<readonly CatalogVariantChoiceDto[]>([]);
  const [balances, setBalances] = useState<readonly InventoryBalanceDto[]>([]);
  const [transfers, setTransfers] = useState<readonly WarehouseTransfer[]>([]);
  const [history, setHistory] = useState<readonly InventoryHistoryDto[]>([]);
  const [message, setMessage] = useState('');
  const [locationId, setLocationId] = useState('');
  const [stocktakeId, setStocktakeId] = useState('');
  const [stocktakeWorkspace, setStocktakeWorkspace] = useState<StocktakeWorkspace>();
  const reload = async () => {
    try {
      const [locationResult, variantResult, stockResult, transferResult, historyResult] =
        await Promise.all([
          request<ApiEnvelope<readonly WarehouseLocationDto[]>>('/admin/warehouse/locations'),
          request<ApiEnvelope<readonly CatalogVariantChoiceDto[]>>('/admin/catalog/variants'),
          request<ApiEnvelope<readonly InventoryBalanceDto[]>>('/admin/inventory/stock'),
          section === 'transfers'
            ? request<ApiEnvelope<readonly WarehouseTransfer[]>>('/admin/warehouse/transfers')
            : Promise.resolve(undefined),
          section === 'history'
            ? request<ApiEnvelope<readonly InventoryHistoryDto[]>>('/admin/inventory/history')
            : Promise.resolve(undefined),
        ]);
      setLocations(locationResult.data);
      setVariants(variantResult.data);
      setBalances(stockResult.data);
      setTransfers(transferResult?.data ?? []);
      setHistory(historyResult?.data ?? []);
      setLocationId((value) => value || locationResult.data[0]?.id || '');
    } catch {
      window.location.assign('/admin/login');
    }
  };
  useEffect(() => {
    void reload();
  }, []);
  async function createLocation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await request('/admin/warehouse/locations', {
        method: 'POST',
        body: JSON.stringify({
          code: form.get('code'),
          name: form.get('name'),
          locationType: form.get('locationType'),
          capabilities: ['STOCK_HOLDING', 'TRANSFER_SEND', 'TRANSFER_RECEIVE'],
        }),
      });
      event.currentTarget.reset();
      setMessage('Location created.');
      await reload();
    } catch {
      setMessage('Location could not be created.');
    }
  }
  async function adjust(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await request('/admin/inventory/adjustments', {
        method: 'POST',
        headers: { 'idempotency-key': crypto.randomUUID() },
        body: JSON.stringify({
          variantId: form.get('variantId'),
          locationId,
          condition: form.get('condition'),
          quantityDelta: form.get('quantityDelta'),
          reasonCode: form.get('reasonCode'),
          note: form.get('note') || undefined,
        }),
      });
      event.currentTarget.reset();
      setMessage('Inventory adjustment posted to the immutable ledger.');
      await reload();
    } catch {
      setMessage(
        'Adjustment was rejected. Check the variant, location, quantity, and current availability.',
      );
    }
  }
  async function moveCondition(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await request('/admin/inventory/condition-movements', {
        method: 'POST',
        headers: { 'idempotency-key': crypto.randomUUID() },
        body: JSON.stringify({
          variantId: form.get('variantId'),
          locationId,
          fromCondition: form.get('fromCondition'),
          toCondition: form.get('toCondition'),
          quantity: form.get('quantity'),
          reason: form.get('reason') || undefined,
        }),
      });
      event.currentTarget.reset();
      setMessage('Condition movement posted to the immutable ledger.');
      await reload();
    } catch {
      setMessage(
        'Condition movement was rejected. Verify current sellable stock and the chosen conditions.',
      );
    }
  }
  async function createTransfer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const result = await request<ApiEnvelope<{ transferId: string }>>(
        '/admin/warehouse/transfers',
        {
          method: 'POST',
          body: JSON.stringify({
            sourceLocationId: form.get('sourceLocationId'),
            destinationLocationId: form.get('destinationLocationId'),
            lines: [{ variantId: form.get('variantId'), quantity: form.get('quantity') }],
            notes: form.get('notes') || undefined,
          }),
        },
      );
      event.currentTarget.reset();
      setMessage(`Transfer ${result.data.transferId} was created as a Draft.`);
      await reload();
    } catch {
      setMessage('Transfer could not be created. Check the locations, variant, and quantity.');
    }
  }
  async function progressTransfer(transfer: WarehouseTransfer) {
    try {
      if (transfer.status === 'DRAFT') {
        await request(`/admin/warehouse/transfers/${transfer.id}/approve`, {
          method: 'POST',
          body: JSON.stringify({ version: transfer.version }),
        });
      } else if (transfer.status === 'READY') {
        await request(`/admin/warehouse/transfers/${transfer.id}/dispatch`, {
          method: 'POST',
          headers: { 'idempotency-key': crypto.randomUUID() },
        });
      } else if (transfer.status === 'IN_TRANSIT' || transfer.status === 'PARTIALLY_RECEIVED') {
        await request(`/admin/warehouse/transfers/${transfer.id}/receive`, {
          method: 'POST',
          headers: { 'idempotency-key': crypto.randomUUID() },
          body: JSON.stringify({
            lines: transfer.lines
              .filter((line) => Number(line.dispatchedQuantity) > Number(line.receivedQuantity))
              .map((line) => ({
                transferLineId: line.id,
                sellableQuantity: String(
                  Number(line.dispatchedQuantity) - Number(line.receivedQuantity),
                ),
              })),
          }),
        });
      } else return;
      setMessage('Transfer progressed and its movement was posted safely.');
      await reload();
    } catch {
      setMessage(
        'Transfer could not progress. Refresh and verify its current state and availability.',
      );
    }
  }
  async function cancelTransfer(transfer: WarehouseTransfer) {
    try {
      await request(`/admin/warehouse/transfers/${transfer.id}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ version: transfer.version }),
      });
      setMessage(
        'Draft Transfer cancelled. Dispatched Transfers cannot be cancelled because stock must not teleport.',
      );
      await reload();
    } catch {
      setMessage('Transfer could not be cancelled because it is no longer the current Draft.');
    }
  }
  async function beginStocktake() {
    if (!locationId) return;
    try {
      const result = await request<ApiEnvelope<{ stocktakeId: string }>>(
        '/admin/inventory/stocktakes',
        {
          method: 'POST',
          body: JSON.stringify({ locationId }),
        },
      );
      setStocktakeId(result.data.stocktakeId);
      const workspace = await request<ApiEnvelope<StocktakeWorkspace>>(
        `/admin/inventory/stocktakes/${result.data.stocktakeId}`,
      );
      setStocktakeWorkspace(workspace.data);
      setMessage(`Stocktake ${result.data.stocktakeId} is ready for counting.`);
    } catch {
      setMessage('Stocktake could not be started for this Location.');
    }
  }
  async function loadStocktake(currentStocktakeId = stocktakeId) {
    const workspace = await request<ApiEnvelope<StocktakeWorkspace>>(
      `/admin/inventory/stocktakes/${currentStocktakeId}`,
    );
    setStocktakeWorkspace(workspace.data);
    return workspace.data;
  }
  async function countStocktakeLine(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const currentStocktakeId = String(form.get('stocktakeId') || stocktakeId);
    try {
      const workspace = await loadStocktake(currentStocktakeId);
      const inventoryItemId = String(form.get('inventoryItemId'));
      if (!workspace.lines.some((line) => line.inventoryItemId === inventoryItemId))
        throw new Error('Unknown stocktake line.');
      await request(
        `/admin/inventory/stocktakes/${currentStocktakeId}/lines/${inventoryItemId}/count`,
        {
          method: 'POST',
          body: JSON.stringify({
            countedQuantity: form.get('countedQuantity'),
            version: workspace.version,
          }),
        },
      );
      setStocktakeId(currentStocktakeId);
      await loadStocktake(currentStocktakeId);
      setMessage('Count saved. The comparison below now reflects the current stocktake snapshot.');
    } catch {
      setMessage(
        'Count could not be saved. Refresh first, then verify the Stocktake and Inventory Item IDs.',
      );
    }
  }
  async function postStocktake() {
    if (!stocktakeId) return;
    try {
      await request(`/admin/inventory/stocktakes/${stocktakeId}/post`, {
        method: 'POST',
        headers: { 'idempotency-key': crypto.randomUUID() },
      });
      setMessage('Stocktake posted. Its resulting adjustment is in immutable movement history.');
      await loadStocktake();
    } catch {
      setMessage('Stocktake could not be posted. Every snapshot line must be counted first.');
    }
  }
  return (
    <main>
      <div className="mx-auto grid max-w-7xl gap-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-muted-foreground">Maevelle / Inventory</p>
            <h1 className="text-3xl font-semibold tracking-tight">
              {section === 'warehouses'
                ? 'Locations'
                : section === 'history'
                  ? 'Movement history'
                  : section === 'transfers'
                    ? 'Transfers'
                    : section === 'stocktakes'
                      ? 'Stocktakes'
                      : 'Stock overview'}
            </h1>
          </div>
          <nav className="flex flex-wrap gap-2">
            <Link className="inline-flex h-9 items-center rounded-md border px-3 text-sm" href="/">
              Catalog
            </Link>
            <Link
              className="inline-flex h-9 items-center rounded-md border px-3 text-sm"
              href="/inventory/stock"
            >
              Stock
            </Link>
            <Link
              className="inline-flex h-9 items-center rounded-md border px-3 text-sm"
              href="/inventory/warehouses"
            >
              Warehouses
            </Link>
            <Link
              className="inline-flex h-9 items-center rounded-md border px-3 text-sm"
              href="/inventory/history"
            >
              History
            </Link>
            <Link
              className="inline-flex h-9 items-center rounded-md border px-3 text-sm"
              href="/inventory/transfers"
            >
              Transfers
            </Link>
            <Link
              className="inline-flex h-9 items-center rounded-md border px-3 text-sm"
              href="/inventory/stocktakes"
            >
              Stocktakes
            </Link>
            <Button onClick={() => void reload()}>Refresh</Button>
          </nav>
        </header>
        {message ? (
          <p role="status" className="rounded-md bg-secondary px-3 py-2 text-sm">
            {message}
          </p>
        ) : null}
        {section === 'warehouses' ? (
          <Card>
            <CardHeader>
              <CardTitle>Create operational Location</CardTitle>
              <CardDescription>
                Locations are lifecycle-managed; stock and history can never be deleted with them.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form className="grid gap-3 md:grid-cols-3" onSubmit={createLocation}>
                <div>
                  <Label htmlFor="location-code">Code</Label>
                  <Input id="location-code" name="code" placeholder="DHK-MAIN" required />
                </div>
                <div>
                  <Label htmlFor="location-name">Name</Label>
                  <Input id="location-name" name="name" placeholder="Main Warehouse" required />
                </div>
                <div>
                  <Label htmlFor="location-type">Type</Label>
                  <Input id="location-type" name="locationType" defaultValue="WAREHOUSE" required />
                </div>
                <Button className="md:col-span-3" type="submit">
                  Create Location
                </Button>
              </form>
            </CardContent>
          </Card>
        ) : null}
        {section === 'stock' ? (
          <>
            <Card>
              <CardHeader>
                <CardTitle>Controlled adjustment</CardTitle>
                <CardDescription>
                  Enter a delta, never a replacement balance. Negative SELLABLE adjustments cannot
                  exceed Available To Sell.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form className="grid gap-3 md:grid-cols-5" onSubmit={adjust}>
                  <div>
                    <Label htmlFor="variant">Product variant</Label>
                    <Select name="variantId" required>
                      <SelectTrigger id="variant">
                        <SelectValue placeholder="Choose product and SKU" />
                      </SelectTrigger>
                      <SelectContent>
                        {variants.map((variant) => (
                          <SelectItem key={variant.id} value={variant.id}>
                            {variant.productTitle} · {variant.sku}
                            {variant.optionSummary ? ` · ${variant.optionSummary}` : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Location</Label>
                    <Select
                      value={locationId}
                      onValueChange={(value) => setLocationId(value ?? '')}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Choose Location" />
                      </SelectTrigger>
                      <SelectContent>
                        {locations.map((location) => (
                          <SelectItem key={location.id} value={location.id}>
                            {location.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="condition">Condition</Label>
                    <Input id="condition" name="condition" defaultValue="SELLABLE" required />
                  </div>
                  <div>
                    <Label htmlFor="quantity">Delta</Label>
                    <Input id="quantity" name="quantityDelta" placeholder="10 or -2" required />
                  </div>
                  <div>
                    <Label htmlFor="reason">Reason</Label>
                    <Input id="reason" name="reasonCode" defaultValue="OPENING_BALANCE" required />
                  </div>
                  <div className="md:col-span-5">
                    <Label htmlFor="note">Note</Label>
                    <Input id="note" name="note" />
                  </div>
                  <Button className="md:col-span-5" type="submit" disabled={!locationId}>
                    Post adjustment
                  </Button>
                </form>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Condition movement</CardTitle>
                <CardDescription>
                  Move physical stock between conditions without changing total On Hand.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form className="grid gap-3 md:grid-cols-5" onSubmit={moveCondition}>
                  <div>
                    <Label htmlFor="move-variant">Product variant</Label>
                    <Select name="variantId" required>
                      <SelectTrigger id="move-variant">
                        <SelectValue placeholder="Choose product and SKU" />
                      </SelectTrigger>
                      <SelectContent>
                        {variants.map((variant) => (
                          <SelectItem key={variant.id} value={variant.id}>
                            {variant.productTitle} · {variant.sku}
                            {variant.optionSummary ? ` · ${variant.optionSummary}` : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="move-from">From</Label>
                    <Input id="move-from" name="fromCondition" defaultValue="SELLABLE" required />
                  </div>
                  <div>
                    <Label htmlFor="move-to">To</Label>
                    <Input id="move-to" name="toCondition" defaultValue="DAMAGED" required />
                  </div>
                  <div>
                    <Label htmlFor="move-quantity">Quantity</Label>
                    <Input id="move-quantity" name="quantity" required />
                  </div>
                  <div>
                    <Label htmlFor="move-reason">Reason</Label>
                    <Input id="move-reason" name="reason" defaultValue="DAMAGE" />
                  </div>
                  <Button className="md:col-span-5" type="submit" disabled={!locationId}>
                    Post condition movement
                  </Button>
                </form>
              </CardContent>
            </Card>
          </>
        ) : null}
        {section === 'transfers' ? (
          <Card>
            <CardHeader>
              <CardTitle>Create an internal transfer</CardTitle>
              <CardDescription>
                A transfer starts as a Draft. Approval, dispatch, and receipt remain explicit
                API-backed lifecycle steps.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form className="grid gap-3 md:grid-cols-2" onSubmit={createTransfer}>
                <div>
                  <Label htmlFor="transfer-source">Source Location</Label>
                  <Select name="sourceLocationId" required>
                    <SelectTrigger id="transfer-source">
                      <SelectValue placeholder="Choose source" />
                    </SelectTrigger>
                    <SelectContent>
                      {locations.map((location) => (
                        <SelectItem key={location.id} value={location.id}>
                          {location.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="transfer-destination">Destination Location</Label>
                  <Select name="destinationLocationId" required>
                    <SelectTrigger id="transfer-destination">
                      <SelectValue placeholder="Choose destination" />
                    </SelectTrigger>
                    <SelectContent>
                      {locations.map((location) => (
                        <SelectItem key={location.id} value={location.id}>
                          {location.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="transfer-variant">Product variant</Label>
                  <Select name="variantId" required>
                    <SelectTrigger id="transfer-variant">
                      <SelectValue placeholder="Choose product and SKU" />
                    </SelectTrigger>
                    <SelectContent>
                      {variants.map((variant) => (
                        <SelectItem key={variant.id} value={variant.id}>
                          {variant.productTitle} · {variant.sku}
                          {variant.optionSummary ? ` · ${variant.optionSummary}` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="transfer-quantity">Quantity</Label>
                  <Input id="transfer-quantity" name="quantity" required />
                </div>
                <div className="md:col-span-2">
                  <Label htmlFor="transfer-notes">Notes</Label>
                  <Input id="transfer-notes" name="notes" />
                </div>
                <Button className="md:col-span-2" type="submit">
                  Create Draft Transfer
                </Button>
              </form>
            </CardContent>
          </Card>
        ) : null}
        {section === 'transfers' ? (
          <Card>
            <CardHeader>
              <CardTitle>Transfer queue</CardTitle>
              <CardDescription>
                Dispatch reduces source availability only after approval; receiving posts stock to
                the destination.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              {transfers.map((transfer) => (
                <div
                  key={transfer.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"
                >
                  <div>
                    <div className="font-medium">{transfer.transferNumber}</div>
                    <div className="text-sm text-muted-foreground">
                      {transfer.lines.length} line(s) · {transfer.status}
                    </div>
                  </div>
                  {['DRAFT', 'READY', 'IN_TRANSIT', 'PARTIALLY_RECEIVED'].includes(
                    transfer.status,
                  ) ? (
                    <div className="flex gap-2">
                      <Button type="button" onClick={() => void progressTransfer(transfer)}>
                        {transfer.status === 'DRAFT'
                          ? 'Approve'
                          : transfer.status === 'READY'
                            ? 'Dispatch'
                            : 'Receive remaining'}
                      </Button>
                      {transfer.status === 'DRAFT' ? (
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => void cancelTransfer(transfer)}
                        >
                          Cancel
                        </Button>
                      ) : null}
                    </div>
                  ) : (
                    <Badge variant="secondary">{transfer.status}</Badge>
                  )}
                </div>
              ))}
              {transfers.length === 0 ? (
                <p className="text-sm text-muted-foreground">No transfers yet.</p>
              ) : null}
            </CardContent>
          </Card>
        ) : null}
        {section === 'stocktakes' ? (
          <Card>
            <CardHeader>
              <CardTitle>Stocktake workflow</CardTitle>
              <CardDescription>
                Snapshot stock, record every count against the current version, then post one
                immutable correction.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-64">
                  <Label>Location</Label>
                  <Select value={locationId} onValueChange={(value) => setLocationId(value ?? '')}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose Location" />
                    </SelectTrigger>
                    <SelectContent>
                      {locations.map((location) => (
                        <SelectItem key={location.id} value={location.id}>
                          {location.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button type="button" disabled={!locationId} onClick={() => void beginStocktake()}>
                  Start Stocktake
                </Button>
              </div>
              <form className="grid gap-3 md:grid-cols-3" onSubmit={countStocktakeLine}>
                <div>
                  <Label htmlFor="stocktake-id">Stocktake ID</Label>
                  <Input
                    id="stocktake-id"
                    name="stocktakeId"
                    value={stocktakeId}
                    onChange={(event) => setStocktakeId(event.target.value)}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="inventory-item-id">Inventory Item ID</Label>
                  <Input id="inventory-item-id" name="inventoryItemId" required />
                </div>
                <div>
                  <Label htmlFor="counted-quantity">Counted quantity</Label>
                  <Input id="counted-quantity" name="countedQuantity" required />
                </div>
                <Button className="md:col-span-3" type="submit">
                  Save Count
                </Button>
              </form>
              {stocktakeWorkspace ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Inventory Item</TableHead>
                      <TableHead>System snapshot</TableHead>
                      <TableHead>Counted</TableHead>
                      <TableHead>Discrepancy</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stocktakeWorkspace.lines.map((line) => (
                      <TableRow key={line.inventoryItemId}>
                        <TableCell className="font-mono text-xs">{line.inventoryItemId}</TableCell>
                        <TableCell>{line.expectedQuantity}</TableCell>
                        <TableCell>{line.countedQuantity ?? 'Not counted'}</TableCell>
                        <TableCell>
                          {line.countedQuantity === null
                            ? '—'
                            : String(Number(line.countedQuantity) - Number(line.expectedQuantity))}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : null}
              <Button
                type="button"
                variant="secondary"
                disabled={!stocktakeId}
                onClick={() => void postStocktake()}
              >
                Post Counted Stocktake
              </Button>
            </CardContent>
          </Card>
        ) : null}
        {section === 'warehouses' ? (
          <Card>
            <CardHeader>
              <CardTitle>Location list</CardTitle>
              <CardDescription>
                Locations carrying stock remain historical records and are retired rather than
                deleted.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2">
              {locations.map((location) => (
                <div key={location.id} className="rounded-md border p-3 text-sm">
                  <span className="font-medium">{location.name}</span> · {location.code} ·{' '}
                  {location.locationType} · <Badge variant="secondary">{location.status}</Badge>
                  <div className="mt-1 text-muted-foreground">
                    {location.capabilities.join(', ')}
                  </div>
                </div>
              ))}
              {locations.length === 0 ? (
                <p className="text-sm text-muted-foreground">No locations yet.</p>
              ) : null}
            </CardContent>
          </Card>
        ) : null}
        {section === 'history' ? (
          <Card>
            <CardHeader>
              <CardTitle>Immutable movement history</CardTitle>
              <CardDescription>
                Corrections are new transactions; these records are never edited or deleted.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Condition</TableHead>
                    <TableHead>Change</TableHead>
                    <TableHead>Reason</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell>{new Date(entry.occurredAt).toLocaleString()}</TableCell>
                      <TableCell>{entry.sku}</TableCell>
                      <TableCell>{entry.locationName}</TableCell>
                      <TableCell>{entry.condition}</TableCell>
                      <TableCell>{entry.quantityDelta}</TableCell>
                      <TableCell>{entry.reasonCode ?? entry.transactionType}</TableCell>
                    </TableRow>
                  ))}
                  {history.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-muted-foreground">
                        No inventory movements yet.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ) : null}
        <Card>
          <CardHeader>
            <CardTitle>{section === 'warehouses' ? 'Locations' : 'Inventory balances'}</CardTitle>
            <CardDescription>
              On Hand is physical quantity. Reserved is a commitment. Available is derived from
              sellable stock less reservations.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product / SKU</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Condition</TableHead>
                  <TableHead>On Hand</TableHead>
                  <TableHead>Reserved</TableHead>
                  <TableHead>Available</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {balances.map((balance) => (
                  <TableRow
                    key={`${balance.inventoryItemId}-${balance.locationId}-${balance.condition}`}
                  >
                    <TableCell>
                      <div className="font-medium">{balance.productTitle}</div>
                      <div className="text-xs text-muted-foreground">{balance.sku}</div>
                    </TableCell>
                    <TableCell>{balance.locationName}</TableCell>
                    <TableCell>
                      <Badge variant={balance.condition === 'SELLABLE' ? 'default' : 'secondary'}>
                        {balance.condition}
                      </Badge>
                    </TableCell>
                    <TableCell>{balance.onHand}</TableCell>
                    <TableCell>{balance.reserved}</TableCell>
                    <TableCell>{balance.availableToSell}</TableCell>
                  </TableRow>
                ))}
                {balances.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-muted-foreground">
                      No inventory movements yet. Create a Location, then post an opening balance.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
