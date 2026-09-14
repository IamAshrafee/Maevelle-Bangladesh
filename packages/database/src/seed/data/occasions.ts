import type { VocabularySeedItem } from '../types.js';

/**
 * Canonical product usage occasions and contextual event settings for Maevelle.
 *
 * Occasions represent when and where a customer would wear or use a product.
 * Flexible merchandising vocabulary—not all products require an occasion.
 */
export const occasionSeedData: readonly VocabularySeedItem[] = [
  {
    name: 'Everyday',
    handle: 'everyday',
    description: 'Jewelry, hair accessories, and daily essentials',
  },
  {
    name: 'Casual Outing',
    handle: 'casual-outing',
    description: 'Bags, tops, hair accessories, and casual jewelry',
  },
  {
    name: 'Party',
    handle: 'party',
    description: 'Statement jewelry and decorative hair pieces',
  },
  {
    name: 'Date & Dinner',
    handle: 'date-and-dinner',
    description: 'Jewelry, outfits, and elegant evening accessories',
  },
  {
    name: 'Wedding & Invitation',
    handle: 'wedding-and-invitation',
    description: 'Decorative celebration jewelry and formal hair accessories',
  },
  {
    name: 'Beach & Vacation',
    handle: 'beach-and-vacation',
    description: 'Hats, woven bags, shell jewelry, waist chains, and resort accessories',
  },
  {
    name: 'Travel',
    handle: 'travel',
    description: 'Hats, travel bags, versatile outfits, and travel accessories',
  },
  {
    name: 'Photoshoot',
    handle: 'photoshoot',
    description: 'Flower crowns, decorative props, statement accessories, and stylized hats',
  },
  {
    name: 'Gift',
    handle: 'gift',
    description: 'Curated jewelry, giftable accessories, and lifestyle items',
  },
];
