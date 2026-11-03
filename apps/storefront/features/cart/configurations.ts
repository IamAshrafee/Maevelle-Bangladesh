'use server';

import { loadPublicProduct } from '@/lib/api/server/catalog';

export async function loadCartConfigurations(handle: string, currency: string) {
  if (
    typeof handle !== 'string' ||
    handle.length > 200 ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(handle) ||
    typeof currency !== 'string' ||
    !/^[A-Z]{3}$/.test(currency)
  )
    return [];
  const product = await loadPublicProduct(handle);
  if (!product) return [];
  return product.variants.flatMap((variant) => {
    if (!variant.available || !variant.price || variant.price.currency !== currency) return [];
    const options = product.options.flatMap((axis) =>
      axis.values
        .filter((value) => variant.optionValueIds.includes(value.id))
        .map((value) => `${axis.name}: ${value.label}`),
    );
    return [
      {
        id: variant.id,
        label: options.join(' · ') || 'Standard selection',
        unitPrice: variant.price.amount,
      },
    ];
  });
}
