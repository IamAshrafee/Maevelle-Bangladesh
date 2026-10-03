import { expect } from 'vitest';
import type { SmsProvider } from './sms.js';

export async function verifySmsProviderContract(provider: SmsProvider) {
  expect(provider.name).toMatch(/^[a-z][a-z0-9_-]*$/);
  expect(provider.capabilities.has('SEND')).toBe(true);
  const request = {
    notificationId: crypto.randomUUID(), recipient: '+8801712345678', text: 'Maevelle: test',
    encoding: 'GSM_7' as const, estimatedSegments: 1, senderType: 'PROVIDER_DEFAULT' as const,
    idempotencyKey: `contract:${crypto.randomUUID()}`,
  };
  const first = await provider.send(request);
  expect(['ACCEPTED', 'FAILED', 'UNKNOWN']).toContain(first.outcome);
  if (first.outcome === 'ACCEPTED') {
    expect(first.providerMessageId).toBeTruthy();
    if (provider.capabilities.has('PROVIDER_IDEMPOTENCY')) {
      const replay = await provider.send(request);
      expect(replay.outcome).toBe('ACCEPTED');
      if (replay.outcome === 'ACCEPTED') expect(replay.providerMessageId).toBe(first.providerMessageId);
    }
  }
  if (provider.capabilities.has('DELIVERY_STATUS_POLLING')) expect(provider.getMessageStatus).toBeTypeOf('function');
  if (provider.capabilities.has('DELIVERY_CALLBACK')) {
    expect(provider.verifyAndParseWebhook).toBeTypeOf('function');
  }
}
