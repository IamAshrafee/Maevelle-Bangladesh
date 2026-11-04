'use client';
import { useEffect, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useAreaSearch, type DeliveryArea } from '../use-area-search';

export function DeliveryAreaPicker({
  id,
  value,
  onSelect,
  disabled = false,
  hasError = false,
  'aria-describedby': describedBy,
}: {
  id: string;
  value: string;
  onSelect(area: DeliveryArea | null): void;
  disabled?: boolean;
  hasError?: boolean;
  'aria-describedby'?: string;
}) {
  const [query, setQuery] = useState(''),
    [open, setOpen] = useState(false),
    [active, setActive] = useState(-1),
    [chosen, setChosen] = useState<DeliveryArea | null>(null);
  const input = useRef<HTMLInputElement>(null),
    search = useAreaSearch(query, open && !disabled),
    listId = `${id}-options`;
  useEffect(() => {
    if (open && active >= 0)
      document.getElementById(`${id}-option-${active}`)?.scrollIntoView({ block: 'nearest' });
  }, [active, open, id]);
  useEffect(() => {
    if (value && chosen?.id !== value) {
      setChosen(null);
      setQuery('');
      setOpen(false);
      setActive(-1);
    }
  }, [value, chosen?.id]);
  function choose(area: DeliveryArea) {
    setChosen(area);
    setQuery(area.localName ? `${area.name} · ${area.localName}` : area.name);
    setOpen(false);
    setActive(-1);
    onSelect(area);
    input.current?.focus();
  }
  return (
    <div className="min-w-0 space-y-2">
      {value && (
        <div className="flex items-start justify-between gap-2 rounded-xl bg-primary-subtle p-3 text-sm">
          <p className="min-w-0 break-words">
            {chosen?.id === value
              ? `${chosen.name}${chosen.parentName ? `, ${chosen.parentName}` : ''}`
              : 'Delivery area saved with this address'}
          </p>
          <Button
            size="sm"
            className="min-h-11 shrink-0"
            variant="ghost"
            disabled={disabled}
            onClick={() => {
              setChosen(null);
              setQuery('');
              setOpen(false);
              onSelect(null);
              input.current?.focus();
            }}
            aria-label="Clear selected delivery area"
          >
            Clear
          </Button>
        </div>
      )}
      <Input
        id={id}
        ref={input}
        value={query}
        disabled={disabled}
        hasError={hasError}
        role="combobox"
        aria-required="true"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={
          open && active >= 0 && search.items[active] ? `${id}-option-${active}` : undefined
        }
        aria-describedby={describedBy}
        autoComplete="off"
        className="text-[length:var(--text-base)] sm:text-sm"
        placeholder={value ? 'Search to change your area' : 'Search area in English or বাংলা'}
        maxLength={80}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
          setActive(-1);
          if (value) onSelect(null);
        }}
        onFocus={() => {
          if (query.trim().length >= 2 && !value) setOpen(true);
        }}
        onBlur={(event) => {
          if (
            !event.currentTarget.parentElement?.parentElement?.contains(
              event.relatedTarget as Node | null,
            )
          )
            setOpen(false);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            setOpen(false);
            setActive(-1);
            return;
          }
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            setOpen(true);
            setActive((i) =>
              Math.max(
                0,
                Math.min(search.items.length - 1, i + (event.key === 'ArrowDown' ? 1 : -1)),
              ),
            );
          }
          if (open && (event.key === 'Home' || event.key === 'End')) {
            event.preventDefault();
            setActive(event.key === 'Home' ? 0 : search.items.length - 1);
          }
          if (event.key === 'Enter' && open) {
            event.preventDefault();
            if (search.items[active]) choose(search.items[active]!);
          }
        }}
      />
      <p className="text-xs text-on-surface-variant" aria-live="polite">
        {value
          ? 'Area selected. Delivery is checked when you save.'
          : 'Type at least 2 characters, then choose a supported result.'}
      </p>
      {open && (
        <div className="rounded-xl border border-border-subtle bg-surface-container-lowest p-2">
          <p role="status" className="px-2 py-2 text-sm text-on-surface-variant">
            {search.phase === 'loading'
              ? 'Searching supported delivery areas…'
              : search.phase === 'error'
                ? search.message
                : query.trim().length < 2
                  ? 'Enter at least 2 characters.'
                  : search.items.length === 0
                    ? 'No approved delivery areas found. Try a nearby area name or contact us. Coverage may not be configured.'
                    : `${search.items.length} results. Use arrow keys and Enter to choose.`}
          </p>
          <div
            id={listId}
            role="listbox"
            aria-label="Supported delivery areas"
            className="max-h-72 overflow-y-auto overscroll-contain"
          >
            {search.items.map((area, index) => (
              <button
                key={area.id}
                type="button"
                id={`${id}-option-${index}`}
                role="option"
                aria-selected={active === index}
                tabIndex={-1}
                className={`block min-h-12 w-full break-words rounded-lg px-3 py-3 text-left text-sm ${active === index ? 'bg-primary-subtle text-primary' : 'hover:bg-surface-container-low'}`}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActive(index)}
                onClick={() => choose(area)}
              >
                <span className="block font-semibold">
                  {area.name}
                  {area.localName ? ` · ${area.localName}` : ''}
                </span>
                {area.parentName && (
                  <span className="block text-xs text-on-surface-variant">{area.parentName}</span>
                )}
              </button>
            ))}
          </div>
          {search.nextOffset !== null && search.items.length < 100 && (
            <Button variant="ghost" disabled={search.phase === 'loading'} onClick={search.more}>
              More areas
            </Button>
          )}
          {search.items.length >= 100 && (
            <p className="p-2 text-sm">Refine your search to find more areas.</p>
          )}
          {search.phase === 'error' && (
            <Button variant="outline" disabled={Date.now() < search.retryAt} onClick={search.retry}>
              Retry area search
            </Button>
          )}
          <Button
            variant="ghost"
            onClick={() => {
              setOpen(false);
              input.current?.focus();
            }}
          >
            Close results
          </Button>
        </div>
      )}
    </div>
  );
}
