import { tagSeedData } from '../data/tags.js';
import type { SeedModule, VocabularySeedItem } from '../types.js';
import { createVocabularySeedModule } from './vocabulary.seed.js';

export function createTagsSeedModule(
  items: readonly VocabularySeedItem[] = tagSeedData,
): SeedModule {
  return createVocabularySeedModule({
    id: 'tags',
    name: 'Tags',
    description: 'Product descriptive and aesthetic tags',
    kind: 'TAG',
    items,
  });
}

export const tagsSeedModule = createTagsSeedModule();
