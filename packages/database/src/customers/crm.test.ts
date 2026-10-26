import { afterAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';

import { createDatabase } from '../index.js';
import { createOrganization } from '../platform.js';
import {
  addCustomerNote,
  createCustomer,
  createCustomerCustomFieldDefinition,
  createCustomerSegment,
  getCustomerCrmProfile,
  getCrmAnalytics,
  getCustomerDetail,
  listCustomerSegmentMembers,
  listCustomerPrivacyRequests,
  listCustomers,
  setCustomerCustomFieldValue,
  setStaticSegmentMembership,
  transitionCustomerLifecycle,
  updateCustomerCrmProfile,
  updateCustomerNote,
  updateCustomerPrivacyRequest,
  createCustomerPrivacyRequest,
  exportCustomerDataSubjectBundle,
  upsertCustomerPreference,
} from '../customers.js';

const database = createDatabase({
  connectionString: process.env.TEST_DATABASE_URL!,
  maxConnections: 5,
});
afterAll(async () => database.close());

async function fixture() {
  const organization = await createOrganization(database.db, {
    code: `crm-${crypto.randomUUID().slice(0, 12)}`,
    displayName: 'CRM test',
    timezone: 'UTC',
    defaultLocale: 'en',
    defaultCurrency: 'BDT',
  });
  return { organizationId: organization.id, actorId: crypto.randomUUID() };
}

describe('Customer CRM operations', () => {
  it('maintains profile provenance, governed custom values, lifecycle history and static segments', async () => {
    const context = await fixture();
    const customer = await createCustomer(database.db, { ...context, displayName: 'Amina Rahman' });
    const updated = await updateCustomerCrmProfile(database.db, {
      ...context,
      customerId: customer.id,
      expectedVersion: customer.version,
      firstName: 'Amina',
      lastName: 'Rahman',
      preferredLanguage: 'bn',
    });
    await upsertCustomerPreference(database.db, {
      ...context,
      customerId: customer.id,
      key: 'preferred_channel',
      value: 'WHATSAPP',
      source: 'CUSTOMER_CONFIRMED',
      confidence: 'CONFIRMED',
      evidenceReference: 'conversation:test',
    });
    await transitionCustomerLifecycle(database.db, {
      ...context,
      customerId: customer.id,
      expectedVersion: updated.version,
      stage: 'PROSPECT',
      reason: 'Customer asked for a product recommendation.',
    });

    const field = await createCustomerCustomFieldDefinition(database.db, {
      ...context,
      key: 'style_profile',
      label: 'Style profile',
      valueType: 'SINGLE_CHOICE',
      choices: ['CLASSIC', 'MODERN'],
      editCapability: 'customers.sensitive.view',
    });
    await expect(
      setCustomerCustomFieldValue(database.db, {
        ...context,
        customerId: customer.id,
        fieldDefinitionId: field.id,
        value: 'CLASSIC',
        capabilities: ['customers.manage'],
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
    await setCustomerCustomFieldValue(database.db, {
      ...context,
      customerId: customer.id,
      fieldDefinitionId: field.id,
      value: 'CLASSIC',
      capabilities: ['customers.sensitive.view'],
    });

    const segment = await createCustomerSegment(database.db, {
      ...context,
      name: 'Concierge list',
      segmentType: 'STATIC',
    });
    await setStaticSegmentMembership(database.db, {
      ...context,
      segmentId: segment.id,
      customerId: customer.id,
      included: true,
    });
    const members = await listCustomerSegmentMembers(database.db, {
      organizationId: context.organizationId,
      segmentId: segment.id,
    });
    const profile = await getCustomerCrmProfile(database.db, context.organizationId, customer.id);

    expect(profile).toMatchObject({
      firstName: 'Amina',
      lastName: 'Rahman',
      preferredLanguage: 'bn',
      lifecycleStage: 'PROSPECT',
    });
    expect(profile.preferences[0]).toMatchObject({
      key: 'preferred_channel',
      value: 'WHATSAPP',
      confidence: 'CONFIRMED',
    });
    expect(profile.customFields[0]).toMatchObject({ value: 'CLASSIC' });
    expect(members.items.map((member) => member.id)).toContain(customer.id);
    const analytics = await getCrmAnalytics(database.db, context.organizationId);
    expect(analytics).toMatchObject({
      totalCustomers: 1,
      commerce: { firstTimeBuyers: 0, repeatBuyers: 0, completedOrderCount: 0 },
    });
    expect(analytics.acquisitionCohorts).toHaveLength(12);
  });

  it('preserves immutable note revisions while editing and pinning', async () => {
    const context = await fixture();
    const customer = await createCustomer(database.db, {
      ...context,
      displayName: 'Note Customer',
    });
    const note = await addCustomerNote(database.db, {
      ...context,
      customerId: customer.id,
      body: 'Original note',
    });
    await updateCustomerNote(database.db, {
      ...context,
      customerId: customer.id,
      noteId: note.id,
      body: 'Corrected note',
      isPinned: true,
      expectedVersion: 1,
    });

    const detail = await getCustomerDetail(database.db, context.organizationId, customer.id);
    const revision = await sql<{
      body: string;
      is_pinned: boolean;
      version: string;
    }>`select body,is_pinned,version::text from customers.customer_note_revisions
      where organization_id=${context.organizationId} and note_id=${note.id}`.execute(database.db);
    expect(detail.notes[0]).toMatchObject({ body: 'Corrected note', isPinned: true, version: 2 });
    expect(revision.rows[0]).toEqual({ body: 'Original note', is_pinned: false, version: '1' });
  });

  it('scopes advanced directory filters and privacy request transitions', async () => {
    const context = await fixture();
    const customer = await createCustomer(database.db, {
      ...context,
      displayName: 'Privacy Customer',
      source: 'FACEBOOK',
    });
    await transitionCustomerLifecycle(database.db, {
      ...context,
      customerId: customer.id,
      expectedVersion: customer.version,
      stage: 'PROSPECT',
      reason: 'Customer entered a sales conversation.',
    });
    const filtered = await listCustomers(database.db, context.organizationId, {
      lifecycleStage: 'PROSPECT',
      source: 'FACEBOOK',
    });
    expect(filtered.data.map((item) => item.id)).toContain(customer.id);
    const request = await createCustomerPrivacyRequest(database.db, {
      ...context,
      customerId: customer.id,
      requestType: 'ACCESS',
      reason: 'Customer requested a copy of stored profile data.',
    });
    const open = await listCustomerPrivacyRequests(database.db, {
      organizationId: context.organizationId,
      status: 'OPEN',
    });
    expect(open.items.map((item) => item.id)).toContain(request.id);
    await updateCustomerPrivacyRequest(database.db, {
      ...context,
      requestId: request.id,
      expectedVersion: 1,
      status: 'IDENTITY_VERIFICATION_REQUIRED',
      resolutionNotes: 'Awaiting verification through the registered contact method.',
    });
    const verification = await listCustomerPrivacyRequests(database.db, {
      organizationId: context.organizationId,
      status: 'IDENTITY_VERIFICATION_REQUIRED',
    });
    expect(verification.items.find((item) => item.id === request.id)).toMatchObject({
      customerId: customer.id,
      version: 2,
    });
  });

  it('exports a controlled customer-owned bundle only for verified in-progress requests', async () => {
    const context = await fixture();
    const customer = await createCustomer(database.db, {
      ...context,
      displayName: 'Export Customer',
      phone: '+8801712345678',
      email: 'export@example.test',
    });
    const request = await createCustomerPrivacyRequest(database.db, {
      ...context,
      customerId: customer.id,
      requestType: 'EXPORT',
      reason: 'Customer requested portable account data.',
    });
    await expect(
      exportCustomerDataSubjectBundle(database.db, {
        ...context,
        requestId: request.id,
        reason: 'Attempt before verification',
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    await updateCustomerPrivacyRequest(database.db, {
      ...context,
      requestId: request.id,
      expectedVersion: 1,
      status: 'IN_PROGRESS',
      resolutionNotes: 'Requester verified through the registered contact method.',
    });
    const exported = await exportCustomerDataSubjectBundle(database.db, {
      ...context,
      requestId: request.id,
      reason: 'Fulfill verified portability request',
    });
    expect(exported.fileName).toContain(customer.customerNumber);
    expect(exported.bundle).toMatchObject({
      schemaVersion: 1,
      customer: { id: customer.id, display_name: 'Export Customer' },
      phones: [expect.objectContaining({ raw_value: '+8801712345678' })],
      emails: [expect.objectContaining({ raw_value: 'export@example.test' })],
    });
    expect(exported.bundle).not.toHaveProperty('notes');
    expect(exported.bundle).not.toHaveProperty('auditEvents');
  });
});
