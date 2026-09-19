import { sql } from 'kysely';
import { slugify } from '../helpers/slug.js';
import { productTypeAttributeSeedData } from '../data/product-type-attributes.js';
import type { SeedContext, SeedModule, SeedModuleResult } from '../types.js';

export const productTypeAttributesSeedModule: SeedModule = {
  id: 'product-type-attributes', name: 'Product Type Attributes', scope: 'bootstrap',
  description: 'Optional structured fields and controlled values for canonical Product Types',
  dependencies: ['product-types'],
  async run(context: SeedContext): Promise<SeedModuleResult> {
    const types = await sql<{ id: string; code: string }>`select id::text,code from catalog.product_types where organization_id=${context.organizationId} and status='ACTIVE'`.execute(context.db);
    const typeByCode = new Map(types.rows.map((row) => [row.code, row.id]));
    let createdCount = 0; let unchangedCount = 0;
    for (const item of productTypeAttributeSeedData) {
      const typeId = typeByCode.get(item.productTypeCode);
      if (!typeId) throw new Error(`Product Type "${item.productTypeCode}" is unavailable.`);
      const existing = await sql<{ id: string; value_type: string; scope: string }>`select id::text,value_type,scope from catalog.attribute_definitions where organization_id=${context.organizationId} and code=${item.code}`.execute(context.db);
      const attribute = existing.rows[0];
      let attributeId: string;
      if (!attribute) {
        const inserted = await sql<{ id: string }>`insert into catalog.attribute_definitions (organization_id,code,name,value_type,scope,is_filterable,is_searchable)
          values (${context.organizationId},${item.code},${item.name},${item.valueType},${item.scope},${item.filterable ?? false},false) returning id::text`.execute(context.db);
        attributeId = inserted.rows[0]!.id; createdCount += 1;
        for (const [position, label] of (item.options ?? []).entries()) {
          await sql`insert into catalog.attribute_reference_options (organization_id,attribute_definition_id,code,label,position)
            values (${context.organizationId},${attributeId}::uuid,${slugify(label)},${label},${position})`.execute(context.db);
        }
      } else {
        if (attribute.value_type !== item.valueType || attribute.scope !== item.scope)
          throw new Error(`Attribute "${item.code}" has an incompatible existing definition.`);
        attributeId = attribute.id; unchangedCount += 1;
      }
      const binding = await sql`insert into catalog.product_type_attributes (organization_id,product_type_id,attribute_definition_id,is_required)
        values (${context.organizationId},${typeId}::uuid,${attributeId}::uuid,false) on conflict (organization_id,product_type_id,attribute_definition_id) do nothing`.execute(context.db);
      if (Number(binding.numAffectedRows ?? 0) > 0) createdCount += 1; else unchangedCount += 1;
    }
    return { moduleId: 'product-type-attributes', moduleName: 'Product Type Attributes', totalCount: productTypeAttributeSeedData.length, createdCount, updatedCount: 0, unchangedCount, failedCount: 0 };
  },
};
