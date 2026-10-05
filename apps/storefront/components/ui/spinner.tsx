import type { ComponentProps } from 'react';

import { cx } from '@/components/ui/classnames';
import { VisuallyHidden } from '@/components/ui/visually-hidden';

type SpinnerProps = ComponentProps<'span'> & {
  label?: string;
  size?: 'sm' | 'md';
};

export function Spinner({ className, label = 'Loading…', size = 'md', ...props }: SpinnerProps) {
  return (
    <span className={cx('inline-flex items-center', className)} role="status" {...props}>
      <span
        aria-hidden="true"
        className={cx(
          'block animate-spin rounded-full border-2 border-current border-r-transparent motion-reduce:animate-none',
          size === 'sm' ? 'size-4' : 'size-5',
        )}
      />
      <VisuallyHidden>{label}</VisuallyHidden>
    </span>
  );
}
