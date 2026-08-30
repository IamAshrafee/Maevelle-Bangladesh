import type {
  CatalogCategoryChoiceDto,
  CatalogColorDto,
  CatalogProductWorkspaceDto,
  CatalogProductTypeDefinitionDto,
  CatalogVocabularyItemDto,
} from '@maevelle/contracts';

export interface ProductEditorReferences {
  readonly types: readonly CatalogProductTypeDefinitionDto[];
  readonly categories: readonly CatalogCategoryChoiceDto[];
  readonly colors: readonly CatalogColorDto[];
  readonly tags: readonly CatalogVocabularyItemDto[];
  readonly occasions: readonly CatalogVocabularyItemDto[];
  readonly collections: readonly CatalogVocabularyItemDto[];
  readonly sizeSystems: readonly {
    readonly id: string;
    readonly name: string;
    readonly status: 'ACTIVE' | 'ARCHIVED';
  }[];
  readonly sizeDefinitions: readonly {
    readonly id: string;
    readonly sizeSystemId: string;
    readonly code: string;
    readonly label: string;
    readonly sortOrder: number;
  }[];
}

export interface ProductEditorSectionProps {
  readonly workspace: CatalogProductWorkspaceDto;
  readonly references: ProductEditorReferences;
  readonly onRefresh: (message?: string) => Promise<void>;
  readonly onMessage: (message: string) => void;
  readonly onDirtyChange: (dirty: boolean) => void;
}
