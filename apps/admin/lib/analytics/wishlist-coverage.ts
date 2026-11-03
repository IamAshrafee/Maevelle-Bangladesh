import type { WishlistAnalyticsMetadataDto } from '@maevelle/contracts';

/** Missing retained/instrumented history is not a measured zero. */
export function hasWishlistDayCoverage(
  day: string,
  metadata: Pick<
    WishlistAnalyticsMetadataDto,
    'instrumentationStart' | 'timezone' | 'retainedFrom'
  > | null,
): boolean {
  if (!metadata?.instrumentationStart) return false;
  const calendar = new Intl.DateTimeFormat('en-CA', {
    timeZone: metadata.timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return (
    day >= calendar.format(new Date(metadata.instrumentationStart)) &&
    day >= calendar.format(new Date(metadata.retainedFrom))
  );
}
