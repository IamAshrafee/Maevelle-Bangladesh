import { describe, expect, it } from 'vitest';
import {
  buildSmsActivityQuery,
  formatBangladeshPhone,
  isPendingSmsStatus,
  smsStatusContent,
} from '../components/sms/sms-types';

describe('SMS operations presentation helpers', () => {
  it('formats canonical and local Bangladesh mobile numbers consistently', () => {
    expect(formatBangladeshPhone('+8801712345678')).toBe('01712-345678');
    expect(formatBangladeshPhone('01712345678')).toBe('01712-345678');
    expect(formatBangladeshPhone(null)).toBe('Unavailable');
  });

  it('preserves server-side filter state in a query string', () => {
    const query = new URLSearchParams(
      buildSmsActivityQuery(
        {
          search: 'MV10248',
          status: 'DELIVERED',
          notificationType: 'ORDER_CONFIRMED',
          triggerType: 'MANUAL',
          encoding: 'UNICODE',
          provider: 'mock',
          createdFrom: '2026-10-01',
          createdTo: '2026-10-03',
        },
        2,
        25,
      ),
    );
    expect(Object.fromEntries(query)).toMatchObject({
      page: '2',
      pageSize: '25',
      search: 'MV10248',
      status: 'DELIVERED',
      encoding: 'UNICODE',
      provider: 'mock',
    });
  });

  it('distinguishes accepted from delivered and treats uncertain outcomes as active', () => {
    expect(smsStatusContent.ACCEPTED.explanation).toContain('delivery is not confirmed');
    expect(smsStatusContent.DELIVERED.explanation).toContain('confirmed delivery');
    expect(smsStatusContent.UNKNOWN_PROVIDER_OUTCOME.label).toBe('Outcome Uncertain');
    expect(isPendingSmsStatus('UNKNOWN_PROVIDER_OUTCOME')).toBe(true);
    expect(isPendingSmsStatus('QUEUED')).toBe(true);
    expect(isPendingSmsStatus('ACCEPTED')).toBe(true);
    expect(isPendingSmsStatus('DELIVERED')).toBe(false);
    expect(isPendingSmsStatus('FAILED')).toBe(false);
    expect(isPendingSmsStatus('SUPPRESSED')).toBe(false);
  });

  it('correctly maps human-readable business event labels', () => {
    expect(smsStatusContent.SUPPRESSED.label).toBe('Suppressed');
    expect(smsStatusContent.NOT_APPLICABLE.label).toBe('Skipped');
    expect(smsStatusContent.SKIPPED_NO_PHONE.label).toBe('No Phone');
  });

  it('safely distinguishes between technical retry continuation and new resend copy', () => {
    // When status is UNKNOWN_PROVIDER_OUTCOME, neither retry nor resend should be allowed
    const unknownState = {
      status: 'UNKNOWN_PROVIDER_OUTCOME',
      canRetry: false,
      canResend: false,
    };
    expect(unknownState.canRetry).toBe(false);
    expect(unknownState.canResend).toBe(false);

    // When status is FAILED, technical retry of the same notification is allowed
    const failedState = {
      status: 'FAILED',
      canRetry: true,
      canResend: true,
    };
    expect(failedState.canRetry).toBe(true);

    // When status is DELIVERED, retry is not allowed, but an audited resend is permitted
    const deliveredState = {
      status: 'DELIVERED',
      canRetry: false,
      canResend: true,
    };
    expect(deliveredState.canRetry).toBe(false);
    expect(deliveredState.canResend).toBe(true);
  });
});
