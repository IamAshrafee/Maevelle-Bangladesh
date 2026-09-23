import { sql } from 'kysely';

import {
  changeFinancialAccountStatus,
  createFinancialAccount,
} from '../../finance.js';
import { accountSeedData } from '../data/accounts.js';
import type {
  FinancialAccountSeedItem,
  SeedContext,
  SeedModule,
  SeedModuleResult,
} from '../types.js';

interface ExistingAccountRow {
  readonly id: string;
  readonly account_number: string;
  readonly name: string;
  readonly account_type: 'CASH' | 'BANK' | 'MOBILE_WALLET' | 'OTHER';
  readonly currency_code: string;
  readonly status: 'ACTIVE' | 'INACTIVE';
  readonly reference_label: string | null;
  readonly version: string;
}

/**
 * Creates a Financial Accounts Seed Module with custom or canonical operating accounts.
 */
export function createAccountsSeedModule(
  items: readonly FinancialAccountSeedItem[] = accountSeedData,
): SeedModule {
  return {
    id: 'accounts',
    name: 'Financial Accounts',
    description: 'Operating cash, bank, and mobile wallet accounts with zero initial float',
    scope: 'bootstrap',
    dependencies: [],
    async run(context: SeedContext): Promise<SeedModuleResult> {
      const existingRows = (
        await sql<ExistingAccountRow>`
          select id::text, account_number, name, account_type, currency_code, status, reference_label, version::text
          from finance.financial_accounts
          where organization_id = ${context.organizationId}
        `.execute(context.db)
      ).rows;

      const existingByCode = new Map<string, ExistingAccountRow>();
      const existingByName = new Map<string, ExistingAccountRow>();
      for (const row of existingRows) {
        existingByCode.set(row.account_number.trim().toUpperCase(), row);
        existingByName.set(row.name.trim().toLowerCase(), row);
      }

      let createdCount = 0;
      let updatedCount = 0;
      let unchangedCount = 0;

      for (const item of items) {
        const accountNumber = item.accountNumber.trim().toUpperCase();
        const name = item.name.trim();
        const accountType = item.accountType;
        const currencyCode = item.currencyCode.trim().toUpperCase();
        const referenceLabel = item.referenceLabel?.trim() || null;
        const targetStatus = item.status ?? 'ACTIVE';

        let existing = existingByCode.get(accountNumber);
        if (!existing && item.previousAccountNumbers?.length) {
          for (const prev of item.previousAccountNumbers) {
            const found = existingByCode.get(prev.trim().toUpperCase());
            if (found) {
              existing = found;
              break;
            }
          }
        }
        if (!existing) {
          existing = existingByName.get(name.toLowerCase());
        }

        if (!existing) {
          const idempotencyKey = `seed-finance-acc-${context.organizationId}-${accountNumber}`;
          const created = await createFinancialAccount(context.db, {
            organizationId: context.organizationId,
            actorId: context.actorId,
            accountNumber,
            name,
            accountType,
            currencyCode,
            ...(referenceLabel ? { referenceLabel } : {}),
            openingBalance: item.openingBalance ?? '0',
            idempotencyKey,
          });

          const newRow: ExistingAccountRow = {
            id: created.id,
            account_number: accountNumber,
            name,
            account_type: accountType,
            currency_code: currencyCode,
            status: targetStatus,
            reference_label: referenceLabel,
            version: '1',
          };
          existingByCode.set(accountNumber, newRow);
          existingByName.set(name.toLowerCase(), newRow);
          createdCount += 1;
        } else {
          const codeChanged = existing.account_number.trim().toUpperCase() !== accountNumber;
          const nameChanged = existing.name.trim() !== name;
          const labelChanged = (existing.reference_label?.trim() ?? null) !== referenceLabel;
          const statusChanged = existing.status !== targetStatus;

          if (codeChanged || nameChanged || labelChanged) {
            await sql`
              update finance.financial_accounts
              set account_number = ${accountNumber}, name = ${name}, reference_label = ${referenceLabel}, updated_at = now()
              where organization_id = ${context.organizationId} and id = ${existing.id}
            `.execute(context.db);
          }

          if (statusChanged) {
            await changeFinancialAccountStatus(context.db, {
              organizationId: context.organizationId,
              actorId: context.actorId,
              accountId: existing.id,
              status: targetStatus,
              expectedVersion: Number(existing.version),
              reason: 'Synchronized account status via seed module',
            });
          }

          if (codeChanged || nameChanged || labelChanged || statusChanged) {
            updatedCount += 1;
          } else {
            unchangedCount += 1;
          }
        }
      }

      return {
        moduleId: 'accounts',
        moduleName: 'Financial Accounts',
        totalCount: items.length,
        createdCount,
        updatedCount,
        unchangedCount,
        failedCount: 0,
      };
    },
  };
}

export const accountsSeedModule: SeedModule = createAccountsSeedModule();
