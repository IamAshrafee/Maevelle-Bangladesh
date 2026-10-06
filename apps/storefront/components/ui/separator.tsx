import type { ComponentProps, ReactNode } from 'react';

import { cx } from '@/components/ui/classnames';

export type SeparatorProps = ComponentProps<'div'> & {
  label?: ReactNode | undefined;
  orientation?: 'horizontal' | 'vertical' | undefined;
};

export function Separator({
  className,
  label,
  orientation = 'horizontal',
  ...props
}: SeparatorProps) {
  if (orientation === 'vertical') {
    return (
      <div
        aria-orientation="vertical"
        className={cx('inline-block h-full min-h-[1em] w-px self-stretch bg-border/40', className)}
        role="separator"
        {...props}
      />
    );
  }

  if (label) {
    return (
      <div
        aria-orientation="horizontal"
        className={cx('relative flex w-full items-center my-3 select-none', className)}
        role="separator"
        {...props}
      >
        <div className="flex-1 border-t border-border/40" />
        <span className="px-3 font-label-sm text-[11px] font-medium uppercase tracking-wider text-on-surface-variant/70">
          {label}
        </span>
        <div className="flex-1 border-t border-border/40" />
      </div>
    );
  }

  return (
    <div
      aria-orientation="horizontal"
      className={cx('my-0 w-full border-t border-border/40', className)}
      role="separator"
      {...props}
    />
  );
}
