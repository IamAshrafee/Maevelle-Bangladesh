'use client';
import { useState } from 'react';
import Link from 'next/link';
import type { CashReadPageDto, FractionalRetailPriceDto } from '@maevelle/contracts';
import { AdminPage, PageHeader, PagePanel, EmptyState } from '@/components/ui/page-shell';
import { Button } from '@/components/ui/button';
import { usePaymentQuery, usePaymentPermission } from '../payments/use-payment-query';
import {
  PaymentMoney,
  PaymentNotice,
  PaymentQueryState,
  PaymentPager,
} from '../payments/payment-ui';

export function RetailPriceReview() {
  const allowed = usePaymentPermission('pricing.view'),
    [page, setPage] = useState(1);
  const q = usePaymentQuery<CashReadPageDto<FractionalRetailPriceDto>>(
    allowed ? `/admin/pricing/fractional-retail-prices?page=${page}&pageSize=20` : null,
  );
  return (
    <AdminPage variant="wide">
      <PageHeader
        breadcrumbs={[
          { label: 'Products', href: '/products' },
          { label: 'Price Review', current: true },
        ]}
        eyebrow="Catalog Pricing"
        title="Fractional retail price review"
        description="Read-only exact prices. Review business pricing before changing current records."
        actions={
          <Button variant="outline" onClick={q.refresh}>
            Refresh prices
          </Button>
        }
      />
      <PaymentNotice>
        Whole-BDT selling prices are the intended direction. The authoritative whole-retail
        authoring policy is not active; current selling-price endpoints still accept valid exact
        fractions. No bulk normalization is available. Procurement and landed costs retain
        fractional precision.
      </PaymentNotice>
      {!allowed ? (
        <PaymentNotice>Pricing viewing permission is required.</PaymentNotice>
      ) : (
        <PaymentQueryState query={q}>
          {q.data?.items.length ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {q.data.items.map((r) => (
                <PagePanel key={`${r.source}:${r.id}`}>
                  <h2 className="break-words font-semibold">{r.title}</h2>
                  <p className="text-sm text-muted-foreground">
                    {r.source.replaceAll('_', ' ')} · {r.status}
                  </p>
                  <div className="my-3">
                    <PaymentMoney value={r.amount} label="Exact stored record" />
                  </div>
                  <p className="text-sm">Requires pricing review; no proposed rounded price.</p>
                  {r.productId ? (
                    <Button
                      className="mt-3"
                      variant="outline"
                      render={<Link href={`/products/${r.productId}/edit`} />}
                    >
                      Review product price
                    </Button>
                  ) : (
                    <p className="mt-3 text-sm text-muted-foreground">
                      Shipping policy review required.
                    </p>
                  )}
                </PagePanel>
              ))}
            </div>
          ) : (
            <EmptyState title="No fractional retail records on this page" />
          )}
          {q.data && (
            <PaymentPager page={page} pageSize={20} total={q.data.total} onPage={setPage} />
          )}
        </PaymentQueryState>
      )}
    </AdminPage>
  );
}
