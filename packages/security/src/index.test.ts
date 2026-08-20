import { describe, expect, it } from 'vitest';

import {
  constantTimeEqual,
  decryptSecret,
  encryptSecret,
  generateOpaqueToken,
  hashToken,
  hmacSha256,
} from './index.js';

const encryptionKey = {
  id: 'test-key-1',
  value: Buffer.alloc(32, 7),
};

describe('security foundation', () => {
  it('generates opaque, URL-safe random tokens', () => {
    const token = generateOpaqueToken();

    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(token).not.toBe(generateOpaqueToken());
  });

  it('hashes and HMACs deterministic input', () => {
    expect(hashToken('token')).toBe(hashToken('token'));
    expect(hmacSha256('key', 'payload')).toBe(hmacSha256('key', 'payload'));
    expect(hmacSha256('key', 'payload')).not.toBe(hmacSha256('key', 'different'));
  });

  it('compares equal values in constant time when their lengths match', () => {
    expect(constantTimeEqual('same-value', 'same-value')).toBe(true);
    expect(constantTimeEqual('same-value', 'other-one')).toBe(false);
    expect(constantTimeEqual('short', 'longer')).toBe(false);
  });

  it('round-trips AES-256-GCM payloads and rejects tampering', () => {
    const encrypted = encryptSecret('sensitive provider secret', encryptionKey);

    expect(decryptSecret(encrypted, encryptionKey)).toBe('sensitive provider secret');
    expect(() => decryptSecret(`${encrypted}x`, encryptionKey)).toThrow(
      'Unable to decrypt secret.',
    );
  });
});
