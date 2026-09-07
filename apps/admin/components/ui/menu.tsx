'use client';

/**
 * Menu — production-grade action menu component.
 *
 * Architecture:
 *   Menu                     – root state provider
 *   Menu.Trigger             – button that opens the menu
 *   Menu.Content             – portal + positioner + popup combined
 *   Menu.Item                – clickable action
 *   Menu.CheckboxItem        – checkable item (toggle)
 *   Menu.RadioGroup          – exclusive-choice group
 *   Menu.RadioItem           – radio item within a RadioGroup
 *   Menu.Group               – semantic grouping wrapper
 *   Menu.GroupLabel          – group heading (not interactive)
 *   Menu.Separator           – visual divider
 *   Menu.Sub                 – submenu root (Menu.SubmenuRoot)
 *   Menu.SubTrigger          – item that opens a submenu
 *   Menu.SubContent          – the submenu popup
 *
 * IMPORTANT: Distinct from Select.
 *   - Menu uses role=menu / role=menuitem ARIA semantics (actions)
 *   - Select uses role=listbox / role=option semantics (value selection)
 *   Never use a Menu where the user is choosing a persistent value.
 *
 * Behaviour:
 *   - Keyboard: ↑↓ Enter Esc — handled by base-ui primitive
 *   - Submenus: ArrowRight/Left — handled by base-ui primitive
 *   - Portal: immune to overflow:hidden clipping
 *   - Positioning: base-ui Positioner handles flip / collision / scroll-container awareness
 *   - Animation: respects prefers-reduced-motion
 *   - Variants: default | destructive per item
 */

import * as React from 'react';
import { Menu as MenuPrimitive } from '@base-ui/react/menu';
import { ChevronRightIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Shared popup classes (used by both Menu.Content and Menu.SubContent)
// ---------------------------------------------------------------------------

const POPUP_CLASSES = cn(
  // layout
  'relative z-50 min-w-40 overflow-hidden rounded-lg p-1',
  // colours
  'bg-popover text-popover-foreground shadow-lg ring-1 ring-foreground/10',
  // animation — origin driven by base-ui --transform-origin
  'origin-[var(--transform-origin)]',
  'motion-safe:data-open:animate-in motion-safe:data-open:fade-in-0 motion-safe:data-open:zoom-in-95',
  'motion-safe:data-open:data-[side=bottom]:slide-in-from-top-1',
  'motion-safe:data-open:data-[side=top]:slide-in-from-bottom-1',
  'motion-safe:data-open:data-[side=left]:slide-in-from-right-1',
  'motion-safe:data-open:data-[side=right]:slide-in-from-left-1',
  'motion-safe:data-closed:animate-out motion-safe:data-closed:fade-out-0 motion-safe:data-closed:zoom-out-95',
  'duration-100',
);

// Shared item classes
const ITEM_CLASSES = cn(
  'relative flex w-full cursor-default items-center gap-2 rounded-md px-2 py-1.5',
  'text-sm outline-hidden select-none',
  'focus:bg-accent focus:text-accent-foreground',
  'data-disabled:pointer-events-none data-disabled:opacity-40',
  "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
);

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

function Menu({ ...props }: MenuPrimitive.Root.Props) {
  return <MenuPrimitive.Root data-slot="menu" {...props} />;
}

// ---------------------------------------------------------------------------
// Trigger
// ---------------------------------------------------------------------------

function MenuTrigger({ className, ...props }: MenuPrimitive.Trigger.Props) {
  return <MenuPrimitive.Trigger data-slot="menu-trigger" className={cn(className)} {...props} />;
}

// ---------------------------------------------------------------------------
// Content  (portal + positioner + popup)
// ---------------------------------------------------------------------------

type MenuContentProps = MenuPrimitive.Popup.Props &
  Pick<MenuPrimitive.Positioner.Props, 'align' | 'alignOffset' | 'side' | 'sideOffset'>;

function MenuContent({
  className,
  children,
  side = 'bottom',
  sideOffset = 4,
  align = 'start',
  alignOffset = 0,
  ...props
}: MenuContentProps) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Positioner
        side={side}
        sideOffset={sideOffset}
        align={align}
        alignOffset={alignOffset}
        className="isolate z-50"
      >
        <MenuPrimitive.Popup
          data-slot="menu-content"
          className={cn(POPUP_CLASSES, className)}
          {...props}
        >
          {children}
        </MenuPrimitive.Popup>
      </MenuPrimitive.Positioner>
    </MenuPrimitive.Portal>
  );
}

// ---------------------------------------------------------------------------
// Item
// ---------------------------------------------------------------------------

type MenuItemProps = MenuPrimitive.Item.Props & {
  /** Left icon */
  icon?: React.ReactNode;
  /** Destructive variant — red colour */
  variant?: 'default' | 'destructive';
  /** Keyboard shortcut hint shown on the right */
  shortcut?: string;
};

function MenuItem({
  className,
  children,
  icon,
  variant = 'default',
  shortcut,
  ...props
}: MenuItemProps) {
  return (
    <MenuPrimitive.Item
      data-slot="menu-item"
      data-variant={variant}
      className={cn(
        ITEM_CLASSES,
        variant === 'destructive' &&
          'text-destructive focus:bg-destructive/10 focus:text-destructive',
        className,
      )}
      {...props}
    >
      {icon && <span className="flex shrink-0 items-center">{icon}</span>}
      <span className="flex min-w-0 flex-1">{children}</span>
      {shortcut && (
        <kbd className="ml-auto text-xs text-muted-foreground opacity-70">{shortcut}</kbd>
      )}
    </MenuPrimitive.Item>
  );
}

// ---------------------------------------------------------------------------
// CheckboxItem
// ---------------------------------------------------------------------------

function MenuCheckboxItem({
  className,
  children,
  ...props
}: MenuPrimitive.CheckboxItem.Props) {
  return (
    <MenuPrimitive.CheckboxItem
      data-slot="menu-checkbox-item"
      className={cn(ITEM_CLASSES, 'pr-8', className)}
      {...props}
    >
      <MenuPrimitive.CheckboxItemIndicator
        render={<span className="absolute right-2 flex size-4 items-center justify-center" />}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="m2.5 8.5 4 4 7-9" />
        </svg>
      </MenuPrimitive.CheckboxItemIndicator>
      {children}
    </MenuPrimitive.CheckboxItem>
  );
}

// ---------------------------------------------------------------------------
// RadioGroup + RadioItem
// ---------------------------------------------------------------------------

function MenuRadioGroup({ ...props }: MenuPrimitive.RadioGroup.Props) {
  return <MenuPrimitive.RadioGroup data-slot="menu-radio-group" {...props} />;
}

function MenuRadioItem({ className, children, ...props }: MenuPrimitive.RadioItem.Props) {
  return (
    <MenuPrimitive.RadioItem
      data-slot="menu-radio-item"
      className={cn(ITEM_CLASSES, 'pr-8', className)}
      {...props}
    >
      <MenuPrimitive.RadioItemIndicator
        render={<span className="absolute right-2 flex size-4 items-center justify-center" />}
      >
        <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" aria-hidden="true">
          <circle cx="4" cy="4" r="4" />
        </svg>
      </MenuPrimitive.RadioItemIndicator>
      {children}
    </MenuPrimitive.RadioItem>
  );
}

// ---------------------------------------------------------------------------
// Group + GroupLabel
// ---------------------------------------------------------------------------

function MenuGroup({ className, ...props }: MenuPrimitive.Group.Props) {
  return (
    <MenuPrimitive.Group
      data-slot="menu-group"
      className={cn('py-1 first:pt-0', className)}
      {...props}
    />
  );
}

function MenuGroupLabel({ className, ...props }: MenuPrimitive.GroupLabel.Props) {
  return (
    <MenuPrimitive.GroupLabel
      data-slot="menu-group-label"
      className={cn('px-2 py-1 text-xs font-medium text-muted-foreground', className)}
      {...props}
    />
  );
}

// ---------------------------------------------------------------------------
// Separator
// ---------------------------------------------------------------------------

function MenuSeparator({ className, ...props }: MenuPrimitive.Separator.Props) {
  return (
    <MenuPrimitive.Separator
      data-slot="menu-separator"
      className={cn('-mx-1 my-1 h-px bg-border', className)}
      {...props}
    />
  );
}

// ---------------------------------------------------------------------------
// Submenu
// ---------------------------------------------------------------------------

function MenuSub({ ...props }: MenuPrimitive.SubmenuRoot.Props) {
  return <MenuPrimitive.SubmenuRoot data-slot="menu-sub" {...props} />;
}

type MenuSubTriggerProps = MenuPrimitive.SubmenuTrigger.Props & {
  icon?: React.ReactNode;
};

function MenuSubTrigger({ className, children, icon, ...props }: MenuSubTriggerProps) {
  return (
    <MenuPrimitive.SubmenuTrigger
      data-slot="menu-sub-trigger"
      className={cn(
        ITEM_CLASSES,
        'data-popup-open:bg-accent data-popup-open:text-accent-foreground',
        className,
      )}
      {...props}
    >
      {icon && <span className="flex shrink-0 items-center">{icon}</span>}
      <span className="flex min-w-0 flex-1">{children}</span>
      <ChevronRightIcon
        className="ml-auto size-4 shrink-0 text-muted-foreground"
        aria-hidden="true"
      />
    </MenuPrimitive.SubmenuTrigger>
  );
}

function MenuSubContent({
  className,
  children,
  sideOffset = 4,
  ...props
}: MenuPrimitive.Popup.Props & Pick<MenuPrimitive.Positioner.Props, 'sideOffset'>) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Positioner side="right" sideOffset={sideOffset} className="isolate z-50">
        <MenuPrimitive.Popup
          data-slot="menu-sub-content"
          className={cn(POPUP_CLASSES, className)}
          {...props}
        >
          {children}
        </MenuPrimitive.Popup>
      </MenuPrimitive.Positioner>
    </MenuPrimitive.Portal>
  );
}

// ---------------------------------------------------------------------------
// Compound component assignment
// ---------------------------------------------------------------------------

Menu.Trigger = MenuTrigger;
Menu.Content = MenuContent;
Menu.Item = MenuItem;
Menu.CheckboxItem = MenuCheckboxItem;
Menu.RadioGroup = MenuRadioGroup;
Menu.RadioItem = MenuRadioItem;
Menu.Group = MenuGroup;
Menu.GroupLabel = MenuGroupLabel;
Menu.Separator = MenuSeparator;
Menu.Sub = MenuSub;
Menu.SubTrigger = MenuSubTrigger;
Menu.SubContent = MenuSubContent;

// ---------------------------------------------------------------------------
// Named exports
// ---------------------------------------------------------------------------

export {
  Menu,
  MenuTrigger,
  MenuContent,
  MenuItem,
  MenuCheckboxItem,
  MenuRadioGroup,
  MenuRadioItem,
  MenuGroup,
  MenuGroupLabel,
  MenuSeparator,
  MenuSub,
  MenuSubTrigger,
  MenuSubContent,
};
