import type { MeasurementUnit } from '../../sizing.js';

export interface SizingDomainSeedItem {
  readonly code: string;
  readonly name: string;
  readonly subjectType: 'BODY' | 'GARMENT' | 'PRODUCT';
}

export interface SizeDefinitionSeedItem {
  readonly code: string;
  readonly label: string;
  readonly sortOrder?: number;
}

export interface SizeSystemSeedItem {
  readonly code: string;
  readonly name: string;
  readonly domainCode: string;
  readonly regionCode?: string;
  readonly sizes: readonly SizeDefinitionSeedItem[];
}

export interface MeasurementDefinitionSeedItem {
  readonly code: string;
  readonly name: string;
  readonly domainCode: string;
  readonly subjectType: 'BODY' | 'GARMENT' | 'PRODUCT';
  readonly defaultUnit: MeasurementUnit;
  readonly description?: string;
  readonly instructions?: string;
  readonly sortOrder?: number;
}

export interface SizeGuideMeasurementSeedValue {
  readonly measurementCode: string;
  readonly exact?: string;
  readonly min?: string;
  readonly max?: string;
  readonly unitCode?: MeasurementUnit;
  readonly isApproximate?: boolean;
}

export interface SizeGuideRowSeedItem {
  readonly sizeCode?: string;
  readonly displayLabel: string;
  readonly position?: number;
  readonly measurements?: readonly SizeGuideMeasurementSeedValue[];
}

export interface SizeGuideSeedItem {
  readonly name: string;
  readonly description?: string;
  readonly domainCode: string;
  readonly systemCode?: string;
  readonly publishIfValid?: boolean;
  readonly rows?: readonly SizeGuideRowSeedItem[];
}

export interface SizingSeedData {
  readonly domains: readonly SizingDomainSeedItem[];
  readonly systems: readonly SizeSystemSeedItem[];
  readonly measurements: readonly MeasurementDefinitionSeedItem[];
  readonly guides: readonly SizeGuideSeedItem[];
}

/**
 * Authoritative Sizing Foundation V1 seed dataset.
 *
 * Implements Maevelle's core architectural separation:
 * Sizing Domains → Sizing Systems → Size Definitions → Measurement Definitions → Size Guides
 */
export const sizingSeedData: SizingSeedData = {
  // ─── Sizing Domains ─────────────────────────────────────────────────────────
  domains: [
    {
      code: 'apparel',
      name: 'Apparel',
      subjectType: 'GARMENT',
    },
    {
      code: 'headwear',
      name: 'Headwear',
      subjectType: 'GARMENT',
    },
    {
      code: 'accessories',
      name: 'Accessories',
      subjectType: 'PRODUCT',
    },
  ],

  // ─── Sizing Systems & Size Definitions ──────────────────────────────────────
  systems: [
    {
      code: 'womens-apparel-alpha',
      name: "Women's Apparel — Alpha",
      domainCode: 'apparel',
      regionCode: 'INT',
      sizes: [
        { code: 'xs', label: 'XS', sortOrder: 0 },
        { code: 's', label: 'S', sortOrder: 1 },
        { code: 'm', label: 'M', sortOrder: 2 },
        { code: 'l', label: 'L', sortOrder: 3 },
        { code: 'xl', label: 'XL', sortOrder: 4 },
        { code: '2xl', label: '2XL', sortOrder: 5 },
        { code: '3xl', label: '3XL', sortOrder: 6 },
        { code: 'one-size', label: 'One Size', sortOrder: 7 },
      ],
    },
    {
      code: 'womens-stretchwear',
      name: "Women's Stretchwear",
      domainCode: 'apparel',
      sizes: [
        { code: 's-m', label: 'S/M', sortOrder: 0 },
        { code: 'm-l', label: 'M/L', sortOrder: 1 },
        { code: 'l-xl', label: 'L/XL', sortOrder: 2 },
        { code: 'xl-2xl', label: 'XL/2XL', sortOrder: 3 },
        { code: '2xl-3xl', label: '2XL/3XL', sortOrder: 4 },
        { code: 'one-size', label: 'One Size', sortOrder: 5 },
      ],
    },
    {
      code: 'womens-headwear',
      name: "Women's Headwear",
      domainCode: 'headwear',
      sizes: [
        { code: 's', label: 'S', sortOrder: 0 },
        { code: 'm', label: 'M', sortOrder: 1 },
        { code: 'l', label: 'L', sortOrder: 2 },
        { code: 'xl', label: 'XL', sortOrder: 3 },
        { code: 'one-size', label: 'One Size', sortOrder: 4 },
        { code: 'adjustable', label: 'Adjustable', sortOrder: 5 },
      ],
    },
    {
      code: 'length-based-accessories',
      name: 'Length-Based Accessories',
      domainCode: 'accessories',
      sizes: [
        { code: '80-cm', label: '80 cm', sortOrder: 0 },
        { code: '90-cm', label: '90 cm', sortOrder: 1 },
        { code: '100-cm', label: '100 cm', sortOrder: 2 },
        { code: '110-cm', label: '110 cm', sortOrder: 3 },
        { code: '120-cm', label: '120 cm', sortOrder: 4 },
        { code: 'adjustable', label: 'Adjustable', sortOrder: 5 },
        { code: 'one-size', label: 'One Size', sortOrder: 6 },
        { code: 'custom-length', label: 'Custom Length', sortOrder: 7 },
      ],
    },
  ],

  // ─── Measurement Definitions ────────────────────────────────────────────────
  measurements: [
    // Apparel measurements
    {
      code: 'bust',
      name: 'Bust',
      domainCode: 'apparel',
      subjectType: 'GARMENT',
      defaultUnit: 'cm',
      instructions: 'Measure across the fullest part of the bust with garment lying flat.',
      sortOrder: 0,
    },
    {
      code: 'shoulder',
      name: 'Shoulder',
      domainCode: 'apparel',
      subjectType: 'GARMENT',
      defaultUnit: 'cm',
      instructions: 'Measure across the back from shoulder seam to shoulder seam.',
      sortOrder: 1,
    },
    {
      code: 'sleeve-length',
      name: 'Sleeve Length',
      domainCode: 'apparel',
      subjectType: 'GARMENT',
      defaultUnit: 'cm',
      instructions: 'Measure from shoulder seam to sleeve cuff hem.',
      sortOrder: 2,
    },
    {
      code: 'top-length',
      name: 'Top Length',
      domainCode: 'apparel',
      subjectType: 'GARMENT',
      defaultUnit: 'cm',
      instructions: 'Measure from highest point of the shoulder seam to garment hem.',
      sortOrder: 3,
    },
    {
      code: 'waist',
      name: 'Waist',
      domainCode: 'apparel',
      subjectType: 'GARMENT',
      defaultUnit: 'cm',
      instructions: 'Measure across the narrowest part of the waistline.',
      sortOrder: 4,
    },
    {
      code: 'hip',
      name: 'Hip',
      domainCode: 'apparel',
      subjectType: 'GARMENT',
      defaultUnit: 'cm',
      instructions: 'Measure straight across the widest part of the hips.',
      sortOrder: 5,
    },
    {
      code: 'garment-length',
      name: 'Garment Length',
      domainCode: 'apparel',
      subjectType: 'GARMENT',
      defaultUnit: 'cm',
      instructions: 'Total length of the garment from waistband or top seam to bottom hem.',
      sortOrder: 6,
    },
    {
      code: 'rise',
      name: 'Rise',
      domainCode: 'apparel',
      subjectType: 'GARMENT',
      defaultUnit: 'cm',
      instructions: 'Measure from crotch seam to top of waistband.',
      sortOrder: 7,
    },
    {
      code: 'inseam',
      name: 'Inseam',
      domainCode: 'apparel',
      subjectType: 'GARMENT',
      defaultUnit: 'cm',
      instructions: 'Measure from crotch seam down the inner leg to leg opening.',
      sortOrder: 8,
    },
    {
      code: 'bottom-length',
      name: 'Bottom Length',
      domainCode: 'apparel',
      subjectType: 'GARMENT',
      defaultUnit: 'cm',
      instructions: 'Length of the lower piece from waistband to bottom hem.',
      sortOrder: 9,
    },
    {
      code: 'length',
      name: 'Length',
      domainCode: 'apparel',
      subjectType: 'GARMENT',
      defaultUnit: 'cm',
      instructions: 'Overall garment length from top to bottom edge.',
      sortOrder: 10,
    },
    {
      code: 'recommended-height',
      name: 'Recommended Height',
      domainCode: 'apparel',
      subjectType: 'BODY',
      defaultUnit: 'cm',
      instructions: 'Recommended wearer height range for optimal fit.',
      sortOrder: 11,
    },
    {
      code: 'recommended-weight',
      name: 'Recommended Weight',
      domainCode: 'apparel',
      subjectType: 'BODY',
      defaultUnit: 'kg',
      instructions: 'Recommended wearer body weight range.',
      sortOrder: 12,
    },

    // Headwear measurements
    {
      code: 'head-circumference',
      name: 'Head Circumference',
      domainCode: 'headwear',
      subjectType: 'BODY',
      defaultUnit: 'cm',
      instructions: 'Measure around the head just above the ears and eyebrows.',
      sortOrder: 0,
    },
    {
      code: 'brim-width',
      name: 'Brim Width',
      domainCode: 'headwear',
      subjectType: 'PRODUCT',
      defaultUnit: 'cm',
      instructions: 'Width of the hat brim from crown base to outer edge.',
      sortOrder: 1,
    },
    {
      code: 'crown-height',
      name: 'Crown Height',
      domainCode: 'headwear',
      subjectType: 'PRODUCT',
      defaultUnit: 'cm',
      instructions: 'Vertical height of the crown from brim to top.',
      sortOrder: 2,
    },

    // Accessories measurements
    {
      code: 'total-length',
      name: 'Total Length',
      domainCode: 'accessories',
      subjectType: 'PRODUCT',
      defaultUnit: 'cm',
      instructions: 'Total end-to-end length of the chain or accessory.',
      sortOrder: 0,
    },
    {
      code: 'adjustable-length',
      name: 'Adjustable Length',
      domainCode: 'accessories',
      subjectType: 'PRODUCT',
      defaultUnit: 'cm',
      instructions: 'Usable wearable length adjustment range.',
      sortOrder: 1,
    },
    {
      code: 'extension-length',
      name: 'Extension Length',
      domainCode: 'accessories',
      subjectType: 'PRODUCT',
      defaultUnit: 'cm',
      instructions: 'Length of the extension chain for customizable fit.',
      sortOrder: 2,
    },
    {
      code: 'recommended-waist-range',
      name: 'Recommended Waist Range',
      domainCode: 'accessories',
      subjectType: 'BODY',
      defaultUnit: 'cm',
      instructions: 'Recommended waist circumference range.',
      sortOrder: 3,
    },
  ],

  // ─── Size Guides ────────────────────────────────────────────────────────────
  guides: [
    {
      name: "Women's Tops",
      description: "Size guide for women's tops, shirts, and tunics",
      domainCode: 'apparel',
      systemCode: 'womens-apparel-alpha',
      publishIfValid: false,
      rows: [{ sizeCode: 'one-size', displayLabel: 'One Size', position: 0 }],
    },
    {
      name: "Women's Bottoms",
      description: "Size guide for women's skirts, pants, and shorts",
      domainCode: 'apparel',
      systemCode: 'womens-apparel-alpha',
      publishIfValid: false,
      rows: [{ sizeCode: 'm', displayLabel: 'M', position: 0 }],
    },
    {
      name: "Women's Dresses & Sets",
      description: "Size guide for women's dresses and multi-piece matching sets",
      domainCode: 'apparel',
      systemCode: 'womens-apparel-alpha',
      publishIfValid: false,
      rows: [
        { sizeCode: 'm', displayLabel: 'M', position: 0 },
        { sizeCode: 'l', displayLabel: 'L', position: 1 },
      ],
    },
    {
      name: 'Leggings & Tights',
      description: 'Size guide for stretchwear, leggings, and tights',
      domainCode: 'apparel',
      systemCode: 'womens-stretchwear',
      publishIfValid: false,
      rows: [{ sizeCode: 'm-l', displayLabel: 'M/L', position: 0 }],
    },
    {
      name: "Women's Hats",
      description: "Size guide for women's sun hats, straw hats, and headwear",
      domainCode: 'headwear',
      systemCode: 'womens-headwear',
      publishIfValid: true,
      rows: [
        {
          sizeCode: 'm',
          displayLabel: 'M',
          position: 0,
          measurements: [
            {
              measurementCode: 'head-circumference',
              min: '56',
              max: '58',
              unitCode: 'cm',
            },
          ],
        },
      ],
    },
    {
      name: 'Waist Chains & Body Jewelry',
      description: 'Size and length guide for waist chains, belts, and body jewelry',
      domainCode: 'accessories',
      systemCode: 'length-based-accessories',
      publishIfValid: true,
      rows: [
        {
          sizeCode: '110-cm',
          displayLabel: '110 cm',
          position: 0,
          measurements: [
            {
              measurementCode: 'total-length',
              exact: '110',
              unitCode: 'cm',
            },
          ],
        },
      ],
    },
  ],
};
