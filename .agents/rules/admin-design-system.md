# Maevelle Admin Design System & Visual Architecture Rule

This rule applies to all tasks modifying, refactoring, or building frontend surfaces in `apps/admin`.

## 1. Core Architecture Principles
- **Tailwind-First & Primitives:** All styling must be expressed through Tailwind CSS utility classes, CVA variants, and semantic design tokens. Do NOT write custom vanilla CSS rules or create parallel styling systems.
- **Authoritative Primitives:** Always reuse existing components from `@/components/ui/` (`Button`, `Input`, `NativeSelect`, `Textarea`, `Table`, `Badge`, `page-shell`) and `@/components/status-badge`.
- **Clean `globals.css`:** Never add page-level, workspace-level, or module-specific classes to `apps/admin/app/globals.css`. It is strictly reserved for core Tailwind imports, theme tokens, and minimal base resets.

## 2. Zero-Tolerance Quality Standards
1. **Never use `transition: all` or `transition-all`:** Always use explicit transition properties (e.g. `transition-colors duration-150`, `transition-opacity`).
2. **Never use routine `!important`:** Specificity wars are prohibited. Component variants and composition solve visual hierarchy.
3. **Never use ancestor styling hacks:** Do not style elements through selectors like `.admin-content button` or `.shell table`. Primitives must own their styling.
4. **Never declare recursive font variables:** Use `--font-inter` loaded via `next/font/google`. Never declare `--font-sans: var(--font-sans)`.

## 3. Semantic Token System
- **Canvas & Surfaces:** `bg-background` (`#f8fafc` light / `#090d16` dark), `bg-card` (`#ffffff` light / `#111827` dark), `border-border` (`#e2e8f0` light / `#1e293b` dark).
- **Brand Primary:** `bg-primary` (Maevelle Electric Teal `#0d9488` light / `#14b8a6` dark) with `hover:bg-primary-hover` (`#0f766e` light / `#2dd4bf` dark) and `bg-primary-subtle`.
- **Status Families (Strictly separated from brand):**
  - Success: `bg-success` (`#16a34a`) / `bg-success-subtle`
  - Warning: `bg-warning` (`#d97706`) / `bg-warning-subtle`
  - Destructive: `bg-destructive` (`#dc2626`) / `bg-destructive-subtle`
  - Info: `bg-info` (`#2563eb`) / `bg-info-subtle`
- **Numbers & Currencies:** Always apply `tabular-nums font-mono` to BDT amounts (`৳`), SKUs, quantities, order IDs, timestamps, and inventory figures.

## 4. Elevation & Restrained Glass
- **Flat (Level 1):** `border border-border bg-card` (standard for 90% of surfaces: tables, forms, panels).
- **Raised (Level 2):** `shadow-2xs border border-border` (for KPI metric cards and active rows).
- **Floating (Level 3):** `shadow-md` / `shadow-lg` (for dialogs, command palettes, and popovers).
- **Liquid Glass:** Allowed ONLY on sticky chrome (`bg-background/85 backdrop-blur-md border-b border-border/80`) and floating modal backdrops. Never put backdrop filters on tables or scrolling lists.

## 5. Page Construction Blueprint
Always compose admin screens from `@/components/ui/page-shell`:
```tsx
import {
  AdminPage,
  PageHeader,
  PageTitle,
  PageDescription,
  PageActions,
  PageSection,
  PagePanel,
  EmptyState,
} from '@/components/ui/page-shell';
```

## 6. Live Reference Route
Verify tokens, interactive states, and light/dark theme contrast at:
`/admin/design-system`
