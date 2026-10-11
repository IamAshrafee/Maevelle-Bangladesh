import type { ShippingPreset } from '../types';

export const SHIPPING_PRESETS: readonly ShippingPreset[] = [
  {
    label: 'Light Apparel',
    description: 'T-Shirts, Silk Scarves, Lawn Kurtis (0.4 kg)',
    weightValue: '400',
    weightUnit: 'G',
    length: '30',
    width: '25',
    height: '4',
    dimensionUnit: 'CM',
  },
  {
    label: 'Heavy / Festive Fashion',
    description: 'Festive Panjabis, Sarees, Embroidered Lehengas (1.2 kg)',
    weightValue: '1.2',
    weightUnit: 'KG',
    length: '40',
    width: '30',
    height: '8',
    dimensionUnit: 'CM',
  },
  {
    label: 'Footwear & Boxed Goods',
    description: 'Mojaris, Leather Loafers, Nagras in Box (0.8 kg)',
    weightValue: '800',
    weightUnit: 'G',
    length: '32',
    width: '20',
    height: '12',
    dimensionUnit: 'CM',
  },
  {
    label: 'Jewelry & Accessories',
    description: 'Brooches, Buttons, Cufflinks in Compact Box (0.15 kg)',
    weightValue: '150',
    weightUnit: 'G',
    length: '15',
    width: '10',
    height: '3',
    dimensionUnit: 'CM',
  },
];
