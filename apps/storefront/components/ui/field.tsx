import { cloneElement, type ComponentProps, type ReactElement, type ReactNode } from 'react';

import { cx } from '@/components/ui/classnames';

type FieldControlProps = {
  id?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
};

type FieldProps = ComponentProps<'div'> & {
  children: ReactElement<FieldControlProps>;
  description?: ReactNode;
  error?: ReactNode;
  id: string;
  label: ReactNode;
  required?: boolean;
};

export function Field({
  children,
  className,
  description,
  error,
  id,
  label,
  required = false,
  ...props
}: FieldProps) {
  const descriptionId = description ? `${id}-description` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [children.props['aria-describedby'], descriptionId, errorId]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={cx('grid gap-2', className)} {...props}>
      <label
        className="inline-flex items-center text-label font-semibold text-foreground"
        htmlFor={id}
      >
        {label}
        {required ? (
          <span aria-hidden="true" className="ml-1 text-danger">
            *
          </span>
        ) : null}
      </label>
      {cloneElement(children, {
        id,
        ...(describedBy ? { 'aria-describedby': describedBy } : {}),
        ...(error ? { 'aria-invalid': true } : {}),
      })}
      {description ? (
        <p className="m-0 text-body-sm text-foreground-muted" id={descriptionId}>
          {description}
        </p>
      ) : null}
      {error ? (
        <p
          className="m-0 text-body-sm font-medium text-danger-foreground"
          id={errorId}
          role="alert"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}
