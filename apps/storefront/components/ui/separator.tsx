import type { ComponentProps } from 'react';

import { cx } from '@/components/ui/classnames';

export function Separator({ className, ...props }: ComponentProps<'hr'>) {
  return <hr className={cx('my-0 border-0 border-t border-border-subtle', className)} {...props} />;
}
