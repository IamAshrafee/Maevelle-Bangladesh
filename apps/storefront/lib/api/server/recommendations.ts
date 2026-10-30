import 'server-only';
import type { ProductRecommendationsDto } from '@maevelle/contracts';
import { requestStorefrontApi } from './http';

export async function loadProductRecommendations(
  handle: string,
  organizationId: string,
  currency: string,
): Promise<ProductRecommendationsDto | null> {
  try {
    return await requestStorefrontApi<ProductRecommendationsDto>(
      `/storefront/v1/products/${encodeURIComponent(handle)}/recommendations?organizationId=${encodeURIComponent(organizationId)}&currency=${encodeURIComponent(currency)}`,
      { cache: 'no-store', signal: AbortSignal.timeout(4500) },
    );
  } catch (error) {
    console.warn('Product recommendations could not be loaded.', error);
    return null;
  }
}
