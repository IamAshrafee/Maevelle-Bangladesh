import type { ComponentProps } from 'react';

import { cx } from '@/components/ui/classnames';

export function VisuallyHidden({ className, ...props }: ComponentProps<'span'>) {
  return (
    <span
      className={cx(
        'absolute size-px overflow-hidden whitespace-nowrap border-0 p-0 [clip-path:inset(50%)]',
        className,
      )}
      {...props}
    />
  );
}
