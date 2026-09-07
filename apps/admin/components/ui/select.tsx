'use client';

/**
 * Select — production-grade single-value select component.
 *
 * Architecture:
 *   Select                     – root state provider (controlled/uncontrolled)
 *   Select.Trigger             – the visible button that opens the popup
 *   Select.Value               – renders the current selected label inside the trigger
 *   Select.Content             – portal + positioner + popup + scroll arrows combined
 *   Select.Item                – a selectable option
 *   Select.ItemIndicator       – ✓ mark rendered inside an item when selected
 *   Select.Group               – groups related items with a label
 *   Select.GroupLabel          – the group heading (not selectable)
 *   Select.Separator           – visual divider between groups or items
 *   Select.Field               – convenience wrapper: label + select + description + error
 *
 * Behaviour:
 *   - Controlled:    <Select value={v} onValueChange={set} />
 *   - Uncontrolled:  <Select defaultValue="bd" />
 *   - Open state:    <Select open={open} onOpenChange={setOpen} />
 *   - Keyboard:      ↑↓ Home End Enter Space Escape — all handled by base-ui primitive
 *   - Typeahead:     character-based navigation — handled by base-ui primitive
 *   - Form:          name prop writes a hidden <input> for native form submission
 *   - Portal:        popup always rendered in a portal; immune to overflow:hidden clipping
 *   - Positioning:   base-ui Positioner handles flip, collision, scroll-container awareness
 *   - Accessibility: correct listbox/option ARIA pattern (not menu/menuitem)
 *   - Animation:     respects prefers-reduced-motion via Tailwind motion-safe utilities
 *   - Sizes:         sm | md (default) | lg
 *   - Status:        default | error | warning | success (for form validation contexts)
 */

import * as React from 'react';
import { Select as SelectPrimitive } from '@base-ui/react/select';
import { Field as FieldPrimitive } from '@base-ui/react/field';
import { cva, type VariantProps } from 'class-variance-authority';
import { CheckIcon, ChevronDownIcon, ChevronUpIcon, Loader2Icon } from 'lucide-react';

import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Variants
// ---------------------------------------------------------------------------

const triggerVariants = cva(
  [
    'flex w-full items-center justify-between gap-2 rounded-lg border bg-transparent',
    'text-sm whitespace-nowrap select-none',
    // smooth colour + shadow transitions
    'transition-[colors,box-shadow] duration-150',
    // focus ring
    'outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50',
    // subtle press
    'active:brightness-[0.97]',
    // disabled
    'disabled:cursor-not-allowed disabled:opacity-50',
    // placeholder colour
    'data-placeholder:text-muted-foreground',
    // svg sizing
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  ],
  {
    variants: {
      size: {
        sm: 'h-7 px-2 text-xs rounded-[min(var(--radius-md),10px)]',
        md: 'h-9 px-3',
        lg: 'h-10 px-3 text-base',
      },
      status: {
        default: 'border-input hover:border-input/80 dark:bg-input/30 dark:hover:bg-input/50',
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
// Types
// ---------------------------------------------------------------------------

type SelectSize = 'sm' | 'md' | 'lg';
type SelectStatus = 'default' | 'error' | 'warning' | 'success';

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

type SelectContextValue = {
  size: SelectSize;
  status: SelectStatus;
};

const SelectContext = React.createContext<SelectContextValue>({ size: 'md', status: 'default' });

function useSelectContext() {
  return React.useContext(SelectContext);
}

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

type SelectRootProps = SelectPrimitive.Root.Props<string> & {
  size?: SelectSize;
  status?: SelectStatus;
};

function Select({ size = 'md', status = 'default', children, ...props }: SelectRootProps) {
  return (
    <SelectContext.Provider value={{ size, status }}>
      <SelectPrimitive.Root data-slot="select" {...props}>
        {children}
      </SelectPrimitive.Root>
    </SelectContext.Provider>
  );
}

// SelectValue is exported for call-sites that compose the trigger manually.
function SelectValue({ className, ...props }: SelectPrimitive.Value.Props) {
  return (
    <SelectPrimitive.Value
      data-slot="select-value"
      className={cn('flex min-w-0 flex-1 items-center gap-2 truncate text-left', className)}
      {...props}
    />
  );
}


type SelectTriggerProps = SelectPrimitive.Trigger.Props &
  VariantProps<typeof triggerVariants> & {
    /** Show a spinner instead of the chevron — useful when options are loading */
    loading?: boolean;
  };

function SelectTrigger({
  className,
  size,
  status,
  loading = false,
  children,
  ...props
}: SelectTriggerProps) {
  const ctx = useSelectContext();
  const resolvedSize = size ?? ctx.size;
  const resolvedStatus = status ?? ctx.status;

  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      // group lets children respond to aria-expanded state on the trigger
      className={cn(triggerVariants({ size: resolvedSize, status: resolvedStatus }), 'group', className)}
      {...props}
    >
      <SelectPrimitive.Value
        data-slot="select-value"
        className="flex min-w-0 flex-1 items-center gap-2 truncate text-left"
      />
      {children}
      <SelectPrimitive.Icon render={<span className="flex shrink-0 items-center" />}>
        {loading ? (
          <Loader2Icon className="size-4 animate-spin text-muted-foreground" aria-hidden="true" />
        ) : (
          // rotate-180 when aria-expanded=true (popup is open)
          <ChevronDownIcon
            className="size-4 text-muted-foreground transition-transform duration-200 ease-in-out group-aria-expanded:rotate-180"
            aria-hidden="true"
          />
        )}
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
}

// ---------------------------------------------------------------------------
// Content  (portal + positioner + popup + scroll arrows bundled)
// ---------------------------------------------------------------------------

type SelectContentProps = SelectPrimitive.Popup.Props &
  Pick<SelectPrimitive.Positioner.Props, 'align' | 'alignOffset' | 'side' | 'sideOffset'> & {
    alignItemWithTrigger?: boolean;
  };

function SelectContent({
  className,
  children,
  side = 'bottom',
  sideOffset = 4,
  align = 'start',
  alignOffset = 0,
  alignItemWithTrigger = true,
  ...props
}: SelectContentProps) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Positioner
        side={side}
        sideOffset={sideOffset}
        align={align}
        alignOffset={alignOffset}
        alignItemWithTrigger={alignItemWithTrigger}
        className="isolate z-50"
      >
        <SelectPrimitive.Popup
          data-slot="select-content"
          className={cn(
            // layout
            'relative z-50 min-w-[var(--anchor-width)] max-h-[var(--available-height)]',
            'overflow-x-hidden overflow-y-auto rounded-lg',
            // colours
            'bg-popover text-popover-foreground shadow-xl ring-1 ring-foreground/10',
            // transform origin driven by base-ui --transform-origin custom property
            'origin-[var(--transform-origin)]',
            'data-[align-trigger=true]:animate-none',
            // open — zoom from 98% (very subtle scale) + gentle slide + fade
            'motion-safe:data-open:animate-in motion-safe:data-open:fade-in-0',
            'motion-safe:data-open:zoom-in-[98%]',
            'motion-safe:data-open:data-[side=bottom]:slide-in-from-top-1.5',
            'motion-safe:data-open:data-[side=top]:slide-in-from-bottom-1.5',
            'motion-safe:data-open:data-[side=left]:slide-in-from-right-1.5',
            'motion-safe:data-open:data-[side=right]:slide-in-from-left-1.5',
            // close — snappier exit
            'motion-safe:data-closed:animate-out motion-safe:data-closed:fade-out-0',
            'motion-safe:data-closed:zoom-out-[98%]',
            // timing: open feels deliberate, close feels snappy
            'data-open:duration-200 data-closed:duration-100',
            className,
          )}
          data-align-trigger={alignItemWithTrigger}
          {...props}
        >
          <SelectScrollUpButton />
          <SelectPrimitive.List className="p-1">{children}</SelectPrimitive.List>
          <SelectScrollDownButton />
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  );
}

// ---------------------------------------------------------------------------
// Item
// ---------------------------------------------------------------------------

type SelectItemProps = SelectPrimitive.Item.Props & {
  /** Optional icon rendered to the left of the label */
  icon?: React.ReactNode;
  /** Secondary line shown below the label */
  description?: string;
};

function SelectItem({ className, children, icon, description, ...props }: SelectItemProps) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        // layout
        'relative flex w-full cursor-default items-start gap-2 rounded-md py-1.5 pr-8 pl-2',
        'text-sm outline-hidden select-none',
        // smooth hover — transition covers bg + text
        'transition-colors duration-100',
        'focus:bg-accent focus:text-accent-foreground',
        // disabled
        'data-disabled:pointer-events-none data-disabled:opacity-40',
        // svg
        "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    >
      {icon && (
        <span className="mt-0.5 flex shrink-0 items-center text-muted-foreground">{icon}</span>
      )}
      <span className="flex min-w-0 flex-1 flex-col">
        <SelectPrimitive.ItemText className="truncate">{children}</SelectPrimitive.ItemText>
        {description && (
          <span className="mt-0.5 truncate text-xs text-muted-foreground">{description}</span>
        )}
      </span>
      {/* Checkmark animates in with a scale+fade when the item is selected */}
      <SelectPrimitive.ItemIndicator
        render={
          <span className="absolute right-2 top-1.5 flex size-4 items-center justify-center" />
        }
      >
        <CheckIcon
          className="size-4 motion-safe:animate-in motion-safe:zoom-in-50 motion-safe:fade-in-0 motion-safe:duration-150"
          aria-hidden="true"
        />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  );
}

// ---------------------------------------------------------------------------
// Group + GroupLabel
// ---------------------------------------------------------------------------

function SelectGroup({ className, ...props }: SelectPrimitive.Group.Props) {
  return (
    <SelectPrimitive.Group
      data-slot="select-group"
      className={cn('scroll-my-1 py-1', className)}
      {...props}
    />
  );
}

function SelectGroupLabel({ className, ...props }: SelectPrimitive.GroupLabel.Props) {
  return (
    <SelectPrimitive.GroupLabel
      data-slot="select-group-label"
      className={cn('px-2 py-1 text-xs font-medium text-muted-foreground', className)}
      {...props}
    />
  );
}

// ---------------------------------------------------------------------------
// Separator
// ---------------------------------------------------------------------------

function SelectSeparator({ className, ...props }: SelectPrimitive.Separator.Props) {
  return (
    <SelectPrimitive.Separator
      data-slot="select-separator"
      className={cn('-mx-1 my-1 h-px bg-border', className)}
      {...props}
    />
  );
}

// ---------------------------------------------------------------------------
// Scroll arrows
// ---------------------------------------------------------------------------

function SelectScrollUpButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollUpArrow>) {
  return (
    <SelectPrimitive.ScrollUpArrow
      data-slot="select-scroll-up"
      className={cn(
        "sticky top-0 z-10 flex w-full cursor-default items-center justify-center bg-popover py-1 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    >
      <ChevronUpIcon aria-hidden="true" />
    </SelectPrimitive.ScrollUpArrow>
  );
}

function SelectScrollDownButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollDownArrow>) {
  return (
    <SelectPrimitive.ScrollDownArrow
      data-slot="select-scroll-down"
      className={cn(
        "sticky bottom-0 z-10 flex w-full cursor-default items-center justify-center bg-popover py-1 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    >
      <ChevronDownIcon aria-hidden="true" />
    </SelectPrimitive.ScrollDownArrow>
  );
}

// ---------------------------------------------------------------------------
// Field  (label + select + description + error convenience wrapper)
// ---------------------------------------------------------------------------

type SelectFieldProps = {
  /** The field label text */
  label: string;
  /** Field-level description shown below the select */
  description?: string;
  /** Validation error message — also applies the error status to the trigger */
  error?: string;
  /** Whether the field is required */
  required?: boolean;
  className?: string;
  children: React.ReactNode;
};

function SelectField({
  label,
  description,
  error,
  required,
  className,
  children,
}: SelectFieldProps) {
  return (
    <FieldPrimitive.Root
      data-slot="select-field"
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
// Empty state helper (for when there are no options)
// ---------------------------------------------------------------------------

function SelectEmpty({ className, children }: { className?: string; children?: React.ReactNode }) {
  return (
    <div
      data-slot="select-empty"
      className={cn('px-4 py-6 text-center text-sm text-muted-foreground', className)}
    >
      {children ?? 'No options available.'}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

Select.Trigger = SelectTrigger;
Select.Value = SelectValue;
Select.Content = SelectContent;
Select.Item = SelectItem;
Select.Group = SelectGroup;
Select.GroupLabel = SelectGroupLabel;
Select.Separator = SelectSeparator;
Select.Field = SelectField;
Select.Empty = SelectEmpty;

export {
  Select,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectGroup,
  SelectGroupLabel,
  SelectSeparator,
  SelectField,
  SelectEmpty,
  SelectScrollUpButton,
  SelectScrollDownButton,
};
