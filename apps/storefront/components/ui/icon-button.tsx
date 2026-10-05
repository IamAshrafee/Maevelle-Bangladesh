import type { ComponentProps, ReactNode } from 'react';

import { cx } from '@/components/ui/classnames';
import type { ButtonVariant } from '@/components/ui/button';

type IconButtonProps = Omit<ComponentProps<'button'>, 'aria-label' | 'children'> & {
  'aria-label': string;
  children: ReactNode;
  size?: 'md' | 'lg';
  variant?: Extract<ButtonVariant, 'primary' | 'outline' | 'ghost' | 'danger'>;
};

const variants: Record<NonNullable<IconButtonProps['variant']>, string> = {
  primary:
    'border-primary bg-primary text-primary-foreground hover:bg-primary-hover active:bg-primary-active',
  outline:
    'border-border-strong bg-surface text-foreground hover:border-primary hover:bg-primary-subtle',
  ghost:
    'border-transparent bg-transparent text-foreground hover:bg-surface-muted active:bg-secondary',
  danger: 'border-danger bg-danger text-white hover:bg-danger-hover active:bg-danger-hover',
};

export function IconButton({
  'aria-label': ariaLabel,
  children,
  className,
  size = 'md',
  type = 'button',
  variant = 'ghost',
  ...props
}: IconButtonProps) {
  return (
    <button
      aria-label={ariaLabel}
      className={cx(
        'inline-grid shrink-0 touch-manipulation place-items-center rounded-full border transition-colors duration-150 ease-maevelle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-55',
        size === 'lg' ? 'size-13' : 'size-12',
        variants[variant],
        className,
      )}
      type={type}
      {...props}
    >
      <span aria-hidden="true" className="grid size-5 place-items-center">
        {children}
      </span>
    </button>
  );
}
