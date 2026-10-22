import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { verifyMetaSignature } from './facebook-messaging.js';

describe('Meta webhook signature verification', () => {
  it('accepts the exact raw body and rejects an altered body or malformed signature', () => {
    const body = '{"object":"page","entry":[{"id":"1"}]}';
    const secret = 'app-secret-value';
    const signature = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
    expect(verifyMetaSignature(body, signature, secret)).toBe(true);
    expect(verifyMetaSignature(`${body} `, signature, secret)).toBe(false);
    expect(verifyMetaSignature(body, undefined, secret)).toBe(false);
    expect(verifyMetaSignature(body, 'sha256=bad', secret)).toBe(false);
  });
});
