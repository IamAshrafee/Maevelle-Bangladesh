import type { CartView } from './types';
import { StorefrontClientApiError } from '@/lib/api/client/http';
import type { CartApi } from './api';
import type { createCartActivity } from './activity';

/** Cookie forgetting is an acknowledged transport transition, never deletion or adoption. */
export async function forgetGuestSession(input: {
  api: CartApi;
  activity: ReturnType<typeof createCartActivity>;
  coordinate<T>(task: () => Promise<T>): Promise<T>;
  assertCurrent(): void;
  onAcknowledged(): void;
}): Promise<CartView | null> {
  await input.activity.quiesce();
  return input.coordinate(async () => {
    input.assertCurrent();
    const result = await input.activity.track(input.api.forgetSession());
    input.assertCurrent();
    if (result.sessionForgotten !== true)
      throw new Error('The browser session could not be checked.');
    input.onAcknowledged();
    let remaining: CartView | null = null;
    try {
      remaining = await input.activity.track(input.api.get());
    } catch (error) {
      if (!(error instanceof StorefrontClientApiError && error.status === 404)) throw error;
    }
    input.assertCurrent();
    return remaining;
  });
}
