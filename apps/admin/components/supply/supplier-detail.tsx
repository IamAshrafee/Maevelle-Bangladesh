'use client';

import Link from 'next/link';
import { ArrowLeft, ExternalLink, Mail, MapPin, Phone, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';

import type {
  ApiEnvelope,
  PaginatedResultDto,
  PurchaseDto,
  SupplierDto,
} from '@maevelle/contracts';

import { useAdminCapability } from '@/components/admin-capabilities';
import { OperationalEmptyState, OperationalFeedback } from '@/components/operational-worklist';
import { DetailMetric, DetailSection, DetailSkeleton } from '@/components/supply/supply-entity-ui';
import { StatusBadge } from '@/components/status-badge';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';
import { formatSupplyDate, formatSupplyMoney, supplyRequest } from '@/lib/supply/api';
import { nextPurchaseAction, purchaseWorkflowStatus } from '@/lib/supply/status';
import type { PagedEnvelope } from '@/lib/supply/types';

type SupplierInvoice = {
  currency_code: string;
  outstanding: string;
  source_domain: string | null;
  source_id: string | null;
};

export function SupplierDetail({ supplierId }: { supplierId: string }) {
  const canManage = useAdminCapability('procurement.manage');
  const canViewFinance = useAdminCapability('finance.expenses.view');
  const [supplier, setSupplier] = useState<SupplierDto>();
  const [purchases, setPurchases] = useState<readonly PurchaseDto[]>([]);
  const [invoices, setInvoices] = useState<readonly SupplierInvoice[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([
      supplyRequest<ApiEnvelope<SupplierDto>>(`/admin/suppliers/${supplierId}`, {
        signal: controller.signal,
      }),
      supplyRequest<PagedEnvelope<PurchaseDto>>(
        `/admin/purchases?supplierId=${encodeURIComponent(supplierId)}&pageSize=100`,
        { signal: controller.signal },
      ),
      canViewFinance
        ? supplyRequest<ApiEnvelope<PaginatedResultDto<SupplierInvoice>>>(
            '/admin/finance/expenses?sourceDomain=procurement.purchase&pageSize=100',
            { signal: controller.signal },
          )
        : Promise.resolve({
            data: {
              items: [] as readonly SupplierInvoice[],
              pagination: { page: 1, pageSize: 100, totalItems: 0, totalPages: 0 },
            },
          }),
    ])
      .then(([supplierResult, purchaseResult, invoiceResult]) => {
        setSupplier(supplierResult.data);
        setPurchases(purchaseResult.data);
        const purchaseIds = new Set(purchaseResult.data.map((purchase) => purchase.id));
        setInvoices(
          invoiceResult.data.items.filter(
            (invoice) =>
              invoice.source_domain === 'procurement.purchase' &&
              invoice.source_id !== null &&
              purchaseIds.has(invoice.source_id),
          ),
        );
        setState('ready');
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setMessage(error instanceof Error ? error.message : 'Supplier could not be loaded.');
        setState('error');
      });
    return () => controller.abort();
  }, [canViewFinance, supplierId]);

  if (state === 'loading') return <DetailSkeleton />;
  if (!supplier) {
    return (
      <main className="space-y-5 px-4 py-5 sm:px-6 lg:px-8">
        <OperationalFeedback tone="danger">
          {message || 'Supplier was not found.'}
        </OperationalFeedback>
        <Button variant="outline" render={<Link href="/suppliers" />}>
          <ArrowLeft /> Back to suppliers
        </Button>
      </main>
    );
  }

  const totalsByCurrency = purchases.reduce<Record<string, number>>((totals, purchase) => {
    if (purchase.status !== 'CANCELLED')
      totals[purchase.currencyCode] =
        (totals[purchase.currencyCode] ?? 0) + Number(purchase.totalAmount);
    return totals;
  }, {});
  const openPurchases = purchases.filter(
    (purchase) => !['RECEIVED', 'CANCELLED'].includes(purchaseWorkflowStatus(purchase)),
  );
  const outstandingByCurrency = invoices.reduce<Record<string, number>>((totals, invoice) => {
    totals[invoice.currency_code] =
      (totals[invoice.currency_code] ?? 0) + Number(invoice.outstanding);
    return totals;
  }, {});

  return (
    <main className="min-w-0 space-y-5 px-4 py-5 sm:px-6 lg:px-8">
      <Breadcrumb
        mobileMode="back"
        items={[
          { label: 'Supply', href: '/supply' },
          { label: 'Suppliers', href: '/suppliers' },
          { label: supplier.name, current: true },
        ]}
      />
      <header className="flex flex-col gap-4 border-b pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-pretty text-2xl font-semibold tracking-tight">{supplier.name}</h1>
            <StatusBadge status={supplier.status} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {supplier.code} · {supplier.supplierType.replaceAll('_', ' ').toLowerCase()}
          </p>
        </div>
        {canManage && supplier.status === 'ACTIVE' ? (
          <Button render={<Link href={`/purchases?create=purchase&supplier=${supplier.id}`} />}>
            <Plus /> New purchase
          </Button>
        ) : null}
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <DetailMetric
          label="Open purchases"
          value={openPurchases.length}
          hint={`${purchases.length} purchases in history`}
        />
        <DetailMetric
          label="Purchase value"
          value={
            Object.entries(totalsByCurrency).length
              ? Object.entries(totalsByCurrency).map(([currency, total]) => (
                  <span className="mr-2" key={currency}>
                    {formatSupplyMoney(String(total), currency)}
                  </span>
                ))
              : 'No purchases'
          }
          hint="Excludes cancelled purchases"
        />
        <DetailMetric
          label="Outstanding"
          value={
            canViewFinance && Object.entries(outstandingByCurrency).length
              ? Object.entries(outstandingByCurrency).map(([currency, total]) => (
                  <span className="mr-2" key={currency}>
                    {formatSupplyMoney(String(total), currency)}
                  </span>
                ))
              : canViewFinance
                ? 'Nothing due'
                : 'Finance access required'
          }
          hint="Linked supplier invoices"
        />
        <DetailMetric
          label="Buying setup"
          value={supplier.preferredCurrencyCode ?? 'No preferred currency'}
          hint={
            [
              supplier.countryCode ? `Country ${supplier.countryCode}` : undefined,
              supplier.leadTimeDays === undefined
                ? undefined
                : `${supplier.leadTimeDays} day lead time`,
              supplier.paymentTerms,
            ]
              .filter(Boolean)
              .join(' · ') || 'Terms not set'
          }
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
        <DetailSection
          title="Supplier details"
          description="Sourcing and contact information used by buyers."
        >
          <dl className="grid gap-4 p-4 text-sm">
            <div className="flex gap-3">
              <Mail className="mt-0.5 size-4 text-muted-foreground" />
              <div>
                <dt className="text-xs text-muted-foreground">Contact</dt>
                <dd className="font-medium">{supplier.contactName ?? 'No main contact'}</dd>
                <dd>
                  {supplier.contactEmail ? (
                    <a
                      className="text-primary hover:underline"
                      href={`mailto:${supplier.contactEmail}`}
                    >
                      {supplier.contactEmail}
                    </a>
                  ) : (
                    'No email'
                  )}
                </dd>
              </div>
            </div>
            <div className="flex gap-3">
              <Phone className="mt-0.5 size-4 text-muted-foreground" />
              <div>
                <dt className="text-xs text-muted-foreground">Phone</dt>
                <dd>
                  {supplier.contactPhone ? (
                    <a className="hover:underline" href={`tel:${supplier.contactPhone}`}>
                      {supplier.contactPhone}
                    </a>
                  ) : (
                    'Not set'
                  )}
                </dd>
              </div>
            </div>
            <div className="flex gap-3">
              <MapPin className="mt-0.5 size-4 text-muted-foreground" />
              <div>
                <dt className="text-xs text-muted-foreground">Country</dt>
                <dd>{supplier.countryCode ?? 'Not set'}</dd>
              </div>
            </div>
            {supplier.websiteUrl ? (
              <div className="flex gap-3">
                <ExternalLink className="mt-0.5 size-4 text-muted-foreground" />
                <div>
                  <dt className="text-xs text-muted-foreground">Website</dt>
                  <dd>
                    <a
                      className="break-all text-primary hover:underline"
                      href={supplier.websiteUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {supplier.websiteUrl}
                    </a>
                  </dd>
                </div>
              </div>
            ) : null}
          </dl>
          {supplier.notes ? (
            <p className="border-t p-4 text-sm text-muted-foreground whitespace-pre-wrap">
              {supplier.notes}
            </p>
          ) : null}
        </DetailSection>

        <DetailSection
          title="Purchase history"
          description="Current work and completed supplier orders."
        >
          {!purchases.length ? (
            <OperationalEmptyState
              title="No purchases from this supplier"
              description="Create the first purchase when you are ready to order."
              action={
                canManage ? (
                  <Button
                    render={<Link href={`/purchases?create=purchase&supplier=${supplier.id}`} />}
                  >
                    <Plus /> Create purchase
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className="divide-y">
              {purchases.map((purchase) => (
                <Link
                  className="flex flex-col gap-2 p-4 no-underline hover:bg-muted/50 sm:flex-row sm:items-center sm:justify-between"
                  href={`/purchases/${purchase.id}`}
                  key={purchase.id}
                >
                  <div>
                    <p className="font-medium">{purchase.purchaseNumber}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatSupplyDate(purchase.orderDate)} · {nextPurchaseAction(purchase)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium tabular-nums">
                      {formatSupplyMoney(purchase.totalAmount, purchase.currencyCode)}
                    </span>
                    <StatusBadge status={purchaseWorkflowStatus(purchase)} />
                  </div>
                </Link>
              ))}
            </div>
          )}
        </DetailSection>
      </div>
    </main>
  );
}
