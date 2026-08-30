import { AlertTriangle, CheckCircle2, CircleAlert } from 'lucide-react';
import Link from 'next/link';

import type { CatalogProductReadinessDto } from '@maevelle/contracts';

export function ProductReadiness({
  readiness,
  productId,
  compact = false,
}: {
  readiness: CatalogProductReadinessDto;
  productId: string;
  compact?: boolean;
}) {
  return (
    <section
      className="overflow-hidden rounded-xl bg-card ring-1 ring-foreground/10"
      aria-labelledby="readiness-title"
    >
      <header className="flex items-start gap-3 border-b px-4 py-3">
        <span
          className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg ${readiness.blockerCount > 0 ? 'bg-destructive/10 text-destructive' : readiness.warningCount > 0 ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}
        >
          {readiness.blockerCount > 0 ? (
            <CircleAlert aria-hidden="true" />
          ) : (
            <CheckCircle2 aria-hidden="true" />
          )}
        </span>
        <div className="min-w-0">
          <h2 className="font-semibold" id="readiness-title">
            Publishing Readiness
          </h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {readiness.canPublish
              ? readiness.warningCount > 0
                ? `No blockers · ${readiness.warningCount} merchandising recommendation${readiness.warningCount === 1 ? '' : 's'}`
                : 'Every required publishing check passes.'
              : `${readiness.blockerCount} blocker${readiness.blockerCount === 1 ? '' : 's'} must be resolved before publishing.`}
          </p>
        </div>
      </header>
      <ul className={compact ? 'divide-y' : 'grid divide-y md:grid-cols-2 md:divide-y-0'}>
        {readiness.checks.map((check) => (
          <li
            className="flex min-w-0 items-start gap-3 px-4 py-3 md:border-b md:odd:border-r"
            key={check.code}
          >
            {check.state === 'PASS' ? (
              <CheckCircle2
                className="mt-0.5 size-4 shrink-0 text-emerald-700"
                aria-hidden="true"
              />
            ) : (
              <AlertTriangle
                className={`mt-0.5 size-4 shrink-0 ${check.state === 'BLOCKER' ? 'text-destructive' : 'text-amber-700'}`}
                aria-hidden="true"
              />
            )}
            <span className="min-w-0 flex-1">
              <strong className="block text-sm font-medium">{check.label}</strong>
              {!compact ? (
                <small className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                  {check.message}
                </small>
              ) : null}
            </span>
            {check.state !== 'PASS' ? (
              <Link
                className="shrink-0 text-xs font-medium text-primary hover:underline focus-visible:ring-3 focus-visible:ring-ring/30"
                href={`/products/${productId}/edit?section=${
                  check.code === 'ACTIVE_VARIANT' || check.code === 'OPTION_COMBINATIONS'
                    ? 'variants'
                    : check.code === 'PUBLIC_MEDIA'
                      ? 'media'
                      : check.code === 'CURRENT_PRICE' || check.code === 'AVAILABLE_INVENTORY'
                        ? 'variants'
                        : check.code === 'REQUIRED_ATTRIBUTES' || check.code === 'CATEGORY'
                          ? 'organization'
                          : check.code === 'DESCRIPTION' || check.code === 'IDENTITY'
                            ? 'overview'
                            : 'review'
                }`}
              >
                Resolve
              </Link>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
