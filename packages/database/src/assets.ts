import { sql, type Kysely } from 'kysely';
import type { DatabaseSchema } from './index.js';
import { appendAuditEvent, claimIdempotencyRecord, IdempotencyKeyReuseError } from './platform.js';

export type AssetDomainErrorCode = 'NOT_FOUND' | 'VALIDATION_FAILED' | 'CONFLICT';
export class AssetDomainError extends Error {
  public constructor(
    public readonly code: AssetDomainErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'AssetDomainError';
  }
}

const TERMINAL = new Set(['SOLD', 'DISPOSED']);
const moneyPattern = /^(?:0|[1-9]\d*)(?:\.\d{1,4})?$/;

function clean(value: string | null | undefined, max = 4000): string | null {
  const result = value?.trim() || null;
  if (result && result.length > max)
    throw new AssetDomainError('VALIDATION_FAILED', `Text cannot exceed ${max} characters.`);
  return result;
}

function money(value: string | null | undefined): string | null {
  const result = value?.trim() || null;
  if (result !== null && !moneyPattern.test(result))
    throw new AssetDomainError(
      'VALIDATION_FAILED',
      'Amount must be zero or greater with up to 4 decimal places.',
    );
  return result;
}

async function claim(
  db: Kysely<DatabaseSchema>,
  input: { organizationId: string; actorId: string; operation: string; key: string; body: unknown },
) {
  try {
    return await claimIdempotencyRecord(db, {
      organizationId: input.organizationId,
      principalType: 'USER',
      principalId: input.actorId,
      operationType: input.operation,
      idempotencyKey: input.key,
      requestFingerprint: JSON.stringify(input.body),
    });
  } catch (error) {
    if (error instanceof IdempotencyKeyReuseError)
      throw new AssetDomainError('CONFLICT', error.message);
    throw error;
  }
}

async function replayId(db: Kysely<DatabaseSchema>, id: string) {
  const result = await sql<{
    id: string | null;
  }>`select result_entity_id::text as id from platform.idempotency_records where id=${id} and status='SUCCEEDED'`.execute(
    db,
  );
  return result.rows[0]?.id ?? null;
}

async function finish(
  db: Kysely<DatabaseSchema>,
  id: string,
  entityType: string,
  entityId: string,
) {
  await sql`update platform.idempotency_records set status='SUCCEEDED',result_entity_type=${entityType},result_entity_id=${entityId}::uuid,safe_response=${JSON.stringify({ id: entityId })}::jsonb,completed_at=now() where id=${id}`.execute(
    db,
  );
}

async function nextAssetCode(db: Kysely<DatabaseSchema>, organizationId: string) {
  await sql`select pg_advisory_xact_lock(hashtextextended(${`asset-code:${organizationId}`},0))`.execute(
    db,
  );
  const result = await sql<{
    code: string;
  }>`select 'AST-' || lpad((count(*)+1)::text,6,'0') as code from assets.assets where organization_id=${organizationId}`.execute(
    db,
  );
  return result.rows[0]?.code ?? 'AST-000001';
}

async function nextFinanceNumber(db: Kysely<DatabaseSchema>, organizationId: string) {
  await sql`select pg_advisory_xact_lock(hashtextextended(${`finance-number:${organizationId}`},0))`.execute(
    db,
  );
  const result = await sql<{
    number: string;
  }>`select 'FIN-' || lpad((count(*)+1)::text,6,'0') as number from finance.finance_transactions where organization_id=${organizationId}`.execute(
    db,
  );
  return result.rows[0]?.number ?? 'FIN-000001';
}

async function lockedAsset(db: Kysely<DatabaseSchema>, organizationId: string, assetId: string) {
  const result = await sql<{
    id: string;
    asset_code: string;
    name: string;
    status: string;
    condition: string;
    location_id: string | null;
    custom_location: string | null;
    custodian_membership_id: string | null;
    version: string;
  }>`select id,asset_code,name,status,condition,location_id,custom_location,custodian_membership_id,version::text from assets.assets where organization_id=${organizationId} and id=${assetId} for update`.execute(
    db,
  );
  const row = result.rows[0];
  if (!row) throw new AssetDomainError('NOT_FOUND', 'Asset was not found.');
  return row;
}

async function event(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    assetId: string;
    actorId: string;
    type: string;
    summary: string;
    before?: unknown;
    after?: unknown;
    relatedType?: string;
    relatedId?: string;
    occurredAt?: string;
  },
) {
  await sql`insert into assets.events (organization_id,asset_id,event_type,summary,before_state,after_state,related_entity_type,related_entity_id,occurred_at,actor_id)
    values (${input.organizationId},${input.assetId}::uuid,${input.type},${input.summary},${input.before ? JSON.stringify(input.before) : null}::jsonb,${input.after ? JSON.stringify(input.after) : null}::jsonb,${input.relatedType ?? null},${input.relatedId ?? null}::uuid,coalesce(${input.occurredAt ?? null}::timestamptz,now()),${input.actorId}::uuid)`.execute(
    db,
  );
}

async function audit(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    action: string;
    assetId: string;
    before?: unknown;
    after?: unknown;
    reason?: string;
  },
) {
  await appendAuditEvent(db, {
    organizationId: input.organizationId,
    actorType: 'USER',
    actorId: input.actorId,
    action: input.action,
    targetType: 'assets.asset',
    targetId: input.assetId,
    ...(input.before ? { beforeDiff: input.before as Record<string, unknown> } : {}),
    ...(input.after ? { afterDiff: input.after as Record<string, unknown> } : {}),
    ...(input.reason ? { reason: input.reason } : {}),
  });
}

async function emit(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  assetId: string,
  type: string,
  version: number,
  payload: unknown = {},
) {
  await sql`insert into platform.outbox_events (organization_id,event_type,event_version,aggregate_type,aggregate_id,aggregate_version,payload,occurred_at)
    values (${organizationId},${type},1,'assets.asset',${assetId}::uuid,${version},${JSON.stringify({ assetId, ...((payload ?? {}) as object) })}::jsonb,now())`.execute(
    db,
  );
}

export async function listAssetCategories(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  includeArchived = false,
) {
  const result = await sql<{
    id: string;
    name: string;
    description: string | null;
    status: 'ACTIVE' | 'ARCHIVED';
    asset_count: string;
    version: string;
  }>`select category.id,category.name,category.description,category.status,category.version::text,count(asset.id)::text as asset_count
    from assets.categories category left join assets.assets asset on asset.organization_id=category.organization_id and asset.category_id=category.id
    where category.organization_id=${organizationId} and (${includeArchived} or category.status='ACTIVE')
    group by category.id order by category.name`.execute(db);
  return result.rows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    status: row.status,
    assetCount: Number(row.asset_count),
    version: Number(row.version),
  }));
}

export async function createAssetCategory(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    name: string;
    description?: string;
    idempotencyKey: string;
  },
) {
  return db.transaction().execute(async (tx) => {
    const name = clean(input.name, 100);
    if (!name) throw new AssetDomainError('VALIDATION_FAILED', 'Category name is required.');
    const c = await claim(tx, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      operation: 'assets.category.create',
      key: input.idempotencyKey,
      body: input,
    });
    if (!c.created) {
      const id = await replayId(tx, c.id);
      if (id) return { id };
      throw new AssetDomainError('CONFLICT', 'Category creation is already being processed.');
    }
    try {
      const result = await sql<{
        id: string;
      }>`insert into assets.categories (organization_id,name,description,created_by) values (${input.organizationId},${name},${clean(input.description, 500)},${input.actorId}::uuid) returning id`.execute(
        tx,
      );
      const id = result.rows[0]!.id;
      await appendAuditEvent(tx, {
        organizationId: input.organizationId,
        actorType: 'USER',
        actorId: input.actorId,
        action: 'assets.category.created',
        targetType: 'assets.category',
        targetId: id,
        metadata: { name },
      });
      await finish(tx, c.id, 'assets.category', id);
      return { id };
    } catch (error) {
      if ((error as { code?: string }).code === '23505')
        throw new AssetDomainError('CONFLICT', 'An Asset category with this name already exists.');
      throw error;
    }
  });
}

export async function updateAssetCategory(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    categoryId: string;
    name: string;
    description?: string | null;
    status: 'ACTIVE' | 'ARCHIVED';
    expectedVersion: number;
  },
) {
  const name = clean(input.name, 100);
  if (!name) throw new AssetDomainError('VALIDATION_FAILED', 'Category name is required.');
  try {
    const result = await sql<{
      version: string;
    }>`update assets.categories set name=${name},description=${clean(input.description, 500)},status=${input.status},updated_at=now(),version=version+1 where organization_id=${input.organizationId} and id=${input.categoryId} and version=${input.expectedVersion} returning version::text`.execute(
      db,
    );
    if (!result.rows[0])
      throw new AssetDomainError('CONFLICT', 'Category changed since it was loaded.');
    await appendAuditEvent(db, {
      organizationId: input.organizationId,
      actorType: 'USER',
      actorId: input.actorId,
      action: 'assets.category.updated',
      targetType: 'assets.category',
      targetId: input.categoryId,
      afterDiff: { name, status: input.status },
    });
    return { id: input.categoryId, version: Number(result.rows[0].version) };
  } catch (error) {
    if ((error as { code?: string }).code === '23505')
      throw new AssetDomainError('CONFLICT', 'An Asset category with this name already exists.');
    throw error;
  }
}

export async function getAssetOptions(db: Kysely<DatabaseSchema>, organizationId: string) {
  const [categories, locations, custodians, expenses, purchases, accounts, organization] =
    await Promise.all([
      listAssetCategories(db, organizationId),
      sql<{
        id: string;
        name: string;
        code: string;
      }>`select id,name,code from warehouse.locations where organization_id=${organizationId} and status='ACTIVE' order by name`.execute(
        db,
      ),
      sql<{
        id: string;
        name: string;
      }>`select membership.id,coalesce(membership.display_name,user_account.name,user_account.email) as name from iam.organization_memberships membership join iam.users user_account on user_account.id=membership.user_id where membership.organization_id=${organizationId} and membership.status='ACTIVE' order by name`.execute(
        db,
      ),
      sql<{
        id: string;
        number: string;
        description: string;
        amount: string;
        currency: string;
      }>`select id,expense_number as number,description,amount::text,currency_code as currency from finance.expenses where organization_id=${organizationId} and status='RECORDED' order by expense_date desc,id desc limit 200`.execute(
        db,
      ),
      sql<{
        id: string;
        number: string;
        supplier: string;
        currency: string;
      }>`select purchase.id,purchase.purchase_number as number,supplier.name as supplier,purchase.currency_code as currency from procurement.purchases purchase join procurement.suppliers supplier on supplier.id=purchase.supplier_id where purchase.organization_id=${organizationId} and purchase.status<>'CANCELLED' order by purchase.created_at desc limit 200`.execute(
        db,
      ),
      sql<{
        id: string;
        name: string;
        currency: string;
      }>`select id,name,currency_code as currency from finance.financial_accounts where organization_id=${organizationId} and status='ACTIVE' order by name`.execute(
        db,
      ),
      sql<{
        currency: string;
      }>`select default_currency as currency from platform.organizations where id=${organizationId}`.execute(
        db,
      ),
    ]);
  return {
    categories,
    locations: locations.rows,
    custodians: custodians.rows,
    expenses: expenses.rows.map((r) => ({
      id: r.id,
      number: r.number,
      description: r.description,
      amount: r.amount,
      currencyCode: r.currency,
    })),
    purchases: purchases.rows.map((r) => ({
      id: r.id,
      number: r.number,
      supplierName: r.supplier,
      currencyCode: r.currency,
    })),
    accounts: accounts.rows.map((r) => ({ id: r.id, name: r.name, currencyCode: r.currency })),
    defaultCurrency: organization.rows[0]?.currency ?? 'BDT',
  };
}

export async function getAssetSummary(db: Kysely<DatabaseSchema>, organizationId: string) {
  const result = await sql<{
    total: string;
    active: string;
    storage: string;
    repair: string;
    attention: string;
    disposed: string;
    cost: string;
    currency: string;
  }>`select count(asset.id)::text as total,count(*) filter(where asset.status='ACTIVE')::text as active,count(*) filter(where asset.status='IN_STORAGE')::text as storage,count(*) filter(where asset.status='UNDER_REPAIR')::text as repair,count(*) filter(where asset.status in ('DAMAGED','LOST') or asset.condition in ('NEEDS_REPAIR','DAMAGED'))::text as attention,count(*) filter(where asset.status in ('SOLD','DISPOSED'))::text as disposed,coalesce(sum(asset.acquisition_cost) filter(where asset.currency_code=organization.default_currency),0)::text as cost,organization.default_currency as currency from platform.organizations organization left join assets.assets asset on asset.organization_id=organization.id where organization.id=${organizationId} group by organization.id`.execute(
    db,
  );
  const r = result.rows[0];
  return {
    total: Number(r?.total ?? 0),
    active: Number(r?.active ?? 0),
    inStorage: Number(r?.storage ?? 0),
    underRepair: Number(r?.repair ?? 0),
    attention: Number(r?.attention ?? 0),
    disposed: Number(r?.disposed ?? 0),
    totalAcquisitionCost: r?.cost ?? '0',
    currencyCode: r?.currency ?? 'BDT',
  };
}

export async function listAssets(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  filters: {
    search?: string;
    status?: string;
    condition?: string;
    categoryId?: string;
    locationId?: string;
    custodianId?: string;
    page?: number;
    pageSize?: number;
  } = {},
) {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 25));
  const offset = (page - 1) * pageSize;
  const search = clean(filters.search, 200);
  const pattern = search ? `%${search.replace(/[\\%_]/g, '\\$&')}%` : null;
  const query = sql<{
    id: string;
    asset_code: string;
    name: string;
    category_id: string | null;
    category_name: string | null;
    brand: string | null;
    model: string | null;
    serial_number: string | null;
    status: 'ACTIVE' | 'IN_STORAGE' | 'UNDER_REPAIR' | 'DAMAGED' | 'LOST' | 'SOLD' | 'DISPOSED';
    condition: 'GOOD' | 'FAIR' | 'NEEDS_REPAIR' | 'DAMAGED';
    location_id: string | null;
    location_name: string | null;
    custom_location: string | null;
    custodian_membership_id: string | null;
    custodian_name: string | null;
    acquisition_date: string;
    acquisition_cost: string | null;
    currency_code: string;
    updated_at: string;
    version: string;
  }>`select asset.id,asset.asset_code,asset.name,asset.category_id,category.name as category_name,asset.brand,asset.model,asset.serial_number,asset.status,asset.condition,asset.location_id,location.name as location_name,asset.custom_location,asset.custodian_membership_id,coalesce(membership.display_name,user_account.name,user_account.email) as custodian_name,asset.acquisition_date::text,asset.acquisition_cost::text,asset.currency_code,asset.updated_at::text,asset.version::text from assets.assets asset left join assets.categories category on category.id=asset.category_id left join warehouse.locations location on location.id=asset.location_id left join iam.organization_memberships membership on membership.id=asset.custodian_membership_id left join iam.users user_account on user_account.id=membership.user_id where asset.organization_id=${organizationId} and (${pattern}::text is null or asset.asset_code ilike ${pattern} escape '\\' or asset.name ilike ${pattern} escape '\\' or asset.serial_number ilike ${pattern} escape '\\' or asset.model ilike ${pattern} escape '\\') and (${filters.status ?? null}::text is null or asset.status=${filters.status ?? null}) and (${filters.condition ?? null}::text is null or asset.condition=${filters.condition ?? null}) and (${filters.categoryId ?? null}::uuid is null or asset.category_id=${filters.categoryId ?? null}::uuid) and (${filters.locationId ?? null}::uuid is null or asset.location_id=${filters.locationId ?? null}::uuid) and (${filters.custodianId ?? null}::uuid is null or asset.custodian_membership_id=${filters.custodianId ?? null}::uuid) order by asset.updated_at desc,asset.id desc limit ${pageSize} offset ${offset}`;
  const count = await sql<{
    count: string;
  }>`select count(*)::text as count from assets.assets asset where asset.organization_id=${organizationId} and (${pattern}::text is null or asset.asset_code ilike ${pattern} escape '\\' or asset.name ilike ${pattern} escape '\\' or asset.serial_number ilike ${pattern} escape '\\' or asset.model ilike ${pattern} escape '\\') and (${filters.status ?? null}::text is null or asset.status=${filters.status ?? null}) and (${filters.condition ?? null}::text is null or asset.condition=${filters.condition ?? null}) and (${filters.categoryId ?? null}::uuid is null or asset.category_id=${filters.categoryId ?? null}::uuid) and (${filters.locationId ?? null}::uuid is null or asset.location_id=${filters.locationId ?? null}::uuid) and (${filters.custodianId ?? null}::uuid is null or asset.custodian_membership_id=${filters.custodianId ?? null}::uuid)`.execute(
    db,
  );
  const rows = await query.execute(db);
  const totalItems = Number(count.rows[0]?.count ?? 0);
  return {
    items: rows.rows.map((r) => ({
      id: r.id,
      assetCode: r.asset_code,
      name: r.name,
      categoryId: r.category_id,
      categoryName: r.category_name,
      brand: r.brand,
      model: r.model,
      serialNumber: r.serial_number,
      status: r.status,
      condition: r.condition,
      locationId: r.location_id,
      locationName: r.location_name,
      customLocation: r.custom_location,
      custodianMembershipId: r.custodian_membership_id,
      custodianName: r.custodian_name,
      acquisitionDate: r.acquisition_date,
      acquisitionCost: r.acquisition_cost,
      currencyCode: r.currency_code,
      updatedAt: r.updated_at,
      version: Number(r.version),
    })),
    pagination: { page, pageSize, totalItems, totalPages: Math.ceil(totalItems / pageSize) },
  };
}

export async function createAsset(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    name: string;
    categoryId?: string;
    description?: string;
    brand?: string;
    model?: string;
    serialNumber?: string;
    condition?: string;
    acquisitionSource: string;
    acquisitionDate: string;
    acquisitionCost?: string;
    currencyCode: string;
    expenseId?: string;
    purchaseId?: string;
    purchaseLineId?: string;
    locationId?: string;
    customLocation?: string;
    custodianMembershipId?: string;
    warrantyExpiresOn?: string;
    notes?: string;
    idempotencyKey: string;
  },
) {
  return db.transaction().execute(async (tx) => {
    const name = clean(input.name, 200);
    if (!name) throw new AssetDomainError('VALIDATION_FAILED', 'Asset name is required.');
    if (input.locationId && clean(input.customLocation, 200))
      throw new AssetDomainError(
        'VALIDATION_FAILED',
        'Choose an existing location or enter a custom location, not both.',
      );
    const c = await claim(tx, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      operation: 'assets.asset.create',
      key: input.idempotencyKey,
      body: input,
    });
    if (!c.created) {
      const id = await replayId(tx, c.id);
      if (id) return { id };
      throw new AssetDomainError('CONFLICT', 'Asset registration is already being processed.');
    }
    let cost = money(input.acquisitionCost);
    let currencyCode = input.currencyCode.toUpperCase();
    if (input.categoryId) {
      const category =
        await sql`select 1 from assets.categories where organization_id=${input.organizationId} and id=${input.categoryId} and status='ACTIVE'`.execute(
          tx,
        );
      if (!category.rows[0])
        throw new AssetDomainError('NOT_FOUND', 'Active Asset category was not found.');
    }
    if (input.locationId) {
      const location =
        await sql`select 1 from warehouse.locations where organization_id=${input.organizationId} and id=${input.locationId} and status='ACTIVE'`.execute(
          tx,
        );
      if (!location.rows[0])
        throw new AssetDomainError('NOT_FOUND', 'Active business location was not found.');
    }
    if (input.custodianMembershipId) {
      const custodian =
        await sql`select 1 from iam.organization_memberships where organization_id=${input.organizationId} and id=${input.custodianMembershipId} and status='ACTIVE'`.execute(
          tx,
        );
      if (!custodian.rows[0])
        throw new AssetDomainError('NOT_FOUND', 'Active Team member was not found.');
    }
    if (input.acquisitionSource === 'EXPENSE') {
      if (!input.expenseId || input.purchaseId || input.purchaseLineId)
        throw new AssetDomainError(
          'VALIDATION_FAILED',
          'Expense acquisitions require one linked Expense and no Purchase.',
        );
      const expense = await sql<{
        amount: string;
        currency: string;
      }>`select amount::text,currency_code as currency from finance.expenses where organization_id=${input.organizationId} and id=${input.expenseId} and status='RECORDED'`.execute(
        tx,
      );
      if (!expense.rows[0])
        throw new AssetDomainError('NOT_FOUND', 'Recorded acquisition Expense was not found.');
      cost ??= expense.rows[0].amount;
      currencyCode = expense.rows[0].currency;
    } else if (input.acquisitionSource === 'PURCHASE') {
      if (!input.purchaseId || input.expenseId)
        throw new AssetDomainError(
          'VALIDATION_FAILED',
          'Purchase acquisitions require one linked Purchase and no direct Expense.',
        );
      const purchase = await sql<{
        currency: string;
      }>`select currency_code as currency from procurement.purchases where organization_id=${input.organizationId} and id=${input.purchaseId} and status in ('PLACED','CLOSED')`.execute(
        tx,
      );
      if (!purchase.rows[0])
        throw new AssetDomainError(
          'NOT_FOUND',
          'Placed or closed acquisition Purchase was not found.',
        );
      currencyCode = purchase.rows[0].currency;
      if (input.purchaseLineId) {
        const line = await sql<{
          cost: string;
        }>`select (quantity*unit_price)::numeric(20,4)::text as cost from procurement.purchase_lines where organization_id=${input.organizationId} and id=${input.purchaseLineId} and purchase_id=${input.purchaseId}`.execute(
          tx,
        );
        if (!line.rows[0])
          throw new AssetDomainError(
            'NOT_FOUND',
            'Purchase line was not found on the selected Purchase.',
          );
        cost ??= line.rows[0].cost;
      }
      if (!cost)
        throw new AssetDomainError(
          'VALIDATION_FAILED',
          'Acquisition cost is required when linking a whole Purchase without a specific line.',
        );
    } else if (input.acquisitionSource === 'EXISTING' || input.acquisitionSource === 'GIFT') {
      if (input.expenseId || input.purchaseId || input.purchaseLineId)
        throw new AssetDomainError(
          'VALIDATION_FAILED',
          'Existing and gifted Assets cannot link a fabricated Expense or Purchase.',
        );
    } else throw new AssetDomainError('VALIDATION_FAILED', 'Acquisition source is not supported.');
    const code = await nextAssetCode(tx, input.organizationId);
    try {
      const result = await sql<{
        id: string;
      }>`insert into assets.assets (organization_id,asset_code,name,category_id,description,brand,model,serial_number,condition,acquisition_source,acquisition_date,acquisition_cost,currency_code,finance_expense_id,purchase_id,purchase_line_id,location_id,custom_location,custodian_membership_id,warranty_expires_on,notes,created_by) values (${input.organizationId},${code},${name},${input.categoryId ?? null}::uuid,${clean(input.description)},${clean(input.brand, 120)},${clean(input.model, 120)},${clean(input.serialNumber, 200)},${input.condition ?? 'GOOD'},${input.acquisitionSource},${input.acquisitionDate}::date,${cost}::numeric,${currencyCode},${input.expenseId ?? null}::uuid,${input.purchaseId ?? null}::uuid,${input.purchaseLineId ?? null}::uuid,${input.locationId ?? null}::uuid,${clean(input.customLocation, 200)},${input.custodianMembershipId ?? null}::uuid,${input.warrantyExpiresOn ?? null}::date,${clean(input.notes)},${input.actorId}::uuid) returning id`.execute(
        tx,
      );
      const id = result.rows[0]!.id;
      await event(tx, {
        organizationId: input.organizationId,
        assetId: id,
        actorId: input.actorId,
        type: 'REGISTERED',
        summary: `${code} registered as ${input.acquisitionSource.toLowerCase()} asset.`,
        after: {
          status: 'ACTIVE',
          condition: input.condition ?? 'GOOD',
          acquisitionSource: input.acquisitionSource,
        },
      });
      await audit(tx, {
        organizationId: input.organizationId,
        actorId: input.actorId,
        action: 'assets.asset.created',
        assetId: id,
        after: { code, name, acquisitionSource: input.acquisitionSource },
      });
      await emit(tx, input.organizationId, id, 'assets.asset.created', 1);
      await finish(tx, c.id, 'assets.asset', id);
      return { id };
    } catch (error) {
      if ((error as { code?: string }).code === '23505')
        throw new AssetDomainError(
          'CONFLICT',
          'Asset code or serial number already exists in this organization.',
        );
      if ((error as { code?: string }).code === '23503')
        throw new AssetDomainError(
          'NOT_FOUND',
          'A linked category, Expense, Purchase, location, or custodian was not found in this organization.',
        );
      throw error;
    }
  });
}

export async function updateAsset(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    assetId: string;
    expectedVersion: number;
    name: string;
    categoryId?: string | null;
    description?: string | null;
    brand?: string | null;
    model?: string | null;
    serialNumber?: string | null;
    condition: string;
    warrantyExpiresOn?: string | null;
    notes?: string | null;
  },
) {
  return db.transaction().execute(async (tx) => {
    const current = await lockedAsset(tx, input.organizationId, input.assetId);
    if (TERMINAL.has(current.status))
      throw new AssetDomainError('CONFLICT', 'Sold or disposed Assets cannot be edited.');
    if (!input.name.trim())
      throw new AssetDomainError('VALIDATION_FAILED', 'Asset name is required.');
    if (input.categoryId) {
      const category =
        await sql`select 1 from assets.categories where organization_id=${input.organizationId} and id=${input.categoryId} and status='ACTIVE'`.execute(
          tx,
        );
      if (!category.rows[0])
        throw new AssetDomainError('NOT_FOUND', 'Active Asset category was not found.');
    }
    try {
      const result = await sql<{
        version: string;
      }>`update assets.assets set name=${input.name.trim()},category_id=${input.categoryId ?? null}::uuid,description=${clean(input.description)},brand=${clean(input.brand, 120)},model=${clean(input.model, 120)},serial_number=${clean(input.serialNumber, 200)},condition=${input.condition},warranty_expires_on=${input.warrantyExpiresOn ?? null}::date,notes=${clean(input.notes)},updated_at=now(),version=version+1 where organization_id=${input.organizationId} and id=${input.assetId} and version=${input.expectedVersion} returning version::text`.execute(
        tx,
      );
      if (!result.rows[0])
        throw new AssetDomainError(
          'CONFLICT',
          'Asset changed since it was loaded. Refresh and try again.',
        );
      await event(tx, {
        organizationId: input.organizationId,
        assetId: input.assetId,
        actorId: input.actorId,
        type: current.condition === input.condition ? 'UPDATED' : 'CONDITION_CHANGED',
        summary: 'Asset details updated.',
        before: { condition: current.condition },
        after: { condition: input.condition },
      });
      await audit(tx, {
        organizationId: input.organizationId,
        actorId: input.actorId,
        action: 'assets.asset.updated',
        assetId: input.assetId,
        before: { condition: current.condition },
        after: { condition: input.condition },
      });
      await emit(
        tx,
        input.organizationId,
        input.assetId,
        'assets.asset.updated',
        Number(result.rows[0].version),
      );
      return { id: input.assetId, version: Number(result.rows[0].version) };
    } catch (error) {
      if ((error as { code?: string }).code === '23505')
        throw new AssetDomainError('CONFLICT', 'Another Asset already uses this serial number.');
      throw error;
    }
  });
}

export async function assignAsset(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    assetId: string;
    custodianMembershipId?: string | null;
    expectedVersion: number;
  },
) {
  return db.transaction().execute(async (tx) => {
    const a = await lockedAsset(tx, input.organizationId, input.assetId);
    if (TERMINAL.has(a.status) || a.status === 'LOST')
      throw new AssetDomainError(
        'CONFLICT',
        'This Asset cannot be assigned in its current status.',
      );
    if (input.custodianMembershipId) {
      const member =
        await sql`select 1 from iam.organization_memberships where organization_id=${input.organizationId} and id=${input.custodianMembershipId} and status='ACTIVE'`.execute(
          tx,
        );
      if (!member.rows[0])
        throw new AssetDomainError('NOT_FOUND', 'Active Team member was not found.');
    }
    const r = await sql<{
      version: string;
    }>`update assets.assets set custodian_membership_id=${input.custodianMembershipId ?? null}::uuid,updated_at=now(),version=version+1 where organization_id=${input.organizationId} and id=${input.assetId} and version=${input.expectedVersion} returning version::text`.execute(
      tx,
    );
    if (!r.rows[0]) throw new AssetDomainError('CONFLICT', 'Asset changed since it was loaded.');
    const type = input.custodianMembershipId ? 'ASSIGNED' : 'UNASSIGNED';
    await event(tx, {
      organizationId: input.organizationId,
      assetId: input.assetId,
      actorId: input.actorId,
      type,
      summary: input.custodianMembershipId
        ? 'Asset custodian changed.'
        : 'Asset custodian removed.',
      before: { custodianMembershipId: a.custodian_membership_id },
      after: { custodianMembershipId: input.custodianMembershipId ?? null },
    });
    await audit(tx, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      action: `assets.asset.${type.toLowerCase()}`,
      assetId: input.assetId,
      before: { custodianMembershipId: a.custodian_membership_id },
      after: { custodianMembershipId: input.custodianMembershipId ?? null },
    });
    return { id: input.assetId, version: Number(r.rows[0].version) };
  });
}

export async function moveAsset(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    assetId: string;
    locationId?: string | null;
    customLocation?: string | null;
    expectedVersion: number;
  },
) {
  return db.transaction().execute(async (tx) => {
    const a = await lockedAsset(tx, input.organizationId, input.assetId);
    if (TERMINAL.has(a.status) || a.status === 'LOST')
      throw new AssetDomainError('CONFLICT', 'This Asset cannot be moved in its current status.');
    if (input.locationId && clean(input.customLocation, 200))
      throw new AssetDomainError(
        'VALIDATION_FAILED',
        'Choose an existing or custom location, not both.',
      );
    if (input.locationId) {
      const location =
        await sql`select 1 from warehouse.locations where organization_id=${input.organizationId} and id=${input.locationId} and status='ACTIVE'`.execute(
          tx,
        );
      if (!location.rows[0])
        throw new AssetDomainError('NOT_FOUND', 'Active business location was not found.');
    }
    const r = await sql<{
      version: string;
    }>`update assets.assets set location_id=${input.locationId ?? null}::uuid,custom_location=${clean(input.customLocation, 200)},updated_at=now(),version=version+1 where organization_id=${input.organizationId} and id=${input.assetId} and version=${input.expectedVersion} returning version::text`.execute(
      tx,
    );
    if (!r.rows[0]) throw new AssetDomainError('CONFLICT', 'Asset changed since it was loaded.');
    await event(tx, {
      organizationId: input.organizationId,
      assetId: input.assetId,
      actorId: input.actorId,
      type: 'MOVED',
      summary: 'Asset location changed.',
      before: { locationId: a.location_id, customLocation: a.custom_location },
      after: {
        locationId: input.locationId ?? null,
        customLocation: clean(input.customLocation, 200),
      },
    });
    await audit(tx, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      action: 'assets.asset.moved',
      assetId: input.assetId,
      before: { locationId: a.location_id },
      after: { locationId: input.locationId ?? null },
    });
    return { id: input.assetId, version: Number(r.rows[0].version) };
  });
}

export async function changeAssetLifecycle(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    assetId: string;
    status: 'ACTIVE' | 'IN_STORAGE' | 'UNDER_REPAIR' | 'DAMAGED' | 'LOST';
    condition?: string;
    reason: string;
    expectedVersion: number;
  },
) {
  return db.transaction().execute(async (tx) => {
    const a = await lockedAsset(tx, input.organizationId, input.assetId);
    if (TERMINAL.has(a.status))
      throw new AssetDomainError(
        'CONFLICT',
        'Sold or disposed Assets have a final lifecycle state.',
      );
    const reason = clean(input.reason, 1000);
    if (!reason || reason.length < 4)
      throw new AssetDomainError('VALIDATION_FAILED', 'Reason must contain at least 4 characters.');
    const condition = input.condition ?? (input.status === 'DAMAGED' ? 'DAMAGED' : a.condition);
    const r = await sql<{
      version: string;
    }>`update assets.assets set status=${input.status},condition=${condition},custodian_membership_id=case when ${input.status}='LOST' then null else custodian_membership_id end,location_id=case when ${input.status}='LOST' then null else location_id end,custom_location=case when ${input.status}='LOST' then null else custom_location end,updated_at=now(),version=version+1 where organization_id=${input.organizationId} and id=${input.assetId} and version=${input.expectedVersion} returning version::text`.execute(
      tx,
    );
    if (!r.rows[0]) throw new AssetDomainError('CONFLICT', 'Asset changed since it was loaded.');
    await event(tx, {
      organizationId: input.organizationId,
      assetId: input.assetId,
      actorId: input.actorId,
      type: 'STATUS_CHANGED',
      summary: reason,
      before: { status: a.status, condition: a.condition },
      after: { status: input.status, condition },
    });
    await audit(tx, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      action: 'assets.asset.status_changed',
      assetId: input.assetId,
      before: { status: a.status },
      after: { status: input.status },
      reason,
    });
    await emit(
      tx,
      input.organizationId,
      input.assetId,
      'assets.asset.status_changed',
      Number(r.rows[0].version),
      { status: input.status },
    );
    return { id: input.assetId, version: Number(r.rows[0].version) };
  });
}

export async function recordMaintenance(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    assetId: string;
    type: string;
    occurredOn: string;
    issue?: string;
    workPerformed: string;
    serviceProvider?: string;
    expenseId?: string;
    nextServiceOn?: string;
    notes?: string;
    idempotencyKey: string;
  },
) {
  return db.transaction().execute(async (tx) => {
    const a = await lockedAsset(tx, input.organizationId, input.assetId);
    if (TERMINAL.has(a.status) || a.status === 'LOST')
      throw new AssetDomainError(
        'CONFLICT',
        'Maintenance cannot be recorded for this Asset status.',
      );
    const work = clean(input.workPerformed);
    if (!work) throw new AssetDomainError('VALIDATION_FAILED', 'Work performed is required.');
    if (input.expenseId) {
      const expense =
        await sql`select 1 from finance.expenses where organization_id=${input.organizationId} and id=${input.expenseId} and status='RECORDED'`.execute(
          tx,
        );
      if (!expense.rows[0])
        throw new AssetDomainError('NOT_FOUND', 'Recorded maintenance Expense was not found.');
    }
    const c = await claim(tx, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      operation: 'assets.maintenance.create',
      key: input.idempotencyKey,
      body: input,
    });
    if (!c.created) {
      const id = await replayId(tx, c.id);
      if (id) return { id };
      throw new AssetDomainError('CONFLICT', 'Maintenance is already being recorded.');
    }
    try {
      const r = await sql<{
        id: string;
      }>`insert into assets.maintenance_records (organization_id,asset_id,maintenance_type,occurred_on,issue,work_performed,service_provider,finance_expense_id,next_service_on,notes,created_by) values (${input.organizationId},${input.assetId}::uuid,${input.type},${input.occurredOn}::date,${clean(input.issue, 2000)},${work},${clean(input.serviceProvider, 200)},${input.expenseId ?? null}::uuid,${input.nextServiceOn ?? null}::date,${clean(input.notes)},${input.actorId}::uuid) returning id`.execute(
        tx,
      );
      const id = r.rows[0]!.id;
      await event(tx, {
        organizationId: input.organizationId,
        assetId: input.assetId,
        actorId: input.actorId,
        type: 'MAINTENANCE_RECORDED',
        summary: `${input.type.toLowerCase().replaceAll('_', ' ')} recorded.`,
        relatedType: 'assets.maintenance',
        relatedId: id,
      });
      await audit(tx, {
        organizationId: input.organizationId,
        actorId: input.actorId,
        action: 'assets.maintenance.recorded',
        assetId: input.assetId,
        after: { maintenanceId: id, type: input.type, expenseId: input.expenseId ?? null },
      });
      await finish(tx, c.id, 'assets.maintenance', id);
      return { id };
    } catch (error) {
      if ((error as { code?: string }).code === '23503')
        throw new AssetDomainError(
          'NOT_FOUND',
          'Linked Asset or Expense was not found in this organization.',
        );
      throw error;
    }
  });
}

export async function voidMaintenance(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    assetId: string;
    maintenanceId: string;
    reason: string;
  },
) {
  return db.transaction().execute(async (tx) => {
    await lockedAsset(tx, input.organizationId, input.assetId);
    const reason = clean(input.reason, 1000);
    if (!reason || reason.length < 4)
      throw new AssetDomainError(
        'VALIDATION_FAILED',
        'Void reason must contain at least 4 characters.',
      );
    const record = await sql<{
      status: string;
    }>`select status from assets.maintenance_records where organization_id=${input.organizationId} and asset_id=${input.assetId} and id=${input.maintenanceId} for update`.execute(
      tx,
    );
    if (!record.rows[0])
      throw new AssetDomainError('NOT_FOUND', 'Maintenance record was not found.');
    if (record.rows[0].status === 'VOIDED')
      throw new AssetDomainError('CONFLICT', 'Maintenance record is already voided.');
    await sql`update assets.maintenance_records set status='VOIDED',void_reason=${reason},voided_by=${input.actorId}::uuid,voided_at=now() where organization_id=${input.organizationId} and id=${input.maintenanceId}`.execute(
      tx,
    );
    await event(tx, {
      organizationId: input.organizationId,
      assetId: input.assetId,
      actorId: input.actorId,
      type: 'MAINTENANCE_VOIDED',
      summary: reason,
      relatedType: 'assets.maintenance',
      relatedId: input.maintenanceId,
    });
    await audit(tx, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      action: 'assets.maintenance.voided',
      assetId: input.assetId,
      after: { maintenanceId: input.maintenanceId, status: 'VOIDED' },
      reason,
    });
    return { id: input.maintenanceId, status: 'VOIDED' as const };
  });
}

export async function attachAssetMedia(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    assetId: string;
    mediaAssetId: string;
    role: string;
    label?: string;
    idempotencyKey: string;
  },
) {
  return db.transaction().execute(async (tx) => {
    await lockedAsset(tx, input.organizationId, input.assetId);
    const media = await sql<{
      visibility: string;
      status: string;
    }>`select visibility_class as visibility,status from media.media_assets where organization_id=${input.organizationId} and id=${input.mediaAssetId}`.execute(
      tx,
    );
    if (!media.rows[0]) throw new AssetDomainError('NOT_FOUND', 'Media file was not found.');
    if (media.rows[0].visibility !== 'PRIVATE')
      throw new AssetDomainError(
        'VALIDATION_FAILED',
        'Asset documents and photos must use private Media.',
      );
    if (media.rows[0].status !== 'READY')
      throw new AssetDomainError('CONFLICT', 'Media file is not ready yet.');
    const c = await claim(tx, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      operation: 'assets.media.attach',
      key: input.idempotencyKey,
      body: input,
    });
    if (!c.created) {
      const id = await replayId(tx, c.id);
      if (id) return { id };
      throw new AssetDomainError('CONFLICT', 'Document attachment is already being processed.');
    }
    try {
      const r = await sql<{
        id: string;
      }>`insert into assets.media_links (organization_id,asset_id,media_asset_id,role,label,created_by) values (${input.organizationId},${input.assetId}::uuid,${input.mediaAssetId}::uuid,${input.role},${clean(input.label, 160)},${input.actorId}::uuid) returning id`.execute(
        tx,
      );
      const id = r.rows[0]!.id;
      await sql`insert into media.media_usage_projection (organization_id,asset_id,domain,usage_type,entity_id,relationship_id,label) values (${input.organizationId},${input.mediaAssetId}::uuid,'assets',${input.role},${input.assetId}::uuid,${id}::uuid,${clean(input.label, 160)}) on conflict do nothing`.execute(
        tx,
      );
      await sql`insert into media.media_usage_history (organization_id,asset_id,action,domain,usage_type,entity_id,relationship_id,actor_id) values (${input.organizationId},${input.mediaAssetId}::uuid,'ATTACHED','assets',${input.role},${input.assetId}::uuid,${id}::uuid,${input.actorId}::uuid)`.execute(
        tx,
      );
      await event(tx, {
        organizationId: input.organizationId,
        assetId: input.assetId,
        actorId: input.actorId,
        type: 'DOCUMENT_ATTACHED',
        summary: `${input.role.toLowerCase().replaceAll('_', ' ')} attached.`,
        relatedType: 'media.asset',
        relatedId: input.mediaAssetId,
      });
      await finish(tx, c.id, 'assets.media_link', id);
      return { id };
    } catch (error) {
      if ((error as { code?: string }).code === '23505')
        throw new AssetDomainError(
          'CONFLICT',
          'This file is already attached with the selected role.',
        );
      throw error;
    }
  });
}

export async function detachAssetMedia(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    assetId: string;
    linkId: string;
    reason: string;
  },
) {
  return db.transaction().execute(async (tx) => {
    await lockedAsset(tx, input.organizationId, input.assetId);
    const reason = clean(input.reason, 1000);
    if (!reason || reason.length < 4)
      throw new AssetDomainError(
        'VALIDATION_FAILED',
        'Detach reason must contain at least 4 characters.',
      );
    const link = await sql<{
      media_asset_id: string;
      role: string;
    }>`select media_asset_id,role from assets.media_links where organization_id=${input.organizationId} and asset_id=${input.assetId} and id=${input.linkId} for update`.execute(
      tx,
    );
    if (!link.rows[0]) throw new AssetDomainError('NOT_FOUND', 'Asset file link was not found.');
    await sql`delete from media.media_usage_projection where organization_id=${input.organizationId} and asset_id=${link.rows[0].media_asset_id} and domain='assets' and entity_id=${input.assetId} and relationship_id=${input.linkId}`.execute(
      tx,
    );
    await sql`delete from assets.media_links where organization_id=${input.organizationId} and id=${input.linkId}`.execute(
      tx,
    );
    await sql`insert into media.media_usage_history (organization_id,asset_id,action,domain,usage_type,entity_id,relationship_id,actor_id) values (${input.organizationId},${link.rows[0].media_asset_id}::uuid,'DETACHED','assets',${link.rows[0].role},${input.assetId}::uuid,${input.linkId}::uuid,${input.actorId}::uuid)`.execute(
      tx,
    );
    await event(tx, {
      organizationId: input.organizationId,
      assetId: input.assetId,
      actorId: input.actorId,
      type: 'DOCUMENT_DETACHED',
      summary: reason,
      relatedType: 'media.asset',
      relatedId: link.rows[0].media_asset_id,
    });
    await audit(tx, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      action: 'assets.media.detached',
      assetId: input.assetId,
      after: { mediaAssetId: link.rows[0].media_asset_id, role: link.rows[0].role },
      reason,
    });
    return { id: input.linkId };
  });
}

export async function disposeAsset(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    assetId: string;
    reason: string;
    occurredAt: string;
    expectedVersion: number;
    idempotencyKey: string;
  },
) {
  return db.transaction().execute(async (tx) => {
    const a = await lockedAsset(tx, input.organizationId, input.assetId);
    if (TERMINAL.has(a.status))
      throw new AssetDomainError('CONFLICT', 'Asset already has a final lifecycle state.');
    const reason = clean(input.reason, 1000);
    if (!reason || reason.length < 4)
      throw new AssetDomainError(
        'VALIDATION_FAILED',
        'Disposal reason must contain at least 4 characters.',
      );
    const c = await claim(tx, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      operation: 'assets.asset.dispose',
      key: input.idempotencyKey,
      body: input,
    });
    if (!c.created) {
      const id = await replayId(tx, c.id);
      if (id) return { id };
      throw new AssetDomainError('CONFLICT', 'Disposal is already being processed.');
    }
    const r = await sql<{
      version: string;
    }>`update assets.assets set status='DISPOSED',disposal_reason=${reason},custodian_membership_id=null,updated_at=now(),version=version+1 where organization_id=${input.organizationId} and id=${input.assetId} and version=${input.expectedVersion} returning version::text`.execute(
      tx,
    );
    if (!r.rows[0]) throw new AssetDomainError('CONFLICT', 'Asset changed since it was loaded.');
    await event(tx, {
      organizationId: input.organizationId,
      assetId: input.assetId,
      actorId: input.actorId,
      type: 'DISPOSED',
      summary: reason,
      before: { status: a.status },
      after: { status: 'DISPOSED' },
      occurredAt: input.occurredAt,
    });
    await audit(tx, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      action: 'assets.asset.disposed',
      assetId: input.assetId,
      before: { status: a.status },
      after: { status: 'DISPOSED' },
      reason,
    });
    await emit(
      tx,
      input.organizationId,
      input.assetId,
      'assets.asset.disposed',
      Number(r.rows[0].version),
    );
    await finish(tx, c.id, 'assets.asset', input.assetId);
    return { id: input.assetId };
  });
}

export async function sellAsset(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    assetId: string;
    accountId: string;
    amount: string;
    occurredAt: string;
    buyerReference?: string;
    note?: string;
    expectedVersion: number;
    idempotencyKey: string;
  },
) {
  return db.transaction().execute(async (tx) => {
    const a = await lockedAsset(tx, input.organizationId, input.assetId);
    if (TERMINAL.has(a.status))
      throw new AssetDomainError('CONFLICT', 'Asset already has a final lifecycle state.');
    const amount = money(input.amount);
    if (!amount || Number(amount) <= 0)
      throw new AssetDomainError('VALIDATION_FAILED', 'Sale amount must be greater than zero.');
    const account = await sql<{
      id: string;
      name: string;
      currency: string;
      status: string;
    }>`select id,name,currency_code as currency,status from finance.financial_accounts where organization_id=${input.organizationId} and id=${input.accountId} for update`.execute(
      tx,
    );
    if (!account.rows[0])
      throw new AssetDomainError('NOT_FOUND', 'Financial Account was not found.');
    if (account.rows[0].status !== 'ACTIVE')
      throw new AssetDomainError('CONFLICT', 'Financial Account is inactive.');
    const c = await claim(tx, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      operation: 'assets.asset.sell',
      key: input.idempotencyKey,
      body: input,
    });
    if (!c.created) {
      const id = await replayId(tx, c.id);
      if (id) return { id };
      throw new AssetDomainError('CONFLICT', 'Asset sale is already being processed.');
    }
    const number = await nextFinanceNumber(tx, input.organizationId);
    const transaction = await sql<{
      id: string;
    }>`insert into finance.finance_transactions (organization_id,transaction_number,transaction_type,occurred_at,description,source_domain,source_id,created_by) values (${input.organizationId},${number},'ASSET_SALE',${input.occurredAt}::timestamptz,${`Sale of ${a.asset_code} — ${a.name}`},'assets.asset',${input.assetId}::uuid,${input.actorId}::uuid) returning id`.execute(
      tx,
    );
    const transactionId = transaction.rows[0]!.id;
    await sql`insert into finance.financial_account_entries (organization_id,finance_transaction_id,financial_account_id,amount_delta,currency_code) values (${input.organizationId},${transactionId}::uuid,${input.accountId}::uuid,${amount}::numeric,${account.rows[0].currency})`.execute(
      tx,
    );
    const r = await sql<{
      version: string;
    }>`update assets.assets set status='SOLD',sold_at=${input.occurredAt}::timestamptz,sale_finance_transaction_id=${transactionId}::uuid,custodian_membership_id=null,updated_at=now(),version=version+1 where organization_id=${input.organizationId} and id=${input.assetId} and version=${input.expectedVersion} returning version::text`.execute(
      tx,
    );
    if (!r.rows[0]) throw new AssetDomainError('CONFLICT', 'Asset changed since it was loaded.');
    await event(tx, {
      organizationId: input.organizationId,
      assetId: input.assetId,
      actorId: input.actorId,
      type: 'SOLD',
      summary: `Asset sold for ${amount} ${account.rows[0].currency}.${clean(input.note, 1000) ? ` ${clean(input.note, 1000)}` : ''}`,
      before: { status: a.status },
      after: {
        status: 'SOLD',
        amount,
        accountId: input.accountId,
        buyerReference: clean(input.buyerReference, 200),
      },
      relatedType: 'finance.transaction',
      relatedId: transactionId,
      occurredAt: input.occurredAt,
    });
    await audit(tx, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      action: 'assets.asset.sold',
      assetId: input.assetId,
      before: { status: a.status },
      after: {
        status: 'SOLD',
        amount,
        accountId: input.accountId,
        financeTransactionId: transactionId,
      },
    });
    await emit(
      tx,
      input.organizationId,
      input.assetId,
      'assets.asset.sold',
      Number(r.rows[0].version),
      { financeTransactionId: transactionId, amount, currencyCode: account.rows[0].currency },
    );
    await finish(tx, c.id, 'assets.asset', input.assetId);
    return { id: input.assetId, financeTransactionId: transactionId };
  });
}

interface AssetDetailRow {
  id: string;
  asset_code: string;
  name: string;
  category_id: string | null;
  category_name: string | null;
  description: string | null;
  brand: string | null;
  model: string | null;
  serial_number: string | null;
  status: 'ACTIVE' | 'IN_STORAGE' | 'UNDER_REPAIR' | 'DAMAGED' | 'LOST' | 'SOLD' | 'DISPOSED';
  condition: 'GOOD' | 'FAIR' | 'NEEDS_REPAIR' | 'DAMAGED';
  location_id: string | null;
  location_name: string | null;
  custom_location: string | null;
  custodian_membership_id: string | null;
  custodian_name: string | null;
  acquisition_date: string;
  acquisition_cost: string | null;
  currency_code: string;
  acquisition_source: 'EXISTING' | 'EXPENSE' | 'PURCHASE' | 'GIFT';
  finance_expense_id: string | null;
  purchase_id: string | null;
  purchase_line_id: string | null;
  warranty_expires_on: string | null;
  notes: string | null;
  sale_finance_transaction_id: string | null;
  created_at: string;
  updated_at: string;
  version: string;
}
interface MaintenanceRow {
  id: string;
  type: 'INSPECTION' | 'SERVICE' | 'REPAIR' | 'PART_REPLACEMENT';
  occurred_on: string;
  issue: string | null;
  work_performed: string;
  service_provider: string | null;
  finance_expense_id: string | null;
  expense_number: string | null;
  expense_amount: string | null;
  next_service_on: string | null;
  notes: string | null;
  created_at: string;
  status: 'ACTIVE' | 'VOIDED';
  void_reason: string | null;
}
interface AssetMediaRow {
  id: string;
  media_asset_id: string;
  role:
    | 'PHOTO'
    | 'PURCHASE_RECEIPT'
    | 'INVOICE'
    | 'WARRANTY'
    | 'REPAIR_RECEIPT'
    | 'SERIAL_PHOTO'
    | 'OTHER';
  label: string | null;
  original_filename: string;
  asset_type: 'IMAGE' | 'DOCUMENT';
  created_at: string;
}
interface AssetEventRow {
  id: string;
  event_type: string;
  summary: string;
  before_state: Record<string, unknown> | null;
  after_state: Record<string, unknown> | null;
  occurred_at: string;
  actor_name: string | null;
}
interface AcquisitionExpenseRow {
  id: string;
  expense_number: string;
  amount: string;
  status: string;
}
interface AcquisitionPurchaseRow {
  id: string;
  purchase_number: string;
  supplier_name: string;
  status: string;
}
interface AcquisitionLineRow {
  id: string;
  product_title_snapshot: string;
  sku_snapshot: string;
}
interface AcquisitionPaymentRow {
  id: string;
  amount: string;
  payment_source: 'BUSINESS_ACCOUNT' | 'OWNER_CAPITAL' | 'REVERSAL';
  capital_contributor_id: string | null;
  contributor_name: string | null;
  paid_at: string;
  financial_account_id: string | null;
  account_name: string | null;
}
interface AssetSaleRow {
  id: string;
  amount: string;
  currency_code: string;
  financial_account_id: string;
  account_name: string;
  occurred_at: string;
}

export async function getAssetDetail(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  assetId: string,
) {
  const base =
    await sql<AssetDetailRow>`select asset.*,asset.acquisition_date::text,asset.acquisition_cost::text,asset.warranty_expires_on::text,asset.created_at::text,asset.updated_at::text,asset.version::text,category.name as category_name,location.name as location_name,coalesce(membership.display_name,user_account.name,user_account.email) as custodian_name from assets.assets asset left join assets.categories category on category.id=asset.category_id left join warehouse.locations location on location.id=asset.location_id left join iam.organization_memberships membership on membership.id=asset.custodian_membership_id left join iam.users user_account on user_account.id=membership.user_id where asset.organization_id=${organizationId} and asset.id=${assetId}`.execute(
      db,
    );
  const a = base.rows[0];
  if (!a) throw new AssetDomainError('NOT_FOUND', 'Asset was not found.');
  const [maintenance, media, history, expense, purchase, purchaseLine, payments, sale] =
    await Promise.all([
      sql<MaintenanceRow>`select record.id,record.maintenance_type as type,record.occurred_on::text,record.issue,record.work_performed,record.service_provider,record.finance_expense_id,expense.expense_number,expense.amount::text as expense_amount,record.next_service_on::text,record.notes,record.created_at::text,record.status,record.void_reason from assets.maintenance_records record left join finance.expenses expense on expense.id=record.finance_expense_id where record.organization_id=${organizationId} and record.asset_id=${assetId} order by record.occurred_on desc,record.id desc`.execute(
        db,
      ),
      sql<AssetMediaRow>`select link.id,link.media_asset_id,link.role,link.label,media.original_filename,media.asset_type,link.created_at::text from assets.media_links link join media.media_assets media on media.id=link.media_asset_id where link.organization_id=${organizationId} and link.asset_id=${assetId} order by link.created_at desc`.execute(
        db,
      ),
      sql<AssetEventRow>`select event.id,event.event_type,event.summary,event.before_state,event.after_state,event.occurred_at::text,user_account.name as actor_name from assets.events event left join iam.users user_account on user_account.id=event.actor_id where event.organization_id=${organizationId} and event.asset_id=${assetId} order by event.occurred_at desc,event.id desc limit 200`.execute(
        db,
      ),
      sql<AcquisitionExpenseRow>`select id,expense_number,amount::text,status from finance.expenses where organization_id=${organizationId} and (id=${a.finance_expense_id ?? null}::uuid or (source_domain='procurement.purchase' and source_id=${a.purchase_id ?? null}::uuid)) order by (id=${a.finance_expense_id ?? null}::uuid) desc limit 1`.execute(
        db,
      ),
      a.purchase_id
        ? sql<AcquisitionPurchaseRow>`select purchase.id,purchase.purchase_number,supplier.name as supplier_name,purchase.status from procurement.purchases purchase join procurement.suppliers supplier on supplier.id=purchase.supplier_id where purchase.organization_id=${organizationId} and purchase.id=${a.purchase_id}`.execute(
            db,
          )
        : Promise.resolve({ rows: [] }),
      a.purchase_line_id
        ? sql<AcquisitionLineRow>`select id,product_title_snapshot,sku_snapshot from procurement.purchase_lines where organization_id=${organizationId} and id=${a.purchase_line_id}`.execute(
            db,
          )
        : Promise.resolve({ rows: [] }),
      sql<AcquisitionPaymentRow>`select payment.id,payment.amount::text,payment.payment_source,payment.capital_contributor_id,contributor.display_name as contributor_name,payment.paid_at::text,entry.financial_account_id,account.name as account_name from finance.expense_payments payment join finance.expenses expense on expense.id=payment.expense_id left join finance.capital_contributors contributor on contributor.id=payment.capital_contributor_id left join finance.financial_account_entries entry on entry.organization_id=payment.organization_id and entry.finance_transaction_id=payment.finance_transaction_id left join finance.financial_accounts account on account.id=entry.financial_account_id where payment.organization_id=${organizationId} and (expense.id=${a.finance_expense_id ?? null}::uuid or (expense.source_domain='procurement.purchase' and expense.source_id=${a.purchase_id ?? null}::uuid)) order by payment.paid_at`.execute(
        db,
      ),
      a.sale_finance_transaction_id
        ? sql<AssetSaleRow>`select transaction.id,entry.amount_delta::text as amount,entry.currency_code,entry.financial_account_id,account.name as account_name,transaction.occurred_at::text from finance.finance_transactions transaction join finance.financial_account_entries entry on entry.finance_transaction_id=transaction.id join finance.financial_accounts account on account.id=entry.financial_account_id where transaction.organization_id=${organizationId} and transaction.id=${a.sale_finance_transaction_id}`.execute(
            db,
          )
        : Promise.resolve({ rows: [] }),
    ]);
  const e = expense.rows[0],
    p = purchase.rows[0],
    pl = purchaseLine.rows[0],
    s = sale.rows[0];
  return {
    id: a.id,
    assetCode: a.asset_code,
    name: a.name,
    categoryId: a.category_id,
    categoryName: a.category_name,
    description: a.description,
    brand: a.brand,
    model: a.model,
    serialNumber: a.serial_number,
    status: a.status,
    condition: a.condition,
    locationId: a.location_id,
    locationName: a.location_name,
    customLocation: a.custom_location,
    custodianMembershipId: a.custodian_membership_id,
    custodianName: a.custodian_name,
    acquisitionDate: a.acquisition_date,
    acquisitionCost: a.acquisition_cost,
    currencyCode: a.currency_code,
    acquisitionSource: a.acquisition_source,
    warrantyExpiresOn: a.warranty_expires_on,
    notes: a.notes,
    createdAt: a.created_at,
    updatedAt: a.updated_at,
    version: Number(a.version),
    financial: {
      acquisitionSource: a.acquisition_source,
      expense: e
        ? { id: e.id, number: e.expense_number, amount: e.amount, status: e.status }
        : null,
      purchase: p
        ? { id: p.id, number: p.purchase_number, supplierName: p.supplier_name, status: p.status }
        : null,
      purchaseLine: pl
        ? { id: pl.id, title: pl.product_title_snapshot, sku: pl.sku_snapshot }
        : null,
      payments: payments.rows.map((x) => ({
        id: x.id,
        amount: x.amount,
        source: x.payment_source,
        accountId: x.financial_account_id,
        accountName: x.account_name,
        contributorId: x.capital_contributor_id,
        contributorName: x.contributor_name,
        paidAt: x.paid_at,
      })),
      sale: s
        ? {
            transactionId: s.id,
            amount: s.amount,
            currencyCode: s.currency_code,
            accountId: s.financial_account_id,
            accountName: s.account_name,
            occurredAt: s.occurred_at,
          }
        : null,
    },
    maintenance: maintenance.rows.map((x) => ({
      id: x.id,
      type: x.type,
      occurredOn: x.occurred_on,
      issue: x.issue,
      workPerformed: x.work_performed,
      serviceProvider: x.service_provider,
      expenseId: x.finance_expense_id,
      expenseNumber: x.expense_number,
      expenseAmount: x.expense_amount,
      nextServiceOn: x.next_service_on,
      notes: x.notes,
      createdAt: x.created_at,
      status: x.status,
      voidReason: x.void_reason,
    })),
    media: media.rows.map((x) => ({
      id: x.id,
      mediaAssetId: x.media_asset_id,
      role: x.role,
      label: x.label,
      filename: x.original_filename,
      assetType: x.asset_type,
      createdAt: x.created_at,
    })),
    history: history.rows.map((x) => ({
      id: x.id,
      type: x.event_type,
      summary: x.summary,
      beforeState: x.before_state,
      afterState: x.after_state,
      occurredAt: x.occurred_at,
      actorName: x.actor_name,
    })),
  };
}
