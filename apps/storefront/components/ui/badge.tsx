import type { ComponentProps } from 'react';

import { cx } from '@/components/ui/classnames';

type BadgeVariant = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info';

const variants: Record<BadgeVariant, string> = {
  neutral: 'border-border bg-surface-muted text-foreground-muted',
  brand: 'border-rose-200 bg-primary-subtle text-primary',
  success: 'border-success/20 bg-success-subtle text-success-foreground',
  warning: 'border-warning/20 bg-warning-subtle text-warning-foreground',
  danger: 'border-danger/20 bg-danger-subtle text-danger-foreground',
  info: 'border-info/20 bg-info-subtle text-info-foreground',
};

type BadgeProps = ComponentProps<'span'> & { variant?: BadgeVariant };

export function Badge({ className, variant = 'neutral', ...props }: BadgeProps) {
  return (
    <span
      className={cx(
        'inline-flex min-h-6 items-center gap-1 rounded-full border px-2 py-0.5 text-caption font-semibold',
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}
