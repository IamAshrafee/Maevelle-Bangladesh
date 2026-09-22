'use client';

import {
  ChevronDown,
  Globe,
  Plus,
  Trash2,
  X,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';

import type { FaqEntry, InfoHighlightEntry } from './types';

interface SeoContentCardProps {
  readonly title: string;
  readonly handle: string;
  readonly description: string;
  readonly seoTitle: string;
  readonly seoDescription: string;
  readonly highlights: readonly InfoHighlightEntry[];
  readonly faqs: readonly FaqEntry[];
  readonly showAdvancedContent: boolean;
  readonly onToggleAdvancedContent: () => void;
  readonly onSeoTitleChange: (val: string) => void;
  readonly onSeoDescriptionChange: (val: string) => void;
  readonly onAddHighlight: () => void;
  readonly onUpdateHighlight: (
    id: string,
    field: 'label' | 'value',
    val: string,
  ) => void;
  readonly onRemoveHighlight: (id: string) => void;
  readonly onAddFaq: () => void;
  readonly onUpdateFaq: (
    id: string,
    field: 'question' | 'answer',
    val: string,
  ) => void;
  readonly onRemoveFaq: (id: string) => void;
}

export function SeoContentCard({
  title,
  handle,
  description,
  seoTitle,
  seoDescription,
  highlights,
  faqs,
  showAdvancedContent,
  onToggleAdvancedContent,
  onSeoTitleChange,
  onSeoDescriptionChange,
  onAddHighlight,
  onUpdateHighlight,
  onRemoveHighlight,
  onAddFaq,
  onUpdateFaq,
  onRemoveFaq,
}: SeoContentCardProps) {
  return (
    <Card className="shadow-xs">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Globe className="size-4 text-primary" aria-hidden="true" />
            <CardTitle className="text-base font-semibold">
              Search Engine & Customer Content
            </CardTitle>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 gap-1 text-xs"
            onClick={onToggleAdvancedContent}
          >
            <span>{showAdvancedContent ? 'Collapse' : 'Expand'}</span>
            <ChevronDown
              className={`size-3.5 transition-transform ${
                showAdvancedContent ? 'rotate-180' : ''
              }`}
            />
          </Button>
        </div>
        <CardDescription>
          Google search snippet preview, structured product specifications, and customer FAQs.
        </CardDescription>
      </CardHeader>

      {showAdvancedContent && (
        <CardContent className="space-y-6 pt-2">
          {/* Google SERP Preview Box */}
          <div className="space-y-2 rounded-lg border bg-muted/20 p-4">
            <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              Google Search Listing Preview
            </span>
            <div className="space-y-1">
              <p className="text-sm font-medium text-blue-600 dark:text-blue-400 truncate">
                {seoTitle || title || 'Your Product Title | Maevelle'}
              </p>
              <p className="text-xs text-emerald-700 dark:text-emerald-500 truncate">
                https://maevelle.com/products/{handle || 'your-product-handle'}
              </p>
              <p className="text-xs text-muted-foreground line-clamp-2">
                {seoDescription ||
                  description ||
                  'Discover luxury fashion crafted with authentic fabrics and bespoke detailing.'}
              </p>
            </div>
          </div>

          {/* SEO Inputs */}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="seo-title" className="text-xs font-medium">
                Meta Title
              </Label>
              <Input
                id="seo-title"
                placeholder="Festive Silk Panjabi - Buy Online | Maevelle"
                value={seoTitle}
                onChange={(e) => onSeoTitleChange(e.target.value)}
                className="text-xs"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="seo-desc" className="text-xs font-medium">
                Meta Description
              </Label>
              <Input
                id="seo-desc"
                placeholder="Shop authentic silk festive garments crafted in Dhaka with home delivery…"
                value={seoDescription}
                onChange={(e) => onSeoDescriptionChange(e.target.value)}
                className="text-xs"
              />
            </div>
          </div>

          <Separator />

          {/* Customer Highlights / Key Specs */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-xs font-semibold">
                  Customer Highlights & Specs
                </Label>
                <p className="text-[11px] text-muted-foreground">
                  Key bullet points shown beside product photos (e.g. Fabric: Silk, Care: Dry Clean)
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 gap-1 text-xs"
                onClick={onAddHighlight}
              >
                <Plus className="size-3" />
                <span>Add Highlight</span>
              </Button>
            </div>

            {highlights.map((h) => (
              <div key={h.id} className="flex items-center gap-2">
                <Input
                  placeholder="Label (e.g. Fabric)"
                  value={h.label}
                  onChange={(e) =>
                    onUpdateHighlight(h.id, 'label', e.target.value)
                  }
                  className="h-8 w-1/3 text-xs"
                />
                <Input
                  placeholder="Value (e.g. 100% Organic Mulberry Silk)"
                  value={h.value}
                  onChange={(e) =>
                    onUpdateHighlight(h.id, 'value', e.target.value)
                  }
                  className="h-8 flex-1 text-xs"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="size-8 p-0 text-muted-foreground hover:text-destructive"
                  onClick={() => onRemoveHighlight(h.id)}
                >
                  <X className="size-3.5" />
                </Button>
              </div>
            ))}
          </div>

          <Separator />

          {/* Product FAQs */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-xs font-semibold">
                  Frequently Asked Questions
                </Label>
                <p className="text-[11px] text-muted-foreground">
                  Common questions regarding sizing, fitting, delivery, and fabric care
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 gap-1 text-xs"
                onClick={onAddFaq}
              >
                <Plus className="size-3" />
                <span>Add FAQ</span>
              </Button>
            </div>

            {faqs.map((f) => (
              <div key={f.id} className="space-y-2 rounded-lg border p-3">
                <div className="flex items-center justify-between gap-2">
                  <Input
                    placeholder="Question (e.g. How does the size fit?)"
                    value={f.question}
                    onChange={(e) =>
                      onUpdateFaq(f.id, 'question', e.target.value)
                    }
                    className="h-8 text-xs font-medium"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="size-8 p-0 text-muted-foreground hover:text-destructive"
                    onClick={() => onRemoveFaq(f.id)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
                <Textarea
                  rows={2}
                  placeholder="Answer (e.g. This cut offers a regular tailored fit. If between sizes, choose one size up.)"
                  value={f.answer}
                  onChange={(e) =>
                    onUpdateFaq(f.id, 'answer', e.target.value)
                  }
                  className="text-xs"
                />
              </div>
            ))}
          </div>
        </CardContent>
      )}
    </Card>
  );
}
