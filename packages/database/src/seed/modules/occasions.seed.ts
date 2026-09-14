import { occasionSeedData } from '../data/occasions.js';
import type { SeedModule, VocabularySeedItem } from '../types.js';
import { createVocabularySeedModule } from './vocabulary.seed.js';

export function createOccasionsSeedModule(
  items: readonly VocabularySeedItem[] = occasionSeedData,
): SeedModule {
  return createVocabularySeedModule({
    id: 'occasions',
    name: 'Occasions',
    description: 'Product usage occasions and event contexts',
    kind: 'OCCASION',
    items,
  });
}

export const occasionsSeedModule = createOccasionsSeedModule();
