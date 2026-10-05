import type { ComponentProps, ReactNode } from 'react';

import { cx } from '@/components/ui/classnames';

type HeadingVariant = 'display' | 'heading-lg' | 'heading-md' | 'heading-sm';

const headingVariants: Record<HeadingVariant, string> = {
  display: 'font-serif text-display font-semibold text-balance',
  'heading-lg': 'font-serif text-heading-lg font-semibold text-balance',
  'heading-md': 'font-sans text-heading-md font-semibold text-balance',
  'heading-sm': 'font-sans text-heading-sm font-semibold text-pretty',
};

type HeadingProps = Omit<ComponentProps<'h2'>, 'children'> & {
  children: ReactNode;
  level?: 1 | 2 | 3 | 4;
  variant?: HeadingVariant;
};

export function Heading({
  children,
  className,
  level = 2,
  variant = 'heading-md',
  ...props
}: HeadingProps) {
  const classes = cx('m-0 text-foreground', headingVariants[variant], className);

  if (level === 1)
    return (
      <h1 className={classes} {...props}>
        {children}
      </h1>
    );
  if (level === 3)
    return (
      <h3 className={classes} {...props}>
        {children}
      </h3>
    );
  if (level === 4)
    return (
      <h4 className={classes} {...props}>
        {children}
      </h4>
    );
  return (
    <h2 className={classes} {...props}>
      {children}
    </h2>
  );
}

type TextProps = ComponentProps<'p'> & {
  as?: 'p' | 'span';
  size?: 'lg' | 'md' | 'sm' | 'caption';
};

const textSizes: Record<NonNullable<TextProps['size']>, string> = {
  lg: 'text-body-lg',
  md: 'text-body-md',
  sm: 'text-body-sm',
  caption: 'text-caption',
};

export function Text({ as: Element = 'p', className, size = 'md', ...props }: TextProps) {
  return (
    <Element
      className={cx('m-0 text-pretty text-foreground-muted', textSizes[size], className)}
      {...props}
    />
  );
}
