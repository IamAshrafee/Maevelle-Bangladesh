import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

it.each([
  ['production', 'true', false],
  ['production', 'false', false],
  ['development', undefined, false],
  ['development', 'true', true],
] as const)(
  'keeps purchase preview gated in %s with flag %s',
  async (environment, flag, enabled) => {
    vi.stubEnv('NODE_ENV', environment);
    vi.stubEnv('NEXT_PUBLIC_CHECKOUT_DRAFT_PREVIEW', flag);
    vi.resetModules();
    expect((await import('./availability')).checkoutPreviewEnabled).toBe(enabled);
  },
);
