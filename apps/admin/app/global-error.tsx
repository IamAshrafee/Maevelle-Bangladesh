'use client';

import './globals.css';
import { useEffect } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { toBrowserUrl } from '@/lib/navigation/route-registry';

export default function GlobalError({
  error,
  reset,
}: {
  readonly error: Error & { digest?: string };
  readonly reset: () => void;
}) {
  useEffect(() => {
    console.error('Admin portal fatal layout error:', error);
  }, [error]);

  return (
    <html lang="en">
      <body className="min-h-dvh bg-background font-sans text-foreground antialiased">
        <main className="mx-auto flex min-h-dvh max-w-xl flex-col items-center justify-center px-6 py-12 text-center">
          <div className="w-full rounded-xl border border-border bg-card p-8 shadow-sm">
            <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full border border-destructive/25 bg-destructive/10 text-destructive">
              <AlertTriangle className="size-6" aria-hidden="true" />
            </div>
            <h1 className="mb-2 text-xl font-bold tracking-tight text-foreground">
              Maevelle Admin encountered an application error
            </h1>
            <p className="mb-4 text-sm leading-relaxed text-muted-foreground">
              The shell could not recover automatically. Retry rendering the workspace or reload the
              portal home page.
            </p>
            {error.digest ? (
              <p className="mb-6 text-xs text-muted-foreground font-mono">
                Error digest: {error.digest}
              </p>
            ) : null}
            <div className="flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => reset()}
                className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-border bg-card px-4 text-xs font-medium text-foreground transition-colors hover:bg-muted cursor-pointer"
              >
                <RotateCcw className="size-3.5" aria-hidden="true" />
                Try again
              </button>
              <a
                href={toBrowserUrl('/')}
                className="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-4 text-xs font-semibold text-foreground dark:text-primary-foreground transition-colors hover:bg-primary-hover hover:text-primary-foreground"
              >
                Reload Dashboard
              </a>
            </div>
          </div>
        </main>
      </body>
    </html>
  );
}
