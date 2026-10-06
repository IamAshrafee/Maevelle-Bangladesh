import type { ComponentProps, ReactNode } from 'react';

import { cx } from '@/components/ui/classnames';

export type BadgeVariant =
  | 'neutral'
  | 'brand'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'primary-fixed'
  | 'secondary-fixed'
  | 'atelier';

const variants: Record<BadgeVariant, string> = {
  neutral: 'border-border bg-surface-muted text-foreground-muted',
  brand: 'border-rose-200 bg-primary-subtle text-primary',
  success: 'border-success/20 bg-success-subtle text-success-foreground',
  warning: 'border-warning/20 bg-warning-subtle text-warning-foreground',
  danger: 'border-danger/20 bg-error-container text-on-error-container font-semibold',
  info: 'border-info/20 bg-info-subtle text-info-foreground',
  'primary-fixed': 'border-transparent bg-primary-fixed text-on-primary-fixed font-bold',
  'secondary-fixed': 'border-transparent bg-secondary-fixed text-on-secondary-fixed font-bold',
  atelier:
    'border-transparent bg-primary text-white font-bold uppercase tracking-wider shadow-xs',
};

export type BadgeProps = ComponentProps<'span'> & { variant?: BadgeVariant };

export function Badge({ className, variant = 'neutral', ...props }: BadgeProps) {
  return (
    <span
      className={cx(
        'inline-flex min-h-6 items-center gap-1 rounded-full border px-2 py-0.5 text-caption font-semibold select-none',
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}

export type CommerceBadgeVariant = 'scarcity' | 'express' | 'craft' | 'mfs' | 'atelier';

export type CommerceBadgeProps = ComponentProps<'div'> & {
  description?: ReactNode;
  icon?: ReactNode;
  layout?: 'pill' | 'card';
  variant?: CommerceBadgeVariant;
};

const commerceVariants: Record<CommerceBadgeVariant, { card: string; iconBg: string; pill: string }> = {
  scarcity: {
    pill: 'bg-error-container text-on-error-container font-bold',
    card: 'border border-error-container/60 bg-surface-container-low/60',
    iconBg: 'bg-error-container text-on-error-container',
  },
  express: {
    pill: 'bg-surface-container-lowest text-primary shadow-xs font-bold border border-border/40',
    card: 'border border-surface-container bg-surface-container-low/60',
    iconBg: 'bg-primary-fixed text-primary',
  },
  craft: {
    pill: 'bg-primary-fixed text-on-primary-fixed font-bold',
    card: 'border border-primary-fixed/40 bg-surface-container-low/60',
    iconBg: 'bg-primary-fixed text-primary',
  },
  mfs: {
    pill: 'bg-secondary text-white font-bold',
    card: 'border border-secondary-fixed/40 bg-surface-container-low/60',
    iconBg: 'bg-secondary-fixed text-secondary',
  },
  atelier: {
    pill: 'bg-primary text-white font-bold uppercase tracking-wider shadow-xs',
    card: 'border border-primary/20 bg-surface-container-low/60',
    iconBg: 'bg-primary text-white',
  },
};

export function CommerceBadge({
  children,
  className,
  description,
  icon,
  layout = 'pill',
  variant = 'scarcity',
  ...props
}: CommerceBadgeProps) {
  const current = commerceVariants[variant];

  if (layout === 'card') {
    return (
      <div
        className={cx(
          'flex items-start gap-2.5 rounded-xl p-2.5 transition-colors select-none',
          current.card,
          className,
        )}
        {...props}
      >
        {icon ? (
          <div
            className={cx(
              'flex size-8 shrink-0 items-center justify-center rounded-full',
              current.iconBg,
            )}
          >
            {icon}
          </div>
        ) : null}
        <div>
          <span className="block font-headline-sm text-[13px] font-bold text-on-surface leading-tight">
            {children}
          </span>
          {description ? (
            <span className="block font-body-sm text-[11px] text-on-surface-variant mt-0.5">
              {description}
            </span>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div
      className={cx(
        'inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-label-sm leading-none select-none',
        current.pill,
        className,
      )}
      {...props}
    >
      {icon ? <span className="flex items-center text-current">{icon}</span> : null}
      <span>{children}</span>
    </div>
  );
}
