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
      if (typeof value === 'string' && value.includes('userId') && !storageKey.startsWith('active-sessions-')) {
        try {
          const parsed = JSON.parse(value) as {
            session?: { userId?: string; expiresAt?: string | Date; id?: string };
            user?: { id?: string };
          };
          const userId = parsed?.session?.userId ?? parsed?.user?.id;
          if (userId) {
            const indexKey = `active-sessions-${userId}`;
            const currentRaw = decode(await getAuthStorageValue(options.database.db, hash(indexKey)));
            const currentList = parseJson<StoredSessionIndexEntry[]>(currentRaw) ?? [];
            const now = Date.now();
            const expTime = parsed.session?.expiresAt
              ? new Date(parsed.session.expiresAt).getTime()
              : expiresAt
                ? expiresAt.getTime()
                : now + 12 * 60 * 60 * 1000;
            const updatedList = [
              ...currentList.filter((e) => e.token !== storageKey && e.expiresAt > now),
              { token: storageKey, expiresAt: expTime },
            ];
            await setAuthStorageValue(
              options.database.db,
              hash(indexKey),
              Buffer.from(encryptSecret(JSON.stringify(updatedList), key), 'utf8'),
              new Date(now + 30 * 24 * 60 * 60 * 1000),
            );
          }
        } catch {
          // ignore non-json or unexpected payload
        }
      }
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

/** Saves active session index for a user with encryption and 30d retention. */
async function saveSessionIndex(
  options: AuthStorageOptions,
  userId: string,
  entries: StoredSessionIndexEntry[],
): Promise<void> {
  const key = { id: 'v1', value: options.encryptionKey };
  const hash = (value: string) => hmacSha256(options.hmacSecret, value);
  const indexKey = `active-sessions-${userId}`;
  const now = Date.now();
  await setAuthStorageValue(
    options.database.db,
    hash(indexKey),
    Buffer.from(encryptSecret(JSON.stringify(entries), key), 'utf8'),
    new Date(now + 30 * 24 * 60 * 60 * 1000),
  );
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

/** Revokes a single session by its safe public sessionId. Returns true if revoked. */
export async function revokeAuthSessionById(
  options: AuthStorageOptions,
  userId: string,
  sessionId: string,
): Promise<boolean> {
  const storage = createAuthSecondaryStorage(options);
  const indexKey = `active-sessions-${userId}`;
  const entries = parseJson<StoredSessionIndexEntry[]>(await storage.get(indexKey)) ?? [];
  const now = Date.now();
  let targetToken: string | null = null;
  const remaining: StoredSessionIndexEntry[] = [];

  for (const entry of entries) {
    if (entry.expiresAt <= now) continue;
    const payload = parseJson<StoredSessionPayload>(await storage.get(entry.token));
    if (payload?.session?.id === sessionId) {
      targetToken = entry.token;
    } else {
      remaining.push(entry);
    }
  }

  if (!targetToken) return false;
  await storage.delete(targetToken);
  await saveSessionIndex(options, userId, remaining);
  return true;
}

/** Revokes all active sessions for a user except the current session. Returns count of revoked sessions. */
export async function revokeOtherAuthSessions(
  options: AuthStorageOptions,
  userId: string,
  currentSessionId: string,
): Promise<number> {
  const storage = createAuthSecondaryStorage(options);
  const indexKey = `active-sessions-${userId}`;
  const entries = parseJson<StoredSessionIndexEntry[]>(await storage.get(indexKey)) ?? [];
  const now = Date.now();
  const tokensToDelete: string[] = [];
  const remaining: StoredSessionIndexEntry[] = [];

  for (const entry of entries) {
    if (entry.expiresAt <= now) continue;
    const payload = parseJson<StoredSessionPayload>(await storage.get(entry.token));
    if (payload?.session?.id && payload.session.id === currentSessionId) {
      remaining.push(entry);
    } else {
      tokensToDelete.push(entry.token);
    }
  }

  await Promise.all(tokensToDelete.map((token) => storage.delete(token)));
  await saveSessionIndex(options, userId, remaining);
  return tokensToDelete.length;
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

