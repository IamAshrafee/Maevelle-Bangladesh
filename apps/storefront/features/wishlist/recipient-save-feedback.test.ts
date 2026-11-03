import { expect, it } from 'vitest';
import { recipientNoPendingFeedback } from './recipient-save-feedback';
it('keeps account ownership when Save All has no new writes', () => {
  expect(recipientNoPendingFeedback('account', 0, 2, 0)).toBe(
    '2 already saved to your account, 0 could not be submitted.',
  );
});
it('reports partial guest failures without implying full persistence', () => {
  expect(recipientNoPendingFeedback('guest', 1, 2, 1)).toBe(
    '1 saved in this browser, 2 already saved, 1 could not be saved.',
  );
});
