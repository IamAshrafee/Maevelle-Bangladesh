import * as React from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Inbox, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './button';

/**
 * Top-level wrapper for an Admin Page
 */
export function AdminPage({
  className,
  children,
  ...props
}: React.ComponentProps<'main'>) {
  return (
    <main
      className={cn('flex flex-col gap-6 p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full min-w-0', className)}
      {...props}
    >
      {children}
    </main>
  );
}

/**
 * Standard Page Header with Eyebrow, Title, Description, and Actions
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
  children,
  ...props
}: React.ComponentProps<'header'> & {
  eyebrow?: string;
  title?: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <header
      className={cn(
        'flex flex-col gap-4 border-b border-border/70 pb-5 lg:flex-row lg:items-end lg:justify-between',
        className,
      )}
      {...props}
    >
      <div className="min-w-0 space-y-1">
        {eyebrow ? (
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">{eyebrow}</p>
        ) : null}
        {title ? (
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">{title}</h1>
        ) : null}
        {description ? (
          <p className="text-sm text-muted-foreground max-w-3xl">{description}</p>
        ) : null}
        {children}
      </div>
      {actions ? (
        <div className="flex flex-wrap items-center gap-2.5 shrink-0">{actions}</div>
      ) : null}
    </header>
  );
}

export function PageTitle({
  className,
  children,
  ...props
}: React.ComponentProps<'h1'>) {
  return (
    <h1
      className={cn('text-2xl sm:text-3xl font-bold tracking-tight text-foreground', className)}
      {...props}
    >
      {children}
    </h1>
  );
}

export function PageDescription({
  className,
  children,
  ...props
}: React.ComponentProps<'p'>) {
  return (
    <p className={cn('text-sm text-muted-foreground max-w-3xl', className)} {...props}>
      {children}
    </p>
  );
}

export function PageActions({
  className,
  children,
  ...props
}: React.ComponentProps<'div'>) {
  return (
    <div className={cn('flex flex-wrap items-center gap-2.5', className)} {...props}>
      {children}
    </div>
  );
}

/**
 * Section container for grouping related content
 */
export function PageSection({
  title,
  description,
  actions,
  className,
  children,
  ...props
}: React.ComponentProps<'section'> & {
  title?: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <section className={cn('space-y-4', className)} {...props}>
      {title || description || actions ? (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            {title ? <h2 className="text-lg font-semibold text-foreground tracking-tight">{title}</h2> : null}
            {description ? <p className="text-xs sm:text-sm text-muted-foreground">{description}</p> : null}
          </div>
          {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/**
 * Standard Surface / Panel card
 */
export function PagePanel({
  className,
  children,
  ...props
}: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'rounded-xl border border-border bg-card p-5 text-card-foreground shadow-2xs',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

/**
 * Unified Empty State
 */
export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center p-8 sm:p-12 text-center rounded-xl border border-dashed border-border bg-muted/20',
        className,
      )}
    >
      <div className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground mb-3">
        <Icon className="size-6" />
      </div>
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {description ? (
        <p className="mt-1 text-xs sm:text-sm text-muted-foreground max-w-sm">{description}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

/**
 * Unified Error / Alert State
 */
export function ErrorState({
  title = 'Something went wrong',
  message,
  onRetry,
  className,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col sm:flex-row items-start gap-3.5 rounded-xl border border-rose-200 bg-rose-50/80 p-4 text-rose-900 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-200',
        className,
      )}
    >
      <AlertCircle className="size-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <strong className="block text-sm font-semibold">{title}</strong>
        {message ? <p className="mt-0.5 text-xs sm:text-sm text-rose-800 dark:text-rose-300">{message}</p> : null}
      </div>
      {onRetry ? (
        <Button variant="outline" size="sm" onClick={onRetry} className="shrink-0">
          Try again
        </Button>
      ) : null}
    </div>
  );
}

/**
 * Loading skeleton container
 */
export function LoadingState({
  message = 'Loading data…',
  className,
}: {
  message?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex items-center justify-center gap-2.5 p-8 text-sm text-muted-foreground',
        className,
      )}
      aria-busy="true"
    >
      <Loader2 className="size-4 animate-spin text-primary" />
      <span>{message}</span>
    </div>
  );
}
