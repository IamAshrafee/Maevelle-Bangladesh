import { sql, type Kysely } from 'kysely';
import type {
  CustomerIdentityAssuranceDto,
  CustomerIdentityEventDto,
  CustomerIdentityLinkDto,
  CustomerIdentityLinkStatusDto,
} from '@maevelle/contracts';

import type { DatabaseSchema } from '../index.js';
import { appendAuditEvent } from '../platform.js';
import { CustomerDomainError } from '../customers.js';

type Db = Kysely<DatabaseSchema>;
export type CustomerIdentityEvidenceMethod =
  | 'AUTHENTICATED_ACCOUNT'
  | 'VERIFIED_EMAIL'
  | 'VERIFIED_PHONE'
  | 'CHANNEL_ASSERTED'
  | 'STAFF_REVIEW'
  | 'CUSTOMER_REQUEST'
  | 'CUSTOMER_MERGE'
  | 'LEGACY_ASSOCIATION';

const maximumAssurance: Readonly<
  Record<CustomerIdentityEvidenceMethod, CustomerIdentityAssuranceDto>
> = {
  AUTHENTICATED_ACCOUNT: 'HIGH',
  VERIFIED_EMAIL: 'HIGH',
  VERIFIED_PHONE: 'HIGH',
  CHANNEL_ASSERTED: 'MEDIUM',
  CUSTOMER_REQUEST: 'MEDIUM',
  CUSTOMER_MERGE: 'HIGH',
  STAFF_REVIEW: 'LOW',
  LEGACY_ASSOCIATION: 'LOW',
};
const assuranceRank: Readonly<Record<CustomerIdentityAssuranceDto, number>> = {
  UNVERIFIED: 0,
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
};

function toLink(row: {
  id: string;
  customer_id: string;
  contact_id: string;
  contact_identity_id: string;
  provider: CustomerIdentityLinkDto['provider'];
  channel_connection_id: string;
  external_subject_id: string;
  display_name: string | null;
  username: string | null;
  status: CustomerIdentityLinkStatusDto;
  assurance: CustomerIdentityAssuranceDto;
  evidence_method: string;
  evidence_reference: string | null;
  evidence_summary: string;
  linked_at: Date | null;
  revoked_at: Date | null;
  revocation_reason: string | null;
  created_at: Date;
  updated_at: Date;
  version: string;
}): CustomerIdentityLinkDto {
  return {
    id: row.id,
    customerId: row.customer_id,
    contactId: row.contact_id,
    contactIdentityId: row.contact_identity_id,
    provider: row.provider,
    channelConnectionId: row.channel_connection_id,
    externalSubjectId: row.external_subject_id,
    displayName: row.display_name,
    username: row.username,
    status: row.status,
    assurance: row.assurance,
    evidenceMethod: row.evidence_method,
    evidenceReference: row.evidence_reference,
    evidenceSummary: row.evidence_summary,
    linkedAt: row.linked_at?.toISOString() ?? null,
    revokedAt: row.revoked_at?.toISOString() ?? null,
    revocationReason: row.revocation_reason,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    version: Number(row.version),
  };
}

const linkSelection = sql`select l.id,l.customer_id,l.contact_id,l.contact_identity_id,l.provider,l.channel_connection_id,
  l.external_subject_id,i.display_name,i.username,l.status,l.assurance,l.evidence_method,l.evidence_reference,
  l.evidence_summary,l.linked_at,l.revoked_at,l.revocation_reason,l.created_at,l.updated_at,l.version::text`;

export async function listCustomerIdentityLinks(
  db: Db,
  input: {
    organizationId: string;
    customerId?: string;
    status?: CustomerIdentityLinkStatusDto;
    limit?: number;
    offset?: number;
  },
): Promise<{ items: readonly CustomerIdentityLinkDto[]; totalItems: number }> {
  const limit = Math.min(100, Math.max(1, input.limit ?? 50));
  const offset = Math.max(0, input.offset ?? 0);
  const result = await sql<Parameters<typeof toLink>[0] & { total_count: string }>`
    ${linkSelection},count(*) over()::text total_count
    from customers.customer_identity_links l
    join messaging.contact_identities i on i.organization_id=l.organization_id and i.id=l.contact_identity_id
    where l.organization_id=${input.organizationId}
      and (${input.customerId ?? null}::uuid is null or l.customer_id=${input.customerId ?? null}::uuid)
      and (${input.status ?? null}::text is null or l.status=${input.status ?? null})
    order by case when l.status='LINKED' then 0 when l.status in ('CANDIDATE','DISPUTED') then 1 else 2 end,l.updated_at desc,l.id
    limit ${limit} offset ${offset}`.execute(db);
  return { items: result.rows.map(toLink), totalItems: Number(result.rows[0]?.total_count ?? 0) };
}

export async function listCustomerIdentityEvents(
  db: Db,
  organizationId: string,
  linkId: string,
): Promise<readonly CustomerIdentityEventDto[]> {
  const result = await sql<{
    id: string;
    action: string;
    previous_status: string | null;
    new_status: string;
    assurance: CustomerIdentityAssuranceDto;
    evidence_method: string;
    evidence_reference: string | null;
    reason: string;
    actor_type: string;
    actor_id: string | null;
    created_at: Date;
  }>`
    select id::text,action,previous_status,new_status,assurance,evidence_method,evidence_reference,reason,actor_type,actor_id::text,created_at
    from customers.customer_identity_link_events where organization_id=${organizationId} and identity_link_id=${linkId}
    order by created_at desc,id desc limit 200`.execute(db);
  return result.rows.map((row) => ({
    id: row.id,
    action: row.action,
    previousStatus: row.previous_status,
    newStatus: row.new_status,
    assurance: row.assurance,
    evidenceMethod: row.evidence_method,
    evidenceReference: row.evidence_reference,
    reason: row.reason,
    actorType: row.actor_type,
    actorId: row.actor_id,
    createdAt: row.created_at.toISOString(),
  }));
}

/** Idempotently imports pre-CRM messaging projections with explicitly low assurance. */
export async function reconcileLegacyMessagingCustomerLinks(
  db: Db,
  input: {
    organizationId: string;
    actorId: string;
  },
): Promise<{ created: number; alreadyReconciled: number; withoutIdentity: number }> {
  return db.transaction().execute(async (transaction) => {
    const totals = await sql<{ linked_contacts: number; without_identity: number }>`select
      count(*) filter(where contact.customer_id is not null)::int linked_contacts,
      count(*) filter(where contact.customer_id is not null and not exists(
        select 1 from messaging.contact_identities identity where identity.organization_id=contact.organization_id and identity.contact_id=contact.id
      ))::int without_identity
      from messaging.contacts contact where contact.organization_id=${input.organizationId}`.execute(
      transaction,
    );
    const inserted = await sql<{
      id: string;
      customer_id: string;
      contact_identity_id: string;
    }>`with candidates as (
        select contact.id contact_id,contact.customer_id,identity.id contact_identity_id,identity.channel_kind provider,
          identity.channel_connection_id,identity.external_subject_id
        from messaging.contacts contact
        join lateral (
          select candidate.id,candidate.channel_kind,candidate.channel_connection_id,candidate.external_subject_id
          from messaging.contact_identities candidate
          where candidate.organization_id=contact.organization_id and candidate.contact_id=contact.id
          order by candidate.last_seen_at desc,candidate.id limit 1
        ) identity on true
        join customers.customers customer on customer.organization_id=contact.organization_id and customer.id=contact.customer_id
        where contact.organization_id=${input.organizationId} and contact.customer_id is not null
          and customer.status not in ('MERGED','ANONYMIZED')
          and not exists(select 1 from customers.customer_identity_links existing where existing.organization_id=contact.organization_id and existing.contact_id=contact.id and existing.status='LINKED')
      )
      insert into customers.customer_identity_links(organization_id,customer_id,contact_id,contact_identity_id,provider,
        channel_connection_id,external_subject_id,status,assurance,evidence_method,evidence_summary,linked_by_actor_id,linked_at)
      select ${input.organizationId},customer_id,contact_id,contact_identity_id,provider,channel_connection_id,external_subject_id,
        'LINKED','LOW','LEGACY_ASSOCIATION','Imported from the pre-CRM messaging customer projection.',${input.actorId},now()
      from candidates on conflict do nothing returning id,customer_id,contact_identity_id`.execute(
      transaction,
    );
    if (inserted.rows.length) {
      await sql`insert into customers.customer_identity_link_events(organization_id,identity_link_id,customer_id,contact_identity_id,
        action,previous_status,new_status,assurance,evidence_method,reason,actor_type,actor_id)
        select ${input.organizationId},created.id,created.customer_id,created.contact_identity_id,'LINKED',null,'LINKED','LOW',
          'LEGACY_ASSOCIATION','Idempotent historical messaging association reconciliation.','USER',${input.actorId}
        from customers.customer_identity_links created
        where created.organization_id=${input.organizationId} and created.id=any(${inserted.rows.map((row) => row.id)}::uuid[])
          and not exists(select 1 from customers.customer_identity_link_events event where event.organization_id=created.organization_id and event.identity_link_id=created.id)`.execute(
        transaction,
      );
    }
    const linkedContacts = totals.rows[0]?.linked_contacts ?? 0;
    const withoutIdentity = totals.rows[0]?.without_identity ?? 0;
    await appendAuditEvent(transaction, {
      organizationId: input.organizationId,
      actorType: 'USER',
      actorId: input.actorId,
      action: 'customers.identity.legacy_reconciled',
      targetType: 'customers.identity_reconciliation',
      metadata: { created: inserted.rows.length, linkedContacts, withoutIdentity },
    });
    return {
      created: inserted.rows.length,
      alreadyReconciled: Math.max(0, linkedContacts - withoutIdentity - inserted.rows.length),
      withoutIdentity,
    };
  });
}

export async function createOrResolveCustomerIdentityLink(
  db: Db,
  input: {
    organizationId: string;
    actorId: string;
    customerId: string;
    contactIdentityId: string;
    targetStatus: 'CANDIDATE' | 'LINKED' | 'REJECTED';
    assurance: CustomerIdentityAssuranceDto;
    evidenceMethod: CustomerIdentityEvidenceMethod;
    evidenceReference?: string;
    evidenceSummary: string;
    reason: string;
  },
): Promise<CustomerIdentityLinkDto> {
  const evidenceSummary = input.evidenceSummary.trim();
  const reason = input.reason.trim();
  if (!evidenceSummary || !reason)
    throw new CustomerDomainError(
      'VALIDATION_FAILED',
      'Identity evidence and reason are required.',
    );
  if (assuranceRank[input.assurance] > assuranceRank[maximumAssurance[input.evidenceMethod]])
    throw new CustomerDomainError(
      'VALIDATION_FAILED',
      `${input.evidenceMethod} cannot establish ${input.assurance} assurance.`,
    );
  if (input.targetStatus === 'LINKED' && input.assurance === 'UNVERIFIED')
    throw new CustomerDomainError(
      'VALIDATION_FAILED',
      'An unverified candidate cannot become an active customer link.',
    );

  return db.transaction().execute(async (tx) => {
    const identityResult = await sql<{
      contact_identity_id: string;
      contact_id: string;
      channel_kind: CustomerIdentityLinkDto['provider'];
      channel_connection_id: string;
      external_subject_id: string;
      display_name: string | null;
      username: string | null;
      customer_status: string;
    }>`
      select i.id contact_identity_id,i.contact_id,i.channel_kind,i.channel_connection_id,i.external_subject_id,i.display_name,i.username,c.status customer_status
      from messaging.contact_identities i
      join customers.customers c on c.organization_id=i.organization_id and c.id=${input.customerId}
      where i.organization_id=${input.organizationId} and i.id=${input.contactIdentityId}
      for update of i,c`.execute(tx);
    const identity = identityResult.rows[0];
    if (!identity)
      throw new CustomerDomainError('NOT_FOUND', 'Customer or channel identity was not found.');
    if (identity.customer_status === 'MERGED' || identity.customer_status === 'ANONYMIZED')
      throw new CustomerDomainError(
        'VALIDATION_FAILED',
        'Identity cannot be linked to this customer status.',
      );
    if (input.targetStatus === 'LINKED' && input.evidenceMethod === 'VERIFIED_PHONE') {
      const verified = await sql<{ id: string }>`select id from customers.customer_phones
        where organization_id=${input.organizationId} and customer_id=${input.customerId}
          and id=${input.evidenceReference ?? null}::uuid and verification_status='VERIFIED'`.execute(
        tx,
      );
      if (!verified.rows[0])
        throw new CustomerDomainError(
          'VALIDATION_FAILED',
          'Verified-phone evidence must reference a verified phone on this customer.',
        );
    }
    if (input.targetStatus === 'LINKED' && input.evidenceMethod === 'VERIFIED_EMAIL') {
      const verified = await sql<{ id: string }>`select id from customers.customer_emails
        where organization_id=${input.organizationId} and customer_id=${input.customerId}
          and id=${input.evidenceReference ?? null}::uuid and verification_status='VERIFIED'`.execute(
        tx,
      );
      if (!verified.rows[0])
        throw new CustomerDomainError(
          'VALIDATION_FAILED',
          'Verified-email evidence must reference a verified email on this customer.',
        );
    }
    if (input.targetStatus === 'LINKED' && input.evidenceMethod === 'AUTHENTICATED_ACCOUNT') {
      const verified = await sql<{ id: string }>`select id from customers.customer_accounts
        where organization_id=${input.organizationId} and customer_id=${input.customerId}
          and id=${input.evidenceReference ?? null}::uuid and status='ACTIVE'`.execute(tx);
      if (!verified.rows[0])
        throw new CustomerDomainError(
          'VALIDATION_FAILED',
          'Authenticated-account evidence must reference an active customer account link.',
        );
    }

    const active = await sql<{
      id: string;
      customer_id: string;
    }>`select id,customer_id from customers.customer_identity_links
      where organization_id=${input.organizationId} and (contact_identity_id=${input.contactIdentityId} or contact_id=${identity.contact_id}) and status='LINKED'
      for update`.execute(tx);
    if (
      input.targetStatus === 'LINKED' &&
      active.rows.some((row) => row.customer_id !== input.customerId)
    )
      throw new CustomerDomainError(
        'CONFLICT',
        'This scoped channel identity is already linked to another customer. Resolve the conflict before linking.',
      );

    const existing = await sql<{
      id: string;
      status: CustomerIdentityLinkStatusDto;
    }>`select id,status from customers.customer_identity_links
      where organization_id=${input.organizationId} and customer_id=${input.customerId} and contact_identity_id=${input.contactIdentityId}
      order by updated_at desc,id limit 1 for update`.execute(tx);
    const previous = existing.rows[0]?.status ?? null;
    const result = existing.rows[0]
      ? await sql<
          Parameters<typeof toLink>[0]
        >`update customers.customer_identity_links set status=${input.targetStatus},assurance=${input.assurance},
          evidence_method=${input.evidenceMethod},evidence_reference=${input.evidenceReference ?? null},evidence_summary=${evidenceSummary},
          linked_by_actor_id=case when ${input.targetStatus}='LINKED' then ${input.actorId}::uuid else linked_by_actor_id end,
          linked_at=case when ${input.targetStatus}='LINKED' then now() else null end,
          rejected_at=case when ${input.targetStatus}='REJECTED' then now() else null end,
          revoked_at=null,revocation_reason=null,updated_at=now(),version=version+1
          where organization_id=${input.organizationId} and id=${existing.rows[0].id}
          returning id,customer_id,contact_id,contact_identity_id,provider,channel_connection_id,external_subject_id,
            ${identity.display_name}::text display_name,${identity.username}::text username,status,assurance,evidence_method,evidence_reference,
            evidence_summary,linked_at,revoked_at,revocation_reason,created_at,updated_at,version::text`.execute(
          tx,
        )
      : await sql<
          Parameters<typeof toLink>[0]
        >`insert into customers.customer_identity_links(organization_id,customer_id,contact_id,contact_identity_id,
          provider,channel_connection_id,external_subject_id,status,assurance,evidence_method,evidence_reference,evidence_summary,linked_by_actor_id,linked_at,rejected_at)
          values(${input.organizationId},${input.customerId},${identity.contact_id},${input.contactIdentityId},${identity.channel_kind},${identity.channel_connection_id},
            ${identity.external_subject_id},${input.targetStatus},${input.assurance},${input.evidenceMethod},${input.evidenceReference ?? null},${evidenceSummary},
            ${input.targetStatus === 'LINKED' ? input.actorId : null}::uuid,case when ${input.targetStatus}='LINKED' then now() end,case when ${input.targetStatus}='REJECTED' then now() end)
          returning id,customer_id,contact_id,contact_identity_id,provider,channel_connection_id,external_subject_id,
            ${identity.display_name}::text display_name,${identity.username}::text username,status,assurance,evidence_method,evidence_reference,
            evidence_summary,linked_at,revoked_at,revocation_reason,created_at,updated_at,version::text`.execute(
          tx,
        );
    const link = result.rows[0]!;
    const action =
      previous === null
        ? input.targetStatus === 'CANDIDATE'
          ? 'CANDIDATE_CREATED'
          : input.targetStatus
        : input.targetStatus;
    await sql`insert into customers.customer_identity_link_events(organization_id,identity_link_id,customer_id,contact_identity_id,action,
      previous_status,new_status,assurance,evidence_method,evidence_reference,reason,actor_type,actor_id)
      values(${input.organizationId},${link.id},${input.customerId},${input.contactIdentityId},${action},${previous},${input.targetStatus},${input.assurance},
        ${input.evidenceMethod},${input.evidenceReference ?? null},${reason},'USER',${input.actorId})`.execute(
      tx,
    );

    if (input.targetStatus === 'LINKED') {
      await sql`update messaging.contacts set customer_id=${input.customerId},link_status='LINKED',linked_at=now(),linked_by_actor_id=${input.actorId},
        updated_at=now(),version=version+1 where organization_id=${input.organizationId} and id=${identity.contact_id}`.execute(
        tx,
      );
      await sql`insert into messaging.contact_customer_link_events(organization_id,contact_id,customer_id,action,method,actor_type,actor_id,evidence_reference,reason)
        values(${input.organizationId},${identity.contact_id},${input.customerId},'LINKED',${['CHANNEL_ASSERTED', 'CUSTOMER_REQUEST', 'LEGACY_ASSOCIATION'].includes(input.evidenceMethod) ? 'STAFF_REVIEW' : input.evidenceMethod},'USER',${input.actorId},${input.evidenceReference ?? null},${reason})`.execute(
        tx,
      );
    }
    await appendAuditEvent(tx, {
      organizationId: input.organizationId,
      actorType: 'USER',
      actorId: input.actorId,
      action: `customers.identity.${input.targetStatus.toLowerCase()}`,
      targetType: 'customers.identity_link',
      targetId: link.id,
      reason,
      metadata: {
        customerId: input.customerId,
        contactIdentityId: input.contactIdentityId,
        assurance: input.assurance,
        evidenceMethod: input.evidenceMethod,
      },
    });
    await sql`insert into platform.outbox_events(organization_id,event_type,event_version,aggregate_type,aggregate_id,aggregate_version,payload,occurred_at)
      values(${input.organizationId},${input.targetStatus === 'LINKED' ? 'customers.identity.linked' : 'customers.identity.reviewed'},1,
        'customers.customer',${input.customerId},${Number(link.version)},
        ${JSON.stringify({ customerId: input.customerId, identityLinkId: link.id, status: input.targetStatus, assurance: input.assurance, provider: link.provider })}::jsonb,now())`.execute(
      tx,
    );
    return toLink(link);
  });
}

export async function revokeCustomerIdentityLink(
  db: Db,
  input: {
    organizationId: string;
    actorId: string;
    linkId: string;
    expectedVersion: number;
    reason: string;
  },
): Promise<CustomerIdentityLinkDto> {
  const reason = input.reason.trim();
  if (!reason)
    throw new CustomerDomainError('VALIDATION_FAILED', 'A revocation reason is required.');
  return db.transaction().execute(async (tx) => {
    const currentResult = await sql<{
      id: string;
      customer_id: string;
      contact_id: string;
      contact_identity_id: string;
      status: CustomerIdentityLinkStatusDto;
      assurance: CustomerIdentityAssuranceDto;
      evidence_method: string;
      evidence_reference: string | null;
      version: string;
      display_name: string | null;
      username: string | null;
      provider: CustomerIdentityLinkDto['provider'];
    }>`
      select l.id,l.customer_id,l.contact_id,l.contact_identity_id,l.status,l.assurance,l.evidence_method,l.evidence_reference,l.version::text,i.display_name,i.username,l.provider
      from customers.customer_identity_links l join messaging.contact_identities i on i.organization_id=l.organization_id and i.id=l.contact_identity_id
      where l.organization_id=${input.organizationId} and l.id=${input.linkId} for update of l`.execute(
      tx,
    );
    const current = currentResult.rows[0];
    if (!current) throw new CustomerDomainError('NOT_FOUND', 'Identity link was not found.');
    if (current.status !== 'LINKED')
      throw new CustomerDomainError('CONFLICT', 'Only an active identity link can be revoked.');
    if (Number(current.version) !== input.expectedVersion)
      throw new CustomerDomainError(
        'STALE_VERSION',
        'Identity link has changed; reload before revoking.',
      );
    const updated = await sql<
      Parameters<typeof toLink>[0]
    >`update customers.customer_identity_links set status='REVOKED',linked_at=null,
      revoked_at=now(),revocation_reason=${reason},updated_at=now(),version=version+1 where organization_id=${input.organizationId} and id=${input.linkId}
      returning id,customer_id,contact_id,contact_identity_id,provider,channel_connection_id,external_subject_id,
        ${current.display_name}::text display_name,${current.username}::text username,status,assurance,evidence_method,evidence_reference,
        evidence_summary,linked_at,revoked_at,revocation_reason,created_at,updated_at,version::text`.execute(
      tx,
    );
    await sql`update messaging.contacts set customer_id=null,link_status='UNLINKED_BY_POLICY',linked_at=null,linked_by_actor_id=null,
      updated_at=now(),version=version+1 where organization_id=${input.organizationId} and id=${current.contact_id} and customer_id=${current.customer_id}`.execute(
      tx,
    );
    await sql`insert into customers.customer_identity_link_events(organization_id,identity_link_id,customer_id,contact_identity_id,action,previous_status,
      new_status,assurance,evidence_method,evidence_reference,reason,actor_type,actor_id)
      values(${input.organizationId},${input.linkId},${current.customer_id},${current.contact_identity_id},'REVOKED','LINKED','REVOKED',${current.assurance},${current.evidence_method},${current.evidence_reference},${reason},'USER',${input.actorId})`.execute(
      tx,
    );
    await sql`insert into messaging.contact_customer_link_events(organization_id,contact_id,customer_id,action,method,actor_type,actor_id,reason)
      values(${input.organizationId},${current.contact_id},${current.customer_id},'UNLINKED','STAFF_REVIEW','USER',${input.actorId},${reason})`.execute(
      tx,
    );
    await appendAuditEvent(tx, {
      organizationId: input.organizationId,
      actorType: 'USER',
      actorId: input.actorId,
      action: 'customers.identity.revoked',
      targetType: 'customers.identity_link',
      targetId: input.linkId,
      reason,
      metadata: { customerId: current.customer_id, contactIdentityId: current.contact_identity_id },
    });
    await sql`insert into platform.outbox_events(organization_id,event_type,event_version,aggregate_type,aggregate_id,aggregate_version,payload,occurred_at)
      values(${input.organizationId},'customers.identity.revoked',1,'customers.customer',${current.customer_id},${Number(updated.rows[0]!.version)},
        ${JSON.stringify({ customerId: current.customer_id, identityLinkId: input.linkId, provider: current.provider })}::jsonb,now())`.execute(
      tx,
    );
    return toLink(updated.rows[0]!);
  });
}
