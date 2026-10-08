'use client';

import { useMemo, useState } from 'react';
import { Check, ChevronRight, FolderTree, Search, Star, X } from 'lucide-react';
import type { CatalogCategoryChoiceDto } from '@maevelle/contracts';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface HierarchicalCategoryPickerProps {
  readonly categories: readonly CatalogCategoryChoiceDto[];
  readonly selectedCategoryIds: readonly string[];
  readonly onToggleCategory: (id: string) => void;
  readonly primaryCategoryId: string;
  readonly onSelectPrimaryCategory: (id: string) => void;
  readonly recommendedCategoryId?: string | null | undefined;
}

function parentPath(category: CatalogCategoryChoiceDto): string | null {
  const parts = category.path.split(' / ');
  return parts.length > 1 ? parts.slice(0, -1).join(' / ') : null;
}

export function HierarchicalCategoryPicker({
  categories,
  selectedCategoryIds,
  onToggleCategory,
  primaryCategoryId,
  onSelectPrimaryCategory,
  recommendedCategoryId,
}: HierarchicalCategoryPickerProps) {
  const [search, setSearch] = useState('');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());

  const pathToCategory = useMemo(
    () => new Map(categories.map((category) => [category.path, category])),
    [categories],
  );
  const childCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const category of categories) {
      const parent = parentPath(category);
      if (parent) counts.set(parent, (counts.get(parent) ?? 0) + 1);
    }
    return counts;
  }, [categories]);
  const normalizedSearch = search.trim().toLocaleLowerCase('en');
  const visibleCategories = useMemo(() => {
    if (normalizedSearch) {
      return categories.filter((category) =>
        `${category.name} ${category.path} ${category.handle}`
          .toLocaleLowerCase('en')
          .includes(normalizedSearch),
      );
    }
    return categories.filter((category) => {
      let ancestorPath = parentPath(category);
      while (ancestorPath) {
        const ancestor = pathToCategory.get(ancestorPath);
        if (!ancestor || !expandedIds.has(ancestor.id)) return false;
        ancestorPath = parentPath(ancestor);
      }
      return true;
    });
  }, [categories, expandedIds, normalizedSearch, pathToCategory]);
  const selectedCategories = useMemo(
    () => categories.filter((category) => selectedCategoryIds.includes(category.id)),
    [categories, selectedCategoryIds],
  );
  const recommendedCategory = categories.find((category) => category.id === recommendedCategoryId);

  function toggleExpanded(id: string) {
    setExpandedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <Card className="shadow-xs">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <FolderTree className="size-4 text-primary" aria-hidden="true" />
          <CardTitle className="text-sm font-semibold">Categories</CardTitle>
        </div>
        <CardDescription className="text-xs">
          Browse the hierarchy or search by any parent or child name. Select only where this product
          should appear.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3">
        {recommendedCategory && !selectedCategoryIds.includes(recommendedCategory.id) ? (
          <div className="flex items-start justify-between gap-3 rounded-lg border border-info/30 bg-info/5 p-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-foreground">Suggested from classification</p>
              <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                {recommendedCategory.path}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 shrink-0"
              onClick={() => onToggleCategory(recommendedCategory.id)}
            >
              Add
            </Button>
          </div>
        ) : null}

        {selectedCategories.length > 0 ? (
          <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
            <p className="text-[11px] font-medium text-muted-foreground">
              Selected paths ({selectedCategories.length})
            </p>
            <div className="space-y-1.5">
              {selectedCategories.map((category) => {
                const isPrimary = category.id === primaryCategoryId;
                return (
                  <div
                    key={category.id}
                    className="flex items-center gap-2 rounded-md bg-card px-2 py-1.5 text-xs shadow-2xs"
                  >
                    <button
                      type="button"
                      aria-label={
                        isPrimary
                          ? `${category.name} is the primary category`
                          : `Make ${category.name} primary`
                      }
                      className={cn(
                        'rounded p-1 transition-colors duration-150',
                        isPrimary ? 'text-warning' : 'text-muted-foreground hover:text-warning',
                      )}
                      onClick={() => onSelectPrimaryCategory(category.id)}
                    >
                      <Star className={cn('size-3.5', isPrimary && 'fill-current')} />
                    </button>
                    <span className="min-w-0 flex-1 truncate" title={category.path}>
                      {category.path}
                    </span>
                    {isPrimary ? (
                      <Badge variant="outline" className="text-[10px]">
                        Primary
                      </Badge>
                    ) : null}
                    <button
                      type="button"
                      aria-label={`Remove ${category.name}`}
                      className="rounded p-1 text-muted-foreground transition-colors duration-150 hover:text-destructive"
                      onClick={() => onToggleCategory(category.id)}
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
            No category selected. Choose a precise child category below; parent categories remain
            available when genuinely applicable.
          </div>
        )}

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            aria-label="Search categories"
            placeholder="Search categories and paths…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="pl-9"
          />
        </div>

        <div className="max-h-80 overflow-y-auto rounded-lg border border-border bg-card p-1">
          {visibleCategories.length === 0 ? (
            <p className="p-5 text-center text-xs text-muted-foreground">
              No category path matches “{search}”.
            </p>
          ) : (
            visibleCategories.map((category) => {
              const selected = selectedCategoryIds.includes(category.id);
              const primary = category.id === primaryCategoryId;
              const hasChildren = (childCounts.get(category.path) ?? 0) > 0;
              const expanded = expandedIds.has(category.id);
              return (
                <div
                  key={category.id}
                  className={cn(
                    'flex min-h-10 items-center gap-1 rounded-md px-1.5 transition-colors duration-150',
                    selected ? 'bg-primary-subtle' : 'hover:bg-muted',
                    ['pl-1.5', 'pl-5', 'pl-9', 'pl-13', 'pl-17', 'pl-21'][
                      Math.min(category.depth, 5)
                    ],
                  )}
                >
                  {hasChildren && !normalizedSearch ? (
                    <button
                      type="button"
                      aria-label={`${expanded ? 'Collapse' : 'Expand'} ${category.name}`}
                      aria-expanded={expanded}
                      className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-background"
                      onClick={() => toggleExpanded(category.id)}
                    >
                      <ChevronRight
                        className={cn(
                          'size-3.5 transition-transform duration-150',
                          expanded && 'rotate-90',
                        )}
                      />
                    </button>
                  ) : (
                    <span className="size-8 shrink-0" />
                  )}
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-2 py-2 text-left"
                    onClick={() => onToggleCategory(category.id)}
                  >
                    <span
                      className={cn(
                        'flex size-4 shrink-0 items-center justify-center rounded border',
                        selected
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border bg-background',
                      )}
                    >
                      {selected ? <Check className="size-3" /> : null}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-medium text-foreground">
                        {category.name}
                      </span>
                      {normalizedSearch || category.depth > 0 ? (
                        <span className="block truncate text-[10px] text-muted-foreground">
                          {category.path}
                        </span>
                      ) : null}
                    </span>
                  </button>
                  {selected ? (
                    <button
                      type="button"
                      aria-label={
                        primary ? `${category.name} is primary` : `Make ${category.name} primary`
                      }
                      className={cn(
                        'flex size-8 shrink-0 items-center justify-center rounded-md',
                        primary ? 'text-warning' : 'text-muted-foreground hover:text-warning',
                      )}
                      onClick={() => onSelectPrimaryCategory(category.id)}
                    >
                      <Star className={cn('size-3.5', primary && 'fill-current')} />
                    </button>
                  ) : null}
                </div>
              );
            })
          )}
        </div>
        <p className="text-[11px] text-muted-foreground">
          <Star className="mr-1 inline size-3 text-warning" />
          The primary category controls the canonical breadcrumb.
        </p>
      </CardContent>
    </Card>
  );
}
