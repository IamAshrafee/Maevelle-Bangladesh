'use client';

import { Plus, Tags } from 'lucide-react';
import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';

import { Stats, StatsCard, StatsTitle, StatsValue, StatsDescription } from '@/components/ui/stats';
import {
  OperationalEmptyState,
  OperationalFeedback,
  OperationalPageHeader,
  OperationalWorklistToolbar,
  useOperationalWorklist,
} from './operational-worklist';
import { StatusBadge } from './status-badge';
import { Button } from '@/components/ui/button';
import { RefreshButton } from '@/components/ui/refresh-button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatMoney } from '@/lib/format/numbers';

type Product = { readonly id: string; readonly title: string; readonly handle: string };
type ProductWorkspace = Product & {
  readonly variants: readonly { id: string; sku: string; status: string }[];
};
type Price = {
  readonly priceDefinitionId: string;
  readonly productId: string;
  readonly productTitle: string;
  readonly variantId: string;
  readonly sku: string;
  readonly amount: string;
  readonly compareAtAmount: string | null;
  readonly currency: string;
  readonly effectiveFrom: string;
  readonly effectiveTo: string | null;
  readonly status: string;
  readonly version: number;
};

async function apiError(response: Response, fallback: string) {
  const payload = (await response.json().catch(() => ({}))) as {
    error?: string | { message?: string };
  };
  return typeof payload.error === 'string' ? payload.error : (payload.error?.message ?? fallback);
}

function localDateTime(value: FormDataEntryValue | null) {
  const text = String(value ?? '');
  return text ? new Date(text).toISOString() : undefined;
}

export function PricingConsole() {
  const [prices, setPrices] = useState<readonly Price[]>([]);
  const [products, setProducts] = useState<readonly Product[]>([]);
  const [product, setProduct] = useState<ProductWorkspace | null>(null);
  const [message, setMessage] = useState('');
  const [tone, setTone] = useState<'success' | 'warning' | 'danger'>('success');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [priceResponse, productResponse] = await Promise.all([
        fetch('/api/admin/pricing/prices', { credentials: 'include', cache: 'no-store' }),
        fetch('/api/admin/catalog/products', { credentials: 'include', cache: 'no-store' }),
      ]);
      if (!priceResponse.ok)
        throw new Error(await apiError(priceResponse, 'Prices could not be loaded.'));
      if (!productResponse.ok)
        throw new Error(await apiError(productResponse, 'Products could not be loaded.'));
      setPrices(((await priceResponse.json()) as { data: readonly Price[] }).data);
      setProducts(((await productResponse.json()) as { data: readonly Product[] }).data);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Pricing workspace could not be loaded.');
      setTone('danger');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const worklist = useOperationalWorklist({
    items: prices,
    storageKey: 'admin-pricing',
    getSearchText: (price) => `${price.productTitle} ${price.sku} ${price.currency}`,
    getStatus: (price) => price.status,
    getReference: (price) => price.sku,
    getTimestamp: (price) => price.effectiveFrom,
  });

  async function chooseProduct(productId: string) {
    if (!productId) return setProduct(null);
    setBusy(true);
    try {
      const response = await fetch(`/api/admin/catalog/products/${productId}`, {
        credentials: 'include',
        cache: 'no-store',
      });
      if (!response.ok) throw new Error(await apiError(response, 'Product could not be loaded.'));
      setProduct(((await response.json()) as { data: ProductWorkspace }).data);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Product could not be loaded.');
      setTone('danger');
    } finally {
      setBusy(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    setMessage('');
    try {
      const effectiveTo = localDateTime(data.get('effectiveTo'));
      const response = await fetch('/api/admin/pricing/prices', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          variantId: data.get('variantId'),
          currency: data.get('currency'),
          amount: data.get('amount'),
          compareAtAmount: String(data.get('compareAtAmount') ?? '').trim() || null,
          effectiveFrom: localDateTime(data.get('effectiveFrom')),
          ...(effectiveTo ? { effectiveTo } : {}),
          status: data.get('status'),
        }),
      });
      if (!response.ok)
        throw new Error(await apiError(response, 'Price definition could not be created.'));
      setMessage(
        'Authoritative Variant price definition created. Overlapping active schedules remain blocked.',
      );
      setTone('success');
      form.reset();
      setProduct(null);
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Price could not be saved.');
      setTone('danger');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex flex-col gap-6 p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full min-w-0">
        <OperationalPageHeader
          eyebrow="Commerce / Pricing"
          title="Variant pricing"
          description="Create exact-money, scheduled Variant prices using named Product and SKU selections."
          actions={
            <RefreshButton onRefresh={() => void load()} tooltip="Refresh pricing" />
          }
        />
        {message ? <OperationalFeedback tone={tone}>{message}</OperationalFeedback> : null}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <form className="lg:col-span-2 rounded-xl border border-border bg-card p-5 text-card-foreground shadow-2xs space-y-4" onSubmit={(event) => void submit(event)}>
            <div className="panel-header">
              <div>
                <p className="eyebrow">New definition</p>
                <h2>Set Variant price</h2>
              </div>
              <Tags aria-hidden="true" />
            </div>
            <label>
              Product
              <select
                required
                defaultValue=""
                onChange={(event) => void chooseProduct(event.target.value)}
              >
                <option value="" disabled>
                  Choose Product
                </option>
                {products.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Variant / SKU
              <select name="variantId" required defaultValue="">
                <option value="" disabled>
                  Choose SKU
                </option>
                {product?.variants.map((variant) => (
                  <option key={variant.id} value={variant.id}>
                    {variant.sku}
                  </option>
                ))}
              </select>
            </label>
            <div className="form-row">
              <label>
                Currency
                <select name="currency" defaultValue="BDT">
                  <option value="BDT">BDT</option>
                  <option value="USD">USD</option>
                  <option value="CNY">CNY</option>
                </select>
              </label>
              <label>
                Selling price
                <input
                  name="amount"
                  required
                  inputMode="decimal"
                  pattern="\d+(\.\d{1,4})?"
                  placeholder="1290.0000"
                />
              </label>
              <label>
                Compare-at price
                <input
                  name="compareAtAmount"
                  inputMode="decimal"
                  pattern="\d+(\.\d{1,4})?"
                  placeholder="1490.0000"
                />
              </label>
            </div>
            <div className="form-row">
              <label>
                Effective from
                <input name="effectiveFrom" type="datetime-local" />
              </label>
              <label>
                Effective to
                <input name="effectiveTo" type="datetime-local" />
              </label>
              <label>
                Status
                <select name="status" defaultValue="ACTIVE">
                  <option value="ACTIVE">Active</option>
                  <option value="DRAFT">Draft</option>
                </select>
              </label>
            </div>
            <OperationalFeedback tone="warning">
              Active date ranges for one SKU and currency cannot overlap.
            </OperationalFeedback>
            <Button type="submit" disabled={busy || !product} className="gap-1.5">
            <Plus className="size-4" aria-hidden="true" /> Create price
          </Button>
        </form>
        <aside className="rounded-xl border border-border bg-card p-5 text-card-foreground shadow-2xs space-y-2">
            <p className="eyebrow">Pricing authority</p>
            <h2>Server-resolved truth</h2>
            <p>
              Catalog identifies the Variant. Pricing owns the effective money definition used by
              Storefront, Cart, Checkout, and Promotions.
            </p>
            <p>
              Historical definitions remain visible; operators add a new schedule instead of
              overwriting commercial history.
            </p>
          </aside>
        </section>
        <OperationalWorklistToolbar
          query={worklist.query}
          onQueryChange={worklist.setQuery}
          status={worklist.status}
          onStatusChange={worklist.setStatus}
          statuses={['ACTIVE', 'DRAFT', 'ARCHIVED']}
          sort={worklist.sort}
          onSortChange={worklist.setSort}
          density={worklist.density}
          onDensityChange={worklist.setDensity}
          resultCount={worklist.visibleItems.length}
          savedViews={worklist.savedViews}
          onSaveView={worklist.saveView}
          onApplyView={worklist.applyView}
          searchLabel="Search Product, SKU, or currency"
        />
        <section className="rounded-xl border border-border bg-card p-5 text-card-foreground shadow-2xs space-y-4">
          {loading ? (
            <div className="skeleton-list" aria-label="Loading prices">
              <span />
              <span />
              <span />
            </div>
          ) : worklist.visibleItems.length ? (
            <div className="data-table-shell">
              <table className={worklist.density === 'compact' ? 'density-compact' : ''}>
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>SKU</th>
                    <th>Status</th>
                    <th className="numeric">Price</th>
                    <th className="numeric">Compare at</th>
                    <th>Effective</th>
                    <th>Ends</th>
                  </tr>
                </thead>
                <tbody>
                  {worklist.visibleItems.map((price) => (
                    <tr key={price.priceDefinitionId}>
                      <td>
                        <strong>{price.productTitle}</strong>
                      </td>
                      <td>{price.sku}</td>
                      <td>
                        <StatusBadge status={price.status} />
                      </td>
                      <td className="numeric">
                        {formatMoney(price.amount, price.currency)}
                      </td>
                      <td className="numeric">
                        {price.compareAtAmount
                          ? formatMoney(price.compareAtAmount, price.currency)
                          : '—'}
                      </td>
                      <td>{new Date(price.effectiveFrom).toLocaleString()}</td>
                      <td>
                        {price.effectiveTo
                          ? new Date(price.effectiveTo).toLocaleString()
                          : 'Open ended'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <OperationalEmptyState
              title="No matching prices"
              description="Create the first price or clear the active filters."
            />
          )}
        </section>
    </main>
  );
}

