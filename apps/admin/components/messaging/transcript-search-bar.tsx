'use client';

import { ChevronDown, ChevronUp, Search, X } from 'lucide-react';
import * as React from 'react';
import { useEffect, useRef } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export interface TranscriptSearchBarProps {
  isOpen: boolean;
  onClose: () => void;
  query: string;
  onQueryChange: (query: string) => void;
  matchCount: number;
  currentMatchIndex: number;
  onNextMatch: () => void;
  onPrevMatch: () => void;
}

export function TranscriptSearchBar({
  isOpen,
  onClose,
  query,
  onQueryChange,
  matchCount,
  currentMatchIndex,
  onNextMatch,
  onPrevMatch,
}: TranscriptSearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const hasMatches = matchCount > 0;
  const matchLabel = !query.trim()
    ? ''
    : hasMatches
      ? `${currentMatchIndex + 1} of ${matchCount}`
      : 'No results';

  return (
    <div
      role="search"
      aria-label="Search conversation messages"
      className="flex shrink-0 items-center gap-2 border-b border-border bg-card/95 px-3 py-2 backdrop-blur-xs transition-opacity duration-150"
    >
      <div className="relative flex min-w-0 flex-1 items-center">
        <Search className="pointer-events-none absolute left-2.5 size-3.5 text-muted-foreground" />
        <Input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              onClose();
            } else if (e.key === 'Enter') {
              e.preventDefault();
              if (e.shiftKey) {
                onPrevMatch();
              } else {
                onNextMatch();
              }
            }
          }}
          placeholder="Search in this conversation… (Enter / Shift+Enter to cycle)"
          className="h-8 pl-8 pr-20 text-xs"
        />
        {matchLabel ? (
          <span className="pointer-events-none absolute right-2.5 font-mono text-[11px] tabular-nums text-muted-foreground">
            {matchLabel}
          </span>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-0.5">
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={!hasMatches}
          onClick={onPrevMatch}
          aria-label="Previous search match"
          title="Previous match (Shift+Enter)"
        >
          <ChevronUp className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={!hasMatches}
          onClick={onNextMatch}
          aria-label="Next search match"
          title="Next match (Enter)"
        >
          <ChevronDown className="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onClose}
          aria-label="Close search"
          title="Close search (Esc)"
        >
          <X className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}
