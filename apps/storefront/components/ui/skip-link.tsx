import type { ComponentProps } from 'react';

import { cx } from '@/components/ui/classnames';

export function SkipLink({
  className,
  href = '#main-content',
  ...props
}: ComponentProps<'a'>) {
  return (
    <a
      className={cx(
        'fixed left-4 top-4 z-50 -translate-y-24 rounded-xl bg-primary px-5 py-3 font-label-md text-xs font-semibold text-white shadow-lg transition-transform duration-150 focus:translate-y-0 focus:outline-none focus:ring-2 focus:ring-primary-fixed',
        className,
      )}
      href={href}
      {...props}
    />
  );
}
