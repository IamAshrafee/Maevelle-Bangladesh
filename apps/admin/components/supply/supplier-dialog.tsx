'use client';

import { type FormEvent, useEffect, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import type { ApiEnvelope, SupplierDto, SupplierStatusDto, SupplierTypeDto } from '@maevelle/contracts';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { supplyRequest } from '@/lib/supply/api';

export interface SupplierDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly supplier?: SupplierDto | undefined;
  readonly onSuccess?: (saved: SupplierDto) => void;
}

const SUPPLIER_TYPES: { value: SupplierTypeDto; label: string }[] = [
  { value: 'MANUFACTURER', label: 'Manufacturer' },
  { value: 'WHOLESALER', label: 'Wholesaler' },
  { value: 'DISTRIBUTOR', label: 'Distributor' },
  { value: 'AGENT', label: 'Sourcing Agent' },
  { value: 'LOCAL_VENDOR', label: 'Local Vendor' },
  { value: 'OTHER', label: 'Other' },
];

const SUPPLIER_STATUSES: { value: SupplierStatusDto; label: string }[] = [
  { value: 'ACTIVE', label: 'Active (Open for orders)' },
  { value: 'INACTIVE', label: 'Inactive (Paused)' },
  { value: 'BLOCKED', label: 'Blocked (Restricted)' },
  { value: 'ARCHIVED', label: 'Archived' },
];

export function SupplierDialog({
  open,
  onOpenChange,
  supplier,
  onSuccess,
}: SupplierDialogProps) {
  const isEditing = Boolean(supplier);

  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [status, setStatus] = useState<SupplierStatusDto>('ACTIVE');
  const [supplierType, setSupplierType] = useState<SupplierTypeDto>('MANUFACTURER');
  const [countryCode, setCountryCode] = useState('CN');
  const [preferredCurrencyCode, setPreferredCurrencyCode] = useState<'BDT' | 'CNY' | 'USD' | ''>('CNY');
  const [leadTimeDays, setLeadTimeDays] = useState<string>('14');
  const [paymentTerms, setPaymentTerms] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [notes, setNotes] = useState('');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setError(null);
      if (supplier) {
        setName(supplier.name);
        setCode(supplier.code);
        setStatus(supplier.status);
        setSupplierType(supplier.supplierType);
        setCountryCode(supplier.countryCode ?? '');
        setPreferredCurrencyCode(supplier.preferredCurrencyCode ?? '');
        setLeadTimeDays(supplier.leadTimeDays !== undefined ? String(supplier.leadTimeDays) : '');
        setPaymentTerms(supplier.paymentTerms ?? '');
        setWebsiteUrl(supplier.websiteUrl ?? '');
        setContactName(supplier.contactName ?? '');
        setContactEmail(supplier.contactEmail ?? '');
        setContactPhone(supplier.contactPhone ?? '');
        setNotes(supplier.notes ?? '');
      } else {
        setName('');
        setCode('');
        setStatus('ACTIVE');
        setSupplierType('MANUFACTURER');
        setCountryCode('CN');
        setPreferredCurrencyCode('CNY');
        setLeadTimeDays('14');
        setPaymentTerms('30% deposit, 70% before dispatch');
        setWebsiteUrl('');
        setContactName('');
        setContactEmail('');
        setContactPhone('');
        setNotes('');
      }
    }
  }, [open, supplier]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      setError('Supplier name is required.');
      return;
    }
    if (!isEditing && !code.trim()) {
      setError('Supplier code is required.');
      return;
    }

    setSaving(true);
    setError(null);

    const payload = {
      name: name.trim(),
      status,
      supplierType,
      countryCode: countryCode.trim().toUpperCase() || undefined,
      preferredCurrencyCode: preferredCurrencyCode || undefined,
      leadTimeDays: leadTimeDays ? Math.max(0, parseInt(leadTimeDays, 10)) : undefined,
      paymentTerms: paymentTerms.trim() || undefined,
      websiteUrl: websiteUrl.trim() || undefined,
      contactName: contactName.trim() || undefined,
      contactEmail: contactEmail.trim() || undefined,
      contactPhone: contactPhone.trim() || undefined,
      notes: notes.trim() || undefined,
    };

    try {
      if (isEditing && supplier) {
        const response = await supplyRequest<ApiEnvelope<SupplierDto>>(
          `/admin/suppliers/${supplier.id}`,
          {
            method: 'PATCH',
            body: JSON.stringify({
              version: supplier.version,
              ...payload,
            }),
          },
        );
        onSuccess?.(response.data);
      } else {
        const response = await supplyRequest<ApiEnvelope<SupplierDto>>('/admin/suppliers', {
          method: 'POST',
          body: JSON.stringify({
            code: code.trim().toUpperCase(),
            ...payload,
          }),
        });
        onSuccess?.(response.data);
      }
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save supplier.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEditing ? 'Edit Supplier Profile' : 'Add New Supplier'}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? `Update commercial terms, contact details, and lead time for ${supplier?.name}.`
              : 'Register a manufacturer, wholesaler, or vendor with buying agreements and lead time defaults.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error ? (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
              {error}
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="supplier-name">Supplier Name *</FieldLabel>
              <Input
                id="supplier-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Guangzhou Silk Garments Co."
                required
                disabled={saving}
              />
            </Field>

            <Field>
              <FieldLabel htmlFor="supplier-code">Supplier Code *</FieldLabel>
              <Input
                id="supplier-code"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="e.g. CN-SILK-01"
                required={!isEditing}
                disabled={isEditing || saving}
                className="font-mono"
              />
              {isEditing ? (
                <FieldDescription>Supplier code is permanent once assigned.</FieldDescription>
              ) : (
                <FieldDescription>Unique identifier used across POs and shipments.</FieldDescription>
              )}
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field>
              <FieldLabel htmlFor="supplier-type">Supplier Type</FieldLabel>
              <NativeSelect
                id="supplier-type"
                value={supplierType}
                onChange={(e) => setSupplierType(e.target.value as SupplierTypeDto)}
                disabled={saving}
                className="w-full"
              >
                {SUPPLIER_TYPES.map((t) => (
                  <NativeSelectOption key={t.value} value={t.value}>
                    {t.label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>

            <Field>
              <FieldLabel htmlFor="supplier-status">Status</FieldLabel>
              <NativeSelect
                id="supplier-status"
                value={status}
                onChange={(e) => setStatus(e.target.value as SupplierStatusDto)}
                disabled={saving}
                className="w-full"
              >
                {SUPPLIER_STATUSES.map((s) => (
                  <NativeSelectOption key={s.value} value={s.value}>
                    {s.label}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>

            <Field>
              <FieldLabel htmlFor="supplier-currency">Preferred Currency</FieldLabel>
              <NativeSelect
                id="supplier-currency"
                value={preferredCurrencyCode}
                onChange={(e) => setPreferredCurrencyCode(e.target.value as any)}
                disabled={saving}
                className="w-full"
              >
                <NativeSelectOption value="">Not Set</NativeSelectOption>
                <NativeSelectOption value="CNY">CNY (Chinese Yuan)</NativeSelectOption>
                <NativeSelectOption value="USD">USD (US Dollar)</NativeSelectOption>
                <NativeSelectOption value="BDT">BDT (Bangladeshi Taka)</NativeSelectOption>
              </NativeSelect>
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field>
              <FieldLabel htmlFor="supplier-country">Country Code</FieldLabel>
              <Input
                id="supplier-country"
                value={countryCode}
                onChange={(e) => setCountryCode(e.target.value.toUpperCase().slice(0, 2))}
                placeholder="CN, BD, VN"
                maxLength={2}
                disabled={saving}
                className="font-mono uppercase"
              />
              <FieldDescription>2-letter ISO code (e.g. CN, BD)</FieldDescription>
            </Field>

            <Field>
              <FieldLabel htmlFor="supplier-lead-time">Lead Time (Days)</FieldLabel>
              <Input
                id="supplier-lead-time"
                type="number"
                min="0"
                value={leadTimeDays}
                onChange={(e) => setLeadTimeDays(e.target.value)}
                placeholder="14"
                disabled={saving}
              />
              <FieldDescription>Auto-sets PO expected arrival</FieldDescription>
            </Field>

            <Field>
              <FieldLabel htmlFor="supplier-website">Website URL</FieldLabel>
              <Input
                id="supplier-website"
                type="url"
                value={websiteUrl}
                onChange={(e) => setWebsiteUrl(e.target.value)}
                placeholder="https://supplier.com"
                disabled={saving}
              />
            </Field>
          </div>

          <Field>
            <FieldLabel htmlFor="supplier-terms">Commercial & Payment Terms</FieldLabel>
            <Input
              id="supplier-terms"
              value={paymentTerms}
              onChange={(e) => setPaymentTerms(e.target.value)}
              placeholder="e.g. Net 30, or 30% deposit, 70% before dispatch"
              disabled={saving}
            />
          </Field>

          <div className="rounded-lg border bg-muted/30 p-3">
            <p className="text-xs font-semibold text-foreground">Primary Contact Details</p>
            <div className="mt-2.5 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Field>
                <FieldLabel htmlFor="contact-name">Contact Person</FieldLabel>
                <Input
                  id="contact-name"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  placeholder="Manager / Agent name"
                  disabled={saving}
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="contact-email">Email</FieldLabel>
                <Input
                  id="contact-email"
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  placeholder="sales@supplier.com"
                  disabled={saving}
                />
              </Field>

              <Field>
                <FieldLabel htmlFor="contact-phone">Phone / WhatsApp</FieldLabel>
                <Input
                  id="contact-phone"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  placeholder="+86 138 0000 0000"
                  disabled={saving}
                />
              </Field>
            </div>
          </div>

          <Field>
            <FieldLabel htmlFor="supplier-notes">Internal Notes</FieldLabel>
            <Textarea
              id="supplier-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Factory capabilities, production quality notes, bank details, or communication preferences..."
              rows={3}
              disabled={saving}
            />
          </Field>

          <DialogFooter className="pt-2">
            <DialogClose render={<Button type="button" variant="outline" disabled={saving} />}>
              Cancel
            </DialogClose>
            <Button type="submit" disabled={saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
              <span>{isEditing ? 'Save Changes' : 'Create Supplier'}</span>
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
