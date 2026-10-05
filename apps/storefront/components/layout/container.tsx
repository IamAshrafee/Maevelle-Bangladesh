import type { ComponentProps } from 'react';

import { cx } from '@/components/ui/classnames';

type ContainerProps = ComponentProps<'div'> & {
  size?: 'main' | 'narrow' | 'full';
};

const sizes: Record<NonNullable<ContainerProps['size']>, string> = {
  main: 'max-w-storefront',
  narrow: 'max-w-narrow',
  full: 'max-w-none',
};

export function Container({ className, size = 'main', ...props }: ContainerProps) {
  return (
    <div
      className={cx('mx-auto w-full px-gutter md:px-gutter-desktop', sizes[size], className)}
      {...props}
    />
  );
}
