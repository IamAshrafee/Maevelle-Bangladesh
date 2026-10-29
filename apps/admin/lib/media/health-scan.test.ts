import { expect, it, vi } from 'vitest';

import { scanMediaHealth } from './health-scan';

function page(data: Record<string, unknown>): Response {
  return {
    ok: true,
    json: async () => ({
      data: {
        checkedObjectCount: 100,
        verifiedObjectCount: 100,
        issueCount: 0,
        issues: [],
        issuesTruncated: false,
        hasMore: false,
        nextCursor: null,
        checkMethod: 'EXISTENCE_AND_BYTE_SIZE',
        ...data,
      },
    }),
  } as Response;
}

it('only reports healthy after every inventory page succeeds', async () => {
  const fetchPage = vi
    .fn()
    .mockResolvedValueOnce(page({ hasMore: true, nextCursor: 'next' }))
    .mockResolvedValueOnce(page({ checkedObjectCount: 1, verifiedObjectCount: 1 }));
  const progress: string[] = [];
  const result = await scanMediaHealth(
    fetchPage as typeof fetch,
    new AbortController().signal,
    (state) => progress.push(state.status),
  );
  expect(result).toMatchObject({
    status: 'HEALTHY',
    checkedObjectCount: 101,
    verifiedObjectCount: 101,
    issueCount: 0,
  });
  expect(progress).toEqual(['SCANNING', 'SCANNING', 'SCANNING', 'HEALTHY']);
  expect(fetchPage.mock.calls[1]?.[0]).toContain('cursor=next');
});

it('does not turn a partial or failed page into a healthy result', async () => {
  const fetchPage = vi
    .fn()
    .mockResolvedValueOnce(page({ hasMore: true, nextCursor: 'next' }))
    .mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: { message: 'Storage unavailable' } }),
    });
  const progress: string[] = [];
  await expect(
    scanMediaHealth(fetchPage as typeof fetch, new AbortController().signal, (state) =>
      progress.push(state.status),
    ),
  ).rejects.toThrow('Storage unavailable');
  expect(progress).not.toContain('HEALTHY');
});

it('rejects an invalid continuation instead of silently ending the scan', async () => {
  const fetchPage = vi.fn().mockResolvedValueOnce(page({ hasMore: true, nextCursor: null }));
  await expect(
    scanMediaHealth(fetchPage as typeof fetch, new AbortController().signal, () => {}),
  ).rejects.toThrow('continuation was invalid');
});
