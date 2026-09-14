import { sql } from 'kysely';
import type { MaevelleDatabase } from '../../index.js';
import {
  createOrganization,
  findActiveOwnerUserId,
  findOrganizationByCode,
} from '../../platform.js';

export const SYSTEM_ACTOR_ID = '00000000-0000-0000-0000-000000000000';

export interface ResolvedTenant {
  readonly id: string;
  readonly code: string;
  readonly displayName: string;
}

/**
 * Resolves an existing organization by code, or provisions the canonical bootstrap
 * organization if starting from an empty/fresh database.
 */
export async function resolveOrganization(
  db: MaevelleDatabase,
  code: string,
  fallbackDisplayName = 'Maevelle Bangladesh',
): Promise<ResolvedTenant> {
  const existing = await findOrganizationByCode(db, code);
  if (existing) {
    const details = await sql<{ display_name: string }>`
      select display_name from platform.organizations where id = ${existing.id} limit 1
    `.execute(db);
    return {
      id: existing.id,
      code,
      displayName: details.rows[0]?.display_name ?? fallbackDisplayName,
    };
  }

  const created = await createOrganization(db, {
    code,
    displayName: fallbackDisplayName,
    timezone: 'Asia/Dhaka',
    defaultLocale: 'en-BD',
    defaultCurrency: 'BDT',
  });

  return {
    id: created.id,
    code,
    displayName: fallbackDisplayName,
  };
}

/**
 * Resolves the active Owner user ID for the organization to act as the audit actor,
 * or falls back to a deterministic system actor UUID when seeding before user registration.
 */
export async function resolveActorId(
  db: MaevelleDatabase,
  organizationId: string,
  preferredActorId?: string,
): Promise<string> {
  if (preferredActorId) return preferredActorId;
  const ownerUserId = await findActiveOwnerUserId(db, organizationId);
  return ownerUserId ?? SYSTEM_ACTOR_ID;
}
