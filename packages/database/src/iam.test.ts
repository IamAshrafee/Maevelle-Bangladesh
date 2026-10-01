import { afterAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';

import { decryptSecret, type EncryptionKey } from '@maevelle/security';

import { createDatabase } from './index.js';
import {
  acceptMembershipInvitation,
  changeMemberLifecycle,
  createMembershipInvitation,
  IamError,
  membershipCanAccessScope,
  replaceMemberPermissions,
  transferOwnership,
} from './iam.js';
import { createOrganization, createOwnerMembership, findActiveAdminContext } from './platform.js';
import { createLocation } from './warehouse.js';

const database = createDatabase({
  connectionString: process.env.TEST_DATABASE_URL!,
  maxConnections: 6,
});
const invitationKey: EncryptionKey = {
  id: 'test-invitation-key',
  value: Buffer.alloc(32, 7),
};

afterAll(async () => database.close());

async function createUser(label: string) {
  const email = `${label}-${crypto.randomUUID()}@example.test`.toLowerCase();
  return (
    await sql<{ id: string; email: string }>`
      insert into iam.users (name, email, email_normalized, email_verified)
      values (${label}, ${email}, ${email}, true)
      returning id::text, email
    `.execute(database.db)
  ).rows[0]!;
}

async function createFixture(label: string) {
  const organization = await createOrganization(database.db, {
    code: `iam-${label}-${crypto.randomUUID().slice(0, 8)}`,
    displayName: `IAM ${label}`,
    timezone: 'UTC',
    defaultLocale: 'en',
    defaultCurrency: 'USD',
  });
  const owner = await createUser(`${label}-owner`);
  await createOwnerMembership(database.db, organization.id, owner.id, `${label} Owner`);
  const ownerMembership = (
    await sql<{ id: string; version: string }>`
      select id::text, version::text from iam.organization_memberships
      where organization_id = ${organization.id}::uuid and user_id = ${owner.id}::uuid
    `.execute(database.db)
  ).rows[0]!;
  return {
    organizationId: organization.id,
    owner,
    ownerMembership,
    actor: {
      organizationId: organization.id,
      userId: owner.id,
      membershipId: ownerMembership.id,
    },
  };
}

async function createStandardMember(organizationId: string, label: string) {
  const user = await createUser(label);
  const membership = (
    await sql<{ id: string; version: string }>`
      insert into iam.organization_memberships (
        organization_id, user_id, membership_type, status, display_name, activated_at
      ) values (${organizationId}::uuid, ${user.id}::uuid, 'STANDARD', 'ACTIVE', ${label}, now())
      returning id::text, version::text
    `.execute(database.db)
  ).rows[0]!;
  return { user, membership };
}

describe('organization IAM', () => {
  it('creates an encrypted, idempotent invitation and accepts it exactly once', async () => {
    const fixture = await createFixture('invite');
    const email = `new-admin-${crypto.randomUUID()}@example.test`;
    const input = {
      actor: fixture.actor,
      email,
      displayName: 'New Administrator',
      capabilityCodes: ['catalog.view', 'orders.view'],
      scopes: [],
      idempotencyKey: crypto.randomUUID(),
      encryptionKey: invitationKey,
    } as const;
    const created = await createMembershipInvitation(database.db, input);
    const repeated = await createMembershipInvitation(database.db, input);
    expect(repeated).toMatchObject({ invitationId: created.invitationId, repeated: true });

    const stored = (
      await sql<{ encrypted_delivery_token: string; token_hash: string }>`
        select encrypted_delivery_token, token_hash from iam.membership_invitations
        where id = ${created.invitationId}::uuid
      `.execute(database.db)
    ).rows[0]!;
    expect(stored.encrypted_delivery_token).not.toContain(email);
    const token = decryptSecret(stored.encrypted_delivery_token, invitationKey);
    expect(stored.token_hash).not.toBe(token);

    const accepted = await acceptMembershipInvitation(database.db, {
      token,
      passwordHash: 'already-hashed-for-domain-test',
    });
    expect(accepted.alreadyAccepted).toBe(false);
    await expect(acceptMembershipInvitation(database.db, { token })).resolves.toMatchObject({
      membershipId: accepted.membershipId,
      alreadyAccepted: true,
    });
    const state = await sql<{
      status: string;
      encrypted_delivery_token: string | null;
      grants: string[];
      audit_count: string;
      outbox_count: string;
    }>`
      select invitation.status, invitation.encrypted_delivery_token,
        (select array_agg(capability_code order by capability_code)
          from iam.membership_capability_grants where membership_id = invitation.accepted_membership_id) grants,
        (select count(*)::text from audit.audit_events where target_id = invitation.id) audit_count,
        (select count(*)::text from platform.outbox_events where aggregate_id = invitation.id) outbox_count
      from iam.membership_invitations invitation where invitation.id = ${created.invitationId}::uuid
    `.execute(database.db);
    expect(state.rows[0]).toMatchObject({
      status: 'ACCEPTED',
      encrypted_delivery_token: null,
      grants: ['catalog.view', 'orders.view'],
      audit_count: '2',
      outbox_count: '2',
    });
  });

  it('rejects duplicate pending invitations and idempotency-key payload changes', async () => {
    const fixture = await createFixture('duplicate');
    const email = `duplicate-${crypto.randomUUID()}@example.test`;
    const key = crypto.randomUUID();
    await createMembershipInvitation(database.db, {
      actor: fixture.actor,
      email,
      displayName: 'Duplicate Target',
      capabilityCodes: ['catalog.view'],
      scopes: [],
      idempotencyKey: key,
      encryptionKey: invitationKey,
    });
    await expect(
      createMembershipInvitation(database.db, {
        actor: fixture.actor,
        email,
        displayName: 'Changed Target',
        capabilityCodes: ['catalog.view'],
        scopes: [],
        idempotencyKey: key,
        encryptionKey: invitationKey,
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(
      createMembershipInvitation(database.db, {
        actor: fixture.actor,
        email,
        displayName: 'Duplicate Target',
        capabilityCodes: ['catalog.view'],
        scopes: [],
        encryptionKey: invitationKey,
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('enforces delegation ceilings and optimistic concurrency for permission changes', async () => {
    const fixture = await createFixture('permissions');
    const delegator = await createStandardMember(fixture.organizationId, 'delegator');
    const target = await createStandardMember(fixture.organizationId, 'target');
    await sql`
      insert into iam.membership_capability_grants (membership_id, capability_code, created_by)
      values
        (${delegator.membership.id}::uuid, 'admin.team.permissions.manage', ${fixture.owner.id}::uuid),
        (${delegator.membership.id}::uuid, 'catalog.view', ${fixture.owner.id}::uuid)
    `.execute(database.db);
    const delegatorActor = {
      organizationId: fixture.organizationId,
      userId: delegator.user.id,
      membershipId: delegator.membership.id,
    };
    await expect(
      replaceMemberPermissions(database.db, {
        actor: delegatorActor,
        membershipId: target.membership.id,
        expectedVersion: 1,
        capabilityCodes: ['payments.view'],
        scopes: [],
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    const changed = await replaceMemberPermissions(database.db, {
      actor: delegatorActor,
      membershipId: target.membership.id,
      expectedVersion: 1,
      capabilityCodes: ['catalog.view'],
      scopes: [],
      reason: 'Catalog access required',
    });
    expect(changed.version).toBe(2);
    await expect(
      replaceMemberPermissions(database.db, {
        actor: delegatorActor,
        membershipId: target.membership.id,
        expectedVersion: 1,
        capabilityCodes: [],
        scopes: [],
      }),
    ).rejects.toMatchObject({ code: 'VERSION_CONFLICT' });
  });

  it('revokes authority immediately on suspension and protects Owner/self lifecycle', async () => {
    const fixture = await createFixture('lifecycle');
    const member = await createStandardMember(fixture.organizationId, 'operator');
    await sql`
      insert into iam.membership_capability_grants (membership_id, capability_code, created_by)
      values (${member.membership.id}::uuid, 'orders.view', ${fixture.owner.id}::uuid)
    `.execute(database.db);
    expect(
      await findActiveAdminContext(database.db, member.user.id, {
        organizationId: fixture.organizationId,
        requiredCapability: 'orders.view',
      }),
    ).toBeDefined();
    await changeMemberLifecycle(database.db, {
      actor: fixture.actor,
      membershipId: member.membership.id,
      action: 'SUSPEND',
      expectedVersion: 1,
      reason: 'Security response',
    });
    expect(
      await findActiveAdminContext(database.db, member.user.id, {
        organizationId: fixture.organizationId,
        requiredCapability: 'orders.view',
      }),
    ).toBeUndefined();
    const notices = await sql<{ channels: string[] }>`
      select array_agg(channel order by channel) channels
      from notifications.notifications
      where membership_id = ${member.membership.id}::uuid
        and notification_type = 'IAM_MEMBERSHIP_DISABLED'
    `.execute(database.db);
    expect(notices.rows[0]?.channels).toEqual(['EMAIL', 'IN_APP']);
    await expect(
      changeMemberLifecycle(database.db, {
        actor: fixture.actor,
        membershipId: fixture.ownerMembership.id,
        action: 'SUSPEND',
        expectedVersion: 1,
        reason: 'Should not work',
      }),
    ).rejects.toMatchObject({ code: 'OWNER_PROTECTED' });
    await expect(
      changeMemberLifecycle(database.db, {
        actor: {
          organizationId: fixture.organizationId,
          userId: member.user.id,
          membershipId: member.membership.id,
        },
        membershipId: member.membership.id,
        action: 'RESTORE',
        expectedVersion: 2,
        reason: 'Should not work',
      }),
    ).rejects.toBeInstanceOf(IamError);
  });

  it('validates location scopes against the tenant and enforces capability-specific scope access', async () => {
    const fixture = await createFixture('scopes');
    const other = await createFixture('other-scopes');
    const member = await createStandardMember(fixture.organizationId, 'scoped-operator');
    const allowed = await createLocation(database.db, {
      organizationId: fixture.organizationId,
      actorId: fixture.owner.id,
      code: `ALLOWED-${crypto.randomUUID().slice(0, 6)}`,
      name: 'Allowed Location',
      locationType: 'WAREHOUSE',
      capabilities: ['STOCK_HOLDING'],
    });
    const denied = await createLocation(database.db, {
      organizationId: fixture.organizationId,
      actorId: fixture.owner.id,
      code: `DENIED-${crypto.randomUUID().slice(0, 6)}`,
      name: 'Denied Location',
      locationType: 'WAREHOUSE',
      capabilities: ['STOCK_HOLDING'],
    });
    const foreign = await createLocation(database.db, {
      organizationId: other.organizationId,
      actorId: other.owner.id,
      code: `FOREIGN-${crypto.randomUUID().slice(0, 6)}`,
      name: 'Foreign Location',
      locationType: 'WAREHOUSE',
      capabilities: ['STOCK_HOLDING'],
    });
    await expect(
      replaceMemberPermissions(database.db, {
        actor: fixture.actor,
        membershipId: member.membership.id,
        expectedVersion: 1,
        capabilityCodes: ['inventory.view'],
        scopes: [
          {
            capabilityCode: 'inventory.view',
            scopeType: 'LOCATION',
            scopeId: foreign.id,
          },
        ],
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });

    await replaceMemberPermissions(database.db, {
      actor: fixture.actor,
      membershipId: member.membership.id,
      expectedVersion: 1,
      capabilityCodes: ['inventory.view'],
      scopes: [
        { capabilityCode: 'inventory.view', scopeType: 'LOCATION', scopeId: allowed.id },
      ],
    });
    await expect(
      membershipCanAccessScope(
        database.db,
        member.membership.id,
        'inventory.view',
        'LOCATION',
        allowed.id,
      ),
    ).resolves.toBe(true);
    await expect(
      membershipCanAccessScope(
        database.db,
        member.membership.id,
        'inventory.view',
        'LOCATION',
        denied.id,
      ),
    ).resolves.toBe(false);
  });

  it('transfers the single Owner relationship atomically', async () => {
    const fixture = await createFixture('owner-transfer');
    const successor = await createStandardMember(fixture.organizationId, 'successor');
    const transferred = await transferOwnership(database.db, {
      actor: fixture.actor,
      targetMembershipId: successor.membership.id,
      expectedOwnerVersion: 1,
      expectedTargetVersion: 1,
      reason: 'Planned ownership transition',
    });
    expect(transferred.ownerMembershipId).toBe(successor.membership.id);
    const owners = await sql<{ id: string; count: string }>`
      select min(id::text) id, count(*)::text count from iam.organization_memberships
      where organization_id = ${fixture.organizationId}::uuid and membership_type = 'OWNER' and status = 'ACTIVE'
    `.execute(database.db);
    expect(owners.rows[0]).toMatchObject({ id: successor.membership.id, count: '1' });
    await expect(
      transferOwnership(database.db, {
        actor: fixture.actor,
        targetMembershipId: successor.membership.id,
        expectedOwnerVersion: 1,
        expectedTargetVersion: 1,
        reason: 'Stale replay',
      }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});
