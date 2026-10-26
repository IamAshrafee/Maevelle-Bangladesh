import { sql, type Kysely } from 'kysely';
import type {
  CustomerConsentDto,
  CustomerCrmProfileDto,
  CustomerCustomFieldDefinitionDto,
  CustomerFollowUpDto,
  CustomerLifecycleStageDto,
  CustomerPreferenceDto,
  CustomerRelationshipStatusDto,
} from '@maevelle/contracts';

import type { DatabaseSchema } from '../index.js';
import { appendAuditEvent } from '../platform.js';
import { CustomerDomainError } from '../customers.js';

type Db = Kysely<DatabaseSchema>;

async function emitCrmEvent(
  db: Db,
  input: {
    organizationId: string;
    customerId: string;
    eventType: string;
    payload?: Record<string, unknown>;
  },
): Promise<void> {
  await sql`insert into platform.outbox_events(organization_id,event_type,event_version,aggregate_type,aggregate_id,aggregate_version,payload,occurred_at)
    values(${input.organizationId},${input.eventType},1,'customers.customer',${input.customerId},1,
      ${JSON.stringify({ customerId: input.customerId, ...(input.payload ?? {}) })}::jsonb,now())`.execute(
    db,
  );
}

const lifecycleTransitions: Readonly<
  Record<CustomerLifecycleStageDto, readonly CustomerLifecycleStageDto[]>
> = {
  NEW_CONTACT: ['PROSPECT', 'ENGAGED_PROSPECT', 'FIRST_TIME_BUYER'],
  PROSPECT: ['ENGAGED_PROSPECT', 'FIRST_TIME_BUYER', 'INACTIVE_CUSTOMER'],
  ENGAGED_PROSPECT: ['FIRST_TIME_BUYER', 'INACTIVE_CUSTOMER'],
  FIRST_TIME_BUYER: ['REPEAT_CUSTOMER', 'INACTIVE_CUSTOMER'],
  REPEAT_CUSTOMER: ['LOYAL_CUSTOMER', 'INACTIVE_CUSTOMER'],
  LOYAL_CUSTOMER: ['INACTIVE_CUSTOMER'],
  INACTIVE_CUSTOMER: ['RE_ENGAGED_CUSTOMER'],
  RE_ENGAGED_CUSTOMER: ['REPEAT_CUSTOMER', 'LOYAL_CUSTOMER', 'INACTIVE_CUSTOMER'],
};

function assertKey(value: string, label: string): string {
  const normalized = value.trim().toLowerCase();
  if (!/^[a-z][a-z0-9_]{1,63}$/.test(normalized))
    throw new CustomerDomainError(
      'VALIDATION_FAILED',
      `${label} must use lowercase letters, digits, and underscores.`,
    );
  return normalized;
}

async function ensureMutableCustomer(db: Db, organizationId: string, customerId: string) {
  const result = await sql<{ status: string; version: string }>`
    select status, version::text from customers.customers
    where organization_id=${organizationId} and id=${customerId} for update
  `.execute(db);
  const customer = result.rows[0];
  if (!customer) throw new CustomerDomainError('NOT_FOUND', 'Customer was not found.');
  if (customer.status === 'MERGED' || customer.status === 'ANONYMIZED')
    throw new CustomerDomainError(
      'VALIDATION_FAILED',
      `Cannot change a ${customer.status.toLowerCase()} customer.`,
    );
  return customer;
}

function toFollowUp(row: {
  id: string;
  customer_id: string;
  assigned_membership_id: string;
  assignee_name: string | null;
  title: string;
  details: string | null;
  due_at: Date;
  status: CustomerFollowUpDto['status'];
  completed_at: Date | null;
  version: string;
}): CustomerFollowUpDto {
  return {
    id: row.id,
    customerId: row.customer_id,
    assignedMembershipId: row.assigned_membership_id,
    assigneeName: row.assignee_name,
    title: row.title,
    details: row.details,
    dueAt: row.due_at.toISOString(),
    status: row.status,
    completedAt: row.completed_at?.toISOString() ?? null,
    version: Number(row.version),
  };
}

export async function getCustomerCrmProfile(
  db: Db,
  organizationId: string,
  customerId: string,
): Promise<CustomerCrmProfileDto> {
  const [profile, contacts, preferences, customFields, followUps, consents] = await Promise.all([
    sql<{
      id: string;
      first_name: string | null;
      last_name: string | null;
      preferred_language: string | null;
      lifecycle_stage: CustomerLifecycleStageDto;
      relationship_owner_membership_id: string | null;
      owner_name: string | null;
      relationship_status: CustomerRelationshipStatusDto;
      profile_image_asset_id: string | null;
      last_activity_at: Date | null;
      first_purchase_at: Date | null;
      last_purchase_at: Date | null;
      profile_provenance: Record<string, unknown>;
    }>`select c.id,c.first_name,c.last_name,c.preferred_language,c.lifecycle_stage,
        c.relationship_owner_membership_id,u.name owner_name,c.relationship_status,c.profile_image_asset_id,
        c.last_activity_at,c.first_purchase_at,c.last_purchase_at,c.profile_provenance
      from customers.customers c
      left join iam.organization_memberships m on m.organization_id=c.organization_id and m.id=c.relationship_owner_membership_id
      left join iam.users u on u.id=m.user_id
      where c.organization_id=${organizationId} and c.id=${customerId}`.execute(db),
    sql<{ kind: 'PHONE' | 'EMAIL'; verification_status: string }>`
      select 'PHONE'::text kind,verification_status from customers.customer_phones where organization_id=${organizationId} and customer_id=${customerId}
      union all
      select 'EMAIL'::text kind,verification_status from customers.customer_emails where organization_id=${organizationId} and customer_id=${customerId}
    `.execute(db),
    sql<{
      id: string;
      preference_key: string;
      value: unknown;
      source: CustomerPreferenceDto['source'];
      confidence: CustomerPreferenceDto['confidence'];
      evidence_reference: string | null;
      updated_at: Date;
      version: string;
    }>`
      select id,preference_key,value,source,confidence,evidence_reference,updated_at,version::text
      from customers.customer_preferences where organization_id=${organizationId} and customer_id=${customerId}
      order by preference_key
    `.execute(db),
    sql<{
      id: string;
      field_key: string;
      label: string;
      description: string | null;
      value_type: CustomerCustomFieldDefinitionDto['valueType'];
      choices: string[];
      validation: Record<string, unknown>;
      is_required: boolean;
      is_searchable: boolean;
      edit_capability: string;
      schema_version: string;
      status: CustomerCustomFieldDefinitionDto['status'];
      value: unknown;
      value_schema_version: string | null;
      value_updated_at: Date | null;
    }>`
      select d.id,d.field_key,d.label,d.description,d.value_type,d.choices,d.validation,d.is_required,d.is_searchable,
        d.edit_capability,d.schema_version::text,d.status,v.value,v.schema_version::text value_schema_version,v.updated_at value_updated_at
      from customers.customer_custom_field_definitions d
      left join customers.customer_custom_field_values v on v.organization_id=d.organization_id and v.field_definition_id=d.id and v.customer_id=${customerId}
      where d.organization_id=${organizationId} and d.status='ACTIVE'
      order by d.label,d.id
    `.execute(db),
    sql<{
      id: string;
      customer_id: string;
      assigned_membership_id: string;
      assignee_name: string | null;
      title: string;
      details: string | null;
      due_at: Date;
      status: CustomerFollowUpDto['status'];
      completed_at: Date | null;
      version: string;
    }>`
      select f.id,f.customer_id,f.assigned_membership_id,u.name assignee_name,f.title,f.details,f.due_at,f.status,f.completed_at,f.version::text
      from customers.customer_follow_ups f
      left join iam.organization_memberships m on m.organization_id=f.organization_id and m.id=f.assigned_membership_id
      left join iam.users u on u.id=m.user_id
      where f.organization_id=${organizationId} and f.customer_id=${customerId}
      order by case when f.status='OPEN' then 0 else 1 end,f.due_at desc,f.id
      limit 100
    `.execute(db),
    sql<{
      id: string;
      purpose: string;
      channel: CustomerConsentDto['channel'];
      status: CustomerConsentDto['status'];
      lawful_basis: string | null;
      source: string;
      evidence_reference: string | null;
      effective_at: Date;
    }>`
      select distinct on (purpose,channel) id,purpose,channel,status,lawful_basis,source,evidence_reference,effective_at
      from customers.customer_consents where organization_id=${organizationId} and customer_id=${customerId}
      order by purpose,channel,effective_at desc,id desc
    `.execute(db),
  ]);

  const row = profile.rows[0];
  if (!row) throw new CustomerDomainError('NOT_FOUND', 'Customer was not found.');
  const missing: string[] = [];
  const unverified: string[] = [];
  if (!row.first_name && !row.last_name) missing.push('structuredName');
  if (!contacts.rows.some((item) => item.kind === 'PHONE')) missing.push('phone');
  if (!contacts.rows.some((item) => item.kind === 'EMAIL')) missing.push('email');
  if (!row.preferred_language) missing.push('preferredLanguage');
  if (!row.relationship_owner_membership_id) missing.push('relationshipOwner');
  for (const kind of ['PHONE', 'EMAIL'] as const) {
    const rows = contacts.rows.filter((item) => item.kind === kind);
    if (rows.length > 0 && !rows.some((item) => item.verification_status === 'VERIFIED'))
      unverified.push(kind.toLowerCase());
  }
  const requiredCustom = customFields.rows.filter(
    (item) => item.is_required && item.value === null,
  ).length;
  if (requiredCustom > 0) missing.push('requiredCustomFields');
  const considered = 5 + customFields.rows.filter((item) => item.is_required).length;
  const incomplete = missing.length + unverified.length;

  return {
    customerId: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    preferredLanguage: row.preferred_language,
    lifecycleStage: row.lifecycle_stage,
    relationshipOwnerMembershipId: row.relationship_owner_membership_id,
    relationshipOwnerName: row.owner_name,
    relationshipStatus: row.relationship_status,
    profileImageAssetId: row.profile_image_asset_id,
    lastActivityAt: row.last_activity_at?.toISOString() ?? null,
    firstPurchaseAt: row.first_purchase_at?.toISOString() ?? null,
    lastPurchaseAt: row.last_purchase_at?.toISOString() ?? null,
    profileProvenance: row.profile_provenance,
    completeness: {
      percentage: Math.max(
        0,
        Math.round(((considered - Math.min(incomplete, considered)) / considered) * 100),
      ),
      missing,
      unverified,
    },
    preferences: preferences.rows.map((item) => ({
      id: item.id,
      key: item.preference_key,
      value: item.value,
      source: item.source,
      confidence: item.confidence,
      evidenceReference: item.evidence_reference,
      updatedAt: item.updated_at.toISOString(),
      version: Number(item.version),
    })),
    customFields: customFields.rows.map((item) => ({
      definition: {
        id: item.id,
        key: item.field_key,
        label: item.label,
        description: item.description,
        valueType: item.value_type,
        choices: item.choices,
        validation: item.validation,
        isRequired: item.is_required,
        isSearchable: item.is_searchable,
        editCapability: item.edit_capability,
        schemaVersion: Number(item.schema_version),
        status: item.status,
      },
      value: item.value,
      schemaVersion: Number(item.value_schema_version ?? item.schema_version),
      updatedAt: item.value_updated_at?.toISOString() ?? '',
    })),
    followUps: followUps.rows.map(toFollowUp),
    consents: consents.rows.map((item) => ({
      id: item.id,
      purpose: item.purpose,
      channel: item.channel,
      status: item.status,
      lawfulBasis: item.lawful_basis,
      source: item.source,
      evidenceReference: item.evidence_reference,
      effectiveAt: item.effective_at.toISOString(),
    })),
  };
}

export async function updateCustomerCrmProfile(
  db: Db,
  input: {
    organizationId: string;
    actorId: string;
    customerId: string;
    expectedVersion: number;
    firstName?: string | null;
    lastName?: string | null;
    preferredLanguage?: string | null;
    relationshipStatus?: CustomerRelationshipStatusDto;
  },
): Promise<{ version: number }> {
  return db.transaction().execute(async (tx) => {
    const customer = await ensureMutableCustomer(tx, input.organizationId, input.customerId);
    if (Number(customer.version) !== input.expectedVersion)
      throw new CustomerDomainError(
        'STALE_VERSION',
        'Customer has changed; reload before updating.',
      );
    const result = await sql<{ version: string }>`update customers.customers set
      first_name=case when ${input.firstName !== undefined} then ${input.firstName?.trim() || null} else first_name end,
      last_name=case when ${input.lastName !== undefined} then ${input.lastName?.trim() || null} else last_name end,
      preferred_language=case when ${input.preferredLanguage !== undefined} then ${input.preferredLanguage?.trim() || null} else preferred_language end,
      relationship_status=case when ${input.relationshipStatus !== undefined} then ${input.relationshipStatus ?? null} else relationship_status end,
      profile_provenance=profile_provenance || ${JSON.stringify({ lastEditedBy: input.actorId, lastEditedAt: new Date().toISOString() })}::jsonb,
      last_activity_at=now(),version=version+1,updated_at=now()
      where organization_id=${input.organizationId} and id=${input.customerId} returning version::text`.execute(
      tx,
    );
    await appendAuditEvent(tx, {
      organizationId: input.organizationId,
      actorType: 'USER',
      actorId: input.actorId,
      action: 'customers.crm.profile_updated',
      targetType: 'customers.customer',
      targetId: input.customerId,
    });
    await emitCrmEvent(tx, {
      organizationId: input.organizationId,
      customerId: input.customerId,
      eventType: 'customers.crm.profile_updated',
      payload: { version: Number(result.rows[0]!.version) },
    });
    return { version: Number(result.rows[0]!.version) };
  });
}

export async function upsertCustomerPreference(
  db: Db,
  input: {
    organizationId: string;
    actorId: string;
    customerId: string;
    key: string;
    value: unknown;
    source: CustomerPreferenceDto['source'];
    confidence: CustomerPreferenceDto['confidence'];
    evidenceReference?: string;
  },
): Promise<CustomerPreferenceDto> {
  const key = assertKey(input.key, 'Preference key');
  return db.transaction().execute(async (tx) => {
    await ensureMutableCustomer(tx, input.organizationId, input.customerId);
    const result = await sql<{
      id: string;
      preference_key: string;
      value: unknown;
      source: CustomerPreferenceDto['source'];
      confidence: CustomerPreferenceDto['confidence'];
      evidence_reference: string | null;
      updated_at: Date;
      version: string;
    }>`
      insert into customers.customer_preferences(organization_id,customer_id,preference_key,value,source,confidence,evidence_reference,recorded_by_actor_id)
      values(${input.organizationId},${input.customerId},${key},${JSON.stringify(input.value)}::jsonb,${input.source},${input.confidence},${input.evidenceReference ?? null},${input.actorId})
      on conflict(organization_id,customer_id,preference_key) do update set value=excluded.value,source=excluded.source,
        confidence=excluded.confidence,evidence_reference=excluded.evidence_reference,recorded_by_actor_id=excluded.recorded_by_actor_id,
        updated_at=now(),version=customers.customer_preferences.version+1
      returning id,preference_key,value,source,confidence,evidence_reference,updated_at,version::text`.execute(
      tx,
    );
    const row = result.rows[0]!;
    await appendAuditEvent(tx, {
      organizationId: input.organizationId,
      actorType: 'USER',
      actorId: input.actorId,
      action: 'customers.preference.updated',
      targetType: 'customers.customer',
      targetId: input.customerId,
      metadata: { preferenceKey: key, source: input.source, confidence: input.confidence },
    });
    return {
      id: row.id,
      key: row.preference_key,
      value: row.value,
      source: row.source,
      confidence: row.confidence,
      evidenceReference: row.evidence_reference,
      updatedAt: row.updated_at.toISOString(),
      version: Number(row.version),
    };
  });
}

export async function transitionCustomerLifecycle(
  db: Db,
  input: {
    organizationId: string;
    actorId: string;
    customerId: string;
    expectedVersion: number;
    stage: CustomerLifecycleStageDto;
    reason: string;
    source?: 'MANUAL_OVERRIDE' | 'AUTOMATIC' | 'RECALCULATION';
  },
): Promise<{ stage: CustomerLifecycleStageDto; version: number }> {
  const reason = input.reason.trim();
  if (!reason)
    throw new CustomerDomainError(
      'VALIDATION_FAILED',
      'A lifecycle transition reason is required.',
    );
  return db.transaction().execute(async (tx) => {
    const result = await sql<{
      lifecycle_stage: CustomerLifecycleStageDto;
      status: string;
      version: string;
    }>`
      select lifecycle_stage,status,version::text from customers.customers
      where organization_id=${input.organizationId} and id=${input.customerId} for update`.execute(
      tx,
    );
    const current = result.rows[0];
    if (!current) throw new CustomerDomainError('NOT_FOUND', 'Customer was not found.');
    if (Number(current.version) !== input.expectedVersion)
      throw new CustomerDomainError(
        'STALE_VERSION',
        'Customer has changed; reload before updating lifecycle.',
      );
    if (!lifecycleTransitions[current.lifecycle_stage].includes(input.stage))
      throw new CustomerDomainError(
        'VALIDATION_FAILED',
        `Lifecycle cannot move from ${current.lifecycle_stage} to ${input.stage}.`,
      );
    const updated = await sql<{
      version: string;
    }>`update customers.customers set lifecycle_stage=${input.stage},last_activity_at=now(),version=version+1,updated_at=now()
      where organization_id=${input.organizationId} and id=${input.customerId} returning version::text`.execute(
      tx,
    );
    await sql`insert into customers.customer_lifecycle_history(organization_id,customer_id,previous_stage,new_stage,transition_source,reason,actor_id)
      values(${input.organizationId},${input.customerId},${current.lifecycle_stage},${input.stage},${input.source ?? 'MANUAL_OVERRIDE'},${reason},${input.actorId})`.execute(
      tx,
    );
    await appendAuditEvent(tx, {
      organizationId: input.organizationId,
      actorType: 'USER',
      actorId: input.actorId,
      action: 'customers.lifecycle.transitioned',
      targetType: 'customers.customer',
      targetId: input.customerId,
      reason,
      beforeDiff: { stage: current.lifecycle_stage },
      afterDiff: { stage: input.stage },
    });
    await emitCrmEvent(tx, {
      organizationId: input.organizationId,
      customerId: input.customerId,
      eventType: 'customers.crm.lifecycle_changed',
      payload: { previousStage: current.lifecycle_stage, stage: input.stage },
    });
    return { stage: input.stage, version: Number(updated.rows[0]!.version) };
  });
}

export async function assignCustomerRelationship(
  db: Db,
  input: {
    organizationId: string;
    actorId: string;
    customerId: string;
    expectedVersion: number;
    ownerMembershipId: string | null;
    relationshipStatus: CustomerRelationshipStatusDto;
    reason: string;
  },
): Promise<{ version: number }> {
  const reason = input.reason.trim();
  if (!reason)
    throw new CustomerDomainError('VALIDATION_FAILED', 'An ownership-change reason is required.');
  return db.transaction().execute(async (tx) => {
    const currentResult = await sql<{
      relationship_owner_membership_id: string | null;
      relationship_status: string;
      status: string;
      version: string;
    }>`
      select relationship_owner_membership_id,relationship_status,status,version::text from customers.customers
      where organization_id=${input.organizationId} and id=${input.customerId} for update`.execute(
      tx,
    );
    const current = currentResult.rows[0];
    if (!current) throw new CustomerDomainError('NOT_FOUND', 'Customer was not found.');
    if (Number(current.version) !== input.expectedVersion)
      throw new CustomerDomainError(
        'STALE_VERSION',
        'Customer has changed; reload before assigning.',
      );
    if (input.ownerMembershipId) {
      const member = await sql<{
        id: string;
      }>`select id from iam.organization_memberships where organization_id=${input.organizationId} and id=${input.ownerMembershipId} and status='ACTIVE'`.execute(
        tx,
      );
      if (!member.rows[0])
        throw new CustomerDomainError(
          'VALIDATION_FAILED',
          'Relationship owner must be an active organization member.',
        );
    }
    const updated = await sql<{
      version: string;
    }>`update customers.customers set relationship_owner_membership_id=${input.ownerMembershipId},
      relationship_status=${input.relationshipStatus},last_activity_at=now(),updated_at=now(),version=version+1
      where organization_id=${input.organizationId} and id=${input.customerId} returning version::text`.execute(
      tx,
    );
    await sql`insert into customers.customer_ownership_history(organization_id,customer_id,previous_owner_membership_id,new_owner_membership_id,
      previous_relationship_status,new_relationship_status,reason,changed_by_actor_id)
      values(${input.organizationId},${input.customerId},${current.relationship_owner_membership_id},${input.ownerMembershipId},${current.relationship_status},${input.relationshipStatus},${reason},${input.actorId})`.execute(
      tx,
    );
    await appendAuditEvent(tx, {
      organizationId: input.organizationId,
      actorType: 'USER',
      actorId: input.actorId,
      action: 'customers.relationship.assigned',
      targetType: 'customers.customer',
      targetId: input.customerId,
      reason,
      beforeDiff: {
        ownerMembershipId: current.relationship_owner_membership_id,
        status: current.relationship_status,
      },
      afterDiff: { ownerMembershipId: input.ownerMembershipId, status: input.relationshipStatus },
    });
    await emitCrmEvent(tx, {
      organizationId: input.organizationId,
      customerId: input.customerId,
      eventType: 'customers.crm.relationship_changed',
      payload: { relationshipStatus: input.relationshipStatus },
    });
    return { version: Number(updated.rows[0]!.version) };
  });
}

export async function createCustomerFollowUp(
  db: Db,
  input: {
    organizationId: string;
    actorId: string;
    customerId: string;
    assignedMembershipId: string;
    title: string;
    details?: string;
    dueAt: string;
  },
): Promise<CustomerFollowUpDto> {
  if (!input.title.trim())
    throw new CustomerDomainError('VALIDATION_FAILED', 'Follow-up title is required.');
  const dueAt = new Date(input.dueAt);
  if (Number.isNaN(dueAt.valueOf()))
    throw new CustomerDomainError('VALIDATION_FAILED', 'Follow-up due date is invalid.');
  return db.transaction().execute(async (tx) => {
    await ensureMutableCustomer(tx, input.organizationId, input.customerId);
    const member = await sql<{
      name: string | null;
    }>`select u.name from iam.organization_memberships m join iam.users u on u.id=m.user_id
      where m.organization_id=${input.organizationId} and m.id=${input.assignedMembershipId} and m.status='ACTIVE'`.execute(
      tx,
    );
    if (!member.rows[0])
      throw new CustomerDomainError('VALIDATION_FAILED', 'Follow-up assignee must be active.');
    const result = await sql<{
      id: string;
      customer_id: string;
      assigned_membership_id: string;
      title: string;
      details: string | null;
      due_at: Date;
      status: CustomerFollowUpDto['status'];
      completed_at: Date | null;
      version: string;
    }>`
      insert into customers.customer_follow_ups(organization_id,customer_id,assigned_membership_id,title,details,due_at,created_by_actor_id)
      values(${input.organizationId},${input.customerId},${input.assignedMembershipId},${input.title.trim()},${input.details?.trim() || null},${dueAt},${input.actorId})
      returning id,customer_id,assigned_membership_id,title,details,due_at,status,completed_at,version::text`.execute(
      tx,
    );
    await appendAuditEvent(tx, {
      organizationId: input.organizationId,
      actorType: 'USER',
      actorId: input.actorId,
      action: 'customers.follow_up.created',
      targetType: 'customers.customer',
      targetId: input.customerId,
      metadata: {
        followUpId: result.rows[0]!.id,
        assignedMembershipId: input.assignedMembershipId,
        dueAt: input.dueAt,
      },
    });
    await emitCrmEvent(tx, {
      organizationId: input.organizationId,
      customerId: input.customerId,
      eventType: 'customers.crm.follow_up_created',
      payload: { followUpId: result.rows[0]!.id },
    });
    return toFollowUp({ ...result.rows[0]!, assignee_name: member.rows[0].name });
  });
}

export async function completeCustomerFollowUp(
  db: Db,
  input: {
    organizationId: string;
    actorId: string;
    customerId: string;
    followUpId: string;
    expectedVersion: number;
  },
): Promise<void> {
  await db.transaction().execute(async (transaction) => {
    const result =
      await sql`update customers.customer_follow_ups set status='COMPLETED',completed_at=now(),completed_by_actor_id=${input.actorId},
      updated_at=now(),version=version+1 where organization_id=${input.organizationId} and customer_id=${input.customerId} and id=${input.followUpId}
      and status='OPEN' and version=${input.expectedVersion}`.execute(transaction);
    if (Number(result.numAffectedRows) !== 1)
      throw new CustomerDomainError('STALE_VERSION', 'Follow-up is no longer open or has changed.');
    await appendAuditEvent(transaction, {
      organizationId: input.organizationId,
      actorType: 'USER',
      actorId: input.actorId,
      action: 'customers.follow_up.completed',
      targetType: 'customers.customer',
      targetId: input.customerId,
      metadata: { followUpId: input.followUpId },
    });
    await emitCrmEvent(transaction, {
      organizationId: input.organizationId,
      customerId: input.customerId,
      eventType: 'customers.crm.follow_up_completed',
      payload: { followUpId: input.followUpId },
    });
  });
}

export async function recordCustomerConsent(
  db: Db,
  input: {
    organizationId: string;
    actorId: string;
    customerId: string;
    purpose: string;
    channel: CustomerConsentDto['channel'];
    status: CustomerConsentDto['status'];
    lawfulBasis?: string;
    source: string;
    evidenceReference?: string;
    effectiveAt?: string;
  },
): Promise<CustomerConsentDto> {
  if (!input.purpose.trim() || !input.source.trim())
    throw new CustomerDomainError('VALIDATION_FAILED', 'Consent purpose and source are required.');
  const result = await sql<{
    id: string;
    effective_at: Date;
  }>`insert into customers.customer_consents(organization_id,customer_id,purpose,channel,status,lawful_basis,source,evidence_reference,recorded_by_actor_id,effective_at)
    select ${input.organizationId},c.id,${input.purpose.trim()},${input.channel},${input.status},${input.lawfulBasis ?? null},${input.source.trim()},${input.evidenceReference ?? null},${input.actorId},${input.effectiveAt ? new Date(input.effectiveAt) : new Date()}
    from customers.customers c where c.organization_id=${input.organizationId} and c.id=${input.customerId} and c.status not in ('MERGED','ANONYMIZED') returning id,effective_at`.execute(
    db,
  );
  if (!result.rows[0])
    throw new CustomerDomainError(
      'NOT_FOUND',
      'Customer was not found or cannot accept consent updates.',
    );
  await appendAuditEvent(db, {
    organizationId: input.organizationId,
    actorType: 'USER',
    actorId: input.actorId,
    action: 'customers.consent.recorded',
    targetType: 'customers.customer',
    targetId: input.customerId,
    metadata: { purpose: input.purpose, channel: input.channel, status: input.status },
  });
  return {
    id: result.rows[0].id,
    purpose: input.purpose.trim(),
    channel: input.channel,
    status: input.status,
    lawfulBasis: input.lawfulBasis ?? null,
    source: input.source.trim(),
    evidenceReference: input.evidenceReference ?? null,
    effectiveAt: result.rows[0].effective_at.toISOString(),
  };
}

/** Recalculate lifecycle only from authoritative completed-order history. */
export async function recalculateCustomerLifecycleInTransaction(
  db: Db,
  input: {
    organizationId: string;
    customerId: string;
    actorId?: string;
  },
): Promise<CustomerLifecycleStageDto> {
  await sql`select id from customers.customers where organization_id=${input.organizationId} and id=${input.customerId} for update`.execute(
    db,
  );
  const result = await sql<{
    lifecycle_stage: CustomerLifecycleStageDto;
    completed_orders: number;
    first_purchase_at: Date | null;
    last_purchase_at: Date | null;
    loyal_threshold: number;
    inactive_days: number;
  }>`select c.lifecycle_stage,
      count(o.id) filter(where o.order_status='COMPLETED')::int completed_orders,
      min(o.completed_at) filter(where o.order_status='COMPLETED') first_purchase_at,
      max(o.completed_at) filter(where o.order_status='COMPLETED') last_purchase_at,
      coalesce(r.loyal_completed_order_threshold,5)::int loyal_threshold,
      coalesce(r.inactive_after_days,180)::int inactive_days
    from customers.customers c
    left join customers.customer_lifecycle_rules r on r.organization_id=c.organization_id
    left join orders.orders o on o.organization_id=c.organization_id and (o.customer_id=c.id or o.customer_id in(
      select a.alias_customer_id from customers.customer_aliases a where a.organization_id=c.organization_id and a.canonical_customer_id=c.id))
    where c.organization_id=${input.organizationId} and c.id=${input.customerId}
    group by c.id,r.loyal_completed_order_threshold,r.inactive_after_days`.execute(db);
  const row = result.rows[0];
  if (!row) throw new CustomerDomainError('NOT_FOUND', 'Customer was not found.');
  let next: CustomerLifecycleStageDto;
  if (row.completed_orders === 0)
    next = row.lifecycle_stage === 'NEW_CONTACT' ? 'NEW_CONTACT' : 'PROSPECT';
  else if (
    row.last_purchase_at &&
    Date.now() - row.last_purchase_at.valueOf() > row.inactive_days * 86_400_000
  )
    next = 'INACTIVE_CUSTOMER';
  else if (row.lifecycle_stage === 'INACTIVE_CUSTOMER') next = 'RE_ENGAGED_CUSTOMER';
  else if (row.completed_orders === 1) next = 'FIRST_TIME_BUYER';
  else if (row.completed_orders >= row.loyal_threshold) next = 'LOYAL_CUSTOMER';
  else next = 'REPEAT_CUSTOMER';
  await sql`update customers.customers set lifecycle_stage=${next},first_purchase_at=${row.first_purchase_at},last_purchase_at=${row.last_purchase_at},
    last_activity_at=greatest(coalesce(last_activity_at,'-infinity'::timestamptz),coalesce(${row.last_purchase_at},now())),updated_at=now(),
    version=case when lifecycle_stage<>${next} then version+1 else version end
    where organization_id=${input.organizationId} and id=${input.customerId}`.execute(db);
  if (next !== row.lifecycle_stage) {
    await sql`insert into customers.customer_lifecycle_history(organization_id,customer_id,previous_stage,new_stage,transition_source,reason,actor_id)
      values(${input.organizationId},${input.customerId},${row.lifecycle_stage},${next},'AUTOMATIC','Recalculated from authoritative completed-order history.',${input.actorId ?? null}::uuid)`.execute(
      db,
    );
    await appendAuditEvent(db, {
      organizationId: input.organizationId,
      actorType: input.actorId ? 'USER' : 'SYSTEM',
      ...(input.actorId ? { actorId: input.actorId } : {}),
      action: 'customers.lifecycle.recalculated',
      targetType: 'customers.customer',
      targetId: input.customerId,
      beforeDiff: { stage: row.lifecycle_stage },
      afterDiff: { stage: next, completedOrders: row.completed_orders },
    });
  }
  return next;
}
