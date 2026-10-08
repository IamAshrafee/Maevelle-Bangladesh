'use client';

import { ChevronDown, Globe } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface SeoContentCardProps {
  readonly title: string;
  readonly handle: string;
  readonly description: string;
  readonly seoTitle: string;
  readonly seoDescription: string;
  readonly showAdvancedContent: boolean;
  readonly onToggleAdvancedContent: () => void;
  readonly onSeoTitleChange: (val: string) => void;
  readonly onSeoDescriptionChange: (val: string) => void;
}

export function SeoContentCard({
  title,
  handle,
  description,
  seoTitle,
  seoDescription,
  showAdvancedContent,
  onToggleAdvancedContent,
  onSeoTitleChange,
  onSeoDescriptionChange,
}: SeoContentCardProps) {
  return (
    <Card className="shadow-xs">
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Globe className="size-4 text-primary" aria-hidden="true" />
            <CardTitle className="text-base font-semibold">Search appearance</CardTitle>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="gap-1"
            aria-expanded={showAdvancedContent}
            onClick={onToggleAdvancedContent}
          >
            {showAdvancedContent ? 'Collapse' : 'Customize'}
            <ChevronDown
              className={`size-3.5 transition-transform duration-150 ${showAdvancedContent ? 'rotate-180' : ''}`}
            />
          </Button>
        </div>
        <CardDescription>
          Optional search title and description. Product content remains in its own section.
        </CardDescription>
      </CardHeader>
      {showAdvancedContent ? (
        <CardContent className="space-y-5">
          <div className="space-y-1 rounded-lg border border-border bg-muted/20 p-4">
            <p className="truncate text-sm font-medium text-info">
              {seoTitle || title || 'Product title'}
            </p>
            <p className="truncate font-mono text-xs tabular-nums text-success">
              maevelle.com/products/{handle || 'product-url'}
            </p>
            <p className="line-clamp-2 text-xs text-muted-foreground">
              {seoDescription ||
                description ||
                'Add a product story to generate a useful search description.'}
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="seo-title" className="text-xs">
                Search title
              </Label>
              <Input
                id="seo-title"
                value={seoTitle}
                placeholder={title || 'Optional custom title'}
                onChange={(event) => onSeoTitleChange(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="seo-description" className="text-xs">
                Search description
              </Label>
              <Input
                id="seo-description"
                value={seoDescription}
                placeholder="Optional custom description"
                onChange={(event) => onSeoDescriptionChange(event.target.value)}
              />
            </div>
          </div>
        </CardContent>
      ) : null}
    </Card>
  );
}
