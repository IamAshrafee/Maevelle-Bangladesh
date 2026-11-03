import { describe, expect, it } from 'vitest';
import {
  openSealedShare,
  sealShare,
  shareKeyRing,
  shareEnvelopeKeyId,
  shareKey,
  shareToken,
  tokenDigest,
} from './share-crypto.js';

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
    expect(() =>
      openSealedShare(
        ciphertext,
        shareKey(Buffer.alloc(32, 6).toString('base64')),
        'share-view:one',
      ),
    ).toThrow();
    const tampered = Buffer.from(ciphertext);
    tampered[tampered.length - 1] = tampered[tampered.length - 1]! ^ 1;
    expect(() => openSealedShare(tampered, key, 'share-view:one')).toThrow();
  });
});

describe('versioned Wishlist recovery', () => {
  const oldRoot = Buffer.alloc(32, 5).toString('base64');
  const newRoot = Buffer.alloc(32, 6).toString('base64');
  const ring = shareKeyRing('new', { old: oldRoot, new: newRoot }, oldRoot);
  it('reads legacy and old envelopes while writing the active authenticated version', () => {
    const legacy = sealShare({ token: 'synthetic' }, shareKey(oldRoot), 'receipt:1');
    const old = sealShare('old', shareKeyRing('old', { old: oldRoot }), 'view:1');
    const current = sealShare('new', ring, 'view:2');
    const readerFirst = shareKeyRing('new', { old: oldRoot, new: newRoot }, oldRoot, true);
    expect(shareEnvelopeKeyId(sealShare('reader rollout', readerFirst, 'view:2'))).toBe('legacy');
    expect(openSealedShare(current, readerFirst, 'view:2')).toBe('new');
    expect(shareEnvelopeKeyId(legacy)).toBe('legacy');
    expect(shareEnvelopeKeyId(current)).toBe('new');
    expect(openSealedShare(legacy, ring, 'receipt:1')).toEqual({ token: 'synthetic' });
    expect(openSealedShare(old, ring, 'view:1')).toBe('old');
    expect(openSealedShare(current, ring, 'view:2')).toBe('new');
  });
  it('rejects missing versions, wrong keys, AAD, truncated and tampered envelopes safely', () => {
    const encrypted = sealShare('secret', ring, 'view:2');
    const other = shareKeyRing('other', { other: newRoot });
    const wrong = shareKeyRing('new', { new: oldRoot });
    for (const keys of [other, wrong])
      expect(() => openSealedShare(encrypted, keys, 'view:2')).toThrow(
        'Share link recovery is unavailable.',
      );
    expect(() => openSealedShare(encrypted, ring, 'view:3')).toThrow();
    for (const position of [0, 17, 19, encrypted.length - 1]) {
      const tampered = Buffer.from(encrypted);
      tampered[position] = tampered[position]! ^ 1;
      expect(() => openSealedShare(tampered, ring, 'view:2')).toThrow();
    }
    const nonAsciiHeader = Buffer.from(encrypted);
    nonAsciiHeader[19] = nonAsciiHeader[19]! | 0x80;
    expect(() => openSealedShare(nonAsciiHeader, ring, 'view:2')).toThrow();
    expect(() => openSealedShare(encrypted.subarray(0, 30), ring, 'view:2')).toThrow();
    expect(() =>
      openSealedShare(sealShare('old', shareKey(oldRoot), 'view:1'), other, 'view:1'),
    ).toThrow();
  });
  it('rejects ambiguous identifiers and malformed roots without echoing key material', () => {
    expect(() => shareKeyRing('legacy', { legacy: oldRoot })).toThrow();
    expect(() => shareKeyRing('new', { new: 'private-invalid-key-value' })).toThrow(
      'Invalid share recovery key configuration.',
    );
    expect(() => shareKeyRing('missing', { new: newRoot })).toThrow();
  });
});
