'use client';

import Link from 'next/link';
import { useState, type FormEvent, useEffect } from 'react';
import { ExternalLink, Gift, Info, Package, ReceiptText } from 'lucide-react';
import type {
  AssetAcquisitionSourceDto,
  AssetConditionDto,
  AssetOptionsDto,
} from '@maevelle/contracts';
import { Button } from '@/components/ui/button';
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
import { Textarea } from '@/components/ui/textarea';
import { formatAssetMoney, humanizeAssetCode, newIdempotencyKey } from '@/lib/assets/format';
import { fetchApiData } from '@/lib/api';
import { cn } from '@/lib/utils';

const conditions: readonly AssetConditionDto[] = ['GOOD', 'FAIR', 'NEEDS_REPAIR', 'DAMAGED'];
const today = () => new Date().toISOString().slice(0, 10);

interface AssetRegisterDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  options: AssetOptionsDto | undefined;
  initialSource?: AssetAcquisitionSourceDto | undefined;
  initialExpenseId?: string | undefined;
  initialPurchaseId?: string | undefined;
  initialCost?: string | undefined;
  initialCurrency?: string | undefined;
  initialName?: string | undefined;
  initialDescription?: string | undefined;
  onCreated: (createdAssetId: string) => void;
}

export function AssetRegisterDialog({
  open,
  onOpenChange,
  options,
  initialSource = 'EXISTING',
  initialExpenseId = '',
  initialPurchaseId = '',
  initialCost = '',
  initialCurrency = '',
  initialName = '',
  initialDescription = '',
  onCreated,
}: AssetRegisterDialogProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Controlled form state
  const [acquisitionSource, setAcquisitionSource] =
    useState<AssetAcquisitionSourceDto>(initialSource);
  const [expenseFundingFilter, setExpenseFundingFilter] = useState<'ALL' | 'BUSINESS' | 'OWNER'>(
    'ALL',
  );
  const [expenseId, setExpenseId] = useState(initialExpenseId);
  const [purchaseId, setPurchaseId] = useState(initialPurchaseId);
  const [purchaseLineId, setPurchaseLineId] = useState('');
  const [name, setName] = useState(initialName);
  const [acquisitionCost, setAcquisitionCost] = useState(initialCost);
  const [currencyCode, setCurrencyCode] = useState(
    initialCurrency || options?.defaultCurrency || 'BDT',
  );
  const [notes, setNotes] = useState(initialDescription);

  useEffect(() => {
    if (initialSource) setAcquisitionSource(initialSource);
    if (initialExpenseId) setExpenseId(initialExpenseId);
    if (initialPurchaseId) setPurchaseId(initialPurchaseId);
    if (initialCost) setAcquisitionCost(initialCost);
    if (initialCurrency) setCurrencyCode(initialCurrency);
    if (initialName) setName(initialName);
    if (initialDescription) setNotes(initialDescription);
  }, [
    initialSource,
    initialExpenseId,
    initialPurchaseId,
    initialCost,
    initialCurrency,
    initialName,
    initialDescription,
  ]);

  useEffect(() => {
    if (options && !currencyCode) {
      setCurrencyCode(options.defaultCurrency || 'BDT');
    }
  }, [options, currencyCode]);

  function handleExpenseChange(selectedId: string) {
    setExpenseId(selectedId);
    const exp = options?.expenses.find((e) => e.id === selectedId);
    if (exp) {
      setAcquisitionCost(exp.amount);
      setCurrencyCode(exp.currencyCode);
      if (!name) setName(exp.description);
    }
  }

  function handlePurchaseChange(selectedId: string) {
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

  function handlePurchaseLineChange(selectedLineId: string) {
    setPurchaseLineId(selectedLineId);
    const pur = options?.purchases.find((p) => p.id === purchaseId);
    const line = pur?.lines?.find((l) => l.id === selectedLineId);
    if (line) {
      setAcquisitionCost(line.cost);
      if (!name) setName(line.title);
    } else if (pur?.totalAmount) {
      setAcquisitionCost(pur.totalAmount);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');

    const form = new FormData(event.currentTarget);
    const payload = {
      name: name.trim(),
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
      notes: notes.trim() || undefined,
      idempotencyKey: newIdempotencyKey('asset-create'),
    };

    try {
      const created = await fetchApiData<{ id: string }>('/admin/assets', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      onOpenChange(false);
      onCreated(created.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Asset could not be created.');
    } finally {
      setBusy(false);
    }
  }

  // Filtered expenses based on funding toggle
  const filteredExpenses = (options?.expenses ?? []).filter((e) => {
    if (expenseFundingFilter === 'OWNER') return e.paymentSource === 'OWNER_CAPITAL';
    if (expenseFundingFilter === 'BUSINESS') return e.paymentSource === 'BUSINESS_ACCOUNT';
    return true;
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Register Business Asset</DialogTitle>
          <DialogDescription>
            Record durable property, responsibility, and location. Provenance connects directly to
            Finance or Supply records without creating fake charges or cash movements.
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive font-medium">
            {error}
          </div>
        ) : null}

        <form className="grid gap-5" onSubmit={handleSubmit}>
          {/* Acquisition Provenance Selector */}
          <div className="rounded-xl border bg-muted/30 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-foreground">Acquisition Mode</span>
              <span className="text-xs text-muted-foreground">
                Select how this asset entered the business
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { id: 'EXISTING' as const, label: 'Existing Asset', desc: 'Already owned' },
                { id: 'EXPENSE' as const, label: 'From Expense', desc: 'Business / Owner' },
                { id: 'PURCHASE' as const, label: 'From Purchase', desc: 'Supplier order' },
                { id: 'GIFT' as const, label: 'Gift / Free', desc: 'Zero cost' },
              ].map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => {
                    setAcquisitionSource(mode.id);
                    if (mode.id === 'EXISTING' || mode.id === 'GIFT') {
                      setExpenseId('');
                      setPurchaseId('');
                      setPurchaseLineId('');
                    }
                  }}
                  className={cn(
                    'flex flex-col items-start p-2.5 rounded-lg border text-left transition-all',
                    acquisitionSource === mode.id
                      ? 'border-primary bg-primary/10 text-primary ring-1 ring-primary'
                      : 'border-border bg-card hover:bg-muted/60 text-muted-foreground',
                  )}
                >
                  <strong className="text-xs font-semibold text-foreground">{mode.label}</strong>
                  <span className="text-[10px] mt-0.5">{mode.desc}</span>
                </button>
              ))}
            </div>

            {/* Explanatory Context per Acquisition Mode */}
            {acquisitionSource === 'EXISTING' ? (
              <div className="flex items-start gap-2.5 rounded-lg border border-border bg-card p-3 text-xs text-muted-foreground">
                <Info className="size-4 shrink-0 text-muted-foreground mt-0.5" />
                <div>
                  <strong className="text-foreground font-medium">
                    No financial transaction will be created.
                  </strong>
                  <p className="mt-0.5">
                    For property the business already owned prior to software registration.
                    Historical cost is optional and serves as an audit reference only.
                  </p>
                </div>
              </div>
            ) : null}

            {acquisitionSource === 'GIFT' ? (
              <div className="flex items-start gap-2.5 rounded-lg border border-border bg-card p-3 text-xs text-muted-foreground">
                <Gift className="size-4 shrink-0 text-primary mt-0.5" />
                <div>
                  <strong className="text-foreground font-medium">Zero-cost acquisition.</strong>
                  <p className="mt-0.5">
                    For donated, gifted, or free durable items. Enters physical lifecycle with no
                    cash ledger impact.
                  </p>
                </div>
              </div>
            ) : null}

            {acquisitionSource === 'EXPENSE' ? (
              <div className="space-y-3 rounded-lg border border-primary/20 bg-primary/5 p-3.5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-primary">
                    <ReceiptText className="size-4" />
                    <span>Link to Recorded Finance Expense</span>
                  </div>
                  <div className="flex items-center gap-1 text-xs">
                    <span className="text-muted-foreground mr-1">Filter by funding:</span>
                    <button
                      type="button"
                      onClick={() => setExpenseFundingFilter('ALL')}
                      className={cn(
                        'px-2 py-0.5 rounded text-[11px] font-medium border',
                        expenseFundingFilter === 'ALL'
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-background text-muted-foreground',
                      )}
                    >
                      All
                    </button>
                    <button
                      type="button"
                      onClick={() => setExpenseFundingFilter('OWNER')}
                      className={cn(
                        'px-2 py-0.5 rounded text-[11px] font-medium border',
                        expenseFundingFilter === 'OWNER'
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-background text-muted-foreground',
                      )}
                    >
                      Owner Funded
                    </button>
                    <button
                      type="button"
                      onClick={() => setExpenseFundingFilter('BUSINESS')}
                      className={cn(
                        'px-2 py-0.5 rounded text-[11px] font-medium border',
                        expenseFundingFilter === 'BUSINESS'
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'bg-background text-muted-foreground',
                      )}
                    >
                      Business Account
                    </button>
                  </div>
                </div>

                <SelectField
                  label="Select Expense"
                  name="expenseId"
                  value={expenseId}
                  onChange={(e) => handleExpenseChange(e.target.value)}
                  required
                >
                  <option value="">Choose an Expense…</option>
                  {filteredExpenses.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.number} · {e.description} ({formatAssetMoney(e.amount, e.currencyCode)})
                      {e.paymentSource === 'OWNER_CAPITAL'
                        ? ` · 👤 Owner funded by ${e.contributorName ?? 'Owner'}`
                        : ' · 🏦 Business Account'}
                    </option>
                  ))}
                </SelectField>

                <p className="text-[11px] text-muted-foreground flex items-center justify-between">
                  <span>
                    Funding details and ledger entries will be derived automatically from this
                    Expense.
                  </span>
                  <Link
                    href="/finance/expenses"
                    target="_blank"
                    className="text-primary hover:underline inline-flex items-center gap-1 font-medium ml-2"
                  >
                    <span>Record new Expense</span>
                    <ExternalLink className="size-3" />
                  </Link>
                </p>
              </div>
            ) : null}

            {acquisitionSource === 'PURCHASE' ? (
              <div className="space-y-3 rounded-lg border border-primary/20 bg-primary/5 p-3.5">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-primary">
                  <Package className="size-4" />
                  <span>Link to Procurement Purchase Order</span>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <SelectField
                    label="Purchase Order"
                    name="purchaseId"
                    value={purchaseId}
                    onChange={(e) => handlePurchaseChange(e.target.value)}
                    required
                  >
                    <option value="">Choose Purchase…</option>
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
                      onChange={(e) => handlePurchaseLineChange(e.target.value)}
                    >
                      <option value="">
                        Whole Purchase (
                        {formatAssetMoney(
                          options?.purchases.find((p) => p.id === purchaseId)?.totalAmount || '0',
                          options?.purchases.find((p) => p.id === purchaseId)?.currencyCode ||
                            'BDT',
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

                <p className="text-[11px] text-muted-foreground flex items-center justify-between">
                  <span>
                    Only durable capital items should be registered as Assets (not saleable stock or
                    tape).
                  </span>
                  <Link
                    href="/purchases"
                    target="_blank"
                    className="text-primary hover:underline inline-flex items-center gap-1 font-medium ml-2"
                  >
                    <span>View Purchases</span>
                    <ExternalLink className="size-3" />
                  </Link>
                </p>
              </div>
            ) : null}
          </div>

          {/* Primary Asset Identity */}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Asset Name"
              name="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
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

            <Field
              label="Brand / Manufacturer"
              name="brand"
              placeholder="e.g. HP, Apple, Herman Miller"
            />
            <Field label="Model" name="model" placeholder="e.g. LaserJet Pro 404, MacBook Pro M3" />
            <Field label="Serial Number" name="serialNumber" placeholder="e.g. VNB3K01923" />

            <SelectField label="Physical Condition" name="condition" defaultValue="GOOD">
              {conditions.map((c) => (
                <option key={c} value={c}>
                  {humanizeAssetCode(c)}
                </option>
              ))}
            </SelectField>
          </div>

          {/* Acquisition Date and Cost */}
          <div className="grid gap-4 sm:grid-cols-3">
            <Field
              label="Acquisition Date"
              name="acquisitionDate"
              type="date"
              defaultValue={today()}
              required
            />
            <Field
              label="Historical Cost"
              name="acquisitionCost"
              type="number"
              min="0"
              step="0.0001"
              value={acquisitionCost}
              onChange={(e) => setAcquisitionCost(e.target.value)}
              placeholder={
                acquisitionSource === 'EXISTING' || acquisitionSource === 'GIFT'
                  ? 'Optional'
                  : 'Acquisition cost'
              }
              required={
                acquisitionSource === 'EXPENSE' ||
                (acquisitionSource === 'PURCHASE' && !purchaseLineId)
              }
            />
            <Field
              label="Currency"
              name="currencyCode"
              value={currencyCode || options?.defaultCurrency || 'BDT'}
              onChange={(e) => setCurrencyCode(e.target.value.toUpperCase())}
              required
            />
          </div>

          {/* Location and Custodian */}
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField label="Business Location" name="locationId">
              <option value="">No structured location</option>
              {options?.locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} ({l.code})
                </option>
              ))}
            </SelectField>

            <Field
              label="Custom / Specific Location"
              name="customLocation"
              placeholder="e.g. Reception Desk, Stall #4, Server Rack B"
            />

            <SelectField label="Custodian / Assigned Member" name="custodianMembershipId">
              <option value="">Unassigned (General custody)</option>
              {options?.custodians.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </SelectField>

            <Field label="Warranty Expiry Date" name="warrantyExpiresOn" type="date" />
          </div>

          <label className="grid gap-1.5 text-xs font-medium text-foreground">
            Operational Notes & Remarks
            <Textarea
              name="notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add physical identifiers, included accessories, purchase invoice number, or setup notes…"
            />
          </label>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? 'Registering Asset…' : 'Register Asset'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, ...props }: { label: string } & React.ComponentProps<typeof Input>) {
  return (
    <Label className="grid gap-1.5 text-xs font-medium text-foreground">
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
    <Label className="grid gap-1.5 text-xs font-medium text-foreground">
      {label}
      <NativeSelect {...props}>{children}</NativeSelect>
    </Label>
  );
}
