import type { CatalogReadinessCheckDto } from '@maevelle/contracts';

type ProductEditorSection = 'overview' | 'organization' | 'variants' | 'media' | 'review';

function sectionForReadinessCheck(code: CatalogReadinessCheckDto['code']): ProductEditorSection {
  if (code === 'ACTIVE_VARIANT' || code === 'OPTION_COMBINATIONS') return 'variants';
  if (code === 'PUBLIC_MEDIA') return 'media';
  if (code === 'REQUIRED_ATTRIBUTES' || code === 'CATEGORY') return 'organization';
  if (code === 'DESCRIPTION' || code === 'IDENTITY') return 'overview';
  return 'variants';
}

export function productReadinessResolutionHref(
  productId: string,
  code: CatalogReadinessCheckDto['code'],
): string {
  return `/products/${encodeURIComponent(productId)}/edit?section=${sectionForReadinessCheck(code)}`;
}

/** This remains a root-relative anchor because Admin is served from the /admin base path. */
export function storefrontProductHref(handle: string): string {
  return `/products/${encodeURIComponent(handle)}`;
}
