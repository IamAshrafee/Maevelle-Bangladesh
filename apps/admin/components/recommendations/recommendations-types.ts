import type {
  RecommendationPlacementCodeDto,
  RecommendationPlacementSettingsDto,
  RecommendationPreviewDto,
} from '@maevelle/contracts';

export type PlacementCode = RecommendationPlacementCodeDto;

export interface RuleItem {
  id: string;
  sourceProductTypeId: string;
  targetProductTypeId: string;
  sourceName: string;
  targetName: string;
  strength: number;
  enabled: boolean;
  version: number;
}

export interface CoverageItem {
  id: string;
  title: string;
  handle: string;
  actionCount: number;
  similarCount: number;
  complementaryCount: number;
}

export interface CoverageResponse {
  items: CoverageItem[];
  page: number;
  pageSize: number;
  total: number;
}

export interface PerformancePlacement {
  placement: string;
  impressions: number;
  clicks: number;
  clickedImpressions: number;
  uniqueSessions: number;
  productPageContinuations: number;
  ctr: number | null;
}

export interface PerformanceResponse {
  from: string;
  to: string;
  measurement: string;
  placements: PerformancePlacement[];
}

export interface ProductTypeItem {
  id: string;
  name: string;
}

export interface ProductPickerItem {
  id: string;
  title: string;
  handle: string;
  publication_status: string;
}

export const PLACEMENT_LABELS: Record<PlacementCode, string> = {
  pdp_complementary: 'Complete Your Look',
  pdp_similar: 'You May Also Like',
};

export const PLACEMENT_DESCRIPTIONS: Record<PlacementCode, string> = {
  pdp_complementary:
    'Cross-sell carousel pairing styling-compatible items (e.g. matching tops, bottoms, and accessories).',
  pdp_similar:
    'Alternative & upsell carousel showcasing similar items based on category, tags, attributes, and colors.',
};

