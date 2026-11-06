'use client';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { NativeSelect } from '@/components/ui/native-select';
import { ErrorState, LoadingState } from '@/components/ui/page-shell';
import { paymentLabel, paymentMoney } from '@/lib/payments/transport';
export function PaymentField({
  label,
  name,
  type = 'text',
  required = true,
  children,
  ...props
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  children?: ReactNode;
  min?: number;
  max?: number;
  defaultValue?: string;
  pattern?: string;
  maxLength?: number;
}) {
  return (
    <label className="grid min-w-0 gap-1.5 text-sm font-medium">
      {label}
      {!required ? ' (optional)' : ''}
      {children ? (
        <NativeSelect className="w-full" name={name} required={required} {...props}>
          {children}
        </NativeSelect>
      ) : type === 'textarea' ? (
        <Textarea name={name} required={required} maxLength={1000} />
      ) : (
        <Input name={name} type={type} required={required} autoComplete="off" {...props} />
      )}
    </label>
  );
}
export function PaymentMoney({
  value,
  label,
  currency = 'BDT',
}: {
  value: string;
  label?: string;
  currency?: string;
}) {
  return (
    <span className="block">
      {label ? <span className="block text-xs text-muted-foreground">{label}</span> : null}
      <span className="font-mono tabular-nums">{paymentMoney(value, currency)}</span>
    </span>
  );
}
export function PaymentNotice({ children }: { children: ReactNode }) {
  return (
    <p
      className="rounded-lg border border-border bg-muted p-3 text-sm text-muted-foreground"
      role="status"
    >
      {children}
    </p>
  );
}
export function PaymentQueryState({
  query,
  children,
}: {
  query: { data: unknown; error: string | undefined; loading: boolean; refresh: () => void };
  children: ReactNode;
}) {
  if (query.error)
    return (
      <ErrorState title="Payment data unavailable" message={query.error} onRetry={query.refresh} />
    );
  if (!query.data) return <LoadingState />;
  return children;
}
export function PaymentPager({
  page,
  total,
  pageSize = 25,
  onPage,
}: {
  page: number;
  total: number;
  pageSize?: number;
  onPage: (n: number) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
      <span className="font-mono tabular-nums">
        {total} records · Page {page} of {Math.max(1, Math.ceil(total / pageSize))}
      </span>
      <div className="flex gap-2">
        <Button variant="outline" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Previous
        </Button>
        <Button
          variant="outline"
          disabled={page * pageSize >= total}
          onClick={() => onPage(page + 1)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
export { paymentLabel };
