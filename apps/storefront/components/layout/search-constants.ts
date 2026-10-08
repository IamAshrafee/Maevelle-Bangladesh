export interface SearchSuggestionItem {
  readonly term: string;
  readonly category: string;
}

export interface SearchCategoryShortcut {
  readonly label: string;
  readonly path: string;
}

export const SEARCH_PLACEHOLDER = 'Search handcrafted jewelry, silk scarves, hair accents…';

export const TRENDING_SEARCH_SUGGESTIONS: readonly SearchSuggestionItem[] = [
  { term: 'Freshwater Pearls', category: 'Fine Jewelry' },
  { term: 'Mulberry Silk Scarves', category: 'Silk Scarves' },
  { term: 'Plush Velvet Bows', category: 'Hair Accents' },
  { term: 'Gold Vermeil Rings', category: 'Fine Jewelry' },
  { term: 'Quilted Crossbody Bags', category: 'Handbags' },
  { term: 'French Hair Claw Clips', category: 'Hair Accents' },
];

export const CATALOG_SEARCH_KEYWORDS: readonly SearchSuggestionItem[] = [
  { term: 'Freshwater Pearls', category: 'Fine Jewelry' },
  { term: 'Mulberry Silk Scarves', category: 'Silk Scarves' },
  { term: 'Plush Velvet Bows', category: 'Hair Accents' },
  { term: 'Gold Vermeil Rings', category: 'Fine Jewelry' },
  { term: 'Quilted Crossbody Bags', category: 'Handbags' },
  { term: 'French Hair Claw Clips', category: 'Hair Accents' },
  { term: 'Kundan Heritage Chokers', category: 'Fine Jewelry' },
  { term: 'Baroque Pearl Drop Earrings', category: 'Fine Jewelry' },
  { term: 'Botanical Garden Silk Squares', category: 'Silk Scarves' },
  { term: 'Artisanal Filigree Bangles', category: 'Fine Jewelry' },
  { term: 'Travertine Mini Clutches', category: 'Handbags' },
  { term: 'Crimson Velvet Scrunchies', category: 'Hair Accents' },
  { term: 'Embroidered Silk Potlis', category: 'Handbags' },
  { term: 'Evening Chiffon Wraps', category: 'Silk Scarves' },
];

export const POPULAR_CATEGORY_SHORTCUTS: readonly SearchCategoryShortcut[] = [
  { label: 'Fine Jewelry', path: '/categories/fine-jewelry' },
  { label: 'Silk Scarves', path: '/categories/silk-scarves' },
  { label: 'Hair Accents', path: '/categories/hair-accents' },
  { label: 'Handbags', path: '/categories/handbags' },
];

/**
 * Filter suggestions against query, matching term or category.
 */
export function filterSearchSuggestions(query: string, limit = 5): readonly SearchSuggestionItem[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return [];

  return CATALOG_SEARCH_KEYWORDS.filter(
    (item) =>
      item.term.toLowerCase().includes(normalized) ||
      item.category.toLowerCase().includes(normalized),
  ).slice(0, limit);
}
