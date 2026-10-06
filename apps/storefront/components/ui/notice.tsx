'use client';

import { type ComponentProps, type ReactNode, useState } from 'react';

import { cx } from '@/components/ui/classnames';
import {
  AlertCircleIcon,
  AlertOctagonIcon,
  CheckCircleIcon,
  CloseIcon,
  InfoIcon,
  SparklesIcon,
} from '@/components/ui/icons';

export type NoticeVariant =
  | 'neutral'
  | 'brand'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info';

const variantStyles: Record<
  NoticeVariant,
  { container: string; icon: string; iconColor: string }
> = {
  neutral: {
    container: 'border-border/60 bg-surface-container-low text-on-surface',
    icon: 'text-on-surface-variant',
    iconColor: 'text-on-surface-variant',
  },
  brand: {
    container: 'border-primary/30 bg-primary-fixed/20 text-on-surface',
    icon: 'text-primary',
    iconColor: 'text-primary',
  },
  success: {
    container: 'border-success/35 bg-success-subtle text-on-surface',
    icon: 'text-success',
    iconColor: 'text-success',
  },
  warning: {
    container: 'border-warning/35 bg-warning-subtle text-on-surface',
    icon: 'text-warning',
    iconColor: 'text-warning',
  },
  danger: {
    container: 'border-error/40 bg-error-container/30 text-on-surface',
    icon: 'text-error',
    iconColor: 'text-error',
  },
  info: {
    container: 'border-border/60 bg-surface-container text-on-surface',
    icon: 'text-on-surface-variant',
    iconColor: 'text-on-surface-variant',
  },
};

function getDefaultIcon(variant: NoticeVariant): ReactNode {
  switch (variant) {
    case 'brand':
      return <SparklesIcon size={18} />;
    case 'success':
      return <CheckCircleIcon size={18} />;
    case 'warning':
      return <AlertCircleIcon size={18} />;
    case 'danger':
      return <AlertOctagonIcon size={18} />;
    case 'info':
      return <InfoIcon size={18} />;
    case 'neutral':
    default:
      return null;
  }
}

export type NoticeProps = ComponentProps<'div'> & {
  action?: ReactNode | undefined;
  dismissible?: boolean | undefined;
  icon?: ReactNode | undefined;
  onDismiss?: (() => void) | undefined;
  title?: ReactNode | undefined;
  variant?: NoticeVariant | undefined;
};

export function Notice({
  action,
  children,
  className,
  dismissible = false,
  icon: customIcon,
  onDismiss,
  role,
  title,
  variant = 'neutral',
  ...props
}: NoticeProps) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  const style = variantStyles[variant];
  const icon = customIcon !== undefined ? customIcon : getDefaultIcon(variant);

  const handleDismiss = () => {
    setDismissed(true);
    onDismiss?.();
  };

  return (
    <div
      className={cx(
        'relative flex items-start gap-3 rounded-xl border p-3.5 sm:p-4 text-xs shadow-2xs transition-[background-color,border-color] duration-150',
        style.container,
        className,
      )}
      role={role ?? (variant === 'danger' ? 'alert' : 'status')}
      {...props}
    >
      {icon ? (
        <span aria-hidden="true" className={cx('shrink-0 pt-0.5', style.icon)}>
          {icon}
        </span>
      ) : null}

      <div className="min-w-0 flex-1">
        {title ? (
          <p className="font-label-md text-xs font-bold text-on-surface mb-0.5 leading-snug">
            {title}
          </p>
        ) : null}
        <div className="text-on-surface/90 text-xs leading-relaxed text-pretty">
          {children}
        </div>
        {action ? <div className="mt-2.5 flex items-center gap-2">{action}</div> : null}
      </div>

      {dismissible && (
        <button
          aria-label="Dismiss notice"
          className="shrink-0 rounded-lg p-1 text-on-surface-variant/70 hover:bg-black/5 hover:text-on-surface active:scale-95 transition-[background-color,color,transform] duration-150 cursor-pointer -mr-1 -mt-1"
          onClick={handleDismiss}
          type="button"
        >
          <CloseIcon size={14} />
        </button>
      )}
    </div>
  );
}
