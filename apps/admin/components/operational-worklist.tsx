'use client';

import {
  AlertTriangle,
  BookmarkPlus,
  CheckCircle2,
  ListFilter,
  Search,
  SlidersHorizontal,
} from 'lucide-react';
import React, { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';

import { cn } from '../lib/utils';

export type WorklistDensity = 'comfortable' | 'compact';
export type WorklistSort = 'newest' | 'oldest' | 'reference';

export interface WorklistView {
  readonly name: string;
  readonly query: string;
  readonly status: string;
  readonly sort: WorklistSort;
}

interface WorklistOptions<T> {
  readonly items: readonly T[];
  readonly storageKey: string;
  readonly getSearchText: (item: T) => string;
  readonly getStatus: (item: T) => string;
  readonly getReference: (item: T) => string;
  readonly getTimestamp?: (item: T) => string | undefined;
}

function normalize(value: string) {
  return value.trim().toLocaleLowerCase();
}

export function filterAndSortWorklist<T>(
  items: readonly T[],
  options: Pick<
    WorklistOptions<T>,
    'getSearchText' | 'getStatus' | 'getReference' | 'getTimestamp'
  > & {
    readonly query: string;
    readonly status: string;
    readonly sort: WorklistSort;
  },
): readonly T[] {
  const query = normalize(options.query);
  const filtered = items.filter((item) => {
    const matchesQuery = !query || normalize(options.getSearchText(item)).includes(query);
    const matchesStatus = options.status === 'ALL' || options.getStatus(item) === options.status;
    return matchesQuery && matchesStatus;
  });
  return [...filtered].sort((left, right) => {
    if (options.sort === 'reference')
      return options.getReference(left).localeCompare(options.getReference(right));
    const leftTime = Date.parse(options.getTimestamp?.(left) ?? '') || 0;
    const rightTime = Date.parse(options.getTimestamp?.(right) ?? '') || 0;
    return options.sort === 'oldest' ? leftTime - rightTime : rightTime - leftTime;
  });
}

export function useOperationalWorklist<T>({
  items,
  storageKey,
  getSearchText,
  getStatus,
  getReference,
  getTimestamp,
}: WorklistOptions<T>) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('ALL');
  const [sort, setSort] = useState<WorklistSort>('newest');
  const [density, setDensity] = useState<WorklistDensity>('comfortable');
  const [savedViews, setSavedViews] = useState<readonly WorklistView[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setQuery(params.get('q') ?? params.get('search') ?? params.get('query') ?? '');
    setStatus(params.get('status') ?? 'ALL');
    const urlSort = params.get('sort');
    if (urlSort === 'newest' || urlSort === 'oldest' || urlSort === 'reference') setSort(urlSort);
    const storedDensity = window.localStorage.getItem(`${storageKey}:density`);
    if (storedDensity === 'comfortable' || storedDensity === 'compact') setDensity(storedDensity);
    try {
      const stored = JSON.parse(
        window.localStorage.getItem(`${storageKey}:views`) ?? '[]',
      ) as unknown;
      if (Array.isArray(stored)) setSavedViews(stored as readonly WorklistView[]);
    } catch {
      window.localStorage.removeItem(`${storageKey}:views`);
    }
    setReady(true);
  }, [storageKey]);

  useEffect(() => {
    if (!ready) return;
    const url = new URL(window.location.href);
    const write = (key: string, value: string, defaultValue: string) => {
      if (value === defaultValue) url.searchParams.delete(key);
      else url.searchParams.set(key, value);
    };
    write('q', query, '');
    write('status', status, 'ALL');
    write('sort', sort, 'newest');
    window.history.replaceState(window.history.state, '', url);
    window.localStorage.setItem(`${storageKey}:density`, density);
  }, [density, query, ready, sort, status, storageKey]);

  const visibleItems = useMemo(
    () =>
      filterAndSortWorklist(items, {
        query,
        status,
        sort,
        getSearchText,
        getStatus,
        getReference,
        ...(getTimestamp ? { getTimestamp } : {}),
      }),
    [getReference, getSearchText, getStatus, getTimestamp, items, query, sort, status],
  );

  const saveView = useCallback(
    (name: string) => {
      const cleanName = name.trim();
      if (!cleanName) return;
      const next = [
        ...savedViews.filter(
          (view) => view.name.toLocaleLowerCase() !== cleanName.toLocaleLowerCase(),
        ),
        { name: cleanName, query, status, sort },
      ];
      setSavedViews(next);
      window.localStorage.setItem(`${storageKey}:views`, JSON.stringify(next));
    },
    [query, savedViews, sort, status, storageKey],
  );

  const applyView = useCallback(
    (name: string) => {
      const view = savedViews.find((candidate) => candidate.name === name);
      if (!view) return;
      setQuery(view.query);
      setStatus(view.status);
      setSort(view.sort);
    },
    [savedViews],
  );

  return {
    query,
    setQuery,
    status,
    setStatus,
    sort,
    setSort,
    density,
    setDensity,
    savedViews,
    saveView,
    applyView,
    visibleItems,
  } as const;
}

export function OperationalPageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  readonly eyebrow: string;
  readonly title: string;
  readonly description: string;
  readonly actions?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 border-b border-border/70 pb-5 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0 space-y-1">
        {eyebrow ? (
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">{eyebrow}</p>
        ) : null}
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">{title}</h1>
        <p className="text-sm text-muted-foreground max-w-3xl">{description}</p>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2.5 shrink-0">{actions}</div> : null}
    </header>
  );
}

export function OperationalFeedback({
  children,
  tone = 'success',
}: {
  readonly children: ReactNode;
  readonly tone?: 'success' | 'warning' | 'danger';
}) {
  const Icon = tone === 'success' ? CheckCircle2 : AlertTriangle;
  return (
    <div
      className={cn(
        'flex items-center gap-2.5 rounded-lg border px-3.5 py-2.5 text-xs sm:text-sm font-medium',
        tone === 'success' && 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300',
        tone === 'warning' && 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300',
        tone === 'danger' && 'border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300',
      )}
      role={tone === 'danger' ? 'alert' : 'status'}
    >
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </div>
  );
}

export function OperationalEmptyState({
  title,
  description,
  action,
}: {
  readonly title: string;
  readonly description: string;
  readonly action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center p-8 sm:p-12 text-center rounded-xl border border-dashed border-border bg-muted/20">
      <div className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground mb-3">
        <ListFilter className="size-5" aria-hidden="true" />
      </div>
      <strong className="text-sm font-semibold text-foreground">{title}</strong>
      <p className="mt-1 text-xs text-muted-foreground max-w-sm">{description}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function OperationalWorklistToolbar({
  query,
  onQueryChange,
  status,
  onStatusChange,
  statuses,
  sort,
  onSortChange,
  density,
  onDensityChange,
  resultCount,
  savedViews,
  onSaveView,
  onApplyView,
  searchLabel,
}: {
  readonly query: string;
  readonly onQueryChange: (value: string) => void;
  readonly status: string;
  readonly onStatusChange: (value: string) => void;
  readonly statuses: readonly string[];
  readonly sort: WorklistSort;
  readonly onSortChange: (value: WorklistSort) => void;
  readonly density: WorklistDensity;
  readonly onDensityChange: (value: WorklistDensity) => void;
  readonly resultCount: number;
  readonly savedViews: readonly WorklistView[];
  readonly onSaveView: (name: string) => void;
  readonly onApplyView: (name: string) => void;
  readonly searchLabel: string;
}) {
  const [viewName, setViewName] = useState('');
  return (
    <div className="flex flex-wrap items-center gap-3 p-3 sm:p-4 rounded-xl border border-border bg-card shadow-2xs">
      {/* Search Input */}
      <div className="relative flex-1 min-w-[220px]">
        <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" aria-hidden="true" />
        <span className="sr-only">{searchLabel}</span>
        <input
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder={searchLabel}
          className="h-9 w-full rounded-lg border border-input bg-card pl-9 pr-3 text-xs sm:text-sm text-foreground shadow-2xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20 transition-colors"
        />
      </div>

      {/* Filter by Status */}
      <div className="relative shrink-0">
        <label className="flex items-center gap-1.5 h-9 rounded-lg border border-input bg-card px-2.5 text-xs text-foreground shadow-2xs hover:bg-muted/40 transition-colors cursor-pointer">
          <ListFilter className="size-3.5 text-muted-foreground shrink-0" aria-hidden="true" />
          <span className="sr-only">Filter by status</span>
          <select
            value={status}
            onChange={(event) => onStatusChange(event.target.value)}
            className="bg-transparent text-xs text-foreground outline-none cursor-pointer"
          >
            <option value="ALL">All statuses</option>
            {statuses.map((value) => (
              <option key={value} value={value}>
                {value.replaceAll('_', ' ')}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Sort Worklist */}
      <div className="relative shrink-0">
        <label className="flex items-center gap-1.5 h-9 rounded-lg border border-input bg-card px-2.5 text-xs text-foreground shadow-2xs hover:bg-muted/40 transition-colors cursor-pointer">
          <SlidersHorizontal className="size-3.5 text-muted-foreground shrink-0" aria-hidden="true" />
          <span className="sr-only">Sort worklist</span>
          <select
            value={sort}
            onChange={(event) => onSortChange(event.target.value as WorklistSort)}
            className="bg-transparent text-xs text-foreground outline-none cursor-pointer"
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="reference">Reference A–Z</option>
          </select>
        </label>
      </div>

      {/* Density Toggle */}
      <div className="flex items-center rounded-lg border border-input bg-muted/30 p-0.5 text-xs" aria-label="Table density">
        <button
          type="button"
          aria-pressed={density === 'comfortable'}
          onClick={() => onDensityChange('comfortable')}
          className={cn(
            'px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer',
            density === 'comfortable' ? 'bg-card text-foreground shadow-2xs' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          Comfortable
        </button>
        <button
          type="button"
          aria-pressed={density === 'compact'}
          onClick={() => onDensityChange('compact')}
          className={cn(
            'px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer',
            density === 'compact' ? 'bg-card text-foreground shadow-2xs' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          Compact
        </button>
      </div>

      {/* Saved Views */}
      <details className="relative shrink-0 group">
        <summary className="flex items-center gap-1.5 h-9 rounded-lg border border-input bg-card px-2.5 text-xs font-medium text-foreground shadow-2xs hover:bg-muted/40 transition-colors cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden">
          <BookmarkPlus className="size-3.5 text-muted-foreground" aria-hidden="true" />
          <span>Saved views</span>
        </summary>
        <div className="absolute right-0 top-full mt-1.5 w-64 rounded-xl border border-border bg-card p-3 shadow-lg z-30 space-y-3 animate-in fade-in zoom-in-95 duration-100">
          {savedViews.length ? (
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Apply saved view</label>
              <select
                defaultValue=""
                onChange={(event) => onApplyView(event.target.value)}
                className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs text-foreground outline-none"
              >
                <option value="" disabled>Choose a view…</option>
                {savedViews.map((view) => (
                  <option key={view.name} value={view.name}>{view.name}</option>
                ))}
              </select>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No saved views yet.</p>
          )}
          <form
            onSubmit={(event) => {
              event.preventDefault();
              onSaveView(viewName);
              setViewName('');
            }}
            className="space-y-2 pt-2 border-t border-border"
          >
            <input
              placeholder="Name current view…"
              value={viewName}
              onChange={(event) => setViewName(event.target.value)}
              maxLength={60}
              required
              className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs text-foreground outline-none placeholder:text-muted-foreground"
            />
            <button
              type="submit"
              className="w-full h-8 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary-hover transition-colors cursor-pointer shadow-2xs"
            >
              Save current view
            </button>
          </form>
        </div>
      </details>

      {/* Result Count */}
      <span className="ml-auto text-xs text-muted-foreground tabular-nums shrink-0" aria-live="polite">
        {resultCount} result{resultCount === 1 ? '' : 's'}
      </span>
    </div>
  );
}
