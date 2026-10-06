import type { ComponentProps, ElementType } from 'react';

import { cx } from '@/components/ui/classnames';

export type SurfaceVariant =
  | 'flat'
  | 'raised'
  | 'floating'
  | 'glass'
  | 'sunken'
  | 'inverse';

const variants: Record<SurfaceVariant, string> = {
  flat: 'border-border/40 bg-surface text-on-surface rounded-xl',
  raised: 'border-border/50 bg-surface-container-lowest text-on-surface shadow-2xs rounded-2xl',
  floating: 'border-border/60 bg-surface-container-lowest text-on-surface shadow-lg rounded-2xl',
  glass: 'border-border/40 bg-surface/85 backdrop-blur-xl text-on-surface shadow-xs rounded-2xl',
  sunken: 'border-border/40 bg-surface-container-low text-on-surface rounded-xl',
  inverse: 'border-transparent bg-inverse-surface text-inverse-on-surface rounded-2xl',
};

export type SurfaceProps = ComponentProps<'div'> & {
  as?: Extract<ElementType, 'article' | 'div' | 'section'> | undefined;
  interactive?: boolean | undefined;
  variant?: SurfaceVariant | undefined;
};

export function Surface({
  as: Element = 'div',
  className,
  interactive = false,
  variant = 'flat',
  ...props
}: SurfaceProps) {
  return (
    <Element
      className={cx(
        'border transition-[background-color,border-color,box-shadow] duration-150',
        variants[variant],
        interactive &&
          'cursor-pointer hover:border-border-strong/70 hover:shadow-xs active:scale-[0.99]',
        className,
      )}
      {...props}
    />
  );
}
