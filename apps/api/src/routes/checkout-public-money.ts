import type { CheckoutFinalTermsDto } from '@maevelle/contracts';

/** Financial policy provenance remains in immutable backend history, never shopper DTOs. */
export function publicFinalTerms(terms: CheckoutFinalTermsDto): CheckoutFinalTermsDto {
  const policy = terms.wholeTakaPolicy;
  if (!policy) return terms;
  return {
    ...terms,
    wholeTakaPolicy: {
      version: policy.version,
      currency: policy.currency,
      unit: policy.unit,
      mode: policy.mode,
      boundary: policy.boundary,
      negativeTreatment: policy.negativeTreatment,
    },
  };
}
