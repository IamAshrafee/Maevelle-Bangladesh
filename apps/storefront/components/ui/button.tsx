import type { ComponentProps } from 'react';

import { cx } from '@/components/ui/classnames';
import { Spinner } from '@/components/ui/spinner';

export type ButtonVariant =
  | 'primary'
  | 'primary-cta'
  | 'secondary'
  | 'tonal'
  | 'express'
  | 'outline'
  | 'ghost'
  | 'danger'
  | 'destructive';

export type ButtonSize = 'sm' | 'md' | 'lg';

const variants: Record<ButtonVariant, string> = {
  primary:
    'border-primary bg-primary text-white hover:border-primary-hover hover:bg-primary-hover active:border-primary-active active:bg-primary-active shadow-xs',
  'primary-cta':
    'border-primary-container bg-primary-container text-white hover:border-primary hover:bg-primary active:border-primary-active active:bg-primary-active shadow-sm',
  secondary:
    'border-transparent bg-secondary-fixed text-on-secondary-fixed hover:bg-secondary-fixed-dim active:bg-secondary-fixed-dim font-bold shadow-xs',
  tonal:
    'border-transparent bg-surface-container-low text-primary hover:bg-surface-container active:bg-surface-container-high',
  express:
    'border-transparent bg-secondary-fixed text-on-secondary-fixed hover:bg-secondary-fixed-dim active:bg-secondary-fixed-dim font-bold shadow-xs',
  outline:
    'border-border-strong bg-surface-container-lowest text-on-surface hover:border-primary hover:bg-primary-subtle hover:text-primary active:bg-surface-container-low',
  ghost:
    'border-transparent bg-transparent text-on-surface hover:bg-surface-container-low hover:text-primary active:bg-surface-container',
  danger:
    'border-transparent bg-error-container text-on-error-container hover:bg-error-container/80 active:bg-error-container/90 font-semibold',
  destructive:
    'border-transparent bg-error-container text-on-error-container hover:bg-error-container/80 active:bg-error-container/90 font-semibold',
};

const sizes: Record<ButtonSize, string> = {
  sm: 'min-h-9 px-3 text-body-sm rounded-lg',
  md: 'min-h-12 px-4 text-label-md rounded-xl',
  lg: 'min-h-13 px-4 text-headline-sm rounded-xl',
};

export type ButtonProps = ComponentProps<'button'> & {
  fullWidth?: boolean;
  loading?: boolean;
  loadingLabel?: string;
  size?: ButtonSize;
  variant?: ButtonVariant;
};

export function Button({
  children,
  className,
  disabled,
  fullWidth = false,
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
        'inline-flex shrink-0 touch-manipulation items-center justify-center gap-2 border font-semibold no-underline',
        'transition-[background-color,border-color,color,transform,box-shadow] duration-150 ease-maevelle active:scale-98',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-55 disabled:active:scale-100',
        fullWidth && 'w-full',
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
