'use client';

import Link from 'next/link';

import { cx } from '@/components/ui/classnames';
import {
  ArrowRightIcon,
  CloseIcon,
  HistoryIcon,
  SearchIcon,
  SparklesIcon,
} from '@/components/ui/icons';
import {
  POPULAR_CATEGORY_SHORTCUTS,
  TRENDING_SEARCH_SUGGESTIONS,
  filterSearchSuggestions,
} from './search-constants';
import { useRecentSearches } from './use-recent-searches';

export interface SearchDropdownPanelProps {
  readonly className?: string | undefined;
  readonly isMobile?: boolean | undefined;
  readonly onClose?: (() => void) | undefined;
  readonly onSelectTerm: (term: string) => void;
  readonly query: string;
}

export function SearchDropdownPanel({
  className,
  isMobile = false,
  onClose,
  onSelectTerm,
  query,
}: SearchDropdownPanelProps) {
  const { recentSearches, removeRecentSearch, clearRecentSearches } = useRecentSearches();
  const trimmedQuery = query.trim();
  const hasQuery = trimmedQuery.length > 0;
  const filteredSuggestions = hasQuery ? filterSearchSuggestions(trimmedQuery) : [];

  return (
    <div
      className={cx(
        'w-full rounded-2xl border border-border/70 bg-surface-container-lowest/98 shadow-xl backdrop-blur-2xl transition-all duration-200',
        isMobile ? 'p-3.5' : 'p-4',
        className,
      )}
    >
      {/* 1. ACTIVE QUERY MODE: Live dynamic matches and quick search action */}
      {hasQuery ? (
        <div className="space-y-3">
          {/* Direct Search Action Row */}
          <button
            className="group flex w-full items-center justify-between rounded-xl bg-primary-fixed/20 px-3.5 py-2.5 text-left text-on-surface transition-all duration-150 hover:bg-primary-fixed/35 active:scale-[0.99] cursor-pointer border border-primary-fixed/40"
            onClick={() => onSelectTerm(trimmedQuery)}
            onMouseDown={(e) => e.preventDefault()}
            type="button"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-white shadow-2xs">
                <SearchIcon size={14} />
              </span>
              <div className="truncate">
                <span className="font-label-md text-xs text-on-surface-variant">Search for </span>
                <span className="font-headline-sm text-sm font-semibold text-primary">
                  &ldquo;{trimmedQuery}&rdquo;
                </span>
                <span className="font-label-md text-xs text-on-surface-variant"> in catalog</span>
              </div>
            </div>
            <ArrowRightIcon
              className="text-primary transition-transform duration-150 group-hover:translate-x-1 shrink-0"
              size={16}
            />
          </button>

          {/* Filtered suggestions matching the typed text */}
          {filteredSuggestions.length > 0 ? (
            <div>
              <div className="mb-2 flex items-center justify-between px-1">
                <span className="font-label-sm text-[11px] font-bold uppercase tracking-wider text-primary flex items-center gap-1.5">
                  <SparklesIcon size={12} />
                  Matching Collections
                </span>
                <span className="text-[10px] text-on-surface-variant/70 font-mono">
                  {filteredSuggestions.length} found
                </span>
              </div>
              <ul className="space-y-1">
                {filteredSuggestions.map((item) => (
                  <li key={item.term}>
                    <button
                      className="group flex w-full items-center justify-between rounded-xl px-3 py-2 text-left transition-colors duration-150 hover:bg-surface-container-low active:scale-[0.99] cursor-pointer"
                      onClick={() => onSelectTerm(item.term)}
                      onMouseDown={(e) => e.preventDefault()}
                      type="button"
                    >
                      <div className="flex items-center gap-2.5 truncate">
                        <SearchIcon
                          className="text-on-surface-variant/60 group-hover:text-primary transition-colors shrink-0"
                          size={14}
                        />
                        <span className="font-body-md text-xs font-medium text-on-surface group-hover:text-primary transition-colors truncate">
                          {item.term}
                        </span>
                      </div>
                      <span className="rounded-full bg-surface-container px-2.5 py-0.5 font-label-sm text-[10px] font-medium text-on-surface-variant shrink-0 group-hover:bg-primary-fixed group-hover:text-on-primary-fixed transition-colors">
                        {item.category}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="rounded-xl bg-surface-container-low/60 px-3.5 py-2.5 text-center text-on-surface-variant">
              <p className="font-body-sm text-xs">
                Press <span className="font-semibold text-primary font-mono">Enter</span> or tap Search to explore all items matching &ldquo;{trimmedQuery}&rdquo;
              </p>
            </div>
          )}
        </div>
      ) : (
        /* 2. IDLE / EMPTY QUERY MODE: Recent Searches, Trending, Popular Shortcuts */
        <div className="space-y-3.5">
          {/* Recent Searches (if user has recent queries) */}
          {recentSearches.length > 0 && (
            <div className="border-b border-border/40 pb-3">
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-on-surface-variant">
                  <HistoryIcon size={13} />
                  <span className="font-label-sm text-[11px] font-bold uppercase tracking-wider">
                    Recent Searches
                  </span>
                </div>
                <button
                  className="font-label-sm text-[11px] text-outline hover:text-primary active:scale-95 transition-all cursor-pointer underline underline-offset-2"
                  onClick={clearRecentSearches}
                  onMouseDown={(e) => e.preventDefault()}
                  type="button"
                >
                  Clear all
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {recentSearches.map((term) => (
                  <div
                    className="group inline-flex items-center gap-1 rounded-full bg-surface-container px-3 py-1 font-label-sm text-xs text-on-surface transition-all duration-150 hover:bg-surface-container-high"
                    key={term}
                  >
                    <button
                      className="cursor-pointer font-medium hover:text-primary transition-colors"
                      onClick={() => onSelectTerm(term)}
                      onMouseDown={(e) => e.preventDefault()}
                      type="button"
                    >
                      {term}
                    </button>
                    <button
                      aria-label={`Remove ${term} from recent searches`}
                      className="flex h-4 w-4 items-center justify-center rounded-full text-on-surface-variant/70 hover:bg-surface-variant hover:text-primary active:scale-90 transition-all cursor-pointer"
                      onClick={() => removeRecentSearch(term)}
                      onMouseDown={(e) => e.preventDefault()}
                      type="button"
                    >
                      <CloseIcon size={10} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Trending Searches Section */}
          <div>
            <div className="mb-2.5 flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-primary">
                <SparklesIcon size={13} />
                <span className="font-label-sm text-[11px] font-bold uppercase tracking-wider">
                  Trending Now
                </span>
              </div>
              {!isMobile && (
                <span className="text-[10px] text-on-surface-variant/70 font-mono">
                  Press ↵ to search • ESC to close
                </span>
              )}
            </div>

            {/* Trending Suggestion Pills */}
            <div className="flex flex-wrap gap-1.5">
              {TRENDING_SEARCH_SUGGESTIONS.map((item) => (
                <button
                  className="group inline-flex items-center gap-1.5 rounded-full bg-surface-container px-3.5 py-1.5 font-label-sm text-xs text-on-surface transition-all duration-150 hover:scale-[1.02] hover:bg-primary-fixed hover:text-on-primary-fixed active:scale-95 cursor-pointer border border-transparent hover:border-primary-fixed-dim"
                  key={item.term}
                  onClick={() => onSelectTerm(item.term)}
                  onMouseDown={(e) => e.preventDefault()}
                  type="button"
                >
                  <span className="font-medium">{item.term}</span>
                  <span className="text-[10px] opacity-60 font-normal">({item.category})</span>
                </button>
              ))}
            </div>
          </div>

          {/* Popular Collections Shortcut Links */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/40 pt-2.5">
            <span className="font-label-sm text-[10px] font-semibold uppercase tracking-wider text-outline">
              Popular Collections:
            </span>
            <div className="flex flex-wrap items-center gap-2.5">
              {POPULAR_CATEGORY_SHORTCUTS.map((cat) => (
                <Link
                  className="font-label-sm text-[11px] font-medium text-primary underline underline-offset-2 transition-colors duration-150 hover:text-primary-hover active:scale-95"
                  href={cat.path}
                  key={cat.path}
                  onClick={() => onClose?.()}
                >
                  {cat.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
