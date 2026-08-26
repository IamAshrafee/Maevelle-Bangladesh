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
    setQuery(params.get('q') ?? '');
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
    <header className="page-header">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
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
    <div className={cn('notice', `notice-${tone}`)} role={tone === 'danger' ? 'alert' : 'status'}>
      <Icon aria-hidden="true" />
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
    <div className="empty-state">
      <ListFilter aria-hidden="true" />
      <strong>{title}</strong>
      <p>{description}</p>
      {action}
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
    <div className="operational-toolbar">
      <label className="table-search">
        <Search aria-hidden="true" />
        <span className="sr-only">{searchLabel}</span>
        <input
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder={searchLabel}
        />
      </label>
      <label className="toolbar-field">
        <ListFilter aria-hidden="true" />
        <span className="sr-only">Filter by status</span>
        <select value={status} onChange={(event) => onStatusChange(event.target.value)}>
          <option value="ALL">All statuses</option>
          {statuses.map((value) => (
            <option key={value} value={value}>
              {value.replaceAll('_', ' ')}
            </option>
          ))}
        </select>
      </label>
      <label className="toolbar-field">
        <SlidersHorizontal aria-hidden="true" />
        <span className="sr-only">Sort worklist</span>
        <select value={sort} onChange={(event) => onSortChange(event.target.value as WorklistSort)}>
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="reference">Reference A–Z</option>
        </select>
      </label>
      <div className="density-toggle" aria-label="Table density">
        <button
          type="button"
          aria-pressed={density === 'comfortable'}
          onClick={() => onDensityChange('comfortable')}
        >
          Comfortable
        </button>
        <button
          type="button"
          aria-pressed={density === 'compact'}
          onClick={() => onDensityChange('compact')}
        >
          Compact
        </button>
      </div>
      <details className="saved-views">
        <summary>
          <BookmarkPlus aria-hidden="true" /> Saved views
        </summary>
        <div>
          {savedViews.length ? (
            <label>
              Apply view
              <select defaultValue="" onChange={(event) => onApplyView(event.target.value)}>
                <option value="" disabled>
                  Choose a view
                </option>
                {savedViews.map((view) => (
                  <option key={view.name} value={view.name}>
                    {view.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <p>No saved views yet.</p>
          )}
          <form
            onSubmit={(event) => {
              event.preventDefault();
              onSaveView(viewName);
              setViewName('');
            }}
          >
            <label>
              View name
              <input
                value={viewName}
                onChange={(event) => setViewName(event.target.value)}
                maxLength={60}
                required
              />
            </label>
            <button type="submit">Save current view</button>
          </form>
        </div>
      </details>
      <span className="result-count" aria-live="polite">
        {resultCount} result{resultCount === 1 ? '' : 's'}
      </span>
    </div>
  );
}
