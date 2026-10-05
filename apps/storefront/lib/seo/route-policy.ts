export type StorefrontRouteKind =
  | 'HOME'
  | 'CATEGORY_INDEX'
  | 'CATEGORY'
  | 'PRODUCT'
  | 'SEARCH'
  | 'CART'
  | 'CHECKOUT'
  | 'ORDER_CONFIRMATION'
  | 'ORDER_TRACKING'
  | 'REVIEW_SUBMISSION'
  | 'POLICY';

export interface StorefrontSeoPolicy {
  readonly index: boolean;
  readonly follow: boolean;
  readonly includeInSitemap: boolean;
  readonly canonical: 'SELF' | 'PARENT_PRODUCT' | 'NONE';
  readonly structuredData: readonly ('BREADCRUMB' | 'PRODUCT' | 'FAQ')[];
}

export const storefrontSeoPolicy: Readonly<Record<StorefrontRouteKind, StorefrontSeoPolicy>> = {
  HOME: {
    index: true,
    follow: true,
    includeInSitemap: true,
    canonical: 'SELF',
    structuredData: [],
  },
  CATEGORY_INDEX: {
    index: true,
    follow: true,
    includeInSitemap: true,
    canonical: 'SELF',
    structuredData: ['BREADCRUMB'],
  },
  CATEGORY: {
    index: true,
    follow: true,
    includeInSitemap: true,
    canonical: 'SELF',
    structuredData: ['BREADCRUMB'],
  },
  PRODUCT: {
    index: true,
    follow: true,
    includeInSitemap: true,
    canonical: 'PARENT_PRODUCT',
    structuredData: ['BREADCRUMB', 'PRODUCT', 'FAQ'],
  },
  SEARCH: {
    index: false,
    follow: true,
    includeInSitemap: false,
    canonical: 'SELF',
    structuredData: [],
  },
  CART: {
    index: false,
    follow: true,
    includeInSitemap: false,
    canonical: 'SELF',
    structuredData: [],
  },
  CHECKOUT: {
    index: false,
    follow: false,
    includeInSitemap: false,
    canonical: 'NONE',
    structuredData: [],
  },
  ORDER_CONFIRMATION: {
    index: false,
    follow: false,
    includeInSitemap: false,
    canonical: 'NONE',
    structuredData: [],
  },
  ORDER_TRACKING: {
    index: false,
    follow: false,
    includeInSitemap: false,
    canonical: 'NONE',
    structuredData: [],
  },
  REVIEW_SUBMISSION: {
    index: false,
    follow: false,
    includeInSitemap: false,
    canonical: 'NONE',
    structuredData: [],
  },
  POLICY: {
    index: true,
    follow: true,
    includeInSitemap: true,
    canonical: 'SELF',
    structuredData: [],
  },
};
