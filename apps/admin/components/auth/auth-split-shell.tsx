import * as React from 'react';
import { CheckCircle2, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

export function AuthBrandMark({
  subtitle = 'Business operations',
  size = 'md',
}: {
  readonly subtitle?: string;
  readonly size?: 'sm' | 'md';
}) {
  return (
    <div className="flex items-center gap-3">
      <div
        className={cn(
          'bg-primary text-foreground dark:text-primary-foreground font-bold flex items-center justify-center shadow-xs tracking-tight shrink-0',
          size === 'sm' ? 'size-8 rounded-lg text-sm' : 'size-9 rounded-xl text-base',
        )}
      >
        M
      </div>
      <div className="flex flex-col leading-tight">
        <strong
          className={cn(
            'font-bold tracking-tight text-foreground',
            size === 'sm' ? 'text-sm' : 'text-base',
          )}
        >
          Maevelle
        </strong>
        <span className="text-xs text-muted-foreground font-normal">{subtitle}</span>
      </div>
    </div>
  );
}

export interface AuthSplitShellProps {
  readonly eyebrow: string;
  readonly heading: string;
  readonly summary: string;
  readonly bullets?: readonly string[];
  readonly infoCard?: React.ReactNode;
  readonly securityNote: string;
  readonly footerAction?: React.ReactNode;
  readonly mobileSubtitle?: string;
  readonly mobileHeaderAction?: React.ReactNode;
  readonly children: React.ReactNode;
  readonly className?: string;
}

/**
 * Shared split-panel shell for unauthenticated / onboarding routes (`/login`, `/two-factor`, `/accept-invitation`).
 */
export function AuthSplitShell({
  eyebrow,
  heading,
  summary,
  bullets,
  infoCard,
  securityNote,
  footerAction,
  mobileSubtitle = 'Business operations',
  mobileHeaderAction,
  children,
  className,
}: AuthSplitShellProps) {
  return (
    <main className={cn('min-h-screen grid grid-cols-1 lg:grid-cols-2 bg-background', className)}>
      <section className="hidden lg:flex flex-col justify-between p-12 lg:p-16 bg-muted/40 border-r border-border relative overflow-hidden">
        <div className="absolute -top-32 -left-32 size-96 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-32 -right-32 size-96 rounded-full bg-primary/10 blur-3xl pointer-events-none" />

        <div className="relative">
          <AuthBrandMark />
        </div>

        <div className="relative space-y-6 max-w-lg my-auto py-12">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-primary">{eyebrow}</p>
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground leading-tight">
              {heading}
            </h1>
            <p className="text-sm text-muted-foreground leading-relaxed">{summary}</p>
          </div>

          {bullets && bullets.length > 0 ? (
            <ul className="space-y-3 pt-2">
              {bullets.map((bullet) => (
                <li
                  key={bullet}
                  className="flex items-center gap-2.5 text-sm font-medium text-foreground"
                >
                  <CheckCircle2 className="size-4 text-primary shrink-0" aria-hidden="true" />
                  <span>{bullet}</span>
                </li>
              ))}
            </ul>
          ) : null}

          {infoCard}
        </div>

        <div className="relative flex items-center justify-between gap-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-primary shrink-0" aria-hidden="true" />
            <span>{securityNote}</span>
          </div>
          {footerAction}
        </div>
      </section>

      <section className="flex flex-col items-center justify-center p-6 sm:p-12 lg:p-16">
        <div className="w-full max-w-md space-y-6">
          <div className="lg:hidden flex items-center justify-between gap-3 mb-6">
            <AuthBrandMark size="sm" subtitle={mobileSubtitle} />
            {mobileHeaderAction}
          </div>

          <div className="rounded-2xl border border-border bg-card p-6 sm:p-8 text-card-foreground shadow-sm space-y-6">
            {children}
          </div>
        </div>
      </section>
    </main>
  );
}

/**
 * Shared centered card layout for standalone access / two-factor security gates.
 */
export function AuthGateCard({
  children,
  headerSlot,
  className,
}: {
  readonly children: React.ReactNode;
  readonly headerSlot?: React.ReactNode | undefined;
  readonly className?: string | undefined;
}) {
  return (
    <main className="min-h-screen bg-background flex flex-col items-center justify-center p-4 md:p-6 lg:p-8">
      <div className="w-full max-w-xl space-y-6">
        {headerSlot}
        <div
          className={cn(
            'w-full rounded-2xl border border-border bg-card p-6 sm:p-8 text-card-foreground shadow-sm',
            className,
          )}
        >
          {children}
        </div>
      </div>
    </main>
  );
}
