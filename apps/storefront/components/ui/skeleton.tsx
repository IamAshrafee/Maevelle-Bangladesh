import type { ComponentProps } from 'react';

import { cx } from '@/components/ui/classnames';

export function Skeleton({ className, ...props }: ComponentProps<'span'>) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        'block animate-pulse rounded-md bg-secondary motion-reduce:animate-none',
        className,
      )}
      {...props}
    />
  );
}
