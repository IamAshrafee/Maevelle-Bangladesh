import { sql, type Kysely } from 'kysely';

import type { DatabaseSchema } from '../index.js';
import { MediaDomainError } from './types.js';

export async function attachMediaToProduct(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    actorId?: string;
    productId: string;
    assetId: string;
    role: 'GALLERY' | 'THUMBNAIL' | 'COLOR_GALLERY' | 'SIZE_DIAGRAM';
    position?: number;
    variantId?: string;
    optionValueId?: string;
    isPrimary?: boolean;
    altTextOverride?: string | null;
  },
): Promise<void> {
  if (input.variantId && input.optionValueId)
    throw new MediaDomainError(
      'VALIDATION_FAILED',
      'Choose either a Variant gallery or an option-value gallery, not both.',
    );
  await db.transaction().execute(async (transaction) => {
    const asset = await sql<{ id: string }>`select id::text from media.media_assets
      where id=${input.assetId}::uuid and organization_id=${input.organizationId}
        and asset_type='IMAGE' and status='READY' and visibility_class='PUBLIC' for share`.execute(
      transaction,
    );
    if (!asset.rows[0])
      throw new MediaDomainError(
        'MEDIA_NOT_READY',
        'Only ready public image assets can be used by Products.',
      );
    const product = await sql<{ id: string }>`select id::text from catalog.products
      where id=${input.productId}::uuid and organization_id=${input.organizationId} for update`.execute(
      transaction,
    );
    if (!product.rows[0]) throw new MediaDomainError('NOT_FOUND', 'Product was not found.');
    if (input.variantId) {
      const variant = await sql<{ id: string }>`select id::text from catalog.product_variants
        where id=${input.variantId}::uuid and product_id=${input.productId}::uuid
          and organization_id=${input.organizationId}`.execute(transaction);
      if (!variant.rows[0])
        throw new MediaDomainError(
          'VALIDATION_FAILED',
          'Variant is not available for this Product.',
        );
    }
    if (input.optionValueId) {
      const value = await sql<{
        id: string;
      }>`select value.id::text from catalog.product_option_values value
        join catalog.product_option_axes axis on axis.organization_id=value.organization_id
          and axis.id=value.option_axis_id where value.organization_id=${input.organizationId}
          and value.id=${input.optionValueId}::uuid and axis.product_id=${input.productId}::uuid`.execute(
        transaction,
      );
      if (!value.rows[0])
        throw new MediaDomainError(
          'VALIDATION_FAILED',
          'Option value is not available for this Product.',
        );
    }
    if (input.isPrimary)
      await sql`update catalog.product_media set is_primary=false,updated_at=now()
        where organization_id=${input.organizationId} and product_id=${input.productId}::uuid
          and variant_id is not distinct from ${input.variantId ?? null}::uuid
          and option_value_id is not distinct from ${input.optionValueId ?? null}::uuid`.execute(
        transaction,
      );
    const placement = await sql<{ id: string }>`insert into catalog.product_media(
      organization_id,product_id,variant_id,option_value_id,asset_id,role,is_primary,position,
      alt_text_override
    ) values (${input.organizationId},${input.productId},${input.variantId ?? null},
      ${input.optionValueId ?? null},${input.assetId},${input.role},${input.isPrimary ?? false},
      ${input.position ?? 0},${input.altTextOverride ?? null})
    on conflict (organization_id,product_id,coalesce(variant_id,'00000000-0000-0000-0000-000000000000'::uuid),
      coalesce(option_value_id,'00000000-0000-0000-0000-000000000000'::uuid),asset_id,role)
    do update set position=excluded.position,is_primary=excluded.is_primary,
      alt_text_override=excluded.alt_text_override,updated_at=now()
    returning id::text`.execute(transaction);
    const placementId = placement.rows[0]!.id;
    await sql`insert into media.media_usage_projection(
      organization_id,asset_id,domain,usage_type,entity_id,relationship_id,label
    ) select ${input.organizationId},${input.assetId},'catalog','PRODUCT_MEDIA',product.id,
      ${placementId}::uuid,product.title from catalog.products product
      where product.id=${input.productId}::uuid and product.organization_id=${input.organizationId}
      on conflict do nothing`.execute(transaction);
    await sql`insert into media.media_usage_history(
      organization_id,asset_id,action,domain,usage_type,entity_id,relationship_id,actor_id
    ) values (${input.organizationId},${input.assetId},'ATTACHED','catalog','PRODUCT_MEDIA',
      ${input.productId},${placementId},${input.actorId ?? null})`.execute(transaction);
  });
}

export async function detachMediaFromProduct(
  db: Kysely<DatabaseSchema>,
  input: { organizationId: string; actorId?: string; productId: string; productMediaId: string },
): Promise<void> {
  await db.transaction().execute(async (transaction) => {
    const removed = await sql<{ asset_id: string }>`delete from catalog.product_media
      where id=${input.productMediaId}::uuid and product_id=${input.productId}::uuid
        and organization_id=${input.organizationId} returning asset_id::text`.execute(transaction);
    const row = removed.rows[0];
    if (!row) throw new MediaDomainError('NOT_FOUND', 'Product media placement was not found.');
    await sql`delete from media.media_usage_projection where organization_id=${input.organizationId}
      and relationship_id=${input.productMediaId}::uuid and domain='catalog'`.execute(transaction);
    await sql`insert into media.media_usage_history(
      organization_id,asset_id,action,domain,usage_type,entity_id,relationship_id,actor_id
    ) values (${input.organizationId},${row.asset_id},'DETACHED','catalog','PRODUCT_MEDIA',
      ${input.productId},${input.productMediaId},${input.actorId ?? null})`.execute(transaction);
  });
}
