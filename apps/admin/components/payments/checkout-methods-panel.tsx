'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Banknote, CreditCard, ExternalLink, RefreshCw, Smartphone } from 'lucide-react';
import type { CheckoutPaymentMethodStatusDto } from '@maevelle/contracts';
import { checkoutDeliveryAreas } from '@maevelle/contracts';
import { useAdminContext } from '../admin-capabilities';
import { StatusBadge } from '../status-badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/components/ui/toast';
import { fetchApiData } from '@/lib/api';
import { paymentError } from '@/lib/payments/transport';
import { PaymentNotice, PaymentQueryState } from './payment-ui';
import { usePaymentPermission, usePaymentQuery } from './use-payment-query';

const path = '/admin/payments/checkout-methods';
const labels: Record<string, string> = {
  COD: 'Cash on Delivery (COD)',
  BKASH_MANUAL: 'bKash (Manual)',
  NAGAD_MANUAL: 'Nagad (Manual)',
};

const methodIcons: Record<string, typeof Banknote> = {
  COD: Banknote,
  BKASH_MANUAL: Smartphone,
  NAGAD_MANUAL: Smartphone,
};

export function CheckoutMethodsPanel({
  onOpenWallets,
}: {
  onOpenWallets?: (() => void) | undefined;
}) {
  const { organizationId, isOwner } = useAdminContext();
  const view = usePaymentPermission('payments.view');
  const manage = usePaymentPermission('payments.manage');
  const viewDestinations = usePaymentPermission('payments.destinations.view');
  const query = usePaymentQuery<readonly CheckoutPaymentMethodStatusDto[]>(view ? path : null);
  const [busyMethod, setBusyMethod] = useState<string | null>(null);
  const [error, setError] = useState('');

  if (!view) return <PaymentNotice>Payment viewing permission is required.</PaymentNotice>;

  async function change(row: CheckoutPaymentMethodStatusDto) {
    if (busyMethod) return;
    setBusyMethod(row.method);
    setError('');
    try {
      await fetchApiData(`${path}/${row.method}`, {
        method: 'PUT',
        headers: { 'x-organization-id': organizationId },
        body: JSON.stringify({ status: row.enabled ? 'DISABLED' : 'ACTIVE' }),
      });
      toast.add({
        title: `${labels[row.method]} ${row.enabled ? 'disabled' : 'enabled'} for checkout`,
        type: 'success',
      });
    } catch (error) {
      setError(paymentError(error));
    } finally {
      query.refresh();
      setBusyMethod(null);
    }
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-foreground">Storefront Checkout Methods</h3>
          <p className="text-xs text-muted-foreground">
            Control which payment options are presented to shoppers on the Maevelle storefront.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={Boolean(busyMethod) || query.loading}
          onClick={query.refresh}
        >
          <RefreshCw className="size-3.5" />
          Refresh
        </Button>
      </div>

      {error && (
        <p role="alert" className="text-xs text-destructive bg-destructive/10 border border-destructive/20 p-2.5 rounded-lg">
          {error}
        </p>
      )}

      <PaymentQueryState query={query}>
        <div className="grid gap-3">
          {query.data?.map((row) => {
            const Icon = methodIcons[row.method] ?? CreditCard;
            const isBusy = busyMethod === row.method;

            return (
              <Card key={row.method} className="border-border bg-card shadow-2xs">
                <CardContent className="grid gap-4 p-4 sm:p-5 sm:grid-cols-[1fr_auto] items-start">
                  <div className="min-w-0 space-y-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="flex items-center gap-2">
                        <div className="flex size-7 items-center justify-center rounded-md bg-muted text-foreground">
                          <Icon className="size-4" />
                        </div>
                        <h4 className="font-semibold text-foreground text-sm sm:text-base">
                          {labels[row.method]}
                        </h4>
                      </div>
                      <StatusBadge
                        status={
                          row.available
                            ? 'ACTIVE'
                            : row.reason === 'ORDERS_PAUSED'
                              ? 'ON_HOLD'
                              : 'DISABLED'
                        }
                      />
                    </div>

                    <p className="text-xs text-muted-foreground leading-relaxed">
                      {row.reason === 'ORDERS_PAUSED'
                        ? 'New storefront orders are paused.'
                        : row.reason === 'METHOD_DISABLED'
                          ? 'This payment method is disabled. Turn on to offer at checkout.'
                          : row.reason === 'SETUP_REQUIRED'
                            ? row.method === 'COD'
                              ? 'An active Checkout policy and approved delivery rates are required before activation.'
                              : 'This method needs an approved receiving account, review deadlines, and Checkout policy.'
                            : `Available for ${row.deliveryAreas.map((area) => checkoutDeliveryAreas[area].label).join(' and ')} delivery.`}
                    </p>

                    {row.wallet && (
                      <div className="grid grid-cols-3 gap-2 rounded-lg bg-muted/30 p-2.5 text-xs text-center sm:text-left">
                        <div>
                          <span className="block text-[11px] text-muted-foreground">Account Number</span>
                          <span className="font-mono text-xs font-semibold tabular-nums text-foreground">
                            ••••••{row.wallet.receivingNumberEnding}
                          </span>
                        </div>
                        <div>
                          <span className="block text-[11px] text-muted-foreground">Time to Pay</span>
                          <span className="font-mono text-xs font-semibold tabular-nums text-foreground">
                            {row.wallet.submissionMinutes} mins
                          </span>
                        </div>
                        <div>
                          <span className="block text-[11px] text-muted-foreground">Review Window</span>
                          <span className="font-mono text-xs font-semibold tabular-nums text-foreground">
                            {row.wallet.reviewMinutes} mins
                          </span>
                        </div>
                      </div>
                    )}

                    <div className="flex flex-wrap items-center gap-3 pt-1">
                      {row.reason === 'SETUP_REQUIRED' &&
                        row.method !== 'COD' &&
                        viewDestinations &&
                        onOpenWallets && (
                          <Button
                            variant="link"
                            className="h-auto p-0 text-xs text-primary font-medium"
                            onClick={onOpenWallets}
                          >
                            Manage receiving accounts →
                          </Button>
                        )}
                      {row.reason === 'ORDERS_PAUSED' && isOwner && (
                        <Button
                          variant="link"
                          className="h-auto p-0 text-xs text-primary font-medium"
                          render={<Link href="/settings/checkout" />}
                        >
                          Checkout settings
                          <ExternalLink className="ml-1 size-3" />
                        </Button>
                      )}
                    </div>
                  </div>

                  {manage && (row.enabled || row.canEnable) && (
                    <div className="flex sm:flex-col items-center justify-end">
                      <Button
                        size="sm"
                        variant={row.enabled ? 'outline' : 'default'}
                        className="h-9 px-4 text-xs font-semibold w-full sm:w-auto"
                        disabled={isBusy}
                        onClick={() => void change(row)}
                        aria-label={`${row.enabled ? 'Disable' : 'Enable'} ${labels[row.method]}`}
                      >
                        {isBusy
                          ? 'Saving…'
                          : row.enabled
                            ? 'Disable for Checkout'
                            : 'Enable for Checkout'}
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </PaymentQueryState>
    </div>
  );
}
