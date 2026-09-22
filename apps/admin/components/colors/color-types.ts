import { z } from 'zod';

export interface ColorPreset {
  readonly name: string;
  readonly hex: string;
}

export const POPULAR_COLOR_PRESETS: readonly ColorPreset[] = [
  { name: 'Black', hex: '#000000' },
  { name: 'White', hex: '#FFFFFF' },
  { name: 'Off White', hex: '#FAF9F6' },
  { name: 'Charcoal', hex: '#36454F' },
  { name: 'Slate Grey', hex: '#708090' },
  { name: 'Navy Blue', hex: '#000080' },
  { name: 'Midnight Blue', hex: '#191970' },
  { name: 'Royal Blue', hex: '#4169E1' },
  { name: 'Sky Blue', hex: '#87CEEB' },
  { name: 'Teal', hex: '#008080' },
  { name: 'Emerald Green', hex: '#50C878' },
  { name: 'Forest Green', hex: '#228B22' },
  { name: 'Olive Green', hex: '#808000' },
  { name: 'Sage Green', hex: '#9CAF88' },
  { name: 'Crimson Red', hex: '#DC143C' },
  { name: 'Burgundy', hex: '#800020' },
  { name: 'Rust', hex: '#B7410E' },
  { name: 'Blush Pink', hex: '#FFD1DC' },
  { name: 'Rose', hex: '#FF007F' },
  { name: 'Plum', hex: '#DDA0DD' },
  { name: 'Lavender', hex: '#E6E6FA' },
  { name: 'Mustard Yellow', hex: '#FFDB58' },
  { name: 'Gold', hex: '#FFD700' },
  { name: 'Camel', hex: '#C19A6B' },
  { name: 'Chocolate Brown', hex: '#7B3F00' },
  { name: 'Beige', hex: '#F5F5DC' },
];

export const colorFormSchema = z.object({
  name: z
    .string()
    .min(1, 'Color name is required.')
    .max(120, 'Name must be 120 characters or fewer.'),
  code: z
    .string()
    .min(1, 'Color code is required.')
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Code must use lowercase letters and numbers separated by hyphens.'),
  hexValue: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'HEX must be a valid 6-character code (e.g. #FF0000).')
    .nullable()
    .optional()
    .or(z.literal('')),
  status: z.enum(['ACTIVE', 'ARCHIVED']),
});

export type ColorFormValues = z.infer<typeof colorFormSchema>;

export function slugifyColorCode(name: string): string {
  return name
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
}

export function isLightColor(hexColor?: string | null): boolean {
  if (!hexColor || !/^#[0-9a-fA-F]{6}$/.test(hexColor)) return false;
  const hex = hexColor.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  const hsp = Math.sqrt(0.299 * (r * r) + 0.587 * (g * g) + 0.114 * (b * b));
  return hsp > 165;
}
