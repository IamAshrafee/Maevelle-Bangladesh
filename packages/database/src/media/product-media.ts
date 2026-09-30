import { sql, type Kysely } from 'kysely';

import type { DatabaseSchema } from '../index.js';
import { appendAuditEvent } from '../platform.js';
import { withMediaTransaction } from './transaction.js';
import { MediaDomainError } from './types.js';

export interface ProductMediaPlacementInput {
  readonly id?: string;
  readonly assetId: string;
  readonly role?: 'GALLERY' | 'THUMBNAIL' | 'COLOR_GALLERY' | 'SIZE_DIAGRAM';
  readonly position?: number;
  readonly variantId?: string | null;
  readonly optionValueId?: string | null;
  readonly isPrimary?: boolean;
  readonly altTextOverride?: string | null;
}

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
  await withMediaTransaction(db, async (transaction) => {
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

export async function syncProductMediaPlacements(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    productId: string;
    placements: readonly ProductMediaPlacementInput[];
    actorId?: string;
  },
): Promise<
  readonly { id: string; assetId: string; position: number; isPrimary: boolean; role: string }[]
> {
  for (const p of input.placements) {
    if (p.variantId && p.optionValueId) {
      throw new MediaDomainError(
        'VALIDATION_FAILED',
        'Choose either a Variant gallery or an option-value gallery, not both.',
      );
    }
  }

  return withMediaTransaction(db, async (transaction) => {
    const product = await sql<{
      id: string;
      title: string;
    }>`select id::text, title from catalog.products
      where id=${input.productId}::uuid and organization_id=${input.organizationId} for update`.execute(
      transaction,
    );
    if (!product.rows[0]) throw new MediaDomainError('NOT_FOUND', 'Product was not found.');

    const uniqueAssetIds = [...new Set(input.placements.map((p) => p.assetId))];
    if (uniqueAssetIds.length > 0) {
      const assetList = sql.join(uniqueAssetIds.map((id) => sql`${id}::uuid`));
      const foundAssets = await sql<{
        id: string;
        asset_type: string;
        status: string;
        visibility_class: string;
      }>`select id::text, asset_type, status, visibility_class from media.media_assets
        where organization_id=${input.organizationId} and id in (${assetList}) for share`.execute(
        transaction,
      );
      if (foundAssets.rows.length !== uniqueAssetIds.length) {
        throw new MediaDomainError(
          'NOT_FOUND',
          'One or more media assets were not found in this organization.',
        );
      }
      const invalid = foundAssets.rows.find(
        (a) =>
          a.asset_type !== 'IMAGE' ||
          !['READY', 'ARCHIVED'].includes(a.status) ||
          a.visibility_class !== 'PUBLIC',
      );
      if (invalid) {
        throw new MediaDomainError(
          'MEDIA_NOT_READY',
          'Only ready public image assets can be used by Products.',
        );
      }
    }

    const uniqueVariantIds = [
      ...new Set(input.placements.map((p) => p.variantId).filter((v): v is string => Boolean(v))),
    ];
    if (uniqueVariantIds.length > 0) {
      const varList = sql.join(uniqueVariantIds.map((id) => sql`${id}::uuid`));
      const validVariants = await sql<{ id: string }>`select id::text from catalog.product_variants
        where organization_id=${input.organizationId} and product_id=${input.productId}::uuid
          and id in (${varList})`.execute(transaction);
      if (validVariants.rows.length !== uniqueVariantIds.length) {
        throw new MediaDomainError(
          'VALIDATION_FAILED',
          'One or more Variants do not belong to this Product.',
        );
      }
    }

    const uniqueOptionValueIds = [
      ...new Set(
        input.placements.map((p) => p.optionValueId).filter((v): v is string => Boolean(v)),
      ),
    ];
    if (uniqueOptionValueIds.length > 0) {
      const optList = sql.join(uniqueOptionValueIds.map((id) => sql`${id}::uuid`));
      const validOptions = await sql<{
        id: string;
      }>`select value.id::text from catalog.product_option_values value
        join catalog.product_option_axes axis on axis.organization_id=value.organization_id
          and axis.id=value.option_axis_id where value.organization_id=${input.organizationId}
          and axis.product_id=${input.productId}::uuid and value.id in (${optList})`.execute(
        transaction,
      );
      if (validOptions.rows.length !== uniqueOptionValueIds.length) {
        throw new MediaDomainError(
          'VALIDATION_FAILED',
          'One or more Option Values do not belong to this Product.',
        );
      }
    }

    const existing = await sql<{
      id: string;
      asset_id: string;
      variant_id: string | null;
      option_value_id: string | null;
      role: string;
    }>`select id::text, asset_id::text, variant_id::text, option_value_id::text, role
      from catalog.product_media where organization_id=${input.organizationId}
        and product_id=${input.productId}::uuid for update`.execute(transaction);

    const scopePrimaryAssigned = new Set<string>();
    for (const p of input.placements) {
      if (p.isPrimary) {
        const scopeKey = `${p.variantId ?? 'none'}:${p.optionValueId ?? 'none'}`;
        if (scopePrimaryAssigned.has(scopeKey)) {
          throw new MediaDomainError(
            'CONFLICT',
            'Only one primary media asset is allowed per scope.',
          );
        }
        scopePrimaryAssigned.add(scopeKey);
      }
    }

    const normalizedPlacements = input.placements.map((p, idx) => {
      const isPrimary = Boolean(p.isPrimary);
      return {
        ...p,
        role: p.role ?? (isPrimary ? 'THUMBNAIL' : 'GALLERY'),
        position: p.position ?? idx,
        isPrimary,
      };
    });

    const productLevel = normalizedPlacements.filter((p) => !p.variantId && !p.optionValueId);
    if (productLevel.length > 0 && !productLevel.some((p) => p.isPrimary)) {
      productLevel[0]!.isPrimary = true;
      if (productLevel[0]!.role === 'GALLERY') {
        productLevel[0]!.role = 'THUMBNAIL';
      }
    }

    for (const scopeKey of scopePrimaryAssigned) {
      const [vId, oId] = scopeKey.split(':');
      await sql`update catalog.product_media set is_primary=false, updated_at=now()
        where organization_id=${input.organizationId} and product_id=${input.productId}::uuid
          and variant_id is not distinct from ${vId === 'none' ? null : vId}::uuid
          and option_value_id is not distinct from ${oId === 'none' ? null : oId}::uuid`.execute(
        transaction,
      );
    }

    const activePlacementIds: string[] = [];
    const results: {
      id: string;
      assetId: string;
      position: number;
      isPrimary: boolean;
      role: string;
    }[] = [];

    for (const p of normalizedPlacements) {
      const inserted = await sql<{ id: string }>`insert into catalog.product_media(
        organization_id, product_id, variant_id, option_value_id, asset_id, role,
        is_primary, position, alt_text_override
      ) values (
        ${input.organizationId}, ${input.productId}, ${p.variantId ?? null},
        ${p.optionValueId ?? null}, ${p.assetId}, ${p.role}, ${p.isPrimary},
        ${p.position}, ${p.altTextOverride ?? null}
      )
      on conflict (organization_id, product_id, coalesce(variant_id, '00000000-0000-0000-0000-000000000000'::uuid),
        coalesce(option_value_id, '00000000-0000-0000-0000-000000000000'::uuid), asset_id, role)
      do update set position=excluded.position, is_primary=excluded.is_primary,
        alt_text_override=excluded.alt_text_override, updated_at=now()
      returning id::text`.execute(transaction);

      const placementId = inserted.rows[0]!.id;
      activePlacementIds.push(placementId);
      results.push({
        id: placementId,
        assetId: p.assetId,
        position: p.position,
        isPrimary: p.isPrimary,
        role: p.role,
      });

      await sql`insert into media.media_usage_projection(
        organization_id, asset_id, domain, usage_type, entity_id, relationship_id, label
      ) select ${input.organizationId}, ${p.assetId}, 'catalog', 'PRODUCT_MEDIA', product.id,
        ${placementId}::uuid, product.title from catalog.products product
        where product.id=${input.productId}::uuid and product.organization_id=${input.organizationId}
        on conflict do nothing`.execute(transaction);

      const wasExisting = existing.rows.some((e) => e.id === placementId);
      if (!wasExisting) {
        await sql`insert into media.media_usage_history(
          organization_id, asset_id, action, domain, usage_type, entity_id, relationship_id, actor_id
        ) values (${input.organizationId}, ${p.assetId}, 'ATTACHED', 'catalog', 'PRODUCT_MEDIA',
          ${input.productId}, ${placementId}, ${input.actorId ?? null})`.execute(transaction);
      }
    }

    const toRemove = existing.rows.filter((e) => !activePlacementIds.includes(e.id));
    for (const rem of toRemove) {
      await sql`delete from catalog.product_media where id=${rem.id}::uuid`.execute(transaction);
      await sql`delete from media.media_usage_projection where organization_id=${input.organizationId}
        and relationship_id=${rem.id}::uuid and domain='catalog'`.execute(transaction);
      await sql`insert into media.media_usage_history(
        organization_id, asset_id, action, domain, usage_type, entity_id, relationship_id, actor_id
      ) values (${input.organizationId}, ${rem.asset_id}, 'DETACHED', 'catalog', 'PRODUCT_MEDIA',
        ${input.productId}, ${rem.id}, ${input.actorId ?? null})`.execute(transaction);
    }

    if (input.actorId) {
      await appendAuditEvent(transaction, {
        organizationId: input.organizationId,
        actorType: 'USER',
        actorId: input.actorId,
        action: 'catalog.product_media.synced',
        targetType: 'catalog.product',
        targetId: input.productId,
        afterDiff: {
          syncedCount: results.length,
          removedCount: toRemove.length,
        },
      });
    }

    return results;
  });
}

export async function replaceProductMediaAsset(
  db: Kysely<DatabaseSchema>,
  input: {
    organizationId: string;
    productId: string;
    productMediaId: string;
    newAssetId: string;
    actorId?: string;
  },
): Promise<void> {
  await withMediaTransaction(db, async (transaction) => {
    const asset = await sql<{ id: string }>`select id::text from media.media_assets
      where id=${input.newAssetId}::uuid and organization_id=${input.organizationId}
        and asset_type='IMAGE' and status in ('READY','ARCHIVED') and visibility_class='PUBLIC' for share`.execute(
      transaction,
    );
    if (!asset.rows[0]) {
      throw new MediaDomainError(
        'MEDIA_NOT_READY',
        'Only ready public image assets can be used by Products.',
      );
    }

    const current = await sql<{ id: string; asset_id: string }>`
      select id::text, asset_id::text from catalog.product_media
      where id=${input.productMediaId}::uuid and product_id=${input.productId}::uuid
        and organization_id=${input.organizationId} for update`.execute(transaction);
    const row = current.rows[0];
    if (!row) throw new MediaDomainError('NOT_FOUND', 'Product media placement was not found.');
    if (row.asset_id === input.newAssetId) return;

    await sql`update catalog.product_media set asset_id=${input.newAssetId}::uuid, updated_at=now()
      where id=${input.productMediaId}::uuid and organization_id=${input.organizationId}`.execute(
      transaction,
    );

    await sql`update media.media_usage_projection set asset_id=${input.newAssetId}::uuid
      where organization_id=${input.organizationId} and relationship_id=${input.productMediaId}::uuid
        and domain='catalog'`.execute(transaction);

    await sql`insert into media.media_usage_history(
      organization_id, asset_id, action, domain, usage_type, entity_id, relationship_id, actor_id
    ) values (${input.organizationId}, ${row.asset_id}, 'DETACHED', 'catalog', 'PRODUCT_MEDIA',
      ${input.productId}, ${input.productMediaId}, ${input.actorId ?? null})`.execute(transaction);

    await sql`insert into media.media_usage_history(
      organization_id, asset_id, action, domain, usage_type, entity_id, relationship_id, actor_id
    ) values (${input.organizationId}, ${input.newAssetId}, 'RELINKED', 'catalog', 'PRODUCT_MEDIA',
      ${input.productId}, ${input.productMediaId}, ${input.actorId ?? null})`.execute(transaction);

    if (input.actorId) {
      await appendAuditEvent(transaction, {
        organizationId: input.organizationId,
        actorType: 'USER',
        actorId: input.actorId,
        action: 'catalog.product_media.replaced',
        targetType: 'catalog.product',
        targetId: input.productId,
        afterDiff: {
          placementId: input.productMediaId,
          previousAssetId: row.asset_id,
          newAssetId: input.newAssetId,
        },
      });
    }
  });
}

export async function detachMediaFromProduct(
  db: Kysely<DatabaseSchema>,
  input: { organizationId: string; actorId?: string; productId: string; productMediaId: string },
): Promise<void> {
  await withMediaTransaction(db, async (transaction) => {
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
