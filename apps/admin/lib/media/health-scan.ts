export interface MediaHealthIssue {
  readonly code: string;
  readonly assetId: string;
  readonly detail: string;
}

export interface MediaHealthSummary {
  readonly status: 'SCANNING' | 'HEALTHY' | 'DEGRADED' | 'FAILED';
  readonly checkedObjectCount: number;
  readonly verifiedObjectCount: number;
  readonly issueCount: number;
  readonly issues: readonly MediaHealthIssue[];
  readonly issuesTruncated: boolean;
  readonly error?: string;
}

interface MediaHealthPage {
  readonly checkedObjectCount: number;
  readonly verifiedObjectCount: number;
  readonly issueCount: number;
  readonly issues: readonly MediaHealthIssue[];
  readonly issuesTruncated: boolean;
  readonly hasMore: boolean;
  readonly nextCursor: string | null;
  readonly checkMethod: 'EXISTENCE_AND_BYTE_SIZE';
}

export const emptyHealthSummary: MediaHealthSummary = {
  status: 'SCANNING',
  checkedObjectCount: 0,
  verifiedObjectCount: 0,
  issueCount: 0,
  issues: [],
  issuesTruncated: false,
};

function isHealthPage(value: unknown): value is MediaHealthPage {
  if (typeof value !== 'object' || value === null) return false;
  const page = value as Record<string, unknown>;
  return (
    Number.isSafeInteger(page.checkedObjectCount) &&
    (page.checkedObjectCount as number) >= 0 &&
    (page.checkedObjectCount as number) <= 100 &&
    Number.isSafeInteger(page.verifiedObjectCount) &&
    (page.verifiedObjectCount as number) >= 0 &&
    (page.verifiedObjectCount as number) <= (page.checkedObjectCount as number) &&
    Number.isSafeInteger(page.issueCount) &&
    (page.issueCount as number) >= 0 &&
    Array.isArray(page.issues) &&
    page.issues.length <= (page.issueCount as number) &&
    page.issues.every(
      (issue: unknown) =>
        typeof issue === 'object' &&
        issue !== null &&
        typeof (issue as MediaHealthIssue).code === 'string' &&
        typeof (issue as MediaHealthIssue).assetId === 'string' &&
        typeof (issue as MediaHealthIssue).detail === 'string',
    ) &&
    typeof page.issuesTruncated === 'boolean' &&
    typeof page.hasMore === 'boolean' &&
    (page.nextCursor === null || typeof page.nextCursor === 'string') &&
    page.checkMethod === 'EXISTENCE_AND_BYTE_SIZE'
  );
}

/** A healthy result is emitted only after every page succeeds. */
export async function scanMediaHealth(
  fetchPage: typeof fetch,
  signal: AbortSignal,
  onProgress: (summary: MediaHealthSummary) => void,
): Promise<MediaHealthSummary> {
  let summary = emptyHealthSummary;
  let cursor: string | null = null;
  const seenCursors = new Set<string>();
  onProgress(summary);
  for (;;) {
    const params = new URLSearchParams({ pageSize: '100' });
    if (cursor) params.set('cursor', cursor);
    const response = await fetchPage(`/api/admin/media/health?${params}`, {
      credentials: 'include',
      cache: 'no-store',
      signal,
    });
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
      throw new Error(body.error?.message ?? 'Media health scan could not continue.');
    }
    const payload = (await response.json()) as { data?: unknown };
    if (!isHealthPage(payload.data)) throw new Error('Media health scan returned an invalid page.');
    const page = payload.data;
    const issues = [...summary.issues, ...page.issues].slice(0, 200);
    summary = {
      status: 'SCANNING',
      checkedObjectCount: summary.checkedObjectCount + page.checkedObjectCount,
      verifiedObjectCount: summary.verifiedObjectCount + page.verifiedObjectCount,
      issueCount: summary.issueCount + page.issueCount,
      issues,
      issuesTruncated:
        summary.issuesTruncated ||
        page.issuesTruncated ||
        summary.issueCount + page.issueCount > issues.length,
    };
    onProgress(summary);
    if (!page.hasMore) break;
    if (!page.nextCursor || seenCursors.has(page.nextCursor))
      throw new Error('Media health scan stopped because its continuation was invalid.');
    cursor = page.nextCursor;
    seenCursors.add(cursor);
  }
  summary = { ...summary, status: summary.issueCount ? 'DEGRADED' : 'HEALTHY' };
  onProgress(summary);
  return summary;
}
