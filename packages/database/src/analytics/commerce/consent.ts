import { sql, type Kysely } from 'kysely';
import type { DatabaseSchema } from '../../index.js';

export interface CommerceConsentSubject {
  organizationId: string;
  /** Opaque server-bound preference subject; never a bearer or browser-supplied account ID. */
  subjectId: string;
  scope: 'SESSION' | 'ACCOUNT';
}
export type CommercePurpose = 'ANALYTICS' | 'ADVERTISING';

/** Trusted application port. A future HTTP caller must resolve scope from authenticated/session authority. */
export async function setCommerceConsent(
  db: Kysely<DatabaseSchema>,
  subject: CommerceConsentSubject,
  input: {
    purpose: CommercePurpose;
    decision: 'GRANTED' | 'DENIED' | 'UNKNOWN';
    policyVersion: string;
    expectedRevision: string;
    expiresAt: Date;
  },
) {
  if (
    !['ANALYTICS', 'ADVERTISING'].includes(input.purpose) ||
    !['GRANTED', 'DENIED', 'UNKNOWN'].includes(input.decision) ||
    !/^[a-zA-Z0-9._-]{1,64}$/.test(input.policyVersion) ||
    !/^\d{1,18}$/.test(input.expectedRevision) ||
    !Number.isFinite(input.expiresAt.valueOf())
  )
    throw new Error('Invalid consent preference');
  const row = (
    await sql<{ revision: string }>`insert into analytics.commerce_consent
    (organization_id,subject_id,scope,purpose,decision,policy_version,revision,expires_at)
    select ${subject.organizationId},${subject.subjectId},${subject.scope},${input.purpose},${input.decision},${input.policyVersion},1,${input.expiresAt}
    where ${input.expectedRevision}::bigint=0
    on conflict(organization_id,subject_id,scope,purpose) do update set decision=excluded.decision,
      policy_version=excluded.policy_version,revision=analytics.commerce_consent.revision+1,
      changed_at=clock_timestamp(),expires_at=excluded.expires_at
    where analytics.commerce_consent.revision=${input.expectedRevision}::bigint
    returning revision::text`.execute(db)
  ).rows[0];
  // UPDATE is separate because INSERT ... SELECT with a false predicate cannot reach ON CONFLICT.
  if (row) return row;
  if (input.expectedRevision !== '0') {
    const updated = (
      await sql<{
        revision: string;
      }>`update analytics.commerce_consent set decision=${input.decision},
      policy_version=${input.policyVersion},revision=revision+1,changed_at=clock_timestamp(),expires_at=${input.expiresAt}
      where organization_id=${subject.organizationId} and subject_id=${subject.subjectId} and scope=${subject.scope}
        and purpose=${input.purpose} and revision=${input.expectedRevision}::bigint returning revision::text`.execute(
        db,
      )
    ).rows[0];
    if (updated) return updated;
  }
  throw new Error('CONSENT_REVISION_CONFLICT');
}

export async function getCommerceConsent(
  db: Kysely<DatabaseSchema>,
  subject: CommerceConsentSubject,
) {
  const rows = (
    await sql<{
      purpose: CommercePurpose;
      decision: 'GRANTED' | 'DENIED' | 'UNKNOWN';
      revision: string;
      policyVersion: string;
      changedAt: string;
      expiresAt: string;
    }>`
    select purpose,case when expires_at<=clock_timestamp() then 'UNKNOWN' else decision end decision,
      revision::text,policy_version as "policyVersion",changed_at::text as "changedAt",expires_at::text as "expiresAt"
    from analytics.commerce_consent where organization_id=${subject.organizationId} and subject_id=${subject.subjectId} and scope=${subject.scope}`.execute(
      db,
    )
  ).rows;
  return {
    purposes: rows,
    missingDecision: 'UNKNOWN' as const,
    externalDispatchEnabled: false as const,
  };
}
