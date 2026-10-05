import type { CommerceItemDto, StorefrontProductDto } from '@maevelle/contracts';

type StorefrontVariant = StorefrontProductDto['variants'][number];

export interface CommerceIdentityContext {
  readonly productGroupId?: string;
  readonly presentationVariantId?: string;
  readonly category?: string;
  readonly quantity?: number;
}

export function commerceItemFromProduct(
  product: StorefrontProductDto,
  variant: StorefrontVariant,
  context: CommerceIdentityContext = {},
): CommerceItemDto {
  const labels = product.options.flatMap((axis) => {
    const selected = axis.values.find((value) => variant.optionValueIds.includes(value.id));
    return selected ? [`${axis.name}: ${selected.label}`] : [];
  });

  return {
    productId: product.id,
    ...(context.productGroupId ? { productGroupId: context.productGroupId } : {}),
    ...(context.presentationVariantId
      ? { presentationVariantId: context.presentationVariantId }
      : {}),
    skuId: variant.id,
    sku: variant.sku,
    itemName: product.title,
    ...(labels.length ? { variantName: labels.join(' / ') } : {}),
    ...(context.category ? { category: context.category } : {}),
    ...(variant.price ? { price: variant.price.amount, currency: variant.price.currency } : {}),
    ...(context.quantity ? { quantity: context.quantity } : {}),
  };
}

export function commerceItemDestinationIdentity(item: CommerceItemDto) {
  return {
    internalProductId: item.productId,
    internalSkuId: item.skuId,
    ga4ItemId: item.skuId,
    metaContentId: item.skuId,
    merchantOfferId: item.skuId,
    orderLineMerchandiseId: item.skuId,
    inventoryIdentity: item.skuId,
  } as const;
}
