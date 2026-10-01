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

type StoredSessionIndexEntry = { readonly token: string; readonly expiresAt: number };
type StoredSessionPayload = {
  readonly session?: {
    readonly id?: string;
    readonly createdAt?: string;
    readonly updatedAt?: string;
    readonly expiresAt?: string;
    readonly ipAddress?: string | null;
    readonly userAgent?: string | null;
  };
};

function parseJson<T>(value: unknown): T | undefined {
  if (typeof value !== 'string') return undefined;
  try {
    return JSON.parse(value) as T;
  } catch {
    return undefined;
  }
}

/** Revokes every Better Auth secondary-storage session without exposing tokens. */
export async function revokeAuthSessionsForUser(
  options: AuthStorageOptions,
  userId: string,
): Promise<number> {
  const storage = createAuthSecondaryStorage(options);
  const indexKey = `active-sessions-${userId}`;
  const entries = parseJson<StoredSessionIndexEntry[]>(await storage.get(indexKey)) ?? [];
  await Promise.all(entries.map((entry) => storage.delete(entry.token)));
  await storage.delete(indexKey);
  return entries.length;
}

/** Returns security metadata only; session tokens never leave encrypted storage. */
export async function listAuthSessionsForUser(options: AuthStorageOptions, userId: string) {
  const storage = createAuthSecondaryStorage(options);
  const entries =
    parseJson<StoredSessionIndexEntry[]>(await storage.get(`active-sessions-${userId}`)) ?? [];
  const sessions = await Promise.all(
    entries
      .filter((entry) => entry.expiresAt > Date.now())
      .map(async (entry) => parseJson<StoredSessionPayload>(await storage.get(entry.token))?.session),
  );
  return sessions.filter((session) => session !== undefined);
}
