import type { ComponentProps } from 'react';

import { cx } from '@/components/ui/classnames';
import { formatMoney } from '@/lib/format/money';

type MoneyProps = Omit<ComponentProps<'span'>, 'children'> & {
  amount: number | string;
  currency?: string;
  locale?: string;
};

export function Money({
  amount,
  className,
  currency = 'BDT',
  locale = 'en-BD',
  ...props
}: MoneyProps) {
  return (
    <span className={cx('tabular-nums', className)} translate="no" {...props}>
      {formatMoney(String(amount), currency, locale)}
    </span>
  );
}

type PriceProps = ComponentProps<'div'> & {
  amount: number | string;
  currency?: string;
  discountBadge?: string;
  locale?: string;
  originalAmount?: number | string;
  showSavings?: boolean;
  size?: 'sm' | 'md' | 'lg';
};

export function Price({
  amount,
  className,
  currency = 'BDT',
  discountBadge,
  locale = 'en-BD',
  originalAmount,
  showSavings = true,
  size = 'md',
  ...props
}: PriceProps) {
  const numAmount = Number(amount);
  const numOriginal = originalAmount !== undefined ? Number(originalAmount) : undefined;
  const calculatedSavings =
    numOriginal && numOriginal > numAmount
      ? Math.round(((numOriginal - numAmount) / numOriginal) * 100)
      : undefined;

  const savingsLabel = discountBadge || (calculatedSavings ? `${calculatedSavings}% SAVINGS` : undefined);

  return (
    <div
      className={cx(
        'flex flex-wrap items-baseline gap-x-2 gap-y-1 font-semibold text-primary',
        size === 'lg' ? 'text-price-lg' : size === 'sm' ? 'text-body-sm font-bold' : 'text-price-md',
        className,
      )}
      {...props}
    >
      <Money amount={amount} currency={currency} locale={locale} />
      {originalAmount !== undefined ? (
        <Money
          amount={originalAmount}
          className="text-body-sm font-normal text-outline line-through"
          currency={currency}
          locale={locale}
        />
      ) : null}
      {showSavings && savingsLabel ? (
        <span className="rounded-md bg-secondary-fixed px-1.5 py-0.5 text-label-sm text-[10px] font-bold text-on-secondary-fixed">
          {savingsLabel}
        </span>
      ) : null}
    </div>
  );
}
