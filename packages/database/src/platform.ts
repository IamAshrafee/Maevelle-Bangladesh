import { sql, type Kysely } from 'kysely';
import { hashToken } from '@maevelle/security';

import type { DatabaseSchema } from './index.js';

export type OperationalControlKey =
  | 'checkout_enabled'
  | 'review_submission_enabled'
  | 'customer_returns_enabled'
  | 'email_delivery_enabled'
  | 'webhook_delivery_enabled';

export async function setOperationalControl(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    key: OperationalControlKey;
    type: 'FEATURE_FLAG' | 'KILL_SWITCH';
    enabled: boolean;
    actorId?: string;
    reason?: string;
  },
): Promise<void> {
  await sql`insert into platform.operational_controls(organization_id,control_key,control_type,enabled,reason,updated_by) values(${input.organizationId},${input.key},${input.type},${input.enabled},${input.reason ?? null},${input.actorId ?? null}::uuid) on conflict(organization_id,control_key) do update set control_type=excluded.control_type,enabled=excluded.enabled,reason=excluded.reason,updated_by=excluded.updated_by,updated_at=now()`.execute(
    db,
  );
}

export async function isOperationalControlEnabled(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  key: OperationalControlKey,
): Promise<boolean> {
  const result = await sql<{
    enabled: boolean;
  }>`select enabled from platform.operational_controls where organization_id=${organizationId} and control_key=${key}`.execute(
    db,
  );
  return result.rows[0]?.enabled ?? true;
}

export async function isCheckoutEnabledForToken(
  db: Kysely<DatabaseSchema>,
  checkoutToken: string,
): Promise<boolean> {
  const result = await sql<{
    enabled: boolean;
  }>`select coalesce(control.enabled,true) enabled from orders.checkout_sessions checkout left join platform.operational_controls control on control.organization_id=checkout.organization_id and control.control_key='checkout_enabled' where checkout.public_token_hash=${hashToken(checkoutToken)} limit 1`.execute(
    db,
  );
  return result.rows[0]?.enabled ?? false;
}

export interface CreateOrganizationInput {
  readonly code: string;
  readonly displayName: string;
  readonly legalName?: string;
  readonly timezone: string;
  readonly defaultLocale: string;
  readonly defaultCurrency: string;
}

export async function createOrganization(
  db: Kysely<DatabaseSchema>,
  input: CreateOrganizationInput,
): Promise<{ id: string }> {
  const result = await sql<{ id: string }>`
    insert into platform.organizations (code, display_name, legal_name, timezone, default_locale, default_currency, status)
    values (${input.code}, ${input.displayName}, ${input.legalName ?? null}, ${input.timezone}, ${input.defaultLocale}, ${input.defaultCurrency}, 'ACTIVE')
    returning id
  `.execute(db);
  const id = result.rows[0]?.id;
  if (!id) throw new Error('Organization creation did not return an id.');
  return { id };
}

export async function findOrganizationByCode(
  db: Kysely<DatabaseSchema>,
  code: string,
): Promise<{ id: string } | undefined> {
  const result = await sql<{ id: string }>`
    select id from platform.organizations where code = ${code} limit 1
  `.execute(db);
  return result.rows[0];
}

export async function findUserIdByEmail(
  db: Kysely<DatabaseSchema>,
  email: string,
): Promise<string | undefined> {
  const result = await sql<{ id: string }>`
    select id from iam.users where lower(email) = lower(${email}) limit 1
  `.execute(db);
  return result.rows[0]?.id;
}

export async function findActiveOwnerUserId(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
): Promise<string | undefined> {
  const result = await sql<{ user_id: string }>`
    select user_id from iam.organization_memberships
    where organization_id = ${organizationId} and membership_type = 'OWNER' and status = 'ACTIVE'
    limit 1
  `.execute(db);
  return result.rows[0]?.user_id;
}

export interface AuditEventInput {
  readonly organizationId?: string;
  readonly actorType: string;
  readonly actorId?: string;
  readonly membershipId?: string;
  readonly action: string;
  readonly targetType?: string;
  readonly targetId?: string;
  readonly requestId?: string;
  readonly reason?: string;
  readonly beforeDiff?: unknown;
  readonly afterDiff?: unknown;
  readonly metadata?: unknown;
}

const sensitiveAuditKey =
  /(?:password|authorization|cookie|session[ _-]?token|api[ _-]?key|secret|backup[ _-]?code)/i;

/**
 * Audit events are historical evidence, not a second secret store. Preserve
 * useful structure while redacting values whose keys identify credentials.
 */
function sanitizeAuditValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeAuditValue);
  if (!value || typeof value !== 'object') return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, nestedValue]) => [
      key,
      sensitiveAuditKey.test(key) ? '[REDACTED]' : sanitizeAuditValue(nestedValue),
    ]),
  );
}

/** Append-only writer; the database role has no ordinary UPDATE/DELETE grant. */
export async function appendAuditEvent(
  db: Kysely<DatabaseSchema>,
  event: AuditEventInput,
): Promise<void> {
  await sql`
    insert into audit.audit_events (
      organization_id, actor_type, actor_id, membership_id, action, target_type, target_id, request_id, reason, before_diff, after_diff, metadata
    ) values (
      ${event.organizationId ?? null}, ${event.actorType}, ${event.actorId ?? null}, ${event.membershipId ?? null}, ${event.action},
      ${event.targetType ?? null}, ${event.targetId ?? null}, ${event.requestId ?? null}, ${event.reason ?? null},
      ${JSON.stringify(sanitizeAuditValue(event.beforeDiff ?? null))}::jsonb,
      ${JSON.stringify(sanitizeAuditValue(event.afterDiff ?? null))}::jsonb,
      ${JSON.stringify(sanitizeAuditValue(event.metadata ?? null))}::jsonb
    )
  `.execute(db);
}

export interface EnqueueJobInput {
  readonly queueName: 'critical' | 'default' | 'media' | 'analytics';
  readonly jobType: string;
  readonly payload: unknown;
  readonly payloadVersion?: number;
  readonly organizationId?: string;
  readonly priority?: number;
  readonly initiatorType?: string;
  readonly initiatorId?: string;
  readonly authorizationMode?: 'SYSTEM' | 'REVALIDATE_INITIATOR';
  readonly availableAt?: Date;
  readonly maxAttempts?: number;
}

export async function enqueueJob(
  db: Kysely<DatabaseSchema>,
  job: EnqueueJobInput,
): Promise<string> {
  const result = await sql<{ id: string }>`
    insert into platform.jobs (
      organization_id, queue_name, job_type, payload_version, payload, priority, status, initiator_type, initiator_id, authorization_mode, available_at, max_attempts
    ) values (
      ${job.organizationId ?? null}, ${job.queueName}, ${job.jobType}, ${job.payloadVersion ?? 1}, ${JSON.stringify(job.payload)}::jsonb,
      ${job.priority ?? 0}, 'PENDING', ${job.initiatorType ?? 'SYSTEM'}, ${job.initiatorId ?? null}, ${job.authorizationMode ?? 'SYSTEM'},
      ${job.availableAt ?? new Date()}, ${job.maxAttempts ?? 5}
    ) returning id
  `.execute(db);
  const id = result.rows[0]?.id;
  if (!id) throw new Error('Job enqueue did not return an id.');
  return id;
}

export interface ClaimedJob {
  readonly id: string;
  readonly queueName: string;
  readonly jobType: string;
  readonly payload: unknown;
  readonly attemptCount: number;
  readonly maxAttempts: number;
  readonly leaseExpiresAt: Date;
}

/** Claims one eligible job using row locks; concurrent workers cannot claim it twice. */
export async function claimNextJob(
  db: Kysely<DatabaseSchema>,
  queueName: EnqueueJobInput['queueName'],
  workerId: string,
  leaseSeconds = 60,
): Promise<ClaimedJob | undefined> {
  const result = await sql<{
    id: string;
    queue_name: string;
    job_type: string;
    payload: unknown;
    attempt_count: number;
    max_attempts: number;
    lease_expires_at: Date;
  }>`
    with candidate as (
      select id from platform.jobs
      where queue_name = ${queueName}
        and available_at <= now()
        and status in ('PENDING', 'RETRY_WAIT')
      order by priority desc, available_at, id
      for update skip locked
      limit 1
    )
    update platform.jobs job
    set status = 'RUNNING', lease_owner = ${workerId}, lease_expires_at = now() + (${leaseSeconds} * interval '1 second'),
        attempt_count = attempt_count + 1, started_at = coalesce(started_at, now())
    from candidate
    where job.id = candidate.id
    returning job.id, job.queue_name, job.job_type, job.payload, job.attempt_count, job.max_attempts, job.lease_expires_at
  `.execute(db);
  const row = result.rows[0];
  return row
    ? {
        id: row.id,
        queueName: row.queue_name,
        jobType: row.job_type,
        payload: row.payload,
        attemptCount: row.attempt_count,
        maxAttempts: row.max_attempts,
        leaseExpiresAt: row.lease_expires_at,
      }
    : undefined;
}

export async function reclaimExpiredJobs(db: Kysely<DatabaseSchema>): Promise<number> {
  const result = await sql<{ count: string }>`
    with reclaimed as (
      update platform.jobs
      set status = case when attempt_count >= max_attempts then 'DEAD_LETTER' else 'RETRY_WAIT' end,
          lease_owner = null, lease_expires_at = null,
          available_at = now(),
          last_error_code = 'LEASE_EXPIRED'
      where status = 'RUNNING' and lease_expires_at < now()
      returning id
    ) select count(*)::text as count from reclaimed
  `.execute(db);
  return Number(result.rows[0]?.count ?? 0);
}

export async function getAuthStorageValue(
  db: Kysely<DatabaseSchema>,
  keyHash: string,
): Promise<Buffer | undefined> {
  const result = await sql<{ encrypted_value: Buffer }>`
    select encrypted_value from iam.auth_kv_store
    where key_hash = ${keyHash} and (expires_at is null or expires_at > now())
  `.execute(db);
  return result.rows[0]?.encrypted_value;
}

export async function consumeAuthStorageValue(
  db: Kysely<DatabaseSchema>,
  keyHash: string,
): Promise<Buffer | undefined> {
  const result = await sql<{ encrypted_value: Buffer }>`
    delete from iam.auth_kv_store
    where key_hash = ${keyHash} and (expires_at is null or expires_at > now())
    returning encrypted_value
  `.execute(db);
  return result.rows[0]?.encrypted_value;
}

export async function setAuthStorageValue(
  db: Kysely<DatabaseSchema>,
  keyHash: string,
  encryptedValue: Buffer,
  expiresAt: Date | null,
): Promise<void> {
  await sql`
    insert into iam.auth_kv_store (key_hash, encrypted_value, counter_value, expires_at, key_version)
    values (${keyHash}, ${encryptedValue}, null, ${expiresAt}, 1)
    on conflict (key_hash) do update set encrypted_value = excluded.encrypted_value, counter_value = null,
      expires_at = excluded.expires_at, key_version = excluded.key_version, updated_at = now()
  `.execute(db);
}

export async function deleteAuthStorageValue(
  db: Kysely<DatabaseSchema>,
  keyHash: string,
): Promise<void> {
  await sql`delete from iam.auth_kv_store where key_hash = ${keyHash}`.execute(db);
}

export async function incrementAuthStorageValue(
  db: Kysely<DatabaseSchema>,
  keyHash: string,
  ttlSeconds: number,
): Promise<number> {
  const result = await sql<{ counter_value: string }>`
    insert into iam.auth_kv_store (key_hash, encrypted_value, counter_value, expires_at, key_version)
    values (${keyHash}, null, 1, now() + (${ttlSeconds} * interval '1 second'), 1)
    on conflict (key_hash) do update set
      counter_value = case
        when iam.auth_kv_store.expires_at is not null and iam.auth_kv_store.expires_at <= now() then 1
        else iam.auth_kv_store.counter_value + 1
      end,
      expires_at = case
        when iam.auth_kv_store.expires_at is not null and iam.auth_kv_store.expires_at <= now()
          then now() + (${ttlSeconds} * interval '1 second')
        else iam.auth_kv_store.expires_at
      end,
      updated_at = now()
    returning counter_value::text
  `.execute(db);
  return Number(result.rows[0]?.counter_value ?? 1);
}

export interface AdminContextRecord {
  readonly organizationId: string;
  readonly membershipId: string;
  readonly capabilities: readonly string[];
}

export interface AdminContextRequest {
  readonly organizationId?: string;
  readonly requiredCapability?: string;
}

export async function findActiveAdminContext(
  db: Kysely<DatabaseSchema>,
  userId: string,
  request: AdminContextRequest = {},
): Promise<AdminContextRecord | undefined> {
  const membership = await sql<{ organization_id: string; membership_id: string }>`
    select organization_id, id as membership_id from iam.organization_memberships
    where user_id = ${userId}
      and status = 'ACTIVE'
      and (${request.organizationId ?? null}::uuid is null or organization_id = ${request.organizationId ?? null}::uuid)
    order by created_at asc limit 1
  `.execute(db);
  const active = membership.rows[0];
  if (!active) return undefined;
  const grants = await sql<{ capability_code: string }>`
    select capability_code from iam.membership_capability_grants
    where membership_id = ${active.membership_id}
    order by capability_code
  `.execute(db);
  if (
    request.requiredCapability &&
    !grants.rows.some((grant) => grant.capability_code === request.requiredCapability)
  ) {
    return undefined;
  }
  return {
    organizationId: active.organization_id,
    membershipId: active.membership_id,
    capabilities: grants.rows.map((grant) => grant.capability_code),
  };
}

export interface IdempotencyRecordInput {
  readonly organizationId: string;
  readonly principalType: string;
  readonly principalId?: string;
  readonly operationType: string;
  readonly idempotencyKey: string;
  readonly requestFingerprint: string;
}

export interface IdempotencyRecord {
  readonly id: string;
  readonly requestFingerprint: string;
  readonly status: 'IN_PROGRESS' | 'SUCCEEDED' | 'FAILED_FINAL';
  readonly created: boolean;
}

export class IdempotencyKeyReuseError extends Error {
  public constructor() {
    super('The idempotency key was already used for a different request.');
    this.name = 'IdempotencyKeyReuseError';
  }
}

/**
 * Claims the canonical database-backed record for a request identity. A
 * repeated equivalent request receives that record; a changed payload is a
 * conflict instead of an accidental replay.
 */
export async function claimIdempotencyRecord(
  db: Kysely<DatabaseSchema>,
  input: IdempotencyRecordInput,
): Promise<IdempotencyRecord> {
  const inserted = await sql<{
    id: string;
    request_fingerprint: string;
    status: IdempotencyRecord['status'];
  }>`
    insert into platform.idempotency_records (
      organization_id, principal_type, principal_id, operation_type, idempotency_key, request_fingerprint, status
    ) values (
      ${input.organizationId}, ${input.principalType}, ${input.principalId ?? null}, ${input.operationType},
      ${input.idempotencyKey}, ${input.requestFingerprint}, 'IN_PROGRESS'
    ) on conflict do nothing
    returning id, request_fingerprint, status
  `.execute(db);
  const created = inserted.rows[0];
  if (created)
    return {
      id: created.id,
      requestFingerprint: created.request_fingerprint,
      status: created.status,
      created: true,
    };

  const existing = await sql<{
    id: string;
    request_fingerprint: string;
    status: IdempotencyRecord['status'];
  }>`
    select id, request_fingerprint, status from platform.idempotency_records
    where organization_id = ${input.organizationId}
      and principal_type = ${input.principalType}
      and principal_id is not distinct from ${input.principalId ?? null}::uuid
      and operation_type = ${input.operationType}
      and idempotency_key = ${input.idempotencyKey}
  `.execute(db);
  const canonical = existing.rows[0];
  if (!canonical) throw new Error('Idempotency conflict did not resolve to a canonical record.');
  if (canonical.request_fingerprint !== input.requestFingerprint)
    throw new IdempotencyKeyReuseError();
  return {
    id: canonical.id,
    requestFingerprint: canonical.request_fingerprint,
    status: canonical.status,
    created: false,
  };
}

export async function createOwnerMembership(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  userId: string,
  displayName: string,
): Promise<void> {
  await sql`
    insert into iam.organization_memberships (organization_id, user_id, membership_type, status, display_name)
    values (${organizationId}, ${userId}, 'OWNER', 'ACTIVE', ${displayName})
  `.execute(db);
  await sql`
    insert into iam.membership_capability_grants (membership_id, capability_code)
    select membership.id, capability.capability_code
    from iam.organization_memberships membership
    join iam.capability_definitions capability on true
    where membership.organization_id = ${organizationId} and membership.user_id = ${userId}
    on conflict do nothing
  `.execute(db);
}
