import { sql, type Kysely } from 'kysely';

import { CatalogDomainError } from './catalog.js';
import type { DatabaseSchema } from './index.js';
import { appendAuditEvent } from './platform.js';

export type CatalogAttributeValueType =
  'TEXT' | 'INTEGER' | 'DECIMAL' | 'BOOLEAN' | 'DATE' | 'REFERENCE';
export type CatalogAttributeScope = 'PRODUCT' | 'VARIANT';
export type CatalogDefinitionStatus = 'ACTIVE' | 'ARCHIVED';

export interface CatalogReferenceOptionView {
  readonly id: string;
  readonly code: string;
  readonly label: string;
  readonly status: CatalogDefinitionStatus;
  readonly position: number;
  readonly version: number;
  readonly selectionCount: number;
}

export interface CatalogAttributeDefinitionView {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly valueType: CatalogAttributeValueType;
  readonly scope: CatalogAttributeScope;
  readonly status: CatalogDefinitionStatus;
  readonly required: boolean;
  readonly filterable: boolean;
  readonly searchable: boolean;
  readonly version: number;
  readonly valueCount: number;
  readonly referenceOptions: readonly CatalogReferenceOptionView[];
}

export interface CatalogProductTypeDefinitionView {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly status: CatalogDefinitionStatus;
  readonly version: number;
  readonly productCount: number;
  readonly attributes: readonly CatalogAttributeDefinitionView[];
}

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function identity(name: string, code: string): { name: string; code: string } {
  const normalizedName = name.trim();
  const normalizedCode = code.trim().toLowerCase();
  if (!normalizedName) throw new CatalogDomainError('VALIDATION_FAILED', 'Name is required.');
  if (!slugPattern.test(normalizedCode))
    throw new CatalogDomainError(
      'VALIDATION_FAILED',
      'Code must contain lowercase letters, numbers, and single hyphens only.',
    );
  return { name: normalizedName, code: normalizedCode };
}

async function emitDefinitionEvent(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    action: string;
    targetType: string;
    targetId: string;
    aggregateVersion: number;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await appendAuditEvent(db, {
    organizationId: input.organizationId,
    actorType: 'USER',
    actorId: input.actorId,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId,
    metadata: input.metadata,
  });
  await sql`
    insert into platform.outbox_events
      (organization_id,event_type,event_version,aggregate_type,aggregate_id,aggregate_version,payload,occurred_at)
    values
      (${input.organizationId},${input.action},1,${input.targetType},${input.targetId},
       ${input.aggregateVersion},${JSON.stringify({ id: input.targetId, ...input.metadata })}::jsonb,now())
  `.execute(db);
}

export async function listManagedCatalogProductTypes(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
): Promise<readonly CatalogProductTypeDefinitionView[]> {
  const [types, attributes, options] = await Promise.all([
    sql<{
      id: string;
      code: string;
      name: string;
      status: CatalogDefinitionStatus;
      version: string;
      product_count: string;
    }>`
      select type.id::text,type.code,type.name,type.status,type.version::text,
        count(product.id)::text product_count
      from catalog.product_types type
      left join catalog.products product
        on product.organization_id=type.organization_id and product.product_type_id=type.id
      where type.organization_id=${organizationId}
      group by type.id,type.code,type.name,type.status,type.version
      order by type.status,type.name,type.id
    `.execute(db),
    sql<{
      product_type_id: string;
      id: string;
      code: string;
      name: string;
      value_type: CatalogAttributeValueType;
      scope: CatalogAttributeScope;
      status: CatalogDefinitionStatus;
      is_required: boolean;
      is_filterable: boolean;
      is_searchable: boolean;
      version: string;
      value_count: string;
    }>`
      select binding.product_type_id::text,definition.id::text,definition.code,definition.name,
        definition.value_type,definition.scope,definition.status,binding.is_required,
        definition.is_filterable,definition.is_searchable,definition.version::text,
        (select count(*) from catalog.product_attribute_values value
          where value.organization_id=definition.organization_id
            and value.attribute_definition_id=definition.id)
        + (select count(*) from catalog.variant_attribute_values value
          where value.organization_id=definition.organization_id
            and value.attribute_definition_id=definition.id) as value_count
      from catalog.product_type_attributes binding
      join catalog.attribute_definitions definition
        on definition.organization_id=binding.organization_id
        and definition.id=binding.attribute_definition_id
      where binding.organization_id=${organizationId}
      order by definition.status,binding.is_required desc,definition.name,definition.id
    `.execute(db),
    sql<{
      attribute_definition_id: string;
      id: string;
      code: string;
      label: string;
      status: CatalogDefinitionStatus;
      position: number;
      version: string;
      selection_count: string;
    }>`
      select option.attribute_definition_id::text,option.id::text,option.code,option.label,
        option.status,option.position,option.version::text,
        (select count(*) from catalog.product_attribute_values value
          where value.organization_id=option.organization_id and value.value_reference_id=option.id)
        + (select count(*) from catalog.variant_attribute_values value
          where value.organization_id=option.organization_id and value.value_reference_id=option.id)
          as selection_count
      from catalog.attribute_reference_options option
      where option.organization_id=${organizationId}
      order by option.status,option.position,option.label,option.id
    `.execute(db),
  ]);
  return types.rows.map((type) => ({
    id: type.id,
    code: type.code,
    name: type.name,
    status: type.status,
    version: Number(type.version),
    productCount: Number(type.product_count),
    attributes: attributes.rows
      .filter((attribute) => attribute.product_type_id === type.id)
      .map((attribute) => ({
        id: attribute.id,
        code: attribute.code,
        name: attribute.name,
        valueType: attribute.value_type,
        scope: attribute.scope,
        status: attribute.status,
        required: attribute.is_required,
        filterable: attribute.is_filterable,
        searchable: attribute.is_searchable,
        version: Number(attribute.version),
        valueCount: Number(attribute.value_count),
        referenceOptions: options.rows
          .filter((option) => option.attribute_definition_id === attribute.id)
          .map((option) => ({
            id: option.id,
            code: option.code,
            label: option.label,
            status: option.status,
            position: option.position,
            version: Number(option.version),
            selectionCount: Number(option.selection_count),
          })),
      })),
  }));
}

export async function createManagedCatalogProductType(
  db: Kysely<DatabaseSchema>,
  input: { organizationId: string; actorId: string; code: string; name: string },
): Promise<{ id: string }> {
  const normalized = identity(input.name, input.code);
  return db.transaction().execute(async (transaction) => {
    const created = await sql<{ id: string }>`
      insert into catalog.product_types (organization_id,code,name)
      values (${input.organizationId},${normalized.code},${normalized.name}) returning id::text
    `.execute(transaction);
    const id = created.rows[0]!.id;
    await emitDefinitionEvent(transaction, {
      ...input,
      action: 'catalog.product_type.created',
      targetType: 'catalog.product_type',
      targetId: id,
      aggregateVersion: 1,
      metadata: { code: normalized.code },
    });
    return { id };
  });
}

export async function updateManagedCatalogProductType(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    productTypeId: string;
    expectedVersion: number;
    name: string;
    status: CatalogDefinitionStatus;
  },
): Promise<void> {
  const name = input.name.trim();
  if (!name) throw new CatalogDomainError('VALIDATION_FAILED', 'Name is required.');
  await db.transaction().execute(async (transaction) => {
    if (input.status === 'ARCHIVED') {
      const used = await sql<{ found: boolean }>`
        select exists(select 1 from catalog.products
          where organization_id=${input.organizationId}
            and product_type_id=${input.productTypeId}::uuid and status<>'ARCHIVED') found
      `.execute(transaction);
      if (used.rows[0]?.found)
        throw new CatalogDomainError(
          'CONFLICT',
          'Archive or reclassify active Products before archiving this Product Type.',
        );
    }
    const updated = await sql<{ version: string }>`
      update catalog.product_types set name=${name},status=${input.status},
        version=version+1,updated_at=now()
      where organization_id=${input.organizationId} and id=${input.productTypeId}::uuid
        and version=${input.expectedVersion}
      returning version::text
    `.execute(transaction);
    const row = updated.rows[0];
    if (!row) {
      const exists = await sql<{ found: boolean }>`select exists(select 1 from catalog.product_types
        where organization_id=${input.organizationId} and id=${input.productTypeId}::uuid) found`.execute(
        transaction,
      );
      throw new CatalogDomainError(
        exists.rows[0]?.found ? 'STALE_VERSION' : 'NOT_FOUND',
        exists.rows[0]?.found
          ? 'Product Type changed; reload before saving.'
          : 'Product Type was not found.',
      );
    }
    await emitDefinitionEvent(transaction, {
      ...input,
      action: 'catalog.product_type.updated',
      targetType: 'catalog.product_type',
      targetId: input.productTypeId,
      aggregateVersion: Number(row.version),
      metadata: { status: input.status },
    });
  });
}

export async function createManagedCatalogAttribute(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    productTypeId: string;
    code: string;
    name: string;
    valueType: CatalogAttributeValueType;
    scope: CatalogAttributeScope;
    required?: boolean;
    filterable?: boolean;
    searchable?: boolean;
    referenceOptions?: readonly { code: string; label: string; position?: number }[];
  },
): Promise<{ id: string }> {
  const normalized = identity(input.name, input.code);
  const referenceOptions = input.referenceOptions ?? [];
  if (input.valueType === 'REFERENCE' && referenceOptions.length === 0)
    throw new CatalogDomainError(
      'VALIDATION_FAILED',
      'Reference attributes need at least one selectable option.',
    );
  if (input.valueType !== 'REFERENCE' && referenceOptions.length > 0)
    throw new CatalogDomainError(
      'VALIDATION_FAILED',
      'Only reference attributes can have selector options.',
    );
  const normalizedOptions = referenceOptions.map((option) => ({
    ...identity(option.label, option.code),
    position: option.position ?? 0,
  }));
  if (new Set(normalizedOptions.map((option) => option.code)).size !== normalizedOptions.length)
    throw new CatalogDomainError('VALIDATION_FAILED', 'Reference option codes must be unique.');

  return db.transaction().execute(async (transaction) => {
    const type = await sql<{ found: boolean }>`select exists(select 1 from catalog.product_types
      where organization_id=${input.organizationId} and id=${input.productTypeId}::uuid
        and status='ACTIVE') found`.execute(transaction);
    if (!type.rows[0]?.found)
      throw new CatalogDomainError('NOT_FOUND', 'Active Product Type was not found.');
    const created = await sql<{ id: string }>`
      insert into catalog.attribute_definitions
        (organization_id,code,name,value_type,scope,is_filterable,is_searchable)
      values (${input.organizationId},${normalized.code},${normalized.name},${input.valueType},
        ${input.scope},${input.filterable ?? false},${input.searchable ?? false})
      returning id::text
    `.execute(transaction);
    const id = created.rows[0]!.id;
    await sql`insert into catalog.product_type_attributes
      (organization_id,product_type_id,attribute_definition_id,is_required)
      values (${input.organizationId},${input.productTypeId}::uuid,${id}::uuid,${input.required ?? false})`.execute(
      transaction,
    );
    for (const option of normalizedOptions)
      await sql`insert into catalog.attribute_reference_options
        (organization_id,attribute_definition_id,code,label,position)
        values (${input.organizationId},${id}::uuid,${option.code},${option.name},${option.position})`.execute(
        transaction,
      );
    await emitDefinitionEvent(transaction, {
      ...input,
      action: 'catalog.attribute.created',
      targetType: 'catalog.attribute_definition',
      targetId: id,
      aggregateVersion: 1,
      metadata: { productTypeId: input.productTypeId, code: normalized.code },
    });
    return { id };
  });
}

export async function updateManagedCatalogAttribute(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    productTypeId: string;
    attributeId: string;
    expectedVersion: number;
    name: string;
    status: CatalogDefinitionStatus;
    required: boolean;
    filterable: boolean;
    searchable: boolean;
  },
): Promise<void> {
  const name = input.name.trim();
  if (!name) throw new CatalogDomainError('VALIDATION_FAILED', 'Name is required.');
  await db.transaction().execute(async (transaction) => {
    const updated = await sql<{ version: string }>`
      update catalog.attribute_definitions definition
      set name=${name},status=${input.status},is_filterable=${input.filterable},
        is_searchable=${input.searchable},version=definition.version+1,updated_at=now()
      from catalog.product_type_attributes binding
      where definition.organization_id=${input.organizationId}
        and definition.id=${input.attributeId}::uuid
        and definition.version=${input.expectedVersion}
        and binding.organization_id=definition.organization_id
        and binding.attribute_definition_id=definition.id
        and binding.product_type_id=${input.productTypeId}::uuid
      returning definition.version::text
    `.execute(transaction);
    const row = updated.rows[0];
    if (!row) {
      const exists = await sql<{ found: boolean }>`select exists(
        select 1 from catalog.attribute_definitions definition
        join catalog.product_type_attributes binding
          on binding.organization_id=definition.organization_id
          and binding.attribute_definition_id=definition.id
        where definition.organization_id=${input.organizationId}
          and definition.id=${input.attributeId}::uuid
          and binding.product_type_id=${input.productTypeId}::uuid) found`.execute(transaction);
      throw new CatalogDomainError(
        exists.rows[0]?.found ? 'STALE_VERSION' : 'NOT_FOUND',
        exists.rows[0]?.found
          ? 'Attribute changed; reload before saving.'
          : 'Product Type attribute was not found.',
      );
    }
    await sql`update catalog.product_type_attributes set is_required=${input.required}
      where organization_id=${input.organizationId}
        and product_type_id=${input.productTypeId}::uuid
        and attribute_definition_id=${input.attributeId}::uuid`.execute(transaction);
    await emitDefinitionEvent(transaction, {
      ...input,
      action: 'catalog.attribute.updated',
      targetType: 'catalog.attribute_definition',
      targetId: input.attributeId,
      aggregateVersion: Number(row.version),
      metadata: { productTypeId: input.productTypeId, status: input.status },
    });
  });
}

async function ensureReferenceAttribute(
  db: Kysely<DatabaseSchema>,
  organizationId: string,
  attributeId: string,
): Promise<void> {
  const attribute = await sql<{ found: boolean }>`select exists(
    select 1 from catalog.attribute_definitions where organization_id=${organizationId}
      and id=${attributeId}::uuid and value_type='REFERENCE') found`.execute(db);
  if (!attribute.rows[0]?.found)
    throw new CatalogDomainError('NOT_FOUND', 'Reference attribute was not found.');
}

export async function createManagedCatalogReferenceOption(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    attributeId: string;
    code: string;
    label: string;
    position?: number;
  },
): Promise<{ id: string }> {
  const normalized = identity(input.label, input.code);
  return db.transaction().execute(async (transaction) => {
    await ensureReferenceAttribute(transaction, input.organizationId, input.attributeId);
    const created = await sql<{ id: string }>`insert into catalog.attribute_reference_options
      (organization_id,attribute_definition_id,code,label,position)
      values (${input.organizationId},${input.attributeId}::uuid,${normalized.code},${normalized.name},
        ${input.position ?? 0}) returning id::text`.execute(transaction);
    const id = created.rows[0]!.id;
    await emitDefinitionEvent(transaction, {
      ...input,
      action: 'catalog.attribute_reference_option.created',
      targetType: 'catalog.attribute_reference_option',
      targetId: id,
      aggregateVersion: 1,
      metadata: { attributeId: input.attributeId, code: normalized.code },
    });
    return { id };
  });
}

export async function updateManagedCatalogReferenceOption(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId: string;
    attributeId: string;
    optionId: string;
    expectedVersion: number;
    label: string;
    status: CatalogDefinitionStatus;
    position: number;
  },
): Promise<void> {
  const label = input.label.trim();
  if (!label) throw new CatalogDomainError('VALIDATION_FAILED', 'Option label is required.');
  await db.transaction().execute(async (transaction) => {
    const updated = await sql<{ version: string }>`update catalog.attribute_reference_options
      set label=${label},status=${input.status},position=${input.position},
        version=version+1,updated_at=now()
      where organization_id=${input.organizationId} and id=${input.optionId}::uuid
        and attribute_definition_id=${input.attributeId}::uuid and version=${input.expectedVersion}
      returning version::text`.execute(transaction);
    const row = updated.rows[0];
    if (!row) {
      const exists = await sql<{ found: boolean }>`select exists(select 1
        from catalog.attribute_reference_options where organization_id=${input.organizationId}
          and id=${input.optionId}::uuid and attribute_definition_id=${input.attributeId}::uuid) found`.execute(
        transaction,
      );
      throw new CatalogDomainError(
        exists.rows[0]?.found ? 'STALE_VERSION' : 'NOT_FOUND',
        exists.rows[0]?.found
          ? 'Reference option changed; reload before saving.'
          : 'Reference option was not found.',
      );
    }
    await emitDefinitionEvent(transaction, {
      ...input,
      action: 'catalog.attribute_reference_option.updated',
      targetType: 'catalog.attribute_reference_option',
      targetId: input.optionId,
      aggregateVersion: Number(row.version),
      metadata: { attributeId: input.attributeId, status: input.status },
    });
  });
}
