'use client';

import Link from 'next/link';
import { Check, ExternalLink, HelpCircle, Ruler } from 'lucide-react';
import type {
  CatalogCategoryChoiceDto,
  CatalogVocabularyItemDto,
  SizeGuideSummaryDto,
} from '@maevelle/contracts';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

import { HierarchicalCategoryPicker } from './hierarchical-category-picker';
import type { ReadinessChecklistItem, SizingReferenceData } from './types';

interface OrganizationSidebarProps {
  readonly categories: readonly CatalogCategoryChoiceDto[];
  readonly selectedCategoryIds: readonly string[];
  readonly primaryCategoryId: string;
  readonly recommendedCategoryId?: string | null | undefined;
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
  readonly sizingGuideSource: 'CATEGORY' | 'DIRECT' | 'NONE';
  readonly noGuideReason: string;
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
  readonly onSizingGuideSourceChange: (source: 'CATEGORY' | 'DIRECT' | 'NONE') => void;
  readonly onNoGuideReasonChange: (reason: string) => void;
  readonly onPublishImmediatelyChange: (val: boolean) => void;
}

export function OrganizationSidebar({
  categories,
  selectedCategoryIds,
  primaryCategoryId,
  recommendedCategoryId,
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
  sizingGuideSource,
  noGuideReason,
  publishImmediately,
  readinessChecklist,
  onToggleCategory,
  onSelectPrimaryCategory,
  onToggleTag,
  onToggleOccasion,
  onToggleCollection,
  onSizeSystemChange,
  onSizeGuideChange,
  onSizingGuideSourceChange,
  onNoGuideReasonChange,
  onPublishImmediatelyChange,
}: OrganizationSidebarProps) {
  return (
    <div className="space-y-6">
      {/* Sidebar Card 1: Publication Readiness Checklist */}
      <Card className="border-primary/20 bg-primary/5 shadow-2xs">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold text-foreground">
              Publication Readiness
            </CardTitle>
            <Badge
              variant={readinessChecklist.isReadyToPublish ? 'default' : 'secondary'}
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
                    ? 'bg-success text-success-foreground'
                    : 'border border-muted-foreground/30 text-transparent'
                }`}
              >
                <Check className="size-2.5 stroke-[3]" />
              </div>
              <span
                className={
                  item.isComplete ? 'text-foreground font-medium' : 'text-muted-foreground'
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
            <Switch checked={publishImmediately} onCheckedChange={onPublishImmediatelyChange} />
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
        recommendedCategoryId={recommendedCategoryId}
      />

      {/* Sidebar Card 3: Sizing System & Size Guide */}
      <Card className="border-border shadow-2xs">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Ruler className="size-4 text-primary" aria-hidden="true" />
              <CardTitle className="text-sm font-semibold">
                Sizing &amp; measurement guide
              </CardTitle>
            </div>
            <Tooltip>
              <TooltipTrigger render={<span tabIndex={0} className="inline-flex cursor-help" />}>
                <HelpCircle className="size-3.5 text-muted-foreground" aria-hidden="true" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                Attach an active size guide to display a measurements table to customers on the
                storefront.
              </TooltipContent>
            </Tooltip>
          </div>
          <CardDescription className="text-xs">
            Standard size definitions and customer-facing measurement charts.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="size-guide-source-select" className="text-xs font-medium">
                Customer guide source
              </Label>
              <Link
                href="/sizing/guides"
                target="_blank"
                className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
              >
                Manage guides <ExternalLink className="size-2.5" />
              </Link>
            </div>
            <NativeSelect
              id="size-guide-source-select"
              value={sizingGuideSource === 'DIRECT' ? sizeGuideId : sizingGuideSource}
              onChange={(event) => {
                if (event.target.value === 'CATEGORY' || event.target.value === 'NONE') {
                  onSizingGuideSourceChange(event.target.value);
                  return;
                }
                onSizingGuideSourceChange('DIRECT');
                onSizeGuideChange(event.target.value);
              }}
              className="text-xs"
            >
              <NativeSelectOption value="CATEGORY">Use primary Category guide</NativeSelectOption>
              {sizeGuides
                .filter((guide) => guide.status === 'ACTIVE' && guide.hasPublishedRevision)
                .map((guide) => (
                  <NativeSelectOption key={guide.id} value={guide.id}>
                    Use {guide.name}
                  </NativeSelectOption>
                ))}
              <NativeSelectOption value="NONE">No customer guide</NativeSelectOption>
            </NativeSelect>
            <p className="text-[11px] leading-5 text-muted-foreground">
              {sizingGuideSource === 'DIRECT'
                ? 'This Product directly uses the selected published guide instead of its Category default.'
                : sizingGuideSource === 'NONE'
                  ? 'The Storefront will intentionally show no Size & Fit Guide for this Product.'
                  : 'The current published guide from the primary Category becomes effective automatically.'}
            </p>
          </div>

          {sizingGuideSource === 'NONE' ? (
            <div className="space-y-1.5">
              <Label htmlFor="no-guide-reason" className="text-xs font-medium">
                Reason <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="no-guide-reason"
                value={noGuideReason}
                onChange={(event) => onNoGuideReasonChange(event.target.value)}
                placeholder="Why is a customer guide not appropriate for this Product?"
                className="min-h-20 text-xs"
              />
            </div>
          ) : null}

          {sizeGuideId && sizingGuideSource === 'DIRECT' ? (
            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold text-foreground">
                    {sizeGuides.find((guide) => guide.id === sizeGuideId)?.name}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    Published · Assigned directly
                  </p>
                </div>
                <Link
                  href={`/sizing/guides/${sizeGuideId}`}
                  className="text-[11px] font-medium text-primary hover:underline"
                >
                  Preview
                </Link>
              </div>
            </div>
          ) : null}

          <details className="rounded-lg border border-border">
            <summary className="min-h-10 cursor-pointer px-3 py-2 text-xs font-medium text-muted-foreground">
              Advanced size standard
            </summary>
            <div className="space-y-3 border-t border-border p-3">
              <NativeSelect
                id="size-system-select"
                aria-label="Technical size system"
                value={sizeSystemId}
                onChange={(event) => onSizeSystemChange(event.target.value)}
                className="text-xs"
              >
                <NativeSelectOption value="">Not a selectable-size Product</NativeSelectOption>
                {sizingData.systems.map((system) => (
                  <NativeSelectOption key={system.id} value={system.id}>
                    {system.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              {sizeSystemId ? (
                <div className="flex flex-wrap gap-1.5">
                  {sizingData.sizeDefinitions
                    .filter((size) => size.sizeSystemId === sizeSystemId)
                    .sort((a, b) => a.sortOrder - b.sortOrder)
                    .map((size) => (
                      <Badge
                        key={size.id}
                        variant="outline"
                        className="font-mono text-[10px] tabular-nums"
                      >
                        {size.label}
                      </Badge>
                    ))}
                </div>
              ) : null}
            </div>
          </details>
        </CardContent>
      </Card>

      {/* Sidebar Card 4: Tags, Occasions & Collections */}
      <Card className="border-border shadow-2xs">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Taxonomy & Badges</CardTitle>
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
                    className={`rounded-md border px-2 py-0.5 text-xs transition-colors duration-150 ${
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
                    className={`rounded-md border px-2 py-0.5 text-xs transition-colors duration-150 ${
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
                    className={`rounded-md border px-2 py-0.5 text-xs transition-colors duration-150 ${
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
