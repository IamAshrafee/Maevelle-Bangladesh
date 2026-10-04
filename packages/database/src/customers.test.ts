import { afterAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { createDatabase } from './index.js';
import { createOrganization } from './platform.js';
import {
  createCustomer,
  updateCustomer,
  getCustomerDetail,
  addCustomerPhone,
  addCustomerAddress,
  removeCustomerAddress,
  resolveOrCreateOrderCustomer,
  mergeCustomers,
  anonymizeCustomer,
  applyCustomerRestriction,
  liftCustomerRestriction,
  listCustomerRestrictions,
  linkCustomerAccount,
  unlinkCustomerAccount,
  getCustomerAccount,
  resolveCustomerForAuthenticatedUser,
  getCustomerMergePreview,
  getCustomerTimeline,
  verifyCustomerPhone,
  verifyCustomerEmail,
  CustomerDomainError,
} from './customers.js';

const database = createDatabase({
  connectionString: process.env.TEST_DATABASE_URL!,
  maxConnections: 10,
});
afterAll(async () => database.close());

async function fixture() {
  const organization = await createOrganization(database.db, {
    code: `cust-${crypto.randomUUID().slice(0, 12)}`,
    displayName: 'Cust test',
    timezone: 'UTC',
    defaultLocale: 'en',
    defaultCurrency: 'BDT',
  });
  const actorId = crypto.randomUUID();
  return { organizationId: organization.id, actorId };
}

describe('Customers Domain', () => {
  it('creates and retrieves a customer', async () => {
    const { organizationId, actorId } = await fixture();
    const customer = await createCustomer(database.db, {
      organizationId,
      actorId,
      displayName: 'Test Customer',
    });

    expect(customer.id).toBeDefined();

    const fetched = await getCustomerDetail(database.db, organizationId, customer.id);

    expect(fetched.displayName).toBe('Test Customer');
    expect(fetched.status).toBe('ACTIVE');
  });

  it('adds and removes a customer address successfully', async () => {
    const { organizationId, actorId } = await fixture();
    const customer = await createCustomer(database.db, {
      organizationId,
      actorId,
      displayName: 'Address Customer',
    });

    const addressId = await addCustomerAddress(database.db, {
      organizationId,
      actorId,
      customerId: customer.id,
      recipientName: 'Test Recipient',
      addressLine1: 'Test Address 1',
      countryCode: 'BD',
      city: 'Dhaka',
      isDefault: true,
    });

    expect(addressId).toBeDefined();

    const fetched = await getCustomerDetail(database.db, organizationId, customer.id);

    expect(fetched.addresses).toHaveLength(1);
    expect(fetched.addresses[0]?.addressLine1).toBe('Test Address 1');

    await removeCustomerAddress(database.db, {
      organizationId,
      actorId,
      customerId: customer.id,
      addressId: addressId.id,
    });

    const fetchedAfterRemove = await getCustomerDetail(database.db, organizationId, customer.id);

    // Removed address check
    expect(fetchedAfterRemove.addresses).toHaveLength(0);
  });

  it('prevents direct manual update to MERGED status', async () => {
    const { organizationId, actorId } = await fixture();
    const customer = await createCustomer(database.db, {
      organizationId,
      actorId,
      displayName: 'To Merge',
    });

    await expect(
      updateCustomer(database.db, {
        organizationId,
        actorId,
        customerId: customer.id,
        expectedVersion: customer.version,
        status: 'MERGED' as 'ACTIVE',
      }),
    ).rejects.toThrow('customers_check');
  });

  it('canonicalizes Bangladesh phones and reuses one strong order identity match', async () => {
    const { organizationId, actorId } = await fixture();
    const customer = await createCustomer(database.db, {
      organizationId,
      actorId,
      displayName: 'Nusrat Jahan',
      phone: '01712 345678',
      source: 'ADMIN_CREATED',
    });

    const detail = await getCustomerDetail(database.db, organizationId, customer.id);
    expect(detail.phones[0]?.normalizedPhone).toBe('+8801712345678');

    const resolution = await resolveOrCreateOrderCustomer(database.db, {
      organizationId,
      actorId,
      actorType: 'GUEST_CHECKOUT',
      displayName: '  Nusrat   Jahan ',
      phone: '+880 1712-345678',
      source: 'STOREFRONT',
    });
    expect(resolution.customerId).toBe(customer.id);
    expect(resolution.created).toBe(false);

    await expect(
      addCustomerPhone(database.db, {
        organizationId,
        actorId,
        customerId: customer.id,
        phone: '+8801712345678',
      }),
    ).rejects.toThrow('already belongs to the customer');
  });

  it('serializes concurrent first-time resolution for the same phone identity', async () => {
    const { organizationId, actorId } = await fixture();
    const resolve = () =>
      resolveOrCreateOrderCustomer(database.db, {
        organizationId,
        actorId,
        actorType: 'GUEST_CHECKOUT',
        displayName: 'Concurrent Customer',
        phone: '01812 345678',
        source: 'STOREFRONT',
      });

    const results = await Promise.all([resolve(), resolve()]);

    expect(new Set(results.map((result) => result.customerId)).size).toBe(1);
    expect(results.map((result) => result.created).sort()).toEqual([false, true]);
  });

  it('does not mutate a customer child record through another organization', async () => {
    const owner = await fixture();
    const other = await fixture();
    const customer = await createCustomer(database.db, {
      organizationId: owner.organizationId,
      actorId: owner.actorId,
      displayName: 'Tenant-owned Customer',
    });
    const address = await addCustomerAddress(database.db, {
      organizationId: owner.organizationId,
      actorId: owner.actorId,
      customerId: customer.id,
      recipientName: 'Tenant Owner',
      addressLine1: 'Dhaka',
      countryCode: 'BD',
    });

    await removeCustomerAddress(database.db, {
      organizationId: other.organizationId,
      actorId: other.actorId,
      customerId: customer.id,
      addressId: address.id,
    });
    await expect(
      addCustomerPhone(database.db, {
        organizationId: other.organizationId,
        actorId: other.actorId,
        customerId: customer.id,
        phone: '01712345678',
      }),
    ).rejects.toThrow('Customer was not found');

    const detail = await getCustomerDetail(database.db, owner.organizationId, customer.id);
    expect(detail.addresses).toHaveLength(1);
    expect(detail.addresses[0]?.id).toBe(address.id);
  });

  it('merges duplicate profiles into one canonical customer and replays safely', async () => {
    const { organizationId, actorId } = await fixture();
    const source = await createCustomer(database.db, {
      organizationId,
      actorId,
      displayName: 'Duplicate Nusrat',
      phone: '01712 345678',
      source: 'FACEBOOK',
    });
    const target = await createCustomer(database.db, {
      organizationId,
      actorId,
      displayName: 'Nusrat Jahan',
      phone: '01812 345678',
      email: 'nusrat@example.com',
      source: 'ADMIN_CREATED',
    });
    await addCustomerAddress(database.db, {
      organizationId,
      actorId,
      customerId: source.id,
      recipientName: 'Nusrat',
      addressLine1: 'Dhanmondi',
      countryCode: 'BD',
      isDefault: true,
    });
    const sourceDetail = await getCustomerDetail(database.db, organizationId, source.id);
    const targetDetail = await getCustomerDetail(database.db, organizationId, target.id);
    const key = crypto.randomUUID();

    const merged = await mergeCustomers(database.db, {
      organizationId,
      actorId,
      sourceCustomerId: source.id,
      targetCustomerId: target.id,
      sourceExpectedVersion: sourceDetail.version,
      targetExpectedVersion: targetDetail.version,
      reason: 'Confirmed duplicate customer after phone verification.',
      idempotencyKey: key,
    });

    expect(merged.id).toBe(target.id);
    expect(merged.phones.map((phone) => phone.normalizedPhone).sort()).toEqual([
      '+8801712345678',
      '+8801812345678',
    ]);
    expect(merged.addresses).toHaveLength(1);
    const alias = await getCustomerDetail(database.db, organizationId, source.id);
    expect(alias).toMatchObject({ status: 'MERGED', canonicalCustomerId: target.id });

    const replay = await mergeCustomers(database.db, {
      organizationId,
      actorId,
      sourceCustomerId: source.id,
      targetCustomerId: target.id,
      sourceExpectedVersion: sourceDetail.version,
      targetExpectedVersion: targetDetail.version,
      reason: 'Confirmed duplicate customer after phone verification.',
      idempotencyKey: key,
    });
    expect(replay.id).toBe(target.id);
  });

  it('anonymizes current profile PII and merged alias names while retaining evidence', async () => {
    const { organizationId, actorId } = await fixture();
    const source = await createCustomer(database.db, {
      organizationId,
      actorId,
      displayName: 'Alias Personal Name',
      phone: '01612 345678',
    });
    const canonical = await createCustomer(database.db, {
      organizationId,
      actorId,
      displayName: 'Canonical Personal Name',
      phone: '01912 345678',
      email: 'private@example.com',
    });
    const sourceDetail = await getCustomerDetail(database.db, organizationId, source.id);
    const canonicalDetail = await getCustomerDetail(database.db, organizationId, canonical.id);
    const merged = await mergeCustomers(database.db, {
      organizationId,
      actorId,
      sourceCustomerId: source.id,
      targetCustomerId: canonical.id,
      sourceExpectedVersion: sourceDetail.version,
      targetExpectedVersion: canonicalDetail.version,
      reason: 'Duplicate identity.',
      idempotencyKey: crypto.randomUUID(),
    });
    const anonymizeKey = crypto.randomUUID();
    const anonymized = await anonymizeCustomer(database.db, {
      organizationId,
      actorId,
      customerId: canonical.id,
      expectedVersion: merged.version,
      reasonCode: 'CUSTOMER_REQUEST',
      idempotencyKey: anonymizeKey,
    });

    expect(anonymized.status).toBe('ANONYMIZED');
    expect(anonymized.displayName).toMatch(/^Anonymized customer /);
    expect(anonymized.phones).toHaveLength(0);
    expect(anonymized.emails).toHaveLength(0);
    const alias = await getCustomerDetail(database.db, organizationId, source.id);
    expect(alias.displayName).toMatch(/^Anonymized customer /);
    const evidence = await sql<{ count: number }>`
      select count(*)::int as count from customers.customer_anonymizations
      where organization_id = ${organizationId} and customer_id = ${canonical.id}
    `.execute(database.db);
    expect(evidence.rows[0]?.count).toBe(1);

    const replay = await anonymizeCustomer(database.db, {
      organizationId,
      actorId,
      customerId: canonical.id,
      expectedVersion: merged.version,
      reasonCode: 'CUSTOMER_REQUEST',
      idempotencyKey: anonymizeKey,
    });
    expect(replay.status).toBe('ANONYMIZED');
  });

  it('auto-learns customer address and reuses existing on subsequent guest orders', async () => {
    const { organizationId, actorId } = await fixture();

    const orderAddress = {
      recipientName: 'Amina Begum',
      phone: '+8801712349999',
      addressLine1: 'House 42, Road 11, Banani',
      city: 'Dhaka',
      district: 'Dhaka',
      postalCode: '1213',
      countryCode: 'BD',
    };

    // First guest order creates customer and auto-learns default address
    const first = await resolveOrCreateOrderCustomer(database.db, {
      organizationId,
      actorId,
      actorType: 'GUEST_CHECKOUT',
      displayName: 'Amina Begum',
      phone: '01712349999',
      source: 'STOREFRONT',
      address: orderAddress,
    });

    expect(first.created).toBe(true);
    expect(first.customerAddressId).toBeDefined();

    const customer = await getCustomerDetail(database.db, organizationId, first.customerId);
    expect(customer.addresses).toHaveLength(1);
    expect(customer.addresses[0]?.isDefault).toBe(true);
    expect(customer.addresses[0]?.addressLine1).toBe('House 42, Road 11, Banani');

    // Second guest order with same address reuses existing address book entry
    const second = await resolveOrCreateOrderCustomer(database.db, {
      organizationId,
      actorId,
      actorType: 'GUEST_CHECKOUT',
      displayName: 'Amina Begum',
      phone: '+8801712349999',
      source: 'STOREFRONT',
      address: orderAddress,
    });

    expect(second.created).toBe(false);
    expect(second.customerId).toBe(first.customerId);
    expect(second.customerAddressId).toBe(first.customerAddressId);

    const customerAfterSecond = await getCustomerDetail(database.db, organizationId, first.customerId);
    expect(customerAfterSecond.addresses).toHaveLength(1);
  });

  it('commercial restrictions apply, enforce and lift cleanly', async () => {
    const { organizationId, actorId } = await fixture();
    const customer = await createCustomer(database.db, {
      organizationId,
      actorId,
      displayName: 'Restricted Customer',
      phone: '01811223344',
    });

    // Apply COD restriction
    const codRestriction = await applyCustomerRestriction(database.db, {
      organizationId,
      actorId,
      customerId: customer.id,
      restrictionType: 'COD_RESTRICTED',
      reason: 'Frequent RTO history on COD deliveries',
      notes: 'Customer refused past 3 deliveries without notice',
    });
    expect(codRestriction.status).toBe('ACTIVE');
    expect(codRestriction.restrictionType).toBe('COD_RESTRICTED');

    // Resolution reflects active COD_RESTRICTED
    const resolved = await resolveOrCreateOrderCustomer(database.db, {
      organizationId,
      actorId,
      actorType: 'GUEST_CHECKOUT',
      displayName: 'Restricted Customer',
      phone: '01811223344',
      source: 'STOREFRONT',
    });
    expect(resolved.activeRestrictions).toContain('COD_RESTRICTED');

    // Apply ORDERING_BLOCKED restriction
    const blockRestriction = await applyCustomerRestriction(database.db, {
      organizationId,
      actorId,
      customerId: customer.id,
      restrictionType: 'ORDERING_BLOCKED',
      reason: 'Fraudulent activity reported',
    });
    expect(blockRestriction.status).toBe('ACTIVE');

    // Resolution fails when ordering is blocked
    await expect(
      resolveOrCreateOrderCustomer(database.db, {
        organizationId,
        actorId,
        actorType: 'GUEST_CHECKOUT',
        displayName: 'Restricted Customer',
        phone: '01811223344',
        source: 'STOREFRONT',
      }),
    ).rejects.toThrow('This customer cannot place new orders');

    // Lift ORDERING_BLOCKED restriction
    const lifted = await liftCustomerRestriction(database.db, {
      organizationId,
      actorId,
      customerId: customer.id,
      restrictionId: blockRestriction.id,
      liftReason: 'Account reviewed and verified by senior operator',
    });
    expect(lifted.status).toBe('LIFTED');
    expect(lifted.liftReason).toBe('Account reviewed and verified by senior operator');

    // Resolution now succeeds again
    const resolvedAfterLift = await resolveOrCreateOrderCustomer(database.db, {
      organizationId,
      actorId,
      actorType: 'GUEST_CHECKOUT',
      displayName: 'Restricted Customer',
      phone: '01811223344',
      source: 'STOREFRONT',
    });
    expect(resolvedAfterLift.customerId).toBe(customer.id);
  });

  it('authenticated customer accounts link, unbind, and resolve guest history', async () => {
    const { organizationId, actorId } = await fixture();

    // 1. Guest customer creates order history
    const guestCustomer = await createCustomer(database.db, {
      organizationId,
      actorId,
      displayName: 'Guest Shopper',
      phone: '01999887766',
      email: 'guest@example.com',
      source: 'STOREFRONT',
    });

    const testEmail = `guest.${crypto.randomUUID().slice(0, 8)}@example.com`;
    const userResult = await sql<{ id: string }>`
      insert into iam.users (email, name)
      values (${testEmail}, 'Registered Shopper')
      returning id
    `.execute(database.db);
    const userId = userResult.rows[0]!.id;

    // 3. System resolves authenticated user -> securely binds to historical guest customer
    const resolution = await resolveCustomerForAuthenticatedUser(database.db, {
      organizationId,
      userId,
      userName: 'Registered Shopper',
      userPhone: '+8801999887766',
      userEmail: 'guest@example.com',
    });

    expect(resolution.customerId).toBe(guestCustomer.id);
    expect(resolution.newlyLinked).toBe(true);

    const account = await getCustomerAccount(database.db, organizationId, guestCustomer.id);
    expect(account).not.toBeNull();
    expect(account?.status).toBe('ACTIVE');
    expect(account?.userId).toBe(userId);
    expect(account?.linkType).toBe('VERIFIED_PHONE');

    // Customer detail includes account metadata
    const detail = await getCustomerDetail(database.db, organizationId, guestCustomer.id);
    expect(detail.account?.userId).toBe(userId);

    // 4. Unlink account
    const unlinked = await unlinkCustomerAccount(database.db, {
      organizationId,
      actorId: userId,
      customerId: guestCustomer.id,
      reason: 'User requested account unlinking',
    });
    expect(unlinked.status).toBe('UNLINKED');
    expect(unlinked.unlinkReason).toBe('User requested account unlinking');
  });

  it('merge preview detects conflicts and merge transfers accounts & restrictions safely', async () => {
    const { organizationId, actorId } = await fixture();

    const source = await createCustomer(database.db, {
      organizationId,
      actorId,
      displayName: 'Source Customer',
      phone: '01611000001',
    });

    const target = await createCustomer(database.db, {
      organizationId,
      actorId,
      displayName: 'Target Customer',
      phone: '01611000002',
    });

    // Apply restriction on source
    await applyCustomerRestriction(database.db, {
      organizationId,
      actorId,
      customerId: source.id,
      restrictionType: 'COD_RESTRICTED',
      reason: 'Source has COD issues',
    });

    // Check merge preview before accounts
    const preview1 = await getCustomerMergePreview(database.db, organizationId, source.id, target.id);
    expect(preview1.canMerge).toBe(true);
    expect(preview1.summary.restrictionsToTransfer).toBe(1);

    // Create 2 auth users and link each to different customers
    const u1Email = `u1.${crypto.randomUUID().slice(0, 8)}@test.com`;
    const u2Email = `u2.${crypto.randomUUID().slice(0, 8)}@test.com`;
    const u1 = (await sql<{ id: string }>`insert into iam.users (email, name) values (${u1Email}, 'User 1') returning id`.execute(database.db)).rows[0]!.id;
    const u2 = (await sql<{ id: string }>`insert into iam.users (email, name) values (${u2Email}, 'User 2') returning id`.execute(database.db)).rows[0]!.id;

    await linkCustomerAccount(database.db, {
      organizationId,
      actorId,
      customerId: source.id,
      userId: u1,
      linkType: 'VERIFIED_PHONE',
    });
    await linkCustomerAccount(database.db, {
      organizationId,
      actorId,
      customerId: target.id,
      userId: u2,
      linkType: 'VERIFIED_PHONE',
    });

    // Preview now detects conflict: two different active accounts
    const preview2 = await getCustomerMergePreview(database.db, organizationId, source.id, target.id);
    expect(preview2.canMerge).toBe(false);
    expect(preview2.blockingConflicts).toContain('DIFFERENT_ACTIVE_ACCOUNTS');

    // Attempting merge throws ACCOUNT_LINK_CONFLICT
    const sDetailBefore = await getCustomerDetail(database.db, organizationId, source.id);
    const tDetailBefore = await getCustomerDetail(database.db, organizationId, target.id);
    await expect(
      mergeCustomers(database.db, {
        organizationId,
        actorId,
        sourceCustomerId: source.id,
        targetCustomerId: target.id,
        sourceExpectedVersion: sDetailBefore.version,
        targetExpectedVersion: tDetailBefore.version,
        reason: 'Duplicate customer merge',
        idempotencyKey: crypto.randomUUID(),
      }),
    ).rejects.toThrow('Cannot merge customers linked to different user accounts');

    // Unlink target's account so only source has an active account link
    await unlinkCustomerAccount(database.db, {
      organizationId,
      actorId: u2,
      customerId: target.id,
      reason: 'Preparing for canonical merge',
    });

    // Perform merge
    const sourceDetail = await getCustomerDetail(database.db, organizationId, source.id);
    const targetDetail = await getCustomerDetail(database.db, organizationId, target.id);

    const merged = await mergeCustomers(database.db, {
      organizationId,
      actorId,
      sourceCustomerId: source.id,
      targetCustomerId: target.id,
      sourceExpectedVersion: sourceDetail.version,
      targetExpectedVersion: targetDetail.version,
      reason: 'Duplicate customer merge',
      idempotencyKey: crypto.randomUUID(),
    });

    expect(merged.id).toBe(target.id);
    // Transferred phone
    expect(merged.phones.some((p) => p.phone === '01611000001')).toBe(true);
    // Transferred restriction
    expect(merged.restrictions.some((r) => r.restrictionType === 'COD_RESTRICTED' && r.status === 'ACTIVE')).toBe(true);
    // Transferred account link to User 1
    expect(merged.account?.userId).toBe(u1);
    expect(merged.account?.status).toBe('ACTIVE');
  });

  it('unified timeline aggregates multi-domain business events', async () => {
    const { organizationId, actorId } = await fixture();
    const customer = await createCustomer(database.db, {
      organizationId,
      actorId,
      displayName: 'Timeline Customer',
      phone: '01511223344',
    });

    await applyCustomerRestriction(database.db, {
      organizationId,
      actorId,
      customerId: customer.id,
      restrictionType: 'ORDER_REVIEW_REQUIRED',
      reason: 'Verification needed',
    });

    const timelineEmail = `timeline.${crypto.randomUUID().slice(0, 8)}@test.com`;
    const user = (await sql<{ id: string }>`insert into iam.users (email, name) values (${timelineEmail}, 'Timeline User') returning id`.execute(database.db)).rows[0]!.id;
    await linkCustomerAccount(database.db, {
      organizationId,
      actorId,
      customerId: customer.id,
      userId: user,
      linkType: 'MANUAL_CLAIM',
    });

    const timeline = await getCustomerTimeline(database.db, organizationId, customer.id);
    expect(timeline.totalCount).toBeGreaterThanOrEqual(3);
    const eventTypes = timeline.items.map((i) => i.eventType);
    expect(eventTypes).toContain('CUSTOMER_CREATED');
    expect(eventTypes).toContain('RESTRICTION_APPLIED');
    expect(eventTypes).toContain('ACCOUNT_LINKED');
  });

  it('contact verification sets verified_at and verification_source', async () => {
    const { organizationId, actorId } = await fixture();
    const customer = await createCustomer(database.db, {
      organizationId,
      actorId,
      displayName: 'Verification Customer',
      phone: '01700112233',
      email: 'verify@example.com',
    });

    const detail = await getCustomerDetail(database.db, organizationId, customer.id);
    const phoneId = detail.phones[0]!.id;
    const emailId = detail.emails[0]!.id;

    const verifiedPhone = await verifyCustomerPhone(database.db, {
      organizationId,
      actorId,
      customerId: customer.id,
      phoneId,
      verificationSource: 'OTP_SMS',
    });
    expect(verifiedPhone.verificationStatus).toBe('VERIFIED');
    expect(verifiedPhone.verifiedAt).toBeDefined();

    const verifiedEmail = await verifyCustomerEmail(database.db, {
      organizationId,
      actorId,
      customerId: customer.id,
      emailId,
      verificationSource: 'MAGIC_LINK',
    });
    expect(verifiedEmail.verificationStatus).toBe('VERIFIED');
    expect(verifiedEmail.verifiedAt).toBeDefined();

    const updated = await getCustomerDetail(database.db, organizationId, customer.id);
    expect(updated.phones[0]?.verificationStatus).toBe('VERIFIED');
    expect(updated.phones[0]?.verificationSource).toBe('OTP_SMS');
    expect(updated.emails[0]?.verificationStatus).toBe('VERIFIED');
    expect(updated.emails[0]?.verificationSource).toBe('MAGIC_LINK');
  });
});
