'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  ArrowLeft,
  Banknote,
  FileText,
  MapPin,
  Pencil,
  Plus,
  RefreshCw,
  ShieldAlert,
  UserRound,
  Wrench,
} from 'lucide-react';
import type { AssetDetailDto, AssetOptionsDto } from '@maevelle/contracts';
import { useAdminCapability } from '@/components/admin-capabilities';
import { AssetPickerDialog, type SelectedMediaAsset } from '@/components/media/asset-picker-dialog';
import { OperationalFeedback, OperationalPageHeader } from '@/components/operational-worklist';
import { StatusBadge } from '@/components/status-badge';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { fetchApiData } from '@/lib/api';
import {
  formatAssetDate,
  formatAssetMoney,
  humanizeAssetCode,
  newIdempotencyKey,
} from '@/lib/assets/format';

type DialogKind =
  'edit' | 'assign' | 'move' | 'lifecycle' | 'maintenance' | 'sale' | 'dispose' | 'attach';
const terminal = (status: string) => status === 'SOLD' || status === 'DISPOSED';
const nowLocal = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

export function AssetDetail({ assetId }: { readonly assetId: string }) {
  const canManage = useAdminCapability('assets.manage');
  const canLifecycle = useAdminCapability('assets.lifecycle.manage');
  const [asset, setAsset] = useState<AssetDetailDto>();
  const [options, setOptions] = useState<AssetOptionsDto>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [dialog, setDialog] = useState<DialogKind>();
  const [busy, setBusy] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedMedia, setSelectedMedia] = useState<SelectedMediaAsset>();
  const [recovery, setRecovery] = useState<{ kind: 'maintenance' | 'media'; id: string }>();
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [detail, nextOptions] = await Promise.all([
        fetchApiData<AssetDetailDto>(`/admin/assets/${assetId}`),
        fetchApiData<AssetOptionsDto>('/admin/assets/options'),
      ]);
      setAsset(detail);
      setOptions(nextOptions);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Asset could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [assetId]);
  useEffect(() => {
    void load();
  }, [load]);
  async function command(path: string, body: unknown, success: string) {
    setBusy(true);
    setError('');
    try {
      await fetchApiData(`/admin/assets/${assetId}${path}`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setDialog(undefined);
      setSelectedMedia(undefined);
      setFeedback(success);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action could not be completed.');
    } finally {
      setBusy(false);
    }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!asset || !dialog) return;
    const f = new FormData(event.currentTarget);
    if (dialog === 'edit') {
      setBusy(true);
      try {
        await fetchApiData(`/admin/assets/${assetId}`, {
          method: 'PATCH',
          body: JSON.stringify({
            expectedVersion: asset.version,
            name: String(f.get('name')),
            categoryId: String(f.get('categoryId')) || null,
            description: String(f.get('description')) || null,
            brand: String(f.get('brand')) || null,
            model: String(f.get('model')) || null,
            serialNumber: String(f.get('serialNumber')) || null,
            condition: String(f.get('condition')),
            warrantyExpiresOn: String(f.get('warrantyExpiresOn')) || null,
            notes: String(f.get('notes')) || null,
          }),
        });
        setDialog(undefined);
        setFeedback('Asset details updated.');
        await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Asset could not be updated.');
      } finally {
        setBusy(false);
      }
      return;
    }
    if (dialog === 'assign')
      return command(
        '/assignment',
        {
          custodianMembershipId: String(f.get('custodianMembershipId')) || null,
          expectedVersion: asset.version,
        },
        'Custodian updated and assignment history preserved.',
      );
    if (dialog === 'move')
      return command(
        '/location',
        {
          locationId: String(f.get('locationId')) || null,
          customLocation: String(f.get('customLocation')) || null,
          expectedVersion: asset.version,
        },
        'Location updated and movement history preserved.',
      );
    if (dialog === 'lifecycle')
      return command(
        '/lifecycle',
        {
          status: String(f.get('status')),
          condition: String(f.get('condition')) || undefined,
          reason: String(f.get('reason')),
          expectedVersion: asset.version,
        },
        'Asset lifecycle updated.',
      );
    if (dialog === 'maintenance')
      return command(
        '/maintenance',
        {
          type: String(f.get('type')),
          occurredOn: String(f.get('occurredOn')),
          issue: String(f.get('issue')) || undefined,
          workPerformed: String(f.get('workPerformed')),
          serviceProvider: String(f.get('serviceProvider')) || undefined,
          expenseId: String(f.get('expenseId')) || undefined,
          nextServiceOn: String(f.get('nextServiceOn')) || undefined,
          notes: String(f.get('notes')) || undefined,
          idempotencyKey: newIdempotencyKey('asset-maintenance'),
        },
        'Maintenance record added. Any cost remains authoritative in the linked Expense.',
      );
    if (dialog === 'sale')
      return command(
        '/sale',
        {
          accountId: String(f.get('accountId')),
          amount: String(f.get('amount')),
          occurredAt: new Date(String(f.get('occurredAt'))).toISOString(),
          buyerReference: String(f.get('buyerReference')) || undefined,
          note: String(f.get('note')) || undefined,
          expectedVersion: asset.version,
          idempotencyKey: newIdempotencyKey('asset-sale'),
        },
        'Asset sold and sale proceeds posted to the selected Finance Account.',
      );
    if (dialog === 'dispose')
      return command(
        '/disposal',
        {
          reason: String(f.get('reason')),
          occurredAt: new Date(String(f.get('occurredAt'))).toISOString(),
          expectedVersion: asset.version,
          idempotencyKey: newIdempotencyKey('asset-disposal'),
        },
        'Asset disposed. Historical records remain available.',
      );
    if (dialog === 'attach' && selectedMedia)
      return command(
        '/media',
        {
          mediaAssetId: selectedMedia.id,
          role: String(f.get('role')),
          label: String(f.get('label')) || undefined,
          idempotencyKey: newIdempotencyKey('asset-media'),
        },
        'Private Media attached to Asset.',
      );
  }

  async function submitRecovery(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!recovery) return;
    const reason = String(new FormData(event.currentTarget).get('reason'));
    setBusy(true);
    setError('');
    try {
      await fetchApiData(
        `/admin/assets/${assetId}/${recovery.kind === 'maintenance' ? `maintenance/${recovery.id}/void` : `media/${recovery.id}`}`,
        {
          method: recovery.kind === 'maintenance' ? 'POST' : 'DELETE',
          body: JSON.stringify({ reason }),
        },
      );
      setRecovery(undefined);
      setFeedback(
        recovery.kind === 'maintenance'
          ? 'Maintenance entry voided; its evidence remains in history.'
          : 'File detached; Media usage history remains available.',
      );
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Correction could not be completed.');
    } finally {
      setBusy(false);
    }
  }
  if (loading)
    return (
      <main className="grid gap-5 px-4 py-5 sm:px-6 lg:px-8">
        <Skeleton className="h-28 rounded-xl" />
        <Skeleton className="h-96 rounded-xl" />
      </main>
    );
  if (!asset)
    return (
      <main className="grid gap-5 px-4 py-5 sm:px-6 lg:px-8">
        <OperationalFeedback tone="danger">{error || 'Asset was not found.'}</OperationalFeedback>
        <Button nativeButton={false} render={<Link href="/assets" />}>
          <ArrowLeft />
          Back to Assets
        </Button>
      </main>
    );
  const isTerminal = terminal(asset.status);
  return (
    <main className="grid gap-5 px-4 py-5 sm:px-6 lg:px-8">
      <Breadcrumb items={[{ label: 'Assets', href: '/assets' }, { label: asset.assetCode }]} />
      <OperationalPageHeader
        eyebrow={asset.assetCode}
        title={asset.name}
        description={`${asset.categoryName ?? 'Uncategorized'} · ${humanizeAssetCode(asset.acquisitionSource)} acquisition`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" nativeButton={false} render={<Link href="/assets" />}>
              <ArrowLeft />
              Assets
            </Button>
            {canManage && !isTerminal ? (
              <Button variant="outline" onClick={() => setDialog('edit')}>
                <Pencil />
                Edit
              </Button>
            ) : null}
            {canLifecycle && !isTerminal ? (
              <>
                <Button variant="outline" onClick={() => setDialog('sale')}>
                  <Banknote />
                  Sell
                </Button>
                <Button variant="destructive" onClick={() => setDialog('dispose')}>
                  <ShieldAlert />
                  Dispose
                </Button>
              </>
            ) : null}
          </div>
        }
      />
      {feedback ? <OperationalFeedback>{feedback}</OperationalFeedback> : null}
      {error ? <OperationalFeedback tone="danger">{error}</OperationalFeedback> : null}
      <div className="flex flex-wrap gap-2">
        <StatusBadge status={humanizeAssetCode(asset.status)} />
        <StatusBadge status={humanizeAssetCode(asset.condition)} />
        {asset.warrantyExpiresOn ? (
          <span className="rounded-full border px-3 py-1 text-xs">
            Warranty until {formatAssetDate(asset.warrantyExpiresOn)}
          </span>
        ) : null}
      </div>
      <Tabs defaultValue="overview">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="financial">Acquisition & Finance</TabsTrigger>
          <TabsTrigger value="maintenance">Maintenance</TabsTrigger>
          <TabsTrigger value="files">Files</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Identity and current state</CardTitle>
              <CardDescription>
                Mutable operational facts; acquisition truth is shown separately.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Detail label="Asset code" value={asset.assetCode} />
              <Detail label="Category" value={asset.categoryName ?? 'Uncategorized'} />
              <Detail
                label="Brand / model"
                value={[asset.brand, asset.model].filter(Boolean).join(' · ') || 'Not recorded'}
              />
              <Detail label="Serial number" value={asset.serialNumber ?? 'Not recorded'} />
              <Detail
                label="Location"
                value={asset.locationName ?? asset.customLocation ?? 'Unlocated'}
              />
              <Detail label="Custodian" value={asset.custodianName ?? 'Unassigned'} />
              <Detail label="Description" value={asset.description ?? 'No description'} />
              <Detail label="Notes" value={asset.notes ?? 'No notes'} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Operate Asset</CardTitle>
              <CardDescription>Explicit commands preserve a readable history.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2">
              {canManage && !isTerminal ? (
                <>
                  <Button variant="outline" onClick={() => setDialog('assign')}>
                    <UserRound />
                    Change custodian
                  </Button>
                  <Button variant="outline" onClick={() => setDialog('move')}>
                    <MapPin />
                    Move Asset
                  </Button>
                  <Button variant="outline" onClick={() => setDialog('maintenance')}>
                    <Wrench />
                    Record maintenance
                  </Button>
                  <Button variant="outline" onClick={() => setDialog('attach')}>
                    <FileText />
                    Attach file
                  </Button>
                </>
              ) : null}
              {canLifecycle && !isTerminal ? (
                <Button variant="outline" onClick={() => setDialog('lifecycle')}>
                  <RefreshCw />
                  Change lifecycle
                </Button>
              ) : null}
              {isTerminal ? (
                <p className="text-sm text-muted-foreground">
                  This Asset has a final lifecycle state. Its history and financial evidence remain
                  read-only.
                </p>
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="financial" className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Acquisition</CardTitle>
              <CardDescription>
                Historical Asset facts and links—not a second ledger.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <Detail label="Source" value={humanizeAssetCode(asset.acquisitionSource)} />
              <Detail label="Acquired" value={formatAssetDate(asset.acquisitionDate)} />
              <Detail
                label="Historical cost"
                value={
                  asset.acquisitionCost
                    ? formatAssetMoney(asset.acquisitionCost, asset.currencyCode)
                    : 'Not recorded'
                }
              />
              <Detail
                label="Accounting treatment"
                value="No depreciation or fabricated book value"
              />
              {asset.financial.expense ? (
                <Detail
                  label="Expense"
                  value={
                    <Link
                      className="text-primary hover:underline"
                      href={`/finance/expenses/${asset.financial.expense.id}`}
                    >
                      {asset.financial.expense.number} ·{' '}
                      {formatAssetMoney(asset.financial.expense.amount, asset.currencyCode)}
                    </Link>
                  }
                />
              ) : null}
              {asset.financial.purchase ? (
                <Detail
                  label="Purchase"
                  value={
                    <Link
                      className="text-primary hover:underline"
                      href={`/purchases/${asset.financial.purchase.id}`}
                    >
                      {asset.financial.purchase.number} · {asset.financial.purchase.supplierName}
                    </Link>
                  }
                />
              ) : null}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Funding and proceeds</CardTitle>
              <CardDescription>Derived from immutable Finance facts.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              {asset.financial.payments.length === 0 && !asset.financial.sale ? (
                <p className="text-sm text-muted-foreground">
                  No linked Finance payment or sale proceeds. Existing and gifted Assets may
                  legitimately have none.
                </p>
              ) : (
                asset.financial.payments.map((p) => (
                  <div key={p.id} className="rounded-lg border p-3">
                    <strong>{formatAssetMoney(p.amount, asset.currencyCode)}</strong>
                    <p className="text-sm text-muted-foreground">
                      {humanizeAssetCode(p.source)} ·{' '}
                      {p.accountName ?? p.contributorName ?? 'Finance'} ·{' '}
                      {formatAssetDate(p.paidAt, true)}
                    </p>
                  </div>
                ))
              )}
              {asset.financial.sale ? (
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
                  <strong>
                    Sale proceeds{' '}
                    {formatAssetMoney(
                      asset.financial.sale.amount,
                      asset.financial.sale.currencyCode,
                    )}
                  </strong>
                  <p className="text-sm text-muted-foreground">
                    Posted to {asset.financial.sale.accountName} on{' '}
                    {formatAssetDate(asset.financial.sale.occurredAt, true)}
                  </p>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="maintenance">
          <Card>
            <CardHeader>
              <CardTitle>Maintenance and repair history</CardTitle>
              <CardDescription>
                Service facts live here; money remains in linked Expenses.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              {asset.maintenance.length === 0 ? (
                <p className="text-sm text-muted-foreground">No maintenance recorded.</p>
              ) : (
                asset.maintenance.map((m) => (
                  <div
                    key={m.id}
                    className={`rounded-lg border p-4 ${m.status === 'VOIDED' ? 'opacity-60' : ''}`}
                  >
                    <div className="flex flex-wrap justify-between gap-2">
                      <strong>
                        {humanizeAssetCode(m.type)} · {formatAssetDate(m.occurredOn)}
                        {m.status === 'VOIDED' ? ' · Voided' : ''}
                      </strong>
                      {m.expenseId ? (
                        <Link
                          className="text-sm text-primary hover:underline"
                          href={`/finance/expenses/${m.expenseId}`}
                        >
                          {m.expenseNumber} ·{' '}
                          {formatAssetMoney(m.expenseAmount ?? '0', asset.currencyCode)}
                        </Link>
                      ) : null}
                    </div>
                    <p className="mt-2 text-sm">{m.workPerformed}</p>
                    <p className="text-sm text-muted-foreground">
                      {[
                        m.issue,
                        m.serviceProvider && `Provider: ${m.serviceProvider}`,
                        m.nextServiceOn && `Next: ${formatAssetDate(m.nextServiceOn)}`,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                    {m.voidReason ? (
                      <p className="mt-2 text-sm text-destructive">Void reason: {m.voidReason}</p>
                    ) : canManage ? (
                      <Button
                        className="mt-3"
                        size="sm"
                        variant="ghost"
                        onClick={() => setRecovery({ kind: 'maintenance', id: m.id })}
                      >
                        Void incorrect entry
                      </Button>
                    ) : null}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="files">
          <Card>
            <CardHeader>
              <CardTitle>Private documents and photos</CardTitle>
              <CardDescription>
                Files reuse the Media library and remain private Admin evidence.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {asset.media.length === 0 ? (
                <p className="text-sm text-muted-foreground">No files attached.</p>
              ) : (
                asset.media.map((file) => (
                  <div key={file.id} className="rounded-lg border p-4">
                    <a
                      href={`/api/admin/media/${file.mediaAssetId}/content`}
                      className="block hover:text-primary"
                    >
                      <FileText className="mb-2 size-5" />
                      <strong>{file.label ?? file.filename}</strong>
                      <p className="text-sm text-muted-foreground">
                        {humanizeAssetCode(file.role)} · {file.filename}
                      </p>
                    </a>
                    {canManage ? (
                      <Button
                        className="mt-3"
                        size="sm"
                        variant="ghost"
                        onClick={() => setRecovery({ kind: 'media', id: file.id })}
                      >
                        Detach
                      </Button>
                    ) : null}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="activity">
          <Card>
            <CardHeader>
              <CardTitle>Asset history</CardTitle>
              <CardDescription>
                Domain events complement the platform Audit trail without duplicating financial
                ledgers.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-0">
              {asset.history.map((e) => (
                <div key={e.id} className="relative border-l pl-5 pb-5 last:pb-0">
                  <span className="absolute -left-1.5 top-1 size-3 rounded-full bg-primary" />
                  <strong>{humanizeAssetCode(e.type)}</strong>
                  <p className="text-sm">{e.summary}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatAssetDate(e.occurredAt, true)}
                    {e.actorName ? ` · ${e.actorName}` : ''}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      <AssetCommandDialog
        kind={dialog}
        asset={asset}
        options={options}
        busy={busy}
        selectedMedia={selectedMedia}
        onClose={() => {
          setDialog(undefined);
          setSelectedMedia(undefined);
        }}
        onSubmit={submit}
        onPickMedia={() => setPickerOpen(true)}
      />
      <AssetPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        multiple={false}
        visibility="PRIVATE"
        assetType="ALL"
        onSelect={(files) => {
          setSelectedMedia(files[0]);
          setPickerOpen(false);
        }}
      />
      <Dialog
        open={Boolean(recovery)}
        onOpenChange={(open) => {
          if (!open) setRecovery(undefined);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {recovery?.kind === 'maintenance' ? 'Void maintenance entry' : 'Detach Asset file'}
            </DialogTitle>
            <DialogDescription>
              This correction preserves the Asset timeline, Audit evidence, and Media usage history.
            </DialogDescription>
          </DialogHeader>
          <form className="grid gap-4" onSubmit={submitRecovery}>
            <Text label="Reason" name="reason" required />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setRecovery(undefined)}>
                Cancel
              </Button>
              <Button type="submit" variant="destructive" disabled={busy}>
                {busy ? 'Correcting…' : 'Confirm correction'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </main>
  );
}

function AssetCommandDialog({
  kind,
  asset,
  options,
  busy,
  selectedMedia,
  onClose,
  onSubmit,
  onPickMedia,
}: {
  kind: DialogKind | undefined;
  asset: AssetDetailDto;
  options: AssetOptionsDto | undefined;
  busy: boolean;
  selectedMedia: SelectedMediaAsset | undefined;
  onClose: () => void;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  onPickMedia: () => void;
}) {
  const title = {
    edit: 'Edit Asset',
    assign: 'Change custodian',
    move: 'Move Asset',
    lifecycle: 'Change lifecycle',
    maintenance: 'Record maintenance',
    sale: 'Sell Asset',
    dispose: 'Dispose Asset',
    attach: 'Attach private Media',
  }[kind ?? 'edit'];
  return (
    <Dialog
      open={Boolean(kind)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {kind === 'sale'
              ? 'Sale proceeds create one immutable Finance transaction and one Account entry atomically.'
              : kind === 'maintenance'
                ? 'Link an existing Expense when service cost money; do not type the cost twice.'
                : 'Changes are organization-scoped and auditable.'}
          </DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={onSubmit}>
          {kind === 'edit' ? (
            <>
              <Field label="Name" name="name" defaultValue={asset.name} required />
              <Select label="Category" name="categoryId" defaultValue={asset.categoryId ?? ''}>
                <option value="">Uncategorized</option>
                {options?.categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Brand" name="brand" defaultValue={asset.brand ?? ''} />
                <Field label="Model" name="model" defaultValue={asset.model ?? ''} />
                <Field
                  label="Serial number"
                  name="serialNumber"
                  defaultValue={asset.serialNumber ?? ''}
                />
                <Select label="Condition" name="condition" defaultValue={asset.condition}>
                  {['GOOD', 'FAIR', 'NEEDS_REPAIR', 'DAMAGED'].map((v) => (
                    <option key={v} value={v}>
                      {humanizeAssetCode(v)}
                    </option>
                  ))}
                </Select>
                <Field
                  label="Warranty expires"
                  name="warrantyExpiresOn"
                  type="date"
                  defaultValue={asset.warrantyExpiresOn ?? ''}
                />
              </div>
              <Text label="Description" name="description" defaultValue={asset.description ?? ''} />
              <Text label="Notes" name="notes" defaultValue={asset.notes ?? ''} />
            </>
          ) : null}
          {kind === 'assign' ? (
            <Select
              label="Custodian"
              name="custodianMembershipId"
              defaultValue={asset.custodianMembershipId ?? ''}
            >
              <option value="">Unassigned</option>
              {options?.custodians.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          ) : null}
          {kind === 'move' ? (
            <>
              <Select
                label="Business location"
                name="locationId"
                defaultValue={asset.locationId ?? ''}
              >
                <option value="">No structured location</option>
                {options?.locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </Select>
              <Field
                label="Custom location (instead of business location)"
                name="customLocation"
                defaultValue={asset.customLocation ?? ''}
              />
            </>
          ) : null}
          {kind === 'lifecycle' ? (
            <>
              <Select label="Status" name="status" defaultValue={asset.status}>
                {['ACTIVE', 'IN_STORAGE', 'UNDER_REPAIR', 'DAMAGED', 'LOST'].map((v) => (
                  <option key={v} value={v}>
                    {humanizeAssetCode(v)}
                  </option>
                ))}
              </Select>
              <Select label="Condition" name="condition" defaultValue={asset.condition}>
                {['GOOD', 'FAIR', 'NEEDS_REPAIR', 'DAMAGED'].map((v) => (
                  <option key={v} value={v}>
                    {humanizeAssetCode(v)}
                  </option>
                ))}
              </Select>
              <Text label="Reason" name="reason" required />
            </>
          ) : null}
          {kind === 'maintenance' ? (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <Select label="Type" name="type">
                  <option value="INSPECTION">Inspection</option>
                  <option value="SERVICE">Service</option>
                  <option value="REPAIR">Repair</option>
                  <option value="PART_REPLACEMENT">Part replacement</option>
                </Select>
                <Field
                  label="Date"
                  name="occurredOn"
                  type="date"
                  defaultValue={new Date().toISOString().slice(0, 10)}
                  required
                />
                <Field label="Service provider" name="serviceProvider" />
                <Field label="Next service (optional)" name="nextServiceOn" type="date" />
              </div>
              <Text label="Issue" name="issue" />
              <Text label="Work performed" name="workPerformed" required />
              <Select label="Linked Expense (optional)" name="expenseId">
                <option value="">No linked Expense</option>
                {options?.expenses.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.number} · {e.description} · {formatAssetMoney(e.amount, e.currencyCode)}
                  </option>
                ))}
              </Select>
              <Text label="Notes" name="notes" />
            </>
          ) : null}
          {kind === 'sale' ? (
            <>
              <Select label="Account receiving proceeds" name="accountId" required>
                <option value="">Choose Account</option>
                {options?.accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} · {a.currencyCode}
                  </option>
                ))}
              </Select>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Sale amount"
                  name="amount"
                  type="number"
                  min="0.0001"
                  step="0.0001"
                  required
                />
                <Field
                  label="Sold at"
                  name="occurredAt"
                  type="datetime-local"
                  defaultValue={nowLocal()}
                  required
                />
              </div>
              <Field label="Buyer/reference" name="buyerReference" />
              <Text label="Note" name="note" />
            </>
          ) : null}
          {kind === 'dispose' ? (
            <>
              <Field
                label="Disposed at"
                name="occurredAt"
                type="datetime-local"
                defaultValue={nowLocal()}
                required
              />
              <Text label="Reason" name="reason" required />
            </>
          ) : null}
          {kind === 'attach' ? (
            <>
              <Button type="button" variant="outline" onClick={onPickMedia}>
                <Plus />
                {selectedMedia ? selectedMedia.filename : 'Choose or upload private Media'}
              </Button>
              <Select label="Document role" name="role">
                <option value="PHOTO">Photo</option>
                <option value="PURCHASE_RECEIPT">Purchase receipt</option>
                <option value="INVOICE">Invoice</option>
                <option value="WARRANTY">Warranty</option>
                <option value="REPAIR_RECEIPT">Repair receipt</option>
                <option value="SERIAL_PHOTO">Serial-number photo</option>
                <option value="OTHER">Other</option>
              </Select>
              <Field label="Label" name="label" />
            </>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={busy || (kind === 'attach' && !selectedMedia)}
              variant={kind === 'dispose' ? 'destructive' : 'default'}
            >
              {busy ? 'Saving…' : 'Confirm'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="mt-1 text-sm font-medium">{value}</div>
    </div>
  );
}
function Field({ label, ...props }: { label: string } & React.ComponentProps<typeof Input>) {
  return (
    <Label className="grid gap-2">
      {label}
      <Input {...props} />
    </Label>
  );
}
function Text({ label, ...props }: { label: string } & React.ComponentProps<typeof Textarea>) {
  return (
    <Label className="grid gap-2">
      {label}
      <Textarea rows={3} {...props} />
    </Label>
  );
}
function Select({
  label,
  children,
  ...props
}: { label: string; children: React.ReactNode } & React.ComponentProps<typeof NativeSelect>) {
  return (
    <Label className="grid gap-2">
      {label}
      <NativeSelect {...props}>{children}</NativeSelect>
    </Label>
  );
}
