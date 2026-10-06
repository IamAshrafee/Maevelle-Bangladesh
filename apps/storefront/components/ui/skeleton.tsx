import type { ComponentProps } from 'react';

import { cx } from '@/components/ui/classnames';

export type SkeletonVariant = 'text' | 'circular' | 'rounded' | 'card' | 'button';

export type SkeletonProps = ComponentProps<'span'> & {
  variant?: SkeletonVariant | undefined;
};

const variantClasses: Record<SkeletonVariant, string> = {
  text: 'h-4 w-full rounded',
  circular: 'rounded-full aspect-square',
  rounded: 'rounded-xl',
  card: 'w-full h-48 rounded-2xl',
  button: 'h-11 w-28 rounded-full',
};

export function Skeleton({
  className,
  variant = 'rounded',
  ...props
}: SkeletonProps) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        'block animate-pulse bg-surface-container/80 motion-reduce:animate-none',
        variantClasses[variant],
        className,
      )}
      {...props}
    />
  );
}
