import type { Kysely } from 'kysely';
import type { CourierProviderPort } from '@maevelle/core';
import type { EncryptionKey } from '@maevelle/security';

import type { DatabaseSchema } from './index.js';
import { pathaoProviderResolver, PATHAO_PROVIDER_CODE } from './pathao.js';
import { steadfastProviderResolver, STEADFAST_PROVIDER_CODE } from './steadfast.js';

export async function resolveCourierProvider(
  db: Kysely<DatabaseSchema>,
  encryptionKey: EncryptionKey,
  input: { readonly accountId: string; readonly providerCode: string },
  fetchImpl: typeof fetch = fetch,
): Promise<CourierProviderPort | undefined> {
  if (input.providerCode === PATHAO_PROVIDER_CODE) {
    return pathaoProviderResolver(db, encryptionKey, input, fetchImpl);
  }
  if (input.providerCode === STEADFAST_PROVIDER_CODE) {
    return steadfastProviderResolver(db, encryptionKey, input, fetchImpl);
  }
  return undefined;
}
