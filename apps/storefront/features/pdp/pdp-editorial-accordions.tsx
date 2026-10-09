'use client';

import { PdpProductDetails } from './pdp-product-details';
import type { PdpProductDetailsProps } from './pdp-product-details';

export type PdpEditorialAccordionsProps = PdpProductDetailsProps;

/**
 * Editorial product details component.
 * Displays description, attribute groups, and FAQs directly without collapsibles.
 */
export function PdpEditorialAccordions(props: PdpEditorialAccordionsProps) {
  return <PdpProductDetails {...props} />;
}
