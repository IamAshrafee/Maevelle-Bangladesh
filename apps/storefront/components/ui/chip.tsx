import type { ComponentProps, CSSProperties } from 'react';

import { cx } from '@/components/ui/classnames';

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
        'inline-flex min-h-12 touch-manipulation items-center justify-center rounded-full border px-4 text-label font-semibold transition-colors duration-150 ease-maevelle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus disabled:cursor-not-allowed disabled:border-border disabled:bg-surface-muted disabled:text-foreground-subtle disabled:line-through',
        selected
          ? 'border-primary bg-primary text-primary-foreground'
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
