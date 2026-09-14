import type { VocabularySeedItem } from '../types.js';

/**
 * Canonical product collections for Maevelle merchandising.
 *
 * Collections represent curated groups, editorial stories, and marketing themes.
 * Products can belong to multiple collections simultaneously.
 */
export const collectionSeedData: readonly VocabularySeedItem[] = [
  {
    name: 'New Arrivals',
    handle: 'new-arrivals',
    description: 'Recently added products and seasonal arrivals',
    position: 10,
  },
  {
    name: 'Best Sellers',
    handle: 'best-sellers',
    description: 'Proven popular and highly loved customer favorites',
    position: 20,
  },
  {
    name: 'Summer Collection',
    handle: 'summer-collection',
    description: 'Summer-friendly clothing, hats, and accessories',
    position: 30,
  },
  {
    name: 'Beach & Vacation',
    handle: 'beach-and-vacation',
    description: 'Hats, woven bags, shell jewelry, and resort styling',
    position: 40,
  },
  {
    name: 'Floral Collection',
    handle: 'floral-collection',
    description: 'Flower clips, floral headbands, and botanical accents',
    position: 50,
  },
  {
    name: 'Pearl Collection',
    handle: 'pearl-collection',
    description: 'Pearl earrings, necklaces, and refined jewelry',
    position: 60,
  },
  {
    name: 'Shell & Starfish Collection',
    handle: 'shell-and-starfish-collection',
    description: 'Coastal-inspired jewelry and seaside accessories',
    position: 70,
  },
  {
    name: 'Straw & Woven Collection',
    handle: 'straw-and-woven-collection',
    description: 'Straw hats, woven bags, and textured natural pieces',
    position: 80,
  },
  {
    name: 'Hair Accessories Edit',
    handle: 'hair-accessories-edit',
    description: 'Selected hair clips, headbands, and scarves',
    position: 90,
  },
  {
    name: 'Jewelry Edit',
    handle: 'jewelry-edit',
    description: 'Selected earrings, necklaces, and body jewelry',
    position: 100,
  },
  {
    name: 'Everyday Essentials',
    handle: 'everyday-essentials',
    description: 'Easy-to-use everyday pieces and daily staples',
    position: 110,
  },
  {
    name: 'Statement Pieces',
    handle: 'statement-pieces',
    description: 'Bold, visually strong jewelry and standout accessories',
    position: 120,
  },
  {
    name: 'Vacation Looks',
    handle: 'vacation-looks',
    description: 'Complete vacation-oriented styling and resort ensembles',
    position: 130,
  },
  {
    name: 'Nail Art Collection',
    handle: 'nail-art-collection',
    description: 'Artificial nails, nail tips, and nail care accessories',
    position: 140,
  },
];
