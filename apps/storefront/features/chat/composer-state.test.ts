import { describe, expect, it } from 'vitest';

import { shouldClearComposerDraft } from './types';

describe('storefront chat composer send ownership', () => {
  it('clears a draft once it is owned by a canonical or retryable pending message', () => {
    expect(shouldClearComposerDraft('accepted')).toBe(true);
    expect(shouldClearComposerDraft('pending')).toBe(true);
  });

  it('keeps a draft when no pending message was created', () => {
    expect(shouldClearComposerDraft('not-queued')).toBe(false);
  });
});
