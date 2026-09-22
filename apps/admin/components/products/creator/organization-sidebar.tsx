'use client';

import { Check, HelpCircle } from 'lucide-react';
import type {
  CatalogCategoryChoiceDto,
  CatalogVocabularyItemDto,
  SizeGuideSummaryDto,
} from '@maevelle/contracts';

import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

import { HierarchicalCategoryPicker } from './hierarchical-category-picker';
import type { ReadinessChecklistItem, SizingReferenceData } from './types';

interface OrganizationSidebarProps {
  readonly categories: readonly CatalogCategoryChoiceDto[];
  readonly selectedCategoryIds: readonly string[];
  readonly primaryCategoryId: string;
  readonly tags: readonly CatalogVocabularyItemDto[];
  readonly selectedTagIds: readonly string[];
  readonly occasions: readonly CatalogVocabularyItemDto[];
  readonly selectedOccasionIds: readonly string[];
  readonly collections: readonly CatalogVocabularyItemDto[];
  readonly selectedCollectionIds: readonly string[];
  readonly sizingData: SizingReferenceData;
  readonly sizeGuides: readonly SizeGuideSummaryDto[];
  readonly sizeSystemId: string;
  readonly sizeGuideId: string;
  readonly publishImmediately: boolean;
  readonly readinessChecklist: {
    readonly items: readonly ReadinessChecklistItem[];
    readonly progressPercent: number;
    readonly isReadyToPublish: boolean;
  };
  readonly onToggleCategory: (catId: string) => void;
  readonly onSelectPrimaryCategory: (catId: string) => void;
  readonly onToggleTag: (tagId: string) => void;
  readonly onToggleOccasion: (occId: string) => void;
  readonly onToggleCollection: (collId: string) => void;
  readonly onSizeSystemChange: (sysId: string) => void;
  readonly onSizeGuideChange: (guideId: string) => void;
  readonly onPublishImmediatelyChange: (val: boolean) => void;
}

export function OrganizationSidebar({
  categories,
  selectedCategoryIds,
  primaryCategoryId,
  tags,
  selectedTagIds,
  occasions,
  selectedOccasionIds,
  collections,
  selectedCollectionIds,
  sizingData,
  sizeGuides,
  sizeSystemId,
  sizeGuideId,
  publishImmediately,
  readinessChecklist,
  onToggleCategory,
  onSelectPrimaryCategory,
  onToggleTag,
  onToggleOccasion,
  onToggleCollection,
  onSizeSystemChange,
  onSizeGuideChange,
  onPublishImmediatelyChange,
}: OrganizationSidebarProps) {
  return (
    <div className="space-y-6">
      {/* Sidebar Card 1: Publication Readiness Checklist */}
      <Card className="shadow-xs border-primary/20 bg-primary/5">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold text-foreground">
              Publication Readiness
            </CardTitle>
            <Badge
              variant={
                readinessChecklist.isReadyToPublish ? 'default' : 'secondary'
              }
              className="text-[11px]"
            >
              {readinessChecklist.progressPercent}%
            </Badge>
          </div>
          <CardDescription className="text-xs">
            Review checklist before launching to the public storefront.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-xs">
          {readinessChecklist.items.map((item) => (
            <div key={item.id} className="flex items-start gap-2">
              <div
                className={`mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full ${
                  item.isComplete
                    ? 'bg-emerald-600 text-white'
                    : 'border border-muted-foreground/30 text-transparent'
                }`}
              >
                <Check className="size-2.5 stroke-[3]" />
              </div>
              <span
                className={
                  item.isComplete
                    ? 'text-foreground font-medium'
                    : 'text-muted-foreground'
                }
              >
                {item.label}
              </span>
            </div>
          ))}

          <Separator className="my-2" />

          <div className="flex items-center justify-between pt-1">
            <div className="flex flex-col">
              <span className="text-xs font-medium">Publish Immediately</span>
              <span className="text-[10px] text-muted-foreground">
                Set status to Active upon saving
              </span>
            </div>
            <Switch
              checked={publishImmediately}
              onCheckedChange={onPublishImmediatelyChange}
            />
          </div>
        </CardContent>
      </Card>

      {/* Sidebar Card 2: Hierarchical Category Picker */}
      <HierarchicalCategoryPicker
        categories={categories}
        selectedCategoryIds={selectedCategoryIds}
        onToggleCategory={onToggleCategory}
        primaryCategoryId={primaryCategoryId}
        onSelectPrimaryCategory={onSelectPrimaryCategory}
      />

      {/* Sidebar Card 3: Sizing System & Size Guide */}
      <Card className="shadow-xs">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold">
              Sizing & Measurement Guide
            </CardTitle>
            <Tooltip>
              <TooltipTrigger render={<span tabIndex={0} className="inline-flex cursor-help" />}>
                <HelpCircle className="size-3.5 text-muted-foreground" aria-hidden="true" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                Attach an active size guide to display a measurements table to customers on the storefront.
              </TooltipContent>
            </Tooltip>
          </div>
          <CardDescription className="text-xs">
            Standard size definitions and customer-facing measurement charts.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Size System */}
          <div className="space-y-1.5">
            <Label htmlFor="size-system-select" className="text-xs font-medium">
              Size System
            </Label>
            <NativeSelect
              id="size-system-select"
              value={sizeSystemId}
              onChange={(e) => onSizeSystemChange(e.target.value)}
              className="text-xs"
            >
              <NativeSelectOption value="">
                None (Non-sized product)
              </NativeSelectOption>
              {sizingData.systems.map((s) => (
                <NativeSelectOption key={s.id} value={s.id}>
                  {s.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>

          {/* Size Guide */}
          {sizeSystemId && (
            <div className="space-y-1.5">
              <Label htmlFor="size-guide-select" className="text-xs font-medium">
                Storefront Size Guide
              </Label>
              <NativeSelect
                id="size-guide-select"
                value={sizeGuideId}
                onChange={(e) => onSizeGuideChange(e.target.value)}
                className="text-xs"
              >
                <NativeSelectOption value="">
                  Select a guide chart…
                </NativeSelectOption>
                {sizeGuides
                  .filter(
                    (g) =>
                      g.sizeSystemId === sizeSystemId &&
                      g.status === 'ACTIVE',
                  )
                  .map((g) => (
                    <NativeSelectOption key={g.id} value={g.id}>
                      {g.name} (v{g.version})
                    </NativeSelectOption>
                  ))}
              </NativeSelect>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sidebar Card 4: Tags, Occasions & Collections */}
      <Card className="shadow-xs">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">
            Taxonomy & Badges
          </CardTitle>
          <CardDescription className="text-xs">
            Marketing tags, festive occasions, and seasonal collections.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Marketing Tags */}
          <div className="space-y-2">
            <Label className="text-xs font-medium">Marketing Tags</Label>
            <div className="flex flex-wrap gap-1">
              {tags.map((tag) => {
                const isSelected = selectedTagIds.includes(tag.id);
                return (
                  <button
                    key={tag.id}
                    type="button"
                    className={`rounded-md border px-2 py-0.5 text-xs transition-colors ${
                      isSelected
                        ? 'border-primary bg-primary text-primary-foreground font-medium'
                        : 'border-input bg-background hover:bg-muted text-foreground'
                    }`}
                    onClick={() => onToggleTag(tag.id)}
                  >
                    {tag.name}
                  </button>
                );
              })}
              {tags.length === 0 && (
                <span className="text-[11px] text-muted-foreground italic">
                  No active tags configured
                </span>
              )}
            </div>
          </div>

          {/* Occasions */}
          <div className="space-y-2">
            <Label className="text-xs font-medium">Occasions</Label>
            <div className="flex flex-wrap gap-1">
              {occasions.map((occ) => {
                const isSelected = selectedOccasionIds.includes(occ.id);
                return (
                  <button
                    key={occ.id}
                    type="button"
                    className={`rounded-md border px-2 py-0.5 text-xs transition-colors ${
                      isSelected
                        ? 'border-primary bg-primary text-primary-foreground font-medium'
                        : 'border-input bg-background hover:bg-muted text-foreground'
                    }`}
                    onClick={() => onToggleOccasion(occ.id)}
                  >
                    {occ.name}
                  </button>
                );
              })}
              {occasions.length === 0 && (
                <span className="text-[11px] text-muted-foreground italic">
                  No active occasions configured
                </span>
              )}
            </div>
          </div>

          {/* Collections */}
          <div className="space-y-2">
            <Label className="text-xs font-medium">Collections</Label>
            <div className="flex flex-wrap gap-1">
              {collections.map((coll) => {
                const isSelected = selectedCollectionIds.includes(coll.id);
                return (
                  <button
                    key={coll.id}
                    type="button"
                    className={`rounded-md border px-2 py-0.5 text-xs transition-colors ${
                      isSelected
                        ? 'border-primary bg-primary text-primary-foreground font-medium'
                        : 'border-input bg-background hover:bg-muted text-foreground'
                    }`}
                    onClick={() => onToggleCollection(coll.id)}
                  >
                    {coll.name}
                  </button>
                );
              })}
              {collections.length === 0 && (
                <span className="text-[11px] text-muted-foreground italic">
                  No active collections configured
                </span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
