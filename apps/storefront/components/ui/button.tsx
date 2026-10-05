import type { ComponentProps } from 'react';

import { cx } from '@/components/ui/classnames';
import { Spinner } from '@/components/ui/spinner';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

const variants: Record<ButtonVariant, string> = {
  primary:
    'border-primary bg-primary text-primary-foreground hover:border-primary-hover hover:bg-primary-hover active:border-primary-active active:bg-primary-active',
  secondary:
    'border-secondary bg-secondary text-secondary-foreground hover:border-secondary-hover hover:bg-secondary-hover active:border-rose-200 active:bg-rose-200',
  outline:
    'border-border-strong bg-surface text-foreground hover:border-primary hover:bg-primary-subtle hover:text-primary active:bg-secondary',
  ghost:
    'border-transparent bg-transparent text-foreground hover:bg-surface-muted active:bg-secondary',
  danger:
    'border-danger bg-danger text-white hover:border-danger-hover hover:bg-danger-hover active:border-danger-hover active:bg-danger-hover',
};

const sizes: Record<ButtonSize, string> = {
  sm: 'min-h-10 px-3 text-body-sm',
  md: 'min-h-12 px-5 text-label',
  lg: 'min-h-13 px-6 text-base',
};

export type ButtonProps = ComponentProps<'button'> & {
  loading?: boolean;
  loadingLabel?: string;
  size?: ButtonSize;
  variant?: ButtonVariant;
};

export function Button({
  children,
  className,
  disabled,
  loading = false,
  loadingLabel = 'Loading…',
  size = 'md',
  type = 'button',
  variant = 'primary',
  ...props
}: ButtonProps) {
  return (
    <button
      aria-busy={loading || undefined}
      className={cx(
        'inline-flex shrink-0 touch-manipulation items-center justify-center gap-2 rounded-md border font-semibold no-underline transition-colors duration-150 ease-maevelle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-55',
        variants[variant],
        sizes[size],
        className,
      )}
      disabled={disabled || loading}
      type={type}
      {...props}
    >
      {loading ? <Spinner label={loadingLabel} size="sm" /> : null}
      {children}
    </button>
  );
}
