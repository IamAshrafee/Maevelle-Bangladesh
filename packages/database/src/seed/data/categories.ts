import type { CategorySeedItem } from '../types.js';

/**
 * Canonical product category hierarchy for Maevelle.
 *
 * Each category entry defines:
 * - name: Human-readable display label
 * - handle: (Optional) Canonical unique URL slug / identity key. If omitted, it will
 *   be deterministically generated via slugify(name).
 * - previousHandles: (Optional) Slugs this category was previously known by, used for
 *   graceful slug migrations without creating duplicate categories.
 * - status: (Optional) 'ACTIVE' | 'INACTIVE' | 'ARCHIVED' (defaults to 'ACTIVE')
 * - position: (Optional) Integer sort order (defaults to array index * 10)
 * - children: (Optional) Nested subcategories (arbitrary depth supported)
 */
export const categorySeedData: readonly CategorySeedItem[] = [
  {
    name: 'Hair Accessories',
    handle: 'hair-accessories',
    children: [
      {
        name: 'Hair Clips & Pins',
        handle: 'hair-clips-pins',
        children: [
          { name: 'Flower Hair Clips', handle: 'flower-hair-clips' },
          { name: 'Claw Clips', handle: 'claw-clips' },
          { name: 'Hair Pins', handle: 'hair-pins' },
        ],
      },
      {
        name: 'Headbands',
        handle: 'headbands',
        children: [
          { name: 'Fabric Headbands', handle: 'fabric-headbands' },
          { name: 'Flower Headbands', handle: 'flower-headbands' },
        ],
      },
      {
        name: 'Hair Scarves & Wraps',
        handle: 'hair-scarves-wraps',
        children: [
          { name: 'Triangle Headscarves', handle: 'triangle-headscarves' },
          { name: 'Hair Wraps', handle: 'hair-wraps' },
        ],
      },
      {
        name: 'Hair Ties & Scrunchies',
        handle: 'hair-ties-scrunchies',
      },
    ],
  },
  {
    name: 'Jewelry',
    handle: 'jewelry',
    children: [
      { name: 'Earrings', handle: 'earrings' },
      { name: 'Necklaces', handle: 'necklaces' },
      { name: 'Bracelets', handle: 'bracelets' },
      {
        name: 'Body Jewelry',
        handle: 'body-jewelry',
        children: [{ name: 'Waist Chains', handle: 'waist-chains' }],
      },
    ],
  },
  {
    name: 'Bags',
    handle: 'bags',
    children: [
      { name: 'Handbags', handle: 'handbags' },
      { name: 'Shoulder Bags', handle: 'shoulder-bags' },
      { name: 'Tote Bags', handle: 'tote-bags' },
      { name: 'Beach & Woven Bags', handle: 'beach-woven-bags' },
    ],
  },
  {
    name: 'Hats & Headwear',
    handle: 'hats-headwear',
    children: [
      { name: 'Sun Hats', handle: 'sun-hats' },
      { name: 'Straw Hats', handle: 'straw-hats' },
    ],
  },
  {
    name: 'Clothing',
    handle: 'clothing',
    children: [
      {
        name: 'Tops',
        handle: 'tops',
        children: [{ name: 'Crochet Tops', handle: 'crochet-tops' }],
      },
      {
        name: 'Bottoms',
        handle: 'bottoms',
        children: [
          { name: 'Skirts', handle: 'skirts' },
          { name: 'Leggings & Tights', handle: 'leggings-tights' },
        ],
      },
      {
        name: 'Sets',
        handle: 'sets',
        children: [{ name: 'Two-Piece Sets', handle: 'two-piece-sets' }],
      },
    ],
  },
  {
    name: 'Beauty & Nails',
    handle: 'beauty-nails',
    children: [
      {
        name: 'Artificial Nails',
        handle: 'artificial-nails',
        children: [
          { name: 'Press-On Nails', handle: 'press-on-nails' },
          { name: 'Nail Tips', handle: 'nail-tips' },
        ],
      },
      {
        name: 'Nail Accessories',
        handle: 'nail-accessories',
        children: [{ name: 'Nail Glue', handle: 'nail-glue' }],
      },
    ],
  },
  {
    name: 'Home & Lifestyle',
    handle: 'home-lifestyle',
    children: [
      {
        name: 'Closet Organization',
        handle: 'closet-organization',
        children: [
          { name: 'Clothes Hangers', handle: 'clothes-hangers' },
          { name: 'Pants Hangers', handle: 'pants-hangers' },
        ],
      },
    ],
  },
];
