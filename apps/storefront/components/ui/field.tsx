import { cloneElement, type ComponentProps, type ReactElement, type ReactNode } from 'react';

import { cx } from '@/components/ui/classnames';
import { AlertCircleIcon } from '@/components/ui/icons';

type FieldControlProps = {
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
  hasError?: boolean;
  id?: string;
};

export type FieldProps = ComponentProps<'div'> & {
  children: ReactElement<FieldControlProps>;
  description?: ReactNode | undefined;
  error?: ReactNode | undefined;
  hint?: ReactNode | undefined;
  id: string;
  label: ReactNode;
  optional?: boolean | undefined;
  required?: boolean | undefined;
};

export function Field({
  children,
  className,
  description,
  error,
  hint,
  id,
  label,
  optional = false,
  required = false,
  ...props
}: FieldProps) {
  const descriptionId = description ? `${id}-description` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [children.props['aria-describedby'], descriptionId, errorId]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={cx('grid gap-1.5', className)} {...props}>
      <div className="flex items-center justify-between">
        <label
          className="inline-flex items-center text-xs font-label-md font-semibold text-on-surface tracking-wide"
          htmlFor={id}
        >
          <span>{label}</span>
          {required ? (
            <span aria-hidden="true" className="ml-1 text-primary font-bold">
              *
            </span>
          ) : null}
          {optional && !required ? (
            <span className="ml-1.5 text-[11px] font-normal text-on-surface-variant/60">
              (Optional)
            </span>
          ) : null}
        </label>

        {hint && (
          <span className="text-[11px] text-on-surface-variant/70">
            {hint}
          </span>
        )}
      </div>

      {cloneElement(children, {
        id,
        ...(describedBy ? { 'aria-describedby': describedBy } : {}),
        ...(error ? { 'aria-invalid': true, hasError: true } : {}),
      })}

      {description ? (
        <p className="m-0 text-xs text-on-surface-variant/80 leading-normal" id={descriptionId}>
          {description}
        </p>
      ) : null}

      {error ? (
        <p
          className="m-0 flex items-center gap-1.5 text-xs font-medium text-error animate-in fade-in duration-150"
          id={errorId}
          role="alert"
        >
          <AlertCircleIcon size={14} />
          <span>{error}</span>
        </p>
      ) : null}
    </div>
  );
}
