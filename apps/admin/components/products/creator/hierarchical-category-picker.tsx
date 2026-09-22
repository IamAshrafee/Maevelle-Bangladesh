'use client';

import { useState, useMemo } from 'react';
import { Search, FolderTree, Star, Check, HelpCircle, X, ChevronRight } from 'lucide-react';
import type { CatalogCategoryChoiceDto } from '@maevelle/contracts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface HierarchicalCategoryPickerProps {
  readonly categories: readonly CatalogCategoryChoiceDto[];
  readonly selectedCategoryIds: readonly string[];
  readonly onToggleCategory: (id: string) => void;
  readonly primaryCategoryId: string;
  readonly onSelectPrimaryCategory: (id: string) => void;
}

export function HierarchicalCategoryPicker({
  categories,
  selectedCategoryIds,
  onToggleCategory,
  primaryCategoryId,
  onSelectPrimaryCategory,
}: HierarchicalCategoryPickerProps) {
  const [search, setSearch] = useState('');

  const filteredCategories = useMemo(() => {
    if (!search.trim()) return categories;
    const query = search.toLowerCase().trim();
    return categories.filter(
      (c) =>
        c.name.toLowerCase().includes(query) ||
        c.path.toLowerCase().includes(query) ||
        c.handle.toLowerCase().includes(query),
    );
  }, [categories, search]);

  const selectedCategories = useMemo(() => {
    return categories.filter((c) => selectedCategoryIds.includes(c.id));
  }, [categories, selectedCategoryIds]);

  return (
    <Card className="shadow-xs">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FolderTree className="size-4 text-primary" aria-hidden="true" />
            <CardTitle className="text-sm font-semibold">Categories</CardTitle>
          </div>
          <Tooltip>
            <TooltipTrigger render={<span tabIndex={0} className="inline-flex cursor-help" />}>
              <HelpCircle className="size-3.5 text-muted-foreground" aria-hidden="true" />
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              Assign categories to place this product in your catalog navigation. Mark one as Primary
              to govern the main storefront breadcrumbs and URL structure.
            </TooltipContent>
          </Tooltip>
        </div>
        <CardDescription className="text-xs">
          Select all applicable categories. Star one as the Primary Category.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Selected Category Chips */}
        {selectedCategories.length > 0 && (
          <div className="space-y-1.5 rounded-lg border bg-muted/30 p-2.5">
            <span className="text-[11px] font-medium text-muted-foreground">
              Selected ({selectedCategories.length}):
            </span>
            <div className="flex flex-wrap gap-1.5">
              {selectedCategories.map((cat) => {
                const isPrimary = cat.id === primaryCategoryId;
                return (
                  <Badge
                    key={cat.id}
                    variant={isPrimary ? 'default' : 'secondary'}
                    className="gap-1.5 py-1 text-xs"
                  >
                    <button
                      type="button"
                      title={isPrimary ? 'Primary Category' : 'Click to make Primary'}
                      onClick={() => onSelectPrimaryCategory(cat.id)}
                      className={`inline-flex items-center ${
                        isPrimary
                          ? 'text-amber-300'
                          : 'text-muted-foreground hover:text-amber-500'
                      }`}
                    >
                      <Star className={`size-3 ${isPrimary ? 'fill-current' : ''}`} />
                    </button>
                    <span>{cat.name}</span>
                    <button
                      type="button"
                      className="ml-0.5 rounded-full p-0.5 hover:bg-muted/80"
                      onClick={() => onToggleCategory(cat.id)}
                    >
                      <X className="size-3" />
                    </button>
                  </Badge>
                );
              })}
            </div>
          </div>
        )}

        {/* Search */}
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search hierarchy (e.g. Sarees, Men)…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 pl-8 text-xs"
          />
        </div>

        {/* Category List with Breadcrumbs */}
        <div className="max-h-56 overflow-y-auto rounded-md border p-1 space-y-0.5 divide-y divide-border/40">
          {filteredCategories.length === 0 ? (
            <p className="p-3 text-center text-xs text-muted-foreground">
              No categories match your search.
            </p>
          ) : (
            filteredCategories.map((cat) => {
              const isSelected = selectedCategoryIds.includes(cat.id);
              const isPrimary = cat.id === primaryCategoryId;
              const pathParts = cat.path ? cat.path.split('/').filter(Boolean) : [cat.name];

              return (
                <div
                  key={cat.id}
                  className={`flex items-center justify-between p-1.5 rounded-sm transition-colors text-xs ${
                    isSelected ? 'bg-accent/60 font-medium' : 'hover:bg-muted/50'
                  }`}
                >
                  <label
                    className="flex flex-1 items-center gap-2 cursor-pointer select-none py-0.5"
                    onClick={() => onToggleCategory(cat.id)}
                  >
                    <div
                      className={`flex size-4 items-center justify-center rounded-xs border transition-colors ${
                        isSelected
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-input bg-background'
                      }`}
                    >
                      {isSelected && <Check className="size-3 stroke-[3]" />}
                    </div>

                    <div className="flex flex-col">
                      <span className="text-foreground leading-tight">{cat.name}</span>
                      {pathParts.length > 1 && (
                        <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                          {pathParts.slice(0, -1).join(' > ')}
                        </span>
                      )}
                    </div>
                  </label>

                  {/* Primary Star Action */}
                  {isSelected && (
                    <button
                      type="button"
                      title={isPrimary ? 'Primary Category' : 'Set as primary category'}
                      onClick={() => onSelectPrimaryCategory(cat.id)}
                      className={`p-1 rounded-md transition-colors ${
                        isPrimary
                          ? 'text-amber-500 hover:text-amber-600'
                          : 'text-muted-foreground hover:text-amber-500'
                      }`}
                    >
                      <Star className={`size-3.5 ${isPrimary ? 'fill-current' : ''}`} />
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </CardContent>
    </Card>
  );
}
