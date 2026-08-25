'use client';

import * as React from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export const WorklistContext = React.createContext<{
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  filters: Record<string, string>;
  setFilter: (key: string, value: string | null) => void;
  clearFilters: () => void;
  sort: { column: string; direction: 'asc' | 'desc' } | null;
  setSort: (column: string) => void;
  selectedIds: Set<string>;
  toggleSelection: (id: string) => void;
  toggleAll: (ids: string[]) => void;
  clearSelection: () => void;
} | null>(null);

export function useWorklist() {
  const context = React.useContext(WorklistContext);
  if (!context) {
    throw new Error('useWorklist must be used within a Worklist component');
  }
  return context;
}

export function Worklist({ children, className }: { children: React.ReactNode; className?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const searchQuery = searchParams.get('q') || '';
  
  const sortParam = searchParams.get('sort');
  const sort = sortParam ? { 
    column: sortParam.startsWith('-') ? sortParam.slice(1) : sortParam, 
    direction: sortParam.startsWith('-') ? 'desc' : 'asc' 
  } as const : null;

  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());

  // Extract all params except q and sort as filters
  const filters: Record<string, string> = {};
  searchParams.forEach((value, key) => {
    if (key !== 'q' && key !== 'sort' && key !== 'page') {
      filters[key] = value;
    }
  });

  const updateUrl = React.useCallback((params: URLSearchParams) => {
    router.push(`${pathname}?${params.toString()}`);
  }, [pathname, router]);

  const setSearchQuery = React.useCallback((query: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (query) params.set('q', query);
    else params.delete('q');
    params.delete('page'); // Reset pagination on search
    updateUrl(params);
  }, [searchParams, updateUrl]);

  const setFilter = React.useCallback((key: string, value: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    params.delete('page');
    updateUrl(params);
  }, [searchParams, updateUrl]);

  const clearFilters = React.useCallback(() => {
    const params = new URLSearchParams();
    if (sortParam) params.set('sort', sortParam);
    updateUrl(params);
  }, [sortParam, updateUrl]);

  const setSort = React.useCallback((column: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (sort?.column === column && sort.direction === 'asc') {
      params.set('sort', `-${column}`);
    } else if (sort?.column === column && sort.direction === 'desc') {
      params.delete('sort');
    } else {
      params.set('sort', column);
    }
    updateUrl(params);
  }, [searchParams, sort, updateUrl]);

  const toggleSelection = React.useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAll = React.useCallback((ids: string[]) => {
    setSelectedIds(prev => {
      if (prev.size === ids.length) return new Set();
      return new Set(ids);
    });
  }, []);

  const clearSelection = React.useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const value = React.useMemo(() => ({
    searchQuery, setSearchQuery,
    filters, setFilter, clearFilters,
    sort, setSort,
    selectedIds, toggleSelection, toggleAll, clearSelection
  }), [searchQuery, setSearchQuery, filters, setFilter, clearFilters, sort, setSort, selectedIds, toggleSelection, toggleAll, clearSelection]);

  return (
    <WorklistContext.Provider value={value}>
      <div className={cn("flex flex-col space-y-4", className)}>
        {children}
      </div>
    </WorklistContext.Provider>
  );
}

export function WorklistToolbar({ 
  children,
  searchPlaceholder = "Search...",
  actions
}: { 
  children?: React.ReactNode;
  searchPlaceholder?: string;
  actions?: React.ReactNode;
}) {
  const { searchQuery, setSearchQuery, filters, clearFilters, selectedIds, clearSelection } = useWorklist();
  
  const activeFilterCount = Object.keys(filters).length;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 flex-1">
          <Input 
            placeholder={searchPlaceholder}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="max-w-sm"
          />
          {children}
          {activeFilterCount > 0 && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              Clear filters
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2">
          {actions}
        </div>
      </div>
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-2 bg-muted/50 p-2 text-sm rounded-md">
          <span className="font-medium text-foreground">{selectedIds.size} selected</span>
          <Button variant="ghost" size="sm" onClick={clearSelection}>Clear</Button>
          <div className="flex-1" />
          <div className="flex items-center gap-2">
            {/* Bulk actions can be injected here or as part of actions */}
          </div>
        </div>
      )}
    </div>
  );
}

// Re-export standard table components for convenience
export { Table, TableBody, TableCell, TableHead, TableHeader, TableRow };
