import type { ComponentProps } from 'react';

import { cx } from '@/components/ui/classnames';
import { formControlClassName } from '@/components/ui/form-control-styles';

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return (
    <textarea
      className={cx(formControlClassName, 'min-h-28 resize-y py-3', className)}
      {...props}
    />
  );
}
