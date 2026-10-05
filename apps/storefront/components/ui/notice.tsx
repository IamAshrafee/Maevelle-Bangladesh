import type { ComponentProps, ReactNode } from 'react';

import { cx } from '@/components/ui/classnames';

type NoticeVariant = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

const variants: Record<NoticeVariant, string> = {
  neutral: 'border-border bg-surface-muted text-foreground',
  success: 'border-success/25 bg-success-subtle text-success-foreground',
  warning: 'border-warning/25 bg-warning-subtle text-warning-foreground',
  danger: 'border-danger/25 bg-danger-subtle text-danger-foreground',
  info: 'border-info/25 bg-info-subtle text-info-foreground',
};

type NoticeProps = ComponentProps<'div'> & {
  title?: ReactNode;
  variant?: NoticeVariant;
};

export function Notice({
  children,
  className,
  role,
  title,
  variant = 'neutral',
  ...props
}: NoticeProps) {
  return (
    <div
      className={cx('rounded-lg border p-4 text-body-sm', variants[variant], className)}
      role={role ?? (variant === 'danger' ? 'alert' : 'status')}
      {...props}
    >
      {title ? <p className="mb-1 font-semibold">{title}</p> : null}
      <div className="text-pretty">{children}</div>
    </div>
  );
}
