import { sql, type Kysely } from 'kysely';
import type { DatabaseSchema } from '../index.js';
import { createOrganization } from '../platform.js';
import {
  configurePaymentMethod,
  createPaymentIntentForOrder,
  submitManualPayment,
} from '../payments.js';
import type { IndependentReceiptEvidenceDto } from '@maevelle/contracts';

/** Synthetic financial facts only; never provider approval or final Checkout quotation. */
export async function manualPaymentFixture(db: Kysely<DatabaseSchema>) {
  const organizationId = (
    await createOrganization(db, {
      code: `p04-${crypto.randomUUID()}`,
      displayName: 'Synthetic payment integrity',
      timezone: 'Asia/Dhaka',
      defaultLocale: 'en',
      defaultCurrency: 'BDT',
    })
  ).id;
  async function actor(capabilities: string[], owner = false) {
    const id = crypto.randomUUID(),
      email = `${id}@example.test`;
    await sql`insert into iam.users(id,name,email,email_normalized) values(${id},'Synthetic payment operator',${email},${email})`.execute(
      db,
    );
    const membership = (
      await sql<{
        id: string;
      }>`insert into iam.organization_memberships(organization_id,user_id,membership_type,status)
      values(${organizationId},${id},${owner ? 'OWNER' : 'STANDARD'},'ACTIVE') returning id`.execute(
        db,
      )
    ).rows[0]!;
    for (const capability of capabilities)
      await sql`insert into iam.membership_capability_grants(membership_id,capability_code)
      select ${membership.id},${capability} where exists(select 1 from iam.capability_definitions where capability_code=${capability})`.execute(
        db,
      );
    return id;
  }
  const owner = await actor([], true),
    reviewer = await actor([
      'payments.verify',
      'payments.review',
      'payments.destinations.approve',
      'payments.destinations.view',
      'payments.correct',
    ]);
  const viewer = await actor(['payments.view']);
  const account = (
    await sql<{
      id: string;
    }>`insert into finance.financial_accounts(organization_id,account_number,name,account_type,currency_code)
    values(${organizationId},'SYNTHETIC-WALLET','Synthetic bKash wallet','MOBILE_WALLET','BDT') returning id`.execute(
      db,
    )
  ).rows[0]!;
  await configurePaymentMethod(db, {
    organizationId,
    actorId: owner,
    code: 'BKASH_MANUAL',
    name: 'Synthetic manual receipt',
    status: 'ACTIVE',
    displayOrder: 20,
    paymentWindowMinutes: 60,
    instructions: {
      accountNumber: '01700000000',
      text: 'Synthetic approved payment instruction fixture',
    },
  });
  async function order(reference = `SYN-${crypto.randomUUID()}`, policyId?: string) {
    const row = (
      await sql<{
        id: string;
        order_number: string;
      }>`insert into orders.orders(organization_id,order_number,source,sales_channel,currency_code,payment_method,
      subtotal_amount,discount_amount,total_amount) values(${organizationId},${`SYN-${crypto.randomUUID()}`},'MANUAL','ADMIN','BDT','BKASH_MANUAL',100,0,100)
      returning id,order_number`.execute(db)
    ).rows[0]!;
    await sql`insert into orders.order_customer_snapshots(organization_id,order_id,display_name,phone,normalized_phone)
      values(${organizationId},${row.id},'Synthetic buyer','01700000000','01700000000')`.execute(
      db,
    );
    await sql`insert into orders.order_addresses(organization_id,order_id,address_type,recipient_name,phone,address_line_1,country_code)
      values(${organizationId},${row.id},'DELIVERY','Synthetic buyer','01700000000','Synthetic address','BD')`.execute(
      db,
    );
    const intent = await createPaymentIntentForOrder(db, {
      organizationId,
      orderId: row.id,
      orderNumber: row.order_number,
      currency: 'BDT',
      paymentMethod: 'BKASH_MANUAL',
      expectedAmount: '100.0000',
      ...(policyId ? { operatingPolicyId: policyId } : {}),
    });
    const claim = await submitManualPayment(db, {
      organizationId,
      orderId: row.id,
      customerReference: reference,
      idempotencyKey: crypto.randomUUID(),
    });
    const evidence: IndependentReceiptEvidenceDto = {
      transactionId: reference,
      receivingNumber: '01700000000',
      currency: 'BDT',
      valueTime: '2026-01-01T00:00:00Z',
      source: 'PROVIDER_STATEMENT',
      evidenceReference: 'synthetic-independent-statement-row',
      financialAccountId: account.id,
    };
    return { orderId: row.id, intentId: intent.id, attemptId: claim.id, evidence };
  }
  return { organizationId, owner, reviewer, viewer, accountId: account.id, actor, order };
}
