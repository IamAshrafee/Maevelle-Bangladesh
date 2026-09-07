'use client';

import { Search, X, Loader2 } from 'lucide-react';
import * as React from 'react';

import { cn } from '@/lib/utils';

export interface SearchInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange'> {
  /** Shows a spinner instead of the search icon */
  isLoading?: boolean;
  /** Called when the clear button is clicked or Escape is pressed */
  onClear?: () => void;
  /**
   * Keyboard shortcut to focus the input.
   * Examples: "/", "k", "cmd+k", "ctrl+k", "⌘+k"
   */
  shortcut?: string;
  /** Accessible label for the input */
  label?: string;
  /** Callback fired when the input value changes (controlled or uncontrolled) */
  onChange?: (value: string) => void;
  /** The value of the input (for controlled mode) */
  value?: string;
  /** The default value (for uncontrolled mode) */
  defaultValue?: string;
}

export const SearchInput = React.forwardRef<HTMLInputElement, SearchInputProps>(
  (
    {
      className,
      isLoading,
      onClear,
      shortcut,
      label,
      value: controlledValue,
      defaultValue,
      onChange,
      onKeyDown,
      ...props
    },
    ref
  ) => {
    const inputRef = React.useRef<HTMLInputElement>(null);

    // Expose focus via ref
    React.useImperativeHandle(ref, () => inputRef.current as HTMLInputElement);

    // Internal state for uncontrolled mode
    const [internalValue, setInternalValue] = React.useState(defaultValue ?? '');
    const isControlled = controlledValue !== undefined;
    const value = isControlled ? controlledValue : internalValue;

    // Update internal state when controlled value changes (to keep display in sync)
    React.useEffect(() => {
      if (isControlled && controlledValue !== internalValue) {
        setInternalValue(controlledValue);
      }
    }, [controlledValue, isControlled]);

    // Handle input change
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = e.target.value;
      if (!isControlled) {
        setInternalValue(newValue);
      }
      onChange?.(newValue);
    };

    // Clear handler
    const handleClear = React.useCallback(
      (e?: React.SyntheticEvent) => {
        e?.preventDefault();
        // Update value
        if (!isControlled) {
          setInternalValue('');
        }
        onChange?.('');
        onClear?.();
        // Refocus input
        inputRef.current?.focus();
      },
      [isControlled, onChange, onClear]
    );

    // Keyboard shortcut to focus input
    React.useEffect(() => {
      if (!shortcut) return;

      // Parse shortcut into modifier and key
      const parts = shortcut.toLowerCase().split('+').map((part) => part.trim());
      const isSingleChar = parts.length === 1 && parts[0].length === 1;
      const mainKey = parts[parts.length - 1]; // last part is the actual key
      const modifiers = parts.slice(0, -1); // everything before is modifier

      const handleKeyDown = (e: KeyboardEvent) => {
        // Ignore if focus is in an input, textarea, or select
        if (
          document.activeElement?.tagName === 'INPUT' ||
          document.activeElement?.tagName === 'TEXTAREA' ||
          document.activeElement?.tagName === 'SELECT'
        ) {
          return;
        }

        // Single character shortcut (no modifiers)
        if (isSingleChar && e.key.toLowerCase() === mainKey && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) {
          e.preventDefault();
          inputRef.current?.focus();
          return;
        }

        // Modifier + key shortcut (e.g., cmd+k)
        if (!isSingleChar) {
          const hasCmd = modifiers.includes('cmd') || modifiers.includes('⌘');
          const hasCtrl = modifiers.includes('ctrl') || modifiers.includes('⌃');
          const hasAlt = modifiers.includes('alt') || modifiers.includes('⌥');
          const hasShift = modifiers.includes('shift') || modifiers.includes('⇧');

          const matchesModifiers =
            (hasCmd ? e.metaKey : true) &&
            (hasCtrl ? e.ctrlKey : true) &&
            (hasAlt ? e.altKey : true) &&
            (hasShift ? e.shiftKey : true);

          const keyMatches = e.key.toLowerCase() === mainKey;

          if (matchesModifiers && keyMatches) {
            e.preventDefault();
            inputRef.current?.focus();
          }
        }
      };

      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }, [shortcut]);

    // Handle Escape on the input itself
    const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Escape' && value) {
        e.preventDefault();
        e.stopPropagation();
        handleClear();
      }
      onKeyDown?.(e);
    };

    // Build shortcut display
    const shortcutParts = shortcut ? shortcut.split('+').map((part) => part.trim()) : [];
    const hasShortcutDisplay = shortcutParts.length > 0;

    return (
      <div
        className={cn(
          'group flex h-9 w-full items-center gap-2 rounded-lg border bg-card px-3 text-sm ring-offset-background transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/20',
          className
        )}
      >
        {isLoading ? (
          <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" aria-hidden="true" />
        ) : (
          <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        )}
        <input
          ref={inputRef}
          type="text"
          role="searchbox"
          aria-label={label ?? props['aria-label'] ?? 'Search'}
          aria-busy={isLoading}
          className="min-w-0 flex-1 appearance-none border-0 bg-transparent p-0 shadow-none outline-none focus:ring-0 focus-visible:ring-0 placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
          value={value}
          onChange={handleChange}
          onKeyDown={handleInputKeyDown}
          {...props}
        />
        {value ? (
          <button
            type="button"
            className="flex size-6 shrink-0 appearance-none items-center justify-center rounded-sm border-0 bg-transparent p-0 text-muted-foreground shadow-none transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onMouseDown={(e) => {
              e.preventDefault(); // keep focus on input
              handleClear(e);
            }}
            aria-label="Clear search"
            title="Clear search (Esc)"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        ) : hasShortcutDisplay ? (
          <div className="pointer-events-none hidden items-center gap-1 sm:flex group-focus-within:hidden">
            {shortcutParts.map((part, i) => (
              <kbd
                key={i}
                className="inline-flex h-5 min-w-4 items-center justify-center rounded-[4px] border bg-muted px-1 font-mono text-[10px] font-medium text-muted-foreground"
              >
                {part}
              </kbd>
            ))}
          </div>
        ) : null}
      </div>
    );
  }
);
SearchInput.displayName = 'SearchInput';