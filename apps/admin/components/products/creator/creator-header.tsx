'use client';

import Link from 'next/link';
import { ArrowLeft, Check, LoaderCircle, Save, Sparkles } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Breadcrumb } from '@/components/ui/breadcrumb';
import { Button } from '@/components/ui/button';

interface CreatorHeaderProps {
  readonly isEditMode?: boolean | undefined;
  readonly productId?: string | undefined;
  readonly productTitle?: string | undefined;
  readonly status?: string | undefined;
  readonly saving: boolean;
  readonly isDirty: boolean;
  readonly onSaveDraft: () => void;
  readonly onPublish: () => void;
}

export function CreatorHeader({
  isEditMode = false,
  productId,
  productTitle,
  status = 'DRAFT',
  saving,
  isDirty,
  onSaveDraft,
  onPublish,
}: CreatorHeaderProps) {
  const backHref = isEditMode && productId ? `/products/${productId}` : '/products';

  return (
    <header className="sticky top-0 z-20 flex flex-col gap-3 border-b bg-background/95 px-4 py-3 backdrop-blur-md sm:flex-row sm:items-center sm:justify-between sm:px-8">
      {/* Left: Navigation, Title & Status */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          className="size-8 p-0 text-muted-foreground hover:text-foreground"
          render={<Link href={backHref} aria-label="Back" />}
        >
          <ArrowLeft className="size-4" />
        </Button>

        <div className="flex flex-col gap-0.5">
          <Breadcrumb
            items={[
              { label: 'Catalog', href: '/products' },
              { label: 'Products', href: '/products' },
              ...(isEditMode && productTitle
                ? [
                    { label: productTitle, href: `/products/${productId}` },
                    { label: 'Edit' },
                  ]
                : [{ label: 'New Product' }]),
            ]}
            className="text-[11px] text-muted-foreground"
          />
          <div className="flex items-center gap-2">
            <h1 className="text-base font-semibold tracking-tight text-foreground sm:text-lg">
              {isEditMode ? `Edit Product: ${productTitle || ''}` : 'New Product'}
            </h1>
            <Badge
              variant={status === 'PUBLISHED' ? 'default' : 'outline'}
              className="text-[10px] uppercase font-mono tracking-wider"
            >
              {isEditMode ? status : 'Draft Mode'}
            </Badge>
          </div>
        </div>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-2">
        {/* Autosave status indicator */}
        <div className="hidden items-center gap-1.5 text-[11px] text-muted-foreground md:flex mr-2">
          {isDirty ? (
            <>
              <span className="size-1.5 rounded-full bg-amber-500 animate-pulse" />
              <span>Unsaved changes</span>
            </>
          ) : (
            <>
              <Check className="size-3 text-emerald-600" />
              <span>{isEditMode ? 'Saved' : 'Draft autosaved'}</span>
            </>
          )}
        </div>

        <Button
          variant="outline"
          size="sm"
          render={<Link href={backHref} />}
          disabled={saving}
          className="text-xs"
        >
          Cancel
        </Button>

        <Button
          variant={isEditMode ? 'default' : 'outline'}
          size="sm"
          onClick={onSaveDraft}
          disabled={saving}
          className="gap-1.5 text-xs"
        >
          {saving ? (
            <LoaderCircle className="size-3.5 animate-spin" />
          ) : (
            <Save className="size-3.5" />
          )}
          <span>{isEditMode ? 'Save Changes' : 'Save Draft'}</span>
        </Button>

        {status !== 'PUBLISHED' && (
          <Button
            size="sm"
            onClick={onPublish}
            disabled={saving}
            className="gap-1.5 text-xs"
          >
            {saving ? (
              <LoaderCircle className="size-3.5 animate-spin" />
            ) : (
              <Sparkles className="size-3.5" />
            )}
            <span>Publish to Store</span>
          </Button>
        )}
      </div>
    </header>
  );
}
