'use client';

import { BadgePercent, CalendarClock, Plus, RefreshCw, Tags } from 'lucide-react';
import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';

import {
  OperationalEmptyState,
  OperationalFeedback,
  OperationalPageHeader,
  OperationalWorklistToolbar,
  useOperationalWorklist,
} from './operational-worklist';
import { StatusBadge } from './status-badge';

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
type Promotion = {
  readonly id: string;
  readonly name: string;
  readonly promotionType: 'AUTOMATIC' | 'COUPON';
  readonly status: string;
  readonly startsAt: string | null;
  readonly endsAt: string | null;
  readonly priority: number;
  readonly combinability: string;
  readonly benefitType: string;
  readonly benefitValue: string;
  readonly minimumMerchandiseSubtotal: string | null;
  readonly coupons: readonly { id: string; code: string; status: string }[];
  readonly committedUsageCount: number;
  readonly committedDiscount: string;
  readonly createdAt: string;
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
    <main>
      <section className="shell admin-page">
        <OperationalPageHeader
          eyebrow="Commerce / Pricing"
          title="Variant pricing"
          description="Create exact-money, scheduled Variant prices using named Product and SKU selections."
          actions={
            <button className="button secondary" type="button" onClick={() => void load()}>
              <RefreshCw aria-hidden="true" /> Refresh
            </button>
          }
        />
        {message ? <OperationalFeedback tone={tone}>{message}</OperationalFeedback> : null}
        <section className="commerce-command-layout">
          <form className="panel inset-form" onSubmit={(event) => void submit(event)}>
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
            <button className="button primary" disabled={busy || !product} type="submit">
              <Plus aria-hidden="true" /> Create price
            </button>
          </form>
          <aside className="panel">
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
        <section className="panel worklist-panel">
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
                        {price.amount} {price.currency}
                      </td>
                      <td className="numeric">
                        {price.compareAtAmount ? `${price.compareAtAmount} ${price.currency}` : '—'}
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
      </section>
    </main>
  );
}

export function PromotionsConsole() {
  const [promotions, setPromotions] = useState<readonly Promotion[]>([]);
  const [message, setMessage] = useState('');
  const [tone, setTone] = useState<'success' | 'warning' | 'danger'>('success');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/promotions', {
        credentials: 'include',
        cache: 'no-store',
      });
      if (!response.ok)
        throw new Error(await apiError(response, 'Promotions could not be loaded.'));
      setPromotions(((await response.json()) as { data: readonly Promotion[] }).data);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Promotions could not be loaded.');
      setTone('danger');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const worklist = useOperationalWorklist({
    items: promotions,
    storageKey: 'admin-promotions',
    getSearchText: (promotion) =>
      `${promotion.name} ${promotion.coupons.map((coupon) => coupon.code).join(' ')}`,
    getStatus: (promotion) => promotion.status,
    getReference: (promotion) => promotion.name,
    getTimestamp: (promotion) => promotion.createdAt,
  });
  const committedTotal = useMemo(
    () => promotions.reduce((total, promotion) => total + promotion.committedUsageCount, 0),
    [promotions],
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    setMessage('');
    try {
      const promotionType = data.get('promotionType') as 'AUTOMATIC' | 'COUPON';
      const response = await fetch('/api/admin/promotions', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: data.get('name'),
          promotionType,
          benefitType: data.get('benefitType'),
          benefitValue: data.get('benefitValue'),
          combinability: data.get('combinability'),
          priority: Number(data.get('priority') ?? 0),
          minimumMerchandiseSubtotal:
            String(data.get('minimumMerchandiseSubtotal') ?? '').trim() || undefined,
          startsAt: localDateTime(data.get('startsAt')),
          endsAt: localDateTime(data.get('endsAt')),
        }),
      });
      if (!response.ok)
        throw new Error(await apiError(response, 'Promotion could not be created.'));
      const created = ((await response.json()) as { data: { id: string } }).data;
      const coupon = String(data.get('couponCode') ?? '').trim();
      if (promotionType === 'COUPON' && coupon) {
        const couponResponse = await fetch(`/api/admin/promotions/${created.id}/coupons`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ code: coupon }),
        });
        if (!couponResponse.ok)
          throw new Error(
            await apiError(
              couponResponse,
              'Promotion was created, but its coupon could not be reserved.',
            ),
          );
      }
      setMessage(
        'Promotion created. Cart evaluation remains provisional until successful Order placement.',
      );
      setTone('success');
      form.reset();
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Promotion could not be saved.');
      setTone('danger');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <section className="shell admin-page">
        <OperationalPageHeader
          eyebrow="Commerce / Promotions"
          title="Promotions and coupons"
          description="Create scheduled server-evaluated benefits and review committed commercial usage."
          actions={
            <button className="button secondary" type="button" onClick={() => void load()}>
              <RefreshCw aria-hidden="true" /> Refresh
            </button>
          }
        />
        {message ? <OperationalFeedback tone={tone}>{message}</OperationalFeedback> : null}
        <section className="metric-strip">
          <article>
            <span>Promotions</span>
            <strong>{promotions.length}</strong>
            <small>all lifecycle states</small>
          </article>
          <article>
            <span>Active</span>
            <strong>{promotions.filter((item) => item.status === 'ACTIVE').length}</strong>
            <small>currently eligible</small>
          </article>
          <article>
            <span>Committed usage</span>
            <strong>{committedTotal}</strong>
            <small>Orders only</small>
          </article>
          <article>
            <span>Coupons</span>
            <strong>{promotions.reduce((total, item) => total + item.coupons.length, 0)}</strong>
            <small>reserved codes</small>
          </article>
        </section>
        <section className="commerce-command-layout">
          <form className="panel inset-form" onSubmit={(event) => void submit(event)}>
            <div className="panel-header">
              <div>
                <p className="eyebrow">New campaign</p>
                <h2>Promotion definition</h2>
              </div>
              <BadgePercent aria-hidden="true" />
            </div>
            <label>
              Name
              <input name="name" required placeholder="Eid launch 10%" />
            </label>
            <div className="form-row">
              <label>
                Trigger
                <select name="promotionType" defaultValue="COUPON">
                  <option value="COUPON">Coupon</option>
                  <option value="AUTOMATIC">Automatic</option>
                </select>
              </label>
              <label>
                Benefit
                <select name="benefitType" defaultValue="PERCENTAGE_DISCOUNT">
                  <option value="PERCENTAGE_DISCOUNT">Percentage discount</option>
                  <option value="FIXED_AMOUNT_DISCOUNT">Fixed amount discount</option>
                </select>
              </label>
              <label>
                Value
                <input name="benefitValue" required inputMode="decimal" placeholder="10.0000" />
              </label>
            </div>
            <div className="form-row">
              <label>
                Combinability
                <select name="combinability" defaultValue="EXCLUSIVE">
                  <option value="EXCLUSIVE">Exclusive</option>
                  <option value="STACKABLE">Stackable</option>
                </select>
              </label>
              <label>
                Priority
                <input name="priority" type="number" defaultValue={0} />
              </label>
              <label>
                Minimum subtotal
                <input
                  name="minimumMerchandiseSubtotal"
                  inputMode="decimal"
                  placeholder="Optional"
                />
              </label>
            </div>
            <label>
              Coupon code (coupon campaigns)
              <input name="couponCode" placeholder="SAVE10" autoCapitalize="characters" />
            </label>
            <div className="form-row">
              <label>
                Starts
                <input name="startsAt" type="datetime-local" />
              </label>
              <label>
                Ends
                <input name="endsAt" type="datetime-local" />
              </label>
            </div>
            <button className="button primary" disabled={busy} type="submit">
              <Plus aria-hidden="true" /> Create promotion
            </button>
          </form>
          <aside className="panel">
            <p className="eyebrow">Usage semantics</p>
            <h2>Committed only after Order</h2>
            <p>
              Cart and Checkout previews do not consume redemptions. Usage is committed in the
              successful PlaceOrder transaction.
            </p>
            <OperationalFeedback tone="warning">
              <CalendarClock aria-hidden="true" /> Schedule and benefit rules are evaluated on the
              server.
            </OperationalFeedback>
          </aside>
        </section>
        <OperationalWorklistToolbar
          query={worklist.query}
          onQueryChange={worklist.setQuery}
          status={worklist.status}
          onStatusChange={worklist.setStatus}
          statuses={['ACTIVE', 'DRAFT', 'INACTIVE', 'ARCHIVED']}
          sort={worklist.sort}
          onSortChange={worklist.setSort}
          density={worklist.density}
          onDensityChange={worklist.setDensity}
          resultCount={worklist.visibleItems.length}
          savedViews={worklist.savedViews}
          onSaveView={worklist.saveView}
          onApplyView={worklist.applyView}
          searchLabel="Search promotion or coupon"
        />
        <section className="panel worklist-panel">
          {loading ? (
            <div className="skeleton-list" aria-label="Loading promotions">
              <span />
              <span />
              <span />
            </div>
          ) : worklist.visibleItems.length ? (
            <div className="data-table-shell">
              <table className={worklist.density === 'compact' ? 'density-compact' : ''}>
                <thead>
                  <tr>
                    <th>Promotion</th>
                    <th>Status</th>
                    <th>Benefit</th>
                    <th>Coupon</th>
                    <th>Schedule</th>
                    <th className="numeric">Committed uses</th>
                    <th className="numeric">Discount</th>
                  </tr>
                </thead>
                <tbody>
                  {worklist.visibleItems.map((promotion) => (
                    <tr key={promotion.id}>
                      <td>
                        <strong>{promotion.name}</strong>
                        <br />
                        <small>
                          {promotion.promotionType} · {promotion.combinability}
                        </small>
                      </td>
                      <td>
                        <StatusBadge status={promotion.status} />
                      </td>
                      <td>
                        {promotion.benefitValue}{' '}
                        {promotion.benefitType === 'PERCENTAGE_DISCOUNT' ? '%' : 'BDT'}
                      </td>
                      <td>
                        {promotion.coupons.length
                          ? promotion.coupons.map((coupon) => coupon.code).join(', ')
                          : '—'}
                      </td>
                      <td>
                        {promotion.startsAt
                          ? new Date(promotion.startsAt).toLocaleDateString()
                          : 'Immediate'}{' '}
                        →{' '}
                        {promotion.endsAt
                          ? new Date(promotion.endsAt).toLocaleDateString()
                          : 'Open'}
                      </td>
                      <td className="numeric">{promotion.committedUsageCount}</td>
                      <td className="numeric">{promotion.committedDiscount} BDT</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <OperationalEmptyState
              title="No matching promotions"
              description="Create a campaign or clear the active filters."
            />
          )}
        </section>
      </section>
    </main>
  );
}
