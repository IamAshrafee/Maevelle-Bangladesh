import type { SizingTemplatePresetDto } from '@maevelle/contracts';

export const SIZING_TEMPLATE_PRESETS: readonly SizingTemplatePresetDto[] = [
  {
    id: 'preset-mens-panjabi',
    code: 'mens-panjabi',
    name: "Men's Panjabi (Semi-Fit & Regular)",
    category: "Apparel · Men's Ethnic",
    domainCode: 'menswear',
    domainName: 'Menswear',
    subjectType: 'GARMENT',
    sizeSystemCode: 'numeric-panjabi',
    sizeSystemName: 'Panjabi Collar/Chest Numeric (38–46)',
    defaultUnit: 'inch',
    standardSizes: [
      { code: '38', label: '38 (S)', sortOrder: 10 },
      { code: '40', label: '40 (M)', sortOrder: 20 },
      { code: '42', label: '42 (L)', sortOrder: 30 },
      { code: '44', label: '44 (XL)', sortOrder: 40 },
      { code: '46', label: '46 (XXL)', sortOrder: 50 },
    ],
    standardMeasurements: [
      { code: 'chest', name: 'Chest Around', defaultUnit: 'inch', sortOrder: 10 },
      { code: 'length', name: 'Length', defaultUnit: 'inch', sortOrder: 20 },
      { code: 'shoulder', name: 'Shoulder', defaultUnit: 'inch', sortOrder: 30 },
      { code: 'sleeve', name: 'Sleeve Length', defaultUnit: 'inch', sortOrder: 40 },
      { code: 'collar', name: 'Collar', defaultUnit: 'inch', sortOrder: 50 },
    ],
    sampleRows: [
      {
        sizeLabel: '38',
        measurements: [
          { measurementCode: 'chest', exact: '40', unit: 'inch' },
          { measurementCode: 'length', exact: '40', unit: 'inch' },
          { measurementCode: 'shoulder', exact: '17.5', unit: 'inch' },
          { measurementCode: 'sleeve', exact: '24.5', unit: 'inch' },
          { measurementCode: 'collar', exact: '15.5', unit: 'inch' },
        ],
      },
      {
        sizeLabel: '40',
        measurements: [
          { measurementCode: 'chest', exact: '42', unit: 'inch' },
          { measurementCode: 'length', exact: '42', unit: 'inch' },
          { measurementCode: 'shoulder', exact: '18', unit: 'inch' },
          { measurementCode: 'sleeve', exact: '25', unit: 'inch' },
          { measurementCode: 'collar', exact: '16', unit: 'inch' },
        ],
      },
      {
        sizeLabel: '42',
        measurements: [
          { measurementCode: 'chest', exact: '44', unit: 'inch' },
          { measurementCode: 'length', exact: '44', unit: 'inch' },
          { measurementCode: 'shoulder', exact: '18.5', unit: 'inch' },
          { measurementCode: 'sleeve', exact: '25.5', unit: 'inch' },
          { measurementCode: 'collar', exact: '16.5', unit: 'inch' },
        ],
      },
      {
        sizeLabel: '44',
        measurements: [
          { measurementCode: 'chest', exact: '46', unit: 'inch' },
          { measurementCode: 'length', exact: '45', unit: 'inch' },
          { measurementCode: 'shoulder', exact: '19', unit: 'inch' },
          { measurementCode: 'sleeve', exact: '26', unit: 'inch' },
          { measurementCode: 'collar', exact: '17', unit: 'inch' },
        ],
      },
      {
        sizeLabel: '46',
        measurements: [
          { measurementCode: 'chest', exact: '48', unit: 'inch' },
          { measurementCode: 'length', exact: '46', unit: 'inch' },
          { measurementCode: 'shoulder', exact: '19.5', unit: 'inch' },
          { measurementCode: 'sleeve', exact: '26.5', unit: 'inch' },
          { measurementCode: 'collar', exact: '17.5', unit: 'inch' },
        ],
      },
    ],
  },
  {
    id: 'preset-womens-kurti',
    code: 'womens-kurti',
    name: "Women's Kurti / Kamiz / Three-Piece",
    category: "Apparel · Women's Ethnic",
    domainCode: 'womenswear',
    domainName: 'Womenswear',
    subjectType: 'GARMENT',
    sizeSystemCode: 'alpha-womens',
    sizeSystemName: 'International Alpha (S–XXL)',
    defaultUnit: 'inch',
    standardSizes: [
      { code: 'S', label: 'Small (36)', sortOrder: 10 },
      { code: 'M', label: 'Medium (38)', sortOrder: 20 },
      { code: 'L', label: 'Large (40)', sortOrder: 30 },
      { code: 'XL', label: 'XL (42)', sortOrder: 40 },
      { code: 'XXL', label: 'XXL (44)', sortOrder: 50 },
    ],
    standardMeasurements: [
      { code: 'bust', name: 'Bust Around', defaultUnit: 'inch', sortOrder: 10 },
      { code: 'waist', name: 'Waist Around', defaultUnit: 'inch', sortOrder: 20 },
      { code: 'hip', name: 'Hip Around', defaultUnit: 'inch', sortOrder: 30 },
      { code: 'length', name: 'Length', defaultUnit: 'inch', sortOrder: 40 },
      { code: 'shoulder', name: 'Shoulder Width', defaultUnit: 'inch', sortOrder: 50 },
    ],
    sampleRows: [
      {
        sizeLabel: 'Small (36)',
        measurements: [
          { measurementCode: 'bust', exact: '36', unit: 'inch' },
          { measurementCode: 'waist', exact: '32', unit: 'inch' },
          { measurementCode: 'hip', exact: '38', unit: 'inch' },
          { measurementCode: 'length', exact: '42', unit: 'inch' },
          { measurementCode: 'shoulder', exact: '14', unit: 'inch' },
        ],
      },
      {
        sizeLabel: 'Medium (38)',
        measurements: [
          { measurementCode: 'bust', exact: '38', unit: 'inch' },
          { measurementCode: 'waist', exact: '34', unit: 'inch' },
          { measurementCode: 'hip', exact: '40', unit: 'inch' },
          { measurementCode: 'length', exact: '43', unit: 'inch' },
          { measurementCode: 'shoulder', exact: '14.5', unit: 'inch' },
        ],
      },
      {
        sizeLabel: 'Large (40)',
        measurements: [
          { measurementCode: 'bust', exact: '40', unit: 'inch' },
          { measurementCode: 'waist', exact: '36', unit: 'inch' },
          { measurementCode: 'hip', exact: '42', unit: 'inch' },
          { measurementCode: 'length', exact: '44', unit: 'inch' },
          { measurementCode: 'shoulder', exact: '15', unit: 'inch' },
        ],
      },
      {
        sizeLabel: 'XL (42)',
        measurements: [
          { measurementCode: 'bust', exact: '42', unit: 'inch' },
          { measurementCode: 'waist', exact: '38', unit: 'inch' },
          { measurementCode: 'hip', exact: '44', unit: 'inch' },
          { measurementCode: 'length', exact: '45', unit: 'inch' },
          { measurementCode: 'shoulder', exact: '15.5', unit: 'inch' },
        ],
      },
      {
        sizeLabel: 'XXL (44)',
        measurements: [
          { measurementCode: 'bust', exact: '44', unit: 'inch' },
          { measurementCode: 'waist', exact: '40', unit: 'inch' },
          { measurementCode: 'hip', exact: '46', unit: 'inch' },
          { measurementCode: 'length', exact: '45', unit: 'inch' },
          { measurementCode: 'shoulder', exact: '16', unit: 'inch' },
        ],
      },
    ],
  },
  {
    id: 'preset-tshirt-polo',
    code: 'tshirt-polo',
    name: 'T-Shirts, Polos & Casual Tops',
    category: 'Apparel · Western Tops',
    domainCode: 'apparel',
    domainName: 'General Apparel',
    subjectType: 'GARMENT',
    sizeSystemCode: 'intl-alpha',
    sizeSystemName: 'International Alpha (S–3XL)',
    defaultUnit: 'inch',
    standardSizes: [
      { code: 'S', label: 'S', sortOrder: 10 },
      { code: 'M', label: 'M', sortOrder: 20 },
      { code: 'L', label: 'L', sortOrder: 30 },
      { code: 'XL', label: 'XL', sortOrder: 40 },
      { code: 'XXL', label: 'XXL', sortOrder: 50 },
      { code: '3XL', label: '3XL', sortOrder: 60 },
    ],
    standardMeasurements: [
      { code: 'chest', name: 'Chest', defaultUnit: 'inch', sortOrder: 10 },
      { code: 'length', name: 'Length', defaultUnit: 'inch', sortOrder: 20 },
      { code: 'sleeve', name: 'Sleeve Length', defaultUnit: 'inch', sortOrder: 30 },
    ],
    sampleRows: [
      {
        sizeLabel: 'S',
        measurements: [
          { measurementCode: 'chest', exact: '38', unit: 'inch' },
          { measurementCode: 'length', exact: '27', unit: 'inch' },
          { measurementCode: 'sleeve', exact: '8', unit: 'inch' },
        ],
      },
      {
        sizeLabel: 'M',
        measurements: [
          { measurementCode: 'chest', exact: '40', unit: 'inch' },
          { measurementCode: 'length', exact: '28', unit: 'inch' },
          { measurementCode: 'sleeve', exact: '8.5', unit: 'inch' },
        ],
      },
      {
        sizeLabel: 'L',
        measurements: [
          { measurementCode: 'chest', exact: '42', unit: 'inch' },
          { measurementCode: 'length', exact: '29', unit: 'inch' },
          { measurementCode: 'sleeve', exact: '9', unit: 'inch' },
        ],
      },
      {
        sizeLabel: 'XL',
        measurements: [
          { measurementCode: 'chest', exact: '44', unit: 'inch' },
          { measurementCode: 'length', exact: '30', unit: 'inch' },
          { measurementCode: 'sleeve', exact: '9.5', unit: 'inch' },
        ],
      },
      {
        sizeLabel: 'XXL',
        measurements: [
          { measurementCode: 'chest', exact: '46', unit: 'inch' },
          { measurementCode: 'length', exact: '31', unit: 'inch' },
          { measurementCode: 'sleeve', exact: '10', unit: 'inch' },
        ],
      },
    ],
  },
  {
    id: 'preset-pants-trousers',
    code: 'pants-trousers',
    name: 'Trousers, Chinos & Jeans',
    category: 'Apparel · Bottoms',
    domainCode: 'bottoms',
    domainName: 'Bottoms',
    subjectType: 'GARMENT',
    sizeSystemCode: 'waist-inches',
    sizeSystemName: 'Waist In Inches (28–38)',
    defaultUnit: 'inch',
    standardSizes: [
      { code: '28', label: '28', sortOrder: 10 },
      { code: '30', label: '30', sortOrder: 20 },
      { code: '32', label: '32', sortOrder: 30 },
      { code: '34', label: '34', sortOrder: 40 },
      { code: '36', label: '36', sortOrder: 50 },
      { code: '38', label: '38', sortOrder: 60 },
    ],
    standardMeasurements: [
      { code: 'waist', name: 'Waist', defaultUnit: 'inch', sortOrder: 10 },
      { code: 'length', name: 'Outseam Length', defaultUnit: 'inch', sortOrder: 20 },
      { code: 'hip', name: 'Hip', defaultUnit: 'inch', sortOrder: 30 },
      { code: 'thigh', name: 'Thigh', defaultUnit: 'inch', sortOrder: 40 },
    ],
    sampleRows: [
      {
        sizeLabel: '28',
        measurements: [
          { measurementCode: 'waist', exact: '28', unit: 'inch' },
          { measurementCode: 'length', exact: '39', unit: 'inch' },
          { measurementCode: 'hip', exact: '36', unit: 'inch' },
          { measurementCode: 'thigh', exact: '22', unit: 'inch' },
        ],
      },
      {
        sizeLabel: '30',
        measurements: [
          { measurementCode: 'waist', exact: '30', unit: 'inch' },
          { measurementCode: 'length', exact: '40', unit: 'inch' },
          { measurementCode: 'hip', exact: '38', unit: 'inch' },
          { measurementCode: 'thigh', exact: '23', unit: 'inch' },
        ],
      },
      {
        sizeLabel: '32',
        measurements: [
          { measurementCode: 'waist', exact: '32', unit: 'inch' },
          { measurementCode: 'length', exact: '40.5', unit: 'inch' },
          { measurementCode: 'hip', exact: '40', unit: 'inch' },
          { measurementCode: 'thigh', exact: '24', unit: 'inch' },
        ],
      },
      {
        sizeLabel: '34',
        measurements: [
          { measurementCode: 'waist', exact: '34', unit: 'inch' },
          { measurementCode: 'length', exact: '41', unit: 'inch' },
          { measurementCode: 'hip', exact: '42', unit: 'inch' },
          { measurementCode: 'thigh', exact: '25', unit: 'inch' },
        ],
      },
      {
        sizeLabel: '36',
        measurements: [
          { measurementCode: 'waist', exact: '36', unit: 'inch' },
          { measurementCode: 'length', exact: '41.5', unit: 'inch' },
          { measurementCode: 'hip', exact: '44', unit: 'inch' },
          { measurementCode: 'thigh', exact: '26', unit: 'inch' },
        ],
      },
    ],
  },
  {
    id: 'preset-footwear-eu',
    code: 'footwear-eu',
    name: 'Footwear & Shoes (EU Standard)',
    category: 'Footwear',
    domainCode: 'footwear',
    domainName: 'Footwear',
    subjectType: 'PRODUCT',
    sizeSystemCode: 'eu-footwear',
    sizeSystemName: 'EU Footwear (39–45)',
    defaultUnit: 'cm',
    standardSizes: [
      { code: '39', label: 'EU 39', sortOrder: 10 },
      { code: '40', label: 'EU 40', sortOrder: 20 },
      { code: '41', label: 'EU 41', sortOrder: 30 },
      { code: '42', label: 'EU 42', sortOrder: 40 },
      { code: '43', label: 'EU 43', sortOrder: 50 },
      { code: '44', label: 'EU 44', sortOrder: 60 },
      { code: '45', label: 'EU 45', sortOrder: 70 },
    ],
    standardMeasurements: [
      { code: 'foot-length', name: 'Foot Length', defaultUnit: 'cm', sortOrder: 10 },
      { code: 'insole-length', name: 'Insole Length', defaultUnit: 'cm', sortOrder: 20 },
    ],
    sampleRows: [
      {
        sizeLabel: 'EU 39',
        measurements: [
          { measurementCode: 'foot-length', exact: '24.5', unit: 'cm' },
          { measurementCode: 'insole-length', exact: '25.0', unit: 'cm' },
        ],
      },
      {
        sizeLabel: 'EU 40',
        measurements: [
          { measurementCode: 'foot-length', exact: '25.0', unit: 'cm' },
          { measurementCode: 'insole-length', exact: '25.5', unit: 'cm' },
        ],
      },
      {
        sizeLabel: 'EU 41',
        measurements: [
          { measurementCode: 'foot-length', exact: '25.8', unit: 'cm' },
          { measurementCode: 'insole-length', exact: '26.3', unit: 'cm' },
        ],
      },
      {
        sizeLabel: 'EU 42',
        measurements: [
          { measurementCode: 'foot-length', exact: '26.5', unit: 'cm' },
          { measurementCode: 'insole-length', exact: '27.0', unit: 'cm' },
        ],
      },
      {
        sizeLabel: 'EU 43',
        measurements: [
          { measurementCode: 'foot-length', exact: '27.2', unit: 'cm' },
          { measurementCode: 'insole-length', exact: '27.7', unit: 'cm' },
        ],
      },
      {
        sizeLabel: 'EU 44',
        measurements: [
          { measurementCode: 'foot-length', exact: '28.0', unit: 'cm' },
          { measurementCode: 'insole-length', exact: '28.5', unit: 'cm' },
        ],
      },
    ],
  },
] as const;
