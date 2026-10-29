'use client';

import * as React from 'react';
import { Check, ChevronsUpDown, Loader2, MapPin, Search, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { fetchApiData } from '@/lib/api';
import type { GeographyNodeOption } from './types';

interface GeographyNodeSelectorProps {
  readonly value: string | null;
  readonly onSelect: (node: GeographyNodeOption | null) => void;
  readonly initialNode?: GeographyNodeOption | null;
  readonly placeholder?: string;
  readonly disabled?: boolean;
}

export function GeographyNodeSelector({
  value,
  onSelect,
  initialNode = null,
  placeholder = 'Search by division, district, city, or thana…',
  disabled = false,
}: GeographyNodeSelectorProps) {
  const [open, setOpen] = React.useState(false);
  const [searchTerm, setSearchTerm] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [results, setResults] = React.useState<readonly GeographyNodeOption[]>([]);
  const [selected, setSelected] = React.useState<GeographyNodeOption | null>(initialNode);
  const containerRef = React.useRef<HTMLDivElement>(null);

  // Sync internal selected state if value changes externally
  React.useEffect(() => {
    if (!value) {
      setSelected(null);
    } else if (initialNode && initialNode.id === value) {
      setSelected(initialNode);
    }
  }, [value, initialNode]);

  // Search API with debounce
  React.useEffect(() => {
    if (!open) return;

    let active = true;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const query = searchTerm.trim();
        const data = await fetchApiData<readonly GeographyNodeOption[]>(
          `/admin/geography/search${query ? `?q=${encodeURIComponent(query)}` : ''}`,
        );
        if (active) {
          setResults(data ?? []);
        }
      } catch {
        if (active) setResults([]);
      } finally {
        if (active) setLoading(false);
      }
    }, 200);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [searchTerm, open]);

  // Close on outside click
  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [open]);

  function handleSelectNode(node: GeographyNodeOption) {
    setSelected(node);
    onSelect(node);
    setOpen(false);
    setSearchTerm('');
  }

  function handleClear(e: React.MouseEvent) {
    e.stopPropagation();
    setSelected(null);
    onSelect(null);
    setSearchTerm('');
  }

  return (
    <div ref={containerRef} className="relative w-full">
      {/* Trigger Button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((prev) => !prev)}
        className="flex h-9 w-full items-center justify-between rounded-lg border border-border bg-card px-3 text-xs text-foreground shadow-2xs transition-colors hover:bg-muted/40 focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
      >
        <div className="flex items-center gap-2 min-w-0 overflow-hidden">
          <MapPin className="size-3.5 text-primary shrink-0" />
          {selected ? (
            <div className="flex items-center gap-1.5 truncate">
              <span className="font-medium text-foreground truncate">{selected.name}</span>
              <Badge variant="secondary" className="text-[10px] h-4 px-1 shrink-0 uppercase">
                {selected.nodeType.replace(/_/g, ' ')}
              </Badge>
              {selected.parentName && (
                <span className="text-[11px] text-muted-foreground truncate">
                  in {selected.parentName}
                </span>
              )}
            </div>
          ) : (
            <span className="text-muted-foreground truncate">{placeholder}</span>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0 ml-1">
          {selected && !disabled && (
            <span
              role="button"
              tabIndex={0}
              aria-label="Clear geography selection"
              onClick={handleClear}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleClear(e as unknown as React.MouseEvent);
                }
              }}
              className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground cursor-pointer"
            >
              <X className="size-3" />
            </span>
          )}
          <ChevronsUpDown className="size-3.5 text-muted-foreground" />
        </div>
      </button>

      {/* Dropdown Popup */}
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1.5 w-full rounded-xl border border-border bg-card p-2 shadow-lg animate-in fade-in-0 zoom-in-95 duration-100">
          {/* Search Input Inside Dropdown */}
          <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-2.5 py-1.5">
            <Search className="size-3.5 text-muted-foreground shrink-0" />
            <input
              type="text"
              autoFocus
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Type division, district, or thana name…"
              className="w-full bg-transparent text-xs text-foreground placeholder:text-muted-foreground outline-none"
            />
            {loading && <Loader2 className="size-3.5 animate-spin text-primary shrink-0" />}
          </div>

          {/* Results List */}
          <div className="mt-2 max-h-56 overflow-y-auto space-y-1">
            {results.length > 0 ? (
              results.map((node) => {
                const isSelected = selected?.id === node.id;
                return (
                  <button
                    key={node.id}
                    type="button"
                    onClick={() => handleSelectNode(node)}
                    className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-xs transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-primary/10 text-primary font-medium'
                        : 'text-foreground hover:bg-muted/60'
                    }`}
                  >
                    <div className="flex flex-col gap-0.5 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium truncate">{node.name}</span>
                        {node.localName && (
                          <span className="text-[11px] text-muted-foreground truncate">
                            ({node.localName})
                          </span>
                        )}
                        <Badge variant="outline" className="text-[10px] h-4 px-1 uppercase tracking-tight">
                          {node.nodeType.replace(/_/g, ' ')}
                        </Badge>
                      </div>
                      {node.parentName && (
                        <p className="text-[10px] text-muted-foreground truncate">
                          Belongs to: {node.parentName}
                        </p>
                      )}
                    </div>
                    {isSelected && <Check className="size-3.5 text-primary shrink-0 ml-2" />}
                  </button>
                );
              })
            ) : (
              <div className="p-4 text-center text-xs text-muted-foreground">
                {loading ? 'Searching geography database…' : 'No geographic nodes found.'}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

