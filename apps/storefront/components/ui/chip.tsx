import type { ComponentProps, CSSProperties, ReactNode } from 'react';

import { cx } from '@/components/ui/classnames';
import { CloseIcon } from '@/components/ui/icons';

export function Chip({ className, ...props }: ComponentProps<'span'>) {
  return (
    <span
      className={cx(
        'inline-flex min-h-8 items-center rounded-full border border-border bg-surface px-3 text-body-sm text-foreground',
        className,
      )}
      {...props}
    />
  );
}

export type CategoryPillProps = ComponentProps<'button'> & {
  active?: boolean;
  count?: number | string;
};

export function CategoryPill({
  active = false,
  children,
  className,
  count,
  type = 'button',
  ...props
}: CategoryPillProps) {
  return (
    <button
      aria-pressed={active}
      className={cx(
        'inline-flex min-h-9 items-center gap-1.5 rounded-full px-4 py-1.5 text-label-md font-semibold',
        'transition-[background-color,color,transform] duration-150 ease-maevelle active:scale-95',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus select-none',
        active
          ? 'bg-primary text-white shadow-xs'
          : 'bg-surface-container-low text-on-surface hover:bg-surface-container',
        className,
      )}
      type={type}
      {...props}
    >
      <span>{children}</span>
      {count !== undefined && (
        <span
          className={cx(
            'flex min-w-[18px] items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none',
            active
              ? 'bg-primary-container/70 text-white'
              : 'bg-surface-container-highest text-on-surface-variant',
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
}

export type FilterChipProps = ComponentProps<'button'> & {
  label: ReactNode;
  onDismiss?: () => void;
};

export function FilterChip({
  className,
  label,
  onDismiss,
  type = 'button',
  ...props
}: FilterChipProps) {
  return (
    <button
      className={cx(
        'group inline-flex min-h-7 items-center gap-1 rounded-full bg-secondary-fixed pl-2.5 pr-1.5 py-1 text-label-sm font-semibold text-on-secondary-fixed',
        'transition-[background-color,color,transform] duration-150 ease-maevelle hover:bg-secondary-fixed-dim active:scale-95',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus select-none',
        className,
      )}
      onClick={onDismiss}
      type={type}
      {...props}
    >
      <span>{label}</span>
      <span className="flex size-4 items-center justify-center rounded-full text-on-secondary-fixed hover:bg-secondary-fixed-dim/60">
        <CloseIcon size={12} />
      </span>
    </button>
  );
}

type ChoiceChipProps = Omit<ComponentProps<'button'>, 'aria-pressed'> & {
  selected?: boolean;
};

export function ChoiceChip({
  className,
  selected = false,
  type = 'button',
  ...props
}: ChoiceChipProps) {
  return (
    <button
      aria-pressed={selected}
      className={cx(
        'inline-flex min-h-12 touch-manipulation items-center justify-center rounded-full border px-4 text-label font-semibold',
        'transition-[background-color,border-color,color,transform] duration-150 ease-maevelle active:scale-95',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:border-border disabled:bg-surface-muted disabled:text-foreground-subtle disabled:line-through',
        selected
          ? 'border-primary bg-primary text-white'
          : 'border-border-strong bg-surface text-foreground hover:border-primary hover:bg-primary-subtle',
        className,
      )}
      type={type}
      {...props}
    />
  );
}

type ColorSwatchProps = Omit<ComponentProps<'button'>, 'aria-label' | 'children'> & {
  'aria-label': string;
  color: CSSProperties['backgroundColor'];
  selected?: boolean;
  unavailable?: boolean;
};

export function ColorSwatch({
  'aria-label': ariaLabel,
  className,
  color,
  disabled,
  selected = false,
  type = 'button',
  unavailable = false,
  ...props
}: ColorSwatchProps) {
  return (
    <button
      aria-label={`${ariaLabel}${unavailable ? ', unavailable' : ''}`}
      aria-pressed={selected}
      className={cx(
        'relative grid size-12 touch-manipulation place-items-center rounded-full border bg-surface transition-[border-color,box-shadow] duration-150 ease-maevelle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:opacity-60',
        selected
          ? 'border-primary ring-2 ring-primary ring-offset-2 ring-offset-background'
          : 'border-border-strong',
        unavailable && 'after:absolute after:h-px after:w-8 after:-rotate-45 after:bg-danger',
        className,
      )}
      disabled={disabled || unavailable}
      type={type}
      {...props}
    >
      <span
        aria-hidden="true"
        className="size-8 rounded-full border border-black/15"
        style={{ backgroundColor: color }}
      />
    </button>
  );
}
