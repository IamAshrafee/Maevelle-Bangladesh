import { describe, expect, it } from 'vitest';

import {
  getInstagramStatusInfo,
  instagramReplyCopy,
  instagramReplyDraftIssue,
} from '../components/messaging/instagram/instagram-types';

describe('Instagram messaging presentation rules', () => {
  it('allows text-only and one-image-only replies', () => {
    expect(instagramReplyDraftIssue('Hello', 0)).toBeNull();
    expect(instagramReplyDraftIssue('', 1)).toBeNull();
  });

  it('rejects mixed and multi-image reply drafts', () => {
    expect(instagramReplyDraftIssue('Hello', 1)).toMatch(/not both/);
    expect(instagramReplyDraftIssue('', 2)).toMatch(/1 image/);
  });

  it('keeps provider restrictions actionable and status labels explicit', () => {
    expect(instagramReplyCopy('WINDOW_CLOSED').description).toMatch(/Wait for the customer/);
    expect(getInstagramStatusInfo('NEEDS_REAUTHORIZATION').label).toBe('Reauthorization Required');
  });
});
