import { describe, expect, it } from 'vitest';
import { openSealedShare, sealShare, shareKey, shareToken, tokenDigest } from './share-crypto.js';

describe('wishlist share capabilities', () => {
  it('uses independent 256-bit tokens and authenticated recovery bound to a context', () => {
    const view = shareToken();
    const manage = shareToken();
    expect(view).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(view).not.toBe(manage);
    expect(tokenDigest(view)).toHaveLength(32);
    expect(tokenDigest(view).equals(tokenDigest(manage))).toBe(false);
    const key = shareKey(Buffer.alloc(32, 5).toString('base64'));
    const ciphertext = sealShare({ view }, key, 'share-view:one');
    expect(ciphertext.includes(Buffer.from(view))).toBe(false);
    expect(openSealedShare<{ view: string }>(ciphertext, key, 'share-view:one')).toEqual({ view });
    expect(() => openSealedShare(ciphertext, key, 'share-view:two')).toThrow();
    expect(() => openSealedShare(ciphertext, shareKey(Buffer.alloc(32, 6).toString('base64')), 'share-view:one')).toThrow();
    const tampered = Buffer.from(ciphertext);
    tampered[tampered.length - 1] = tampered[tampered.length - 1]! ^ 1;
    expect(() => openSealedShare(tampered, key, 'share-view:one')).toThrow();
  });
});
