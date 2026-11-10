import type { ComponentProps } from 'react';

import { cx } from '@/components/ui/classnames';
import { presentMoney, type MoneyPresentationMode } from '@maevelle/contracts';

type MoneyProps = Omit<ComponentProps<'span'>, 'children'> & {
  amount: number | string | null | undefined;
  currency?: string;
  locale?: string;
  precision?: 'exact';
  mode?: MoneyPresentationMode;
};

export function Money({
  amount,
  className,
  currency = 'BDT',
  locale = 'en-BD',
  precision,
  mode,
  ...props
}: MoneyProps) {
  const display = presentMoney(amount == null ? null : String(amount), {
    currency,
    mode: mode ?? (precision === 'exact' ? 'EXACT' : 'RETAIL'),
  });
  return (
    <span
      className={cx('tabular-nums', className)}
      translate="no"
      aria-label={display.label}
      data-money-kind={display.kind}
      title={
        display.kind === 'EXACT' && !precision
          ? 'Exact amount; fractional value preserved'
          : undefined
      }
      lang={locale.startsWith('bn') ? 'bn' : undefined}
      {...props}
    >
      {display.text}
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

  const savingsLabel =
    discountBadge || (calculatedSavings ? `${calculatedSavings}% SAVINGS` : undefined);

  return (
    <div
      className={cx(
        'flex flex-wrap items-baseline gap-x-2 gap-y-1 font-semibold text-primary',
        size === 'lg'
          ? 'text-price-lg'
          : size === 'sm'
            ? 'text-body-sm font-bold'
            : 'text-price-md',
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
