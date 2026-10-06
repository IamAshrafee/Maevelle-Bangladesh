import type { ComponentProps, ElementType, ReactNode } from 'react';

import { cx } from '@/components/ui/classnames';

export type HeadingVariant =
  | 'display'
  | 'heading-xl'
  | 'heading-lg'
  | 'heading-md'
  | 'heading-sm';

const headingVariants: Record<HeadingVariant, string> = {
  display: 'font-serif text-3xl sm:text-4xl lg:text-5xl font-semibold tracking-tight text-primary text-balance',
  'heading-xl': 'font-serif text-2xl sm:text-3xl font-semibold tracking-tight text-on-surface text-balance',
  'heading-lg': 'font-serif text-xl sm:text-2xl font-semibold tracking-tight text-on-surface text-balance',
  'heading-md': 'font-sans text-lg sm:text-xl font-semibold tracking-tight text-on-surface text-balance',
  'heading-sm': 'font-sans text-sm sm:text-base font-semibold text-on-surface text-pretty',
};

export type HeadingProps = Omit<ComponentProps<'h2'>, 'children'> & {
  as?: Extract<ElementType, 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'span' | 'div'> | undefined;
  children: ReactNode;
  level?: 1 | 2 | 3 | 4 | 5 | 6 | undefined;
  variant?: HeadingVariant | undefined;
};

export function Heading({
  as: Component,
  children,
  className,
  level = 2,
  variant = 'heading-md',
  ...props
}: HeadingProps) {
  const Tag = Component ?? (`h${level}` as ElementType);

  return (
    <Tag className={cx('m-0', headingVariants[variant], className)} {...props}>
      {children}
    </Tag>
  );
}

export type TextSize = 'lead' | 'body-lg' | 'body-md' | 'body-sm' | 'caption';

const textSizes: Record<TextSize, string> = {
  lead: 'text-base sm:text-lg text-on-surface-variant font-normal leading-relaxed',
  'body-lg': 'text-base text-on-surface-variant leading-relaxed',
  'body-md': 'text-sm text-on-surface-variant leading-relaxed',
  'body-sm': 'text-xs text-on-surface-variant leading-relaxed',
  caption: 'text-[11px] text-on-surface-variant/75 leading-normal',
};

export type TextProps = ComponentProps<'p'> & {
  as?: 'p' | 'span' | 'div';
  size?: TextSize | undefined;
};

export function Text({
  as: Element = 'p',
  className,
  size = 'body-md',
  ...props
}: TextProps) {
  return (
    <Element
      className={cx('m-0 text-pretty', textSizes[size], className)}
      {...props}
    />
  );
}

export type KickerProps = ComponentProps<'span'>;

export function Kicker({ className, ...props }: KickerProps) {
  return (
    <span
      className={cx(
        'block font-label-sm text-[10px] sm:text-xs font-semibold uppercase tracking-[0.24em] text-on-surface-variant/80 select-none',
        className,
      )}
      {...props}
    />
  );
}

export type MoneyProps = ComponentProps<'span'> & {
  amount: number | string;
  compareAtAmount?: (number | string) | undefined;
  currency?: string | undefined;
};

export function Money({
  amount,
  className,
  compareAtAmount,
  currency = '৳',
  ...props
}: MoneyProps) {
  return (
    <span className={cx('inline-flex items-baseline gap-1.5 font-mono tabular-nums', className)} {...props}>
      <span className="font-semibold text-primary">
        {currency}
        {amount}
      </span>
      {compareAtAmount && (
        <span className="text-xs text-on-surface-variant/60 line-through">
          {currency}
          {compareAtAmount}
        </span>
      )}
    </span>
  );
}
