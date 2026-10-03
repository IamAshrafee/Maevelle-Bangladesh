import { describe, expect, it } from 'vitest';
import { createMockSmsProvider, estimateSmsLength, normalizeBangladeshPhone } from './sms.js';
import { renderTransactionalSms } from './sms-templates.js';
import { verifySmsProviderContract } from './sms-provider-contract.test-support.js';

describe('Bangladesh SMS phone normalization', () => {
  it.each([
    ['01712345678', '+8801712345678'], ['+8801712345678', '+8801712345678'],
    ['8801712345678', '+8801712345678'], ['01712-345-678', '+8801712345678'],
    [' 01712 345 678 ', '+8801712345678'],
  ])('normalizes %s', (raw, expected) => expect(normalizeBangladeshPhone(raw)).toEqual({ valid: true, raw: raw.trim(), normalized: expected }));

  it.each([['', 'MISSING'], ['hello', 'MALFORMED'], ['12345', 'NOT_BANGLADESH_MOBILE'], ['+919876543210', 'NOT_BANGLADESH_MOBILE']])
    ('rejects %s', (raw, reason) => expect(normalizeBangladeshPhone(raw)).toEqual(expect.objectContaining({ valid: false, reason })));
});

describe('SMS encoding and segment estimates', () => {
  it.each([
    ['A'.repeat(160), 'GSM_7', 1], ['A'.repeat(161), 'GSM_7', 2],
    ['^'.repeat(80), 'GSM_7', 1], ['^'.repeat(81), 'GSM_7', 2],
    ['বাংলা'.repeat(14), 'UNICODE', 1], ['অ'.repeat(71), 'UNICODE', 2],
    ['Hello বাংলা', 'UNICODE', 1],
  ] as const)('estimates %s', (text, encoding, segments) => expect(estimateSmsLength(text)).toMatchObject({ encoding, segmentCount: segments }));

  it('identifies non-GSM trigger characters and boundary warnings', () => {
    const unicodeEstimate = estimateSmsLength('Special em-dash — in text');
    expect(unicodeEstimate.encoding).toBe('UNICODE');
    expect(unicodeEstimate.unicodeTriggerCharacters).toContain('—');
    expect(unicodeEstimate.warnings.some((w) => w.includes('Unicode triggered by character'))).toBe(true);

    const boundaryEstimate = estimateSmsLength('A'.repeat(155));
    expect(boundaryEstimate.encoding).toBe('GSM_7');
    expect(boundaryEstimate.segmentCount).toBe(1);
    expect(boundaryEstimate.warnings).toContain('5 characters remaining before an additional segment may be required.');
  });

  it('renders a versioned channel-specific template with metrics', () => {
    expect(renderTransactionalSms('order-confirmed', { orderNumber: 'MV10248', currencyCode: 'BDT', totalAmount: '680', trackingUrl: 'https://maevelle.test/orders/track' }))
      .toMatchObject({ templateKey: 'order-confirmed', templateVersion: 1, event: 'ORDER_CONFIRMED', encoding: 'GSM_7' });

    // With Bangla customer name, template shifts to UNICODE and reflects in metrics
    const banglaRender = renderTransactionalSms('order-confirmed', {
      customerName: 'আশরাফী রহমান',
      orderNumber: 'MV10248',
      currencyCode: 'BDT',
      totalAmount: '680',
      trackingUrl: 'https://maevelle.test/orders/track',
    });
    expect(banglaRender.encoding).toBe('UNICODE');
    expect(banglaRender.segmentCount).toBe(2);
    expect(banglaRender.renderedText).toContain('আশরাফী রহমান');
  });
});

describe('mock SMS provider contract', () => {
  it('passes the reusable provider contract', async () => verifySmsProviderContract(createMockSmsProvider()));
  it.each([
    ['TRANSIENT_FAILURE', 'FAILED'], ['PERMANENT_FAILURE', 'FAILED'], ['RATE_LIMITED', 'FAILED'], ['UNKNOWN_OUTCOME', 'UNKNOWN'],
  ] as const)('simulates %s', async (mode, outcome) => {
    const result = await createMockSmsProvider({ mode }).send({ notificationId: crypto.randomUUID(), recipient: '+8801712345678', text: 'test', encoding: 'GSM_7', estimatedSegments: 1, senderType: 'PROVIDER_DEFAULT', idempotencyKey: crypto.randomUUID() });
    expect(result.outcome).toBe(outcome);
  });

  it('authenticates and normalizes mock callback events', async () => {
    const provider = createMockSmsProvider({ webhookToken: 'test-secret' });
    const rawBody = JSON.stringify({ providerEventId: 'evt-1', providerMessageId: 'msg-1', providerStatus: 'delivered', status: 'DELIVERED' });
    await expect(provider.verifyAndParseWebhook?.({ rawBody, headers: { 'x-mock-sms-token': 'wrong' } })).rejects.toThrow(/Invalid/);
    await expect(provider.verifyAndParseWebhook?.({ rawBody, headers: { 'x-mock-sms-token': 'test-secret' } })).resolves.toEqual([expect.objectContaining({ status: 'DELIVERED' })]);
  });
});
