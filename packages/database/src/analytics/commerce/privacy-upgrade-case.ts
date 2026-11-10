import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import type { UpgradeCase } from '../../upgrade-cases.js';

let subjectId = '';
/** A populated 3224 preference must survive without inventing browser authority. */
export const privacyPreferencesUpgradeCase: UpgradeCase = {
  async before(db, organizationId) {
    subjectId = randomUUID();
    await sql`insert into analytics.commerce_consent
      (organization_id,subject_id,scope,purpose,decision,policy_version,revision,expires_at)
      values(${organizationId},${subjectId},'SESSION','ANALYTICS','DENIED','prior-policy',1,now()+interval '1 day')`.execute(
      db,
    );
  },
  async after(db, organizationId) {
    const row = (
      await sql<{
        decision: string;
        revision: string;
      }>`select decision,revision::text from analytics.commerce_consent
      where organization_id=${organizationId} and subject_id=${subjectId}`.execute(db)
    ).rows[0];
    assert.equal(row?.decision, 'DENIED');
    assert.equal(row?.revision, '1');
    assert.equal(
      (
        await sql`select 1 from analytics.privacy_browser_sessions where organization_id=${organizationId}`.execute(
          db,
        )
      ).rows.length,
      0,
    );
    assert.equal(
      (
        await sql`select 1 from analytics.commerce_observation_authority where organization_id=${organizationId}`.execute(
          db,
        )
      ).rows.length,
      0,
    );
    await sql`insert into analytics.privacy_browser_sessions(organization_id,token_hash,owner_binding)
      values(${organizationId},${'t'.repeat(43)},${'b'.repeat(43)})`.execute(db);
  },
};
