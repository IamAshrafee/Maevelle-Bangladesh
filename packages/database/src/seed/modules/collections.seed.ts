import { collectionSeedData } from '../data/collections.js';
import type { SeedModule, VocabularySeedItem } from '../types.js';
import { createVocabularySeedModule } from './vocabulary.seed.js';

export function createCollectionsSeedModule(
  items: readonly VocabularySeedItem[] = collectionSeedData,
): SeedModule {
  return createVocabularySeedModule({
    id: 'collections',
    name: 'Collections',
    description: 'Thematic, seasonal, and promotional product collections',
    kind: 'COLLECTION',
    items,
  });
}

export const collectionsSeedModule = createCollectionsSeedModule();
