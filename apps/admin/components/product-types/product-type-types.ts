import type {
  CatalogAttributeDefinitionDto,
  CatalogProductTypeDefinitionDto,
  CatalogReferenceOptionDto,
} from '@maevelle/contracts';

import { slugify } from '@/components/catalog-classification/classification-api';

export type ProductTypeEditor =
  | { readonly kind: 'TYPE'; readonly item?: CatalogProductTypeDefinitionDto }
  | {
      readonly kind: 'ATTRIBUTE';
      readonly productType: CatalogProductTypeDefinitionDto;
      readonly item?: CatalogAttributeDefinitionDto;
    }
  | {
      readonly kind: 'OPTION';
      readonly attribute: CatalogAttributeDefinitionDto;
      readonly item?: CatalogReferenceOptionDto;
    };

export function parseReferenceOptions(value: string) {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, position) => {
      const separator = line.indexOf('|');
      const label = separator >= 0 ? line.slice(separator + 1).trim() : line;
      const code = separator >= 0 ? line.slice(0, separator).trim().toLowerCase() : slugify(line);
      return { code, label, position };
    });
}
