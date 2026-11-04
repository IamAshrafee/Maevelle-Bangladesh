/** Public boolean only; production is closed regardless of build-time flags. */
export const checkoutPreviewEnabled =
  process.env.NODE_ENV !== 'production' &&
  process.env.NEXT_PUBLIC_CHECKOUT_DRAFT_PREVIEW === 'true';
