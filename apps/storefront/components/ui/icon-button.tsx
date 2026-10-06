import type { ComponentProps, ReactNode } from 'react';

import { cx } from '@/components/ui/classnames';

export type IconButtonVariant = 'surface' | 'ghost' | 'primary' | 'outline';

type IconButtonProps = Omit<ComponentProps<'button'>, 'aria-label' | 'children'> & {
  'aria-label': string;
  activeIndicator?: boolean;
  badge?: number | string;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  variant?: IconButtonVariant;
};

const variants: Record<IconButtonVariant, string> = {
  surface:
    'border-transparent bg-surface-container-low text-on-surface hover:text-primary active:bg-surface-container',
  ghost:
    'border-transparent bg-transparent text-on-surface hover:text-primary active:bg-surface-container-low',
  primary:
    'border-primary bg-primary text-primary-foreground hover:bg-primary-hover active:bg-primary-active',
  outline:
    'border-border-strong bg-surface-container-lowest text-on-surface hover:border-primary hover:text-primary',
};

const sizes = {
  sm: 'size-10',
  md: 'size-12',
  lg: 'size-13',
};

export function IconButton({
  'aria-label': ariaLabel,
  activeIndicator = false,
  badge,
  children,
  className,
  size = 'md',
  type = 'button',
  variant = 'surface',
  ...props
}: IconButtonProps) {
  return (
    <button
      aria-label={ariaLabel}
      className={cx(
        'relative inline-grid shrink-0 aspect-square touch-manipulation place-items-center rounded-full border transition-[color,background-color,border-color,transform] duration-150 ease-maevelle active:scale-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-55',
        sizes[size],
        variants[variant],
        className,
      )}
      type={type}
      {...props}
    >
      <span aria-hidden="true" className="grid size-5 place-items-center">
        {children}
      </span>
      {badge !== undefined && (
        <span className="absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold leading-none text-white shadow-xs">
          {badge}
        </span>
      )}
      {activeIndicator && (
        <span className="absolute top-2 right-2 size-2 rounded-full bg-primary ring-2 ring-surface" />
      )}
    </button>
  );
}
