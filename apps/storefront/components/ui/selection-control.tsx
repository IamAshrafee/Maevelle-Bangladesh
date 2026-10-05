import type { ComponentProps, ReactNode } from 'react';

import { cx } from '@/components/ui/classnames';

type SelectionControlProps = Omit<ComponentProps<'input'>, 'type'> & {
  description?: ReactNode;
  label: ReactNode;
};

function SelectionControl({
  className,
  description,
  label,
  type,
  ...props
}: SelectionControlProps & { type: 'checkbox' | 'radio' }) {
  return (
    <label className="flex min-h-12 cursor-pointer items-start gap-3 rounded-md py-2 text-body-md text-foreground has-disabled:cursor-not-allowed has-disabled:opacity-60">
      <input
        className={cx(
          'mt-0.5 size-5 shrink-0 accent-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
          className,
        )}
        type={type}
        {...props}
      />
      <span className="min-w-0">
        <span className="block font-medium">{label}</span>
        {description ? (
          <span className="mt-0.5 block text-body-sm text-foreground-muted">{description}</span>
        ) : null}
      </span>
    </label>
  );
}

export function Checkbox(props: SelectionControlProps) {
  return <SelectionControl type="checkbox" {...props} />;
}

export function Radio(props: SelectionControlProps) {
  return <SelectionControl type="radio" {...props} />;
}
