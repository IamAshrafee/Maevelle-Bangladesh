import { sql, type Kysely } from 'kysely';
import type { DatabaseSchema } from '../../index.js';
import {
  AnalyticsIngestionError,
  ingestStorefrontEvent,
  type StorefrontEventInput,
  type StorefrontEventReceipt,
} from '../behavioral.js';
import type { PrivacyOwner, PrivacyBrowserSession } from './privacy-session.js';
import { privacyProof, readPrivacyPreferences } from './privacy-preferences.js';

export const unconsentedObservation = (): StorefrontEventReceipt => ({
  accepted: false,
  duplicate: false,
  reason: 'ANALYTICS_CONSENT_REQUIRED',
});
function scopedUuid(proof: string) {
  const hex = Buffer.from(proof, 'base64url').subarray(0, 16).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/** The caller has locked the live shopper/browser authority inside this same transaction. */
export async function ingestAuthorizedObservation(
  tx: Kysely<DatabaseSchema>,
  owner: PrivacyOwner,
  s: PrivacyBrowserSession,
  secret: string,
  context: string | undefined,
  observationToken: string | undefined,
  input: StorefrontEventInput,
) {
  // Locks prevent withdrawal committing between qualification and capture. Missing-row grants cannot qualify.
  await sql`select 1 from analytics.commerce_consent where organization_id=${owner.organizationId} and purpose='ANALYTICS'
    and ((subject_id=${s.id} and scope='SESSION') or (subject_id=${owner.shopper?.accountId ?? s.id} and scope='ACCOUNT'))
    order by scope,subject_id for update`.execute(tx);
  const preference = await readPrivacyPreferences(tx, owner, s, secret);
  if (
    !preference.observationToken ||
    preference.context !== context ||
    preference.observationToken !== observationToken ||
    input.consent.analytics !== 'GRANTED' ||
    !preference.observationNotBefore
  )
    return unconsentedObservation();
  const eventTime = Date.parse(input.occurredAt),
    now = Date.now();
  if (
    !Number.isFinite(eventTime) ||
    eventTime < Date.parse(preference.observationNotBefore) ||
    eventTime < now - 120000 ||
    eventTime > now + 5000
  )
    return unconsentedObservation();
  const { anonymousId: discardedAnonymous, attribution: discardedAttribution, ...event } = input;
  void discardedAnonymous;
  void discardedAttribution;
  const cart = event.name.startsWith('CART_');
  if (
    (cart || event.name.startsWith('WISHLIST_')) &&
    input.data.mode !== (owner.shopper ? 'ACCOUNT' : 'GUEST')
  )
    throw new AnalyticsIngestionError('Observation mode does not match the current session.');
  const canonical: StorefrontEventInput = {
    ...event,
    ...(!cart
      ? { sessionId: scopedUuid(privacyProof(secret, `${s.id}:${observationToken}`)) }
      : {}),
    consent: { ...event.consent, analytics: 'GRANTED', marketing: 'DENIED' },
  };
  const receipt = await ingestStorefrontEvent(tx, owner.organizationId, canonical);
  if (!receipt.accepted) return receipt;
  if (receipt.duplicate) {
    const prior =
      await sql`select 1 from analytics.commerce_observation_authority where organization_id=${owner.organizationId}
      and event_id=${input.eventId} and browser_id=${s.id} and consent_revision=${preference.purposes.ANALYTICS.revision}::bigint
      and browser_revision=${preference.purposes.ANALYTICS.browserRevision}::bigint`.execute(tx);
    return prior.rows.length ? receipt : unconsentedObservation();
  }
  await sql`insert into analytics.commerce_observation_authority
    (organization_id,event_id,browser_id,subject_id,scope,consent_revision,browser_revision,policy_version)
    values(${owner.organizationId},${input.eventId},${s.id},${owner.shopper?.accountId ?? s.id},${owner.shopper ? 'ACCOUNT' : 'SESSION'},
      ${preference.purposes.ANALYTICS.revision}::bigint,${preference.purposes.ANALYTICS.browserRevision}::bigint,${preference.policyVersion})`.execute(
    tx,
  );
  return receipt;
}
