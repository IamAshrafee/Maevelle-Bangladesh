import { createCipheriv, createDecipheriv, createHash, hkdfSync, randomBytes } from 'node:crypto';

export function shareToken(): string {
  return randomBytes(32).toString('base64url');
}
export function tokenDigest(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}
export function shareKey(base64Key: string): Buffer {
  const root = Buffer.from(base64Key, 'base64');
  if (root.length !== 32) throw new Error('Share encryption requires a 32-byte key.');
  return Buffer.from(
    hkdfSync('sha256', root, Buffer.alloc(0), 'maevelle:wishlist-share-recovery:v1', 32),
  );
}
export function sealShare(value: unknown, key: ShareEncryptionKey, context: string): Buffer {
  if (!Buffer.isBuffer(key)) return sealVersionedShare(value, key, context);
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  cipher.setAAD(Buffer.from(context));
  const body = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()]);
  return Buffer.concat([nonce, cipher.getAuthTag(), body]);
}
export function openSealedShare<T>(value: Buffer, key: ShareEncryptionKey, context: string): T {
  if (!Buffer.isBuffer(key)) return openVersionedShare<T>(value, key, context);
  if (value.length < 29) throw new Error('Invalid encrypted share.');
  const decipher = createDecipheriv('aes-256-gcm', key, value.subarray(0, 12));
  decipher.setAAD(Buffer.from(context));
  decipher.setAuthTag(value.subarray(12, 28));
  return JSON.parse(
    Buffer.concat([decipher.update(value.subarray(28)), decipher.final()]).toString('utf8'),
  ) as T;
}

/** Legacy callers keep writing the original format until the key ring is explicitly enabled. */
export type ShareEncryptionKey = Buffer | ShareKeyRing;
export interface ShareKeyRing {
  readonly activeId: string;
  readonly keys: ReadonlyMap<string, Buffer>;
  readonly legacyKey?: Buffer;
  readonly writeLegacy?: boolean;
}
export class ShareRecoveryError extends Error {
  constructor() {
    super('Share link recovery is unavailable.');
  }
}
// Long, fixed discriminator separates the new envelope from legacy random nonces.
const magic = Buffer.from('maevelle:share:v2:');
const keyIdPattern = /^[A-Za-z0-9_-]{1,64}$/;
export function shareKeyRing(
  activeId: string,
  roots: Readonly<Record<string, string>>,
  legacyRoot?: string,
  writeLegacy = false,
): ShareKeyRing {
  if (!keyIdPattern.test(activeId) || !Object.hasOwn(roots, activeId))
    throw new Error('Invalid share recovery key configuration.');
  const keys = new Map<string, Buffer>();
  for (const [id, root] of Object.entries(roots)) {
    if (id === 'legacy' || !keyIdPattern.test(id) || !/^[A-Za-z0-9+/]{43}=$/.test(root))
      throw new Error('Invalid share recovery key configuration.');
    keys.set(id, shareKey(root));
  }
  if (keys.size > 20) throw new Error('Too many share recovery keys.');
  if (writeLegacy && !legacyRoot) throw new Error('Legacy writes require the legacy recovery key.');
  return {
    activeId,
    keys,
    writeLegacy,
    ...(legacyRoot ? { legacyKey: shareKey(legacyRoot) } : {}),
  };
}
export function shareEnvelopeKeyId(value: Buffer): string {
  if (!value.subarray(0, magic.length).equals(magic)) return 'legacy';
  const length = value[magic.length];
  if (!length || length > 64 || value.length < magic.length + 1 + length + 29)
    throw new ShareRecoveryError();
  const id = value.subarray(magic.length + 1, magic.length + 1 + length).toString('utf8');
  if (!keyIdPattern.test(id)) throw new ShareRecoveryError();
  return id;
}
export function shareEnvelopePrefix(id: string): Buffer {
  if (!keyIdPattern.test(id)) throw new ShareRecoveryError();
  return Buffer.concat([magic, Buffer.from([id.length]), Buffer.from(id)]);
}
function sealVersionedShare(value: unknown, ring: ShareKeyRing, context: string): Buffer {
  if (ring.writeLegacy) {
    if (!ring.legacyKey) throw new ShareRecoveryError();
    return sealShare(value, ring.legacyKey, context);
  }
  const key = ring.keys.get(ring.activeId);
  if (!key) throw new ShareRecoveryError();
  const header = shareEnvelopePrefix(ring.activeId);
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  cipher.setAAD(Buffer.concat([header, Buffer.from(context)]));
  const body = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()]);
  return Buffer.concat([header, nonce, cipher.getAuthTag(), body]);
}
function openVersionedShare<T>(value: Buffer, ring: ShareKeyRing, context: string): T {
  try {
    const id = shareEnvelopeKeyId(value);
    if (id === 'legacy') {
      if (!ring.legacyKey) throw new ShareRecoveryError();
      return openSealedShare<T>(value, ring.legacyKey, context);
    }
    const key = ring.keys.get(id);
    if (!key) throw new ShareRecoveryError();
    const header = shareEnvelopePrefix(id);
    const body = value.subarray(header.length);
    const decipher = createDecipheriv('aes-256-gcm', key, body.subarray(0, 12));
    decipher.setAAD(Buffer.concat([header, Buffer.from(context)]));
    decipher.setAuthTag(body.subarray(12, 28));
    return JSON.parse(
      Buffer.concat([decipher.update(body.subarray(28)), decipher.final()]).toString('utf8'),
    ) as T;
  } catch {
    throw new ShareRecoveryError();
  }
}
