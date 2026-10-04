<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Maevelle Admin UI & Design System Architecture

This sub-package (`apps/admin`) uses a standardized visual system built natively on **Tailwind CSS v4** and **shadcn/Base UI component primitives**.

For complete specifications, see [`docs/admin-design-system.md`](../../docs/admin-design-system.md).

## Critical UI Rules for All Tasks in `apps/admin`:

1. **Semantic Color Tokens Only:**
   - Canvas: `bg-background` (`#f8fafc` light, `#090d16` dark).
   - Surfaces: `bg-card` (`#ffffff` light, `#111827` dark).
   - Borders: `border-border` (`#e2e8f0` light, `#1e293b` dark).
   - Brand Primary: `bg-primary` (Maevelle Electric Teal `#0d9488` light, `#14b8a6` dark) with `hover:bg-primary-hover` and `bg-primary-subtle`.
   - Business Statuses: Use dedicated semantic scales — `bg-success` (`#16a34a`), `bg-warning` (`#d97706`), `bg-destructive` (`#dc2626`), `bg-info` (`#2563eb`). Never use brand teal for arbitrary status indicators.

2. **Zero-Tolerance Quality Gates:**
   - **No `transition: all`:** Always specify explicit transition properties (e.g. `transition-colors`, `transition-opacity`, 120–150ms).
   - **No `!important`:** Do not use `!important` in CSS classes or global styles.
   - **No page-specific CSS in `globals.css`:** Never add workspace or page classes to `globals.css`. Express layout and styles using Tailwind in React components.
   - **No ancestor styling hacks:** Primitives must own their styling. Do not write `.admin-content button` or `.shell table`.
   - **No recursive font variables:** Inter Variable is loaded in `app/layout.tsx` with `--font-inter` mapped to `--font-sans`. Never declare `--font-sans: var(--font-sans)`.

3. **Authoritative Primitives:**
   - **Buttons:** `<Button>` from `@/components/ui/button` (`default`, `secondary`, `outline`, `ghost`, `destructive`, `glass`).
   - **Form Fields:** `<Input>`, `<NativeSelect>`, `<Textarea>` from `@/components/ui/` (`h-9`, `bg-card`, `border-border`).
   - **Data Tables:** `<Table density="compact" | "comfortable">` from `@/components/ui/table`.
   - **Numeric Displays:** All currency (`৳`), order IDs, quantities, SKUs, and dates must use `tabular-nums font-mono`.
   - **Status Badges:** `<StatusBadge>` from `@/components/status-badge`.
   - **Page Scaffolding:** Always compose new screens using primitives from `@/components/ui/page-shell` (`AdminPage`, `PageHeader`, `PageTitle`, `PageDescription`, `PageActions`, `PageSection`, `PagePanel`, `EmptyState`).

4. **Elevation & Glass Rules:**
   - Level 1 Flat: `border border-border bg-card` (standard for 90% of surfaces).
   - Level 2 Raised: `shadow-2xs border border-border` (for KPI metric cards).
   - Level 3 Floating: `shadow-md` / `shadow-lg` (for dialogs, command palette).
   - Liquid Glass (`backdrop-blur-md`): Allowed only on sticky topbars, modal backdrops, and floating sheets. Never use on tables or scrollable lists.

5. **Visual Showcase:**
   - Inspect live tokens and component states at `/admin/design-system`.

