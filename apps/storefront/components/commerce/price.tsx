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
  locale?: string;
  originalAmount?: number | string;
  size?: 'md' | 'lg';
};

export function Price({
  amount,
  className,
  currency = 'BDT',
  locale = 'en-BD',
  originalAmount,
  size = 'md',
  ...props
}: PriceProps) {
  return (
    <div
      className={cx(
        'flex flex-wrap items-baseline gap-x-2 gap-y-1 font-semibold text-foreground',
        size === 'lg' ? 'text-price-lg' : 'text-price-md',
        className,
      )}
      {...props}
    >
      <Money amount={amount} currency={currency} locale={locale} />
      {originalAmount !== undefined ? (
        <Money
          amount={originalAmount}
          className="text-body-sm font-normal text-foreground-muted line-through"
          currency={currency}
          locale={locale}
        />
      ) : null}
    </div>
  );
}
