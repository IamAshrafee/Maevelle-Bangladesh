import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Pool } from 'pg';
import { sql } from 'kysely';
import * as assets from './assets.js';
import * as capital from './capital.js';
import * as finance from './finance.js';
import { createDatabase, type DatabaseClient } from './index.js';
import { runMigrations } from './migrate.js';
import { createOrganization } from './platform.js';

const configuredUrl = process.env.TEST_DATABASE_URL!;
const databaseName = `maevelle_assets_${crypto.randomUUID().replaceAll('-', '')}`;
const testUrl = new URL(configuredUrl);
testUrl.pathname = `/${databaseName}`;
const adminUrl = new URL(configuredUrl);
adminUrl.pathname = '/postgres';
const adminPool = new Pool({ connectionString: adminUrl.toString() });
let database: DatabaseClient;
const actor = undefined as never;

beforeAll(async () => {
  if (new URL(configuredUrl).pathname.slice(1) !== 'maevelle_test')
    throw new Error('Asset integration tests require the disposable maevelle_test configuration.');
  await adminPool.query(`create database "${databaseName}"`);
  database = createDatabase({ connectionString: testUrl.toString(), maxConnections: 4 });
  await runMigrations(database.db);
});
afterAll(async () => {
  await database?.close();
  await adminPool.query(`drop database if exists "${databaseName}" with (force)`);
  await adminPool.end();
});

async function organization(label: string) {
  return (
    await createOrganization(database.db, {
      code: `assets-${label}-${crypto.randomUUID().slice(0, 8)}`,
      displayName: 'Asset Test',
      timezone: 'UTC',
      defaultLocale: 'en',
      defaultCurrency: 'BDT',
    })
  ).id;
}

describe('Asset Management', () => {
  it('registers existing Assets without fabricating Finance and rejects cross-tenant assignment', async () => {
    const organizationId = await organization('existing');
    const otherOrganizationId = await organization('other');
    const before = await sql<{
      count: string;
    }>`select count(*)::text as count from finance.finance_transactions where organization_id=${organizationId}`.execute(
      database.db,
    );
    const created = await assets.createAsset(database.db, {
      organizationId,
      actorId: actor,
      name: 'Existing laptop',
      acquisitionSource: 'EXISTING',
      acquisitionDate: '2025-01-01',
      currencyCode: 'BDT',
      idempotencyKey: crypto.randomUUID(),
    });
    const detail = await assets.getAssetDetail(database.db, organizationId, created.id);
    expect(detail.assetCode).toMatch(/^AST-\d{6}$/);
    expect(detail.financial.expense).toBeNull();
    expect(detail.financial.payments).toHaveLength(0);
    const after = await sql<{
      count: string;
    }>`select count(*)::text as count from finance.finance_transactions where organization_id=${organizationId}`.execute(
      database.db,
    );
    expect(after.rows[0]?.count).toBe(before.rows[0]?.count);
    const userId = crypto.randomUUID();
    const membershipId = crypto.randomUUID();
    await sql`insert into iam.users (id,name,email,email_normalized) values (${userId}::uuid,'Other person',${`${userId}@example.test`},${`${userId}@example.test`});insert into iam.organization_memberships (id,organization_id,user_id,membership_type,status) values (${membershipId}::uuid,${otherOrganizationId},${userId}::uuid,'STANDARD','ACTIVE')`.execute(
      database.db,
    );
    await expect(
      assets.assignAsset(database.db, {
        organizationId,
        actorId: actor,
        assetId: created.id,
        custodianMembershipId: membershipId,
        expectedVersion: detail.version,
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('derives owner-funded acquisition provenance and links maintenance cost to Finance', async () => {
    const organizationId = await organization('funded');
    const category = await finance.createExpenseCategory(database.db, {
      organizationId,
      code: 'EQUIPMENT',
      name: 'Equipment',
    });
    const expense = await finance.createExpense(database.db, {
      organizationId,
      actorId: actor,
      categoryId: category!.id,
      amount: '20000',
      currencyCode: 'BDT',
      description: 'Office printer',
      expenseDate: '2026-10-01',
      idempotencyKey: crypto.randomUUID(),
    });
    const contributor = await capital.createCapitalContributor(database.db, {
      organizationId,
      actorId: actor,
      displayName: 'Owner A',
      idempotencyKey: crypto.randomUUID(),
    });
    await capital.recordOwnerFundedExpense(database.db, {
      organizationId,
      actorId: actor,
      contributorId: contributor.id,
      expenseId: expense.id,
      amount: '20000',
      occurredAt: '2026-10-01T08:00:00.000Z',
      idempotencyKey: crypto.randomUUID(),
    });
    const created = await assets.createAsset(database.db, {
      organizationId,
      actorId: actor,
      name: 'Office printer',
      acquisitionSource: 'EXPENSE',
      acquisitionDate: '2026-10-01',
      currencyCode: 'USD',
      expenseId: expense.id,
      idempotencyKey: crypto.randomUUID(),
    });
    const repair = await finance.createExpense(database.db, {
      organizationId,
      actorId: actor,
      categoryId: category!.id,
      amount: '2000',
      currencyCode: 'BDT',
      description: 'Printer repair',
      expenseDate: '2026-10-02',
      idempotencyKey: crypto.randomUUID(),
    });
    await assets.recordMaintenance(database.db, {
      organizationId,
      actorId: actor,
      assetId: created.id,
      type: 'REPAIR',
      occurredOn: '2026-10-02',
      workPerformed: 'Replaced feed roller',
      expenseId: repair.id,
      idempotencyKey: crypto.randomUUID(),
    });
    const detail = await assets.getAssetDetail(database.db, organizationId, created.id);
    expect(detail.acquisitionCost).toBe('20000.0000');
    expect(detail.currencyCode).toBe('BDT');
    expect(detail.financial.payments[0]).toMatchObject({
      source: 'OWNER_CAPITAL',
      contributorName: 'Owner A',
    });
    expect(detail.maintenance[0]).toMatchObject({
      expenseId: repair.id,
      expenseAmount: '2000.0000',
    });

    const expenseDetail = await finance.getExpenseDetail(database.db, organizationId, expense.id);
    expect(expenseDetail.linkedAssets).toContainEqual(
      expect.objectContaining({
        id: created.id,
        linkType: 'ACQUISITION',
      }),
    );
    const repairDetail = await finance.getExpenseDetail(database.db, organizationId, repair.id);
    expect(repairDetail.linkedAssets).toContainEqual(
      expect.objectContaining({
        id: created.id,
        linkType: 'MAINTENANCE',
      }),
    );
  });

  it('posts sale proceeds once and makes sold Assets immutable', async () => {
    const organizationId = await organization('sale');
    const account = await finance.createFinancialAccount(database.db, {
      organizationId,
      actorId: actor,
      accountNumber: 'BANK-1',
      name: 'Bank',
      accountType: 'BANK',
      currencyCode: 'BDT',
      openingBalance: '1000',
      idempotencyKey: crypto.randomUUID(),
    });
    const created = await assets.createAsset(database.db, {
      organizationId,
      actorId: actor,
      name: 'Old monitor',
      acquisitionSource: 'EXISTING',
      acquisitionDate: '2024-01-01',
      acquisitionCost: '12000',
      currencyCode: 'BDT',
      idempotencyKey: crypto.randomUUID(),
    });
    const detail = await assets.getAssetDetail(database.db, organizationId, created.id);
    const input = {
      organizationId,
      actorId: actor,
      assetId: created.id,
      accountId: account.id,
      amount: '5000',
      occurredAt: '2026-10-02T10:00:00.000Z',
      expectedVersion: detail.version,
      idempotencyKey: crypto.randomUUID(),
    };
    await assets.sellAsset(database.db, input);
    await assets.sellAsset(database.db, input);
    const sold = await assets.getAssetDetail(database.db, organizationId, created.id);
    expect(sold.status).toBe('SOLD');
    expect(sold.financial.sale).toMatchObject({
      amount: '5000.0000',
      accountId: account.id,
      currencyCode: 'BDT',
    });
    const entries = await sql<{
      count: string;
      amount: string;
    }>`select count(*)::text as count,sum(amount_delta)::text as amount from finance.financial_account_entries entry join finance.finance_transactions transaction on transaction.id=entry.finance_transaction_id where transaction.organization_id=${organizationId} and transaction.source_domain='assets.asset' and transaction.source_id=${created.id} group by transaction.source_id`.execute(
      database.db,
    );
    expect(entries.rows[0]).toMatchObject({ count: '1', amount: '5000.0000' });
    await expect(
      assets.assignAsset(database.db, {
        organizationId,
        actorId: actor,
        assetId: created.id,
        custodianMembershipId: null,
        expectedVersion: sold.version,
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });
});
