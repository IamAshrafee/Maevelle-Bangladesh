import type { ComponentProps, ElementType } from 'react';

import { cx } from '@/components/ui/classnames';

type SurfaceVariant = 'flat' | 'raised' | 'floating' | 'inverse' | 'glass';

const variants: Record<SurfaceVariant, string> = {
  flat: 'border-border bg-surface',
  raised: 'border-border-subtle bg-surface-raised shadow-raised',
  floating: 'border-border-subtle bg-surface-raised shadow-floating',
  inverse: 'border-surface-inverse bg-surface-inverse text-foreground-inverse',
  glass:
    'border-border-subtle bg-[var(--glass-background)] supports-[backdrop-filter]:bg-[var(--glass-background-supported)] supports-[backdrop-filter]:backdrop-blur-md',
};

type SurfaceProps = ComponentProps<'div'> & {
  as?: Extract<ElementType, 'article' | 'div' | 'section'>;
  variant?: SurfaceVariant;
};

export function Surface({
  as: Element = 'div',
  className,
  variant = 'flat',
  ...props
}: SurfaceProps) {
  return <Element className={cx('rounded-lg border', variants[variant], className)} {...props} />;
}
