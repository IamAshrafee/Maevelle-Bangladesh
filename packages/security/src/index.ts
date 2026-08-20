import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

export interface EncryptionKey {
  readonly id: string;
  readonly value: Uint8Array;
}

const encryptionVersion = 'v1';
const initializationVectorLength = 12;
const authenticationTagLength = 16;
const encryptionKeyLength = 32;

function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer.`);
  }
}

function assertEncryptionKey(key: EncryptionKey): Buffer {
  if (!key.id) {
    throw new Error('Encryption key id is required.');
  }

  const keyBuffer = Buffer.from(key.value);

  if (keyBuffer.length !== encryptionKeyLength) {
    throw new Error('AES-256-GCM requires a 32-byte encryption key.');
  }

  return keyBuffer;
}

export function generateOpaqueToken(byteLength = 32): string {
  assertPositiveInteger(byteLength, 'Token byte length');
  return randomBytes(byteLength).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('base64url');
}

export function hmacSha256(secret: string | Uint8Array, value: string): string {
  return createHmac('sha256', secret).update(value, 'utf8').digest('base64url');
}

export function constantTimeEqual(left: string | Uint8Array, right: string | Uint8Array): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

/**
 * Encrypts an application secret using AES-256-GCM. Key loading and rotation
 * policy remain feature-level concerns; this helper accepts no implicit key.
 */
export function encryptSecret(plaintext: string, key: EncryptionKey): string {
  const keyBuffer = assertEncryptionKey(key);
  const initializationVector = randomBytes(initializationVectorLength);
  const cipher = createCipheriv('aes-256-gcm', keyBuffer, initializationVector, {
    authTagLength: authenticationTagLength,
  });
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authenticationTag = cipher.getAuthTag();

  return [
    encryptionVersion,
    key.id,
    initializationVector.toString('base64url'),
    authenticationTag.toString('base64url'),
    ciphertext.toString('base64url'),
  ].join('.');
}

export function decryptSecret(payload: string, key: EncryptionKey): string {
  const keyBuffer = assertEncryptionKey(key);
  const [version, keyId, encodedInitializationVector, encodedAuthenticationTag, encodedCiphertext] =
    payload.split('.');

  if (
    version !== encryptionVersion ||
    keyId !== key.id ||
    !encodedInitializationVector ||
    !encodedAuthenticationTag ||
    !encodedCiphertext
  ) {
    throw new Error('Unable to decrypt secret.');
  }

  try {
    const initializationVector = Buffer.from(encodedInitializationVector, 'base64url');
    const authenticationTag = Buffer.from(encodedAuthenticationTag, 'base64url');
    const ciphertext = Buffer.from(encodedCiphertext, 'base64url');

    if (
      initializationVector.length !== initializationVectorLength ||
      authenticationTag.length !== authenticationTagLength
    ) {
      throw new Error('Invalid encrypted payload.');
    }

    const decipher = createDecipheriv('aes-256-gcm', keyBuffer, initializationVector, {
      authTagLength: authenticationTagLength,
    });
    decipher.setAuthTag(authenticationTag);

    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch {
    throw new Error('Unable to decrypt secret.');
  }
}
