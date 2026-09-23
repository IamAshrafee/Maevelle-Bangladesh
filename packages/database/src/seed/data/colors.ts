import type { ColorSeedItem } from '../types.js';

/**
 * Standardized, essential fashion colors with canonical codes, human-readable display names,
 * and hex swatch values for apparel and accessories.
 */
export const colorSeedData: readonly ColorSeedItem[] = [
  // 1. Monochrome & Neutrals
  { code: 'black', name: 'Black', hexValue: '#000000' },
  { code: 'white', name: 'White', hexValue: '#FFFFFF' },
  { code: 'off-white', name: 'Off White', hexValue: '#FAF9F6' },
  { code: 'ivory', name: 'Ivory', hexValue: '#FFFFF0' },
  { code: 'cream', name: 'Cream', hexValue: '#FFFDD0' },
  { code: 'beige', name: 'Beige', hexValue: '#F5F5DC' },
  { code: 'nude', name: 'Nude', hexValue: '#E3BC9A' },
  { code: 'taupe', name: 'Taupe', hexValue: '#B38B6D' },
  { code: 'tan', name: 'Tan', hexValue: '#D2B48C' },
  { code: 'camel', name: 'Camel', hexValue: '#C19A6B' },
  { code: 'charcoal', name: 'Charcoal', hexValue: '#36454F' },
  { code: 'grey', name: 'Grey', hexValue: '#808080' },
  { code: 'light-grey', name: 'Light Grey', hexValue: '#D3D3D3' },

  // 2. Earth Tones & Warm Neutrals
  { code: 'chocolate-brown', name: 'Chocolate Brown', hexValue: '#3D2314' },
  { code: 'brown', name: 'Brown', hexValue: '#8B4513' },
  { code: 'khaki', name: 'Khaki', hexValue: '#C3B091' },
  { code: 'olive-green', name: 'Olive Green', hexValue: '#556B2F' },
  { code: 'terracotta', name: 'Terracotta', hexValue: '#E2725B' },
  { code: 'rust', name: 'Rust', hexValue: '#B7410E' },

  // 3. Blues
  { code: 'navy-blue', name: 'Navy Blue', hexValue: '#000080' },
  { code: 'midnight-blue', name: 'Midnight Blue', hexValue: '#191970' },
  { code: 'royal-blue', name: 'Royal Blue', hexValue: '#4169E1' },
  { code: 'sky-blue', name: 'Sky Blue', hexValue: '#87CEEB' },
  { code: 'baby-blue', name: 'Baby Blue', hexValue: '#89CFF0' },
  { code: 'denim-blue', name: 'Denim Blue', hexValue: '#1560BD' },
  { code: 'teal', name: 'Teal', hexValue: '#008080' },

  // 4. Reds & Pinks
  { code: 'burgundy', name: 'Burgundy', hexValue: '#800020' },
  { code: 'maroon', name: 'Maroon', hexValue: '#800000' },
  { code: 'wine', name: 'Wine', hexValue: '#722F37' },
  { code: 'red', name: 'Red', hexValue: '#FF0000' },
  { code: 'crimson', name: 'Crimson', hexValue: '#DC143C' },
  { code: 'coral', name: 'Coral', hexValue: '#FF7F50' },
  { code: 'peach', name: 'Peach', hexValue: '#FFE5B4' },
  { code: 'rose-gold', name: 'Rose Gold', hexValue: '#B76E79' },
  { code: 'blush-pink', name: 'Blush Pink', hexValue: '#FFD1DC' },
  { code: 'dusty-rose', name: 'Dusty Rose', hexValue: '#DCAE96' },
  { code: 'magenta', name: 'Magenta', hexValue: '#FF00FF' },
  { code: 'hot-pink', name: 'Hot Pink', hexValue: '#FF69B4' },

  // 5. Greens
  { code: 'emerald-green', name: 'Emerald Green', hexValue: '#50C878' },
  { code: 'forest-green', name: 'Forest Green', hexValue: '#228B22' },
  { code: 'sage-green', name: 'Sage Green', hexValue: '#9CAF88' },
  { code: 'mint-green', name: 'Mint Green', hexValue: '#98FF98' },

  // 6. Purples & Lavenders
  { code: 'lavender', name: 'Lavender', hexValue: '#E6E6FA' },
  { code: 'lilac', name: 'Lilac', hexValue: '#C8A2C8' },
  { code: 'plum', name: 'Plum', hexValue: '#8E4585' },
  { code: 'purple', name: 'Purple', hexValue: '#800080' },

  // 7. Metallics
  { code: 'gold', name: 'Gold', hexValue: '#FFD700' },
  { code: 'silver', name: 'Silver', hexValue: '#C0C0C0' },
  { code: 'bronze', name: 'Bronze', hexValue: '#CD7F32' },
  { code: 'copper', name: 'Copper', hexValue: '#B87333' },
];
