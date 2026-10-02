'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  Boxes,
  BriefcaseBusiness,
  CircleDollarSign,
  Info,
  Package,
  Plus,
  ReceiptText,
  Search,
  TriangleAlert,
  Wrench,
} from 'lucide-react';
import type {
  AssetCategoryDto,
  AssetListItemDto,
  AssetOptionsDto,
  AssetSummaryDto,
  PaginatedResultDto,
} from '@maevelle/contracts';
import { useAdminCapability } from '@/components/admin-capabilities';
import {
  OperationalEmptyState,
  OperationalFeedback,
  OperationalPageHeader,
} from '@/components/operational-worklist';
import { StatusBadge } from '@/components/status-badge';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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
import { Stats, StatsCard, StatsDescription, StatsTitle, StatsValue } from '@/components/ui/stats';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { fetchApiData } from '@/lib/api';
import {
  formatAssetDate,
  formatAssetMoney,
  humanizeAssetCode,
  newIdempotencyKey,
} from '@/lib/assets/format';

const statuses = [
  'ALL',
  'ACTIVE',
  'IN_STORAGE',
  'UNDER_REPAIR',
  'DAMAGED',
  'LOST',
  'SOLD',
  'DISPOSED',
] as const;
const conditions = ['GOOD', 'FAIR', 'NEEDS_REPAIR', 'DAMAGED'] as const;
const today = () => new Date().toISOString().slice(0, 10);

export function AssetConsole() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const canManage = useAdminCapability('assets.manage');
  const [items, setItems] = useState<readonly AssetListItemDto[]>([]);
  const [summary, setSummary] = useState<AssetSummaryDto>();
  const [options, setOptions] = useState<AssetOptionsDto>();
  const [categories, setCategories] = useState<readonly AssetCategoryDto[]>([]);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 25,
    totalItems: 0,
    totalPages: 0,
  });
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('ALL');
  const [categoryId, setCategoryId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');

  // Controlled form state for registration
  const [acquisitionSource, setAcquisitionSource] = useState('EXISTING');
  const [expenseId, setExpenseId] = useState('');
  const [purchaseId, setPurchaseId] = useState('');
  const [purchaseLineId, setPurchaseLineId] = useState('');
  const [acquisitionCost, setAcquisitionCost] = useState('');
  const [currencyCode, setCurrencyCode] = useState('');
  const [assetName, setAssetName] = useState('');
  const [assetNotes, setAssetNotes] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const query = new URLSearchParams({ page: String(page), pageSize: '25' });
      if (search.trim()) query.set('search', search.trim());
      if (status !== 'ALL') query.set('status', status);
      if (categoryId) query.set('categoryId', categoryId);
      const [list, nextSummary, nextOptions, nextCategories] = await Promise.all([
        fetchApiData<PaginatedResultDto<AssetListItemDto>>(`/admin/assets?${query}`),
        fetchApiData<AssetSummaryDto>('/admin/assets/summary'),
        fetchApiData<AssetOptionsDto>('/admin/assets/options'),
        fetchApiData<readonly AssetCategoryDto[]>('/admin/assets/categories'),
      ]);
      setItems(list.items);
      setPagination(list.pagination);
      setSummary(nextSummary);
      setOptions(nextOptions);
      setCategories(nextCategories);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Assets could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [categoryId, page, search, status]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), search ? 250 : 0);
    return () => window.clearTimeout(timer);
  }, [load, search]);

  useEffect(() => {
    if (searchParams.get('create') === 'asset' && canManage) {
      setCreateOpen(true);
      const s = searchParams.get('source');
      if (s && ['EXISTING', 'EXPENSE', 'PURCHASE', 'GIFT'].includes(s)) {
        setAcquisitionSource(s);
      }
      if (searchParams.get('expenseId')) setExpenseId(searchParams.get('expenseId')!);
      if (searchParams.get('purchaseId')) setPurchaseId(searchParams.get('purchaseId')!);
      if (searchParams.get('cost')) setAcquisitionCost(searchParams.get('cost')!);
      if (searchParams.get('currency')) setCurrencyCode(searchParams.get('currency')!);
      if (searchParams.get('name')) setAssetName(searchParams.get('name')!);
      if (searchParams.get('description')) setAssetNotes(searchParams.get('description')!);
    }
  }, [canManage, searchParams]);

  useEffect(() => {
    if (options && !currencyCode) {
      setCurrencyCode(options.defaultCurrency || 'BDT');
    }
  }, [options, currencyCode]);

  function onExpenseChange(selectedId: string) {
    setExpenseId(selectedId);
    const exp = options?.expenses.find((e) => e.id === selectedId);
    if (exp) {
      setAcquisitionCost(exp.amount);
      setCurrencyCode(exp.currencyCode);
      if (!assetName) setAssetName(exp.description);
    }
  }

  function onPurchaseChange(selectedId: string) {
    setPurchaseId(selectedId);
    setPurchaseLineId('');
    const pur = options?.purchases.find((p) => p.id === selectedId);
    if (pur) {
      setCurrencyCode(pur.currencyCode);
      if (pur.totalAmount && Number(pur.totalAmount) > 0) {
        setAcquisitionCost(pur.totalAmount);
      }
    }
  }

  function onPurchaseLineChange(selectedLineId: string) {
    setPurchaseLineId(selectedLineId);
    const pur = options?.purchases.find((p) => p.id === purchaseId);
    const line = pur?.lines?.find((l) => l.id === selectedLineId);
    if (line) {
      setAcquisitionCost(line.cost);
      if (!assetName) setAssetName(line.title);
    } else if (pur?.totalAmount) {
      setAcquisitionCost(pur.totalAmount);
    }
  }

  async function submitCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    const form = new FormData(event.currentTarget);
    const body = {
      name: assetName.trim(),
      categoryId: String(form.get('categoryId')) || undefined,
      brand: String(form.get('brand')) || undefined,
      model: String(form.get('model')) || undefined,
      serialNumber: String(form.get('serialNumber')) || undefined,
      condition: String(form.get('condition')),
      acquisitionSource,
      acquisitionDate: String(form.get('acquisitionDate')),
      acquisitionCost: acquisitionCost.trim() || undefined,
      currencyCode: currencyCode.trim() || options?.defaultCurrency || 'BDT',
      expenseId: acquisitionSource === 'EXPENSE' ? expenseId || undefined : undefined,
      purchaseId: acquisitionSource === 'PURCHASE' ? purchaseId || undefined : undefined,
      purchaseLineId: acquisitionSource === 'PURCHASE' ? purchaseLineId || undefined : undefined,
      locationId: String(form.get('locationId')) || undefined,
      customLocation: String(form.get('customLocation')) || undefined,
      custodianMembershipId: String(form.get('custodianMembershipId')) || undefined,
      warrantyExpiresOn: String(form.get('warrantyExpiresOn')) || undefined,
      notes: assetNotes.trim() || undefined,
      idempotencyKey: newIdempotencyKey('asset-create'),
    };
    try {
      const created = await fetchApiData<{ id: string }>('/admin/assets', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setCreateOpen(false);
      setFeedback('Asset registered. Financial records remain authoritative in Finance.');
      await load();
      router.push(`/assets/${created.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Asset could not be created.');
    } finally {
      setBusy(false);
    }
  }
  async function submitCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const form = new FormData(event.currentTarget);
    try {
      await fetchApiData('/admin/assets/categories', {
        method: 'POST',
        body: JSON.stringify({
          name: String(form.get('name')),
          description: String(form.get('description')) || undefined,
          idempotencyKey: newIdempotencyKey('asset-category'),
        }),
      });
      setCategoryOpen(false);
      setFeedback('Asset category created.');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Category could not be created.');
    } finally {
      setBusy(false);
    }
  }
  async function toggleCategory(category: AssetCategoryDto) {
    setBusy(true);
    try {
      await fetchApiData(`/admin/assets/categories/${category.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: category.name,
          description: category.description,
          status: category.status === 'ACTIVE' ? 'ARCHIVED' : 'ACTIVE',
          expectedVersion: category.version,
        }),
      });
      setFeedback(
        category.status === 'ACTIVE'
          ? 'Category archived. Existing Assets keep their category.'
          : 'Category restored.',
      );
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Category could not be updated.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="grid gap-5 px-4 py-5 sm:px-6 lg:px-8">
      <Breadcrumb items={[{ label: 'Operations', href: '/' }, { label: 'Assets' }]} />
      <OperationalPageHeader
        eyebrow="Business operations"
        title="Asset Management"
        description="Track durable business property, responsibility, location, maintenance, documents, and financial provenance without mixing it with saleable Inventory."
        actions={
          canManage ? (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => setCategoryOpen(true)}>
                Manage categories
              </Button>
              <Button onClick={() => setCreateOpen(true)}>
                <Plus />
                Register Asset
              </Button>
            </div>
          ) : undefined
        }
      />
      {feedback ? <OperationalFeedback>{feedback}</OperationalFeedback> : null}
      {error ? <OperationalFeedback tone="danger">{error}</OperationalFeedback> : null}
      <Stats aria-label="Asset summary" className="grid-cols-2 lg:grid-cols-6">
        {[
          { label: 'Assets', value: summary?.total ?? '—', Icon: Boxes },
          { label: 'Active', value: summary?.active ?? '—', Icon: Boxes },
          { label: 'Stored', value: summary?.inStorage ?? '—', Icon: Boxes },
          { label: 'Under repair', value: summary?.underRepair ?? '—', Icon: Wrench },
          { label: 'Attention', value: summary?.attention ?? '—', Icon: TriangleAlert },
          {
            label: 'Acquisition cost',
            value: summary
              ? formatAssetMoney(summary.totalAcquisitionCost, summary.currencyCode)
              : '—',
            Icon: CircleDollarSign,
          },
        ].map(({ label, value, Icon }) => (
          <StatsCard key={label}>
            <Icon className="size-4 text-muted-foreground" />
            <StatsTitle>{label}</StatsTitle>
            <StatsValue>{String(value)}</StatsValue>
            <StatsDescription>
              {label === 'Acquisition cost'
                ? 'Historical cost, not book value'
                : 'Current operational count'}
            </StatsDescription>
          </StatsCard>
        ))}
      </Stats>
      <Card>
        <CardContent className="grid gap-3 md:grid-cols-[minmax(14rem,1fr)_12rem_14rem_auto]">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
            <Input
              className="pl-9"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search code, name, serial, or model"
              aria-label="Search Assets"
            />
          </div>
          <NativeSelect
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
            aria-label="Filter by status"
          >
            {statuses.map((value) => (
              <option key={value} value={value}>
                {value === 'ALL' ? 'All statuses' : humanizeAssetCode(value)}
              </option>
            ))}
          </NativeSelect>
          <NativeSelect
            value={categoryId}
            onChange={(e) => {
              setCategoryId(e.target.value);
              setPage(1);
            }}
            aria-label="Filter by category"
          >
            <option value="">All categories</option>
            {options?.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </NativeSelect>
          <Button variant="outline" onClick={() => void load()}>
            Refresh
          </Button>
        </CardContent>
      </Card>
      {loading ? (
        <Skeleton className="h-80 rounded-xl" />
      ) : items.length === 0 ? (
        <OperationalEmptyState
          title="No Assets match this view"
          description="Register existing business property without fabricating a historical Expense, or link new acquisitions to Finance and Supply records."
          action={
            canManage ? (
              <Button onClick={() => setCreateOpen(true)}>
                <Plus />
                Register Asset
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <Card className="hidden md:flex">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Asset</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Location / custodian</TableHead>
                    <TableHead>Acquired</TableHead>
                    <TableHead className="text-right">Cost</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <Link
                          className="font-medium text-primary hover:underline"
                          href={`/assets/${item.id}`}
                        >
                          {item.assetCode} · {item.name}
                        </Link>
                        <p className="text-xs text-muted-foreground">
                          {[item.categoryName, item.brand, item.model, item.serialNumber]
                            .filter(Boolean)
                            .join(' · ') || 'No secondary identifiers'}
                        </p>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={humanizeAssetCode(item.status)} />
                        <p className="mt-1 text-xs text-muted-foreground">
                          {humanizeAssetCode(item.condition)}
                        </p>
                      </TableCell>
                      <TableCell>
                        {item.locationName ?? item.customLocation ?? 'Unlocated'}
                        <p className="text-xs text-muted-foreground">
                          {item.custodianName ?? 'Unassigned'}
                        </p>
                      </TableCell>
                      <TableCell>{formatAssetDate(item.acquisitionDate)}</TableCell>
                      <TableCell className="text-right">
                        {item.acquisitionCost
                          ? formatAssetMoney(item.acquisitionCost, item.currencyCode)
                          : 'Not recorded'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          <div className="grid gap-3 md:hidden">
            {items.map((item) => (
              <Link
                key={item.id}
                href={`/assets/${item.id}`}
                className="rounded-xl border bg-card p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <strong>{item.name}</strong>
                    <p className="text-sm text-muted-foreground">
                      {item.assetCode} · {item.categoryName ?? 'Uncategorized'}
                    </p>
                  </div>
                  <StatusBadge status={humanizeAssetCode(item.status)} />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                  <span>
                    Location
                    <br />
                    <strong>{item.locationName ?? item.customLocation ?? 'Unlocated'}</strong>
                  </span>
                  <span>
                    Custodian
                    <br />
                    <strong>{item.custodianName ?? 'Unassigned'}</strong>
                  </span>
                </div>
              </Link>
            ))}
          </div>
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">{pagination.totalItems} Assets</p>
            <div className="flex gap-2">
              <Button variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                Previous
              </Button>
              <Button
                variant="outline"
                disabled={page >= pagination.totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </>
      )}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Register Asset</DialogTitle>
            <DialogDescription>
              Register existing durable property or connect an acquisition directly to the
              authoritative Expense or Purchase. This action never creates a duplicate financial
              charge.
            </DialogDescription>
          </DialogHeader>
          <form className="grid gap-4" onSubmit={submitCreate}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Asset name"
                name="name"
                value={assetName}
                onChange={(e) => setAssetName(e.target.value)}
                placeholder="e.g. Office Laser Printer, Reception Desk"
                required
              />
              <SelectField label="Category" name="categoryId">
                <option value="">Uncategorized</option>
                {options?.categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </SelectField>
              <Field label="Brand" name="brand" placeholder="e.g. HP, Dell, IKEA" />
              <Field label="Model" name="model" placeholder="e.g. LaserJet Pro M404dn" />
              <Field label="Serial number" name="serialNumber" placeholder="e.g. VNB3K01923" />
              <SelectField label="Condition" name="condition">
                {conditions.map((c) => (
                  <option key={c} value={c}>
                    {humanizeAssetCode(c)}
                  </option>
                ))}
              </SelectField>

              <SelectField
                label="Acquisition source"
                name="acquisitionSource"
                value={acquisitionSource}
                onChange={(e) => {
                  const val = e.target.value;
                  setAcquisitionSource(val);
                  if (val === 'EXISTING' || val === 'GIFT') {
                    setExpenseId('');
                    setPurchaseId('');
                    setPurchaseLineId('');
                  }
                }}
              >
                <option value="EXISTING">Existing property (already owned)</option>
                <option value="EXPENSE">Finance Expense (business or owner-funded)</option>
                <option value="PURCHASE">Procurement Purchase (supplier order)</option>
                <option value="GIFT">Gift / zero-cost property</option>
              </SelectField>

              <Field
                label="Acquisition date"
                name="acquisitionDate"
                type="date"
                defaultValue={today()}
                required
              />
            </div>

            {/* Dynamic acquisition details based on chosen source */}
            {acquisitionSource === 'EXPENSE' ? (
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-primary">
                  <ReceiptText className="size-4" />
                  <span>Linked Finance Expense</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Select the recorded Expense. Funding from a business account or owner capital is
                  automatically derived from its payment records without duplicate accounting.
                </p>
                <SelectField
                  label="Recorded Expense"
                  name="expenseId"
                  value={expenseId}
                  onChange={(e) => onExpenseChange(e.target.value)}
                  required
                >
                  <option value="">Select Expense…</option>
                  {options?.expenses.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.number} · {e.description} ({formatAssetMoney(e.amount, e.currencyCode)}
                      {e.paymentSource === 'OWNER_CAPITAL'
                        ? ` · Owner funded by ${e.contributorName ?? 'Owner'}`
                        : ''}
                      )
                    </option>
                  ))}
                </SelectField>
              </div>
            ) : null}

            {acquisitionSource === 'PURCHASE' ? (
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-primary">
                  <Package className="size-4" />
                  <span>Linked Procurement Purchase</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Connect to a placed or closed purchase order. Sourcing and supplier history remain
                  authoritative in Supply.
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <SelectField
                    label="Purchase Order"
                    name="purchaseId"
                    value={purchaseId}
                    onChange={(e) => onPurchaseChange(e.target.value)}
                    required
                  >
                    <option value="">Select Purchase…</option>
                    {options?.purchases.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.number} · {p.supplierName} ({p.currencyCode})
                      </option>
                    ))}
                  </SelectField>

                  {purchaseId &&
                  options?.purchases.find((p) => p.id === purchaseId)?.lines?.length ? (
                    <SelectField
                      label="Purchase Line Item (optional)"
                      name="purchaseLineId"
                      value={purchaseLineId}
                      onChange={(e) => onPurchaseLineChange(e.target.value)}
                    >
                      <option value="">
                        Whole Purchase (
                        {formatAssetMoney(
                          options?.purchases.find((p) => p.id === purchaseId)?.totalAmount || '0',
                          options?.purchases.find((p) => p.id === purchaseId)?.currencyCode || 'BDT',
                        )}
                        )
                      </option>
                      {options?.purchases
                        .find((p) => p.id === purchaseId)
                        ?.lines?.map((line) => (
                          <option key={line.id} value={line.id}>
                            {line.title} ({line.sku}) —{' '}
                            {formatAssetMoney(
                              line.cost,
                              options?.purchases.find((p) => p.id === purchaseId)?.currencyCode ||
                                'BDT',
                            )}
                          </option>
                        ))}
                    </SelectField>
                  ) : null}
                </div>
              </div>
            ) : null}

            {acquisitionSource === 'EXISTING' || acquisitionSource === 'GIFT' ? (
              <div className="rounded-xl border border-muted bg-muted/40 p-4 space-y-1">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Info className="size-4 text-muted-foreground" />
                  <span>No financial transaction created</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Existing durable equipment and gifted items are registered into physical lifecycle
                  management without fabricating historical financial charges or distorting cash
                  balances.
                </p>
              </div>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Historical cost"
                name="acquisitionCost"
                type="number"
                min="0"
                step="0.0001"
                value={acquisitionCost}
                onChange={(e) => setAcquisitionCost(e.target.value)}
                placeholder={
                  acquisitionSource === 'EXISTING' || acquisitionSource === 'GIFT'
                    ? 'Optional historical cost'
                    : 'Acquisition cost'
                }
                required={acquisitionSource === 'EXPENSE' || (acquisitionSource === 'PURCHASE' && !purchaseLineId)}
              />
              <Field
                label="Currency"
                name="currencyCode"
                value={currencyCode || options?.defaultCurrency || 'BDT'}
                onChange={(e) => setCurrencyCode(e.target.value.toUpperCase())}
                required
              />
              <SelectField label="Business location" name="locationId">
                <option value="">No structured location</option>
                {options?.locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </SelectField>
              <Field
                label="Custom location (instead of business location)"
                name="customLocation"
                placeholder="e.g. Reception Desk, Stall #4"
              />
              <SelectField label="Custodian" name="custodianMembershipId">
                <option value="">Unassigned</option>
                {options?.custodians.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </SelectField>
              <Field label="Warranty expires" name="warrantyExpiresOn" type="date" />
            </div>
            <label className="grid gap-2 text-sm font-medium">
              Notes
              <Textarea
                name="notes"
                rows={3}
                value={assetNotes}
                onChange={(e) => setAssetNotes(e.target.value)}
                placeholder="Add any relevant physical identifiers, accessories, or acquisition remarks…"
              />
            </label>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? 'Registering…' : 'Register Asset'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={categoryOpen} onOpenChange={setCategoryOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Manage Asset categories</DialogTitle>
            <DialogDescription>
              Use a small business-friendly taxonomy; archived categories remain on historical
              Assets.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            {categories.map((category) => (
              <div
                key={category.id}
                className="flex items-center justify-between gap-3 rounded-lg border p-3"
              >
                <div>
                  <strong>{category.name}</strong>
                  <p className="text-xs text-muted-foreground">
                    {category.assetCount} Assets · {humanizeAssetCode(category.status)}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void toggleCategory(category)}
                >
                  {category.status === 'ACTIVE' ? 'Archive' : 'Restore'}
                </Button>
              </div>
            ))}
          </div>
          <form className="grid gap-4 border-t pt-4" onSubmit={submitCategory}>
            <Field label="New category name" name="name" required />
            <label className="grid gap-2 text-sm font-medium">
              Description
              <Textarea name="description" />
            </label>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCategoryOpen(false)}>
                Close
              </Button>
              <Button type="submit" disabled={busy}>
                Create category
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </main>
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
function SelectField({
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
