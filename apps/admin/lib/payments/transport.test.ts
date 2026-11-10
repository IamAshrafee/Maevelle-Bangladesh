import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  paymentIntent,
  sendPaymentIntent,
  paymentMoney,
  uncertainPaymentResult,
  paymentError,
  ApiRequestError,
} from './transport';
const owner = { organizationId: 'synthetic-org', actorId: 'synthetic-reviewer' };
afterEach(() => vi.unstubAllGlobals());
describe('financial frontend intent integrity', () => {
  it('replays exactly the same key/body after an ambiguous committed response', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { code: 'UNAVAILABLE', message: 'response lost' } }), {
          status: 503,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { id: 'existing-payment' } }), { status: 200 }),
      );
    vi.stubGlobal('fetch', fetcher);
    const input = { confirmedAmount: '100.0000', evidence: { transactionId: 'SYNTHETIC-REF' } },
      intent = paymentIntent('/admin/payments/attempts/synthetic/verify', input, owner);
    input.confirmedAmount = '999';
    await expect(sendPaymentIntent(intent, owner)).rejects.toMatchObject({ status: 503 });
    expect(await sendPaymentIntent(intent, owner)).toEqual({ id: 'existing-payment' });
    const a = fetcher.mock.calls[0]![1],
      b = fetcher.mock.calls[1]![1];
    expect(a.body).toBe(b.body);
    expect(a.headers.get('idempotency-key')).toBe(b.headers.get('idempotency-key'));
    expect(JSON.parse(a.body).confirmedAmount).toBe('100.0000');
  });
  it('refuses cross-owner retries before network access', () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    const intent = paymentIntent('/admin/payments/x/refunds', { amount: '10' }, owner);
    expect(() => sendPaymentIntent(intent, { ...owner, organizationId: 'other' })).toThrow(
      'context changed',
    );
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('preserves one key in legacy Finance body and header', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ data: { id: 'posting' } })));
    vi.stubGlobal('fetch', fetcher);
    const intent = paymentIntent(
      '/admin/finance/payments/x/posting',
      { accountId: 'authorized-account' },
      owner,
    );
    await sendPaymentIntent(intent, owner);
    expect(JSON.parse(intent.body).idempotencyKey).toBe(intent.key);
    expect(fetcher.mock.calls[0]![1].headers.get('idempotency-key')).toBe(intent.key);
  });
  it('keeps money exact beyond Number precision and never relabels unknown money as zero', () => {
    expect(paymentMoney('9999999999999999.9999')).toBe('৳9,999,999,999,999,999.9999');
    expect(paymentMoney('0.0000')).toBe('৳0');
    expect(paymentMoney('299.2500')).toBe('৳299.25');
    expect(paymentMoney('NaN')).toBe('Amount unavailable');
  });
  it('does not echo sensitive server messages and distinguishes rejection from uncertainty', () => {
    const error = new ApiRequestError(
      'PRIVATE-ACCOUNT-REFERENCE',
      'DUPLICATE_EXTERNAL_TRANSACTION',
      409,
    );
    expect(paymentError(error)).not.toContain('PRIVATE-ACCOUNT-REFERENCE');
    expect(uncertainPaymentResult(error)).toBe(false);
    expect(uncertainPaymentResult(new TypeError('network lost'))).toBe(true);
    expect(paymentError(new ApiRequestError('response lost', 'UNAVAILABLE', 503))).toContain(
      'uncertain',
    );
    expect(uncertainPaymentResult(new ApiRequestError('bad json', 'INVALID_RESPONSE', 200))).toBe(
      true,
    );
  });
});
