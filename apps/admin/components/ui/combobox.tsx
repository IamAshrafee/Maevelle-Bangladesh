'use client';

/**
 * Combobox — production-grade searchable/filterable select component.
 *
 * Architecture:
 *   Combobox                   – root state provider
 *   Combobox.Label             – accessible label for the input trigger
 *   Combobox.InputGroup        – wrapper that groups the input + action buttons
 *   Combobox.Input             – the text input (role=combobox, aria-expanded, etc.)
 *   Combobox.Trigger           – chevron button that toggles the popup
 *   Combobox.Clear             – × button that clears the value (shows only when value set)
 *   Combobox.Chips             – multi-select chip container
 *   Combobox.Chip              – individual selected-value chip
 *   Combobox.ChipRemove        – × remove button inside a chip
 *   Combobox.Content           – portal + positioner + popup combined
 *   Combobox.List              – scrollable option list
 *   Combobox.Empty             – no-results state
 *   Combobox.Status            – loading / searching indicator
 *   Combobox.Item              – selectable option
 *   Combobox.ItemIndicator     – ✓ indicator inside an item
 *   Combobox.Group             – groups related options
 *   Combobox.GroupLabel        – group heading
 *   Combobox.Separator         – visual divider
 *
 * Behaviour:
 *   - Controlled:   <Combobox value={v} onValueChange={set} />
 *   - Uncontrolled: <Combobox defaultValue={...} />
 *   - Multi-select: <Combobox multiple />
 *   - Async:        caller manages items + loading prop; component is race-condition-safe
 *     because result ownership stays with the caller's AbortController useEffect.
 *   - Filtering:    client-side via base-ui useFilteredItems hook (built-in, locale-aware)
 *   - Typeahead:    built into base-ui combobox keyboard handler
 *   - Keyboard:     ↑↓ Enter Esc Home End — all handled by the primitive
 *   - Portal:       immune to overflow:hidden clipping
 *   - Positioning:  base-ui Positioner handles flip / collision / scroll-container awareness
 *   - Accessibility:combobox/listbox/option ARIA pattern (correct semantics)
 *   - Animation:    respects prefers-reduced-motion
 *   - Sizes:        sm | md (default) | lg
 *   - Status:       default | error | warning | success
 *   - Form:         name prop writes hidden <input>; works with react-hook-form
 */

import * as React from 'react';
import { Combobox as ComboboxPrimitive } from '@base-ui/react/combobox';
import { Field as FieldPrimitive } from '@base-ui/react/field';
import { cva, type VariantProps } from 'class-variance-authority';
import {
  CheckIcon,
  ChevronDownIcon,
  Loader2Icon,
  SearchIcon,
  XIcon,
} from 'lucide-react';

import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ComboboxSize = 'sm' | 'md' | 'lg';
export type ComboboxStatusVariant = 'default' | 'error' | 'warning' | 'success';

// ---------------------------------------------------------------------------
// Variants
// ---------------------------------------------------------------------------

const inputGroupVariants = cva(
  [
    // layout
    'relative flex w-full items-center gap-1 rounded-lg border bg-transparent',
    // smooth transitions — ring expansion feels instant but colours feel polished
    'transition-[colors,box-shadow] duration-150',
    // focus-within ring
    'focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50',
    // disabled
    'has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50',
    // svg sizing
    "[&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4",
  ],
  {
    variants: {
      size: {
        sm: 'min-h-7 px-2 text-xs rounded-[min(var(--radius-md),10px)]',
        md: 'min-h-9 px-2.5',
        lg: 'min-h-10 px-3 text-base',
      },
      status: {
        default: 'border-input dark:bg-input/30',
        error:
          'border-destructive ring-3 ring-destructive/20 dark:border-destructive/60 dark:ring-destructive/30',
        warning:
          'border-amber-500 ring-3 ring-amber-500/20 dark:border-amber-400/60 dark:ring-amber-400/20',
        success:
          'border-emerald-500 ring-3 ring-emerald-500/20 dark:border-emerald-400/60 dark:ring-emerald-400/20',
      },
    },
    defaultVariants: { size: 'md', status: 'default' },
  },
);

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

type ComboboxContextValue = {
  size: ComboboxSize;
  status: ComboboxStatusVariant;
};

const ComboboxContext = React.createContext<ComboboxContextValue>({
  size: 'md',
  status: 'default',
});

function useComboboxContext() {
  return React.useContext(ComboboxContext);
}

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

type ComboboxRootProps<T> = ComboboxPrimitive.Root.Props<T> & {
  size?: ComboboxSize;
  status?: ComboboxStatusVariant;
};

function Combobox<T>({ size = 'md', status = 'default' as ComboboxStatusVariant, children, ...props }: ComboboxRootProps<T>) {
  return (
    <ComboboxContext.Provider value={{ size, status }}>
      <ComboboxPrimitive.Root data-slot="combobox" {...props}>
        {children}
      </ComboboxPrimitive.Root>
    </ComboboxContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Label
// ---------------------------------------------------------------------------

function ComboboxLabel({ className, ...props }: ComboboxPrimitive.Label.Props) {
  return (
    <ComboboxPrimitive.Label
      data-slot="combobox-label"
      className={cn('mb-1.5 text-sm font-medium leading-none text-foreground', className)}
      {...props}
    />
  );
}

// ---------------------------------------------------------------------------
// InputGroup
// ---------------------------------------------------------------------------

type ComboboxInputGroupProps = ComboboxPrimitive.InputGroup.Props &
  VariantProps<typeof inputGroupVariants> & {
    status?: ComboboxStatusVariant;
  };

function ComboboxInputGroup({ className, size, status, ...props }: ComboboxInputGroupProps) {
  const ctx = useComboboxContext();
  const resolvedSize = size ?? ctx.size;
  const resolvedStatus = status ?? ctx.status;
  return (
    <ComboboxPrimitive.InputGroup
      data-slot="combobox-input-group"
      className={cn(inputGroupVariants({ size: resolvedSize, status: resolvedStatus }), className)}
      {...props}
    />
  );
}

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

function ComboboxInput({ className, ...props }: ComboboxPrimitive.Input.Props) {
  return (
    <ComboboxPrimitive.Input
      data-slot="combobox-input"
      className={cn(
        'min-w-0 flex-1 bg-transparent py-1.5 text-sm outline-none placeholder:text-muted-foreground',
        className,
      )}
      {...props}
    />
  );
}

// ---------------------------------------------------------------------------
// Trigger (chevron button)
// ---------------------------------------------------------------------------

function ComboboxTrigger({ className, children, ...props }: ComboboxPrimitive.Trigger.Props) {
  return (
    <ComboboxPrimitive.Trigger
      data-slot="combobox-trigger"
      aria-label="Open popup"
      className={cn(
        'flex shrink-0 cursor-default items-center rounded text-muted-foreground',
        'transition-colors duration-150 hover:text-foreground',
        'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
        className,
      )}
      {...props}
    >
      {/* Chevron rotates 180° when aria-expanded=true on this button */}
      {children ?? (
        <ChevronDownIcon
          className="transition-transform duration-200 ease-in-out aria-expanded:rotate-180"
          aria-hidden="true"
        />
      )}
    </ComboboxPrimitive.Trigger>
  );
}

// ---------------------------------------------------------------------------
// Clear (× button)
// ---------------------------------------------------------------------------

function ComboboxClear({ className, children, ...props }: ComboboxPrimitive.Clear.Props) {
  return (
    <ComboboxPrimitive.Clear
      data-slot="combobox-clear"
      aria-label="Clear selection"
      className={cn(
        'flex shrink-0 cursor-default items-center rounded text-muted-foreground',
        // smooth colour transition + fade in/out based on placeholder state
        'transition-[color,opacity] duration-150 hover:text-foreground',
        'focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
        // hidden when no value — animate opacity out rather than hard display:none
        'data-placeholder:pointer-events-none data-placeholder:opacity-0',
        className,
      )}
      {...props}
    >
      {children ?? <XIcon aria-hidden="true" />}
    </ComboboxPrimitive.Clear>
  );
}

// ---------------------------------------------------------------------------
// Chips  (multi-select token container)
// ---------------------------------------------------------------------------

function ComboboxChips({ className, ...props }: ComboboxPrimitive.Chips.Props) {
  return (
    <ComboboxPrimitive.Chips
      data-slot="combobox-chips"
      className={cn('flex flex-wrap gap-1 py-1', className)}
      {...props}
    />
  );
}

// ---------------------------------------------------------------------------
// Chip  (individual token)
// ---------------------------------------------------------------------------

function ComboboxChip({ className, children, ...props }: ComboboxPrimitive.Chip.Props) {
  return (
    <ComboboxPrimitive.Chip
      data-slot="combobox-chip"
      className={cn(
        'flex items-center gap-1 rounded-md bg-secondary px-1.5 py-0.5 text-xs font-medium text-secondary-foreground',
        // pop-in when chip is added
        'motion-safe:animate-in motion-safe:zoom-in-75 motion-safe:fade-in-0 motion-safe:duration-150',
        className,
      )}
      {...props}
    >
      {children}
    </ComboboxPrimitive.Chip>
  );
}

// ---------------------------------------------------------------------------
// ChipRemove  (× inside a chip)
// ---------------------------------------------------------------------------

function ComboboxChipRemove({ className, children, ...props }: ComboboxPrimitive.ChipRemove.Props) {
  return (
    <ComboboxPrimitive.ChipRemove
      data-slot="combobox-chip-remove"
      aria-label="Remove"
      className={cn(
        '-mr-0.5 flex cursor-default items-center rounded',
        'transition-colors duration-100 hover:text-foreground',
        className,
      )}
      {...props}
    >
      {children ?? <XIcon className="size-3" aria-hidden="true" />}
    </ComboboxPrimitive.ChipRemove>
  );
}

// ---------------------------------------------------------------------------
// Content  (portal + positioner + popup combined)
// ---------------------------------------------------------------------------

type ComboboxContentProps = ComboboxPrimitive.Popup.Props &
  Pick<ComboboxPrimitive.Positioner.Props, 'align' | 'alignOffset' | 'side' | 'sideOffset'>;

function ComboboxContent({
  className,
  children,
  side = 'bottom',
  sideOffset = 4,
  align = 'start',
  alignOffset = 0,
  ...props
}: ComboboxContentProps) {
  return (
    <ComboboxPrimitive.Portal>
      <ComboboxPrimitive.Positioner
        side={side}
        sideOffset={sideOffset}
        align={align}
        alignOffset={alignOffset}
        className="isolate z-50"
      >
        <ComboboxPrimitive.Popup
          data-slot="combobox-content"
          className={cn(
            // layout
            'relative z-50 min-w-[var(--anchor-width)] max-h-[var(--available-height)]',
            'overflow-hidden rounded-lg',
            // colours
            'bg-popover text-popover-foreground shadow-xl ring-1 ring-foreground/10',
            // animation — spring-feel entrance, snappy exit
            'origin-[var(--transform-origin)]',
            // open
            'motion-safe:data-open:animate-in motion-safe:data-open:fade-in-0',
            'motion-safe:data-open:zoom-in-[98%]',
            'motion-safe:data-open:data-[side=bottom]:slide-in-from-top-1.5',
            'motion-safe:data-open:data-[side=top]:slide-in-from-bottom-1.5',
            'motion-safe:data-open:data-[side=left]:slide-in-from-right-1.5',
            'motion-safe:data-open:data-[side=right]:slide-in-from-left-1.5',
            // close
            'motion-safe:data-closed:animate-out motion-safe:data-closed:fade-out-0',
            'motion-safe:data-closed:zoom-out-[98%]',
            // deliberate open, snappy close
            'data-open:duration-200 data-closed:duration-100',
            className,
          )}
          {...props}
        >
          {children}
        </ComboboxPrimitive.Popup>
      </ComboboxPrimitive.Positioner>
    </ComboboxPrimitive.Portal>
  );
}

// ---------------------------------------------------------------------------
// List  (scrollable option list)
// ---------------------------------------------------------------------------

function ComboboxList({ className, ...props }: ComboboxPrimitive.List.Props) {
  return (
    <ComboboxPrimitive.List
      data-slot="combobox-list"
      className={cn('max-h-72 overflow-y-auto overflow-x-hidden p-1', className)}
      {...props}
    />
  );
}

// ---------------------------------------------------------------------------
// Empty  (no-results state)
// ---------------------------------------------------------------------------

function ComboboxEmpty({ className, children, ...props }: ComboboxPrimitive.Empty.Props) {
  return (
    <ComboboxPrimitive.Empty
      data-slot="combobox-empty"
      className={cn('px-4 py-6 text-center text-sm text-muted-foreground', className)}
      {...props}
    >
      {children ?? (
        <>
          <SearchIcon className="mx-auto mb-2 size-5 opacity-40" aria-hidden="true" />
          No results found.
        </>
      )}
    </ComboboxPrimitive.Empty>
  );
}

// ---------------------------------------------------------------------------
// Status  (loading / searching indicator)
// ---------------------------------------------------------------------------

type ComboboxStatusProps = ComboboxPrimitive.Status.Props & {
  /** Text shown during initial data load */
  loadingText?: string;
};

function ComboboxStatus({
  className,
  children,
  loadingText = 'Loading…',
  ...props
}: ComboboxStatusProps) {
  return (
    <ComboboxPrimitive.Status
      data-slot="combobox-status"
      className={cn(
        'flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground',
        className,
      )}
      {...props}
    >
      {children ?? (
        <>
          <Loader2Icon className="size-4 animate-spin" aria-hidden="true" />
          {loadingText}
        </>
      )}
    </ComboboxPrimitive.Status>
  );
}

// ---------------------------------------------------------------------------
// Item
// ---------------------------------------------------------------------------

type ComboboxItemProps = ComboboxPrimitive.Item.Props & {
  /** Icon rendered to the left */
  icon?: React.ReactNode;
  /** Secondary description line */
  description?: string;
};

function ComboboxItem({ className, children, icon, description, ...props }: ComboboxItemProps) {
  return (
    <ComboboxPrimitive.Item
      data-slot="combobox-item"
      className={cn(
        'relative flex w-full cursor-default items-start gap-2 rounded-md py-1.5 pr-8 pl-2',
        'text-sm outline-hidden select-none',
        // smooth hover
        'transition-colors duration-100',
        'focus:bg-accent focus:text-accent-foreground',
        'data-disabled:pointer-events-none data-disabled:opacity-40',
        "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    >
      {icon && (
        <span className="mt-0.5 flex shrink-0 items-center text-muted-foreground">{icon}</span>
      )}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate">{children}</span>
        {description && (
          <span className="mt-0.5 truncate text-xs text-muted-foreground">{description}</span>
        )}
      </span>
      {/* Checkmark pops in with scale+fade when item is selected */}
      <ComboboxPrimitive.ItemIndicator
        render={
          <span className="absolute right-2 top-1.5 flex size-4 items-center justify-center" />
        }
      >
        <CheckIcon
          className="size-4 motion-safe:animate-in motion-safe:zoom-in-50 motion-safe:fade-in-0 motion-safe:duration-150"
          aria-hidden="true"
        />
      </ComboboxPrimitive.ItemIndicator>
    </ComboboxPrimitive.Item>
  );
}

// ---------------------------------------------------------------------------
// Group + GroupLabel
// ---------------------------------------------------------------------------

function ComboboxGroup({ className, ...props }: ComboboxPrimitive.Group.Props) {
  return (
    <ComboboxPrimitive.Group
      data-slot="combobox-group"
      className={cn('py-1', className)}
      {...props}
    />
  );
}

function ComboboxGroupLabel({ className, ...props }: ComboboxPrimitive.GroupLabel.Props) {
  return (
    <ComboboxPrimitive.GroupLabel
      data-slot="combobox-group-label"
      className={cn('px-2 py-1 text-xs font-medium text-muted-foreground', className)}
      {...props}
    />
  );
}

// ---------------------------------------------------------------------------
// Separator
// ---------------------------------------------------------------------------

function ComboboxSeparator({ className, ...props }: ComboboxPrimitive.Separator.Props) {
  return (
    <ComboboxPrimitive.Separator
      data-slot="combobox-separator"
      className={cn('-mx-1 my-1 h-px bg-border', className)}
      {...props}
    />
  );
}

// ---------------------------------------------------------------------------
// Field  (label + combobox + description + error convenience wrapper)
// ---------------------------------------------------------------------------

type ComboboxFieldProps = {
  label: string;
  description?: string;
  error?: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
};

function ComboboxField({ label, description, error, required, className, children }: ComboboxFieldProps) {
  return (
    <FieldPrimitive.Root
      data-slot="combobox-field"
      invalid={Boolean(error)}
      className={cn('flex flex-col gap-1.5', className)}
    >
      <FieldPrimitive.Label className="text-sm font-medium leading-none text-foreground">
        {label}
        {required && (
          <span className="ml-1 text-destructive" aria-hidden="true">
            *
          </span>
        )}
      </FieldPrimitive.Label>

      {children}

      {description && !error && (
        <FieldPrimitive.Description className="text-xs text-muted-foreground">
          {description}
        </FieldPrimitive.Description>
      )}

      {error && (
        <FieldPrimitive.Error className="text-xs text-destructive">{error}</FieldPrimitive.Error>
      )}
    </FieldPrimitive.Root>
  );
}

// ---------------------------------------------------------------------------
// Compound component assignment
// ---------------------------------------------------------------------------

Combobox.Label = ComboboxLabel;
Combobox.InputGroup = ComboboxInputGroup;
Combobox.Input = ComboboxInput;
Combobox.Trigger = ComboboxTrigger;
Combobox.Clear = ComboboxClear;
Combobox.Chips = ComboboxChips;
Combobox.Chip = ComboboxChip;
Combobox.ChipRemove = ComboboxChipRemove;
Combobox.Content = ComboboxContent;
Combobox.List = ComboboxList;
Combobox.Empty = ComboboxEmpty;
Combobox.Status = ComboboxStatus;
Combobox.Item = ComboboxItem;
Combobox.Group = ComboboxGroup;
Combobox.GroupLabel = ComboboxGroupLabel;
Combobox.Separator = ComboboxSeparator;
Combobox.Field = ComboboxField;

// Expose filtering hooks on the Combobox namespace so callers can do:
// Combobox.useFilter(...) or Combobox.useFilteredItems(...)
Combobox.useFilter = ComboboxPrimitive.useFilter;
Combobox.useFilteredItems = ComboboxPrimitive.useFilteredItems;

// ---------------------------------------------------------------------------
// Named exports  (for tree-shaking and direct imports)
// ---------------------------------------------------------------------------

export {
  Combobox,
  ComboboxLabel,
  ComboboxInputGroup,
  ComboboxInput,
  ComboboxTrigger,
  ComboboxClear,
  ComboboxChips,
  ComboboxChip,
  ComboboxChipRemove,
  ComboboxContent,
  ComboboxList,
  ComboboxEmpty,
  ComboboxStatus,
  ComboboxItem,
  ComboboxGroup,
  ComboboxGroupLabel,
  ComboboxSeparator,
  ComboboxField,
};
