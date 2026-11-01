import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from 'node:crypto';

export function shareToken(): string { return randomBytes(32).toString('base64url'); }
export function tokenDigest(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}
export function shareKey(base64Key: string): Buffer {
  const root = Buffer.from(base64Key, 'base64');
  if (root.length !== 32) throw new Error('Share encryption requires a 32-byte key.');
  return Buffer.from(hkdfSync('sha256', root, Buffer.alloc(0), 'maevelle:wishlist-share-recovery:v1', 32));
}
export function sealShare(value: unknown, key: Buffer, context: string): Buffer {
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  cipher.setAAD(Buffer.from(context));
  const body = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()]);
  return Buffer.concat([nonce, cipher.getAuthTag(), body]);
}
export function openSealedShare<T>(value: Buffer, key: Buffer, context: string): T {
  if (value.length < 29) throw new Error('Invalid encrypted share.');
  const decipher = createDecipheriv('aes-256-gcm', key, value.subarray(0, 12));
  decipher.setAAD(Buffer.from(context));
  decipher.setAuthTag(value.subarray(12, 28));
  return JSON.parse(Buffer.concat([decipher.update(value.subarray(28)), decipher.final()]).toString('utf8')) as T;
}
