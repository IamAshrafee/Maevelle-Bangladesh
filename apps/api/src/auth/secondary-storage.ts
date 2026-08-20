import type { DatabaseClient } from '@maevelle/database';
import {
  consumeAuthStorageValue,
  deleteAuthStorageValue,
  getAuthStorageValue,
  incrementAuthStorageValue,
  setAuthStorageValue,
} from '@maevelle/database/platform';
import { decryptSecret, encryptSecret, hmacSha256 } from '@maevelle/security';

export interface AuthStorageOptions {
  readonly database: DatabaseClient;
  readonly hmacSecret: string;
  readonly encryptionKey: Uint8Array;
}

/** PostgreSQL-backed, encrypted Better Auth secondary storage. Raw credentials never persist. */
export function createAuthSecondaryStorage(options: AuthStorageOptions) {
  const key = { id: 'v1', value: options.encryptionKey };
  const hash = (value: string) => hmacSha256(options.hmacSecret, value);
  const decode = (value: Buffer | undefined): string | null =>
    value ? decryptSecret(value.toString('utf8'), key) : null;

  return {
    async get(storageKey: string): Promise<unknown> {
      return decode(await getAuthStorageValue(options.database.db, hash(storageKey)));
    },
    async getAndDelete(storageKey: string): Promise<unknown> {
      return decode(await consumeAuthStorageValue(options.database.db, hash(storageKey)));
    },
    async set(storageKey: string, value: string, ttl?: number): Promise<void> {
      const expiresAt = ttl === undefined ? null : new Date(Date.now() + ttl * 1000);
      await setAuthStorageValue(
        options.database.db,
        hash(storageKey),
        Buffer.from(encryptSecret(value, key), 'utf8'),
        expiresAt,
      );
    },
    async delete(storageKey: string): Promise<void> {
      await deleteAuthStorageValue(options.database.db, hash(storageKey));
    },
    async increment(storageKey: string, ttl: number): Promise<number> {
      return incrementAuthStorageValue(options.database.db, hash(storageKey), ttl);
    },
  };
}
