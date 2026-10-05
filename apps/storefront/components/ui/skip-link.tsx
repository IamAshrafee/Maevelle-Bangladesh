import type { ComponentProps } from 'react';

import { cx } from '@/components/ui/classnames';

export function SkipLink({ className, href = '#main-content', ...props }: ComponentProps<'a'>) {
  return (
    <a
      className={cx(
        'fixed left-4 top-4 z-50 -translate-y-24 rounded-md bg-primary px-4 py-3 font-semibold text-primary-foreground shadow-floating transition-transform duration-150 ease-maevelle focus:translate-y-0',
        className,
      )}
      href={href}
      {...props}
    />
  );
}
