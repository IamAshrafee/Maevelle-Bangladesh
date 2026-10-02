'use client';

import Link from 'next/link';
import { Banknote, Building, ExternalLink, Package, ReceiptText, UserCheck } from 'lucide-react';
import type { AssetDetailDto } from '@maevelle/contracts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatAssetDate, formatAssetMoney, humanizeAssetCode } from '@/lib/assets/format';

interface AssetFinancialTabProps {
  asset: AssetDetailDto;
}

export function AssetFinancialTab({ asset }: AssetFinancialTabProps) {
  const fin = asset.financial;

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {/* Acquisition Provenance Card */}
      <Card>
        <CardHeader>
          <CardTitle>Acquisition Provenance</CardTitle>
          <CardDescription>
            Historical acquisition snapshot and links to source documents.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <DetailItem
            label="Acquisition Source"
            value={humanizeAssetCode(asset.acquisitionSource)}
          />
          <DetailItem label="Acquisition Date" value={formatAssetDate(asset.acquisitionDate)} />
          <DetailItem
            label="Historical Cost"
            value={
              asset.acquisitionCost ? (
                <span className="font-mono font-semibold text-base">
                  {formatAssetMoney(asset.acquisitionCost, asset.currencyCode)}
                </span>
              ) : (
                <span className="text-muted-foreground italic">Not recorded</span>
              )
            }
          />
          <DetailItem
            label="Valuation & Depreciation"
            value="Historical cost snapshot only; no statutory depreciation applied"
          />

          {fin.expense ? (
            <div className="sm:col-span-2 rounded-lg border bg-muted/30 p-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block mb-1">
                Linked Finance Expense
              </span>
              <div className="flex items-center justify-between">
                <Link
                  className="font-medium text-primary hover:underline flex items-center gap-1.5"
                  href={`/finance/expenses/${fin.expense.id}`}
                >
                  <ReceiptText className="size-4 shrink-0" />
                  <span>
                    {fin.expense.number} ·{' '}
                    {formatAssetMoney(fin.expense.amount, asset.currencyCode)}
                  </span>
                  <ExternalLink className="size-3 shrink-0 ml-1" />
                </Link>
                <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded font-mono">
                  {fin.expense.status}
                </span>
              </div>
            </div>
          ) : null}

          {fin.purchase ? (
            <div className="sm:col-span-2 rounded-lg border bg-muted/30 p-3 space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground block">
                Linked Procurement Purchase
              </span>
              <div className="flex items-center justify-between">
                <Link
                  className="font-medium text-primary hover:underline flex items-center gap-1.5"
                  href={`/purchases/${fin.purchase.id}`}
                >
                  <Package className="size-4 shrink-0" />
                  <span>
                    {fin.purchase.number} · {fin.purchase.supplierName}
                  </span>
                  <ExternalLink className="size-3 shrink-0 ml-1" />
                </Link>
                <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded font-mono">
                  {fin.purchase.status}
                </span>
              </div>

              {fin.purchaseLine ? (
                <div className="pt-1.5 border-t text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">Purchase Line: </span>
                  <span>{fin.purchaseLine.title}</span>
                  <span className="font-mono ml-1.5">({fin.purchaseLine.sku})</span>
                </div>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Funding & Proceeds Card */}
      <Card>
        <CardHeader>
          <CardTitle>Funding & Settlement History</CardTitle>
          <CardDescription>
            Actual cash flow provenance derived from immutable Finance ledgers.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {fin.payments.length === 0 && !fin.sale ? (
            <div className="rounded-lg border border-dashed p-6 text-center text-xs text-muted-foreground">
              <p>No linked Finance payments or sale proceeds recorded.</p>
              <p className="mt-1">
                Existing property and gifted assets legitimately have no cash movement.
              </p>
            </div>
          ) : (
            fin.payments.map((p) => {
              const isOwnerCapital = p.source === 'OWNER_CAPITAL';
              const isBusinessAccount = p.source === 'BUSINESS_ACCOUNT';

              return (
                <div
                  key={p.id}
                  className="rounded-lg border bg-card p-3.5 flex flex-col gap-1.5 shadow-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-foreground">
                      {formatAssetMoney(p.amount, asset.currencyCode)}
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full border ${
                        isOwnerCapital
                          ? 'bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/20'
                          : isBusinessAccount
                            ? 'bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/20'
                            : 'bg-muted text-muted-foreground border-border'
                      }`}
                    >
                      {isOwnerCapital ? (
                        <UserCheck className="size-3 shrink-0" />
                      ) : (
                        <Building className="size-3 shrink-0" />
                      )}
                      <span>{humanizeAssetCode(p.source)}</span>
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-xs text-muted-foreground pt-1 border-t">
                    <div>
                      {isOwnerCapital && p.contributorId ? (
                        <Link
                          href={`/finance/capital?contributorId=${p.contributorId}`}
                          className="font-medium text-primary hover:underline inline-flex items-center gap-1"
                        >
                          <span>Funded by {p.contributorName ?? 'Owner'}</span>
                          <ExternalLink className="size-3" />
                        </Link>
                      ) : isBusinessAccount && p.accountId ? (
                        <Link
                          href={`/finance/accounts/${p.accountId}`}
                          className="font-medium text-primary hover:underline inline-flex items-center gap-1"
                        >
                          <span>Paid from {p.accountName}</span>
                          <ExternalLink className="size-3" />
                        </Link>
                      ) : (
                        <span>{p.accountName ?? p.contributorName ?? 'Finance'}</span>
                      )}
                    </div>
                    <span>{formatAssetDate(p.paidAt, true)}</span>
                  </div>
                </div>
              );
            })
          )}

          {/* Sale Proceeds */}
          {fin.sale ? (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Banknote className="size-5 text-emerald-600 dark:text-emerald-400" />
                  <strong className="text-sm font-semibold text-emerald-950 dark:text-emerald-100">
                    Asset Sale Proceeds
                  </strong>
                </div>
                <span className="font-mono font-bold text-base text-emerald-800 dark:text-emerald-300">
                  {formatAssetMoney(fin.sale.amount, fin.sale.currencyCode)}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Proceeds deposited to{' '}
                <Link
                  href={`/finance/accounts/${fin.sale.accountId}`}
                  className="font-semibold text-foreground hover:underline inline-flex items-center gap-1"
                >
                  <span>{fin.sale.accountName}</span>
                  <ExternalLink className="size-3" />
                </Link>{' '}
                on {formatAssetDate(fin.sale.occurredAt, true)}.
              </p>
              <div className="pt-1 text-[11px] font-mono text-muted-foreground">
                Transaction ID: {fin.sale.transactionId}
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function DetailItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="mt-1 text-sm font-medium">{value}</div>
    </div>
  );
}
