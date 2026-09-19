import type { CatalogAttributeScope, CatalogAttributeValueType } from '../../catalog-product-types.js';

export interface ProductTypeAttributeSeedItem {
  readonly productTypeCode: string;
  readonly name: string;
  readonly code: string;
  readonly scope: CatalogAttributeScope;
  readonly valueType: CatalogAttributeValueType;
  readonly filterable?: boolean;
  readonly options?: readonly string[];
}

const materials = ['Metal', 'Stainless Steel', 'Alloy', 'Fabric', 'Cotton', 'Polyester', 'Lace', 'Crochet', 'Straw', 'Raffia', 'Bamboo', 'Woven', 'Plastic', 'Acrylic', 'Resin', 'Faux Pearl', 'Shell', 'Mixed Material', 'Other'];
const finishes = ['Gold Tone', 'Silver Tone', 'Rose Gold Tone', 'Antique Gold', 'Antique Silver', 'Matte', 'Glossy', 'Natural', 'Other'];
const fit = ['Slim', 'Regular', 'Relaxed', 'Loose', 'Oversized'];
const stretch = ['None', 'Low', 'Medium', 'High'];
const opacity = ['Sheer', 'Semi-Sheer', 'Opaque'];
const bagClosures = ['Open', 'Zipper', 'Magnetic Snap', 'Button', 'Drawstring', 'Clasp', 'Flap', 'Other'];
const jewelryClosures = ['Lobster Clasp', 'Spring Ring', 'Hook', 'Toggle', 'Slide', 'Open / No Closure', 'Adjustable', 'Other'];
const earringStyles = ['Stud', 'Drop', 'Dangle', 'Hoop', 'Double-Sided', 'Other'];
const earringClosures = ['Push Back', 'Screw Back', 'Hook', 'Lever Back', 'Clip-On', 'Other'];
const nailShapes = ['Almond', 'Oval', 'Square', 'Round', 'Coffin', 'Stiletto', 'Other'];
const nailLengths = ['Short', 'Medium', 'Long', 'Extra Long'];
const nailFinishes = ['Glossy', 'Matte', 'Glitter', 'Metallic', '3D', 'Natural', 'Other'];

const product = (productTypeCode: string, name: string, code: string, valueType: CatalogAttributeValueType = 'TEXT', filterable = false, options?: readonly string[]): ProductTypeAttributeSeedItem => ({ productTypeCode, name, code, scope: 'PRODUCT', valueType, filterable, ...(options ? { options } : {}) });
const variant = (productTypeCode: string, name: string, code: string): ProductTypeAttributeSeedItem => ({ productTypeCode, name, code, scope: 'VARIANT', valueType: 'DECIMAL' });
const common = (type: string, names: readonly string[], variants: readonly string[] = []) => [
  ...names.map((name) => {
    const code = `${type}-${name.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-').replaceAll(/(^-|-$)/g, '')}`;
    if (name === 'Material') return product(type, name, 'material', 'REFERENCE', true, materials);
    if (name === 'Finish') return product(type, name, 'finish', 'REFERENCE', true, finishes);
    if (['Adjustable', 'Stretchable', 'Non-Slip', 'Lining'].includes(name)) return product(type, name, name.toLowerCase(), 'BOOLEAN');
    return product(type, name, code);
  }),
  ...variants.map((name) => variant(type, name, `${type}-${name.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-').replaceAll(/(^-|-$)/g, '')}`)),
];

/** Optional Product-Type fields. Size-guide measurements deliberately stay in sizing. */
export const productTypeAttributeSeedData: readonly ProductTypeAttributeSeedItem[] = [
  product('bracelet', 'Bracelet Style', 'bracelet-style', 'TEXT', true), product('bracelet', 'Material', 'material', 'REFERENCE', true, materials), product('bracelet', 'Closure Type', 'jewelry-closure-type', 'REFERENCE', true, jewelryClosures), product('bracelet', 'Adjustable', 'adjustable', 'BOOLEAN', true), product('bracelet', 'Decoration / Stone', 'bracelet-decoration-stone'), ...common('bracelet', [], ['Length', 'Circumference']),
  ...common('claw-clip', ['Clip Material', 'Decoration Material', 'Clip Shape', 'Finish'], ['Clip Length', 'Decorative Size']),
  product('clothes-hanger', 'Material', 'material', 'REFERENCE', true, materials), product('clothes-hanger', 'Hook Type', 'hook-type'), product('clothes-hanger', 'Suitable For', 'suitable-for'), product('clothes-hanger', 'Non-Slip', 'non-slip', 'BOOLEAN'), ...common('clothes-hanger', [], ['Width']),
  product('earrings', 'Earring Style', 'earring-style', 'REFERENCE', true, earringStyles), product('earrings', 'Material', 'material', 'REFERENCE', true, materials), product('earrings', 'Closure Type', 'earring-closure-type', 'REFERENCE', true, earringClosures), product('earrings', 'Decoration / Stone', 'earring-decoration-stone'), product('earrings', 'Finish', 'jewelry-finish', 'REFERENCE', true, finishes), ...common('earrings', [], ['Drop Length']),
  ...common('hair-clip', ['Clip Type', 'Material', 'Decoration Material', 'Finish'], ['Clip Length', 'Decorative Size']),
  ...common('hair-pin', ['Pin Type', 'Material', 'Decoration Material', 'Finish'], ['Pin Length', 'Decorative Size']),
  product('hair-wrap', 'Material', 'material', 'REFERENCE', true, materials), ...common('hair-wrap', ['Pattern', 'Shape', 'Stretchable'], ['Length', 'Width']),
  ...(['handbag', 'tote-bag'].flatMap((type) => [product(type, 'Material', 'material', 'REFERENCE', true, materials), product(type, 'Closure Type', 'bag-closure-type', 'REFERENCE', true, bagClosures), ...common(type, ['Lining', 'Compartments', 'Handle Type'], ['Width', 'Height', 'Depth', 'Handle Drop'])])),
  product('headband', 'Headband Style', 'headband-style', 'TEXT', true), product('headband', 'Material', 'material', 'REFERENCE', true, materials), ...common('headband', ['Decoration', 'Stretchable'], ['Band Width']),
  product('leggings-tights', 'Material', 'material', 'REFERENCE', true, materials), product('leggings-tights', 'Length Type', 'length-type', 'TEXT', true), ...common('leggings-tights', ['Foot Style']), product('leggings-tights', 'Opacity', 'opacity', 'REFERENCE', true, opacity), product('leggings-tights', 'Stretch Level', 'stretch-level', 'REFERENCE', true, stretch), product('leggings-tights', 'Waist Type', 'waist-type', 'TEXT', true),
  ...common('nail-glue', ['Glue Type', 'Form', 'Application Method'], ['Net Quantity']),
  ...(['nail-tips', 'press-on-nails'].flatMap((type) => [product(type, 'Nail Shape', 'nail-shape', 'REFERENCE', true, nailShapes), product(type, 'Nail Length', 'nail-length', 'REFERENCE', true, nailLengths), product(type, 'Finish', 'nail-finish', 'REFERENCE', true, nailFinishes), ...common(type, ['Application Type']), ...(type === 'press-on-nails' ? [product(type, 'Reusable', 'reusable', 'BOOLEAN')] : []), variant(type, 'Pieces Per Set', `${type}-pieces-per-set`)])),
  product('necklace', 'Necklace Style', 'necklace-style', 'TEXT', true), product('necklace', 'Material', 'material', 'REFERENCE', true, materials), ...common('necklace', ['Pendant Type']), product('necklace', 'Clasp Type', 'jewelry-closure-type', 'REFERENCE', true, jewelryClosures), product('necklace', 'Finish', 'jewelry-finish', 'REFERENCE', true, finishes), ...common('necklace', [], ['Chain Length', 'Extension Length']),
  product('pants-hanger', 'Material', 'material', 'REFERENCE', true, materials), ...common('pants-hanger', ['Hook Type', 'Clip Type']), product('pants-hanger', 'Non-Slip', 'non-slip', 'BOOLEAN'), ...common('pants-hanger', [], ['Width']),
  product('shoulder-bag', 'Material', 'material', 'REFERENCE', true, materials), product('shoulder-bag', 'Closure Type', 'bag-closure-type', 'REFERENCE', true, bagClosures), ...common('shoulder-bag', ['Lining', 'Compartments', 'Strap Type'], ['Width', 'Height', 'Depth', 'Strap Length']),
  product('skirt', 'Material', 'material', 'REFERENCE', true, materials), product('skirt', 'Skirt Style', 'skirt-style', 'TEXT', true), product('skirt', 'Waist Type', 'waist-type', 'TEXT', true), product('skirt', 'Fit', 'fit', 'REFERENCE', true, fit), product('skirt', 'Length Type', 'length-type', 'TEXT', true), product('skirt', 'Stretch Level', 'stretch-level', 'REFERENCE', true, stretch), ...common('skirt', ['Lining']),
  product('sun-hat', 'Material', 'material', 'REFERENCE', true, materials), product('sun-hat', 'Hat Style', 'hat-style', 'TEXT', true), ...common('sun-hat', ['Brim Style', 'Adjustable'], ['Brim Width', 'Crown Height']),
  product('top', 'Material', 'material', 'REFERENCE', true, materials), product('top', 'Top Style', 'top-style', 'TEXT', true), product('top', 'Neckline', 'neckline', 'TEXT', true), product('top', 'Sleeve Type', 'sleeve-type', 'TEXT', true), product('top', 'Sleeve Length', 'sleeve-length-type', 'TEXT', true), product('top', 'Fit', 'fit', 'REFERENCE', true, fit), product('top', 'Stretch Level', 'stretch-level', 'REFERENCE', true, stretch),
  product('triangle-headscarf', 'Material', 'material', 'REFERENCE', true, materials), ...common('triangle-headscarf', ['Pattern', 'Edge / Trim', 'Sheerness'], ['Length', 'Width']),
  product('two-piece-set', 'Material', 'material', 'REFERENCE', true, materials), product('two-piece-set', 'Set Components', 'set-components'), product('two-piece-set', 'Top Style', 'top-style', 'TEXT', true), product('two-piece-set', 'Bottom Style', 'bottom-style', 'TEXT', true), product('two-piece-set', 'Sleeve Type', 'sleeve-type', 'TEXT', true), product('two-piece-set', 'Fit', 'fit', 'REFERENCE', true, fit), product('two-piece-set', 'Stretch Level', 'stretch-level', 'REFERENCE', true, stretch),
  product('waist-chain', 'Material', 'material', 'REFERENCE', true, materials), product('waist-chain', 'Chain Style', 'chain-style', 'TEXT', true), product('waist-chain', 'Number of Layers', 'number-of-layers', 'INTEGER'), product('waist-chain', 'Closure Type', 'jewelry-closure-type', 'REFERENCE', true, jewelryClosures), product('waist-chain', 'Adjustable', 'adjustable', 'BOOLEAN', true), ...common('waist-chain', ['Decoration'], ['Total Length', 'Extension Length']),
];
