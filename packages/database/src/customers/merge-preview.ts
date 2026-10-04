import { sql, type Kysely } from 'kysely';

import type { DatabaseSchema } from '../index.js';
import { CustomerDomainError, getCustomerDetail } from '../customers.js';
import type { CustomerMergePreview } from './types.js';

export async function getCustomerMergePreview(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  sourceCustomerId: string,
  targetCustomerId: string,
): Promise<CustomerMergePreview> {
  if (sourceCustomerId === targetCustomerId) {
    throw new CustomerDomainError('VALIDATION_FAILED', 'A customer cannot be merged into itself.');
  }

  const [sourceDetail, targetDetail] = await Promise.all([
    getCustomerDetail(db, organizationId, sourceCustomerId),
    getCustomerDetail(db, organizationId, targetCustomerId),
  ]);

  const blockingConflicts: string[] = [];
  const warnings: string[] = [];

  if (sourceDetail.status === 'MERGED' || sourceDetail.status === 'ANONYMIZED') {
    blockingConflicts.push(`Source customer is ${sourceDetail.status.toLowerCase()} and cannot be merged.`);
  }
  if (targetDetail.status === 'MERGED' || targetDetail.status === 'ANONYMIZED') {
    blockingConflicts.push(`Target customer is ${targetDetail.status.toLowerCase()} and cannot be used as merge target.`);
  }

  // Check accounts
  const [sourceAccount, targetAccount] = await Promise.all([
    sql<{ user_id: string }>`
      select user_id from customers.customer_accounts
      where organization_id = ${organizationId} and customer_id = ${sourceCustomerId} and status = 'ACTIVE'
    `.execute(db),
    sql<{ user_id: string }>`
      select user_id from customers.customer_accounts
      where organization_id = ${organizationId} and customer_id = ${targetCustomerId} and status = 'ACTIVE'
    `.execute(db),
  ]);

  const sourceUserId = sourceAccount.rows[0]?.user_id;
  const targetUserId = targetAccount.rows[0]?.user_id;

  if (sourceUserId && targetUserId && sourceUserId !== targetUserId) {
    blockingConflicts.push('DIFFERENT_ACTIVE_ACCOUNTS');
  }

  // Count duplicate contacts
  const targetPhoneSet = new Set(targetDetail.phones.map((p) => p.normalizedPhone));
  let duplicatePhones = 0;
  let phonesToCombine = 0;
  for (const phone of sourceDetail.phones) {
    if (targetPhoneSet.has(phone.normalizedPhone)) {
      duplicatePhones++;
    } else {
      phonesToCombine++;
    }
  }

  const targetEmailSet = new Set(targetDetail.emails.map((e) => e.normalizedEmail));
  let duplicateEmails = 0;
  let emailsToCombine = 0;
  for (const email of sourceDetail.emails) {
    if (targetEmailSet.has(email.normalizedEmail)) {
      duplicateEmails++;
    } else {
      emailsToCombine++;
    }
  }

  // Count active restrictions on source
  const sourceRestrictions = await sql<{ count: string }>`
    select count(*)::text as count from customers.customer_restrictions
    where organization_id = ${organizationId} and customer_id = ${sourceCustomerId}
      and status = 'ACTIVE' and (expires_at is null or expires_at > now())
  `.execute(db);
  const restrictionsToTransfer = Number(sourceRestrictions.rows[0]?.count ?? 0);

  if (restrictionsToTransfer > 0) {
    warnings.push(`Source customer has ${restrictionsToTransfer} active commercial restriction(s) that will be transferred to target.`);
  }

  if (sourceUserId && !targetUserId) {
    warnings.push('Source customer has an authenticated account link which will be transferred to the target customer.');
  }

  const targetTagIds = new Set(targetDetail.tags.map((t) => t.id));
  const tagsToMerge = sourceDetail.tags.filter((t) => !targetTagIds.has(t.id)).length;

  return {
    sourceCustomer: {
      id: sourceDetail.id,
      customerNumber: sourceDetail.customerNumber,
      displayName: sourceDetail.displayName,
      status: sourceDetail.status,
      version: sourceDetail.version,
      createdAt: sourceDetail.createdAt,
      firstSource: sourceDetail.firstSource,
      latestSource: sourceDetail.latestSource,
      primaryPhone: sourceDetail.primaryPhone ?? null,
      primaryEmail: sourceDetail.primaryEmail ?? null,
      orderCount: sourceDetail.orderCount ?? 0,
      totalSpend: sourceDetail.totalSpend ?? '0',
      lastOrderAt: sourceDetail.lastOrderAt ?? null,
    },
    targetCustomer: {
      id: targetDetail.id,
      customerNumber: targetDetail.customerNumber,
      displayName: targetDetail.displayName,
      status: targetDetail.status,
      version: targetDetail.version,
      createdAt: targetDetail.createdAt,
      firstSource: targetDetail.firstSource,
      latestSource: targetDetail.latestSource,
      primaryPhone: targetDetail.primaryPhone ?? null,
      primaryEmail: targetDetail.primaryEmail ?? null,
      orderCount: targetDetail.orderCount ?? 0,
      totalSpend: targetDetail.totalSpend ?? '0',
      lastOrderAt: targetDetail.lastOrderAt ?? null,
    },
    canMerge: blockingConflicts.length === 0,
    blockingConflicts,
    warnings,
    summary: {
      ordersToMove: sourceDetail.orderCount ?? 0,
      phonesToCombine,
      duplicatePhones,
      emailsToCombine,
      duplicateEmails,
      addressesToMove: sourceDetail.addresses.length,
      notesToMove: sourceDetail.notes.length,
      tagsToMerge,
      restrictionsToTransfer,
      sourceHasAccount: Boolean(sourceUserId),
      targetHasAccount: Boolean(targetUserId),
    },
  };
}
