# Maevelle Admin Design System & Styling Architecture

This document is the authoritative design system and styling reference for the Maevelle Bangladesh Admin Portal (`apps/admin`).

Every developer and AI agent working on the Admin Portal must follow the conventions, semantic token roles, and component primitives documented here.

---

## 1. Visual Philosophy & Character

Maevelle Admin is a **high-volume operational business platform** used for processing physical inventory, customer orders, multi-currency ledger entries, courier logistics, and catalog management.

### Key Tenets
1. **Operational Calm:** Long work sessions require low cognitive fatigue. Large surfaces use crisp border relationships and quiet white or deep midnight slate surfaces. Bright colors and gradients are avoided as background fills.
2. **High Information Density with Visual Breathing Room:** Tables and forms are compact and structured. Density is achieved through comfortable 36px control heights and standardized 13–14px typography, never by cramping elements or shrinking fonts below 12px.
3. **Intentional Brand Presence:** The signature **Maevelle Electric Teal** (`#0d9488`) acts as an authoritative primary action and active navigation indicator. It is never painted indiscriminately across unrelated cards, background banners, or icons.
4. **Predictable Interaction States:** UI elements never translate or shift position on simple hover. Transitions are explicit (e.g. `transition-colors duration-150`), never `transition: all`.
5. **No AI Dashboard Tropes:** Avoid giant rounded cards, saturated multi-colored stat boxes, random drop shadows, and decorative floating glass.

---

## 2. Semantic Token System

All component styling must consume semantic CSS variables rather than hard-coded hex codes or ad-hoc Tailwind colors.

### Canvas & Surface Tokens
| CSS Token | Tailwind Class | Light Mode | Dark Mode (`.dark`) | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| `--background` | `bg-background` | `#f8fafc` (Slate 50) | `#090d16` (Midnight Slate) | Main page canvas |
| `--foreground` | `text-foreground` | `#0f172a` (Slate 900) | `#f8fafc` (Slate 50) | Primary text and headings |
| `--card` | `bg-card` | `#ffffff` (Pure White) | `#111827` (Slate 900) | Panels, cards, worklist containers |
| `--card-foreground` | `text-card-foreground`| `#0f172a` | `#f8fafc` | Text inside card panels |
| `--popover` | `bg-popover` | `#ffffff` | `#111827` | Menus, popovers, tooltips |
| `--secondary` | `bg-secondary` | `#f1f5f9` (Slate 100) | `#1e293b` (Slate 800) | Secondary buttons, filter bars |
| `--secondary-foreground` | `text-secondary-foreground` | `#1e293b` | `#f1f5f9` | Text on secondary buttons |
| `--muted` | `bg-muted` | `#f1f5f9` | `#1e293b` | Subtle table headers, disabled areas |
| `--muted-foreground` | `text-muted-foreground` | `#64748b` (Slate 500) | `#94a3b8` (Slate 400) | Subtitles, helper text, timestamps |
| `--border` | `border-border` | `#e2e8f0` (Slate 200) | `#1e293b` (Slate 800) | Card borders, dividers, table rows |
| `--border-subtle` | `border-border-subtle`| `#f1f5f9` | `#172033` | Subtle inner dividers |
| `--border-strong` | `border-border-strong`| `#cbd5e1` (Slate 300) | `#334155` (Slate 700) | Highlighted active borders |
| `--input` | `border-input` | `#e2e8f0` | `#1e293b` | Form field outline |
| `--ring` | `ring-ring` | `#0d9488` | `#14b8a6` | Keyboard focus ring |

### Primary Brand Tokens (Maevelle Electric Teal)
| CSS Token | Tailwind Class | Light Mode | Dark Mode (`.dark`) | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| `--primary` | `bg-primary` | `#0d9488` (Teal 600) | `#14b8a6` (Teal 500) | Primary button, active nav icon |
| `--primary-foreground` | `text-primary-foreground` | `#ffffff` | `#042f2e` | Text on primary button |
| `--primary-hover` | `hover:bg-primary-hover` | `#0f766e` (Teal 700) | `#2dd4bf` (Teal 400) | Hover state |
| `--primary-active` | `active:bg-primary-active` | `#115e59` (Teal 800) | `#0d9488` (Teal 600) | Pressed / active state |
| `--primary-subtle` | `bg-primary-subtle` | `#f0fdfa` (Teal 50) | `rgba(20, 184, 166, 0.12)` | Pill backgrounds, active nav pill |

### Semantic Business Statuses
Status colors are strictly separated from the brand color. Never use `--primary` for a status indicator unless it represents brand telemetry:
- **Success (`--color-success: #16a34a`)**: Active records, paid invoices, dispatched packages, verified 2FA. Subtle bg: `--color-success-subtle` (`#f0fdf4` light, `rgba(74, 222, 128, 0.15)` dark).
- **Warning (`--color-warning: #d97706`)**: Pending review, draft invoices, stock running low, action required. Subtle bg: `--color-warning-subtle` (`#fffbeb` light, `rgba(251, 191, 36, 0.15)` dark).
- **Destructive (`--color-destructive: #dc2626`)**: Payment failures, cancelled fulfillments, suspended access, irreversible deletions. Subtle bg: `--color-destructive-subtle` (`#fef2f2` light, `rgba(248, 113, 113, 0.15)` dark).
- **Info (`--color-info: #2563eb`)**: Telemetry logs, operational notices, queued jobs. Subtle bg: `--color-info-subtle` (`#eff6ff` light, `rgba(96, 165, 250, 0.15)` dark).

### Sidebar Tokens
- `--sidebar`: `#ffffff` (light), `#0e1526` (dark)
- `--sidebar-foreground`: `#475569` (light), `#94a3b8` (dark)
- `--sidebar-primary`: `#0d9488` (light), `#14b8a6` (dark)
- `--sidebar-accent`: `#f8fafc` (light), `#1e293b` (dark)
- `--sidebar-border`: `#e2e8f0` (light), `#1e293b` (dark)
- `--sidebar-ring`: `#0d9488` (light), `#14b8a6` (dark)

### Data Visualization Chart Tokens
- `--chart-1`: `#0d9488` (Primary trend line / metric volume)
- `--chart-2`: `#0284c7` (Secondary comparison set)
- `--chart-3`: `#6366f1` (Tertiary channel)
- `--chart-4`: `#f59e0b` (Forecasts / pipeline values)
- `--chart-5`: `#10b981` (Completed outcomes / gross growth)

---

## 3. Typography Architecture

### Inter Variable via `next/font`
- **Configuration:** Loaded in [apps/admin/app/layout.tsx](file:///d:/Projects%20FINAL/Web%20Development/Nextjs/Maevelle-Bangladesh/apps/admin/app/layout.tsx) via `next/font/google` with `variable: '--font-inter'`.
- **Non-Recursive Declaration:** Mapped in [globals.css](file:///d:/Projects%20FINAL/Web%20Development/Nextjs/Maevelle-Bangladesh/apps/admin/app/globals.css) via:
  ```css
  --font-sans: var(--font-inter), -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  ```
  *(Never declare `--font-sans: var(--font-sans)`).*
- **Tabular Numbers:** All monetary amounts (BDT `৳`), quantities, order IDs, SKUs, inventory counts, dates, and timestamps must include `tabular-nums font-mono`.

### Hierarchy Standards
| UI Element | Font Size | Line Height | Weight | Tailwind Classes |
| :--- | :--- | :--- | :--- | :--- |
| **Page Title** | 28px (`text-2xl sm:text-[28px]`) | 34px (`leading-tight`) | Bold (700) | `text-2xl font-bold tracking-tight text-foreground` |
| **Section Heading** | 20px (`text-xl`) | 28px (`leading-snug`) | SemiBold (600) | `text-xl font-semibold tracking-tight text-foreground` |
| **Panel / Card Heading**| 16px (`text-base`) | 24px | SemiBold (600) | `text-base font-semibold text-foreground` |
| **Body Text** | 14px (`text-sm`) | 21px (`leading-relaxed`)| Regular (400) | `text-sm text-foreground/90` |
| **Strong Body** | 14px (`text-sm`) | 21px | Medium (500)/600 | `text-sm font-medium text-foreground` |
| **Form Label** | 13px (`text-[13px]` / `text-xs`) | 18px | Medium (500) | `text-xs font-medium text-foreground block` |
| **Table Body** | 13px (`text-xs sm:text-sm`) | 20px | Regular (400) | `text-xs sm:text-sm text-foreground tabular-nums` |
| **Eyebrow / Category** | 12px (`text-xs`) | 16px | SemiBold (600) | `eyebrow` (`text-xs font-semibold uppercase tracking-wider text-muted-foreground`) |

---

## 4. Spacing, Radii, and Elevation

### 4px Rhythm Spacing
- `4px` (`gap-1`, `p-1`): Status dot gaps, micro pill padding.
- `8px` (`gap-2`, `p-2`): Related inline actions, compact table padding.
- `12px` (`gap-3`, `p-3`): Input group separation, card metadata rows.
- `16px` (`gap-4`, `p-4`): Card panel padding, mobile horizontal gutters.
- `20px–24px` (`gap-6`, `p-6`): Desktop card padding, main column grids.
- `32px` (`gap-8`, `mb-8`): Major section separations.

### Standardized Radii Scale
- `--radius-sm (0.375rem / 6px)`: Small badges, code snippets, micro buttons.
- `--radius-md (0.5rem / 8px)`: Standard form inputs, selects, buttons, dropdown items.
- `--radius-lg (0.75rem / 12px)`: Cards, panels, worklist containers, dialog modals.
- `--radius-xl (1rem / 16px)`: Large modal surfaces, floating command palette.
- `--radius-full (9999px)`: Status badges, user avatars, pill counters.

### Three-Tier Elevation Scale
1. **Level 1 — Flat (Content Surfaces):** Border-defined (`border border-border bg-card`), no prominent shadow. Used for 90% of admin surfaces (tables, forms, settings, order details).
2. **Level 2 — Raised (Interactive / KPI):** Subtle micro-shadow (`shadow-2xs border border-border`). Used for KPI metric cards, active hover cards, and selected worklist rows.
3. **Level 3 — Floating (Overlays & Dialogs):** Prominent elevation (`shadow-md` / `shadow-lg`). Used for command palettes, modal dialogs, and popovers.

### Restrained Liquid Glass Rules
- **Allowed:** Sticky application topbar (`bg-background/85 backdrop-blur-md border-b border-border/80`), command palette dialog, mobile off-canvas drawer scrim.
- **Prohibited:** Never apply `backdrop-filter` to tables, scrollable virtualized lists, form inputs, settings cards, or detail sheets. Opaque surfaces prevent GPU compositing lag and maintain 60fps scrolling.

---

## 5. Primitives & Developer Usage

### Button (`@/components/ui/button`)
Standardized on CVA with explicit transition properties and strict control heights:
```tsx
import { Button, buttonVariants } from '@/components/ui/button';

// Primary Action
<Button variant="default" size="default">Create Order</Button>

// Secondary Action
<Button variant="secondary" size="default">Cancel</Button>

// Outline Action
<Button variant="outline" size="sm">Export CSV</Button>

// Destructive Action
<Button variant="destructive" size="default">Void Invoice</Button>

// Icon Button
<Button variant="ghost" size="icon-sm" aria-label="Settings">
  <Settings className="size-4" />
</Button>

// Link styled as Button
<Link className={buttonVariants({ variant: 'outline', size: 'sm' })} href="/orders">
  View Orders
</Link>
```

### Form Controls (`@/components/ui/`)
All inputs share `h-9` (36px), `bg-card`, and `border border-border`:
```tsx
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';

// Standard Text Input
<Input placeholder="Enter SKU…" />

// Native Select
<NativeSelect defaultValue="ACTIVE">
  <option value="ACTIVE">Active</option>
  <option value="DRAFT">Draft</option>
</NativeSelect>

// Textarea
<Textarea placeholder="Fulfillment packaging notes…" rows={3} />
```

### StatusBadge (`@/components/status-badge`)
Maps raw domain status strings to consistent semantic pills with status dots:
```tsx
import { StatusBadge } from '@/components/status-badge';

<StatusBadge status="PAID" />        // Success (Green)
<StatusBadge status="PENDING" />     // Warning (Amber)
<StatusBadge status="FAILED" />      // Destructive (Red)
<StatusBadge status="DISPATCHED" />  // Info (Blue)
```

### Data Table (`@/components/ui/table`)
Supports `compact` and `comfortable` density modes:
```tsx
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

<Table density="compact">
  <TableHeader>
    <TableRow>
      <TableHead>Order #</TableHead>
      <TableHead className="text-right">Total (BDT)</TableHead>
      <TableHead>Status</TableHead>
    </TableRow>
  </TableHeader>
  <TableBody>
    <TableRow>
      <TableCell className="font-mono font-medium">ORD-2026-9041</TableCell>
      <TableCell className="text-right tabular-nums">৳ 12,450.00</TableCell>
      <TableCell><StatusBadge status="PAID" /></TableCell>
    </TableRow>
  </TableBody>
</Table>
```

---

## 6. Blueprint for Building a New Admin Page

When creating any new page or workspace in `apps/admin/app/`, compose it using the structural primitives from `@/components/ui/page-shell`:

```tsx
'use client';

import { Plus, Download } from 'lucide-react';
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
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StatusBadge } from '@/components/status-badge';

export default function MyOperationalPage() {
  const items = []; // Fetch from API or Server Component

  return (
    <AdminPage>
      {/* 1. Page Header */}
      <PageHeader>
        <div>
          <p className="eyebrow">Operations / Warehouse</p>
          <PageTitle>Packing Station Worklist</PageTitle>
          <PageDescription>
            Orders ready for physical packaging and courier label generation.
          </PageDescription>
        </div>
        <PageActions>
          <Button variant="outline" size="sm" className="gap-1.5">
            <Download className="size-4" /> Export
          </Button>
          <Button size="sm" className="gap-1.5">
            <Plus className="size-4" /> New Batch
          </Button>
        </PageActions>
      </PageHeader>

      {/* 2. Main Section */}
      <PageSection title="Pending Dispatches">
        {items.length === 0 ? (
          <EmptyState
            title="No orders ready for packing"
            description="When picklists are completed, orders will appear here automatically."
            action={<Button variant="outline">Refresh Queue</Button>}
          />
        ) : (
          <PagePanel className="overflow-hidden">
            <Table density="compact">
              <TableHeader>
                <TableRow>
                  <TableHead>Fulfillment #</TableHead>
                  <TableHead>Warehouse</TableHead>
                  <TableHead className="text-right">Lines</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {/* Table rows */}
              </TableBody>
            </Table>
          </PagePanel>
        )}
      </PageSection>
    </AdminPage>
  );
}
```

---

## 7. Rules for `globals.css`

### What Belongs in `globals.css`
1. Framework imports (`@import 'tailwindcss';`, `@import 'shadcn/tailwind.css';`).
2. Authoritative `:root` design tokens.
3. Authoritative `.dark` perceptual equivalent tokens.
4. `@theme inline` mappings to expose tokens to Tailwind utility classes.
5. Base reset and font normalization (`border-color: var(--border)`, font feature settings).
6. Accessibility overrides (`@media (prefers-reduced-motion: reduce)`).
7. Minimal shared utilities (`@utility eyebrow`, `@utility numeric`, `@utility glass`).

### What is Strictly Prohibited in `globals.css`
- **Never add page-specific CSS:** Do not add classes like `.orders-table`, `.product-editor-grid`, `.finance-card` to `globals.css`. Express layout and styles using Tailwind utilities directly in the component.
- **Never use ancestor styling hacks:** Do not write `.admin-content button` or `.shell table`. Primitives must own their styles.
- **Never add routine `!important`:** Specificity conflicts indicate improper architecture. Fix the component class list or CVA variants instead.
- **Never hardcode hex values in CSS rules:** All colors must reference theme variables.

---

## 8. Interactive Design System Lab

A development showcase route is available at:
```
http://localhost:3000/admin/design-system
```
Use this route during development to inspect:
- Semantic color tokens in both Light and Dark mode.
- Typographic hierarchy with live font rendering and tabular numbers.
- Button variants, sizes, and interactive loading/disabled states.
- Form controls and validation styling.
- Data table density and alignment.
- Surface elevation tiers and liquid glass transparency.
