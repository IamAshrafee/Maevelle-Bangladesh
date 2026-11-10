import assert from 'node:assert/strict';
import { sql } from 'kysely';
import type { UpgradeCase } from '../upgrade-cases.js';
import { manualPaymentFixture } from '../testing/manual-payment-fixture.js';

let organizationId = '',
  methodId = '',
  intentId = '';
const attempts: string[] = [];
export const manualPaymentUpgradeCase: UpgradeCase = {
  async before(db) {
    const f = await manualPaymentFixture(db);
    organizationId = f.organizationId;
    methodId = (
      await sql<{
        id: string;
      }>`select id from payments.payment_methods where organization_id=${organizationId} and code='BKASH_MANUAL'`.execute(
        db,
      )
    ).rows[0]!.id;
    const order = (
      await sql<{
        id: string;
      }>`insert into orders.orders(organization_id,order_number,payment_method,currency_code,subtotal_amount,discount_amount,total_amount)
      values(${organizationId},${crypto.randomUUID()},'BKASH_MANUAL','BDT',100,0,100) returning id`.execute(
        db,
      )
    ).rows[0]!;
    intentId = (
      await sql<{
        id: string;
      }>`insert into payments.payment_intents(organization_id,order_id,order_number_snapshot,payment_method_id,currency_code,expected_amount,status)
      values(${organizationId},${order.id},'SYNTHETIC-LEGACY',${methodId},'BDT',100,'READY') returning id`.execute(
        db,
      )
    ).rows[0]!.id;
    attempts.length = 0;
    for (let n = 0; n < 3; n++)
      attempts.push(
        (
          await sql<{
            id: string;
          }>`insert into payments.payment_attempts(organization_id,payment_intent_id,customer_reference,normalized_reference)
      values(${organizationId},${intentId},'SYNTHETIC-OLD-REF','SYNTHETIC-OLD-REF') returning id`.execute(
            db,
          )
        ).rows[0]!.id,
      );
    for (const [n, status] of ['REVERSED', 'CONFIRMED'].entries())
      await sql`insert into payments.payments(organization_id,payment_number,payment_method_id,currency_code,amount,external_reference,normalized_external_reference,status,source_attempt_id)
      values(${organizationId},${crypto.randomUUID()},${methodId},'BDT',100,'SYNTHETIC-OLD-REF','SYNTHETIC-OLD-REF',${status},${attempts[n]})`.execute(
        db,
      );
  },
  async after(db) {
    assert.equal(
      (
        await sql<{
          n: number;
        }>`select historical_count n from payments.receipt_reference_fences where organization_id=${organizationId}`.execute(
          db,
        )
      ).rows[0]?.n,
      2,
    );
    assert.equal(
      (
        await sql<{
          n: string;
        }>`select count(*)::text n from payments.payments where organization_id=${organizationId}`.execute(
          db,
        )
      ).rows[0]?.n,
      '2',
    );
    await assert.rejects(
      sql`insert into payments.payments(organization_id,payment_number,payment_method_id,currency_code,amount,external_reference,normalized_external_reference,source_attempt_id)
      values(${organizationId},${crypto.randomUUID()},${methodId},'BDT',100,'SYNTHETIC-OLD-REF','SYNTHETIC-OLD-REF',${attempts[2]})`.execute(
        db,
      ),
      { code: '23505' },
    );
  },
};
