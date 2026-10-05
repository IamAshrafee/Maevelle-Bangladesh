import type { ComponentProps } from 'react';

import { cx } from '@/components/ui/classnames';
import { formControlClassName } from '@/components/ui/form-control-styles';

export function Select({ className, ...props }: ComponentProps<'select'>) {
  return <select className={cx(formControlClassName, 'min-h-12', className)} {...props} />;
}
