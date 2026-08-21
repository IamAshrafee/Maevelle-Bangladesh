import { sql, type Kysely } from 'kysely';

import { appendAuditEvent } from './platform.js';
import type { DatabaseSchema } from './index.js';

export type LocationCapability =
  | 'STOCK_HOLDING'
  | 'PURCHASE_RECEIVING'
  | 'TRANSFER_SEND'
  | 'TRANSFER_RECEIVE'
  | 'ORDER_FULFILLMENT'
  | 'RETURN_RECEIVING'
  | 'CUSTOMER_PICKUP'
  | 'INTERNAL_STORAGE';

export class WarehouseDomainError extends Error {
  public constructor(
    public readonly code: 'NOT_FOUND' | 'CONFLICT' | 'VALIDATION_FAILED' | 'STALE_VERSION',
    message: string,
  ) {
    super(message);
    this.name = 'WarehouseDomainError';
  }
}

export interface LocationSummary {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly locationType: string;
  readonly status: 'DRAFT' | 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
  readonly capabilities: readonly LocationCapability[];
  readonly version: number;
}

function mapLocation(row: {
  id: string;
  code: string;
  name: string;
  location_type: string;
  status: LocationSummary['status'];
  version: string;
  capabilities: string[] | null;
}): LocationSummary {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    locationType: row.location_type,
    status: row.status,
    capabilities: (row.capabilities ?? []) as LocationCapability[],
    version: Number(row.version),
  };
}

export async function createLocation(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    code: string;
    name: string;
    locationType: string;
    capabilities: readonly LocationCapability[];
    address?: Record<string, unknown>;
  },
): Promise<LocationSummary> {
  if (input.capabilities.length === 0)
    throw new WarehouseDomainError(
      'VALIDATION_FAILED',
      'A Location needs at least one capability.',
    );
  return db.transaction().execute(async (transaction) => {
    const created = await sql<{
      id: string;
      code: string;
      name: string;
      location_type: string;
      status: LocationSummary['status'];
      version: string;
    }>`
      insert into warehouse.locations (organization_id, code, name, location_type, status, address_json)
      values (${input.organizationId}, ${input.code.trim().toUpperCase()}, ${input.name.trim()}, ${input.locationType}, 'ACTIVE', ${input.address ? JSON.stringify(input.address) : null}::jsonb)
      returning id, code, name, location_type, status, version::text
    `.execute(transaction);
    const location = created.rows[0];
    if (!location) throw new Error('Location creation did not return a location.');
    for (const capability of [...new Set(input.capabilities)]) {
      await sql`insert into warehouse.location_capabilities (organization_id, location_id, capability_code) values (${input.organizationId}, ${location.id}, ${capability})`.execute(
        transaction,
      );
    }
    await appendAuditEvent(transaction, {
      organizationId: input.organizationId,
      actorType: 'USER',
      actorId: input.actorId,
      action: 'warehouse.location.created',
      targetType: 'warehouse.location',
      targetId: location.id,
      metadata: { code: location.code, capabilities: input.capabilities },
    });
    await sql`insert into platform.outbox_events (organization_id, event_type, event_version, aggregate_type, aggregate_id, aggregate_version, payload, occurred_at)
      values (${input.organizationId}, 'warehouse.location.created', 1, 'warehouse.location', ${location.id}, 1, ${JSON.stringify({ locationId: location.id })}::jsonb, now())`.execute(
      transaction,
    );
    return {
      ...mapLocation({ ...location, capabilities: [...new Set(input.capabilities)] }),
      version: 1,
    };
  });
}

export async function listLocations(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
): Promise<readonly LocationSummary[]> {
  const result = await sql<{
    id: string;
    code: string;
    name: string;
    location_type: string;
    status: LocationSummary['status'];
    version: string;
    capabilities: string[] | null;
  }>`
    select location.id, location.code, location.name, location.location_type, location.status, location.version::text,
      array_remove(array_agg(capability.capability_code order by capability.capability_code), null) as capabilities
    from warehouse.locations location
    left join warehouse.location_capabilities capability on capability.location_id = location.id and capability.organization_id = location.organization_id
    where location.organization_id = ${organizationId}
    group by location.id order by location.name, location.id
  `.execute(db);
  return result.rows.map(mapLocation);
}

export async function updateLocation(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    locationId: string;
    expectedVersion: number;
    name?: string;
    capabilities?: readonly LocationCapability[];
    status?: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
  },
): Promise<LocationSummary> {
  return db.transaction().execute(async (transaction) => {
    const existing = await sql<{
      id: string;
      version: string;
    }>`select id, version::text from warehouse.locations where id = ${input.locationId} and organization_id = ${input.organizationId} for update`.execute(
      transaction,
    );
    if (!existing.rows[0]) throw new WarehouseDomainError('NOT_FOUND', 'Location was not found.');
    if (Number(existing.rows[0].version) !== input.expectedVersion)
      throw new WarehouseDomainError(
        'STALE_VERSION',
        'Location has changed; reload before saving.',
      );
    if (input.status && input.status !== 'ACTIVE') {
      const stock = await sql<{
        count: string;
      }>`select count(*)::text as count from inventory.inventory_levels where organization_id = ${input.organizationId} and location_id = ${input.locationId} and (sellable_quantity > 0 or unavailable_quantity > 0 or reserved_quantity > 0)`.execute(
        transaction,
      );
      if (Number(stock.rows[0]?.count ?? 0) > 0)
        throw new WarehouseDomainError(
          'VALIDATION_FAILED',
          'A Location with stock or reservations cannot be deactivated or archived.',
        );
    }
    if (input.capabilities && input.capabilities.length === 0)
      throw new WarehouseDomainError(
        'VALIDATION_FAILED',
        'A Location needs at least one capability.',
      );
    const updated = await sql<{
      id: string;
      code: string;
      name: string;
      location_type: string;
      status: LocationSummary['status'];
      version: string;
    }>`
      update warehouse.locations set name = coalesce(${input.name?.trim() ?? null}, name), status = coalesce(${input.status ?? null}, status), version = version + 1, updated_at = now()
      where id = ${input.locationId} and organization_id = ${input.organizationId}
      returning id, code, name, location_type, status, version::text
    `.execute(transaction);
    if (input.capabilities) {
      await sql`delete from warehouse.location_capabilities where organization_id = ${input.organizationId} and location_id = ${input.locationId}`.execute(
        transaction,
      );
      for (const capability of [...new Set(input.capabilities)])
        await sql`insert into warehouse.location_capabilities (organization_id, location_id, capability_code) values (${input.organizationId}, ${input.locationId}, ${capability})`.execute(
          transaction,
        );
    }
    const location = updated.rows[0]!;
    const capabilities =
      input.capabilities ??
      (
        await sql<{
          capability_code: string;
        }>`select capability_code from warehouse.location_capabilities where location_id = ${input.locationId} order by capability_code`.execute(
          transaction,
        )
      ).rows.map((row) => row.capability_code as LocationCapability);
    await appendAuditEvent(transaction, {
      organizationId: input.organizationId,
      actorType: 'USER',
      actorId: input.actorId,
      action: 'warehouse.location.updated',
      targetType: 'warehouse.location',
      targetId: input.locationId,
      metadata: { status: input.status, capabilities: input.capabilities },
    });
    return mapLocation({ ...location, capabilities: [...capabilities] });
  });
}

export async function requireActiveLocationCapability(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  locationId: string,
  capability: LocationCapability,
): Promise<void> {
  const result = await sql<{
    id: string;
  }>`select location.id from warehouse.locations location join warehouse.location_capabilities capability on capability.location_id = location.id and capability.organization_id = location.organization_id where location.id = ${locationId} and location.organization_id = ${organizationId} and location.status = 'ACTIVE' and capability.capability_code = ${capability}`.execute(
    db,
  );
  if (!result.rows[0])
    throw new WarehouseDomainError(
      'VALIDATION_FAILED',
      `Location is not active and eligible for ${capability}.`,
    );
}
