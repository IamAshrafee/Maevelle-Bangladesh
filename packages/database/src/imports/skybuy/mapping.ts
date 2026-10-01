import type { SkyBuyProductMapping } from './types.js';

/**
 * SkyBuy listing identity is deliberately kept separate from Maevelle catalog identity.
 * Two supplier listings with the same title remain separate drafts until an operator merges them.
 */
export const SKYBUY_PRODUCT_MAPPINGS: Readonly<Record<string, SkyBuyProductMapping>> = {
  'abb-06515014607685': {
    productTypeCode: 'triangle-headscarf',
    primaryCategoryHandle: 'triangle-headscarves',
    additionalCategoryHandles: ['hair-scarves-wraps', 'hair-accessories'],
  },
  'abb-0348332031434': {
    productTypeCode: 'hair-clip',
    primaryCategoryHandle: 'flower-hair-clips',
    additionalCategoryHandles: ['hair-clips-pins', 'hair-accessories'],
  },
  'abb-0456002479207': {
    productTypeCode: 'headband',
    primaryCategoryHandle: 'flower-headbands',
    additionalCategoryHandles: ['headbands', 'hair-accessories'],
  },
  'abb-06508395603189': {
    productTypeCode: 'tote-bag',
    primaryCategoryHandle: 'beach-woven-bags',
    additionalCategoryHandles: ['tote-bags', 'bags'],
  },
  'abb-0414421322711': {
    productTypeCode: 'cup-mug',
    primaryCategoryHandle: 'cups-mugs',
    additionalCategoryHandles: ['drinkware', 'home-lifestyle'],
  },
  'abb-0410682453398': {
    productTypeCode: 'bracelet',
    primaryCategoryHandle: 'bracelets',
    additionalCategoryHandles: ['jewelry'],
  },
  'abb-0434220630215': {
    productTypeCode: 'waist-chain',
    primaryCategoryHandle: 'waist-chains',
    additionalCategoryHandles: ['body-jewelry', 'jewelry'],
  },
  'abb-0414700087558': {
    productTypeCode: 'handbag',
    primaryCategoryHandle: 'beach-woven-bags',
    additionalCategoryHandles: ['handbags', 'bags'],
  },
  'abb-06517988661531': {
    productTypeCode: 'clothes-hanger',
    primaryCategoryHandle: 'clothes-hangers',
    additionalCategoryHandles: ['closet-organization', 'home-lifestyle'],
  },
  'abb-06552840522598': {
    productTypeCode: 'earrings',
    primaryCategoryHandle: 'earrings',
    additionalCategoryHandles: ['jewelry'],
  },
  'abb-0426938457252': {
    productTypeCode: 'earrings',
    primaryCategoryHandle: 'earrings',
    additionalCategoryHandles: ['jewelry'],
  },
  'abb-0451938299661': {
    productTypeCode: 'high-heel-sandal',
    primaryCategoryHandle: 'sandals-heels',
    additionalCategoryHandles: ['womens-shoes', 'shoes'],
  },
  'abb-0412829875187': {
    productTypeCode: 'bracelet',
    primaryCategoryHandle: 'bracelets',
    additionalCategoryHandles: ['jewelry'],
  },
  'abb-0496420240746': {
    productTypeCode: 'necklace',
    primaryCategoryHandle: 'necklaces',
    additionalCategoryHandles: ['jewelry'],
  },
  'abb-0426371538562': {
    productTypeCode: 'leggings-tights',
    primaryCategoryHandle: 'leggings-tights',
    additionalCategoryHandles: ['bottoms', 'clothing'],
  },
  'abb-0443684399362': {
    productTypeCode: 'handbag',
    primaryCategoryHandle: 'handbags',
    additionalCategoryHandles: ['bags'],
  },
  'abb-06517315336675': {
    productTypeCode: 'shoulder-bag',
    primaryCategoryHandle: 'beach-woven-bags',
    additionalCategoryHandles: ['shoulder-bags', 'bags'],
  },
  'abb-0480136948429': {
    productTypeCode: 'sun-hat',
    primaryCategoryHandle: 'straw-hats',
    additionalCategoryHandles: ['sun-hats', 'hats-headwear'],
  },
  'abb-06508085554478': {
    productTypeCode: 'hair-wrap',
    primaryCategoryHandle: 'hair-wraps',
    additionalCategoryHandles: ['hair-scarves-wraps', 'hair-accessories'],
  },
  'abb-0433432770146': {
    productTypeCode: 'hair-clip',
    primaryCategoryHandle: 'hair-clips-pins',
    additionalCategoryHandles: ['hair-accessories'],
  },
  'abb-06508318628963': {
    productTypeCode: 'top',
    primaryCategoryHandle: 'crochet-tops',
    additionalCategoryHandles: ['tops', 'clothing'],
  },
  'abb-0213788019529': {
    productTypeCode: 'nail-glue',
    primaryCategoryHandle: 'nail-glue',
    additionalCategoryHandles: ['nail-accessories', 'beauty-nails'],
  },
  'abb-0414205795916': {
    productTypeCode: 'two-piece-set',
    primaryCategoryHandle: 'two-piece-sets',
    additionalCategoryHandles: ['sets', 'clothing'],
  },
  'abb-0429125267949': {
    productTypeCode: 'waist-chain',
    primaryCategoryHandle: 'waist-chains',
    additionalCategoryHandles: ['body-jewelry', 'jewelry'],
  },
  'abb-06515262684980': {
    productTypeCode: 'triangle-headscarf',
    primaryCategoryHandle: 'triangle-headscarves',
    additionalCategoryHandles: ['hair-scarves-wraps', 'hair-accessories'],
  },
  'abb-06508654424619': {
    productTypeCode: 'nail-tips',
    primaryCategoryHandle: 'nail-tips',
    additionalCategoryHandles: ['artificial-nails', 'beauty-nails'],
  },
  'abb-06586962329587': {
    productTypeCode: 'hair-clip',
    primaryCategoryHandle: 'flower-hair-clips',
    additionalCategoryHandles: ['hair-clips-pins', 'hair-accessories'],
  },
};
