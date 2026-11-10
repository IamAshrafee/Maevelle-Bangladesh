import assert from 'node:assert/strict';
import { sql } from 'kysely';
import type { UpgradeCase } from '../../upgrade-cases.js';

let historicalId = '';
export const commerceMeasurementUpgradeCase: UpgradeCase = {
  async before(db, organizationId) {
    historicalId = (
      await sql<{ id: string }>`insert into platform.outbox_events
      (organization_id,event_type,event_version,aggregate_type,aggregate_id,payload,occurred_at)
      values(${organizationId},'orders.order.placed',1,'orders.order',uuidv7(),'{"historical":true}',clock_timestamp()) returning id::text`.execute(
        db,
      )
    ).rows[0]!.id;
  },
  async after(db, organizationId) {
    assert.equal(
      (
        await sql`select 1 from platform.outbox_events where id=${historicalId}::bigint and payload='{"historical":true}'::jsonb`.execute(
          db,
        )
      ).rows.length,
      1,
    );
    assert.equal(
      (
        await sql`select 1 from platform.event_consumer_receipts where outbox_event_id=${historicalId}::bigint and consumer_name='analytics.commerce.v1'`.execute(
          db,
        )
      ).rows.length,
      0,
    );
    const fresh = (
      await sql<{ id: string }>`insert into platform.outbox_events
      (organization_id,event_type,event_version,aggregate_type,aggregate_id,payload,occurred_at)
      values(${organizationId},'orders.order.placed',1,'orders.order',uuidv7(),'{}',clock_timestamp()) returning id::text`.execute(
        db,
      )
    ).rows[0]!.id;
    assert.equal(
      (
        await sql`select 1 from platform.event_consumer_receipts where outbox_event_id=${fresh}::bigint
      and consumer_name='analytics.commerce.v1' and status='PENDING'`.execute(db)
      ).rows.length,
      1,
    );
  },
};
