import type { ProductSeedItem } from '../types.js';

/**
 * Rich, production-grade product seed data representing Maevelle's core apparel,
 * accessories, jewelry, and lifestyle collections with multi-variant combinations,
 * canonical colors, alpha sizing, high-resolution imagery, and warehouse stock distributions.
 */
export const productSeedData: readonly ProductSeedItem[] = [
  // ─── 1. Artisanal Linen Tiered Maxi Skirt ──────────────────────────────────
  {
    title: 'Artisanal Linen Tiered Maxi Skirt',
    handle: 'artisanal-linen-tiered-maxi-skirt',
    productTypeCode: 'skirt',
    primaryCategoryHandle: 'skirts',
    additionalCategoryHandles: ['bottoms', 'clothing'],
    sizeSystemCode: 'womens-apparel-alpha',
    description:
      'Flowing tiered silhouette crafted from breathable European flax linen. Designed with a gentle elasticated drawstring waistband, hidden inseam pockets, and soft movement for summer days and resort getaways.',
    tagNames: ['Boho', 'Summer', 'Casual', 'Holiday'],
    occasionNames: ['Vacation', 'Brunch', 'Weekend'],
    collectionNames: ['Summer Collection', 'Beach & Vacation', 'New Arrivals'],
    options: [
      {
        name: 'Color',
        values: [
          { displayValue: 'Olive Green', colorCode: 'olive-green', position: 0 },
          { displayValue: 'Beige', colorCode: 'beige', position: 1 },
          { displayValue: 'Terracotta', colorCode: 'terracotta', position: 2 },
        ],
      },
      {
        name: 'Size',
        values: [
          { displayValue: 'S', sizeCode: 's', position: 0 },
          { displayValue: 'M', sizeCode: 'm', position: 1 },
          { displayValue: 'L', sizeCode: 'l', position: 2 },
          { displayValue: 'XL', sizeCode: 'xl', position: 3 },
        ],
      },
    ],
    media: [
      {
        url: 'https://images.unsplash.com/photo-1583496661160-fb5886a0aaaa?auto=format&fit=crop&w=1200&q=80',
        role: 'THUMBNAIL',
        isPrimary: true,
        position: 0,
      },
      {
        url: 'https://images.unsplash.com/photo-1576995853123-5a10305d93c0?auto=format&fit=crop&w=1200&q=80',
        role: 'COLOR_GALLERY',
        colorCode: 'beige',
        position: 1,
      },
      {
        url: 'https://images.unsplash.com/photo-1509551388413-e18d0ac5d495?auto=format&fit=crop&w=1200&q=80',
        role: 'COLOR_GALLERY',
        colorCode: 'terracotta',
        position: 2,
      },
    ],
    variants: [
      // Olive Green (S, M, L, XL)
      {
        sku: 'SKIRT-LIN-OLV-S',
        title: 'Artisanal Linen Tiered Maxi Skirt - Olive Green / S',
        optionSelections: [
          { axisName: 'Color', valueDisplay: 'Olive Green' },
          { axisName: 'Size', valueDisplay: 'S' },
        ],
        amount: '3250.00',
        compareAtAmount: '3800.00',
        barcode: '8941001001',
        primaryColorCode: 'olive-green',
        weightGrams: 380,
        stocks: [
          { warehouseCode: 'WH-WEST-01', quantity: '15' },
          { warehouseCode: 'WH-EAST-01', quantity: '8' },
        ],
      },
      {
        sku: 'SKIRT-LIN-OLV-M',
        title: 'Artisanal Linen Tiered Maxi Skirt - Olive Green / M',
        optionSelections: [
          { axisName: 'Color', valueDisplay: 'Olive Green' },
          { axisName: 'Size', valueDisplay: 'M' },
        ],
        amount: '3250.00',
        compareAtAmount: '3800.00',
        barcode: '8941001002',
        primaryColorCode: 'olive-green',
        weightGrams: 390,
        stocks: [
          { warehouseCode: 'WH-WEST-01', quantity: '20' },
          { warehouseCode: 'WH-EAST-01', quantity: '12' },
        ],
      },
      {
        sku: 'SKIRT-LIN-OLV-L',
        title: 'Artisanal Linen Tiered Maxi Skirt - Olive Green / L',
        optionSelections: [
          { axisName: 'Color', valueDisplay: 'Olive Green' },
          { axisName: 'Size', valueDisplay: 'L' },
        ],
        amount: '3250.00',
        compareAtAmount: '3800.00',
        barcode: '8941001003',
        primaryColorCode: 'olive-green',
        weightGrams: 410,
        stocks: [
          { warehouseCode: 'WH-WEST-01', quantity: '10' },
          { warehouseCode: 'WH-EAST-01', quantity: '6' },
        ],
      },
      {
        sku: 'SKIRT-LIN-OLV-XL',
        title: 'Artisanal Linen Tiered Maxi Skirt - Olive Green / XL',
        optionSelections: [
          { axisName: 'Color', valueDisplay: 'Olive Green' },
          { axisName: 'Size', valueDisplay: 'XL' },
        ],
        amount: '3250.00',
        compareAtAmount: '3800.00',
        barcode: '8941001004',
        primaryColorCode: 'olive-green',
        weightGrams: 420,
        stocks: [
          { warehouseCode: 'WH-WEST-01', quantity: '8' },
          { warehouseCode: 'WH-EAST-01', quantity: '4' },
        ],
      },
      // Beige (S, M, L, XL)
      {
        sku: 'SKIRT-LIN-BEI-S',
        title: 'Artisanal Linen Tiered Maxi Skirt - Beige / S',
        optionSelections: [
          { axisName: 'Color', valueDisplay: 'Beige' },
          { axisName: 'Size', valueDisplay: 'S' },
        ],
        amount: '3250.00',
        compareAtAmount: '3800.00',
        barcode: '8941001005',
        primaryColorCode: 'beige',
        weightGrams: 380,
        stocks: [
          { warehouseCode: 'WH-WEST-01', quantity: '18' },
          { warehouseCode: 'WH-EAST-01', quantity: '10' },
        ],
      },
      {
        sku: 'SKIRT-LIN-BEI-M',
        title: 'Artisanal Linen Tiered Maxi Skirt - Beige / M',
        optionSelections: [
          { axisName: 'Color', valueDisplay: 'Beige' },
          { axisName: 'Size', valueDisplay: 'M' },
        ],
        amount: '3250.00',
        compareAtAmount: '3800.00',
        barcode: '8941001006',
        primaryColorCode: 'beige',
        weightGrams: 390,
        stocks: [
          { warehouseCode: 'WH-WEST-01', quantity: '25' },
          { warehouseCode: 'WH-EAST-01', quantity: '15' },
        ],
      },
      {
        sku: 'SKIRT-LIN-BEI-L',
        title: 'Artisanal Linen Tiered Maxi Skirt - Beige / L',
        optionSelections: [
          { axisName: 'Color', valueDisplay: 'Beige' },
          { axisName: 'Size', valueDisplay: 'L' },
        ],
        amount: '3250.00',
        compareAtAmount: '3800.00',
        barcode: '8941001007',
        primaryColorCode: 'beige',
        weightGrams: 410,
        stocks: [
          { warehouseCode: 'WH-WEST-01', quantity: '12' },
          { warehouseCode: 'WH-EAST-01', quantity: '8' },
        ],
      },
      {
        sku: 'SKIRT-LIN-BEI-XL',
        title: 'Artisanal Linen Tiered Maxi Skirt - Beige / XL',
        optionSelections: [
          { axisName: 'Color', valueDisplay: 'Beige' },
          { axisName: 'Size', valueDisplay: 'XL' },
        ],
        amount: '3250.00',
        compareAtAmount: '3800.00',
        barcode: '8941001008',
        primaryColorCode: 'beige',
        weightGrams: 420,
        stocks: [
          { warehouseCode: 'WH-WEST-01', quantity: '6' },
          { warehouseCode: 'WH-EAST-01', quantity: '5' },
        ],
      },
      // Terracotta (S, M, L, XL)
      {
        sku: 'SKIRT-LIN-TER-S',
        title: 'Artisanal Linen Tiered Maxi Skirt - Terracotta / S',
        optionSelections: [
          { axisName: 'Color', valueDisplay: 'Terracotta' },
          { axisName: 'Size', valueDisplay: 'S' },
        ],
        amount: '3250.00',
        compareAtAmount: '3800.00',
        barcode: '8941001009',
        primaryColorCode: 'terracotta',
        weightGrams: 380,
        stocks: [
          { warehouseCode: 'WH-WEST-01', quantity: '14' },
          { warehouseCode: 'WH-EAST-01', quantity: '9' },
        ],
      },
      {
        sku: 'SKIRT-LIN-TER-M',
        title: 'Artisanal Linen Tiered Maxi Skirt - Terracotta / M',
        optionSelections: [
          { axisName: 'Color', valueDisplay: 'Terracotta' },
          { axisName: 'Size', valueDisplay: 'M' },
        ],
        amount: '3250.00',
        compareAtAmount: '3800.00',
        barcode: '8941001010',
        primaryColorCode: 'terracotta',
        weightGrams: 390,
        stocks: [
          { warehouseCode: 'WH-WEST-01', quantity: '16' },
          { warehouseCode: 'WH-EAST-01', quantity: '10' },
        ],
      },
      {
        sku: 'SKIRT-LIN-TER-L',
        title: 'Artisanal Linen Tiered Maxi Skirt - Terracotta / L',
        optionSelections: [
          { axisName: 'Color', valueDisplay: 'Terracotta' },
          { axisName: 'Size', valueDisplay: 'L' },
        ],
        amount: '3250.00',
        compareAtAmount: '3800.00',
        barcode: '8941001011',
        primaryColorCode: 'terracotta',
        weightGrams: 410,
        stocks: [
          { warehouseCode: 'WH-WEST-01', quantity: '10' },
          { warehouseCode: 'WH-EAST-01', quantity: '5' },
        ],
      },
      {
        sku: 'SKIRT-LIN-TER-XL',
        title: 'Artisanal Linen Tiered Maxi Skirt - Terracotta / XL',
        optionSelections: [
          { axisName: 'Color', valueDisplay: 'Terracotta' },
          { axisName: 'Size', valueDisplay: 'XL' },
        ],
        amount: '3250.00',
        compareAtAmount: '3800.00',
        barcode: '8941001012',
        primaryColorCode: 'terracotta',
        weightGrams: 420,
        stocks: [
          { warehouseCode: 'WH-WEST-01', quantity: '8' },
          { warehouseCode: 'WH-EAST-01', quantity: '3' },
        ],
      },
    ],
  },

  // ─── 2. Mulberry Silk Embroidered Kurti Top ────────────────────────────────
  {
    title: 'Mulberry Silk Embroidered Kurti Top',
    handle: 'mulberry-silk-embroidered-kurti-top',
    productTypeCode: 'top',
    primaryCategoryHandle: 'tops',
    additionalCategoryHandles: ['clothing'],
    sizeSystemCode: 'womens-apparel-alpha',
    description:
      'Luxurious pure mulberry silk kurti top featuring intricate zardozi floral handwork along the split neckline and sleeves. Tailored with clean side slits for celebratory occasions and festive evenings.',
    tagNames: ['Elegant', 'Festive', 'Traditional', 'Handmade'],
    occasionNames: ['Festive', 'Party', 'Evening'],
    collectionNames: ['Best Sellers', 'New Arrivals'],
    options: [
      {
        name: 'Color',
        values: [
          { displayValue: 'Burgundy', colorCode: 'burgundy', position: 0 },
          { displayValue: 'Navy Blue', colorCode: 'navy-blue', position: 1 },
          { displayValue: 'Ivory', colorCode: 'ivory', position: 2 },
        ],
      },
      {
        name: 'Size',
        values: [
          { displayValue: 'XS', sizeCode: 'xs', position: 0 },
          { displayValue: 'S', sizeCode: 's', position: 1 },
          { displayValue: 'M', sizeCode: 'm', position: 2 },
          { displayValue: 'L', sizeCode: 'l', position: 3 },
          { displayValue: 'XL', sizeCode: 'xl', position: 4 },
        ],
      },
    ],
    media: [
      {
        url: 'https://images.unsplash.com/photo-1610030469983-98e550d6193c?auto=format&fit=crop&w=1200&q=80',
        role: 'THUMBNAIL',
        isPrimary: true,
        position: 0,
      },
      {
        url: 'https://images.unsplash.com/photo-1594633312681-425c7b97ccd1?auto=format&fit=crop&w=1200&q=80',
        role: 'COLOR_GALLERY',
        colorCode: 'navy-blue',
        position: 1,
      },
      {
        url: 'https://images.unsplash.com/photo-1551803091-e20673f15770?auto=format&fit=crop&w=1200&q=80',
        role: 'COLOR_GALLERY',
        colorCode: 'ivory',
        position: 2,
      },
    ],
    variants: [
      // Burgundy
      {
        sku: 'TOP-SLK-BUR-XS',
        title: 'Mulberry Silk Embroidered Kurti Top - Burgundy / XS',
        optionSelections: [
          { axisName: 'Color', valueDisplay: 'Burgundy' },
          { axisName: 'Size', valueDisplay: 'XS' },
        ],
        amount: '4500.00',
        compareAtAmount: '5200.00',
        barcode: '8941002001',
        primaryColorCode: 'burgundy',
        weightGrams: 260,
        stocks: [
          { warehouseCode: 'WH-WEST-01', quantity: '8' },
          { warehouseCode: 'WH-EAST-01', quantity: '5' },
        ],
      },
      {
        sku: 'TOP-SLK-BUR-S',
        title: 'Mulberry Silk Embroidered Kurti Top - Burgundy / S',
        optionSelections: [
          { axisName: 'Color', valueDisplay: 'Burgundy' },
          { axisName: 'Size', valueDisplay: 'S' },
        ],
        amount: '4500.00',
        compareAtAmount: '5200.00',
        barcode: '8941002002',
        primaryColorCode: 'burgundy',
        weightGrams: 270,
        stocks: [
          { warehouseCode: 'WH-WEST-01', quantity: '14' },
          { warehouseCode: 'WH-EAST-01', quantity: '10' },
        ],
      },
      {
        sku: 'TOP-SLK-BUR-M',
        title: 'Mulberry Silk Embroidered Kurti Top - Burgundy / M',
        optionSelections: [
          { axisName: 'Color', valueDisplay: 'Burgundy' },
          { axisName: 'Size', valueDisplay: 'M' },
        ],
        amount: '4500.00',
        compareAtAmount: '5200.00',
        barcode: '8941002003',
        primaryColorCode: 'burgundy',
        weightGrams: 280,
        stocks: [
          { warehouseCode: 'WH-WEST-01', quantity: '18' },
          { warehouseCode: 'WH-EAST-01', quantity: '12' },
        ],
      },
      {
        sku: 'TOP-SLK-BUR-L',
        title: 'Mulberry Silk Embroidered Kurti Top - Burgundy / L',
        optionSelections: [
          { axisName: 'Color', valueDisplay: 'Burgundy' },
          { axisName: 'Size', valueDisplay: 'L' },
        ],
        amount: '4500.00',
        compareAtAmount: '5200.00',
        barcode: '8941002004',
        primaryColorCode: 'burgundy',
        weightGrams: 295,
        stocks: [
          { warehouseCode: 'WH-WEST-01', quantity: '10' },
          { warehouseCode: 'WH-EAST-01', quantity: '8' },
        ],
      },
      {
        sku: 'TOP-SLK-BUR-XL',
        title: 'Mulberry Silk Embroidered Kurti Top - Burgundy / XL',
        optionSelections: [
          { axisName: 'Color', valueDisplay: 'Burgundy' },
          { axisName: 'Size', valueDisplay: 'XL' },
        ],
        amount: '4500.00',
        compareAtAmount: '5200.00',
        barcode: '8941002005',
        primaryColorCode: 'burgundy',
        weightGrams: 310,
        stocks: [
          { warehouseCode: 'WH-WEST-01', quantity: '6' },
          { warehouseCode: 'WH-EAST-01', quantity: '4' },
        ],
      },
      // Navy Blue
      {
        sku: 'TOP-SLK-NVY-XS',
        title: 'Mulberry Silk Embroidered Kurti Top - Navy Blue / XS',
        optionSelections: [
          { axisName: 'Color', valueDisplay: 'Navy Blue' },
          { axisName: 'Size', valueDisplay: 'XS' },
        ],
        amount: '4500.00',
        compareAtAmount: '5200.00',
        barcode: '8941002006',
        primaryColorCode: 'navy-blue',
        weightGrams: 260,
        stocks: [
          { warehouseCode: 'WH-WEST-01', quantity: '7' },
          { warehouseCode: 'WH-EAST-01', quantity: '4' },
        ],
      },
      {
        sku: 'TOP-SLK-NVY-S',
        title: 'Mulberry Silk Embroidered Kurti Top - Navy Blue / S',
        optionSelections: [
          { axisName: 'Color', valueDisplay: 'Navy Blue' },
          { axisName: 'Size', valueDisplay: 'S' },
        ],
        amount: '4500.00',
        compareAtAmount: '5200.00',
        barcode: '8941002007',
        primaryColorCode: 'navy-blue',
        weightGrams: 270,
        stocks: [
          { warehouseCode: 'WH-WEST-01', quantity: '15' },
          { warehouseCode: 'WH-EAST-01', quantity: '10' },
        ],
      },
      {
        sku: 'TOP-SLK-NVY-M',
        title: 'Mulberry Silk Embroidered Kurti Top - Navy Blue / M',
        optionSelections: [
          { axisName: 'Color', valueDisplay: 'Navy Blue' },
          { axisName: 'Size', valueDisplay: 'M' },
        ],
        amount: '4500.00',
        compareAtAmount: '5200.00',
        barcode: '8941002008',
        primaryColorCode: 'navy-blue',
        weightGrams: 280,
        stocks: [
          { warehouseCode: 'WH-WEST-01', quantity: '20' },
          { warehouseCode: 'WH-EAST-01', quantity: '14' },
        ],
      },
      {
        sku: 'TOP-SLK-NVY-L',
        title: 'Mulberry Silk Embroidered Kurti Top - Navy Blue / L',
        optionSelections: [
          { axisName: 'Color', valueDisplay: 'Navy Blue' },
          { axisName: 'Size', valueDisplay: 'L' },
        ],
        amount: '4500.00',
        compareAtAmount: '5200.00',
        barcode: '8941002009',
        primaryColorCode: 'navy-blue',
        weightGrams: 295,
        stocks: [
          { warehouseCode: 'WH-WEST-01', quantity: '12' },
          { warehouseCode: 'WH-EAST-01', quantity: '7' },
        ],
      },
      {
        sku: 'TOP-SLK-NVY-XL',
        title: 'Mulberry Silk Embroidered Kurti Top - Navy Blue / XL',
        optionSelections: [
          { axisName: 'Color', valueDisplay: 'Navy Blue' },
          { axisName: 'Size', valueDisplay: 'XL' },
        ],
        amount: '4500.00',
        compareAtAmount: '5200.00',
        barcode: '8941002010',
        primaryColorCode: 'navy-blue',
        weightGrams: 310,
        stocks: [
          { warehouseCode: 'WH-WEST-01', quantity: '6' },
          { warehouseCode: 'WH-EAST-01', quantity: '5' },
        ],
      },
      // Ivory
      {
        sku: 'TOP-SLK-IVO-XS',
        title: 'Mulberry Silk Embroidered Kurti Top - Ivory / XS',
        optionSelections: [
          { axisName: 'Color', valueDisplay: 'Ivory' },
          { axisName: 'Size', valueDisplay: 'XS' },
        ],
        amount: '4500.00',
        compareAtAmount: '5200.00',
        barcode: '8941002011',
        primaryColorCode: 'ivory',
        weightGrams: 260,
        stocks: [
          { warehouseCode: 'WH-WEST-01', quantity: '10' },
          { warehouseCode: 'WH-EAST-01', quantity: '6' },
        ],
      },
      {
        sku: 'TOP-SLK-IVO-S',
        title: 'Mulberry Silk Embroidered Kurti Top - Ivory / S',
        optionSelections: [
          { axisName: 'Color', valueDisplay: 'Ivory' },
          { axisName: 'Size', valueDisplay: 'S' },
        ],
        amount: '4500.00',
        compareAtAmount: '5200.00',
        barcode: '8941002012',
        primaryColorCode: 'ivory',
        weightGrams: 270,
        stocks: [
          { warehouseCode: 'WH-WEST-01', quantity: '16' },
          { warehouseCode: 'WH-EAST-01', quantity: '11' },
        ],
      },
      {
        sku: 'TOP-SLK-IVO-M',
        title: 'Mulberry Silk Embroidered Kurti Top - Ivory / M',
        optionSelections: [
          { axisName: 'Color', valueDisplay: 'Ivory' },
          { axisName: 'Size', valueDisplay: 'M' },
        ],
        amount: '4500.00',
        compareAtAmount: '5200.00',
        barcode: '8941002013',
        primaryColorCode: 'ivory',
        weightGrams: 280,
        stocks: [
          { warehouseCode: 'WH-WEST-01', quantity: '22' },
          { warehouseCode: 'WH-EAST-01', quantity: '15' },
        ],
      },
      {
        sku: 'TOP-SLK-IVO-L',
        title: 'Mulberry Silk Embroidered Kurti Top - Ivory / L',
        optionSelections: [
          { axisName: 'Color', valueDisplay: 'Ivory' },
          { axisName: 'Size', valueDisplay: 'L' },
        ],
        amount: '4500.00',
        compareAtAmount: '5200.00',
        barcode: '8941002014',
        primaryColorCode: 'ivory',
        weightGrams: 295,
        stocks: [
          { warehouseCode: 'WH-WEST-01', quantity: '14' },
          { warehouseCode: 'WH-EAST-01', quantity: '8' },
        ],
      },
      {
        sku: 'TOP-SLK-IVO-XL',
        title: 'Mulberry Silk Embroidered Kurti Top - Ivory / XL',
        optionSelections: [
          { axisName: 'Color', valueDisplay: 'Ivory' },
          { axisName: 'Size', valueDisplay: 'XL' },
        ],
        amount: '4500.00',
        compareAtAmount: '5200.00',
        barcode: '8941002015',
        primaryColorCode: 'ivory',
        weightGrams: 310,
        stocks: [
          { warehouseCode: 'WH-WEST-01', quantity: '8' },
          { warehouseCode: 'WH-EAST-01', quantity: '6' },
        ],
      },
    ],
  },

  // ─── 3. Handwoven Straw Tote Bag with Leather Handles ──────────────────────
  {
    title: 'Handwoven Straw Tote Bag with Leather Handles',
    handle: 'handwoven-straw-tote-bag-with-leather-handles',
    productTypeCode: 'tote-bag',
    primaryCategoryHandle: 'tote-bags',
    additionalCategoryHandles: ['beach-woven-bags', 'bags'],
    description:
      'Artisanal handwoven sun-dried palm leaf tote reinforced with genuine pull-up leather handles. Spacious open interior with a secure cotton drawstring lining for market mornings, picnics, and beach travels.',
    tagNames: ['Boho', 'Summer', 'Natural', 'Handmade'],
    occasionNames: ['Vacation', 'Weekend', 'Beach'],
    collectionNames: ['Summer Collection', 'Beach & Vacation'],
    options: [
      {
        name: 'Color',
        values: [
          { displayValue: 'Tan', colorCode: 'tan', position: 0 },
          { displayValue: 'Chocolate Brown', colorCode: 'chocolate-brown', position: 1 },
        ],
      },
    ],
    media: [
      {
        url: 'https://images.unsplash.com/photo-1590874103328-eac38a683ce7?auto=format&fit=crop&w=1200&q=80',
        role: 'THUMBNAIL',
        isPrimary: true,
        position: 0,
      },
      {
        url: 'https://images.unsplash.com/photo-1544816155-12df9643f363?auto=format&fit=crop&w=1200&q=80',
        role: 'COLOR_GALLERY',
        colorCode: 'chocolate-brown',
        position: 1,
      },
    ],
    variants: [
      {
        sku: 'BAG-STR-TAN-OS',
        title: 'Handwoven Straw Tote Bag - Tan',
        optionSelections: [{ axisName: 'Color', valueDisplay: 'Tan' }],
        amount: '2850.00',
        compareAtAmount: '3400.00',
        barcode: '8941003001',
        primaryColorCode: 'tan',
        weightGrams: 520,
        stocks: [
          { warehouseCode: 'WH-WEST-01', quantity: '25' },
          { warehouseCode: 'WH-EAST-01', quantity: '18' },
        ],
      },
      {
        sku: 'BAG-STR-BRN-OS',
        title: 'Handwoven Straw Tote Bag - Chocolate Brown',
        optionSelections: [{ axisName: 'Color', valueDisplay: 'Chocolate Brown' }],
        amount: '2850.00',
        compareAtAmount: '3400.00',
        barcode: '8941003002',
        primaryColorCode: 'chocolate-brown',
        weightGrams: 520,
        stocks: [
          { warehouseCode: 'WH-WEST-01', quantity: '20' },
          { warehouseCode: 'WH-EAST-01', quantity: '14' },
        ],
      },
    ],
  },

  // ─── 4. French Acetate Oversized Floral Claw Clip ───────────────────────────
  {
    title: 'French Acetate Oversized Floral Claw Clip',
    handle: 'french-acetate-oversized-floral-claw-clip',
    productTypeCode: 'claw-clip',
    primaryCategoryHandle: 'claw-clips',
    additionalCategoryHandles: ['hair-clips-pins', 'hair-accessories'],
    description:
      'Hand-polished cellulose acetate hair claw sculpted into an elegant bloomed camellia blossom. Features strong gold-toned steel spring tension and rounded non-slip teeth that hold thick and fine hair securely without pulling.',
    tagNames: ['Cute', 'Floral', 'Everyday', 'Romantic'],
    occasionNames: ['Casual', 'Daily Wear', 'Brunch'],
    collectionNames: ['Floral Collection', 'Best Sellers'],
    options: [
      {
        name: 'Color',
        values: [
          { displayValue: 'Blush Pink', colorCode: 'blush-pink', position: 0 },
          { displayValue: 'Cream', colorCode: 'cream', position: 1 },
          { displayValue: 'Lilac', colorCode: 'lilac', position: 2 },
          { displayValue: 'Sage Green', colorCode: 'sage-green', position: 3 },
        ],
      },
    ],
    media: [
      {
        url: 'https://images.unsplash.com/photo-1608248597359-58a0e2380f2d?auto=format&fit=crop&w=1200&q=80',
        role: 'THUMBNAIL',
        isPrimary: true,
        position: 0,
      },
      {
        url: 'https://images.unsplash.com/photo-1607613009820-a29f7bb81c04?auto=format&fit=crop&w=1200&q=80',
        role: 'COLOR_GALLERY',
        colorCode: 'cream',
        position: 1,
      },
    ],
    variants: [
      {
        sku: 'CLIP-FLR-PNK-OS',
        title: 'Floral Claw Clip - Blush Pink',
        optionSelections: [{ axisName: 'Color', valueDisplay: 'Blush Pink' }],
        amount: '480.00',
        compareAtAmount: '650.00',
        barcode: '8941004001',
        primaryColorCode: 'blush-pink',
        weightGrams: 45,
        stocks: [
          { warehouseCode: 'WH-WEST-01', quantity: '50' },
          { warehouseCode: 'WH-EAST-01', quantity: '35' },
        ],
      },
      {
        sku: 'CLIP-FLR-CRM-OS',
        title: 'Floral Claw Clip - Cream',
        optionSelections: [{ axisName: 'Color', valueDisplay: 'Cream' }],
        amount: '480.00',
        compareAtAmount: '650.00',
        barcode: '8941004002',
        primaryColorCode: 'cream',
        weightGrams: 45,
        stocks: [
          { warehouseCode: 'WH-WEST-01', quantity: '60' },
          { warehouseCode: 'WH-EAST-01', quantity: '40' },
        ],
      },
      {
        sku: 'CLIP-FLR-LIL-OS',
        title: 'Floral Claw Clip - Lilac',
        optionSelections: [{ axisName: 'Color', valueDisplay: 'Lilac' }],
        amount: '480.00',
        compareAtAmount: '650.00',
        barcode: '8941004003',
        primaryColorCode: 'lilac',
        weightGrams: 45,
        stocks: [
          { warehouseCode: 'WH-WEST-01', quantity: '40' },
          { warehouseCode: 'WH-EAST-01', quantity: '25' },
        ],
      },
      {
        sku: 'CLIP-FLR-SGE-OS',
        title: 'Floral Claw Clip - Sage Green',
        optionSelections: [{ axisName: 'Color', valueDisplay: 'Sage Green' }],
        amount: '480.00',
        compareAtAmount: '650.00',
        barcode: '8941004004',
        primaryColorCode: 'sage-green',
        weightGrams: 45,
        stocks: [
          { warehouseCode: 'WH-WEST-01', quantity: '35' },
          { warehouseCode: 'WH-EAST-01', quantity: '20' },
        ],
      },
    ],
  },

  // ─── 5. 18K Gold Plated Freshwater Pearl Pendant Necklace ─────────────────
  {
    title: '18K Gold Plated Freshwater Pearl Pendant Necklace',
    handle: '18k-gold-plated-freshwater-pearl-pendant-necklace',
    productTypeCode: 'necklace',
    primaryCategoryHandle: 'necklaces',
    additionalCategoryHandles: ['jewelry'],
    description:
      'Gleaming baroque genuine freshwater pearl suspended from a delicate Singapore link chain. Hypoallergenic stainless steel core vacuum-coated with thick 18K gold for long-lasting, water-resistant wear.',
    tagNames: ['Elegant', 'Minimal', 'Classic', 'Statement'],
    occasionNames: ['Party', 'Evening', 'Gift', 'Date Night'],
    collectionNames: ['Best Sellers', 'New Arrivals'],
    options: [
      {
        name: 'Finish',
        values: [
          { displayValue: 'Gold', colorCode: 'gold', position: 0 },
          { displayValue: 'Silver', colorCode: 'silver', position: 1 },
          { displayValue: 'Rose Gold', colorCode: 'rose-gold', position: 2 },
        ],
      },
    ],
    media: [
      {
        url: 'https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?auto=format&fit=crop&w=1200&q=80',
        role: 'THUMBNAIL',
        isPrimary: true,
        position: 0,
      },
      {
        url: 'https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?auto=format&fit=crop&w=1200&q=80',
        role: 'COLOR_GALLERY',
        colorCode: 'silver',
        position: 1,
      },
    ],
    variants: [
      {
        sku: 'NCK-PRL-GLD-OS',
        title: 'Freshwater Pearl Pendant Necklace - Gold',
        optionSelections: [{ axisName: 'Finish', valueDisplay: 'Gold' }],
        amount: '1850.00',
        compareAtAmount: '2200.00',
        barcode: '8941005001',
        primaryColorCode: 'gold',
        weightGrams: 28,
        stocks: [
          { warehouseCode: 'WH-WEST-01', quantity: '30' },
          { warehouseCode: 'WH-EAST-01', quantity: '20' },
        ],
      },
      {
        sku: 'NCK-PRL-SLV-OS',
        title: 'Freshwater Pearl Pendant Necklace - Silver',
        optionSelections: [{ axisName: 'Finish', valueDisplay: 'Silver' }],
        amount: '1850.00',
        compareAtAmount: '2200.00',
        barcode: '8941005002',
        primaryColorCode: 'silver',
        weightGrams: 28,
        stocks: [
          { warehouseCode: 'WH-WEST-01', quantity: '25' },
          { warehouseCode: 'WH-EAST-01', quantity: '15' },
        ],
      },
      {
        sku: 'NCK-PRL-RSG-OS',
        title: 'Freshwater Pearl Pendant Necklace - Rose Gold',
        optionSelections: [{ axisName: 'Finish', valueDisplay: 'Rose Gold' }],
        amount: '1850.00',
        compareAtAmount: '2200.00',
        barcode: '8941005003',
        primaryColorCode: 'rose-gold',
        weightGrams: 28,
        stocks: [
          { warehouseCode: 'WH-WEST-01', quantity: '20' },
          { warehouseCode: 'WH-EAST-01', quantity: '10' },
        ],
      },
    ],
  },

  // ─── 6. Bohemian Crochet Knit Two-Piece Halter Set ─────────────────────────
  {
    title: 'Bohemian Crochet Knit Two-Piece Halter Set',
    handle: 'bohemian-crochet-knit-two-piece-halter-set',
    productTypeCode: 'two-piece-set',
    primaryCategoryHandle: 'two-piece-sets',
    additionalCategoryHandles: ['sets', 'clothing'],
    sizeSystemCode: 'womens-apparel-alpha',
    description:
      'Hand-crocheted cotton two-piece ensemble featuring an open-back halter crop top and matching high-waisted scalloped hem skirt with an adjustable waist tie. Lightweight, unlined openwork knit designed for warm destinations.',
    tagNames: ['Boho', 'Summer', 'Casual', 'Handmade'],
    occasionNames: ['Vacation', 'Festival', 'Weekend'],
    collectionNames: ['Summer Collection', 'Beach & Vacation'],
    options: [
      {
        name: 'Color',
        values: [
          { displayValue: 'Off White', colorCode: 'off-white', position: 0 },
          { displayValue: 'Terracotta', colorCode: 'terracotta', position: 1 },
          { displayValue: 'Black', colorCode: 'black', position: 2 },
        ],
      },
      {
        name: 'Size',
        values: [
          { displayValue: 'S', sizeCode: 's', position: 0 },
          { displayValue: 'M', sizeCode: 'm', position: 1 },
          { displayValue: 'L', sizeCode: 'l', position: 2 },
        ],
      },
    ],
    media: [
      {
        url: 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=1200&q=80',
        role: 'THUMBNAIL',
        isPrimary: true,
        position: 0,
      },
      {
        url: 'https://images.unsplash.com/photo-1496747611176-843222e1e57c?auto=format&fit=crop&w=1200&q=80',
        role: 'COLOR_GALLERY',
        colorCode: 'terracotta',
        position: 1,
      },
    ],
    variants: [
      // Off White
      {
        sku: 'SET-CRC-WHT-S',
        title: 'Crochet Knit Two-Piece Set - Off White / S',
        optionSelections: [
          { axisName: 'Color', valueDisplay: 'Off White' },
          { axisName: 'Size', valueDisplay: 'S' },
        ],
        amount: '4200.00',
        compareAtAmount: '4900.00',
        barcode: '8941006001',
        primaryColorCode: 'off-white',
        weightGrams: 480,
        stocks: [
          { warehouseCode: 'WH-WEST-01', quantity: '10' },
          { warehouseCode: 'WH-EAST-01', quantity: '6' },
        ],
      },
      {
        sku: 'SET-CRC-WHT-M',
        title: 'Crochet Knit Two-Piece Set - Off White / M',
        optionSelections: [
          { axisName: 'Color', valueDisplay: 'Off White' },
          { axisName: 'Size', valueDisplay: 'M' },
        ],
        amount: '4200.00',
        compareAtAmount: '4900.00',
        barcode: '8941006002',
        primaryColorCode: 'off-white',
        weightGrams: 500,
        stocks: [
          { warehouseCode: 'WH-WEST-01', quantity: '15' },
          { warehouseCode: 'WH-EAST-01', quantity: '10' },
        ],
      },
      {
        sku: 'SET-CRC-WHT-L',
        title: 'Crochet Knit Two-Piece Set - Off White / L',
        optionSelections: [
          { axisName: 'Color', valueDisplay: 'Off White' },
          { axisName: 'Size', valueDisplay: 'L' },
        ],
        amount: '4200.00',
        compareAtAmount: '4900.00',
        barcode: '8941006003',
        primaryColorCode: 'off-white',
        weightGrams: 520,
        stocks: [
          { warehouseCode: 'WH-WEST-01', quantity: '8' },
          { warehouseCode: 'WH-EAST-01', quantity: '5' },
        ],
      },
      // Terracotta
      {
        sku: 'SET-CRC-TER-S',
        title: 'Crochet Knit Two-Piece Set - Terracotta / S',
        optionSelections: [
          { axisName: 'Color', valueDisplay: 'Terracotta' },
          { axisName: 'Size', valueDisplay: 'S' },
        ],
        amount: '4200.00',
        compareAtAmount: '4900.00',
        barcode: '8941006004',
        primaryColorCode: 'terracotta',
        weightGrams: 480,
        stocks: [
          { warehouseCode: 'WH-WEST-01', quantity: '8' },
          { warehouseCode: 'WH-EAST-01', quantity: '5' },
        ],
      },
      {
        sku: 'SET-CRC-TER-M',
        title: 'Crochet Knit Two-Piece Set - Terracotta / M',
        optionSelections: [
          { axisName: 'Color', valueDisplay: 'Terracotta' },
          { axisName: 'Size', valueDisplay: 'M' },
        ],
        amount: '4200.00',
        compareAtAmount: '4900.00',
        barcode: '8941006005',
        primaryColorCode: 'terracotta',
        weightGrams: 500,
        stocks: [
          { warehouseCode: 'WH-WEST-01', quantity: '12' },
          { warehouseCode: 'WH-EAST-01', quantity: '8' },
        ],
      },
      {
        sku: 'SET-CRC-TER-L',
        title: 'Crochet Knit Two-Piece Set - Terracotta / L',
        optionSelections: [
          { axisName: 'Color', valueDisplay: 'Terracotta' },
          { axisName: 'Size', valueDisplay: 'L' },
        ],
        amount: '4200.00',
        compareAtAmount: '4900.00',
        barcode: '8941006006',
        primaryColorCode: 'terracotta',
        weightGrams: 520,
        stocks: [
          { warehouseCode: 'WH-WEST-01', quantity: '7' },
          { warehouseCode: 'WH-EAST-01', quantity: '4' },
        ],
      },
      // Black
      {
        sku: 'SET-CRC-BLK-S',
        title: 'Crochet Knit Two-Piece Set - Black / S',
        optionSelections: [
          { axisName: 'Color', valueDisplay: 'Black' },
          { axisName: 'Size', valueDisplay: 'S' },
        ],
        amount: '4200.00',
        compareAtAmount: '4900.00',
        barcode: '8941006007',
        primaryColorCode: 'black',
        weightGrams: 480,
        stocks: [
          { warehouseCode: 'WH-WEST-01', quantity: '12' },
          { warehouseCode: 'WH-EAST-01', quantity: '7' },
        ],
      },
      {
        sku: 'SET-CRC-BLK-M',
        title: 'Crochet Knit Two-Piece Set - Black / M',
        optionSelections: [
          { axisName: 'Color', valueDisplay: 'Black' },
          { axisName: 'Size', valueDisplay: 'M' },
        ],
        amount: '4200.00',
        compareAtAmount: '4900.00',
        barcode: '8941006008',
        primaryColorCode: 'black',
        weightGrams: 500,
        stocks: [
          { warehouseCode: 'WH-WEST-01', quantity: '18' },
          { warehouseCode: 'WH-EAST-01', quantity: '12' },
        ],
      },
      {
        sku: 'SET-CRC-BLK-L',
        title: 'Crochet Knit Two-Piece Set - Black / L',
        optionSelections: [
          { axisName: 'Color', valueDisplay: 'Black' },
          { axisName: 'Size', valueDisplay: 'L' },
        ],
        amount: '4200.00',
        compareAtAmount: '4900.00',
        barcode: '8941006009',
        primaryColorCode: 'black',
        weightGrams: 520,
        stocks: [
          { warehouseCode: 'WH-WEST-01', quantity: '10' },
          { warehouseCode: 'WH-EAST-01', quantity: '6' },
        ],
      },
    ],
  },

  // ─── 7. Velvet Ribbon Bow Hair Tie Scrunchie ──────────────────────────────
  {
    title: 'Velvet Ribbon Bow Hair Tie Scrunchie',
    handle: 'velvet-ribbon-bow-hair-tie-scrunchie',
    productTypeCode: 'hair-clip',
    primaryCategoryHandle: 'hair-ties-scrunchies',
    additionalCategoryHandles: ['hair-accessories'],
    description:
      'Plush silk-blend velvet scrunchie adorned with elongated cascading ribbon tails. Gentle on strands to prevent creasing and breakage, making every pony or half-up style look effortlessly romantic.',
    tagNames: ['Romantic', 'Vintage', 'Cute', 'Everyday'],
    occasionNames: ['Party', 'Casual', 'Evening'],
    collectionNames: ['New Arrivals'],
    options: [
      {
        name: 'Color',
        values: [
          { displayValue: 'Wine', colorCode: 'wine', position: 0 },
          { displayValue: 'Emerald Green', colorCode: 'emerald-green', position: 1 },
          { displayValue: 'Navy Blue', colorCode: 'navy-blue', position: 2 },
          { displayValue: 'Black', colorCode: 'black', position: 3 },
        ],
      },
    ],
    media: [
      {
        url: 'https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&w=1200&q=80',
        role: 'THUMBNAIL',
        isPrimary: true,
        position: 0,
      },
    ],
    variants: [
      {
        sku: 'SCR-VLV-WIN-OS',
        title: 'Velvet Ribbon Bow Hair Tie - Wine',
        optionSelections: [{ axisName: 'Color', valueDisplay: 'Wine' }],
        amount: '350.00',
        compareAtAmount: '450.00',
        barcode: '8941007001',
        primaryColorCode: 'wine',
        weightGrams: 30,
        stocks: [
          { warehouseCode: 'WH-WEST-01', quantity: '45' },
          { warehouseCode: 'WH-EAST-01', quantity: '30' },
        ],
      },
      {
        sku: 'SCR-VLV-EMR-OS',
        title: 'Velvet Ribbon Bow Hair Tie - Emerald Green',
        optionSelections: [{ axisName: 'Color', valueDisplay: 'Emerald Green' }],
        amount: '350.00',
        compareAtAmount: '450.00',
        barcode: '8941007002',
        primaryColorCode: 'emerald-green',
        weightGrams: 30,
        stocks: [
          { warehouseCode: 'WH-WEST-01', quantity: '40' },
          { warehouseCode: 'WH-EAST-01', quantity: '25' },
        ],
      },
      {
        sku: 'SCR-VLV-NVY-OS',
        title: 'Velvet Ribbon Bow Hair Tie - Navy Blue',
        optionSelections: [{ axisName: 'Color', valueDisplay: 'Navy Blue' }],
        amount: '350.00',
        compareAtAmount: '450.00',
        barcode: '8941007003',
        primaryColorCode: 'navy-blue',
        weightGrams: 30,
        stocks: [
          { warehouseCode: 'WH-WEST-01', quantity: '35' },
          { warehouseCode: 'WH-EAST-01', quantity: '25' },
        ],
      },
      {
        sku: 'SCR-VLV-BLK-OS',
        title: 'Velvet Ribbon Bow Hair Tie - Black',
        optionSelections: [{ axisName: 'Color', valueDisplay: 'Black' }],
        amount: '350.00',
        compareAtAmount: '450.00',
        barcode: '8941007004',
        primaryColorCode: 'black',
        weightGrams: 30,
        stocks: [
          { warehouseCode: 'WH-WEST-01', quantity: '50' },
          { warehouseCode: 'WH-EAST-01', quantity: '35' },
        ],
      },
    ],
  },

  // ─── 8. Wide-Brim Ribbon Trimmed Straw Sun Hat ────────────────────────────
  {
    title: 'Wide-Brim Ribbon Trimmed Straw Sun Hat',
    handle: 'wide-brim-ribbon-trimmed-straw-sun-hat',
    productTypeCode: 'sun-hat',
    primaryCategoryHandle: 'sun-hats',
    additionalCategoryHandles: ['hats-headwear'],
    description:
      'Classic UPF 50+ paper-braid straw sun hat woven with a sun-shading wide brim and finished with an interchangeable grosgrain ribbon tie. Features an interior adjustable sweatband for custom sizing.',
    tagNames: ['Summer', 'Beach', 'Statement'],
    occasionNames: ['Vacation', 'Beach', 'Weekend'],
    collectionNames: ['Summer Collection', 'Beach & Vacation'],
    options: [
      {
        name: 'Color',
        values: [
          { displayValue: 'Tan', colorCode: 'tan', position: 0 },
          { displayValue: 'Ivory', colorCode: 'ivory', position: 1 },
        ],
      },
    ],
    media: [
      {
        url: 'https://images.unsplash.com/photo-1521369909029-2afed882baee?auto=format&fit=crop&w=1200&q=80',
        role: 'THUMBNAIL',
        isPrimary: true,
        position: 0,
      },
    ],
    variants: [
      {
        sku: 'HAT-STR-TAN-OS',
        title: 'Wide-Brim Straw Sun Hat - Tan',
        optionSelections: [{ axisName: 'Color', valueDisplay: 'Tan' }],
        amount: '1950.00',
        compareAtAmount: '2400.00',
        barcode: '8941008001',
        primaryColorCode: 'tan',
        weightGrams: 220,
        stocks: [
          { warehouseCode: 'WH-WEST-01', quantity: '20' },
          { warehouseCode: 'WH-EAST-01', quantity: '15' },
        ],
      },
      {
        sku: 'HAT-STR-IVO-OS',
        title: 'Wide-Brim Straw Sun Hat - Ivory',
        optionSelections: [{ axisName: 'Color', valueDisplay: 'Ivory' }],
        amount: '1950.00',
        compareAtAmount: '2400.00',
        barcode: '8941008002',
        primaryColorCode: 'ivory',
        weightGrams: 220,
        stocks: [
          { warehouseCode: 'WH-WEST-01', quantity: '18' },
          { warehouseCode: 'WH-EAST-01', quantity: '12' },
        ],
      },
    ],
  },
];
