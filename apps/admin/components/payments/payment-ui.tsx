'use client';

import * as React from 'react';
import type { ReactNode } from 'react';
import { Check, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { NativeSelect } from '@/components/ui/native-select';
import { ErrorState } from '@/components/ui/page-shell';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { paymentLabel, paymentMoney } from '@/lib/payments/transport';
import { cn } from '@/lib/utils';

export function PaymentField({
  label,
  name,
  type = 'text',
  required = true,
  children,
  className,
  hint,
  ...props
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  children?: ReactNode;
  min?: number;
  max?: number;
  defaultValue?: string | number;
  pattern?: string;
  maxLength?: number;
  className?: string;
  hint?: string;
  placeholder?: string;
}) {
  return (
    <label className={cn('grid min-w-0 gap-1.5 text-sm font-medium text-foreground', className)}>
      <span className="flex items-center justify-between gap-2">
        <span>
          {label}
          {!required ? <span className="font-normal text-muted-foreground"> (optional)</span> : null}
        </span>
        {hint && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger type="button" className="text-xs text-muted-foreground hover:text-foreground">
                Help
              </TooltipTrigger>
              <TooltipContent>{hint}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </span>
      {children ? (
        <NativeSelect className="w-full bg-card" name={name} required={required} {...props}>
          {children}
        </NativeSelect>
      ) : type === 'textarea' ? (
        <Textarea
          name={name}
          required={required}
          maxLength={1000}
          defaultValue={props.defaultValue as string | undefined}
          className="bg-card"
          placeholder={props.placeholder}
        />
      ) : (
        <Input
          name={name}
          type={type}
          required={required}
          autoComplete="off"
          className="h-9 bg-card"
          placeholder={props.placeholder}
          {...props}
        />
      )}
    </label>
  );
}

export function PaymentMoney({
  value,
  label,
  currency = 'BDT',
  className,
  size = 'md',
}: {
  value: string | number;
  label?: string;
  currency?: string;
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  const sizeClasses = {
    sm: 'text-xs',
    md: 'text-sm font-medium',
    lg: 'text-base font-semibold',
    xl: 'text-xl sm:text-2xl font-bold tracking-tight',
  }[size];

  return (
    <span className={cn('block min-w-0', className)}>
      {label ? <span className="block text-xs font-normal text-muted-foreground">{label}</span> : null}
      <span className={cn('font-mono tabular-nums text-foreground', sizeClasses)}>
        {paymentMoney(String(value ?? 0), currency)}
      </span>
    </span>
  );
}

export function CopyButton({
  value,
  label = 'Copy',
  className,
}: {
  readonly value: string;
  readonly label?: string;
  readonly className?: string;
}) {
  const [copied, setCopied] = React.useState(false);

  const onCopy = async (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ignore clipboard write failures
    }
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          type="button"
          onClick={onCopy}
          className={cn(
            'inline-flex size-6 items-center justify-center rounded-md border border-border/60 bg-muted/50 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
            className,
          )}
          aria-label={copied ? 'Copied to clipboard' : `${label}: ${value}`}
        >
          {copied ? (
            <Check className="size-3 text-emerald-600 dark:text-emerald-400" />
          ) : (
            <Copy className="size-3" />
          )}
        </TooltipTrigger>
        <TooltipContent side="top">
          {copied ? 'Copied!' : `Copy ${label}`}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export function PaymentNotice({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode;
  tone?: 'neutral' | 'warning' | 'info';
  className?: string;
}) {
  const toneClasses = {
    neutral: 'border-border bg-muted/40 text-muted-foreground',
    warning: 'border-amber-200 bg-amber-50/60 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/20 dark:text-amber-300',
    info: 'border-sky-200 bg-sky-50/60 text-sky-900 dark:border-sky-900/60 dark:bg-sky-950/20 dark:text-sky-300',
  }[tone];

  return (
    <div
      className={cn('rounded-lg border p-3 text-xs sm:text-sm leading-relaxed', toneClasses, className)}
      role="status"
    >
      {children}
    </div>
  );
}

export function PaymentQueryState({
  query,
  children,
}: {
  query: { data: unknown; error: string | undefined; loading: boolean; refresh: () => void };
  children: ReactNode;
}) {
  if (query.error && !query.data)
    return (
      <ErrorState title="Payment data unavailable" message={query.error} onRetry={query.refresh} />
    );
  if (query.loading && !query.data) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-border bg-card p-6 space-y-4">
          <Skeleton className="h-6 w-48" />
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        </div>
      </div>
    );
  }
  if (!query.data)
    return (
      <ErrorState
        title="Payment data unavailable"
        message="The server did not return a payment record."
        onRetry={query.refresh}
      />
    );
  return <div className={query.loading ? 'opacity-60 transition-opacity' : undefined}>{children}</div>;
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
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-xs sm:text-sm text-muted-foreground">
      <span className="font-mono tabular-nums">
        Showing up to {pageSize} of <strong className="text-foreground">{total}</strong> records · Page {page} of {totalPages}
      </span>
      <div className="flex items-center gap-1.5">
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
          className="h-8 px-2.5 text-xs"
        >
          Previous
        </Button>
        <span className="px-1 text-xs font-mono tabular-nums">
          {page} / {totalPages}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={page * pageSize >= total}
          onClick={() => onPage(page + 1)}
          className="h-8 px-2.5 text-xs"
        >
          Next
        </Button>
      </div>
    </div>
  );
}

export { paymentLabel };
