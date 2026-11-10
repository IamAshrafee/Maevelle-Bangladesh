import { createHmac } from 'node:crypto';
import { sql, type Kysely } from 'kysely';
import type {
  PrivacyPreferencesDto,
  PrivacyPurpose,
  PrivacyDecision,
  SavePrivacyPreferencesDto,
} from '@maevelle/contracts';
import type { DatabaseSchema } from '../../index.js';
import { setCommerceConsent } from './consent.js';
import {
  PrivacyAuthorityError,
  type PrivacyOwner,
  type PrivacyBrowserSession,
} from './privacy-session.js';

export const privacyPolicyVersion = 'privacy-choices-v1';
export const privacyPurposes = ['ANALYTICS', 'ADVERTISING'] as const;
export const privacyProof = (secret: string, value: string) =>
  createHmac('sha256', secret).update(`privacy:v1:${value}`).digest('base64url');
export const privacyContext = (secret: string, owner: PrivacyOwner, s: PrivacyBrowserSession) =>
  privacyProof(
    secret,
    `${owner.organizationId}:${s.token_hash}:${owner.binding}:${privacyPolicyVersion}`,
  );

export function effectivePrivacyDecision(a: PrivacyDecision, b: PrivacyDecision): PrivacyDecision {
  return a === 'DENIED' || b === 'DENIED'
    ? 'DENIED'
    : a === 'GRANTED' && b === 'GRANTED'
      ? 'GRANTED'
      : 'UNKNOWN';
}
export async function readPrivacyPreferences(
  tx: Kysely<DatabaseSchema>,
  owner: PrivacyOwner,
  s: PrivacyBrowserSession,
  secret: string,
): Promise<PrivacyPreferencesDto> {
  // A single statement provides a coherent account/browser snapshot across devices.
  const rows = (
    await sql<{
      scope: 'SESSION' | 'ACCOUNT';
      subject_id: string;
      purpose: PrivacyPurpose;
      decision: PrivacyDecision;
      revision: string;
      policy_version: string;
      changed_at: Date;
      expires_at: Date;
      live: boolean;
    }>`
    select *,revision::text,expires_at>clock_timestamp() live from analytics.commerce_consent
    where organization_id=${owner.organizationId} and ((subject_id=${s.id} and scope='SESSION')
      or (subject_id=${owner.shopper?.accountId ?? s.id} and scope=${owner.shopper ? 'ACCOUNT' : 'SESSION'}))`.execute(
      tx,
    )
  ).rows;
  const purposes = {} as PrivacyPreferencesDto['purposes'];
  let notBefore: string | null = null;
  for (const purpose of privacyPurposes) {
    const browser = rows.find(
      (r) => r.scope === 'SESSION' && r.subject_id === s.id && r.purpose === purpose,
    );
    const primary = owner.shopper
      ? rows.find(
          (r) =>
            r.scope === 'ACCOUNT' &&
            r.subject_id === owner.shopper!.accountId &&
            r.purpose === purpose,
        )
      : browser;
    const decision = (row: typeof primary): PrivacyDecision =>
      row?.live && row.policy_version === privacyPolicyVersion ? row.decision : 'UNKNOWN';
    const effective = effectivePrivacyDecision(decision(primary), decision(browser));
    const changed = Math.max(
      primary?.changed_at.valueOf() ?? 0,
      browser?.changed_at.valueOf() ?? 0,
    );
    purposes[purpose] = {
      decision: decision(primary),
      effectiveDecision: effective,
      revision: primary?.revision ?? '0',
      browserRevision: browser?.revision ?? '0',
      policyVersion: primary?.policy_version ?? null,
      changedAt: changed ? new Date(changed).toISOString() : null,
      expiresAt:
        primary && browser
          ? new Date(
              Math.min(
                primary.expires_at.valueOf(),
                browser.expires_at.valueOf(),
                s.expires_at.valueOf(),
              ),
            ).toISOString()
          : null,
    };
    if (purpose === 'ANALYTICS' && effective === 'GRANTED') notBefore = purposes[purpose].changedAt;
  }
  const context = privacyContext(secret, owner, s);
  return {
    schemaVersion: 1,
    context,
    scope: owner.shopper ? 'ACCOUNT' : 'SESSION',
    policyVersion: privacyPolicyVersion,
    purposes,
    observationNotBefore: notBefore,
    observationToken: notBefore
      ? privacyProof(
          secret,
          `${context}:${purposes.ANALYTICS.revision}:${purposes.ANALYTICS.browserRevision}`,
        )
      : null,
    externalDispatchEnabled: false,
  };
}

export async function savePrivacyPreferences(
  tx: Kysely<DatabaseSchema>,
  owner: PrivacyOwner,
  s: PrivacyBrowserSession,
  input: SavePrivacyPreferencesDto,
) {
  if (input.policyVersion !== privacyPolicyVersion)
    throw new PrivacyAuthorityError('POLICY_CHANGED');
  // Fixed scope/purpose lock order; exact CAS also covers races when rows do not exist yet.
  await sql`select 1 from analytics.commerce_consent where organization_id=${owner.organizationId}
    and ((subject_id=${s.id} and scope='SESSION') or (subject_id=${owner.shopper?.accountId ?? s.id} and scope='ACCOUNT'))
    order by scope,subject_id,purpose for update`.execute(tx);
  for (const purpose of privacyPurposes) {
    const choice = input.choices[purpose];
    try {
      if (owner.shopper)
        await setCommerceConsent(
          tx,
          {
            organizationId: owner.organizationId,
            subjectId: owner.shopper.accountId,
            scope: 'ACCOUNT',
          },
          {
            purpose,
            decision: choice.decision,
            policyVersion: privacyPolicyVersion,
            expectedRevision: choice.expectedRevision,
            expiresAt: new Date(Date.now() + 90 * 86400000),
          },
        );
      else if (choice.expectedRevision !== choice.expectedBrowserRevision)
        throw new PrivacyAuthorityError('CONSENT_REVISION_CONFLICT');
      await setCommerceConsent(
        tx,
        { organizationId: owner.organizationId, subjectId: s.id, scope: 'SESSION' },
        {
          purpose,
          decision: choice.decision,
          policyVersion: privacyPolicyVersion,
          expectedRevision: choice.expectedBrowserRevision,
          expiresAt: s.expires_at,
        },
      );
    } catch (error) {
      if (error instanceof Error && error.message === 'CONSENT_REVISION_CONFLICT')
        throw new PrivacyAuthorityError('CONSENT_REVISION_CONFLICT');
      throw error;
    }
  }
}
