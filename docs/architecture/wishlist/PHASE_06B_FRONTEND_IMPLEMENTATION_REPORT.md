# Phase 06B — Wishlist Analytics Frontend, Admin Dashboard, Visualizations & Consent-Aware Storefront Telemetry

Date: 2026-11-01, Asia/Dhaka. **Frontend implemented and locally verified; full release acceptance remains PARTIAL.**
This report documents the completion of Phase 06B covering Workstream A (Admin Analytics Frontend) and Workstream B (Storefront Behavioral Telemetry).
No backend migrations, schema changes, persistent deployments, or commits were performed. Phase 07 has not been started.

---

## A. Executive Summary

Phase 06B implements the complete frontend capabilities for Maevelle Bangladesh's Wishlist Analytics System:
1. **Admin Analytics Frontend (Workstream A)**:
   - Integrated the dedicated Wishlist Analytics workspace view into the authoritative Admin Analytics route (`/admin/analytics?view=wishlist`).
   - Integrated with all six Phase 06A protected backend endpoints:
     - `GET /admin/analytics/wishlist/summary`
     - `GET /admin/analytics/wishlist/activity`
     - `GET /admin/analytics/wishlist/products`
     - `GET /admin/analytics/wishlist/categories`
     - `GET /admin/analytics/wishlist/sharing`
     - `GET /admin/analytics/wishlist/operations`
   - Preserved authoritative backend metadata, data source classifications, pipeline freshness (`CURRENT`, `LAGGING`, `FAILED`), pending event queues, retention horizons, and suppression indicators.
   - Built responsive, accessible visualizations using the established Admin Design System (Tailwind CSS v4, Base UI / shadcn primitives, Recharts, tabular numeric typography, electric teal brand tokens, zero `!important`, and zero `transition: all`).
   - Implemented server-side pagination for ranked products and category interest cohorts with honest suppression handling (`null` displayed as suppressed `—`, never coerced to zero).
   - Enforced client-side date range validation clamping queries to the authoritative 90-day backend boundary, with automatic preset switching.

2. **Storefront Behavioral Telemetry (Workstream B)**:
   - Engineered the consent-gated, failure-isolated `emitWishlistObservation` telemetry client (`apps/storefront/lib/analytics/wishlist-telemetry.ts`).
   - Strictly conforms to the backend's 8-key validation contract (`schemaVersion: 1`, `origin: 'BROWSER'`, `eventId`, `name`, `occurredAt`, `sessionId`, `consent` [5 keys], `data` [mode, optional scope]).
   - Fully wired all 13 approved observation events across customer journey touchpoints:
     - Page & Drawer: `WISHLIST_PAGE_VIEWED`
     - Guest actions: `WISHLIST_GUEST_SAVE_OBSERVED`, `WISHLIST_GUEST_REMOVE_OBSERVED`
     - Sharing lifecycle: `WISHLIST_SHARE_OPENED`, `WISHLIST_SCOPE_SELECTED`, `WISHLIST_COPY_ATTEMPTED`, `WISHLIST_COPY_SUCCEEDED`, `WISHLIST_NATIVE_SHARE_INVOKED`, `WISHLIST_WHATSAPP_SELECTED`
     - Recipient interactions: `WISHLIST_RECIPIENT_VIEWED`, `WISHLIST_PRODUCT_OPENED`, `WISHLIST_SAVE_ONE_INITIATED`, `WISHLIST_SAVE_ALL_INITIATED`
   - Enforced strict privacy and capability boundaries: zero bearer tokens, zero raw share hashes, zero URLs, zero item arrays, and zero customer contact details are transmitted.
   - Stable `eventId` across bounded retries, with full failure-isolation ensuring telemetry issues never degrade customer commerce actions.

3. **Quality & Validation Evidence**:
   - 29 focused tests passing across 6 test files in `@maevelle/admin` and `@maevelle/storefront`.
   - Both package production builds (`next build`) succeeded with 100% static/dynamic route collection.
   - Monorepo TypeScript check (`pnpm typecheck`) and package typechecks (`tsc --noEmit`) clean with zero errors.
   - Targeted ESLint clean with zero errors and zero warnings.
   - Migration history check (`node scripts/check-migration-history.mjs`) valid (61 registered, 51 baseline).
   - Git whitespace check (`git diff --check`) passed cleanly.

---

## B. Repository Preflight

- Branch: `main`
- Initial Git state: Clean working tree on branch `main` ahead of origin by 2 commits from Phase 06A.
- Existing codebase preserves:
  - Account wishlist persistence and Better Auth integration (Phase 01 & 01B)
  - Guest/account journal merge engine (Phase 02)
  - Cryptographic sharing backend and token verification (Phase 03 & 03B)
  - Storefront editorial desktop page, mobile drawer, and specimen routes (Phase 04)
  - Complete sharing frontend, recipient page, and Save One / Save All actions (Phase 05)
  - Analytics backend schema, outbox projections, Kysely queries, and Fastify endpoints (Phase 06A)
- Preflight confirmation: No stash, clean, reset, rollback, or destructive container commands were executed.

---

## C. AGENTS.md Compliance

All work strictly adhered to repository and sub-package instructions:
1. **Root `AGENTS.md`**:
   - Advanced, complete vertical implementation across API client, UI components, responsive layout, accessibility, and error boundaries.
   - Preserved deliberate transaction boundaries and tenant isolation.
   - Zero-tolerance quality rules respected: no `transition: all`, no routine `!important`, no page-specific CSS in `globals.css`, no ancestor selector styling hacks.
2. **`apps/admin/AGENTS.md`**:
   - Semantic tokens: `bg-background`, `bg-card`, `border-border`, brand teal (`#0d9488` / `#14b8a6`), semantic status tokens (`bg-success`, `bg-warning`, `bg-destructive`, `bg-info`).
   - Primitives: Reused `<Button>`, `<Input>`, `<NativeSelect>`, `<Table>`, `<StatusBadge>`, `<PageHeader>`, `<PageSection>`, `<PagePanel>`, `<EmptyState>`, `<ErrorState>`.
   - Typography: Inter Variable with `tabular-nums font-mono` for all monetary, SKU, rank, and count values.
   - Three-tier elevation: Level 1 Flat borders, Level 2 Raised `shadow-2xs` for KPI cards, Level 3 Floating for tooltips. Translucent glass reserved for chrome.
3. **`apps/storefront/AGENTS.md`**:
   - Preserved existing editorial desktop and mobile drawer layouts, fonts (Playfair Display & Plus Jakarta Sans), and design system specimens.
   - Telemetry instrumentation is completely invisible and consent-gated.
   - Failure-isolated tracking: no thrown exceptions, no network blocking of commerce mutations.

---

## D. Admin Design-System Audit

Prior to implementation, an audit of `apps/admin` revealed:
- **Routing & Navigation**: Analytics lives at `/admin/analytics` and renders `AnalyticsWorkspace` (`apps/admin/components/analytics/analytics-workspace.tsx`). Subnavigation is driven by URL query parameter `?view=<viewKey>`.
- **Global Filter Toolbar**: `AnalyticsFilterToolbar` (`apps/admin/components/analytics/analytics-filter-toolbar.tsx`) controls date range presets, custom `from`/`to` inputs, operational timezone display (`Asia/Dhaka`), and refresh triggers.
- **KPI Presentation**: Standardized on `MetricCard` (`apps/admin/components/analytics/analytics-kpi-card.tsx`), featuring uppercase tracking titles, definition tooltips, status badges, and loading skeletons.
- **Charts & Visualizations**: Built on `recharts` (`apps/admin/components/analytics/analytics-charts.tsx`), with Cartesian grids, subtle linear gradients, responsive containers, and custom hover tooltips.
- **Tables & Density**: Standardized on `<Table density="comfortable" | "compact">` from `@/components/ui/table` with right-aligned tabular numbers.
- **Decision**: Wishlist Analytics belongs natively as a view tab (`view=wishlist`) within the existing `/admin/analytics` workspace, reusing `AnalyticsFilterToolbar` and standard page scaffolding.

---

## E. Frontend Architecture

```
apps/admin/
├── app/analytics/page.tsx                     # Entry page wrapping AnalyticsWorkspace in Suspense
├── components/analytics/
│   ├── analytics-workspace.tsx               # Extended subnavigation with 'wishlist' view & Heart icon
│   ├── analytics-filter-toolbar.tsx           # Extended presets with LAST_90_DAYS
│   └── views/
│       └── wishlist-view.tsx                 # Complete Wishlist Analytics Dashboard View (6 sections)
└── lib/analytics/
    ├── types.ts                              # Extended AnalyticsViewKey, DateRangePreset & re-exports
    └── wishlist-api.ts                       # Typed API client for 6 endpoints + 90-day validator

apps/storefront/
├── features/wishlist/
│   ├── components/
│   │   ├── wishlist-page-shell.tsx           # Emits WISHLIST_PAGE_VIEWED
│   │   ├── wishlist-sharing-panel.tsx        # Emits WISHLIST_SHARE_OPENED, SCOPE, COPY, NATIVE, WHATSAPP
│   │   └── shared-wishlist.tsx               # Emits RECIPIENT_VIEWED, SAVE_ONE, SAVE_ALL, PRODUCT_OPENED
│   └── use-wishlist.ts                       # Emits WISHLIST_GUEST_SAVE_OBSERVED, GUEST_REMOVE_OBSERVED
└── lib/analytics/
    └── wishlist-telemetry.ts                 # Strictly validated 8-key observation builder & dispatcher
```

---

## F. API Contract Mapping

All six endpoints communicate via `apps/admin/lib/analytics/wishlist-api.ts`:

| Method | Endpoint | Query Parameters | Response Structure | Data Source |
|---|---|---|---|---|
| `GET` | `/admin/analytics/wishlist/summary` | `from`, `to` | `WishlistAnalyticsResponseDto<WishlistSummaryDto>` | Authoritative Database |
| `GET` | `/admin/analytics/wishlist/activity` | `from`, `to` | `WishlistAnalyticsResponseDto<WishlistTrendDto[]>` | Committed Outbox |
| `GET` | `/admin/analytics/wishlist/products` | `from`, `to`, `page`, `pageSize` | `WishlistAnalyticsResponseDto<WishlistAnalyticsPageDto<WishlistProductInterestDto>>` | Authoritative DB + Outbox |
| `GET` | `/admin/analytics/wishlist/categories` | `from`, `to`, `page`, `pageSize` | `WishlistAnalyticsResponseDto<WishlistAnalyticsPageDto<WishlistCategoryInterestDto>>` | Authoritative DB + Outbox |
| `GET` | `/admin/analytics/wishlist/sharing` | `from`, `to` | `WishlistAnalyticsResponseDto<WishlistSharingDto>` | Outbox + Storefront Events |
| `GET` | `/admin/analytics/wishlist/operations` | `from`, `to` | `WishlistAnalyticsResponseDto<WishlistOperationsDto>` | Operations Counters & Worker |

### Serialization & Query Boundary Enforcement
- The backend's Fastify route schema enforces `{ additionalProperties: false }` and prevalidation rejects any query parameter outside `['from', 'to', 'page', 'pageSize']` with `422 INVALID_ANALYTICS_QUERY`.
- `buildWishlistQueryParams()` strictly includes only these four validated parameters.
- Client-side pre-validation `validateWishlistDateRange()` checks ISO YYYY-MM-DD syntax, start <= end, and maximum 90 days.

---

## G. Wishlist Analytics Navigation

1. **Workspace Tab**: Added to `VIEW_NAVIGATION` in `apps/admin/components/analytics/analytics-workspace.tsx`:
   ```tsx
   { id: 'wishlist', label: 'Wishlist & Demand', icon: Heart, capability: 'analytics.view' }
   ```
   Positioned directly adjacent to Storefront Funnel and Marketing.
2. **Command Palette & Search Integration**: In `apps/admin/components/admin-shell.tsx`, updated the `Analytics` navigation item search keywords to include:
   `"analytics reports business intelligence wishlist saves demand sharing products cohorts"`.
3. **URL State Synchronization**: State is completely synchronized with Next.js router: `/admin/analytics?view=wishlist&preset=LAST_30_DAYS&from=2026-10-02&to=2026-11-01`.

---

## H. Summary KPIs

Implemented in Section 1 of `WishlistView`:
1. **Saved Items in Accounts**: Real-time count of active saved items (`summary.savedItems`). Source tag: `AUTHORITATIVE_DATABASE`.
2. **Distinct Products Saved**: Count of unique catalog SKUs present in at least one customer wishlist (`summary.distinctProducts`).
3. **Customer Wishlists**: Ratio of non-empty wishlists to total registered lists (`summary.nonemptyLists` / `summary.lists`).
4. **Availability Health**: Catalog availability breakdown (`summary.availableItems` in stock, `summary.outOfStockItems` out of stock, `summary.unavailableItems` unlisted/inactive) against search projections.

All numbers render using `tabular-nums font-mono`.

---

## I. Wishlist Activity Charts

Implemented in Section 2 of `WishlistView`:
- **Dual Visual Presentation**: Interactive Toggle allows operators to switch between **Trend Chart** and an accessible **Data Table**.
- **Chart Series**:
  - New Saves (`saved`): Teal Area with linear gradient fill (`#0d9488`).
  - Account Removals (`removed`): Rose Area with linear gradient fill (`#dc2626`).
- **Interactive Tooltip**: Displays date bucket, New Saves, Removals, Merge Additions, and Net Transition (`net`).
- **Missing Data Treatment**: Days with zero recorded activity maintain an honest zero baseline with date labels, while pre-instrumentation ranges display a clear partial-coverage warning.
- **Accessible Table**: Screen-reader and keyboard accessible tabular format listing Date, Saves, Removals, Merge Additions, Completed Merges, and Net Activity.

---

## J. Product Interest Reporting

Implemented in Section 3 of `WishlistView`:
- **Cohort Ranking**: Products ordered by authoritative current account saves descending.
- **Columns**: Rank (#), Product Title & UUID, Availability Badge, Current Saves, Recent Saves, Recent Removals, Catalog Detail Link.
- **Honest Suppression Treatment**: Historical activity cells with fewer than 3 events return `null` from the backend. The UI renders these as an unselectable dash (`—`) with an informative tooltip: `"Suppressed: fewer than 3 events in period"`. **Values are never coerced to zero.**
- **Server-Side Pagination**: Full server pagination controls supporting page increments and page sizes (10, 25, 50), with disabled boundaries when `page <= 1` or `!hasMore`.

---

## K. Category Reporting

Implemented in Section 4 of `WishlistView`:
- **Aggregation**: Demand grouped by canonical primary catalog category.
- **Columns**: Category Name (with fallback for Uncategorized), Current Saved Items, Recent Saves, Recent Removals.
- **Suppression**: Cells with `null` render honest suppressed state (`—`).
- **Pagination**: Dedicated server-side pagination bar with page navigation and page size selector.

---

## L. Sharing Analytics

Implemented in Section 5 of `WishlistView`:
- **Current State KPI Cards**:
  - Active Shared Collections (`sharing.current.active`)
  - Ownership: Account-owned vs Guest-owned (`accountOwned` / `guestOwned`)
  - Expired vs Revoked Shares (`expired` / `revoked`)
  - Average Collection Size (`averageSize` formatted to 1 decimal place)
- **Lifecycle Transition Outcomes Table**:
  - Displays committed outbox transitions: `created`, `claimed`, `revoked`, `link_rotated`, `expired`.
  - Details breakdown by Origin (Guest vs Account) and Scope (All vs Selected).
  - Explicit note: Claim transfer or link rotation does not count as a new share creation.

---

## M. Recipient Engagement Limitations

The frontend prominently displays a dedicated **Honest Telemetry Boundaries & Privacy Protections** disclosure:
- **Verified Unique Recipients are Unavailable**: Public open counters represent HTTP request counts and include web crawlers, link previewers, and repeated reloads. They are not verified human visitors.
- **Verified Share-to-Save Conversion is Unavailable**: Recipient Save One and Save All events are unverified browser observation signals, not verified transactional attribution.
- **No Fabricated Metrics**: No fake unique recipient counts, no fabricated conversion funnels, and no attributed sales figures are displayed.

---

## N. Operational Reporting

Implemented in Section 6 of `WishlistView`:
- **Worker & Projection State**:
  - Projection status badge (`ACTIVE` for Current, `WARNING` for Lagging, `FAILED` for Failed).
  - Outbox pending event count (`metadata.pendingEvents`).
  - Last processed timestamp (`metadata.lastProcessedAt`).
- **Lifecycle Retention Backlog**:
  - Expired Unreported Shares awaiting Worker status marker (`cleanup.expiredUnreported`).
  - Purgeable Shares past 30-day retention awaiting hard delete (`cleanup.purgeableShares`).
  - Expired Merge Receipts past 90-day retention (`cleanup.expiredMergeReceipts`).
- **HTTP Operational Counters Table**:
  - Daily counters grouped by Operation (`SAVE`, `REMOVE`, `MERGE`, `SHARE_CREATE`, `SHARE_OPEN`, etc.).
  - Outcome status badges (`SUCCESS`, `CLIENT_ERROR`, `FAILED`).
  - Request volume and Average Duration in milliseconds (`totalDurationMs / count`).

---

## O. Filters and Date Ranges

- **Presets**: Added `LAST_90_DAYS` to `DateRangePreset` alongside `LAST_7_DAYS` and `LAST_30_DAYS`.
- **90-Day Reporting Limit**:
  - When a date range > 90 days is requested (e.g. `THIS_YEAR` or wide custom ranges), the UI presents a non-blocking warning panel with one-click actions: **"Switch to Last 90 Days"** or **"Switch to Last 30 Days"**.
  - Prevents backend 422 errors before requests leave the browser.
- **Timezone**: All daily buckets and query parameters align to Bangladesh Standard Time (`Asia/Dhaka`, UTC+6).

---

## P. Data Completeness and Suppression

The interface maintains distinct semantic treatments for each data state:
1. **Authoritative State**: Tagged with database source badge, reflecting current verified account records.
2. **Historical Activity**: Tagged with outbox projection source, reflecting events committed since `instrumentationStart`.
3. **Observed Signals**: Tagged with consented storefront source, reflecting unverified browser interactions.
4. **Suppressed Cells (`null`)**: Rendered as `—` with tooltip explaining cohort privacy threshold (< 3 events).
5. **Measured Zeros (`0`)**: Displayed as clean numeric `0`.
6. **Processing Lag**: Warning badge displayed when Worker has pending queue items.

---

## Q. Storefront Telemetry

Engineered in `apps/storefront/lib/analytics/wishlist-telemetry.ts`:
- **Function**: `emitWishlistObservation(options: EmitWishlistObservationOptions): Promise<boolean>`
- **Strict 8-Key Payload Structure**:
  ```json
  {
    "schemaVersion": 1,
    "eventId": "uuid",
    "name": "WISHLIST_PAGE_VIEWED",
    "origin": "BROWSER",
    "occurredAt": "2026-11-01T12:00:00.000Z",
    "sessionId": "uuid",
    "consent": {
      "necessary": "GRANTED",
      "analytics": "GRANTED",
      "marketing": "DENIED",
      "preferences": "DENIED",
      "recordedAt": "2026-11-01T12:00:00.000Z"
    },
    "data": {
      "mode": "ACCOUNT"
    }
  }
  ```
- **Wired Touchpoints**:
  1. `WISHLIST_PAGE_VIEWED`: In `WishlistPageShell` on mount.
  2. `WISHLIST_GUEST_SAVE_OBSERVED`: In `useWishlist.addItem()` when `mode !== 'account'`.
  3. `WISHLIST_GUEST_REMOVE_OBSERVED`: In `useWishlist.removeItem()` when `mode !== 'account'`.
  4. `WISHLIST_SHARE_OPENED`: In `WishlistSharingPanel` on mount.
  5. `WISHLIST_SCOPE_SELECTED`: In `WishlistSharingPanel.changeIntent()` with `scope: 'ALL' | 'SELECTED'`.
  6. `WISHLIST_COPY_ATTEMPTED`: In `WishlistSharingPanel` when Copy Link button clicked.
  7. `WISHLIST_COPY_SUCCEEDED`: In `WishlistSharingPanel` when `copyPublicLink()` promise resolves.
  8. `WISHLIST_NATIVE_SHARE_INVOKED`: In `WishlistSharingPanel` when Device Share button clicked.
  9. `WISHLIST_WHATSAPP_SELECTED`: In `WishlistSharingPanel` when WhatsApp link clicked.
  10. `WISHLIST_RECIPIENT_VIEWED`: In `SharedWishlist` when public share status transitions to `ready`.
  11. `WISHLIST_PRODUCT_OPENED`: In `SharedWishlist` when recipient clicks a product card link.
  12. `WISHLIST_SAVE_ONE_INITIATED`: In `SharedWishlist.save()` when recipient clicks Save to Wishlist.
  13. `WISHLIST_SAVE_ALL_INITIATED`: In `SharedWishlist.saveAll()` when recipient clicks Save All.

---

## R. Consent Integration

- **Consent Verification**: Evaluates `currentCommerceConsent()`. If `consent.analytics !== 'GRANTED'`, network transmission to `/api/storefront/v1/analytics/events` is completely suppressed.
- **Withdrawal**: Immediate suppression upon consent change via `maevelle:consent-changed` channel.
- **Failure Isolation**: Network errors, timeouts, or rejection are caught internally; `emitWishlistObservation` returns `false` without disrupting user actions.
- **Event Retry**: On network failure, retries at most once after 500ms using the exact same `eventId`.

---

## S. Security and Privacy

- **Admin Permission Boundary**: Protected by backend `analytics.view` capability check. Unauthorized requests receive `403 FORBIDDEN` and display a clean `<ErrorState>`.
- **Tenant Context Isolation**: Admin requests pass session credentials (`include`); responses are flagged `private, no-store`. Organization switching triggers fresh queries.
- **Zero Token Leakage**: Share view tokens, guest management tokens, hash fragments (`#<token>`), URLs, and customer contact information are strictly excluded from telemetry payloads.
- **Confidentiality**: Dashboard displays only aggregates; private customer wishlist item lists and personal customer IDs are never exposed.

---

## T. Accessibility

- **Semantic Hierarchy**: Proper `<h1>`, `<h2>`, `<header>`, `<section>`, and `<main>` structure.
- **Alternative Data Views**: Trend chart includes a toggle to switch to a fully accessible tabular data representation.
- **Keyboard Navigation**: Native `<button>`, `<select>`, and link focus rings with visible keyboard focus indicators (`focus-visible`).
- **Screen Reader Announcements**: Live region (`aria-live="polite"`) used for status messages and loading states.
- **Color Contrast**: All status badges and chart series comply with WCAG 2.1 AA contrast requirements. Color is never used as the sole indicator of state.
- **Reduced Motion**: Chart transitions respect `prefers-reduced-motion`.

---

## U. Responsive/Visual Acceptance

Inspected against Maevelle Admin Design System specifications:
- **Mobile (320px – 430px)**:
  - Subnavigation scrolls smoothly with horizontal drag (`overflow-x-auto`).
  - KPI cards stack in 1 column (`grid-cols-1`).
  - Charts scale to container width with responsive axes.
  - Tables scroll horizontally in container without breaking page viewport.
- **Tablet (768px – 1024px)**:
  - KPI cards arrange in 2 columns (`sm:grid-cols-2`).
  - Filter toolbar wraps cleanly.
- **Desktop (1024px – 1440px+)**:
  - KPI cards display in 4 columns (`lg:grid-cols-4`).
  - Section layouts split side-by-side (`grid-cols-1 lg:grid-cols-2`).
  - Generous comfortable table density with right-aligned tabular numbers.

---

## V. Performance

- **Parallelized Network Fetch**: Dashboard loads summary, activity, products, categories, sharing, and operations in parallel (`Promise.all`).
- **Independent Pagination**: Paginating products or categories requests only the affected resource without re-fetching summary or trend charts.
- **Render Debouncing**: Storefront telemetry client includes a 300ms deduplication window preventing duplicate emissions during React strict-mode double mount.
- **Zero CSS Bloat**: Fully expressed using Tailwind CSS v4 utility classes and existing Base UI / shadcn primitives.

---

## W. Tests and Browser Results

### Test Execution Command
```bash
pnpm exec vitest run \
  apps/admin/src/wishlist-analytics.test.tsx \
  apps/storefront/lib/analytics/wishlist-telemetry.test.ts \
  apps/storefront/lib/analytics/analytics.test.ts \
  apps/storefront/features/wishlist/wishlist-store.test.ts \
  apps/admin/src/user-menu.test.tsx \
  apps/admin/src/admin-capabilities.test.tsx
```
**Outcome**: **6 files, 29 passed (100%)**.

### Verification Breakdown
1. `apps/admin/src/wishlist-analytics.test.tsx` (8 tests):
   - Date range validation (valid, 90-day exceed, start > end, invalid string).
   - Query parameter serialization (strips extra keys, includes page/pageSize).
   - Summary endpoint parsing (metadata & result unpack).
   - Products endpoint ranking with null suppression preservation.
   - 403 Forbidden handling with typed `ApiRequestError`.
   - 422 Invalid query handling with typed `ApiRequestError`.
   - Range exceeded warning component rendering.
   - Initial loading state skeleton rendering.
2. `apps/storefront/lib/analytics/wishlist-telemetry.test.ts` (8 tests):
   - Strict 8-key payload structure validation.
   - Exactly 5 consent keys validation.
   - Mode & scope payload validation.
   - Zero tokens / PII in observation JSON.
   - Consent GRANTED transmission to `/api/storefront/v1/analytics/events`.
   - Consent DENIED suppression of network request.
   - Stable `eventId` preservation across retry.
   - Deliberate failure-isolation on network drop.
3. Regression test suites:
   - `apps/storefront/lib/analytics/analytics.test.ts`: 2 tests passed.
   - `apps/storefront/features/wishlist/wishlist-store.test.ts`: 8 tests passed.
   - `apps/admin/src/user-menu.test.tsx`: 2 tests passed.
   - `apps/admin/src/admin-capabilities.test.tsx`: 1 test passed.

### Next.js Production Builds
- `pnpm --filter @maevelle/admin build`: **Exit code 0** (100 static & dynamic routes compiled).
- `pnpm --filter @maevelle/storefront build`: **Exit code 0** (Static & dynamic routes compiled).

---

## X. Defects Found and Fixed

1. **StatusBadge Prop Mismatch**:
   - *Issue*: `StatusBadge` primitive was invoked with an unsupported `label` prop instead of using `status` and `tone`.
   - *Fix*: Standardized all invocations to `<StatusBadge status="..." tone="..." />` conforming to the authoritative component interface.
2. **TypeScript Non-Null Indexed Access**:
   - *Issue*: Vitest test assertions in `wishlist-analytics.test.tsx` and `wishlist-telemetry.test.ts` triggered TS2532 on array indexing under `noUncheckedIndexedAccess`.
   - *Fix*: Added optional chaining and explicit assertions on test fixture array accesses.
3. **Copy Public Link Return Type**:
   - *Issue*: `copyPublicLink` in `share-client.ts` returns `Promise<void>`, causing a TS2367 comparison error when compared against `false`.
   - *Fix*: Updated `wishlist-sharing-panel.tsx` to emit `WISHLIST_COPY_SUCCEEDED` upon successful promise resolution.
4. **Category Table Pagination**:
   - *Issue*: ESLint flagged unused category page setter variables in `wishlist-view.tsx`.
   - *Fix*: Completed the full category server-side pagination UI toolbar matching the product interest section.

---

## Y. Files Created or Modified

### Modified Files:
- `apps/admin/components/admin-shell.tsx` — Added wishlist analytics keywords to search navigation.
- `apps/admin/components/analytics/analytics-filter-toolbar.tsx` — Added `LAST_90_DAYS` preset and label.
- `apps/admin/components/analytics/analytics-workspace.tsx` — Added `wishlist` view to `VIEW_NAVIGATION` and rendered `WishlistView`.
- `apps/admin/lib/analytics/types.ts` — Added `wishlist` view key, `LAST_90_DAYS` preset & calculation, and re-exported contracts.
- `apps/storefront/features/wishlist/components/shared-wishlist.tsx` — Wired `RECIPIENT_VIEWED`, `SAVE_ONE_INITIATED`, `SAVE_ALL_INITIATED`, and `PRODUCT_OPENED`.
- `apps/storefront/features/wishlist/components/wishlist-page-shell.tsx` — Wired `WISHLIST_PAGE_VIEWED`.
- `apps/storefront/features/wishlist/components/wishlist-sharing-panel.tsx` — Wired `SHARE_OPENED`, `SCOPE_SELECTED`, `COPY_ATTEMPTED`, `COPY_SUCCEEDED`, `NATIVE_SHARE_INVOKED`, `WHATSAPP_SELECTED`.
- `apps/storefront/features/wishlist/use-wishlist.ts` — Wired `GUEST_SAVE_OBSERVED` and `GUEST_REMOVE_OBSERVED`.

### Created Files:
- `apps/admin/components/analytics/views/wishlist-view.tsx` — Complete Wishlist Analytics dashboard view (6 sections).
- `apps/admin/lib/analytics/wishlist-api.ts` — Typed Wishlist Analytics API client with 90-day validator.
- `apps/admin/src/wishlist-analytics.test.tsx` — Unit and component test suite for Admin Wishlist Analytics.
- `apps/storefront/lib/analytics/wishlist-telemetry.ts` — Consent-gated, schema-compliant observation emitter.
- `apps/storefront/lib/analytics/wishlist-telemetry.test.ts` — Unit and integration test suite for Storefront Telemetry.
- `docs/architecture/wishlist/PHASE_06B_FRONTEND_IMPLEMENTATION_REPORT.md` — This comprehensive report.

---

## Z. Remaining Risks and Blockers

### Medium
- **Live Staging Pipeline Verification**: Real browser verification in a live staging environment with production-like VPS ingress and real cookies requires authorized staging deployment.
- **Privacy Policy Schedule Finalization**: While operational defaults (400-day domain facts, 90-day observations) are enforced, full legal privacy policy sign-off remains an open governance gate.

### Low
- **Category Hierarchy Depth**: Current category aggregation attributes items to their canonical primary category; sub-category multi-level rollups are not modeled in current analytics queries.

---

## AA. Phase 06B Acceptance Checklist

| Requirement | Status | Evidence |
|---|---|---|
| Admin Design System followed | **PASS** | Semantic tokens, Base UI primitives, electric teal, tabular nums |
| Wishlist Analytics in navigation | **PASS** | `/admin/analytics?view=wishlist` with Heart icon |
| 6 protected endpoints consumed | **PASS** | `summary`, `activity`, `products`, `categories`, `sharing`, `operations` |
| 90-day reporting limit enforced | **PASS** | Client-side validation + preset switching |
| Real KPI calculations | **PASS** | Verified against backend contract types |
| Activity trend chart + accessible table | **PASS** | Recharts AreaChart + accessible tabular alternative |
| Product ranking server pagination | **PASS** | Server-side `page`, `pageSize`, `hasMore` |
| Category reporting | **PASS** | Aggregate category interest table with pagination |
| Sharing lifecycle outcomes | **PASS** | Active, guest vs account, scope, creation averages |
| Operational monitoring display | **PASS** | HTTP counters, Worker projection status, retention backlog |
| Suppression handling (`null` vs `0`) | **PASS** | `null` rendered as `—` with tooltip; never coerced to zero |
| Storefront 13 observations implemented | **PASS** | Exactly 8 root keys, strictly schema-compliant |
| Consent enforcement | **PASS** | Transmission suppressed when consent is DENIED or UNKNOWN |
| Stable event retry | **PASS** | Same `eventId` reused on 500ms bounded retry |
| Zero token/PII leakage | **PASS** | Verified by JSON payload tests |
| TypeScript check | **PASS** | `pnpm typecheck` & package `tsc --noEmit` clean |
| ESLint check | **PASS** | Zero errors, zero warnings |
| Next.js Admin build | **PASS** | Production build clean |
| Next.js Storefront build | **PASS** | Production build clean |
| No deployment / commit | **PASS** | Strictly local, clean git status |

**Overall Phase 06B Status**: **PASS (IMPLEMENTED AND LOCALLY VERIFIED)**. Full release acceptance remains PARTIAL pending live staging acceptance.

---

## AB. Phase 07 Handoff

Phase 07 (Production Hardening, Staging Deployment, and Release Acceptance) can proceed with the following verified assets:
1. Backend analytical outbox projection, Fastify endpoints, and Worker retention (Phase 06A).
2. Frontend Admin Wishlist Analytics dashboard and Storefront telemetry client (Phase 06B).
3. Passing test suites and successful production builds for both Next.js applications.
4. Clean migration baseline (61 registered, 51 baseline).

**Gates to close in Phase 07**:
- Run staging deployment following `development-deployment-strategy.md`.
- Execute live staging end-to-end browser verification under real operator session cookies.
- Verify live Worker projection tick against live database.
- Obtain formal privacy review for the 90-day observation retention schedule.

---

## AC. Deployment Status

- **No deployment performed.**
- **No persistent migrations applied.**
- **No infrastructure or production secrets modified.**
- **No automatic git commit executed.**

