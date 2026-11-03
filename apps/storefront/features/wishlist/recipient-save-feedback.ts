/** Report confirmed guest writes or account no-op membership without changing owner terminology. */
export function recipientNoPendingFeedback(
  mode: 'account' | 'guest',
  queued: number,
  existing: number,
  failed: number,
): string {
  return mode === 'account'
    ? `${existing} already saved to your account, ${failed} could not be submitted.`
    : `${queued} saved in this browser, ${existing} already saved, ${failed} could not be saved.`;
}
