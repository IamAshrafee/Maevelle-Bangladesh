'use client';

import { Lock, Unlock } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface ProductIdentityFieldsProps {
  readonly title: string;
  readonly handle: string;
  readonly isHandleLocked: boolean;
  readonly titleError?: string | undefined;
  readonly handleError?: string | undefined;
  readonly onTitleChange: (value: string) => void;
  readonly onHandleChange: (value: string) => void;
  readonly onToggleHandleLock: () => void;
}

export function ProductIdentityFields({
  title,
  handle,
  isHandleLocked,
  titleError,
  handleError,
  onTitleChange,
  onHandleChange,
  onToggleHandleLock,
}: ProductIdentityFieldsProps) {
  return (
    <div className="space-y-2">
      <div className="relative">
        <Input
          id="product-title"
          aria-label="Product title"
          aria-invalid={Boolean(titleError)}
          placeholder="Product title"
          value={title}
          maxLength={180}
          onChange={(event) => onTitleChange(event.target.value)}
          className="h-11 pr-16 text-base font-semibold sm:text-lg"
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[11px] tabular-nums text-muted-foreground">
          {title.length}/180
        </span>
      </div>

      <div className="flex min-h-9 items-center gap-1.5 rounded-lg border border-border bg-muted/50 px-2 text-xs">
        <span className="hidden shrink-0 text-muted-foreground sm:inline">
          maevelle.com/products/
        </span>
        {isHandleLocked ? (
          <span className="min-w-0 flex-1 truncate font-mono tabular-nums text-foreground">
            <span className="sm:hidden text-muted-foreground">/products/</span>
            {handle || 'product-url-preview'}
          </span>
        ) : (
          <input
            id="product-handle"
            aria-label="Custom product URL slug"
            aria-invalid={Boolean(handleError)}
            autoFocus
            value={handle}
            onChange={(event) => onHandleChange(event.target.value)}
            className="h-8 min-w-0 flex-1 bg-transparent font-mono tabular-nums text-foreground outline-none placeholder:text-muted-foreground"
            placeholder="custom-product-url"
          />
        )}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label={
            isHandleLocked ? 'Unlock URL for manual editing' : 'Lock URL and sync with title'
          }
          title={isHandleLocked ? 'Unlock URL for manual editing' : 'Lock URL and sync with title'}
          className="size-8 shrink-0 p-0"
          onClick={onToggleHandleLock}
        >
          {isHandleLocked ? <Lock className="size-3.5" /> : <Unlock className="size-3.5" />}
        </Button>
      </div>

      {titleError ? <p className="text-xs text-destructive">{titleError}</p> : null}
      {handleError ? <p className="text-xs text-destructive">{handleError}</p> : null}
    </div>
  );
}
