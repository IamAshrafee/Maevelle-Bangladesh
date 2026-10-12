'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, CheckCircle2, FileText, MapPin, Pencil } from 'lucide-react';
import Link from 'next/link';
import type { WarehouseTransferDetailDto, WarehouseTransferLineDto } from '@maevelle/contracts';

import { useAdminCapability } from '@/components/admin-capabilities';
import { StatusBadge } from '@/components/status-badge';
import { inventoryRequest, formatInventoryDate, formatInventoryNumber } from '@/lib/inventory/api';
import { ReceiveTransferSheet } from './receive-transfer-sheet';
import { CloseTransferDiscrepancySheet } from './close-transfer-discrepancy-sheet';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { AdminPage, EmptyState, ErrorState, LoadingState } from '@/components/ui/page-shell';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

// ─── Main ─────────────────────────────────────────────────────────────────────

export function TransferDetail({ transferId }: { transferId: string }) {
  const router = useRouter();
  const canManage = useAdminCapability('warehouse.manage');
  const canTransfer = useAdminCapability('inventory.transfer');
  const [transfer, setTransfer] = useState<WarehouseTransferDetailDto | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [discrepancyOpen, setDiscrepancyOpen] = useState(false);

  const load = async () => {
    try {
      const res = await inventoryRequest<{ data: WarehouseTransferDetailDto }>(
        `/warehouse/transfers/${transferId}`,
      );
      setTransfer(res.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Transfer could not be loaded.');
    }
  };

  useEffect(() => {
    let active = true;
    inventoryRequest<{ data: WarehouseTransferDetailDto }>(`/warehouse/transfers/${transferId}`)
      .then((res) => {
        if (active) setTransfer(res.data);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : 'Could not load transfer.');
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [transferId]);

  const handleApprove = async () => {
    if (!transfer) return;
    setBusy(true);
    setError('');
    try {
      await inventoryRequest(`/warehouse/transfers/${transferId}/approve`, {
        method: 'POST',
        headers: { 'idempotency-key': `approve-${transferId}-${transfer.version}` },
        body: JSON.stringify({ version: transfer.version }),
      });
      setSuccessMessage('Transfer approved. It is now ready to dispatch.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not approve transfer.');
    } finally {
      setBusy(false);
    }
  };

  const handleCancel = async () => {
    if (!transfer) return;
    setBusy(true);
    setError('');
    try {
      await inventoryRequest(`/warehouse/transfers/${transferId}/cancel`, {
        method: 'POST',
        headers: { 'idempotency-key': `cancel-${transferId}-${transfer.version}` },
        body: JSON.stringify({ version: transfer.version }),
      });
      setSuccessMessage('Transfer cancelled.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not cancel transfer.');
    } finally {
      setBusy(false);
    }
  };

  const handleDispatch = async () => {
    if (!transfer) return;
    setBusy(true);
    setError('');
    try {
      await inventoryRequest(`/warehouse/transfers/${transferId}/dispatch`, {
        method: 'POST',
        headers: { 'idempotency-key': `dispatch-${transferId}-${transfer.version}` },
      });
      setSuccessMessage(
        'Transfer dispatched. Inventory has been deducted from the source location.',
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not dispatch transfer.');
    } finally {
      setBusy(false);
    }
  };

  if (isLoading) {
    return (
      <AdminPage><LoadingState message="Loading transfer…" /></AdminPage>
    );
  }

  if (!transfer) {
    return (
      <AdminPage><EmptyState title="Transfer not found" description="This transfer could not be found or you don't have permission to view it." /></AdminPage>
    );
  }

  const lines = transfer.lines;

  return (
    <AdminPage>
      {/* Header */}
      <div className="flex flex-col gap-4 border-b border-border/70 pb-5 sm:flex-row sm:items-center">
        <Button variant="outline" size="icon" onClick={() => router.push('/inventory/transfers')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-2xl font-bold tracking-tight">
              Transfer {transfer.transferNumber}
            </h2>
            <StatusBadge status={transfer.status} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Created {formatInventoryDate(transfer.createdAt)}
          </p>
        </div>

        {/* Action buttons — only shown for actionable states */}
        <div className="flex gap-2 shrink-0">
          {canManage && transfer.status === 'DRAFT' && (
            <>
              <Button
                variant="outline"
                render={<Link href={`/inventory/transfers/${transfer.id}/edit`} />}
              >
                <Pencil className="mr-2 h-4 w-4" />
                Edit Draft
              </Button>
              <AlertDialog>
                <AlertDialogTrigger render={<Button variant="destructive" disabled={busy} />}>
                  Cancel Transfer
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Cancel this transfer?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will void the draft. No inventory movement will occur.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Keep Draft</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleCancel}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Cancel Transfer
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              <Button onClick={handleApprove} disabled={busy}>
                {busy ? 'Approving…' : 'Approve Transfer'}
              </Button>
            </>
          )}

          {canTransfer && transfer.status === 'READY' && (
            <AlertDialog>
              <AlertDialogTrigger render={<Button disabled={busy} />}>
                Dispatch Transfer
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Dispatch this transfer?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will deduct the requested stock from the source location and mark the
                    transfer as In Transit. This cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Back</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDispatch}>Confirm Dispatch</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}

          {canTransfer && (transfer.status === 'IN_TRANSIT' || transfer.status === 'PARTIALLY_RECEIVED') && (
            <>
              <Button variant="outline" onClick={() => setDiscrepancyOpen(true)} disabled={busy}>
                Resolve missing stock
              </Button>
              <Button onClick={() => setReceiveOpen(true)} disabled={busy}>
                Receive Transfer
              </Button>
            </>
          )}
        </div>
      </div>

      {error ? <ErrorState message={error} onRetry={() => void load()} /> : null}

      {successMessage && (
        <div className="flex items-center gap-2 rounded-lg border border-success/30 bg-success/10 px-4 py-3 text-sm text-foreground">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          {successMessage}
        </div>
      )}

      {/* Info cards */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <MapPin className="h-4 w-4 text-muted-foreground" /> Route
            </CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">From</p>
              <Link
                href={`/inventory/warehouses/${transfer.sourceLocationId}`}
                className="font-medium hover:underline"
              >
                {transfer.sourceLocationName ?? transfer.sourceLocationId}
              </Link>
            </div>
            <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
            <div className="text-right">
              <p className="text-xs text-muted-foreground mb-0.5">To</p>
              <Link
                href={`/inventory/warehouses/${transfer.destinationLocationId}`}
                className="font-medium hover:underline"
              >
                {transfer.destinationLocationName ?? transfer.destinationLocationId}
              </Link>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" /> Quantities
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-2xl font-bold">
                  {formatInventoryNumber(transfer.totalRequested)}
                </p>
                <p className="text-xs text-muted-foreground">Requested</p>
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {formatInventoryNumber(transfer.totalDispatched)}
                </p>
                <p className="text-xs text-muted-foreground">Dispatched</p>
              </div>
              <div>
                <p className="font-mono text-2xl font-bold tabular-nums text-success">
                  {formatInventoryNumber(transfer.totalReceived)}
                </p>
                <p className="text-xs text-muted-foreground">Received</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {transfer.notes && (
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm">
              <span className="font-medium">Notes: </span>
              <span className="text-muted-foreground">{transfer.notes}</span>
            </p>
          </CardContent>
        </Card>
      )}

      {/* Transfer lines */}
      <Card>
        <CardHeader>
          <CardTitle>Transfer Lines</CardTitle>
          <CardDescription>Items included in this transfer</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {lines.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">
              No items in this transfer.
            </div>
          ) : (
            <Table density="compact">
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead className="text-right">Requested</TableHead>
                    <TableHead className="text-right">Dispatched</TableHead>
                    <TableHead className="text-right">Received</TableHead>
                    <TableHead className="text-right">Discrepancy</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((line: WarehouseTransferLineDto) => (
                    <TableRow key={line.id}>
                      <TableCell>
                        <Link
                          href={`/inventory/stock/${line.inventoryItemId}`}
                          className="font-medium hover:underline"
                        >
                          {line.productTitle}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">
                          {line.sku}
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {formatInventoryNumber(line.requestedQuantity)}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {formatInventoryNumber(line.dispatchedQuantity)}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums font-medium text-success">
                        {formatInventoryNumber(line.receivedQuantity)}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        {line.discrepancy ? (
                          <span className="text-warning" title={line.discrepancy.reasonCode}>
                            {formatInventoryNumber(line.discrepancy.quantity)}{' '}
                            {line.discrepancy.dispositionCode.toLowerCase()}
                          </span>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
          )}
        </CardContent>
      </Card>

      {/* Receive sheet */}
      <ReceiveTransferSheet
        transferId={transferId}
        transferVersion={transfer.version}
        lines={lines}
        open={receiveOpen}
        onClose={() => setReceiveOpen(false)}
        onSuccess={(msg) => {
          setSuccessMessage(msg);
          void load();
        }}
      />
      <CloseTransferDiscrepancySheet
        transferId={transferId}
        transferVersion={transfer.version}
        lines={lines}
        open={discrepancyOpen}
        onClose={() => setDiscrepancyOpen(false)}
        onSuccess={(message) => {
          setSuccessMessage(message);
          void load();
        }}
      />
    </AdminPage>
  );
}
