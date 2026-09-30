'use client';

import { Calculator, CircleDollarSign, Info, Truck } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { CourierQuoteDto } from '@maevelle/contracts';

interface CourierQuoteCardProps {
  quote: CourierQuoteDto;
  customerShippingCharge?: string | null | undefined;
  className?: string | undefined;
  providerName?: string | undefined;
}

function formatMoney(amount?: string | number | null, currency = 'BDT'): string {
  const num = Number(amount ?? 0);
  return new Intl.NumberFormat('en-BD', {
    style: 'currency',
    currency: currency || 'BDT',
    maximumFractionDigits: 2,
  }).format(Number.isNaN(num) ? 0 : num);
}

export function CourierQuoteCard({
  quote,
  customerShippingCharge,
  className,
  providerName = 'Pathao Courier',
}: CourierQuoteCardProps) {
  const courierCost = Number(quote.amount);
  const customerCharge = customerShippingCharge !== undefined && customerShippingCharge !== null
    ? Number(customerShippingCharge)
    : undefined;

  const margin = customerCharge !== undefined ? customerCharge - courierCost : undefined;

  return (
    <Card className={cn('border-primary/20 bg-primary/5 shadow-none', className)}>
      <CardHeader className="p-3 pb-2">
        <CardTitle className="text-xs font-semibold flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-primary">
            <Truck className="size-3.5" /> {providerName} Live Quote
          </span>
          <span className="text-xs font-bold text-foreground">
            {formatMoney(quote.amount, quote.currency)}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-3 pt-0 space-y-2 text-xs">
        <div className="grid grid-cols-3 gap-2 rounded-md bg-background/60 p-2 border">
          <div>
            <p className="text-[10px] text-muted-foreground">Base delivery</p>
            <p className="font-semibold text-foreground">
              {formatMoney(quote.baseAmount ?? quote.amount, quote.currency)}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground">COD fee</p>
            <p className="font-semibold text-foreground">
              {quote.codFeeAmount ? formatMoney(quote.codFeeAmount, quote.currency) : '0 ৳'}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground">Additional</p>
            <p className="font-semibold text-foreground">
              {quote.additionalChargeAmount ? formatMoney(quote.additionalChargeAmount, quote.currency) : '0 ৳'}
            </p>
          </div>
        </div>

        {customerCharge !== undefined ? (
          <div className="flex items-center justify-between pt-1 border-t text-[11px]">
            <div className="flex items-center gap-1 text-muted-foreground">
              <CircleDollarSign className="size-3" />
              <span>Customer Shipping Charged:</span>
              <strong className="text-foreground">{formatMoney(customerCharge, quote.currency)}</strong>
            </div>
            {margin !== undefined ? (
              <span className={cn('font-semibold', margin >= 0 ? 'text-emerald-600' : 'text-amber-600')}>
                {margin >= 0 ? `+${formatMoney(margin, quote.currency)} coverage` : `-${formatMoney(Math.abs(margin), quote.currency)} subsidized`}
              </span>
            ) : null}
          </div>
        ) : null}

        <p className="text-[10px] text-muted-foreground/80 flex items-center gap-1">
          <Info className="size-3 shrink-0" />
          <span>Courier cost is an operational expense recorded separately from customer billing revenue.</span>
        </p>
      </CardContent>
    </Card>
  );
}
