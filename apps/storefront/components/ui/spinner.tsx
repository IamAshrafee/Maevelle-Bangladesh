import type { ComponentProps } from 'react';

import { cx } from '@/components/ui/classnames';
import { VisuallyHidden } from '@/components/ui/visually-hidden';

export type SpinnerSize = 'xs' | 'sm' | 'md' | 'lg';
export type SpinnerVariant = 'current' | 'primary' | 'white';

export type SpinnerProps = ComponentProps<'span'> & {
  label?: string | undefined;
  size?: SpinnerSize | undefined;
  variant?: SpinnerVariant | undefined;
};

const sizeClasses: Record<SpinnerSize, string> = {
  xs: 'size-3.5 border-[1.5px]',
  sm: 'size-4 border-2',
  md: 'size-5 border-2',
  lg: 'size-7 border-[2.5px]',
};

const variantClasses: Record<SpinnerVariant, string> = {
  current: 'border-current border-r-transparent',
  primary: 'border-primary/20 border-t-primary',
  white: 'border-white/30 border-t-white',
};

export function Spinner({
  className,
  label = 'Loading…',
  size = 'md',
  variant = 'current',
  ...props
}: SpinnerProps) {
  return (
    <span className={cx('inline-flex items-center justify-center shrink-0', className)} role="status" {...props}>
      <span
        aria-hidden="true"
        className={cx(
          'block animate-spin rounded-full motion-reduce:animate-none',
          sizeClasses[size],
          variantClasses[variant],
        )}
      />
      <VisuallyHidden>{label}</VisuallyHidden>
    </span>
  );
}
